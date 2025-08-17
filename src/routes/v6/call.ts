import { Router } from "express";
import { z } from "zod";
import {
  createSupportAssistant,
  getCallDetails,
  makeOutboundCall,
  scheduleOutboundCall,
  updateScriptforAssistant,
  vapi,
  makeOutboundNudgeCall,
} from "../../utils/vapi";
import { authenticate } from "../../middleware/firebase-auth";
import {
  DefaultAssistant,
  CallDetails,
  User,
  Job,
  ScheduledCalls,
  WebhookSubscription,
  Interview,
} from "../../utils/db";
import { openai } from "../../utils/openai";
import { NudgeCallPrompt, VapiAnalysisPrompt } from "../../utils/prompts";
import { insertErrorSection } from "../../utils/helper-functions";
import { vapiWebhookVerification } from "../../utils/vapi-webhook-verification";
import type { Request, Response } from "express";
import { sendWebSocketMessage } from "../../index";
import mongoose from "mongoose";
import { assumedCallDuration, nudgeAssistantId } from "../../utils/consts";
import { copyVideofromVapiToRemotestarVideoS3Bucket } from "../../utils/s3";


function processPhoneNumber(phoneNumber: string) {
  // Trim spaces from sides and remove any - or em dashes in between
  const number = phoneNumber
    .trim()
    .replace(/[  -]/g, "")
    .replace("(", "")
    .replace(")", "");
  // Check for country code (starts with '+', followed by 8 to 15 digits, E.164 standard)
  if (!/^\+\d{8,15}$/.test(number)) {
    throw new Error(
      "Phone number must include a country code and be between 8 and 15 digits (e.g., +123456789)"
    );
  }
  return number;
}

// Helper to find the next available X-minute slot with <5 concurrent calls
async function findNextAvailableSlot(start = new Date()) {
  let slot = new Date(start);
  while (true) {
    const concurrent = await ScheduledCalls.countDocuments({
      startTime: {
        $lt: new Date(slot.getTime() + assumedCallDuration * 60 * 1000),
      },
      endTime: { $gt: slot },
    });
    if (concurrent < 5) return slot;
    slot = new Date(slot.getTime() + 10 * 60 * 1000);
  }
}

const callSchema = z.object({
  phoneNumber: z.string().min(1),
  firstMessage: z.string().min(1),
  systemPrompt: z.string().min(1),
  jobId: z.string().min(1),
  jobName: z.string().min(1).optional(),
  companyName: z.string().min(1),
  candidateId: z.string().min(1),
  type: z.enum(["outbound", "scheduled"]),
  date: z.string().min(1).optional(),
  time: z.string().min(1).optional(),
});

const webhookSubscriptionSchema = z.object({
  webhook_url: z.string().url(),
  events: z
    .array(z.enum(["call.status.changed", "call.completed", "call.failed"]))
    .optional(),
});
export const callRouter = Router();

callRouter.get( "/:jobId/:candidateId",
  authenticate,
  async (req: any, res: any) => {
    console.log("GET /call/:jobId/:candidateId route hit");
    const { jobId, candidateId } = req.params;
    const userId = req.user.firebase_id;
    const organisationId = req.user.organisation;
    const assistant = await DefaultAssistant.findOne({
      organisation_id: organisationId,
      jobId,
    });
    const previousCalls = await CallDetails.find({
      jobId,
      candidateId,
      organisation_id: organisationId,
    });


    let callDetails: any[] = [];
    try {
      callDetails = await Promise.all(
        previousCalls.map(async (call: any) => {
          console.log("call", call);
          if(call.type === "email") {
            return call;
          }
          const callDetails = await getCallDetails(call.callId);
          return callDetails;
        })
      );
    } catch (error) {
      console.error("Error getting call details:", error);
      callDetails = [];
    }

    if (previousCalls.length > 0) {
      res.json({
        success: true,
        assistant: assistant,
        callDetails: callDetails,
      });
      return;
    }
    if (!assistant) {
      console.log("No default assistant found");
      res.json({
        success: false,
        message: "No default assistant found",
        callDetails: callDetails,
      });
      return;
    }
    res.json({
      success: true,
      assistant: assistant,
    });
  }
);

