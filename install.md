# opensync

> Cloud-synced dashboards for OpenCode and Claude coding sessions

I want you to set up OpenSync for me. Execute all the steps below autonomously.

OBJECTIVE: Deploy a self-hosted OpenSync instance with Convex backend, WorkOS auth, and local development server.

DONE WHEN: You have the dashboard running locally at http://localhost:5173 and can log in with WorkOS authentication.

## TODO

- [ ] Clone the repository and install dependencies
- [ ] Set up a Convex project and deploy the schema
- [ ] Configure WorkOS authentication
- [ ] Set up OpenAI API key for embeddings
- [ ] Configure environment variables
- [ ] Run the development server
- [ ] Verify login and basic functionality

## Prerequisites

You need:
- Node.js 18+ installed
- npm or bun package manager
- Git

You will need accounts at (create during setup if needed):
- Convex (free tier): https://convex.dev
- WorkOS (free up to 1M MAUs): https://workos.com
- OpenAI: https://platform.openai.com

## Clone and Install

```bash
git clone https://github.com/waynesutton/opensync.git
cd opensync
npm install
```

## Set Up Convex

Initialize and deploy the Convex backend:

```bash
npx convex dev
```

This will:
- Prompt you to log in (first time)
- Ask you to create or select a project
- Deploy the schema and functions
- Start watching for changes

Keep this terminal running. Note your deployment URL (e.g., `https://happy-animal-123.convex.cloud`).

## Set Up WorkOS

1. Go to https://dashboard.workos.com and create a project
2. Enable **Email + Password** authentication in the Authentication section
3. Add redirect URIs in the Redirects section:

```
http://localhost:5173/callback
```

4. Copy your **Client ID** (`client_xxxxx`) from API Keys

## Set Up OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy it (you won't see it again)

This is used for generating embeddings for semantic search.

## Configure Convex Environment Variables

In the Convex dashboard (https://dashboard.convex.dev):

1. Select your project
2. Go to Settings > Environment Variables
3. Add these variables:

| Name | Value |
|------|-------|
| OPENAI_API_KEY | sk-xxxxx (your OpenAI key) |
| WORKOS_CLIENT_ID | client_xxxxx (your WorkOS client ID) |

## Create Local Environment File

Create `.env` in the project root:

```bash
VITE_CONVEX_URL=https://your-project-123.convex.cloud
VITE_WORKOS_CLIENT_ID=client_xxxxx
VITE_REDIRECT_URI=http://localhost:5173/callback
```

Replace with your actual values from above.

## Run the Development Server

In a second terminal (keep Convex dev running):

```bash
npm run dev
```

Open http://localhost:5173

## Verify Installation

1. You should see the OpenSync login page
2. Click "Get Started" to sign in with WorkOS
3. After login, you should see the empty dashboard
4. Go to Settings and generate an API key

## Install a Sync Plugin (Optional)

To sync sessions from your coding tools:

**For OpenCode:**
```bash
npm install -g opencode-sync-plugin
opencode-sync login
```

**For Claude Code:**
```bash
npm install -g claude-code-sync
claude-code-sync login
```

Enter your Convex URL and API key when prompted.

## Production Deployment (Optional)

To deploy to Netlify:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Or connect your GitHub repo to Netlify for automatic deployments.

Remember to:
- Add production redirect URI to WorkOS (e.g., `https://your-domain.com/callback`)
- Set environment variables in Netlify dashboard:
  - `VITE_CONVEX_URL`
  - `VITE_WORKOS_CLIENT_ID`
  - `VITE_REDIRECT_URI` (production URL)

## Troubleshooting

### "Invalid token" errors
- Verify `WORKOS_CLIENT_ID` is set correctly in Convex environment variables
- Redeploy: `npx convex deploy`

### Sessions not appearing
- Check plugin is authenticated: `opencode-sync status` or `claude-code-sync status`
- Check Convex dashboard logs for errors

### Semantic search not working
- Verify `OPENAI_API_KEY` is set in Convex environment variables
- Embeddings generate asynchronously, wait a minute

EXECUTE NOW: Complete the above TODO list to achieve: Dashboard running locally with WorkOS authentication working.

---

> If you need more context about this project, see the llms.txt file at: https://www.opensync.dev/llms.txt
