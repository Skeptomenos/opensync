# OpenSync API Reference

Secure API for accessing your OpenCode sessions programmatically.

## Authentication

All API endpoints require authentication via Bearer token.

### Option 1: API Key (Recommended for external apps)

Generate an API key in Settings. API keys start with `osk_`.

```bash
curl "https://your-project.convex.site/api/sessions" \
  -H "Authorization: Bearer osk_your_api_key"
```

### Option 2: JWT Token (For authenticated web clients)

Use the JWT token from WorkOS authentication.

```bash
curl "https://your-project.convex.site/api/sessions" \
  -H "Authorization: Bearer eyJhbG..."
```

## Base URL

Your API base URL is your Convex site URL:

```
https://your-project-123.convex.site
```

Note: This is different from your Convex cloud URL (`.cloud` vs `.site`).

---

## Endpoints

### List Sessions

```
GET /api/sessions
```

Returns all sessions for the authenticated user.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| limit | number | Max sessions to return (default: 50) |

**Response:**

```json
{
  "sessions": [
    {
      "id": "abc123",
      "externalId": "session_xyz",
      "title": "Fix authentication bug",
      "projectPath": "/Users/dev/myapp",
      "projectName": "myapp",
      "model": "claude-3-5-sonnet-20241022",
      "provider": "anthropic",
      "promptTokens": 1500,
      "completionTokens": 2000,
      "totalTokens": 3500,
      "cost": 0.0245,
      "durationMs": 45000,
      "isPublic": false,
      "messageCount": 8,
      "createdAt": 1704067200000,
      "updatedAt": 1704070800000
    }
  ]
}
```

---

### Get Session

```
GET /api/sessions/get
```

Returns a single session with all messages and parts.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | string | Session ID (required) |

**Response:**

```json
{
  "session": {
    "id": "abc123",
    "title": "Fix authentication bug",
    "model": "claude-3-5-sonnet-20241022",
    "totalTokens": 3500,
    "cost": 0.0245,
    ...
  },
  "messages": [
    {
      "id": "msg123",
      "role": "user",
      "textContent": "The login is broken",
      "createdAt": 1704067200000,
      "parts": [
        {
          "type": "text",
          "content": "The login is broken"
        }
      ]
    },
    {
      "id": "msg124",
      "role": "assistant",
      "textContent": "I'll help fix that...",
      "createdAt": 1704067260000,
      "parts": [
        {
          "type": "text",
          "content": "I'll help fix that..."
        },
        {
          "type": "tool-call",
          "content": {
            "name": "read_file",
            "args": { "path": "src/auth.ts" }
          }
        }
      ]
    }
  ]
}
```

---

### Search Sessions

```
GET /api/search
```

Search sessions using full-text, semantic, or hybrid search.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| q | string | Search query (required) |
| type | string | Search type: `fulltext`, `semantic`, `hybrid` (default: fulltext) |
| limit | number | Max results (default: 20) |

**Example:**

```bash
# Full-text search
curl "https://your-project.convex.site/api/search?q=authentication&type=fulltext" \
  -H "Authorization: Bearer osk_xxx"

# Semantic search (finds related content)
curl "https://your-project.convex.site/api/search?q=login+issues&type=semantic" \
  -H "Authorization: Bearer osk_xxx"

# Hybrid search (best of both)
curl "https://your-project.convex.site/api/search?q=auth+flow&type=hybrid" \
  -H "Authorization: Bearer osk_xxx"
```

**Response:**

```json
{
  "results": [
    {
      "id": "abc123",
      "title": "Fix authentication bug",
      "projectPath": "/Users/dev/myapp",
      "model": "claude-3-5-sonnet-20241022",
      "totalTokens": 3500,
      "messageCount": 8,
      "createdAt": 1704067200000
    }
  ]
}
```

---

### Get Context (for RAG/LLM)

```
GET /api/context
```

Get relevant session content formatted for LLM context injection. Uses semantic search to find the most relevant sessions.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| q | string | Query describing what you need (required) |
| limit | number | Max sessions to include (default: 5) |
| format | string | `text` or `messages` (default: text) |

**Example:**

```bash
curl "https://your-project.convex.site/api/context?q=react+hooks+best+practices&format=text&limit=3" \
  -H "Authorization: Bearer osk_xxx"
```

**Response (format=text):**

```json
{
  "text": "Relevant coding sessions for: \"react hooks best practices\"\n\n--- Session: Refactor to hooks ---\nProject: /Users/dev/myapp\nModel: claude-3-5-sonnet\n\n[USER]\nHow should I refactor this class component?\n\n[ASSISTANT]\nHere's how to convert to hooks...\n\n",
  "sessionCount": 3
}
```

