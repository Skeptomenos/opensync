# OpenSync (Pocketbase Edition)

Dashboards for OpenCode and Claude coding sessions - self-hosted with Pocketbase backend and Authelia authentication.

> This is a fork of [waynesutton/opensync](https://github.com/waynesutton/opensync) modified for homelab self-hosting with Pocketbase (replacing Convex) and Authelia SSO (replacing WorkOS).

## What's Different in This Fork

| Feature | Upstream | This Fork |
|---------|----------|-----------|
| Backend | Convex (cloud) | Pocketbase (self-hosted) |
| Authentication | WorkOS (paid) | Authelia (free, self-hosted) |
| User Mode | Multi-tenant | Single-user (homelab) |
| Hosting | Netlify + Convex Cloud | Traefik + Pocketbase |
| Auth Flow | Client-side OAuth | Reverse proxy headers |
| Data Storage | Cloud (Convex) | Local SQLite (Pocketbase) |

## Quick Start

```bash
cd ~/opensync-pocketbase

# Terminal 1: Start Pocketbase
./bin/pocketbase serve

# Terminal 2: Start Vite
npm install
npm run dev -- --host
```

Access at `https://opensync.yourdomain.com` (Authelia login required)

## Architecture

```
Browser → Cloudflare Tunnel → Traefik → Authelia → Vite:5173 → Pocketbase:8090
```

### Components

- **Pocketbase** - SQLite-based backend with REST API and realtime subscriptions
- **Vite** - React frontend dev server with API middleware
- **Authelia** - SSO authentication via reverse proxy headers
- **Traefik** - Reverse proxy with auth middleware

## Features

| Feature | Description |
|---------|-------------|
| Sync | Sessions sync in real time as you work |
| Search | Full-text search across sessions and messages |
| Analytics | Usage stats, cost tracking, model breakdown |
| Evals | Tag and export sessions for model evaluation |
| Export | JSON, CSV, Markdown formats |
| Delete | Full data control with bulk operations |
| Realtime | Live updates via Pocketbase SSE (~5ms P95 latency) |

## Sync Plugin Setup (v2.0)

### OpenCode Plugin

```bash
npm install -g opencode-sync-plugin
```

### Claude Code Plugin

```bash
npm install -g @anthropic/claude-code-sync
```

### Configure

Create `~/.opensync/credentials.json`:

```json
{
  "pocketbaseUrl": "https://opensync.yourdomain.com",
  "apiKey": "os_your_api_key_here"
}
```

### Generate API Key

1. Log into the OpenSync dashboard
2. Go to Settings → API Keys
3. Click "Generate API Key"
4. Copy the `os_...` key to your credentials file

### Add to Configuration

**opencode.json:**
```json
{
  "plugins": ["opencode-sync-plugin"]
}
```

**claude-code settings:**
```json
{
  "hooks": {
    "onSessionEnd": "claude-code-sync sync"
  }
}
```

### Verify

```bash
opencode-sync verify
opencode-sync status
```

See `docs/OPENCODE-PLUGIN.md` and `docs/CLAUDE-CODE-PLUGIN.md` for detailed setup.

## API Endpoints

### Sync API (Plugin Authentication)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sync/session` | Create/update session |
| POST | `/sync/message` | Create/update message |
| POST | `/sync/batch` | Batch operations |
| GET | `/sync/sessions/list` | List user's sessions |

### Read API (API Key Authentication)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/get?id=` | Get session with messages |
| GET | `/api/search?q=&type=` | Full-text search |
| GET | `/api/stats` | User statistics |
| GET | `/api/export?id=&format=` | Export data |

### Auth API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Current user (from Authelia headers) |
| GET | `/api/health` | Pocketbase health check |

## Data Collections

| Collection | Description |
|------------|-------------|
| `users` | User accounts with API keys and preferences |
| `sessions` | Coding sessions with metadata and costs |
| `messages` | Messages within sessions |
| `parts` | Message parts (code, tool calls, etc.) |
| `apiLogs` | API access logs |

## Development

### Prerequisites

- Node.js 18+
- Pocketbase binary in `bin/`

### Project Structure

```
opensync-pocketbase/
├── bin/                  # Pocketbase binary
├── pb_data/              # SQLite database
├── pb_migrations/        # Schema migrations
├── server/
│   └── sync.ts           # API endpoints
├── src/
│   ├── components/       # UI components
│   ├── hooks/            # Data hooks
│   ├── lib/              # Pocketbase client, types
│   └── pages/            # Route components
├── docs/                 # Plugin documentation
└── vite.config.ts        # Dev server config
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/pocketbase.tsx` | Pocketbase client + provider |
| `src/lib/auth.tsx` | Authelia auth context |
| `src/lib/userSync.ts` | User sync (getOrCreate) |
| `src/lib/types.ts` | TypeScript types |
| `server/sync.ts` | Sync API implementation |

### Data Hooks

| Hook | Purpose |
|------|---------|
| `useSessions` | List, filter, paginate sessions |
| `useSession` | Single session with mutations |
| `useUser` | Current user, stats, settings |
| `useSearch` | Full-text search |
| `useAnalytics` | Dashboard statistics |
| `useEvals` | Evaluation features |
| `useBulkOperations` | Multi-select operations |

## Traefik Configuration

```yaml
http:
  routers:
    opensync:
      rule: "Host(`opensync.yourdomain.com`)"
      middlewares:
        - "authelia"
      service: "opensync"
  services:
    opensync:
      loadBalancer:
        servers:
          - url: "http://localhost:5173"
```

See [HOMELAB_SETUP.md](HOMELAB_SETUP.md) for full configuration.

## Key Changes from Upstream

### Backend Migration
- Replaced Convex with Pocketbase (self-hosted SQLite)
- All 43 frontend hooks migrated to Pocketbase SDK
- Sync API endpoints in `server/sync.ts`

### Authentication
- Replaced WorkOS AuthKit with Authelia header reading
- Frontend calls `/api/me` for user info from Traefik headers
- User sync creates Pocketbase users from Authelia identity

### Frontend
- `PocketbaseProvider` replaces `ConvexProvider`
- All `useQuery`/`useMutation` hooks replaced with custom hooks
- Realtime via Pocketbase SSE subscriptions

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | Check Pocketbase and Vite are running |
| "Not authenticated" | Verify Authelia headers pass through |
| Empty dashboard | Check browser console for errors |
| CORS errors | Check Vite proxy in vite.config.ts |
| Sync fails | Verify API key format (`os_...`) |

### Check Logs

```bash
# Pocketbase logs
tail -f pb_data/logs/*.log

# Vite console
# Check terminal running npm run dev
```

## Documentation

- **Setup**: [HOMELAB_SETUP.md](HOMELAB_SETUP.md)
- **Migration Spec**: [ralph-wiggum/specs/POCKETBASE_MIGRATION.md](ralph-wiggum/specs/POCKETBASE_MIGRATION.md)
- **OpenCode Plugin**: [docs/OPENCODE-PLUGIN.md](docs/OPENCODE-PLUGIN.md)
- **Claude Code Plugin**: [docs/CLAUDE-CODE-PLUGIN.md](docs/CLAUDE-CODE-PLUGIN.md)

## Tech Stack

- [Pocketbase](https://pocketbase.io) - Self-hosted backend
- [React](https://react.dev) - UI framework
- [Vite](https://vitejs.dev) - Build tool
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [Authelia](https://www.authelia.com/) - SSO authentication
- [Traefik](https://traefik.io/) - Reverse proxy

## License

MIT (same as upstream)

---

**Upstream**: [github.com/waynesutton/opensync](https://github.com/waynesutton/opensync)
