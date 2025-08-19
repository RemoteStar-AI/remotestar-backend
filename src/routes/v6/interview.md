## GET /v6/interview/:id

### Summary
Fetch details for an interview link. This route does not require authentication. It validates the link, optionally checks call status if the interview already ended, enforces expiration, and returns basic job and assistant info.

### Path params
- **id**: the `interviewLink` string generated at creation time

### Success response (200)
Returns interview and job metadata.

```json
{
  "success": true,
  "interviewId": "665f6c...",
  "assistantId": "asst_123",
  "jobName": "Senior Backend Engineer",
  "jobDescription": "...",
  "location": "Remote"
}
```

### Client errors
- 400 — missing `id` path param
```json
{ "success": false, "error": "Interview ID is required" }
```

- 404 — interview not found for the given `id`
```json
{ "success": false, "error": "Interview not found" }
```

- 404 — interview expired (also deletes the interview record)
```json
{ "success": false, "error": "Interview expired" }
```

- 404 — interview already ended and associated call details are missing (defensive check)
```json
{ "success": false, "error": "Call details not found" }
```

### Server errors
- 500 — any unexpected server error while fetching or processing
```json
{ "success": false, "error": "Internal server error while fetching interview" }
```

### Behavior notes
- The route queries `Interview` by `interviewLink` and loads the related `Job` by `jobId`. If the job was deleted, fields like `jobName`/`jobDescription`/`location` may be `null`.
- If the interview `status` is `"ended"`, the route attempts to fetch call details via `getCallDetails`. If call details are missing, it returns 404 as a safeguard.
- Expiration: `expiresAt` is set at creation time to 15 days from now and is enforced here. If expired, the record is deleted and a 404 is returned.

### Source
- Route: `src/routes/v6/interview.ts`
- Models: `src/utils/db.ts` (`Interview`, `Job`)