**Response (format=messages):**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "How should I refactor this class component?",
      "metadata": {
        "sessionId": "abc123",
        "sessionTitle": "Refactor to hooks"
      }
    },
    {
      "role": "assistant",
      "content": "Here's how to convert to hooks..."
    }
  ],
  "sessionCount": 3
}
```

**Use Case: Context Engineering**

```python
# Fetch relevant context
response = requests.get(
    f"{OPENSYNC_URL}/api/context",
    params={"q": user_question, "format": "text", "limit": 5},
    headers={"Authorization": f"Bearer {API_KEY}"}
)
context = response.json()["text"]

# Inject into prompt
messages = [
    {"role": "system", "content": f"Use this context from previous sessions:\n\n{context}"},
    {"role": "user", "content": user_question}
]
```

---

### Export Session

```
GET /api/export
```

Export a session in various formats.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | string | Session ID (required) |
| format | string | `json`, `markdown`, `jsonl` (default: json) |

**Examples:**

```bash
# JSON (OpenAI messages format)
curl "https://your-project.convex.site/api/export?id=abc123&format=json" \
  -H "Authorization: Bearer osk_xxx"

# Markdown
curl "https://your-project.convex.site/api/export?id=abc123&format=markdown" \
  -H "Authorization: Bearer osk_xxx"

# JSONL (for fine-tuning datasets)
curl "https://your-project.convex.site/api/export?id=abc123&format=jsonl" \
  -H "Authorization: Bearer osk_xxx"
```

**Response (format=json):**

```json
{
  "session": {
    "id": "abc123",
    "title": "Fix authentication bug",
    "model": "claude-3-5-sonnet-20241022"
  },
  "messages": [
    { "role": "user", "content": "The login is broken" },
    { "role": "assistant", "content": "I'll help fix that..." }
  ]
}
```

**Response (format=markdown):**

```
Content-Type: text/markdown
Content-Disposition: attachment; filename="fix-authentication-bug.md"

# Fix authentication bug

- **Project:** /Users/dev/myapp
- **Model:** claude-3-5-sonnet-20241022
- **Tokens:** 3,500
- **Cost:** $0.0245

---

## User

The login is broken

## Assistant

I'll help fix that...
```

---

### Get Statistics

```
GET /api/stats
```

Get usage statistics for the authenticated user.

**Response:**

```json
{
  "sessionCount": 150,
  "messageCount": 1200,
  "totalTokens": 2500000,
  "totalCost": 45.67,
  "totalDurationMs": 3600000,
  "modelUsage": {
    "claude-3-5-sonnet-20241022": {
      "tokens": 2000000,
      "cost": 40.00,
      "sessions": 120
    },
    "gpt-4o": {
      "tokens": 500000,
      "cost": 5.67,
      "sessions": 30
    }
  }
}
```

---

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Session not found"
}
```

**Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing parameters) |
| 401 | Unauthorized (invalid/missing token) |
| 404 | Not found |
| 500 | Server error |

---

## Rate Limits

- API requests are logged for auditing
- No hard rate limits currently enforced
- Be reasonable with request frequency

---

## SDK Examples

### Python

```python
import requests

class OpenSyncClient:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}"}
    
    def list_sessions(self, limit=50):
        r = requests.get(
            f"{self.base_url}/api/sessions",
            params={"limit": limit},
            headers=self.headers
        )
        return r.json()["sessions"]
    
    def search(self, query, search_type="hybrid", limit=20):
        r = requests.get(
            f"{self.base_url}/api/search",
            params={"q": query, "type": search_type, "limit": limit},
            headers=self.headers
        )
        return r.json()["results"]
    
    def get_context(self, query, limit=5):
        r = requests.get(
            f"{self.base_url}/api/context",
            params={"q": query, "limit": limit, "format": "text"},
            headers=self.headers
        )
        return r.json()["text"]

# Usage
client = OpenSyncClient("osk_xxx", "https://your-project.convex.site")
sessions = client.list_sessions()
context = client.get_context("how to handle auth errors")
```

### JavaScript/TypeScript

```typescript
class OpenSyncClient {
  constructor(private apiKey: string, private baseUrl: string) {}

  private async request(path: string, params?: Record<string, string>) {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return res.json();
  }

  async listSessions(limit = 50) {
    return this.request("/api/sessions", { limit: String(limit) });
  }

  async search(query: string, type = "hybrid", limit = 20) {
    return this.request("/api/search", { q: query, type, limit: String(limit) });
  }

  async getContext(query: string, limit = 5) {
    const data = await this.request("/api/context", {
      q: query,
      limit: String(limit),
      format: "text",
    });
    return data.text;
  }
}
```

---

## Sync Endpoints (Plugin Use)

These endpoints are used by the opencode-sync-plugin. You typically don't call them directly.

```
POST /sync/session   # Create/update session
POST /sync/message   # Create/update message
POST /sync/batch     # Batch sync
```