callRouter.post("/", authenticate, async (req: any, res: any) => {
  try {
    const userId = req.user.firebase_id;
    const organisationId = req.user.organisation;
    const recruiterEmail = req.user.email;
    const parsedBody = callSchema.parse(req.body);
    const {
      phoneNumber,
      firstMessage,
      systemPrompt,
      jobId,
      candidateId,
      type,
      date,
      time,
      jobName,
      companyName,
    } = parsedBody;
    const processedPhoneNumber = processPhoneNumber(phoneNumber);
    const existingAssistant = await DefaultAssistant.findOne({
      jobId,
      organisation_id: organisationId,
    });

    let assistantId: string;
    if (existingAssistant) {
      if (
        existingAssistant.systemPrompt === systemPrompt &&
        existingAssistant.firstMessage === firstMessage
      ) {
        assistantId = existingAssistant.assistantId;
      } else {
        const assistant = await updateScriptforAssistant(
          existingAssistant.assistantId,
          firstMessage,
          systemPrompt
        );
        assistantId = assistant.id;
        await DefaultAssistant.updateOne(
          { _id: existingAssistant._id },
          {
            $set: {
              assistantId: assistant.id,
              firstMessage: firstMessage,
              systemPrompt: systemPrompt,
            },
          }
        );
      }
    } else {
      const analysisPrompt = VapiAnalysisPrompt();
      const assistantName = `${jobName}-${companyName}`.substring(0, 30);
      const assistant = await createSupportAssistant(
        systemPrompt,
        firstMessage,
        analysisPrompt,
        assistantName
      );
      assistantId = assistant.id;
      await DefaultAssistant.updateOne(
        { jobId, organisation_id: organisationId },
        {
          $set: {
            firstMessage,
            systemPrompt,
            assistantId,
          },
        },
        { upsert: true }
      );
    }
    if (type === "outbound") {
      const onGoingCalls = await CallDetails.find({
        jobId,
        candidateId,
        organisation_id: organisationId,
        status: "in-progress",
      });
      if (onGoingCalls.length >= 5) {
        res.json({
          success: false,
          message: "Max concurrent calls reached",
        });
        return;
      }

      const call = await makeOutboundCall(
        assistantId,
        processedPhoneNumber,
        process.env.VAPI_PHONE_NUMBER_ID!,
        candidateId
      );
      console.log(call);
      // @ts-ignore
      const callId = call.id;

      await CallDetails.create({
        jobId,
        candidateId,
        organisation_id: organisationId,
        assistantId,
        callId: callId,
        callDetails: call,
        recruiterEmail,
      });

      res.json({
        success: true,
        assistantId: assistantId,
        callId: callId,
        callDetails: call,
      });
    }
    if (type === "scheduled") {
      if (!date || !time) {
        throw new Error("Date and time are required for scheduled calls");
      }
      const startTime = new Date(`${date}T${time}`);
      const endTime = new Date(startTime.getTime() + 10 * 60 * 1000);
      // const concurrentCalls = await ScheduledCalls.countDocuments({
      //     startTime: { $lt: endTime },
      //     endTime: { $gt: startTime }
      // });
      // if (concurrentCalls >= 5) {
      //     const nextAvailable = await findNextAvailableSlot(startTime);
      //     return res.status(409).json({
      //         success: false,
      //         message: "Max concurrent calls reached",
      //         nextAvailableSlot: nextAvailable
      //     });
      // }
      console.log(recruiterEmail);
      const scheduledCall = await ScheduledCalls.create({
        startTime,
        endTime,
        data: {
          jobId,
          candidateId,
          assistantId,
          phoneNumber: processedPhoneNumber,
          organisation_id: organisationId,
          recruiterEmail: recruiterEmail,
        },
        isCalled: false,
      });

      res.json({ success: true, scheduledTime: startTime });
    }
  } catch (error) {
    console.error("Error in call route:", error);
    res.status(500).json({
      success: false,
      // @ts-ignore
      error: error.message,
    });
  }
});

