### Nudge Call API (v6)

Trigger an outbound “nudge” phone call to a candidate for a given role. The call is placed via Vapi and a record is stored in `CallDetails`.

- **Base path**: `/api/v6/call`
- **Endpoint**: `POST /nudge`
- **Full URL**: `POST /api/v6/call/nudge`
- **Auth**: Firebase ID token via `Authorization: Bearer <token>`

### Purpose
- **What it does**: Initiates a call to a candidate using a pre-configured "nudge" assistant, then persists the call metadata.
- **When to use**: Any time the UI wants to gently nudge a candidate (e.g., to follow up about a role).

### Request
- **Headers**
  - **Authorization**: `Bearer <Firebase_ID_Token>`
  - **Content-Type**: `application/json`

- **Body (JSON)**
  - **phoneNumber**: E.164 formatted number, including country code. Example: `+14155552671`
  - **candidateId**: ID of the candidate in your system
  - **jobId**: ID of the job
  - **roleName**: Human-readable role title used to tailor the nudge script

Example:
```json
{
  "phoneNumber": "+14155552671",
  "candidateId": "cand_123",
  "jobId": "66f2b0f4b8ef1e001e2b1234",
  "roleName": "Senior Backend Engineer"
}
```

### Validation
- **phoneNumber** must match E.164: `+` followed by 8–15 digits. If invalid, the request fails.
- All fields are required and must be non-empty strings.

### Response
- **200 OK**
  - **Body**
    - **success**: boolean
    - **call**: Vapi call object returned by `vapi.calls.create` (contains at least an `id`)

Example:
```json
{
  "success": true,
  "call": {
    "id": "call_abc123",
    "assistantId": "e916d042-af61-41d8-8692-08d11b919a5c",
    "customer": { "number": "+14155552671" },
    "phoneNumberId": "<redacted>",
    "status": "queued"
  }
}
```

### Error cases
- **401 Unauthorized**: Missing `Authorization` header.
- **403 Unauthorized**: Invalid/expired Firebase token.
- **500 Server Error**: Validation failure (e.g., bad phone format) or downstream Vapi error.

Note: The route uses strict validation and will throw on invalid input. There is no per-field error mapping in the current implementation; treat non-2xx as failure and surface a generic error to the user.

### Side effects
- Persists a `CallDetails` record with: `jobId`, `candidateId`, `organisation_id` (from user), `assistantId` (nudge assistant), `callId`, `callDetails` (raw), `recruiterEmail`, `type: "nudge"`.

### Dependencies & configuration
- Requires `VAPI_API_KEY` and a valid `VAPI_PHONE_NUMBER_ID` configured on the server.
- The call uses a preconfigured nudge assistant (`assistantId`), and a role-specific prompt is generated server-side.

### Usage examples
- cURL
```bash
curl -X POST \
  "${SERVER_URL}/api/v6/call/nudge" \
  -H "Authorization: Bearer ${FIREBASE_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+14155552671",
    "candidateId": "cand_123",
    "jobId": "66f2b0f4b8ef1e001e2b1234",
    "roleName": "Senior Backend Engineer"
  }'
```

- Axios (TypeScript)
```typescript
import axios from "axios";

type NudgeRequest = {
  phoneNumber: string;
  candidateId: string;
  jobId: string;
  roleName: string;
};

type NudgeResponse = {
  success: boolean;
  call: { id: string; [k: string]: any };
};

export async function triggerNudge(apiBaseUrl: string, idToken: string, payload: NudgeRequest) {
  const { data } = await axios.post<NudgeResponse>(
    `${apiBaseUrl}/api/v6/call/nudge`,
    payload,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return data.call.id;
}
```

### Notes for UI
- Validate phone numbers client-side to E.164 to avoid failures.
- Display optimistic UI if desired, but surface errors from non-2xx responses.
- The returned `call.id` can be stored if you plan to reference this call later.


