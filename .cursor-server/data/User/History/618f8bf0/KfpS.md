# Sora Feed API Usage Guide

> **Scope:** Read-only access to the public Explore/Feed endpoint to list latest posts and media encodings.

---

## Base URL

- `https://sora.chatgpt.com/backend/project_y`

## Endpoint

- **GET** `/feed?limit={n}&cut={feed_slice}`
  - `limit` (int): max items to return. Typical: `16`
  - `cut` (string): server-side slice. Example: `nf2_latest`

**Example**
GET /backend/project_y/feed?limit=16&cut=nf2_latest
Host: sora.chatgpt.com

yaml
Copy code

---

## Authentication & Session

This endpoint requires a valid session. Provide:

- **Bearer token** in the `Authorization` header
- **Session cookies** for your logged-in browser session
- (Often) a valid **Cloudflare clearance** cookie for bot protection
- A realistic **User-Agent**

> **Paste your real values only in local files or your secrets manager.**
> In this guide, placeholders are written like `<PLACEHOLDER>`.

### Required Headers

- `Authorization: Bearer <AUTH_BEARER_TOKEN>`
- `Accept: */*`
- `Accept-Language: en-US,en;q=0.9` (or your locale)
- `User-Agent: <USER_AGENT_STRING>`
- `Referer: https://sora.chatgpt.com/explore` (recommended)

### Required Cookies (commonly observed)

Include these in the single `Cookie:` header when making requests:

- `__Secure-next-auth.session-token=<SESSION_TOKEN>`
- `cf_clearance=<CF_CLEARANCE>`
- `__cf_bm=<CF_BM>`
- `oai-sc=<OAI_SC>`
- `oai-did=<OAI_DID>`

> Notes
> - Cloudflare cookies (`cf_clearance`, `__cf_bm`) are **ephemeral** and rotate frequently.
> - Session cookies and bearer tokens **expire**; you must refresh/rotate as needed.
> - Asset links returned by the API often contain **time-bound SAS signatures** (`?se=...&sig=...`) that will expire.

---

## Response Shape (simplified)

```ts
type FeedResponse = {
  items: Array<{
    post: {
      id: string;
      text: string | null;
      posted_at: number;          // epoch seconds
      updated_at: number;         // epoch seconds
      posted_to_public: boolean;
      preview_image_url: string | null;
      attachments: Array<{
        id: string;
        kind: "sora";
        generation_id: string;
        generation_type: "video_gen";
        width: number;
        height: number;
        task_id: string;
        output_blocked: boolean;
        encodings: {
          source?: { path: string };     // full MP4
          source_wm?: { path: string };  // watermarked MP4
          md?: { path: string };         // medium MP4
          gif?: { path: string };        // animated GIF
          thumbnail?: { path: string };  // WebP
          unfurl?: unknown | null;
        };
      }>;
      permalink: string;
    };
    profile: {
      user_id: string;
      username: string;
      display_name?: string | null;
      permalink: string;
      follower_count: number;
      following_count: number;
      post_count: number;
      verified: boolean;
    };
  }>;
};
Quickstart Requests
1) cURL
bash
Copy code
# Load secrets from your environment (see .env.example)
curl "https://sora.chatgpt.com/backend/project_y/feed?limit=16&cut=nf2_latest" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  -H "Accept: */*" \
  -H "Accept-Language: ${ACCEPT_LANGUAGE:-en-US,en;q=0.9}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "Referer: https://sora.chatgpt.com/explore" \
  -H "Cookie: __Secure-next-auth.session-token=${COOKIE_SESSION}; cf_clearance=${CF_CLEARANCE}; __cf_bm=${CF_BM}; oai-sc=${OAI_SC}; oai-did=${OAI_DID}"
2) Node.js (fetch)
ts
Copy code
// scripts/fetchFeed.ts
import 'dotenv/config';

const BASE = 'https://sora.chatgpt.com/backend/project_y';
const url = `${BASE}/feed?limit=${process.env.FEED_LIMIT ?? 16}&cut=${process.env.FEED_CUT ?? 'nf2_latest'}`;

function cookieHeader() {
  const parts = [
    `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
    `cf_clearance=${process.env.CF_CLEARANCE}`,
    `__cf_bm=${process.env.CF_BM}`,
    `oai-sc=${process.env.OAI_SC}`,
    `oai-did=${process.env.OAI_DID}`,
  ].filter(Boolean);
  return parts.join('; ');
}

(async () => {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
      'Accept': '*/*',
      'Accept-Language': process.env.ACCEPT_LANGUAGE ?? 'en-US,en;q=0.9',
      'User-Agent': process.env.USER_AGENT ?? 'Mozilla/5.0',
      'Referer': 'https://sora.chatgpt.com/explore',
      'Cookie': cookieHeader(),
    },
  });

  const ok = res.ok;
  const status = res.status;

  if (!ok) {
    const text = await res.text().catch(() => '');
    console.error(`HTTP ${status} — ${res.statusText}`);
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const data = await res.json();
  // Minimal projection to keep logs clean
  const rows = (data.items ?? []).map((it: any) => {
    const p = it.post ?? {};
    const a = (p.attachments ?? [])[0]?.encodings ?? {};
    return {
      id: p.id,
      text: (p.text ?? '').slice(0, 80),
      permalink: p.permalink,
      md: a.md?.path ?? '',
      gif: a.gif?.path ?? '',
      thumb: a.thumbnail?.path ?? '',
    };
  });
  console.table(rows);
})();
3) Python (requests)
py
Copy code
# scripts/fetch_feed.py
import os, sys, json, requests