callRouter.get( "/schedule/:jobId/:candidateId",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      // Check if VAPI_API_KEY is set
      if (!process.env.VAPI_API_KEY) {
        console.error("VAPI_API_KEY environment variable is not set");
        res.status(500).json({
          success: false,
          error: "VAPI API key not configured",
        });
        return;
      }

      const { jobId, candidateId } = req.params;
      const possibleOnGoingCalls = await CallDetails.find({
        jobId,
        candidateId,
      });
      const onGoingCallsPartTwo = await ScheduledCalls.find({
        isCalled: false,
        "data.jobId": jobId,
        "data.candidateId": candidateId,
      });
      console.log(onGoingCallsPartTwo);

      console.log(
        `Found ${possibleOnGoingCalls.length} possible ongoing calls for jobId: ${jobId}, candidateId: ${candidateId}`
      );
      console.log(
        `Found ${onGoingCallsPartTwo.length} scheduled calls for jobId: ${jobId}, candidateId: ${candidateId}`
      );

      // Fetch call details from Vapi for all calls and filter for ongoing ones
      const onGoingCallsOne = await Promise.all(
        possibleOnGoingCalls.map(async (call: any) => {
          try {
            const callDetails = await vapi.calls.get(call.callId);
            return callDetails;
          } catch (error) {
            return null;
          }
        })
      );

      // Filter out null values and only include ongoing calls (status === 'in-progress')
      const ongoingCalls = onGoingCallsOne
        .filter((call) => call && call.status === "in-progress")
        .map((call) => {
          if (!call) return null;
          // Find the corresponding CallDetails record to get recruiterEmail
          const callDetail = possibleOnGoingCalls.find(
            (cd) => cd.callId === call.id
          );
          return {
            callId: call.id,
            scheduledBy: callDetail?.recruiterEmail || "Unknown",
          };
        })
        .filter((call) => call !== null);

      // Format scheduled calls
      const formattedScheduledCalls = onGoingCallsPartTwo.map((call) => ({
        callId: call._id.toString(),
        scheduledBy: (call.data as any)?.recruiterEmail || "Unknown",
        startTime: call.startTime,
        endTime: call.endTime,
        phoneNumber: (call.data as any)?.phoneNumber || "Unknown",
      }));

      res.json({
        success: true,
        ongoingCalls: ongoingCalls,
        scheduledCalls: formattedScheduledCalls,
      });
    } catch (error) {
      console.error("Error in schedule route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch call details",
      });
    }
  }
);

callRouter.delete( "/scheduled/:id",
  authenticate,
  async (req: any, res: any) => {
    const { id } = req.params;

    try {
      const result = await ScheduledCalls.findByIdAndDelete(id);
      if (!result) {
        res
          .status(404)
          .json({ success: false, message: "Scheduled call not found" });
        return;
      }
      res.json({ success: true });
      return;
    } catch (error) {
      console.error("Error deleting scheduled call:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to delete scheduled call" });
      return;
    }
  }
);

// Handle CORS preflight for VAPI webhook
callRouter.options("/webhook", (req: any, res: any) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Vapi-Signature, X-Vapi-Timestamp"
  );
  res.status(200).send();
});

