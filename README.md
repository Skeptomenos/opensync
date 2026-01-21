# OpenSync (Authelia Fork)

Dashboards for OpenCode and Claude coding sessions - self-hosted with Authelia authentication.

> This is a fork of [waynesutton/opensync](https://github.com/waynesutton/opensync) modified for homelab self-hosting with Authelia SSO instead of WorkOS.

## What's Different in This Fork

| Feature | Upstream | This Fork |
|---------|----------|-----------|
| Authentication | WorkOS (paid for CORS) | Authelia (free, self-hosted) |
| User Mode | Multi-tenant | Single-user (homelab) |
| Hosting | Netlify + WorkOS | Traefik + Cloudflare Tunnel |
| Auth Flow | Client-side OAuth | Reverse proxy headers |

## Quick Start

```bash
cd ~/opensync

# Start services
npx convex dev          # Terminal 1
npm run dev -- --host   # Terminal 2
```

Access at `https://opensync.yourdomain.com` (Authelia login required)

## Architecture

```
Browser → Cloudflare Tunnel → Traefik → Authelia → Vite:5173 → Convex Cloud
```

## Features

All upstream features work:

| Feature | Description |
|---------|-------------|
| Sync | Sessions sync in real time as you work |
| Search | Full text search across sessions |
| Tag | Organize sessions with custom labels for evals |
| Export | DeepEval JSON, OpenAI Evals JSONL, plain text |
| Delete | Your data, your control |

## Sync Plugin Setup

**Install:**
```bash
npm install -g opencode-sync-plugin
```

**Configure** (`~/.opensync/credentials.json`):
```json
{
  "convexUrl": "https://YOUR_CONVEX_DEPLOYMENT.convex.cloud",
  "apiKey": "YOUR_API_KEY"
}
```

**Generate API key:**
```bash
npx convex run users:generateApiKey
```

**Add to opencode.json:**
```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

**Verify:**
```bash
opencode-sync verify
```

## Configuration

### Single-User Mode

This fork uses single-user mode. Set your email in the Convex files:

```typescript
// In convex/users.ts, convex/analytics.ts, etc.
const DEFAULT_USER_EMAIL = "user@example.com";
```

Update all files listed in [HOMELAB_SETUP.md](HOMELAB_SETUP.md#single-user-mode).

### Traefik Configuration

Create a route with Authelia middleware:

```yaml
http:
  routers:
    opensync:
      rule: "Host(`opensync.yourdomain.com`)"
      middlewares:
        - "authelia"
      service: "opensync"
```

See [HOMELAB_SETUP.md](HOMELAB_SETUP.md) for full Traefik config.

## Key Changes from Upstream

### Authentication (`src/lib/auth.tsx`)
- Replaced WorkOS AuthKit with Authelia header reading
- Frontend calls `/api/me` to get user info from Traefik headers

### Vite Config (`vite.config.ts`)
- Added `/api/me` middleware that returns Authelia `Remote-*` headers

### Convex Backend (`convex/*.ts`)
- Single-user mode with configurable `DEFAULT_USER_EMAIL`
- No per-request auth (Convex can't see Authelia headers)
- API keys still work for sync plugins

### Routing (`src/App.tsx`)
- Removed `/callback` route (no OAuth callback needed)
- `/` redirects to `/dashboard`

## Documentation

- **Setup & Troubleshooting**: See [HOMELAB_SETUP.md](HOMELAB_SETUP.md)
- **Upstream Docs**: [opensync.dev/docs](https://www.opensync.dev/docs)

## Upstream Sync

```bash
git fetch upstream
git merge upstream/main
# Resolve conflicts in auth-related files
git push origin main
```

## Tech Stack

- [Convex](https://convex.dev) - Backend and real-time sync
- [Authelia](https://www.authelia.com/) - SSO authentication (replaces WorkOS)
- [Traefik](https://traefik.io/) - Reverse proxy with auth middleware
- React, Vite, Tailwind - Frontend

## License

MIT (same as upstream)

---

**Upstream**: [github.com/waynesutton/opensync](https://github.com/waynesutton/opensync)
