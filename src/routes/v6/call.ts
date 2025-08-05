import { Router } from "express";
import { z } from "zod";
import {
  createSupportAssistant,
  getCallDetails,
  makeOutboundCall,
  scheduleOutboundCall,
  updateScriptforAssistant,
  vapi,
} from "../../utils/vapi";
import { authenticate } from "../../middleware/firebase-auth";
import {
  DefaultAssistant,
  CallDetails,
  User,
  Job,
  ScheduledCalls,
  WebhookSubscription,
} from "../../utils/db";
import { openai } from "../../utils/openai";
import { VapiAnalysisPrompt } from "../../utils/prompts";
import { insertErrorSection } from "../../utils/helper-functions";
import { vapiWebhookVerification } from "../../utils/vapi-webhook-verification";
import type { Request, Response } from "express";
import { sendWebSocketMessage } from "../../index";
import mongoose from "mongoose";

const chatgptModel = "gpt-3.5-turbo";
const assumedCallDuration = 10;

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

callRouter.get(
  "/:jobId/:candidateId",
  authenticate,
  async (req: any, res: any) => {
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
    if (!assistant) {
      res.json({
        success: false,
        message: "No default assistant found",
      });
      return;
    }

    let callDetails: any[] = [];
    try {
      callDetails = await Promise.all(
        previousCalls.map(async (call: any) => {
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

callRouter.get(
  "/schedule/:jobId/:candidateId",
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

callRouter.delete(
  "/scheduled/:id",
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
callRouter.post(
  "/webhook",
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
    } else {
      console.log("VAPI Webhook received:", req.body);
      res.status(200).json({ success: true });
    }
  }
);

// // Webhook subscription management endpoints
// callRouter.post('/webhook/subscribe', authenticate, async (req: any, res: any) => {
//     try {
//         const userId = req.user.firebase_id;
//         const organisationId = req.user.organisation;
//         const parsedBody = webhookSubscriptionSchema.parse(req.body);

//         const { webhook_url, events = ['call.status.changed', 'call.completed', 'call.failed'] } = parsedBody;

//         // Check if subscription already exists for this organisation and URL
//         const existingSubscription = await WebhookSubscription.findOne({
//             organisation_id: organisationId,
//             webhook_url
//         });

//         if (existingSubscription) {
//             // Update existing subscription
//             await WebhookSubscription.updateOne(
//                 { _id: existingSubscription._id },
//                 {
//                     events,
//                     is_active: true,
//                     delivery_failures: 0
//                 }
//             );

//             return res.json({
//                 success: true,
//                 message: 'Webhook subscription updated',
//                 subscription_id: existingSubscription._id,
//                 secret_key: existingSubscription.secret_key
//             });
//         }

//         // Create new subscription
//         const secretKey = generateWebhookSecret();
//         const subscription = await WebhookSubscription.create({
//             organisation_id: organisationId,
//             webhook_url,
//             events,
//             secret_key: secretKey,
//             is_active: true
//         });

//         res.json({
//             success: true,
//             message: 'Webhook subscription created',
//             subscription_id: subscription._id,
//             secret_key: secretKey
//         });
//     } catch (error) {
//         console.error('Error creating webhook subscription:', error);
//         res.status(500).json({
//             success: false,
//             error: error instanceof Error ? error.message : 'Internal server error'
//         });
//     }
// });

// callRouter.get('/webhook/subscriptions', authenticate, async (req: any, res: any) => {
//     try {
//         const organisationId = req.user.organisation;

//         const subscriptions = await WebhookSubscription.find({
//             organisation_id: organisationId
//         }).select('-secret_key'); // Don't return secret keys

//         res.json({
//             success: true,
//             subscriptions: subscriptions.map(sub => ({
//                 id: sub._id,
//                 webhook_url: sub.webhook_url,
//                 events: sub.events,
//                 is_active: sub.is_active,
//                 last_delivery_attempt: sub.last_delivery_attempt,
//                 delivery_failures: sub.delivery_failures,
//                 created_at: sub.createdAt,
//                 updated_at: sub.updatedAt
//             }))
//         });
//     } catch (error) {
//         console.error('Error fetching webhook subscriptions:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Internal server error'
//         });
//     }
// });

// callRouter.delete('/webhook/subscribe/:id', authenticate, async (req: any, res: any) => {
//     try {
//         const { id } = req.params;
//         const organisationId = req.user.organisation;

//         const result = await WebhookSubscription.findOneAndDelete({
//             _id: id,
//             organisation_id: organisationId
//         });

//         if (!result) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Webhook subscription not found'
//             });
//         }

//         res.json({
//             success: true,
//             message: 'Webhook subscription deleted'
//         });
//     } catch (error) {
//         console.error('Error deleting webhook subscription:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Internal server error'
//         });
//     }
// });

// callRouter.patch('/webhook/subscribe/:id', authenticate, async (req: any, res: any) => {
//     try {
//         const { id } = req.params;
//         const organisationId = req.user.organisation;
//         const { is_active, events } = req.body;

//         const updateData: any = {};
//         if (typeof is_active === 'boolean') updateData.is_active = is_active;
//         if (Array.isArray(events)) updateData.events = events;

//         const result = await WebhookSubscription.findOneAndUpdate(
//             {
//                 _id: id,
//                 organisation_id: organisationId
//             },
//             { $set: updateData },
//             { new: true }
//         ).select('-secret_key');

//         if (!result) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Webhook subscription not found'
//             });
//         }

//         res.json({
//             success: true,
//             message: 'Webhook subscription updated',
//             subscription: result
//         });
//     } catch (error) {
//         console.error('Error updating webhook subscription:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Internal server error'
//         });
//     }
// });

// // Test webhook endpoint for development/testing
// callRouter.post('/webhook/test', authenticate, async (req: any, res: any) => {
//     try {
//         const organisationId = req.user.organisation;
//         const { webhook_url, event_type = 'call.status.changed' } = req.body;

//         if (!webhook_url) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'webhook_url is required'
//             });
//         }

//         // Create a test payload
//         const testPayload = {
//             event: event_type as 'call.status.changed' | 'call.completed' | 'call.failed',
//             callId: 'test_call_123',
//             jobId: 'test_job_456',
//             candidateId: 'test_candidate_789',
//             organisation_id: organisationId,
//             recruiterEmail: req.user.email,
//             status: 'test',
//             timestamp: new Date().toISOString(),
//             data: {
//                 type: 'test',
//                 message: 'This is a test webhook notification'
//             }
//         };

//         // Send test webhook
//         const success = await sendWebhookNotification(
//             webhook_url,
//             testPayload,
//             'test_secret_key'
//         );

//         if (success) {
//             res.json({
//                 success: true,
//                 message: 'Test webhook sent successfully',
//                 payload: testPayload
//             });
//         } else {
//             res.status(500).json({
//                 success: false,
//                 error: 'Failed to send test webhook'
//             });
//         }
//     } catch (error) {
//         console.error('Error sending test webhook:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Internal server error'
//         });
//     }
// });

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