// VAPI webhook endpoint - no authentication required as VAPI will call this
callRouter.post( "/webhook",
//  vapiWebhookVerification(process.env.VAPI_WEBHOOK_SECRET || "default-secret"),
  async (req: any, res: any) => {
    if (req.body.message?.type === "status-update") {
      console.log("VAPI Webhook received:");
      console.log(req.body);

      // Set CORS headers for VAPI
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Vapi-Signature, X-Vapi-Timestamp"
      );

      // Log VAPI headers for debugging
      try {
        // Validate message structure
        if (!req.body.message) {
          console.error("Missing message in webhook payload");
          return res
            .status(400)
            .json({ success: false, error: "Missing message" });
        }

        // VAPI sends different payload structures based on event type
        const {
          status, // Call status
          type, // Event type
          call, // Call object
          assistant, // Assistant object
          customer, // Customer object
          endedReason, // Reason call ended
          ...otherData
        } = req.body.message;

        const callId = call?.id;
        const candidateId = call?.name;
        const assistantId = assistant?.id;
        const customerNumber = customer?.number;

        console.log(
          `Processing webhook - Call ID: ${callId}, Status: ${status}, Type: ${type}`
        );

        if (!callId) {
          console.error("Missing callId in webhook payload");
          return res
            .status(400)
            .json({ success: false, error: "Missing callId" });
        }

        // Find the call details in our database
        const callDetails = await CallDetails.findOne({ callId });
        const scheduledCall = await ScheduledCalls.findOne({ callId });

        if (!callDetails) {
          console.error(`Call details not found for callId: ${callId}`);
          // Don't return 404 for VAPI - just log and continue
          console.log(
            "This might be a new call or call not yet stored in our DB"
          );
        }

        // Update call details if found, otherwise create new entry
        if (callDetails) {
          await CallDetails.updateOne(
            { callId },
            {
              $set: {
                "callDetails.status": status,
                "callDetails.lastUpdated": new Date(),
                "callDetails.vapiData": req.body.message, // Store full VAPI response
              },
            }
          );

          if (scheduledCall) {
            await ScheduledCalls.updateOne(
              { callId },
              { $set: { status: status } }
            );
          }

                                // Send WebSocket notification to the recruiter
           sendWebSocketMessage(candidateId, {
             event: "call.status.changed",
             callId: callId,
             status: status,
             data: {
               type,
               assistantId,
               customerNumber,
               endedReason,
               ...otherData
             }
           });

        } else {
          // If call not found in DB, still log the webhook
          console.log(
            `Received webhook for call ${callId} with status ${status} but not found in our database`
          );
        }

        console.log(`Call ${callId} status updated to: ${status}`);

        // Always return success to VAPI
        res.json({ success: true });
      } catch (error) {
        console.error("Error processing VAPI webhook:", error);
        // Always return success to VAPI even on error to prevent retries
        res.json({ success: true });
      }
    } else if (req.body.message?.type === "conversation-update") {
      console.log("VAPI Webhook received:");
      console.log(req.body);

      // Set CORS headers for VAPI
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Vapi-Signature, X-Vapi-Timestamp"
      );

      try {
        // Validate message structure
        if (!req.body.message) {
          console.error("Missing message in webhook payload");
          return res
            .status(400)
            .json({ success: false, error: "Missing message" });
        }

        // Extract conversation data from VAPI payload
        const {
          conversation, // Conversation messages
          messages, // Raw messages
          messagesOpenAIFormatted, // OpenAI formatted messages
          artifact, // Artifact data
          call, // Call object
          assistant, // Assistant object
          customer, // Customer object
          ...otherData
        } = req.body.message;

        const callId = call?.id;
        const candidateId = call?.name;

        console.log(
          `Processing conversation update - Call ID: ${callId}, Messages count: ${messages?.length || 0}`
        );

        if (!callId) {
          console.error("Missing callId in conversation webhook payload");
          return res
            .status(400)
            .json({ success: false, error: "Missing callId" });
        }

        // Send WebSocket notification to the frontend
        sendWebSocketMessage(candidateId, {
          event: "call.conversation.update",
          callId: callId,
          status: "conversation-update", // Required field for CallEventMessage
          data: {
            conversation,
            messages,
            messagesOpenAIFormatted,
            artifact,
            assistantId: assistant?.id,
            customerNumber: customer?.number,
            ...otherData
          }
        });

        console.log(`Conversation update sent for call ${callId}`);

        // Always return success to VAPI
        res.json({ success: true });
      } catch (error) {
        console.error("Error processing VAPI conversation webhook:", error);
        // Always return success to VAPI even on error to prevent retries
        res.json({ success: true });
      }
    } else if (req.body.message?.type === "end-of-call-report" && req.body.message.call.type === "webCall") {
      try {
        console.log("[Webhook] end-of-call-report received \n", req.body);
        const callId = req.body?.message?.call?.id;
        const candidateId = req.body?.message?.call?.name;
        const videoUrl = req.body?.message?.artifact?.videoRecordingUrl;
        console.log(`[Webhook] callId=${callId}, candidateId=${candidateId}, videoUrl=${videoUrl ? "present" : "missing"}`);

        if (!callId) {
          console.error("[Webhook] Missing callId in end-of-call-report payload");
          res.status(200).json({ success: false, error: "Missing callId" });
          return;
        }

        const callDetails = await CallDetails.findOne({ callId });
        if (!callDetails) {
          console.error("[Webhook] Call details not found for callId:", callId);
          res.status(200).json({ success: false, error: "Call details not found" });
          return;
        }

        if (!videoUrl) {
          console.error("[Webhook] Missing videoUrl in end-of-call-report payload for callId:", callId);
          res.status(200).json({ success: false, error: "Missing videoUrl" });
          return;
        }

        console.log(`[Webhook] Uploading call recording to S3 for callId=${callId}`);
        const uploadedUrl = await copyVideofromVapiToRemotestarVideoS3Bucket(videoUrl, callDetails.callId);
        console.log(`[Webhook] Uploaded recording to S3 at: ${uploadedUrl}`);

        const videolink = `${process.env.URL}/video/${callDetails.callId}`;
        await CallDetails.updateOne(
          { callId: callDetails.callId },
          { $set: { videoUrl: videolink } }
        );
        console.log(`[Webhook] Saved video link on CallDetails: ${videolink}`);

        res.status(200).json({ success: true });
      } catch (err: any) {
        console.error("[Webhook] Error handling end-of-call-report:", err?.message || err);
        // Always respond 200 to avoid VAPI retries
        res.status(200).json({ success: true });
      }
    }
     else {
      console.log("VAPI Webhook received:", req.body);
      res.status(200).json({ success: true });
    }
  }
);

