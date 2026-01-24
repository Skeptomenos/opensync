# OpenSync: Convex to Pocketbase Migration

## Overview

Migrate OpenSync from Convex (cloud backend) to Pocketbase (self-hosted) to eliminate dependency on paid cloud services and gain full data control.

**Migration Branch:** `feature/pocketbase-migration`

---

## Current State

### Why Migrate?

Convex free tier limits exceeded, causing:
- Dashboard loads briefly then blacks out
- All backend queries fail with: `You have exceeded the free plan limits, so your deployments have been disabled`
- React components crash when `users:me` and `users:getOrCreate` queries fail

### Codebase Metrics

| Metric | Value |
|--------|-------|
| Total TypeScript/TSX | ~12,000 lines |
| Convex backend files | 12 files (~163KB) |
| Frontend Convex hooks | 43 useQuery/useMutation/useAction calls |
| Files using Convex | 7 frontend files |

### Convex Backend Files

```
convex/
├── analytics.ts    (19KB)  - Usage analytics queries
├── api.ts          (22KB)  - External API endpoints
├── auth.config.ts  (1KB)   - Auth configuration
├── convex.config.ts(1KB)   - Convex config
├── embeddings.ts   (13KB)  - Vector embedding generation
├── evals.ts        (19KB)  - Session evaluation features
├── http.ts         (14KB)  - HTTP route handlers
├── messages.ts     (14KB)  - Message CRUD operations
├── rag.ts          (3KB)   - RAG search functionality
├── schema.ts       (5KB)   - Data schema definition
├── search.ts       (26KB)  - Search functionality
├── sessions.ts     (21KB)  - Session CRUD operations
├── users.ts        (10KB)  - User management
└── _generated/     - Auto-generated types
```

### Frontend Files Using Convex

```
src/
├── components/SessionViewer.tsx  (4 hooks)
├── pages/Context.tsx             (5 hooks)
├── pages/Dashboard.tsx           (19 hooks)
├── pages/Evals.tsx               (5 hooks)
├── pages/PublicSession.tsx       (2 hooks)
├── pages/Settings.tsx            (8 hooks)
└── (Total: 43 hooks)
```

---

## Data Schema

### Tables to Migrate

#### 1. users
```typescript
{
  workosId: string,           // Will become autheliaId
  email: string?,
  name: string?,
  avatarUrl: string?,
  profilePhotoId: string?,    // Legacy, optional
  apiKey: string?,
  apiKeyCreatedAt: number?,
  enabledAgents: string[]?,
  createdAt: number,
  updatedAt: number,
}
// Indexes: by_workos_id, by_email, by_api_key
```

#### 2. sessions
```typescript
{
  userId: Id<"users">,
  externalId: string,
  title: string?,
  projectPath: string?,
  projectName: string?,
  model: string?,
  provider: string?,
  source: string?,            // "opencode" or "claude-code"
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  cost: number,
  durationMs: number?,
  isPublic: boolean,
  publicSlug: string?,
  searchableText: string?,
  summary: string?,
  messageCount: number,
  evalReady: boolean?,
  reviewedAt: number?,
  evalNotes: string?,
  evalTags: string[]?,
  createdAt: number,
  updatedAt: number,
}
// Indexes: by_user, by_user_updated, by_external_id, by_user_external, 
//          by_public_slug, by_user_source, by_user_eval_ready
// Full-text search: searchableText (filtered by userId)
```

#### 3. messages
```typescript
{
  sessionId: Id<"sessions">,
  externalId: string,
  role: "user" | "assistant" | "system" | "unknown",
  textContent: string?,
  model: string?,
  promptTokens: number?,
  completionTokens: number?,
  durationMs: number?,
  createdAt: number,
}
// Indexes: by_session, by_session_created, by_external_id
// Full-text search: textContent (filtered by sessionId)
```

#### 4. parts
```typescript
{
  messageId: Id<"messages">,
  type: string,
  content: any,              // JSON blob
  order: number,
}
// Indexes: by_message
```

#### 5. sessionEmbeddings
```typescript
{
  sessionId: Id<"sessions">,
  userId: Id<"users">,
  embedding: number[],       // 1536 dimensions (OpenAI text-embedding-3-small)
  textHash: string,
  createdAt: number,
}
// Vector index: 1536 dimensions, filtered by userId
```

#### 6. messageEmbeddings
```typescript
{
  messageId: Id<"messages">,
  sessionId: Id<"sessions">,
  userId: Id<"users">,
  embedding: number[],       // 1536 dimensions
  textHash: string,
  createdAt: number,
}
// Vector index: 1536 dimensions, filtered by userId
```

#### 7. apiLogs
```typescript
{
  userId: Id<"users">,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  createdAt: number,
}
// Indexes: by_user, by_user_created
```

---

## Vector Search Considerations

### Current Implementation
- Uses OpenAI `text-embedding-3-small` (1536 dimensions)
- 1 embedding per session + 1 per message
- Estimated vectors: ~20 per session (1 session + ~19 messages avg)

### Capacity Planning

| Usage | Sessions | Vectors (with messages) |
|-------|----------|------------------------|
| 1 year heavy use | 3,650 | ~73,000 |
| 100k vector limit | ~5,000 | 100,000 |

### Pocketbase Vector Search Options

1. **Brute-force in SQLite** (recommended for <100k vectors)
   - Store embeddings as JSON array or BLOB
   - Calculate cosine similarity in application code
   - Sub-100ms for single-user workloads

2. **sqlite-vss extension** (if needed later)
   - Native vector similarity search
   - Requires compilation/installation

3. **Separate service** (overkill for this use case)
   - Qdrant, Milvus, etc.

**Recommendation:** Start with brute-force, optimize later if needed.

---

