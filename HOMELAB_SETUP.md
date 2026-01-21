# OpenSync Homelab Setup

This document covers running OpenSync on a homelab with Authelia authentication, Cloudflare Tunnel, and Traefik reverse proxy.

## Architecture

```
Browser → Cloudflare Tunnel → Traefik → Authelia → Vite Dev Server → Convex Cloud
                                ↓
                         authelia-file middleware
                         (redirects to auth if not logged in)
```

## Prerequisites

- Node.js 22+ installed
- Cloudflare Tunnel routing your domain to Traefik
- Traefik reverse proxy with cert resolver
- Authelia running with `authelia-file` middleware configured

## Quick Start

```bash
# 1. Clone and install
cd ~
git clone https://github.com/Skeptomenos/opensync.git
cd opensync
npm install

# 2. Set your email in Convex
npx convex env set DEFAULT_USER_EMAIL your@email.com

# 3. Start Convex (creates .env.local on first run)
npx convex dev

# 4. Start Vite dev server
npm run dev -- --host
```

Then visit your OpenSync URL - Authelia will prompt for login.

---

## Detailed Setup

### 1. Clone and Install

```bash
cd ~
git clone https://github.com/Skeptomenos/opensync.git
cd opensync
npm install
```

### 2. Convex Backend Setup

```bash
# Set your user email
npx convex env set DEFAULT_USER_EMAIL your@email.com

# Start dev server
npx convex dev
```

Follow prompts to create a new Convex project. This creates `.env.local` with:
- `CONVEX_DEPLOYMENT` - your deployment name
- `VITE_CONVEX_URL` - your Convex cloud URL

### 3. Traefik Configuration

Create a Traefik dynamic config file (e.g., `opensync.yml`):

```yaml
# OpenSync - Dashboard for OpenCode/Claude Code sessions
http:
  routers:
    opensync:
      rule: "Host(`opensync.yourdomain.com`)"
      entryPoints:
        - "websecure"
      service: "opensync"
      middlewares:
        - "authelia-file"
      tls:
        certResolver: "letsencrypt"

  services:
    opensync:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:5173"
```

**Important:** The `authelia-file` middleware must be defined elsewhere. It looks like:

```yaml
middlewares:
  authelia-file:
    forwardAuth:
      address: "http://authelia:9091/api/authz/forward-auth"
      trustForwardHeader: true
      authResponseHeaders:
        - "Remote-User"
        - "Remote-Groups"
        - "Remote-Name"
        - "Remote-Email"
```

### 4. Verify Configuration

Traefik auto-reloads config. Verify:

```bash
# Check Traefik loaded the config
docker logs traefik 2>&1 | grep -i opensync

# Test auth redirect (should get 302 to auth)
curl -sI https://opensync.yourdomain.com | head -5
```

### 5. Start Services

**Terminal 1 - Convex:**
```bash
cd ~/opensync && npx convex dev
```

**Terminal 2 - Vite:**
```bash
cd ~/opensync && npm run dev -- --host
```

### 6. Access

Visit your OpenSync URL:
1. Authelia prompts for login
2. After login, redirects back to OpenSync dashboard
3. Dashboard loads with your user context

---

## Authentication Details

### How It Works

1. **Traefik** receives request to your OpenSync domain
2. **authelia-file middleware** checks if user is authenticated
3. If not → redirects to Authelia for login
4. If yes → forwards request with headers:
   - `Remote-Email`: user email
   - `Remote-Name`: user display name
   - `Remote-Groups`: user groups
5. **Vite dev server** has `/api/me` endpoint that returns these headers
6. **React app** calls `/api/me` to get user info
7. **Convex queries** use `DEFAULT_USER_EMAIL` env var for single-user mode

### Single-User Mode

The Convex backend runs in single-user mode:
- All queries use `DEFAULT_USER_EMAIL` environment variable
- No per-request authentication to Convex (it cannot see Authelia headers)
- API keys still work for sync plugins

