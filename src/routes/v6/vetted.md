# Vetted Route Documentation

## Endpoint
```
GET /v6/vetted
```

## Authentication
**Required**: Firebase authentication token in Authorization header
```
Authorization: Bearer <firebase_token>
```

## Description
Retrieves all vetted candidate details for the authenticated user's organisation. This includes call recordings, candidate information, job details, and company information.

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "candidateName": "John Doe",
      "candidateId": "candidate_id_here",
      "jobTitle": "Software Engineer",
      "jobId": "job_id_here",
      "type": "call" | "email",
      "companyName": "Tech Corp",
      "companyId": "company_id_here",
      "callDetails": {
        "status": "ended" | "failed",
        "messages": [...],
        "duration": 300,
        "videoUrl": "https://s3.amazonaws.com/..."
      }
    }
  ]
}
```

### Error Responses
```json
// 400 - Missing organisation
{
  "success": false,
  "error": "Organisation ID is required"
}

// 500 - Server error
{
  "success": false,
  "error": "Internal server error"
}
```

## Data Structure

| Field | Type | Description |
|-------|------|-------------|
| `candidateName` | string | Full name of the candidate |
| `candidateId` | string | Unique identifier for the candidate |
| `jobTitle` | string | Title of the job position |
| `jobId` | string | Unique identifier for the job |
| `type` | string | Type of interaction: "call" or "email" |
| `companyName` | string | Name of the company |
| `companyId` | string | Unique identifier for the company |
| `callDetails` | object | Call recording details and metadata |

## Notes
- The route automatically fetches fresh call details from VAPI if not cached
- Video URLs are included when available
- Only completed calls (status: "ended" or "failed") are cached
- Email interactions are handled differently from call interactions
- The response is filtered to exclude any records with missing data
