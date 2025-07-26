import crypto from 'crypto';
import { WebhookSubscription } from './db';
import logger from './loggers';

export interface CallStatusWebhookPayload {
  event: 'call.status.changed' | 'call.completed' | 'call.failed' | 'call.initiated';
  callId: string;
  jobId: string;
  candidateId: string;
  organisation_id: string;
  recruiterEmail: string;
  status: string;
  timestamp: string;
  data?: any;
}

export async function sendWebhookNotification(
  webhookUrl: string, 
  payload: CallStatusWebhookPayload, 
  secretKey: string
): Promise<boolean> {
  try {
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(payloadString)
      .digest('hex');

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'User-Agent': 'Remotestar-Call-Webhook/1.0'
      },
      body: payloadString,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
   if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

 
    logger.info(`Webhook notification sent successfully to ${webhookUrl} for call ${payload.callId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send webhook notification to ${webhookUrl}:`, error);
    return false;
  }
}

export async function notifyCallStatusChange(
  organisation_id: string,
  callId: string,
  jobId: string,
  candidateId: string,
  recruiterEmail: string,
  status: string,
  additionalData?: any
): Promise<void> {
  try {
    // Get all active webhook subscriptions for this organisation
    const subscriptions = await WebhookSubscription.find({
      organisation_id,
      is_active: true
    });

    if (subscriptions.length === 0) {
      logger.info(`No webhook subscriptions found for organisation ${organisation_id}`);
      return;
    }

    // Determine the event type based on status
    let event: 'call.status.changed' | 'call.completed' | 'call.failed' | 'call.initiated';
    if (status === 'ended') {
      event = 'call.completed';
    } else if (status === 'failed' || status === 'error') {
      event = 'call.failed';
    } else if (status === 'in-progress') {
      event = 'call.initiated';
    } else {
      event = 'call.status.changed';
    }

    const payload: CallStatusWebhookPayload = {
      event,
      callId,
      jobId,
      candidateId,
      organisation_id,
      recruiterEmail,
      status,
      timestamp: new Date().toISOString(),
      data: additionalData
    };

    // Send notifications to all subscriptions
    const notificationPromises = subscriptions.map(async (subscription) => {
      // Check if this subscription is interested in this event
      if (!subscription.events.includes(event)) {
        return;
      }

      const success = await sendWebhookNotification(
        subscription.webhook_url,
        payload,
        subscription.secret_key
      );

      // Update subscription stats
      await WebhookSubscription.updateOne(
        { _id: subscription._id },
        {
          last_delivery_attempt: new Date(),
          delivery_failures: success ? 0 : subscription.delivery_failures + 1
        }
      );

      // Deactivate subscription if too many failures
      if (subscription.delivery_failures >= 5) {
        await WebhookSubscription.updateOne(
          { _id: subscription._id },
          { is_active: false }
        );
        logger.warn(`Deactivated webhook subscription ${subscription._id} due to repeated failures`);
      }
    });

    await Promise.all(notificationPromises);
  } catch (error) {
    logger.error('Error notifying call status change:', error);
  }
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secretKey: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
} 