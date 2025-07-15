import { Router } from "express";
import { z } from "zod";
import { createSupportAssistant, getCallDetails, makeOutboundCall, scheduleOutboundCall } from "../../utils/vapi";
import { authenticate } from "../../middleware/firebase-auth";
import { DefaultAssistant, CallDetails, User, Job, ScheduledCalls } from "../../utils/db";
import { openai } from "../../utils/openai";
import { VapiSystemPrompt2 as VapiSystemPrompt } from "../../utils/prompts";

const chatgptModel = "gpt-3.5-turbo";
const assumedCallDuration = 10;

function processPhoneNumber(phoneNumber: string) {
    // Trim spaces from sides and remove any - or em dashes in between
    const number = phoneNumber.trim().replace(/[  -]/g, '').replace('(', '').replace(')', '');
    // Check for country code (starts with '+', followed by 8 to 15 digits, E.164 standard)
    if (!/^\+\d{8,15}$/.test(number)) {
        throw new Error('Phone number must include a country code and be between 8 and 15 digits (e.g., +123456789)');
    }
    return number;
}

// Helper to find the next available X-minute slot with <5 concurrent calls
async function findNextAvailableSlot(start = new Date()) {
    let slot = new Date(start);
    while (true) {
        const concurrent = await ScheduledCalls.countDocuments({
            startTime: { $lt: new Date(slot.getTime() + assumedCallDuration * 60 * 1000) },
            endTime: { $gt: slot }
        });
        if (concurrent < 5) return slot;
        slot = new Date(slot.getTime() + 10 * 60 * 1000);
    }
}

const callSchema = z.object({
    phoneNumber: z.string().min(1),
   // assistantId: z.string().min(1),
   firstMessage: z.string().min(1),
   systemPrompt: z.string().min(1),
   jobId: z.string().min(1),
   candidateId: z.string().min(1),
   type: z.enum(["outbound", "scheduled"]),
   date: z.string().min(1).optional(),
   time: z.string().min(1).optional()
});
export const callRouter = Router();

callRouter.get('/:jobId/:candidateId',authenticate, async (req:any, res:any) => {
    const {jobId, candidateId} = req.params;
    const userId = req.user.firebase_id;
    const organisationId = req.user.organisation;
    const assistant = await DefaultAssistant.findOne({
        userId,
        organisation_id: organisationId,
        jobId,
        candidateId
    });
    const previousCalls = await CallDetails.find({
        jobId,
        candidateId,
        organisation_id: organisationId
    });
    if(!assistant){
        res.json({
            success: false,
            message: "No default assistant found"
        });
        return;
    }

    const callDetails = await Promise.all(previousCalls.map(async (call:any) => {
        const callDetails = await getCallDetails(call.callId);
        return callDetails;
    }));

    if(previousCalls.length > 0){
        res.json({
            success: true,
            assistant: assistant,
            callDetails: callDetails
        });
        return;
    }
    res.json({
        success: true,
        assistant: assistant
    });
});

callRouter.post('/',authenticate, async (req:any, res:any) => {
    try {
        const userId = req.user.firebase_id;
        const organisationId = req.user.organisation;
        const parsedBody = callSchema.parse(req.body);
        const { phoneNumber, firstMessage, systemPrompt, jobId, candidateId, type, date, time } = parsedBody;
        const processedPhoneNumber = processPhoneNumber(phoneNumber);
        const existingAssistant = await DefaultAssistant.findOne({
            userId,
            jobId,
            candidateId,
            organisation_id: organisationId
        });

        let assistantId: string;
        if (existingAssistant && existingAssistant.systemPrompt === systemPrompt && existingAssistant.firstMessage === firstMessage) {
            assistantId = existingAssistant.assistantId;
        } else {
            const assistant = await createSupportAssistant(systemPrompt, firstMessage);
            assistantId = assistant.id;
            await DefaultAssistant.updateOne(
                { userId, jobId, candidateId, organisation_id: organisationId },
                {
                    $set: {
                        firstMessage,
                        systemPrompt,
                        assistantId
                    }
                },
                { upsert: true }
            );
        }
        if(type === "outbound"){
            const call = await makeOutboundCall(assistantId, processedPhoneNumber, process.env.VAPI_PHONE_NUMBER_ID!);
            console.log(call);
            await CallDetails.create({
                jobId,
                candidateId,
                organisation_id: organisationId,
                assistantId,
                // @ts-ignore
                callId: call.id,
                callDetails: call
            });
            res.json({
                success: true,
                assistantId: assistantId,
                // @ts-ignore
                callId: call.id
            });
        }
        if(type === "scheduled"){
            if (!date || !time) {
                throw new Error('Date and time are required for scheduled calls');
            }
            const startTime = new Date(`${date}T${time}`);
            const endTime = new Date(startTime.getTime() + 10 * 60 * 1000);
            const concurrentCalls = await ScheduledCalls.countDocuments({
                startTime: { $lt: endTime },
                endTime: { $gt: startTime }
            });
            if (concurrentCalls >= 5) {
                const nextAvailable = await findNextAvailableSlot(startTime);
                return res.status(409).json({
                    success: false,
                    message: "Max concurrent calls reached",
                    nextAvailableSlot: nextAvailable
                });
            }
            await ScheduledCalls.create({
                startTime,
                endTime,
                data: {
                    jobId,
                    candidateId,
                    assistantId,
                    phoneNumber: processedPhoneNumber
                },
                isCalled: false
            });
            res.json({ success: true, scheduledTime: startTime });
        }
    } catch (error) {
        console.error('Error in call route:', error);
        res.status(500).json({ 
            success: false, 
            // @ts-ignore
            error: error.message 
        });
    }
});

