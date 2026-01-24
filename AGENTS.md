# OpenSync (Pocketbase Edition)

AI coding session dashboard with self-hosted Pocketbase backend.

## Quick Reference

| Item | Value |
|------|-------|
| Local Dev | `~/repos/opensync-pocketbase` |
| Branch | `feature/pocketbase-migration` |
| Pocketbase | `:8090` (dev), TBD (prod) |
| Vite | `:5173` |
| Prod URL | https://opensync.helmus.me |
| Auth | Authelia (pass-through headers) |

## Project Status

**Migration in progress** from Convex (cloud) to Pocketbase (self-hosted).

See `POCKETBASE_MIGRATION.md` for:
- Full migration plan
- Data schema
- Open questions
- Progress tracking

## Development

### Prerequisites

- Node.js 18+
- Pocketbase binary (download from https://pocketbase.io/docs/)

### Start Dev Environment

```bash
# Terminal 1: Pocketbase
./pocketbase serve

# Terminal 2: Vite
npm install
npm run dev -- --host
```

### Pocketbase Admin

Access at http://localhost:8090/_/

## Architecture

```
Browser -> Authelia -> Vite:5173 -> Pocketbase:8090
                                 -> OpenAI (embeddings)
```

### Key Directories

| Path | Purpose |
|------|---------|
| `src/` | React frontend |
| `src/lib/` | Pocketbase client, auth context |
| `src/pages/` | Dashboard, Settings, etc. |
| `pb_data/` | Pocketbase SQLite database |
| `pb_hooks/` | Pocketbase server hooks (if needed) |

### Data Collections

| Collection | Description |
|------------|-------------|
| `users` | User accounts (linked to Authelia) |
| `sessions` | Coding sessions from OpenCode/Claude |
| `messages` | Messages within sessions |
| `parts` | Message parts (code blocks, tool calls) |
| `sessionEmbeddings` | Vector embeddings for semantic search |
| `messageEmbeddings` | Per-message embeddings |
| `apiLogs` | API access logs |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/pocketbase.ts` | Pocketbase client setup |
| `src/lib/auth.tsx` | Authelia auth context |
| `src/pages/Dashboard.tsx` | Main dashboard |
| `vite.config.ts` | Dev server config, `/api/me` endpoint |

## Sync Plugin

The OpenCode sync plugin sends sessions to the dashboard.

**Config location:** `~/.opensync/credentials.json`

```bash
# Verify setup
opencode-sync verify
opencode-sync status
```

## Common Tasks

### Add a new collection

1. Open Pocketbase admin: http://localhost:8090/_/
2. Create collection with fields
3. Update TypeScript types in `src/lib/types.ts`

### Reset local database

```bash
rm -rf pb_data
./pocketbase serve  # Creates fresh database
```

### Run in production (homelab)

```bash
ssh homelab
cd ~/opensync
./pocketbase serve &  # Or systemd service
npm run dev -- --host
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | Check if Pocketbase and Vite are running |
| "Not authenticated" | Verify Authelia headers passing through |
| Empty dashboard | Check browser console for Pocketbase errors |
| CORS errors | Configure allowed origins in Pocketbase settings |

### Check Pocketbase logs

```bash
# Logs are in pb_data/logs/
tail -f pb_data/logs/*.log
```

## Git Workflow

```bash
# Work on migration
git checkout feature/pocketbase-migration

# Commit changes
git add .
git commit -m "feat: description"

# Push to fork
git push origin feature/pocketbase-migration

# When ready, merge to main and deploy to homelab
```

## Related Docs

- `POCKETBASE_MIGRATION.md` - Migration plan and progress
- `HOMELAB_SETUP.md` - Homelab deployment details (on homelab)
