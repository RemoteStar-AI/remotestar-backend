# Call API Documentation

## Overview
The Call API provides endpoints for managing voice calls using Vapi integration. It supports both immediate outbound calls and scheduled calls, with assistant management and call history tracking.

## Base URL
```
/v6/call
```

## Authentication
All endpoints require Firebase authentication via the `authenticate` middleware. Include the Firebase ID token in the Authorization header.

## Endpoints

### 1. Get Call History and Assistant Details
**GET** `/:jobId/:candidateId`

Retrieves the default assistant configuration and call history for a specific job-candidate combination.

#### Path Parameters
- `jobId` (string, required): The job identifier
- `candidateId` (string, required): The candidate identifier

#### Response
**Success (200)**
```json
{
  "success": true,
  "assistant": {
    "userId": "string",
    "jobId": "string", 
    "candidateId": "string",
    "organisation_id": "string",
    "firstMessage": "string",
    "systemPrompt": "string",
    "assistantId": "string"
  },
  "callDetails": [
    {
      "id": "string",
      "status": "string",
      "duration": "number",
      "startedAt": "string",
      "endedAt": "string"
    }
  ]
}
```

**No Assistant Found (200)**
```json
{
  "success": false,
  "message": "No default assistant found"
}
```

### 2. Create Call (Outbound or Scheduled)
**POST** `/`

Creates either an immediate outbound call or schedules a call for a future time.

#### Request Body
```json
{
  "phoneNumber": "string",           // Required: Phone number (will be processed to remove spaces/dashes)
  "firstMessage": "string",          // Required: Initial message for the assistant
  "systemPrompt": "string",          // Required: System prompt for the assistant
  "jobId": "string",                 // Required: Job identifier
  "candidateId": "string",           // Required: Candidate identifier
  "type": "outbound" | "scheduled",  // Required: Call type
  "date": "string",                  // Optional: Date for scheduled calls (YYYY-MM-DD)
  "time": "string"                   // Optional: Time for scheduled calls (HH:MM)
}
```

#### Phone Number Processing
The API automatically processes phone numbers to:
- Remove leading/trailing spaces
- Remove hyphens (-), en dashes (–), and em dashes (—)
- Remove internal spaces
- Preserve the + sign

**Examples:**
- `+91-93510-44614` → `+919351044614`
- `  +91 93510 44614  ` → `+919351044614`

#### Response
**Success (200)**
```json
{
  "success": true,
  "assistantId": "string",
  "callId": "string"
}
```

**Error (400/500)**
```json
{
  "success": false,
  "error": "Error message"
}
```

#### Assistant Management
The API implements intelligent assistant reuse:
- If an existing assistant exists with the same `systemPrompt` and `firstMessage`, it reuses that assistant
- If the prompts are different, it creates a new assistant and updates the database
- Assistant details are stored in the `DefaultAssistant` collection

### 3. Generate System Prompt
**GET** `/system-prompt/:jobId/:candidateId`

Generates a customized system prompt and first message using OpenAI based on job description and candidate data.

#### Path Parameters
- `jobId` (string, required): The job identifier
- `candidateId` (string, required): The candidate identifier

#### Response
**Success (200)**
```json
{
  "success": true,
  "firstMessage": "string",
  "systemPrompt": "string"
}
```

**Error (404/500)**
```json
{
  "success": false,
  "message": "Error description"
}
```

## Data Models

### Call Schema
```typescript
{
  phoneNumber: string;           // Processed phone number
  firstMessage: string;          // Assistant's first message
  systemPrompt: string;          // Assistant's system prompt
  jobId: string;                 // Job identifier
  candidateId: string;           // Candidate identifier
  type: "outbound" | "scheduled"; // Call type
  date?: string;                 // Date for scheduled calls
  time?: string;                 // Time for scheduled calls
}
```

### DefaultAssistant Model
```typescript
{
  userId: string;                // Firebase user ID
  jobId: string;                 // Job identifier
  candidateId: string;           // Candidate identifier
  organisation_id: string;       // Organization identifier
  firstMessage: string;          // Assistant's first message
  systemPrompt: string;          // Assistant's system prompt
  assistantId: string;           // Vapi assistant ID
}
```

### CallDetails Model
```typescript
{
  jobId: string;                 // Job identifier
  candidateId: string;           // Candidate identifier
  organisation_id: string;       // Organization identifier
  assistantId: string;           // Vapi assistant ID
  callId: string;                // Vapi call ID
  callDetails: object;           // Full call details from Vapi
}
```

## Error Handling

### Common Error Codes
- **400**: Bad Request - Invalid request body or missing required fields
- **401**: Unauthorized - Missing or invalid authentication
- **404**: Not Found - Job or candidate not found
- **500**: Internal Server Error - Server-side error

### Error Response Format
```json
{
  "success": false,
  "error": "Detailed error message"
}
```

## Environment Variables
The following environment variables are required:
- `VAPI_API_KEY`: Vapi API key for voice assistant operations
- `VAPI_PHONE_NUMBER_ID`: Vapi phone number ID for outbound calls

## Examples

### Immediate Outbound Call
```bash
curl -X POST /v6/call \
  -H "Authorization: Bearer <firebase-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+91-93510-44614",
    "firstMessage": "Hi, this is Alex from TechSolutions...",
    "systemPrompt": "You are Alex, a customer service assistant...",
    "jobId": "job123",
    "candidateId": "candidate456",
    "type": "outbound"
  }'
```

### Scheduled Call
```bash
curl -X POST /v6/call \
  -H "Authorization: Bearer <firebase-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+91 93510 44614",
    "firstMessage": "Hi, this is Alex from TechSolutions...",
    "systemPrompt": "You are Alex, a customer service assistant...",
    "jobId": "job123",
    "candidateId": "candidate456",
    "type": "scheduled",
    "date": "2024-10-15",
    "time": "14:30"
  }'
```

### Get Call History
```bash
curl -X GET /v6/call/job123/candidate456 \
  -H "Authorization: Bearer <firebase-token>"
```

### Generate System Prompt
```bash
curl -X GET /v6/call/system-prompt/job123/candidate456 \
  -H "Authorization: Bearer <firebase-token>"
```