## Authentication

### Current Flow
```
Browser -> Authelia -> Vite -> reads X-Remote-User header -> Convex
```

### New Flow
```
Browser -> Authelia -> Vite -> reads X-Remote-User header -> Pocketbase
```

Pocketbase auth options:
1. **Use Pocketbase auth** - Has built-in user management
2. **Pass-through Authelia headers** - Create/lookup user by email from header
3. **API key only** - For plugin sync, skip user auth in UI

**Recommendation:** Option 2 - Keep Authelia, lookup/create Pocketbase user by email header.

---

## Migration Plan

### Phase 1: Setup Pocketbase
- [ ] Download Pocketbase binary for Linux (homelab) and macOS (dev)
- [ ] Create `pb_data` directory structure
- [ ] Define collections matching schema above
- [ ] Configure CORS for Vite dev server
- [ ] Test admin UI at `/_/`

### Phase 2: Create API Layer
- [ ] Set up Pocketbase hooks (`pb_hooks`) for:
  - `POST /api/sync/session`: Sync endpoint for plugin (upsert session)
  - `POST /api/sync/message`: Sync endpoint for messages (upsert)
  - `POST /api/sync/batch`: Batch sync endpoint for efficiency
  - `GET /api/me`: Auth sync endpoint (lookup/create user from header)
- [ ] Implement Vector Search Strategy:
  - **Initial:** Brute-force cosine similarity via JS hook (fetch vectors -> compute -> sort)
  - **Future:** SQLite extension if performance drops
- [ ] Implement Analytics Strategy:
  - **Initial:** Client-side aggregation in `src/lib/analytics.ts` (fetch sessions -> reduce).
  - **Reasoning:** Pocketbase aggregation queries are limited; dataset is currently small enough (<10k sessions).

### Phase 3: Migrate Frontend
- [ ] Install `pocketbase` SDK
- [ ] Create `src/lib/pocketbase.ts`:
  - Initialize `PocketBase` client
  - Implement `usePocketBase` hook
  - Implement `useAuthSync` hook (calls `/api/me` and sets PB auth store)
- [ ] Refactor Hooks (`useQuery` replacement):
  - Create `src/hooks/useSessions.ts`: `getList` + realtime subscription
  - Create `src/hooks/useSession.ts`: `getOne` + relation expansion
- [ ] Migrate Components:
  - `src/components/SessionViewer.tsx`: Move Markdown generation logic here (client-side)
  - `src/pages/Dashboard.tsx`: Switch to client-side analytics calculation
  - `src/pages/Context.tsx`: Update to use new Search API hook
- [ ] Update Types:
  - Create `src/lib/types.ts` matching Pocketbase schema (using `RecordModel`)

### Phase 4: Migrate Sync Plugin
- [ ] Update `opencode-sync-plugin` to POST to Pocketbase API
- [ ] Update API key validation logic
- [ ] Test session sync end-to-end

### Phase 5: Cleanup Features (New)
- [ ] Add bulk delete UI for sessions
- [ ] Add filters: "< N messages", "no title", "zero cost"
- [ ] Add storage stats dashboard
- [ ] Add auto-cleanup rules (optional)

### Phase 6: Deploy
- [ ] Run Pocketbase as systemd service or Docker container
- [ ] Update Traefik config if needed
- [ ] Remove Convex dependencies
- [ ] Update AGENTS.md

---

## Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Data migration? | **Start fresh** | Convex is disabled and data unrecoverable. Clean slate. |
| 2 | Pocketbase deployment? | **Systemd service** | Simpler ops, single binary, no container overhead. |
| 3 | Vector search priority? | **Defer to post-MVP** | Core dashboard must work first. Brute-force viable for <100k vectors. |
| 4 | Realtime requirements? | **Benchmark in Phase 2** | Test PB subscriptions before committing to page migration. |
| 5 | Plugin compatibility? | **Version bump required** | Plugin v2.0 for Pocketbase. Document migration for users. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pocketbase realtime slower than Convex | Medium | High | Benchmark in Phase 2 before page migration; fall back to polling if needed |
| Plugin sync breaks during migration | High | Medium | Version plugin to v2.0; document upgrade path; old plugin fails gracefully |
| SQLite performance with large datasets | Low | Medium | Monitor query times; add indexes proactively; sqlite-vss as escape hatch |
| Auth header pass-through fails | Low | High | Test in Phase 2; Pocketbase has fallback auth options |
| Partial migration leaves app broken | Medium | High | Keep Convex code until Phase 7; feature flag if needed |
| Vector search brute-force too slow | Low | Low | Deferred feature; sqlite-vss or external service if needed later |

---

## Files to Delete After Migration

```
convex/                    # Entire directory
src/lib/convex.ts          # Convex client setup (if exists)
```

## Dependencies to Remove

```json
{
  "convex": "^x.x.x",
  "@convex-dev/auth": "^x.x.x"
}
```

## Dependencies to Add

```json
{
  "pocketbase": "^0.21.x"
}
```

---

## References

- [Pocketbase Documentation](https://pocketbase.io/docs/)
- [Pocketbase JS SDK](https://github.com/pocketbase/js-sdk)
- [OpenSync GitHub (fork)](https://github.com/Skeptomenos/opensync)
- [OpenSync GitHub (upstream)](https://github.com/waynesutton/opensync)

---

## Quick Start (After Migration)

```bash
# Development
cd ~/repos/opensync-pocketbase
./pocketbase serve &          # Start Pocketbase on :8090
npm run dev -- --host         # Start Vite on :5173

# Production (homelab)
ssh homelab
cd ~/opensync
./pocketbase serve &          # Or use systemd
npm run dev -- --host
```

---

*Document created: 2026-01-22*
*Last updated: 2026-01-22*
