## POST /v6/interview/get-presigned-url

Generate a one-time presigned URL to upload a full interview video to S3 in a single PUT request. The URL is valid for 15 minutes.

### Auth
- No auth required

### Request Body
```
{
  "candidateId": "string",                 // required: the candidate identifier
  "contentType": "string",                 // optional: MIME type of the upload
  "interviewId": "string (interviewLink)"  // optional: the interview link identifier to associate the S3 key with
}
```

### Supported content types
- video/webm
- video/mp4
- video/quicktime (MOV)
- video/x-matroska (MKV)

If omitted, defaults to video/webm. Use the actual MIME type of the recorded Blob/File.

### Response (200)
```
{
  "success": true,
  "presignedUrl": "string",      // PUT this URL with the video bytes and matching Content-Type
  "key": "string",               // S3 object key to store for later playback
  "filename": "string",          // server-generated filename
  "metadata": {
    "candidateId": "string",
    "timestamp": number,
    "uploadId": "string"
  },
  "expiresIn": 900                 // 15 minutes in seconds
}
```

When `interviewId` is provided, the server will also persist the generated `key` and `contentType` onto the `Interview` record.

### Error Responses
- 400: Invalid request data (Zod validation errors)
- 404: Interview not found (only when `interviewId` is provided and cannot be located)
- 500: Failed to generate presigned URL

### Uploading the video (client)
```bash
curl -X PUT "<presignedUrl>" \
  -H "Content-Type: <your-content-type>" \
  --data-binary @/path/to/your/video
```

Browser example:
```ts
await fetch(presignedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': contentType },
  body: videoBlob
});
```

### Persisting and viewing later
- Store the exact `key` returned in the response (preferred). Example format: `videos/{candidateId}/{timestamp}-full-{uuid}.<ext>`
- To generate a one-time viewing URL later (15 minutes):
```ts
import { getVideoSignedUrlFromLink } from "../../utils/s3";

const url = await getVideoSignedUrlFromLink(interview.key, 900);
```

If you stored the full S3 URL instead of the key, the helper will also accept it and parse the key internally.


