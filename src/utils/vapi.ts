import { VapiClient } from '@vapi-ai/server-sdk';

// Initialize the Vapi client
const vapi = new VapiClient({
  token: process.env.VAPI_API_KEY!,
});

// Define the system prompt for customer support
export const systemPrompt = `You are Alex, a customer service voice assistant for TechSolutions. Your primary purpose is to help customers resolve issues with their products, answer questions about services, and ensure a satisfying support experience.
- Sound friendly, patient, and knowledgeable without being condescending
- Use a conversational tone with natural speech patterns
- Speak with confidence but remain humble when you don'\''t know something
- Demonstrate genuine concern for customer issues`;

export async function createSupportAssistant(systemPrompt:string, firstMessage:string) {
  try {
    const assistant = await vapi.assistants.create({
      name: 'Customer Support Assistant',
      // Configure the AI model
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
      // Configure the voice
      voice: {
        provider: 'vapi',
        voiceId: 'Elliot',
      },
      // Set the first message
      firstMessage: firstMessage,
    });
    
    console.log('Assistant created:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('Error creating assistant:', error);
    throw error;
  }
}


export async function makeOutboundCall(assistantId: string, phoneNumber: string, phoneNumberId: string) {
  try {
    const call = await vapi.calls.create({
      assistantId: assistantId,
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

export async function getCallDetails(callId: string) {
  const call = await vapi.calls.get(callId);
  return call;
}


// Make a call to your own number for testing
//makeOutboundCall('your-assistant-id', '+1234567890','');
