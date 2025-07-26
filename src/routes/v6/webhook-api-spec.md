# Call Webhook API Specification

This document describes the webhook system for monitoring call status changes in the Remotestar application.

## Overview

The webhook system allows frontend applications to receive real-time notifications when call status changes occur. This includes:
- Call initiation
- Call status updates (in-progress, completed, failed)
- Scheduled call execution
- Call failures

## Authentication

All webhook subscription management endpoints require Firebase authentication via the `Authorization` header:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

## Webhook Subscription Management

### 1. Create/Update Webhook Subscription

**Endpoint:** `POST /v6/call/webhook/subscribe`

**Description:** Creates a new webhook subscription or updates an existing one for the organisation.

**Request Body:**
```json
{
  "webhook_url": "https://your-frontend.com/webhook",
  "events": ["call.status.changed", "call.completed", "call.failed", "call.initiated"]
}
```

**Events Available:**
- `call.status.changed` - Any status change (default)
- `call.completed` - Call completed successfully
- `call.failed` - Call failed or encountered an error

**Success Response (200):**
```json
{
  "success": true,
  "message": "Webhook subscription created",
  "subscription_id": "64f8a1b2c3d4e5f6a7b8c9d0",
  "secret_key": "abc123def456ghi789..."
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "Invalid webhook URL"
}
```

### 2. List Webhook Subscriptions

**Endpoint:** `GET /v6/call/webhook/subscriptions`

**Description:** Retrieves all webhook subscriptions for the organisation.

**Success Response (200):**
```json
{
  "success": true,
  "subscriptions": [
    {
      "id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "webhook_url": "https://your-frontend.com/webhook",
      "events": ["call.status.changed", "call.completed"],
      "is_active": true,
      "last_delivery_attempt": "2024-01-15T10:30:00.000Z",
      "delivery_failures": 0,
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### 3. Update Webhook Subscription

**Endpoint:** `PATCH /v6/call/webhook/subscribe/:id`

**Description:** Updates an existing webhook subscription.

**Request Body:**
```json
{
  "is_active": false,
  "events": ["call.completed", "call.failed"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Webhook subscription updated",
  "subscription": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "webhook_url": "https://your-frontend.com/webhook",
    "events": ["call.completed", "call.failed"],
    "is_active": false
  }
}
```

### 4. Delete Webhook Subscription

**Endpoint:** `DELETE /v6/call/webhook/subscribe/:id`

**Description:** Deletes a webhook subscription.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Webhook subscription deleted"
}
```

## Webhook Payload Format

When a call status change occurs, your webhook URL will receive a POST request with the following payload:

### Payload Structure
```json
{
  "event": "call.status.changed",
  "callId": "call_abc123def456",
  "jobId": "job_123",
  "candidateId": "candidate_456",
  "organisation_id": "org_789",
  "recruiterEmail": "recruiter@company.com",
  "status": "in-progress",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "type": "outbound",
    "additionalInfo": "..."
  }
}
```

### Event Types

1. **call.status.changed**
   - Triggered for any status change
   - Common statuses: `initiated`, `in-progress`, `ringing`, `answered`

2. **call.completed**
   - Triggered when call ends successfully
   - Status: `completed`

3. **call.failed**
   - Triggered when call fails or encounters an error
   - Status: `failed`, `error`, `busy`, `no-answer`

### Status Values

- `initiated` - Call has been created and is being processed
- `scheduled` - Call has been scheduled for future execution
- `in-progress` - Call is currently active
- `ringing` - Phone is ringing
- `answered` - Call has been answered
- `completed` - Call ended successfully
- `failed` - Call failed to complete
- `error` - Call encountered an error
- `busy` - Phone number was busy
- `no-answer` - Call was not answered

### Data Field Examples

**Outbound Call:**
```json
{
  "type": "outbound",
  "callDetails": {
    "id": "call_abc123",
    "status": "in-progress",
    "duration": 120
  }
}
```

**Scheduled Call:**
```json
{
  "type": "scheduled",
  "scheduledTime": "2024-01-15T11:00:00.000Z",
  "scheduledCallId": "64f8a1b2c3d4e5f6a7b8c9d0"
}
```

**Scheduled Call Execution:**
```json
{
  "type": "scheduled_executed",
  "scheduledCallId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "callDetails": {
    "id": "call_abc123",
    "status": "initiated"
  }
}
```

## Webhook Security

### Signature Verification

Each webhook request includes a signature header for verification:

**Headers:**
```
Content-Type: application/json
X-Webhook-Signature: sha256=abc123def456...
User-Agent: Remotestar-Call-Webhook/1.0
```

**Verification Process:**
1. Get the `X-Webhook-Signature` header
2. Create HMAC-SHA256 hash of the request body using your secret key
3. Compare the computed signature with the received signature

**Example (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secretKey) {
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('sha256=', ''), 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

## Error Handling

### Webhook Delivery Failures

- If a webhook delivery fails, the system will retry up to 5 times
- After 5 consecutive failures, the subscription is automatically deactivated
- Failed deliveries are logged and can be monitored via the subscription list

### Rate Limiting

- Webhook notifications are sent asynchronously to avoid blocking call processing
- Each webhook request has a 10-second timeout
- Multiple webhook subscriptions for the same organisation are processed in parallel

## Best Practices

1. **Always verify webhook signatures** to ensure authenticity
2. **Respond quickly** to webhook requests (within 5 seconds)
3. **Handle duplicate events** - the same event may be sent multiple times
4. **Store the secret key securely** - it's only provided once during subscription creation
5. **Monitor delivery failures** and reactivate subscriptions if needed
6. **Use HTTPS** for your webhook endpoint

## Example Frontend Implementation

```javascript
// Express.js webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify signature
  if (!verifyWebhookSignature(payload, signature, YOUR_SECRET_KEY)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, callId, status, data } = req.body;
  
  // Handle different events
  switch (event) {
    case 'call.status.changed':
      updateCallStatus(callId, status);
      break;
    case 'call.completed':
      handleCallCompletion(callId, data);
      break;
    case 'call.failed':
      handleCallFailure(callId, data);
      break;
  }
  
  res.json({ success: true });
});
``` 