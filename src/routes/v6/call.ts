import { Router } from "express";
import { z } from "zod";
import { createSupportAssistant, getCallDetails, makeOutboundCall } from "../../utils/vapi";
import { authenticate } from "../../middleware/firebase-auth";
import { DefaultAssistant, CallDetails, User, Job } from "../../utils/db";
import { openai } from "../../utils/openai";
import { VapiSystemPrompt } from "../../utils/prompts";

const chatgptModel = "gpt-3.5-turbo";

const callSchema = z.object({
    phoneNumber: z.string().min(1),
   // assistantId: z.string().min(1),
   firstMessage: z.string().min(1),
   systemPrompt: z.string().min(1),
   jobId: z.string().min(1),
   candidateId: z.string().min(1),
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
        const { phoneNumber, firstMessage, systemPrompt, jobId, candidateId } = parsedBody;

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

        const call = await makeOutboundCall(assistantId, phoneNumber, process.env.VAPI_PHONE_NUMBER_ID!);
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