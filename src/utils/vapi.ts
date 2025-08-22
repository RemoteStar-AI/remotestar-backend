import { VapiClient } from '@vapi-ai/server-sdk';
import { VapiAnalysisPrompt } from './prompts';

// Initialize the Vapi client
export const vapi = new VapiClient({
  token: process.env.VAPI_API_KEY!,
});

// Define the system prompt for customer support
export const systemPrompt = `You are Alex, a customer service voice assistant for TechSolutions. Your primary purpose is to help customers resolve issues with their products, answer questions about services, and ensure a satisfying support experience.
- Sound friendly, patient, and knowledgeable without being condescending
- Use a conversational tone with natural speech patterns
- Speak with confidence but remain humble when you don'\''t know something
- Demonstrate genuine concern for customer issues`;

export async function createSupportAssistant(systemPrompt: string, firstMessage: string, VapiAnalysisPrompt: string,name: string) {
  try {
    const defaultAnalysisPlan: object = {
      summaryPlan: {
        enabled: true,
        timeoutSeconds: 60,
        messages: [
          { role: "system", content: VapiAnalysisPrompt },
          { role: "user", content: "Here is the transcript:\n\n{{transcript}}\n\n" }
        ]
      },
      structuredDataPlan: {
        enabled: true,
        timeoutSeconds: 60,
        messages: [
          { role: "system", content: VapiAnalysisPrompt }
        ],
        schema: {
          type: "object",
          properties: {
            overall_technical_skills: { type: "number" },
            overall_communication: { type: "number" },
            technical_skills: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  skill_name: { type: "string" },
                  skill_rating: { type: "number" },
                  skill_assessment: { type: "string" }
                },
                required: ["skill_name", "skill_rating", "skill_assessment"],
                additionalProperties: false
              }
            }
          },
          required: ["overall_technical_skills", "overall_communication", "technical_skills"],
          additionalProperties: false
        }
      },
      successEvaluationPlan: {
        enabled: true,
        timeoutSeconds: 60,
        messages: [
          { role: "system", content: "if call goes well and we talk a little bit then its a success full call" },
        ]
      }
    };
    const assistant = await vapi.assistants.create({
      name: name,
      maxDurationSeconds: 1200, // 20 minutes
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: 'vapi',
        voiceId: 'Elliot',
      },
      firstMessage: firstMessage,
      analysisPlan: defaultAnalysisPlan,
      transcriber:{
        provider: 'deepgram',
        model: 'nova-3'
      },
      server:{
        url : `${process.env.SERVER_URL}/api/v6/call/webhook`,
        timeoutSeconds: 5,
        headers:{
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        }
      }
    });
    
    console.log('Assistant created:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('Error creating assistant:', error);
    throw error;
  }
}


export async function makeOutboundCall(assistantId: string, phoneNumber: string, phoneNumberId: string, candidateIdAsName: string) {
  try {
    const call = await vapi.calls.create({
      assistantId: assistantId,
      name: candidateIdAsName,
      phoneNumberId: phoneNumberId, // Your Vapi phone number ID
      customer: {
        number: phoneNumber, // Target phone number
      },
    });
    // @ts-ignore
    console.log('Outbound call initiated:', call.id);
    return call;
  } catch (error) {
    console.error('Error making outbound call:', error);
    throw error;
  }
}


export async function makeOutboundNudgeCall(assistantId: string, phoneNumber: string, phoneNumberId: string, candidateIdAsName: string, nudgePrompt: string) {
  try {
    const call = await vapi.calls.create({
      assistantId: assistantId,
      name: candidateIdAsName,
      phoneNumberId: phoneNumberId, // Your Vapi phone number ID
      assistantOverrides:{
        model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
      },
      },
      customer: {
        number: phoneNumber, // Target phone number
      }
    });
    // @ts-ignore
    console.log('Outbound call initiated:', call.id);
    return call;
  } catch (error) {
    console.error('Error making outbound call:', error);
    throw error;
  }
}


export async function scheduleOutboundCall(
  assistantId: string,
  phoneNumber: string,
  phoneNumberId: string,
  scheduledTime: string // ISO 8601 timestamp
) {
  try {
    const call = await vapi.calls.create({
      assistantId,
      phoneNumberId,
      customer: {
        number: phoneNumber,
      },
      // @ts-ignore - 'scheduledTime' is supported by Vapi API but not in current SDK types
      scheduledTime,
    });

    // @ts-ignore - SDK response should have id based on docs
    return call.id;
  } catch (error) {
    console.error('Error scheduling outbound call:', error);
    throw error;
  }
}

export async function getCallDetails(callId: string) {
  try {
    const call = await vapi.calls.get(callId);
    return call;
  } catch (error) {
    console.error('Error getting call details:', error);
    return {
      error: error,
      message: 'Error fetching call details. Please try again.'
    };
  }
}

export async function updateScriptforAssistant(assistantId: string, firstMessage: string, script: string) {
  try {
    const assistant = await vapi.assistants.update(assistantId, {
      firstMessage: firstMessage,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: script,
          },
        ],
      },
    });
    return assistant;
  } catch (error) {
    console.error('Error updating assistant:', error);
    throw error;
  }
}