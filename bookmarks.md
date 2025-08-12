## Bookmarks API (v2)

This Node.js backend exposes bookmark endpoints under `/api/v2/bookmarks`. All routes require Firebase authentication via an ID token.

- **Base URL (local)**: `http://localhost:3000`
- **Mounted path**: `/api/v2/bookmarks`
- **Auth**: `Authorization: Bearer <Firebase ID token>` (verified server-side)

### Data model (response shape)
Bookmarks are stored in MongoDB with this shape:

```json
{
  "_id": "6630f4b1c1c2a40012ab34cd",
  "userId": "662ff0f6a3c7b90010def111",
  "memberId": "firebase-uid-of-recruiter-or-member",
  "jobId": "662fee10a3c7b90010def222",
  "companyId": "6610aa33bb44cc55dd66ee77",
  "createdAt": "2024-05-01T10:00:00.000Z",
  "updatedAt": "2024-05-01T10:00:00.000Z",
  "__v": 0
}
```

Notes:
- `memberId` is validated from the request body but the server ultimately sets it from the authenticated Firebase user (ID token). Keep them consistent.
- On create/delete, the backend updates the `total_bookmarks` counter on the referenced `User`.

---

### GET /api/v2/bookmarks/:companyId
Fetch all bookmarks for a given `companyId`.

- **Auth**: required
- **Path params**:
  - `companyId` (string)
- **Response 200**: `Bookmark[]` (array of bookmark objects)

Example cURL:

```bash
curl -X GET \
  "http://localhost:3000/api/v2/bookmarks/<companyId>" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Common errors: `401 Unauthorized`, `500 Internal Server Error`.

---

### POST /api/v2/bookmarks
Create a bookmark for a `userId` and `jobId`. The server infers `companyId` from the job and uses the authenticated user as `memberId`.

- **Auth**: required
- **Body (JSON)**:

```json
{
  "userId": "<candidate-user-mongo-id>",
  "memberId": "<firebase-uid>",
  "jobId": "<job-mongo-id>"
}
```

Validation requires all 3 fields. The server will still set `memberId` from the ID token internally.

- **Response 200**: created `Bookmark`
- **Errors**: `400 Bad Request` (invalid body), `404 Not Found` (job or user), `500 Internal Server Error`

Example cURL:

```bash
curl -X POST \
  "http://localhost:3000/api/v2/bookmarks" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "662ff0f6a3c7b90010def111",
    "memberId": "<firebase-uid>",
    "jobId": "662fee10a3c7b90010def222"
  }'
```

---

### DELETE /api/v2/bookmarks/:id
Delete a bookmark by its `_id`.

- **Auth**: required
- **Path params**:
  - `id` (string, bookmark `_id`)
- **Response 200**: deleted `Bookmark`
- **Errors**: `404 Not Found`, `500 Internal Server Error`

Example cURL:

```bash
curl -X DELETE \
  "http://localhost:3000/api/v2/bookmarks/<bookmarkId>" \
  -H "Authorization: Bearer $ID_TOKEN"
```

---

## Using from Next.js (frontend)

Recommended setup:

1) Expose your backend URL to the client via env:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

2) Obtain the Firebase ID token on the client and attach it to requests.

Client utility (App Router or Pages):

```ts
// utils/api.ts
import { getAuth } from "firebase/auth";

export async function authFetch(input: RequestInfo, init: RequestInit = {}) {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const idToken = currentUser ? await currentUser.getIdToken() : undefined;
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    },
  });
}
```

### Example: list bookmarks for a company

```ts
import { authFetch } from "@/utils/api";

export async function getCompanyBookmarks(companyId: string) {
  const res = await authFetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v2/bookmarks/${companyId}`
  );
  if (!res.ok) throw new Error("Failed to load bookmarks");
  return (await res.json()) as Array<{
    _id: string;
    userId: string;
    memberId: string;
    jobId: string;
    companyId: string;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

### Example: create a bookmark

```ts
import { authFetch } from "@/utils/api";

export async function createBookmark(params: { userId: string; memberId: string; jobId: string }) {
  const res = await authFetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v2/bookmarks`,
    {
      method: "POST",
      body: JSON.stringify(params),
    }
  );
  if (!res.ok) throw new Error("Failed to create bookmark");
  return await res.json();
}
```

Tip: set `memberId` to the authenticated user's Firebase UID for validation consistency. The server will still use the ID token to record `memberId`.

### Example: delete a bookmark

```ts
import { authFetch } from "@/utils/api";

export async function deleteBookmark(bookmarkId: string) {
  const res = await authFetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v2/bookmarks/${bookmarkId}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete bookmark");
  return await res.json();
}
```

---

### Quick notes for frontend devs
- Always include a valid Firebase ID token in the `Authorization` header.
- `userId` must reference an existing `User` document; `jobId` must reference an existing `Job`.
- `companyId` on the bookmark is derived from the `Job` server-side.
- No pagination on the GET endpoint; expect an array for the company.


