# 🔑 Environment Configuration

## Minimal Authentication Requirements

After testing, we've determined that **only the Bearer token is required** for accessing public Sora video feeds.

### ✅ Required Environment Variables

Create a `.env` file in the project root with:

```bash
# REQUIRED: OpenAI Bearer Token (JWT)
# Get this from your browser's developer tools when logged into sora.chatgpt.com
# Look for the "authorization" header in network requests
AUTH_BEARER_TOKEN=your_bearer_token_here
```

### 🔧 Optional Environment Variables

```bash
# OPTIONAL: Custom User Agent (defaults to Chrome if not provided)
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36

# OPTIONAL: Accept Language (defaults to en-US if not provided)  
ACCEPT_LANGUAGE=en-US,en;q=0.9
```

### ❌ No Longer Required

The following environment variables are **NOT needed** for public video feeds:

- `COOKIE_SESSION` - Session cookies not required for public feeds
- `CF_CLEARANCE` - Cloudflare clearance not needed with Bearer token
- `CF_BM` - Cloudflare bot management cookie not required
- `OAI_SC` - OpenAI security cookie not needed
- `OAI_DID` - Device ID not required for public access

## 🚀 How to Get Your Bearer Token

1. Open your browser and go to [sora.chatgpt.com](https://sora.chatgpt.com)
2. Log in to your OpenAI account
3. Open Developer Tools (F12)
4. Go to the Network tab
5. Navigate around the site (browse videos, etc.)
6. Look for requests to `backend/project_y/feed`
7. Click on one of these requests
8. In the Request Headers, find the `authorization` header
9. Copy the value after `Bearer ` (the long JWT token)
10. Add it to your `.env` file as `AUTH_BEARER_TOKEN=<your_token>`

## 🎯 Benefits of Minimal Authentication

- **Easier Setup**: Users only need to provide one token
- **Better Privacy**: No session cookies required
- **Simpler Implementation**: Fewer environment variables to manage
- **User-Friendly**: Much easier for users to set up their own instances

## 🔄 Token Expiration

Bearer tokens do expire. If you start getting 401 Unauthorized errors, you'll need to:

1. Log out and log back into sora.chatgpt.com
2. Extract a fresh Bearer token using the steps above
3. Update your `.env` file with the new token
