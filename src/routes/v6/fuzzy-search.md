## v6 User Fuzzy Search

Search users by partial text across multiple fields, scoped to the caller's organisation. Designed to be debounce-friendly.

- **Method**: POST
- **Path**: `/api/v6/user/fuzzy-search`
- **Auth**: Firebase ID token in `Authorization: Bearer <token>`

### Request

Body:

```json
{
  "text": "jo",          // string, required, min 2 characters
  "limit": 10             // number, optional, 1..50 (defaults to 20)
}
```

Behavior:
- `text` is matched case-insensitively over `name`, `email`, `designation`, `current_location`.
- If `text` parses to a number, it also matches `years_of_experience` exactly.
- Results are scoped to `organisation_id` inferred from the caller's Firebase token.
- Results are limited and projected for speed; responses are `.lean()` objects.

### Response 200

```json
[
  {
    "_id": "662ff0f6a3c7b90010def111",
    "name": "John Doe",
    "email": "john@example.com",
    "designation": "Senior Engineer",
    "current_location": "Bengaluru",
    "years_of_experience": 6,
    "organisation_id": "6610aa33bb44cc55dd66ee77",
    "total_bookmarks": 3,
    "createdAt": "2024-05-01T10:00:00.000Z"
  }
]
```

### Errors

- 400: `'text' is required (min 2 chars)`
- 401/403: Unauthorized
- 500: Internal Server Error

---

## Frontend integration with debouncing (Next.js)

Install a debounce helper (or write a quick one):

```ts
// utils/debounce.ts
export function debounce<F extends (...args: any[]) => void>(fn: F, delay = 300) {
  let timer: NodeJS.Timeout | null = null;
  return (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

Auth fetch wrapper:

```ts
// utils/api.ts
import { getAuth } from "firebase/auth";

export async function authFetch(path: string, init: RequestInit = {}) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL!;
  const auth = getAuth();
  const idToken = await auth.currentUser?.getIdToken();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
  });
}
```

Hook example (App Router):

```ts
// hooks/useFuzzyUsers.ts
import { useCallback, useMemo, useRef, useState } from "react";
import { debounce } from "@/utils/debounce";
import { authFetch } from "@/utils/api";

type UserLite = {
  _id: string;
  name: string;
  email: string;
  designation?: string;
  current_location?: string;
  years_of_experience?: number;
};

export function useFuzzyUsers() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/v6/user/fuzzy-search`, {
        method: "POST",
        body: JSON.stringify({ text, limit: 10 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as UserLite[];
      setResults(data);
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedSearch = useMemo(() => debounce(search, 300), [search]);

  const onChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  return { query, onChange, results, loading, error };
}
```

Usage in a component:

```tsx
// app/components/UserSearch.tsx
"use client";
import { useFuzzyUsers } from "@/hooks/useFuzzyUsers";

export default function UserSearch() {
  const { query, onChange, results, loading } = useFuzzyUsers();
  return (
    <div>
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search users (min 2 chars)"
        className="border px-2 py-1 rounded"
      />
      {loading && <div>Searching…</div>}
      <ul>
        {results.map((u) => (
          <li key={u._id} className="py-1">
            {u.name} — {u.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Notes:
- Debounce at 250–400ms for a good UX; we used 300ms.
- We also cancel in-flight requests with `AbortController` to avoid race conditions.
- Backend enforces min length (2) and result limit (default 20; max 50).