callRouter.post("/nudge", authenticate, async (req: any, res: any) => {
  const nudgeSchema = z.object({
    phoneNumber: z.string().min(1),
    candidateId: z.string().min(1),
    jobId: z.string().min(1),
    roleName: z.string().min(1),
  });

  const { phoneNumber, candidateId, jobId, roleName } = nudgeSchema.parse(req.body);
  const finalPhoneNumber = processPhoneNumber(phoneNumber);
  const nudgePrompt = NudgeCallPrompt(roleName);
  const call = await makeOutboundNudgeCall(nudgeAssistantId, finalPhoneNumber, process.env.VAPI_PHONE_NUMBER_ID || "", candidateId, nudgePrompt);
  await CallDetails.create({
    jobId: jobId,
    candidateId: candidateId,
    organisation_id: req.user.organisation,
    assistantId: nudgeAssistantId,
    // @ts-ignore
    callId: call.id,
    callDetails: call,
    recruiterEmail: req.user.email,
    type: "nudge",
  });
  res.json({ success: true, call });
});

let isCronRunning = false;
// Cron job to execute due scheduled calls every minute
setInterval(async () => {
  if (isCronRunning) {
    console.log("Cron is already running, skipping this interval");
    return;
  }
  isCronRunning = true;
  const now = new Date();
  try {
    while (true) {
      // Check how many calls are currently running (isCalled: true, endTime > now, callId exists)
      const runningCalls = await ScheduledCalls.countDocuments({
        isCalled: true,
        status: "in-progress",
      });
      if (runningCalls >= 5) {
        // Limit reached, stop processing more calls this interval
        break;
      }
      // Atomically find and lock the oldest due call (isCalled: false)
      const call = await ScheduledCalls.findOneAndUpdate(
        {
          startTime: { $lte: now },
          isCalled: false,
        },
        { $set: { isCalled: true } },
        { new: true, sort: { startTime: 1 } }
      );
      if (!call) break; // No more due calls to process
      if (
        !call.data ||
        !call.data.assistantId ||
        !call.data.phoneNumber ||
        !call.data.jobId ||
        !call.data.candidateId
      ) {
        console.error("Scheduled call missing required data:", call);
        continue;
      }
      try {
        const result = await makeOutboundCall(
          call.data.assistantId,
          call.data.phoneNumber,
          process.env.VAPI_PHONE_NUMBER_ID || "",
          call.data.candidateId
        );
        // Type guard for result.id
        let callId = "";
        if (
          result &&
          typeof result === "object" &&
          "id" in result &&
          typeof result.id === "string"
        ) {
          callId = result.id;
        }
        await CallDetails.create({
          jobId: call.data.jobId,
          candidateId: call.data.candidateId,
          organisation_id: call.data.organisation_id,
          assistantId: call.data.assistantId,
          callId: callId,
          callDetails: result,
          recruiterEmail: call.data.recruiterEmail,
        });
        await ScheduledCalls.updateOne({ _id: call._id }, { callId: callId });



      } catch (err) {
        console.error("Error executing scheduled call:", err);
      }
    }
  } catch (err) {
    console.error("Error in scheduled call cron:", err);
  } finally {
    isCronRunning = false;
  }
}, 60 * 1000); // Every minute