# WebSocket API Documentation

## Overview

The WebSocket API provides real-time communication for call status updates and notifications. It allows frontend applications to receive instant updates when call statuses change.

## Connection

### WebSocket URL
```
ws://your-server-domain:port
```

### Connection Flow

1. **Connect to WebSocket**
   ```javascript
   const ws = new WebSocket('ws://localhost:3000');
   ```

2. **Send initialization message**
   ```javascript
   ws.onopen = () => {
     ws.send(JSON.stringify({
       type: "init",
       payload: {
         userId: "user@example.com" // Use email as userId
       }
     }));
   };
   ```

3. **Receive confirmation**
   ```json
   {
     "type": "connected",
     "userId": "user@example.com",
     "message": "Successfully connected to WebSocket server"
   }
   ```

## Message Types

### From Client to Server

#### Init Message
```json
{
  "type": "init",
  "payload": {
    "userId": "user@example.com"
  }
}
```

### From Server to Client

#### Call Status Update
```json
{
  "event": "call.status.changed",
  "callId": "eb3e23ae-f766-4a0b-a002-3a775cfe4b5c",
  "status": "ended",
  "data": {
    "type": "status-update",
    "assistantId": "7ac6d8a8-bf4d-45bc-bd92-41d36be986e1",
    "customerNumber": "+919351044614",
    "endedReason": "customer-busy"
  }
}
```

#### Connection Confirmation
```json
{
  "type": "connected",
  "userId": "user@example.com",
  "message": "Successfully connected to WebSocket server"
}
```

#### Error Message
```json
{
  "type": "error",
  "message": "Invalid message format"
}
```

## REST API Endpoints

### Test WebSocket Message
**POST** `/api/v6/call/websocket/test`

Send a test message to a specific user via WebSocket.

**Headers:**
```
Authorization: Bearer <firebase_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetUserId": "user@example.com",
  "message": "Hello from WebSocket!",
  "event": "test.event"
}
```

**Response:**
```json
{
  "success": true,
  "message": "WebSocket message sent successfully",
  "data": {
    "event": "test.event",
    "callId": "test_call",
    "status": "test",
    "data": {
      "message": "Hello from WebSocket!",
      "timestamp": "2025-01-26T18:41:38.130Z",
      "sender": "sender@example.com"
    }
  }
}
```

### Get WebSocket Clients
**GET** `/api/v6/call/websocket/clients`

Get information about connected WebSocket clients (for debugging).

**Headers:**
```
Authorization: Bearer <firebase_token>
```

**Response:**
```json
{
  "success": true,
  "message": "WebSocket clients endpoint - check server logs for connected clients"
}
```

## Frontend Implementation Example

```javascript
class WebSocketManager {
  constructor(serverUrl, userId) {
    this.serverUrl = serverUrl;
    this.userId = userId;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.ws = new WebSocket(this.serverUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Send initialization message
      this.ws.send(JSON.stringify({
        type: "init",
        payload: {
          userId: this.userId
        }
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log('Successfully connected:', message.message);
        break;
      
      case 'error':
        console.error('WebSocket error:', message.message);
        break;
      
      default:
        // Handle call status updates
        if (message.event === 'call.status.changed') {
          this.handleCallStatusUpdate(message);
        }
    }
  }

  handleCallStatusUpdate(message) {
    console.log('Call status update:', message);
    
    // Update UI based on call status
    switch (message.status) {
      case 'initiated':
        this.showCallInitiated(message.callId);
        break;
      case 'ringing':
        this.showCallRinging(message.callId);
        break;
      case 'in-progress':
        this.showCallInProgress(message.callId);
        break;
      case 'ended':
        this.showCallEnded(message.callId, message.data?.endedReason);
        break;
      default:
        console.log('Unknown call status:', message.status);
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, 1000 * this.reconnectAttempts); // Exponential backoff
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage
const wsManager = new WebSocketManager('ws://localhost:3000', 'user@example.com');
wsManager.connect();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  wsManager.disconnect();
});
```

## Call Status Events

The WebSocket will automatically send updates when call statuses change:

- **initiated**: Call has been initiated
- **ringing**: Call is ringing
- **in-progress**: Call is active
- **ended**: Call has ended
- **failed**: Call failed to connect

## Security

- WebSocket connections are authenticated via the `userId` (email) sent in the init message
- Only authenticated users can send test messages via the REST API
- Messages are sent only to the specific user who initiated the call

## Error Handling

- Automatic reconnection with exponential backoff
- Graceful handling of connection errors
- Invalid message format detection
- Connection state monitoring

## Troubleshooting

1. **Connection fails**: Check server URL and port
2. **Messages not received**: Verify `userId` matches the email used for call initiation
3. **Reconnection issues**: Check network connectivity and server status
4. **Authentication errors**: Ensure Firebase token is valid 