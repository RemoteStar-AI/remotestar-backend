# Webhook System Setup Guide

This guide explains how to set up and use the webhook system for monitoring call status changes in your frontend application.

## Overview

The webhook system provides real-time notifications when call status changes occur, allowing your frontend to update the UI immediately without polling the server.

## Quick Start

### 1. Register a Webhook Subscription

First, register your frontend webhook endpoint with the backend:

```javascript
// Frontend code to register webhook
const registerWebhook = async () => {
  const response = await fetch('/api/v6/call/webhook/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      webhook_url: 'https://your-frontend.com/api/webhook',
      events: ['call.status.changed', 'call.completed', 'call.failed']
    })
  });
  
  const result = await response.json();
  console.log('Webhook registered:', result);
  
  // Store the secret key securely for signature verification
  localStorage.setItem('webhook_secret', result.secret_key);
};
```

### 2. Create Webhook Endpoint in Frontend

Create an endpoint in your frontend to receive webhook notifications:

```javascript
// Express.js example
app.post('/api/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify webhook signature
  const secretKey = process.env.WEBHOOK_SECRET || localStorage.getItem('webhook_secret');
  if (!verifyWebhookSignature(payload, signature, secretKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, callId, status, data } = req.body;
  
  // Handle the webhook based on event type
  switch (event) {
    case 'call.status.changed':
      // Update call status in your UI
      updateCallStatus(callId, status);
      break;
      
    case 'call.completed':
      // Handle call completion
      handleCallCompletion(callId, data);
      break;
      
    case 'call.failed':
      // Handle call failure
      handleCallFailure(callId, data);
      break;
  }
  
  res.json({ success: true });
});

// Signature verification function
function verifyWebhookSignature(payload, signature, secretKey) {
  const crypto = require('crypto');
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

### 3. Update Your UI

Implement functions to update your UI based on webhook events:

```javascript
// Example UI update functions
function updateCallStatus(callId, status) {
  // Find the call element in your UI
  const callElement = document.querySelector(`[data-call-id="${callId}"]`);
  if (callElement) {
    // Update status display
    callElement.querySelector('.status').textContent = status;
    
    // Update status-specific styling
    callElement.className = `call-item status-${status}`;
    
    // Show notifications for important status changes
    if (status === 'completed') {
      showNotification('Call completed successfully!');
    } else if (status === 'failed') {
      showNotification('Call failed', 'error');
    }
  }
}

function handleCallCompletion(callId, data) {
  // Handle call completion logic
  console.log('Call completed:', callId, data);
  
  // Maybe show a success message
  showNotification('Call completed successfully!', 'success');
  
  // Update any relevant UI elements
  updateCallHistory();
}

function handleCallFailure(callId, data) {
  // Handle call failure logic
  console.log('Call failed:', callId, data);
  
  // Show error message
  showNotification('Call failed. Please try again.', 'error');
  
  // Maybe enable retry button
  enableRetryButton(callId);
}
```

## Testing

### Test Webhook Registration

You can test your webhook setup using the test endpoint:

```javascript
// Test your webhook endpoint
const testWebhook = async () => {
  const response = await fetch('/api/v6/call/webhook/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      webhook_url: 'https://your-frontend.com/api/webhook',
      event_type: 'call.completed'
    })
  });
  
  const result = await response.json();
  console.log('Test result:', result);
};
```

### Monitor Webhook Subscriptions

Check your webhook subscriptions:

```javascript
const listWebhooks = async () => {
  const response = await fetch('/api/v6/call/webhook/subscriptions', {
    headers: {
      'Authorization': `Bearer ${firebaseToken}`
    }
  });
  
  const result = await response.json();
  console.log('Webhook subscriptions:', result.subscriptions);
};
```

## Security Best Practices

1. **Always verify webhook signatures** to ensure requests are authentic
2. **Use HTTPS** for your webhook endpoint
3. **Store secret keys securely** - never expose them in client-side code
4. **Handle duplicate events** - the same event may be sent multiple times
5. **Respond quickly** to webhook requests (within 5 seconds)

## Common Issues

### Webhook Not Receiving Events

1. Check if your webhook subscription is active
2. Verify your webhook URL is accessible from the internet
3. Check for delivery failures in the subscription list
4. Ensure your webhook endpoint responds with 200 status

### Signature Verification Failing

1. Make sure you're using the correct secret key
2. Verify the signature format (should include 'sha256=' prefix)
3. Ensure you're hashing the exact request body

### Webhook Subscription Deactivated

If your subscription gets deactivated due to delivery failures:
1. Fix the issue with your webhook endpoint
2. Reactivate the subscription using the PATCH endpoint
3. Monitor delivery failures to prevent future deactivation

## Integration with Existing Call System

The webhook system integrates seamlessly with your existing call system:

1. **Outbound calls** - You'll receive notifications when calls are initiated and when status changes
2. **Scheduled calls** - You'll receive notifications when calls are scheduled and when they execute
3. **Call status updates** - Real-time updates as calls progress through different states

## Example Complete Integration

```javascript
// Complete example of webhook integration
class CallWebhookManager {
  constructor() {
    this.secretKey = localStorage.getItem('webhook_secret');
    this.setupWebhookEndpoint();
  }
  
  async registerWebhook() {
    const response = await fetch('/api/v6/call/webhook/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify({
        webhook_url: `${window.location.origin}/api/webhook`,
        events: ['call.status.changed', 'call.completed', 'call.failed']
      })
    });
    
    const result = await response.json();
    if (result.success) {
      localStorage.setItem('webhook_secret', result.secret_key);
      this.secretKey = result.secret_key;
      console.log('Webhook registered successfully');
    }
  }
  
  setupWebhookEndpoint() {
    // This would be your server-side webhook endpoint
    // Implementation depends on your backend framework
  }
  
  handleWebhookEvent(event, callId, status, data) {
    // Emit event to your frontend components
    window.dispatchEvent(new CustomEvent('callStatusChanged', {
      detail: { event, callId, status, data }
    }));
  }
}

// Usage in your React/Vue/Angular components
const callManager = new CallWebhookManager();

// Listen for call status changes
window.addEventListener('callStatusChanged', (event) => {
  const { callId, status, data } = event.detail;
  // Update your component state
  updateCallStatus(callId, status);
});
```

This webhook system provides a robust, secure way to receive real-time call status updates in your frontend application. 