**To change the default user email:**
```bash
npx convex env set DEFAULT_USER_EMAIL new@email.com
```

---

## Key Files

```
~/opensync/.env.local                              - Convex URL (auto-generated)
~/opensync/.env.example                            - Example environment variables
~/opensync/vite.config.ts                          - Vite config with /api/me endpoint
~/opensync/src/main.tsx                            - React entry with AutheliaAuthProvider
~/opensync/src/lib/auth.tsx                        - Authelia auth context (reads /api/me)
~/opensync/src/App.tsx                             - Routes - / redirects to /dashboard
```

---

## Troubleshooting

**403 from Vite**
- Cause: `allowedHosts` not set
- Fix: Add `server.allowedHosts: true` to `vite.config.ts`

**404 from Traefik**
- Cause: YAML parse error
- Fix: Check backticks in Host rule; verify with `docker logs traefik`

**No auth redirect**
- Cause: Middleware not applied
- Fix: Verify `authelia-file` in router middlewares list

**Dashboard blank/black**
- Cause: Convex errors
- Fix: Check browser console; verify Convex dev server running

**"Not authenticated" errors in Convex**
- Cause: DEFAULT_USER_EMAIL not set
- Fix: Run `npx convex env set DEFAULT_USER_EMAIL your@email.com`

**Infinite loading**
- Cause: `/api/me` failing
- Fix: Check Vite logs; ensure running with `--host`

### Check Logs

```bash
# Traefik
docker logs traefik 2>&1 | tail -50

# Browser console
# F12 → Console tab
```

---

## Reverting to WorkOS Auth

If you need to restore WorkOS authentication:

1. Restore git files from upstream:
   ```bash
   git fetch upstream
   git checkout upstream/main -- src/main.tsx src/lib/auth.tsx src/App.tsx src/pages/Login.tsx vite.config.ts
   git checkout upstream/main -- convex/users.ts convex/analytics.ts convex/evals.ts convex/rag.ts convex/search.ts convex/sessions.ts
   ```

2. Remove authelia middleware from Traefik config

3. Add WorkOS env vars to `.env.local`:
   ```bash
   VITE_WORKOS_CLIENT_ID=client_XXXXXXXXXX
   VITE_REDIRECT_URI=https://opensync.yourdomain.com/callback
   ```

4. Configure redirect URI in WorkOS Dashboard

---

## Running as a Service (Optional)

For persistent running, use tmux:

```bash
# Start new session
tmux new-session -d -s opensync

# Start Convex in first window
tmux send-keys -t opensync "cd ~/opensync && npx convex dev" Enter

# Create second window for Vite
tmux new-window -t opensync
tmux send-keys -t opensync "cd ~/opensync && npm run dev -- --host" Enter

# Attach to see logs
tmux attach -t opensync
```

Detach with `Ctrl+B, D`. Reattach with `tmux attach -t opensync`.

---

## Sync Plugin Setup

The sync plugin sends OpenCode sessions to the dashboard in real-time.

### On Client Machines

**Install plugin:**
```bash
npm install -g opencode-sync-plugin
```

**Create credentials file** (`~/.opensync/credentials.json`):
```json
{
  "convexUrl": "https://YOUR_DEPLOYMENT.convex.cloud",
  "apiKey": "osk_YOUR_API_KEY"
}
```

**Add to opencode.json:**
```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

**Verify setup:**
```bash
opencode-sync verify
opencode-sync status
```

### Generate API Key

```bash
cd ~/opensync && npx convex run users:generateApiKey
```

### Test Connectivity

```bash
opencode-sync sync  # Creates test session
```

---

## GitHub Repository

| Remote | URL |
|--------|-----|
| origin (fork) | git@github.com:Skeptomenos/opensync.git |
| upstream (original) | https://github.com/waynesutton/opensync.git |

**Pull upstream updates:**
```bash
git fetch upstream
git merge upstream/main
```

**Push changes to fork:**
```bash
git push origin main
```
