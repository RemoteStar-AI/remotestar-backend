import crypto from 'crypto';

/**
 * Verify VAPI webhook signature
 * VAPI sends webhooks with a signature header for verification
 */
export function verifyVapiWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // VAPI uses HMAC-SHA256 for webhook signatures
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare signatures in a timing-safe manner
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying VAPI webhook signature:', error);
    return false;
  }
}

/**
 * Extract VAPI webhook signature from headers
 */
export function extractVapiSignature(headers: any): string | null {
  // VAPI might send signature in different header formats
  return headers['x-vapi-signature'] || 
         headers['x-webhook-signature'] || 
         headers['signature'] || 
         null;
}

/**
 * Middleware to verify VAPI webhooks
 */
export function vapiWebhookVerification(secret: string) {
  return (req: any, res: any, next: any) => {
    const signature = extractVapiSignature(req.headers);
    
    if (!signature) {
      console.warn('No VAPI signature found in webhook request');
      // Continue processing but log warning
      return next();
    }

    const payload = JSON.stringify(req.body);
    const isValid = verifyVapiWebhookSignature(payload, signature, secret);

    if (!isValid) {
      console.error('Invalid VAPI webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  };
} 