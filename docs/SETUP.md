# OpenSync Setup Guide

Deploy your own OpenSync instance using Convex Cloud.

## Prerequisites

- Node.js 18+
- npm or bun
- Git

## Accounts Needed

| Service | Purpose | Link |
|---------|---------|------|
| Convex | Backend database and functions | [convex.dev](https://convex.dev) (free tier available) |
| WorkOS | Authentication | [workos.com](https://workos.com) (free for up to 1M MAUs) |
| OpenAI | Embeddings for semantic search | [platform.openai.com](https://platform.openai.com) |

## Step 1: Clone and Install

```bash
git clone https://github.com/your-org/opencode-sync.git
cd opencode-sync
npm install
```

## Step 2: Set Up Convex

### Create a Convex Account

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev)
2. Sign up with GitHub or Google
3. Create a new project, name it "opencode-sync" or similar

### Initialize Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in (first time)
- Ask you to select or create a project
- Deploy your schema and functions
- Start watching for changes

Keep this running in a terminal during development.

### Get Your Convex URL

From the Convex dashboard, copy your deployment URL. It looks like:

```
https://happy-animal-123.convex.cloud
```

## Step 3: Set Up WorkOS

### Create a WorkOS Application

1. Go to [dashboard.workos.com](https://dashboard.workos.com)
2. Sign up or log in
3. Create a new project

### Enable Authentication

1. Go to **Authentication** in the sidebar
2. Enable **Email + Password** (and/or other methods)

### Configure Redirects

1. Go to **Redirects** in the sidebar
2. Add these redirect URIs:

For development:
```
http://localhost:5173/callback
http://localhost:9876/callback
```

For production (add after deploying):
```
https://your-domain.com/callback
```

### Get Your Credentials

From the WorkOS dashboard, copy:

- **Client ID**: `client_xxxxx` (found in API Keys)
- **API Key**: `sk_xxxxx` (only needed for backend, not currently used)

## Step 4: Set Up OpenAI

### Get an API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy it (you won't see it again)

This is used for generating embeddings for semantic search.

## Step 5: Configure Environment Variables

### Convex Environment Variables

In the [Convex dashboard](https://dashboard.convex.dev):

1. Select your project
2. Go to **Settings** > **Environment Variables**
3. Add:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | `sk-xxxxx` |
| `WORKOS_CLIENT_ID` | `client_xxxxx` |

### Local Environment Variables

Create `.env` in the project root:

```bash
VITE_CONVEX_URL=https://your-project-123.convex.cloud
VITE_WORKOS_CLIENT_ID=client_xxxxx
VITE_REDIRECT_URI=http://localhost:5173/callback
```

## Step 6: Update Auth Config

Edit `convex/auth.config.ts`:

```typescript
export default {
  providers: [
    {
      domain: "https://api.workos.com/",
      applicationID: "client_YOUR_CLIENT_ID", // Replace with your Client ID
    },
  ],
};
```

Then redeploy:

```bash
npx convex deploy
```

## Step 7: Run the Development Server

In one terminal:
```bash
npx convex dev
```

In another terminal:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Step 8: Deploy the Web UI

### Option A: Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard:
- `VITE_CONVEX_URL`
- `VITE_WORKOS_CLIENT_ID`
- `VITE_REDIRECT_URI` (update to production URL)

### Option B: Netlify

```bash
npm run build
```

Deploy the `dist` folder to Netlify. Set environment variables in Netlify dashboard.

### Option C: Any Static Host

Build and deploy `dist` to any static hosting (Cloudflare Pages, GitHub Pages, S3, etc.).

### Update WorkOS Redirects

After deployment, add your production URL to WorkOS redirects:
```
https://your-domain.com/callback
```

## Step 9: Install the Plugin

In a new terminal (as a user of your deployment):

```bash
npm install -g opencode-sync-plugin
opencode-sync login
```

Enter:
- **Convex URL**: Your deployment URL (e.g., `https://your-project-123.convex.cloud`)
- **WorkOS Client ID**: Your client ID (e.g., `client_xxxxx`)

Complete authentication in the browser.

## Step 10: Test the Integration

1. Create `opencode.json` in a test project:
```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

2. Start an OpenCode session
3. Have a conversation
4. Check the web UI - your session should appear

## Troubleshooting

### "Invalid token" errors

1. Verify `WORKOS_CLIENT_ID` is set correctly in Convex environment variables
2. Verify `auth.config.ts` has the correct client ID
3. Redeploy: `npx convex deploy`

### Sessions not appearing

1. Check plugin is authenticated: `opencode-sync status`
2. Check Convex dashboard logs for errors
3. Verify the plugin is listed in `opencode.json`

### Semantic search not working

1. Verify `OPENAI_API_KEY` is set in Convex environment variables
2. Check Convex logs for embedding generation errors
3. Wait a minute - embeddings generate asynchronously

### CORS errors

Convex handles CORS automatically. If you see CORS errors:
1. Make sure you're using the correct Convex URL
2. Check the browser console for the actual error

## Architecture Details

### Data Flow

```
OpenCode Session
       │
       ▼
Plugin (JWT Auth)
       │
       ▼
Convex HTTP Endpoints
       │
       ├──▶ sessions table
       ├──▶ messages table
       ├──▶ parts table
       └──▶ sessionEmbeddings table (async)
                    │
                    │ OpenAI API
                    ▼
              Vector Index
```

### Tables

| Table | Purpose |
|-------|---------|
| users | WorkOS identity mapping, API keys |
| sessions | OpenCode sessions |
| messages | Messages within sessions |
| parts | Content parts (text, tool calls) |
| sessionEmbeddings | Vector embeddings for semantic search |
| apiLogs | API access audit trail |

### Indexes

| Index | Type | Purpose |
|-------|------|---------|
| search_sessions | Full-text | Keyword search on sessions |
| search_messages | Full-text | Keyword search on messages |
| by_embedding | Vector | Semantic search |

## Production Checklist

- [ ] Convex project created
- [ ] Schema deployed
- [ ] Environment variables set (OPENAI_API_KEY, WORKOS_CLIENT_ID)
- [ ] WorkOS redirects configured (including production URL)
- [ ] Auth config updated with correct client ID
- [ ] Web UI deployed
- [ ] Plugin published or shared with users
- [ ] Test end-to-end flow

## Resources

| Resource | URL |
|----------|-----|
| Convex Dashboard | https://dashboard.convex.dev |
| WorkOS Dashboard | https://dashboard.workos.com |
| Convex Docs | https://docs.convex.dev |
| Convex Vector Search | https://docs.convex.dev/search/vector-search |
| Convex Full-Text Search | https://docs.convex.dev/search/text-search |
| WorkOS User Management | https://workos.com/docs/user-management |
| OpenAI Embeddings | https://platform.openai.com/docs/guides/embeddings |
