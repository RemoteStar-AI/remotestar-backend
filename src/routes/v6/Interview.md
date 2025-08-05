# Interview API Specification

## Overview
The Interview API provides endpoints for creating and managing interview sessions with candidates. The API supports intelligent assistant reuse and updates based on candidate history and job requirements.

## Base URL
```
POST /api/v6/interview
GET /api/v6/interview/:id
POST /api/v6/interview/email
```

## Authentication
All endpoints require Firebase authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <firebase_token>
```

---

## 1. Create Interview

### Endpoint
```
POST /api/v6/interview
```

### Description
Creates a new interview session for a candidate. The system intelligently manages VAPI assistants:
- Reuses existing assistant if the candidate has previous interviews with the same system prompt
- Updates existing assistant if the system prompt has changed
- Creates new assistant if the candidate has no previous interviews

### Request Headers
```
Content-Type: application/json
Authorization: Bearer <firebase_token>
```

### Request Body
```json
{
  "name": "string",
  "JobName": "string", 
  "candidateEmail": "string",
  "candidateId": "string",
  "jobId": "string",
  "systemPrompt": "string"
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Name of the person creating the interview |
| JobName | string | Yes | Name/title of the job position |
| candidateEmail | string | Yes | Email address of the candidate |
| candidateId | string | Yes | Unique identifier for the candidate |
| jobId | string | Yes | Unique identifier for the job |
| systemPrompt | string | Yes | System prompt for the VAPI assistant |

### Response

#### Success Response (200)
```json
{
  "success": true,
  "interviewId": "string",
  "assistantId": "string", 
  "message": "Interview created and email sent successfully"
}
```

#### Error Responses

**400 Bad Request - Validation Error**
```json
{
  "success": false,
  "error": "Invalid request data",
  "details": [
    {
      "code": "invalid_string",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["name"]
    }
  ]
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": "User authentication required"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": "Failed to create interview or send email"
}
```

### Example Request
```bash
curl -X POST /api/v6/interview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <firebase_token>" \
  -d '{
    "name": "John Doe",
    "email": "john@company.com",
    "JobName": "Senior Software Engineer",
    "candidateEmail": "candidate@example.com",
    "candidateId": "candidate_123",
    "jobId": "job_456",
    "systemPrompt": "You are an AI assistant conducting interviews for RemoteStar..."
  }'
```

### Example Response
```json
{
  "success": true,
  "interviewId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "assistantId": "asst_abc123def456",
  "message": "Interview created and email sent successfully"
}
```

---

## 2. Get Interview Details

### Endpoint
```
GET /api/v6/interview/:id
```

### Description
Retrieves interview details including the associated job information and assistant ID.

### Request Headers
```
Authorization: Bearer <firebase_token>
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Interview ID |

### Response

#### Success Response (200)
```json
{
  "success": true,
  "assistantId": "string",
  "jobName": "string",
  "jobDescription": "string", 
  "location": "string"
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "Interview ID is required"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Interview not found"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": "Internal server error while fetching interview"
}
```

### Example Request
```bash
curl -X GET /api/v6/interview/64f8a1b2c3d4e5f6a7b8c9d0 \
  -H "Authorization: Bearer <firebase_token>"
```

### Example Response
```json
{
  "success": true,
  "assistantId": "asst_abc123def456",
  "jobName": "Senior Software Engineer",
  "jobDescription": "We are looking for a talented software engineer...",
  "location": "Remote"
}
```

---

## 3. Send Interview Email

### Endpoint
```
POST /api/v6/interview/email
```

### Description
Sends an interview notification email to a candidate. This endpoint does not require authentication.

### Request Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "name": "string",
  "email": "string",
  "JobName": "string",
  "interviewLink": "string",
  "toEmail": "string"
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Name of the person sending the email |
| email | string | Yes | Email of the person sending the email |
| JobName | string | Yes | Name/title of the job position |
| interviewLink | string | Yes | Interview link/URL |
| toEmail | string | Yes | Email address of the candidate |

### Response

#### Success Response (200)
```json
{
  "success": true
}
```

### Example Request
```bash
curl -X POST /api/v6/interview/email \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@company.com",
    "JobName": "Senior Software Engineer",
    "interviewLink": "https://interview.remotestar.com/abc123",
    "toEmail": "candidate@example.com"
  }'
```

---

## Assistant Management Logic

The API implements intelligent assistant management:

### Assistant Reuse
- If a candidate has previous interviews and the system prompt is identical, the existing assistant is reused
- This saves resources and maintains consistency

### Assistant Updates  
- If a candidate has previous interviews but the system prompt has changed, the existing assistant is updated with the new prompt
- This ensures the assistant has the latest job requirements

### New Assistant Creation
- If a candidate has no previous interviews, a new assistant is created
- The assistant name is generated using the first 30 characters of the creator's name

### Logging
The API provides comprehensive logging for debugging:
- Request data logging
- Assistant creation/update/reuse decisions
- Email sending status
- Error details with stack traces

---

## Error Handling

### Common Error Scenarios

1. **Validation Errors**: Invalid email formats, missing required fields
2. **Authentication Errors**: Missing or invalid Firebase token
3. **Database Errors**: Connection issues, missing records
4. **VAPI Errors**: Assistant creation/update failures
5. **Email Errors**: SMTP failures (doesn't break interview creation)

### Error Response Format
All error responses follow this structure:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

---

## Rate Limiting
Currently no rate limiting is implemented. Consider implementing rate limiting for production use.

## Security Considerations

1. **Authentication**: All endpoints (except email) require Firebase authentication
2. **Input Validation**: All inputs are validated using Zod schemas
3. **Error Messages**: Generic error messages to avoid information leakage
4. **Logging**: Sensitive data is not logged in production

## Dependencies

- Express.js for routing
- Firebase for authentication
- Zod for validation
- VAPI for assistant management
- MongoDB for data storage
- Nodemailer for email sending 