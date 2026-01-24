# OpenSync (Pocketbase Edition)

AI coding session dashboard with self-hosted Pocketbase backend.

## Quick Reference

| Item | Value |
|------|-------|
| Local Dev | `~/repos/opensync-pocketbase` |
| Branch | `feature/pocketbase-migration` |
| Pocketbase | `:8090` (dev), `:8090` (prod) |
| Vite | `:5173` |
| Prod URL | https://opensync.helmus.me |
| Auth | Authelia (pass-through headers) |

## Project Status

**Migration complete** from Convex (cloud) to Pocketbase (self-hosted).

- Convex dependencies removed
- All 43 frontend hooks migrated to Pocketbase
- Sync API endpoints implemented
- Plugin documentation updated for v2.0

## Development

### Prerequisites

- Node.js 18+
- Pocketbase binary in `bin/` directory

### Start Dev Environment

```bash
# Terminal 1: Pocketbase
./bin/pocketbase serve

# Terminal 2: Vite
npm install
npm run dev -- --host
```

### Pocketbase Admin

Access at http://localhost:8090/_/

## Architecture

```
Browser -> Authelia -> Vite:5173 -> Pocketbase:8090
                                 -> OpenAI (embeddings, deferred)
```

### Request Flow

1. User visits `https://opensync.helmus.me`
2. Authelia authenticates, sets `Remote-Email` header
3. Vite's `/api/me` endpoint reads header, returns user info
4. Frontend calls `syncUser()` to create/lookup user in Pocketbase
5. Pocketbase SDK handles all data operations

### Key Directories

| Path | Purpose |
|------|---------|
| `src/` | React frontend |
| `src/lib/` | Pocketbase client, auth, types |
| `src/hooks/` | Data hooks (useSessions, useUser, etc.) |
| `src/pages/` | Dashboard, Settings, Context, Evals |
| `src/components/` | UI components, error boundaries |
| `server/` | Sync API endpoints (sync.ts) |
| `pb_data/` | Pocketbase SQLite database |
| `pb_migrations/` | Schema migrations |
| `bin/` | Pocketbase binary |
| `docs/` | Plugin documentation |

### Data Collections

| Collection | Description |
|------------|-------------|
| `users` | Extended auth collection with autheliaId, apiKey, enabledAgents |
| `sessions` | Coding sessions from OpenCode/Claude |
| `messages` | Messages within sessions |
| `parts` | Message parts (code blocks, tool calls) |
| `sessionEmbeddings` | Vector embeddings (deferred) |
| `messageEmbeddings` | Per-message embeddings (deferred) |
| `apiLogs` | API access logs |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/pocketbase.tsx` | Pocketbase client + provider |
| `src/lib/auth.tsx` | Authelia auth context |
| `src/lib/userSync.ts` | User sync (getOrCreate) |
| `src/lib/types.ts` | TypeScript types for all collections |
| `server/sync.ts` | Sync API endpoints |
| `vite.config.ts` | Dev server, API routing |

### Hooks

| Hook | Purpose |
|------|---------|
| `useSessions` | List sessions with filters, pagination, realtime |
| `useSession` | Single session with messages, parts, mutations |
| `useMessages` | Messages with parts expansion |
| `useUser` | Current user, stats, API key mutations |
| `useSearch` | Full-text search (sessions, messages) |
| `useAnalytics` | Dashboard stats (client-side aggregation) |
| `useEvals` | Eval sessions, tags, export |
| `useBulkOperations` | Multi-delete, export |
| `usePublicSession` | Public session by slug |

## Sync Plugin (v2.0)

The OpenCode sync plugin sends sessions to the dashboard.

**Config location:** `~/.opensync/credentials.json`

```json
{
  "pocketbaseUrl": "https://opensync.yourdomain.com",
  "apiKey": "os_abc123..."
}
```

**API Key prefix:** `os_` (Pocketbase) or `osk_` (legacy Convex)

```bash
# Verify setup
opencode-sync verify
opencode-sync status
```

See `docs/OPENCODE-PLUGIN.md` and `docs/CLAUDE-CODE-PLUGIN.md` for full setup.

## API Endpoints

### Sync Endpoints (plugin auth via API key)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sync/session` | Upsert session |
| POST | `/sync/message` | Upsert message |
| POST | `/sync/batch` | Batch upsert |
| GET | `/sync/sessions/list` | List sessions |

### Read Endpoints (API key auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/get?id=` | Single session with messages |
| GET | `/api/search?q=&type=` | Full-text search |
| GET | `/api/stats` | User statistics |
| GET | `/api/export?id=&format=` | Export (json/csv/markdown) |

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Current user from Authelia headers |
| GET | `/api/health` | Pocketbase connection check |

## Common Tasks

### Add a new collection

1. Open Pocketbase admin: http://localhost:8090/_/
2. Create collection with fields
3. Update TypeScript types in `src/lib/types.ts`
4. Create migration file in `pb_migrations/`

### Reset local database

```bash
rm -rf pb_data
./bin/pocketbase serve  # Creates fresh database
```

### Backup database

```bash
cp -r pb_data pb_data_backup_$(date +%Y%m%d)
```

### Run in production (homelab)

```bash
ssh homelab
cd ~/opensync
./bin/pocketbase serve &  # Or systemd service
npm run dev -- --host
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | Check if Pocketbase and Vite are running |
| "Not authenticated" | Verify Authelia headers passing through |
| Empty dashboard | Check browser console for Pocketbase errors |
| CORS errors | Check Vite proxy config in vite.config.ts |
| "Extension not supported" | Pocketbase binary in wrong location (use bin/) |

### Check Pocketbase logs

```bash
# Logs are in pb_data/logs/
tail -f pb_data/logs/*.log
```

### Debug sync issues

```bash
# Test sync endpoint
curl -X POST http://localhost:5173/sync/session \
  -H "Authorization: Bearer os_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"externalId": "test-123", "title": "Test"}'
```

## Git Workflow

```bash
# Current branch
git branch  # feature/pocketbase-migration

# Commit changes
git add .
git commit -m "feat: description"

# Push
git push origin feature/pocketbase-migration

# Tags follow: v1.3.0-pb.N
git tag -a v1.3.0-pb.31 -m "docs: update AGENTS.md for Pocketbase"
git push origin v1.3.0-pb.31
```

## Related Docs

- `ralph-wiggum/specs/POCKETBASE_MIGRATION.md` - Migration spec
- `ralph-wiggum/code/plan.md` - Implementation progress
- `docs/OPENCODE-PLUGIN.md` - OpenCode plugin v2.0
- `docs/CLAUDE-CODE-PLUGIN.md` - Claude Code plugin v2.0
- `HOMELAB_SETUP.md` - Homelab deployment details

## Operational Notes

- Analytics computed client-side (single fetch, multi-compute) due to Pocketbase aggregation limits
- Realtime subscriptions use SSE with P95 latency ~5ms
- Vector search deferred to post-MVP (brute-force viable for <100k vectors)
- User sync uses deterministic password derived from email hash for PB auth lookup