callRouter.get('/system-prompt/:jobId/:candidateId', authenticate, async (req: any, res: any) => {
    try {
        const { jobId, candidateId } = req.params;

        try {
            const user = await User.findById(candidateId);
            const job = await Job.findById(jobId);

            if (!job || !user) {
                return res.status(404).json({
                    success: false,
                    message: "Job or user not found"
                });
            }

            const firstMessageAndSystemPromptPrompt = VapiSystemPrompt(
                JSON.stringify(job.description),
                JSON.stringify(user),
                req.user.organisationName
            );

            try {
                const response = await openai.chat.completions.create({
                    model: chatgptModel,
                    messages: [{ role: "user", content: firstMessageAndSystemPromptPrompt }],
                    response_format: { type: "json_object" }
                });

                try {
                    const firstMessageAndSystemPrompt = JSON.parse(response.choices[0].message.content || "{}");

                    return res.json({
                        success: true,
                        firstMessage: firstMessageAndSystemPrompt.firstMessage,
                        systemPrompt: firstMessageAndSystemPrompt.systemPrompt
                    });
                } catch (parseError) {
                    console.error('Error parsing OpenAI response:', parseError);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to parse OpenAI response"
                    });
                }
            } catch (openaiError) {
                console.error('OpenAI API error:', openaiError);
                return res.status(500).json({
                    success: false,
                    message: "Failed to generate system prompt"
                });
            }
        } catch (dbError) {
            console.error('Database query error:', dbError);
            return res.status(500).json({
                success: false,
                message: "Database query failed"
            });
        }
    } catch (error) {
        console.error('Unexpected error in system-prompt route:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

let isCronRunning = false;
// Cron job to execute due scheduled calls every minute
setInterval(async () => {
    if (isCronRunning) {
        console.log('Cron is already running, skipping this interval');
        return;
    }
    isCronRunning = true;
    const now = new Date();
    try {
        while (true) {
            // Atomically find and lock the oldest due call (isCalled: false)
            const call = await ScheduledCalls.findOneAndUpdate(
                {
                    startTime: { $lte: now },
                    isCalled: false
                },
                { $set: { isCalled: true } },
                { new: true, sort: { startTime: 1 } }
            );
            if (!call) break; // No more due calls to process
            if (!call.data || !call.data.assistantId || !call.data.phoneNumber || !call.data.jobId || !call.data.candidateId) {
                console.error('Scheduled call missing required data:', call);
                continue;
            }
            try {
                const result = await makeOutboundCall(
                    call.data.assistantId,
                    call.data.phoneNumber,
                    process.env.VAPI_PHONE_NUMBER_ID || ''
                );
                // Type guard for result.id
                let callId = '';
                if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') {
                    callId = result.id;
                }
                await CallDetails.create({
                    jobId: call.data.jobId,
                    candidateId: call.data.candidateId,
                    organisation_id: '',
                    assistantId: call.data.assistantId,
                    callId: callId,
                    callDetails: result
                });
                await ScheduledCalls.updateOne({ _id: call._id }, { callId: callId });
            } catch (err) {
                console.error('Error executing scheduled call:', err);
            }
        }
    } catch (err) {
        console.error('Error in scheduled call cron:', err);
    } finally {
        isCronRunning = false;
    }
}, 60 * 1000); // Every minute