BASE = "https://sora.chatgpt.com/backend/project_y"
url = f"{BASE}/feed?limit={os.getenv('FEED_LIMIT','16')}&cut={os.getenv('FEED_CUT','nf2_latest')}"

headers = {
    "Authorization": f"Bearer {os.getenv('AUTH_BEARER_TOKEN')}",
    "Accept": "*/*",
    "Accept-Language": os.getenv("ACCEPT_LANGUAGE","en-US,en;q=0.9"),
    "User-Agent": os.getenv("USER_AGENT","Mozilla/5.0"),
    "Referer": "https://sora.chatgpt.com/explore",
}

cookie_parts = {
    "__Secure-next-auth.session-token": os.getenv("COOKIE_SESSION"),
    "cf_clearance": os.getenv("CF_CLEARANCE"),
    "__cf_bm": os.getenv("CF_BM"),
    "oai-sc": os.getenv("OAI_SC"),
    "oai-did": os.getenv("OAI_DID"),
}
cookies = {k:v for k,v in cookie_parts.items() if v}

r = requests.get(url, headers=headers, cookies=cookies, timeout=30)

if not r.ok:
    print(f"HTTP {r.status_code} — {r.reason}", file=sys.stderr)
    print(r.text[:2000], file=sys.stderr)
    sys.exit(1)

data = r.json()
items = data.get("items", [])
rows = []
for it in items:
    p = it.get("post", {})
    enc = (p.get("attachments") or [{}])[0].get("encodings", {})
    rows.append({
        "id": p.get("id"),
        "text": (p.get("text") or "")[:80],
        "permalink": p.get("permalink"),
        "md": (enc.get("md") or {}).get("path",""),
        "gif": (enc.get("gif") or {}).get("path",""),
        "thumb": (enc.get("thumbnail") or {}).get("path",""),
    })
print(json.dumps(rows, ensure_ascii=False, indent=2))
Error Handling & Retries
Common responses:

401/403 — expired/invalid session, missing/invalid clearance cookie.

429 — rate limited. Backoff and retry.

5xx — transient; retry with jitter.

Backoff recommendation: exponential (e.g., 0.5s, 1s, 2s, 4s; max 30s), random jitter ±20%.

Working with Media URLs
Encodings often include SAS-signed Azure Blob URLs:

se=YYYY-MM-DDThh:mm:ssZ — expiry. After this time the link stops working.

sig=... — signature. Treat as sensitive.

Do not log full URLs with query strings. Strip or redact se/sig/& friends before logging.

Logging & Redaction
Before storing or sharing logs, scrub secrets:

Headers: Authorization value

Cookies: session & Cloudflare tokens

Query params: se, sig, skoid, skt, ske, sks, skv

Regex hint (language-agnostic idea)

Replace Authorization: Bearer .* → Authorization: Bearer <REDACTED>

Replace cookie values name=.*?(;|$) → name=<REDACTED>\1

Replace query params ([?&](se|sig|skoid|skt|ske|sks|skv)=[^&]+) → &<REDACTED>

Security Practices (Required)
Never commit raw tokens/cookies to git.

Keep secrets in a local .env or a secret store (1Password, Vault, Doppler, etc.).

Rotate session tokens regularly; expect Cloudflare cookies to change frequently.

Avoid logging bodies or headers on success paths. Log minimal metadata.

Environment Variables
Name	Purpose
AUTH_BEARER_TOKEN	Bearer token for Authorization header
COOKIE_SESSION	__Secure-next-auth.session-token value
CF_CLEARANCE	Cloudflare clearance cookie
CF_BM	Cloudflare bot management cookie
OAI_SC	Session cookie
OAI_DID	Device id cookie
USER_AGENT	Realistic browser UA string
ACCEPT_LANGUAGE	e.g. en-US,en;q=0.9
FEED_LIMIT	Default: 16
FEED_CUT	Default: nf2_latest

Paste your actual values into your local .env (never in docs or issues).

makefile
Copy code

File path: **.env.example**

```bash
# Authentication
AUTH_BEARER_TOKEN=<PASTE_YOUR_BEARER_TOKEN>

# Cookies
COOKIE_SESSION=<PASTE___Secure-next-auth.session-token>
CF_CLEARANCE=<PASTE_cf_clearance>
CF_BM=<PASTE___cf_bm>
OAI_SC=<PASTE_oai-sc>
OAI_DID=<PASTE_oai-did>

# Headers
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36
ACCEPT_LANGUAGE=en-US,en;q=0.9

# Request params
FEED_LIMIT=16
FEED_CUT=nf2_latest
