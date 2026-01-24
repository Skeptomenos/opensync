# Implementation Plan: Pocketbase Migration

**Status:** In Progress
**Spec:** `ralph-wiggum/specs/POCKETBASE_MIGRATION.md`
**Branch:** `feature/pocketbase-migration`

---

## Tasks

| Status | Task | Est. | Acceptance Criteria |
|--------|------|------|---------------------|
| | **Phase 1: Pocketbase Setup (~2h)** | | |
| [x] | **1.1**: Download Pocketbase binary (macOS + Linux) | 15m | `./pocketbase serve` starts, admin UI at `:8090/_/` |
| [x] | **1.2**: Create `users` collection with schema + indexes | 15m | Extended built-in auth collection with custom fields: autheliaId, avatarUrl, profilePhotoId, apiKey, apiKeyCreatedAt, enabledAgents. Added indexes on autheliaId and apiKey. |
| [x] | **1.3**: Create `sessions` collection with schema + indexes | 15m | Created sessions collection with 23 fields (user relation, externalId, title, projectPath, projectName, model, provider, source, promptTokens, completionTokens, totalTokens, cost, durationMs, isPublic, publicSlug, searchableText, summary, messageCount, evalReady, reviewedAt, evalNotes, evalTags, created, updated). Added 7 indexes including user, external_id, user_external (unique), user_source, user_eval_ready, user_updated. Migrations: 1769261723, 1769261916, 1769262012. |
| [x] | **1.4**: Create `messages` collection with schema + indexes | 15m | Created messages collection with 11 fields (session relation, externalId, role, textContent, model, promptTokens, completionTokens, durationMs, created, updated). Added 3 indexes: idx_messages_session, idx_messages_session_created, idx_messages_external_id (unique). Migration: 1769262312. |
| [x] | **1.5**: Create `parts` collection with schema + indexes | 10m | Created parts collection with 7 fields (message relation, type, content JSON, order, id, created, updated). Added 2 indexes: idx_parts_message, idx_parts_message_order. Migration: 1769262695. |
| [x] | **1.6**: Create `apiLogs` collection with schema + indexes | 10m | Created apiLogs collection with 7 fields (user relation, endpoint, method, statusCode, responseTimeMs, created, updated). Added 2 indexes: idx_apiLogs_user, idx_apiLogs_user_created. Access rules: users can view/delete their own logs, only server-side can create. Migration: 1769262938. |
| [x] | **1.7**: Configure CORS for `localhost:5173` | 10m | Added Vite proxy config to forward /api/collections, /api/admins, /api/realtime (ws), /api/files, and /_/ to Pocketbase at :8090. Tested: dev server starts, requests proxy correctly. |
| [x] | **1.8**: Create `.env.local` with Pocketbase URL | 5m | Created `.env.local` with `VITE_POCKETBASE_URL=http://localhost:8090`. Updated `.env.example` for Pocketbase. Dev server starts successfully. |
| | | | |
| | **Phase 2: SDK & Auth (~3h)** | | |
| [x] | **2.1**: Install pocketbase SDK | 10m | Installed pocketbase ^0.26.6. Import verified via tsx test. Pre-existing build errors (User type missing fields) documented in Task 2.3. |
| [x] | **2.2**: Create `src/lib/pocketbase.ts` client setup | 30m | Created singleton client with autoCancellation(false), checkHealth() and isHealthy() helpers. Added /api/health to Vite proxy. Verified: client connects, health check returns {"code":200,"message":"API is healthy."}. |
| [x] | **2.3**: Create `src/lib/types.ts` for all collections | 45m | Created comprehensive types for all 7 collections (users, sessions, messages, parts, apiLogs, sessionEmbeddings, messageEmbeddings). Added User type with firstName/lastName derived from name field for UI compatibility. Updated auth.tsx to use toUser() helper. Build passes. |
| [x] | **2.4**: Create PocketbaseProvider context | 30m | Created PocketbaseProvider context in src/lib/pocketbase.tsx. Renamed from .ts to .tsx for JSX support. Added: PocketbaseProvider wraps app with connection health checking, usePocketbase() hook returning {client, isConnecting, isConnected, error, retryConnection}, usePocketbaseClient() convenience hook. Build passes. |
| [x] | **2.5**: Wire Authelia headers to PB user sync | 45m | Created src/lib/userSync.ts with syncUser() getOrCreate function. Uses deterministic password derived from email SHA-256 hash to enable user lookup via PB auth (since API rules restrict list/view). Updated auth.tsx to call syncUser() after /api/me. Tested: users created in PB with autheliaId=email. Moved pocketbase binary to bin/ to fix Vite esbuild error. |
| [x] | **2.6**: Update `main.tsx` with PocketbaseProvider | 15m | Replaced ConvexProvider with PocketbaseProvider. Provider order: Pocketbase → Authelia → BrowserRouter → App. Build passes, bundle size reduced ~58KB. |
| [x] | **2.7**: Benchmark PB realtime subscriptions | 30m | PASS: P95 latency ~5ms (well under 500ms target). Created scripts/benchmark-realtime.mjs using eventsource polyfill for Node.js. Tests CREATE and UPDATE operations with 10 trials each. Subscription uses SSE (Server-Sent Events) via Pocketbase's realtime API. |
| | | | |
| | **Phase 3: Data Hooks (~6h)** | | |
| [x] | **3.1**: Create `useSessions` hook (list, filter, paginate) | 45m | Created src/hooks/useSessions.ts with list, filter (source, model, project, provider), sort, pagination, and realtime subscription support. Includes inferProvider helper. Build passes. |
| [x] | **3.2**: Create `useSession` hook (single + realtime) | 45m | Created src/hooks/useSession.ts. Fetches single session by ID, expands messages with parts in 3 queries (session, messages, parts). Includes realtime subscriptions for session/messages/parts. Generates markdown client-side (mirrors convex/sessions.ts:getMarkdown). Exported via hooks/index.ts. Build passes. |
| [x] | **3.3**: Create `useMessages` hook (with parts expansion) | 45m | Created src/hooks/useMessages.ts. Fetches messages for a session with parts expanded. Includes pagination (limit, page), filter by role and text search, realtime subscriptions for messages and parts. MessageWithParts type with id, role, textContent, createdAt, parts array. Exported via hooks/index.ts. Build passes. |
| [x] | **3.4**: Create `useUser` hook (current user, stats) | 30m | Created src/hooks/useUser.ts. Provides: user record, hasApiKey, enabledAgents, createdAt, stats (sessionCount, messageCount, totalTokens, totalCost). Includes mutations: generateApiKey, revokeApiKey, updateEnabledAgents, deleteAllData, deleteAccount. Supports realtime updates. Exported via hooks/index.ts. Build passes. |
| [x] | **3.5**: Create `useSearch` hook (full-text) | 45m | Created src/hooks/useSearch.ts with useSearchSessions and useSearchMessages hooks. Session search uses searchableText field with ~ operator. Message search uses textContent field. Features: offset-based pagination (cursor), session info attached to message results, realtime subscriptions. Empty query on sessions returns recent sessions, empty query on messages returns empty array (matches Convex behavior). Exported via hooks/index.ts. Build passes. |
| [x] | **3.6**: Create `useAnalytics` hook (single fetch, multi-compute) | 60m | Created src/hooks/useAnalytics.ts. Single fetch of all sessions, client-side computation of summaryStats, dailyStats, modelStats, projectStats, providerStats, sourceStats. Uses inferProvider from useSessions. Exported via hooks/index.ts. Build passes. |
| [x] | **3.7**: Create `useEvals` hook (list, tags) | 30m | Created src/hooks/useEvals.ts. Provides: evalSessions (filtered list), stats (total, bySource, totalTestCases), allTags (unique tags for filter). Includes mutations: setEvalReady, updateEvalNotes, updateEvalTags. Includes generateExport function supporting deepeval/openai/filesystem formats (client-side implementation). Exported via hooks/index.ts. Build passes. |
| [x] | **3.8**: Add loading states to all hooks | 30m | All hooks have isLoading state. Created src/components/ui/Skeleton.tsx with theme-aware skeleton components: Skeleton (base), SkeletonText, SessionSkeleton, StatsSkeleton, TableSkeleton, ChartSkeleton, MessageSkeleton, PageSkeleton. Export index at src/components/ui/index.ts. Build passes. |
| [x] | **3.9**: Add error boundaries for PB failures | 30m | Installed react-error-boundary. Created src/components/ui/Error.tsx with ErrorFallback (full-page), ErrorAlert (inline), ErrorCard (card-style), ConnectionError (PB connection). Created src/components/ErrorBoundary.tsx with AppErrorBoundary (root), PageErrorBoundary (routes), SectionErrorBoundary (data sections). Updated main.tsx to wrap app with AppErrorBoundary. Updated PocketbaseProvider with showConnectionError option. Build passes. |
| | | | |
| | **Phase 4: Mutations (~3h)** | | |
| [x] | **4.1**: Session mutations (update, delete, visibility) | 45m | Added setVisibility (generates nanoid slug), updateSession, deleteSession (cascade delete: parts → messages → embeddings → session) to useSession hook. Exported SetVisibilityResult type. Build passes. |
| [x] | **4.2**: User mutations (API key gen/revoke, agents) | 45m | Implemented in useUser.ts: generateApiKey() creates os_[32 hex chars], revokeApiKey() clears apiKey field, updateEnabledAgents() updates agent list. All mutations use pb.collection().update(), update local state immediately, and are properly typed. Build passes. |
| [x] | **4.3**: Eval mutations (ready, tags, notes) | 30m | Implemented in useEvals.ts: setEvalReady, updateEvalNotes, updateEvalTags. All mutations use pb.collection().update() and refetch on success. Build passes. |
| [x] | **4.4**: Bulk operations (multi-delete, export) | 45m | Created useBulkOperations hook with deleteMultipleSessions (cascade: parts->messages->embeddings->sessions) and exportSessions (JSON/CSV/Markdown). Includes progress callback, error handling. Build passes. Test scripts in scripts/test-bulk-delete.mjs and scripts/verify-bulk-ops.mjs. |
| | | | |
| | **Phase 5: Page Migration (~8h)** | | |
| [x] | **5.1**: Migrate Dashboard.tsx (19 hooks) | 3h | All charts, stats, session list work. Replaced 19 Convex hooks: useMutation(getOrCreate) removed (handled by auth), useQuery(me) → useUser(), 6x useQuery(analytics.*) → useAnalytics(), useQuery(sessionsWithDetails) → useSessions(), useQuery(sessions.get) → useSession(), useMutation(sessions.remove) → useSession().deleteSession, useMutation(sessions.setVisibility) → useSession().setVisibility, useQuery(sessions.getMarkdown) → useSession().markdown, useQuery(sessions.exportAllDataCSV) → useBulkOperations().exportSessions(), useMutation(evals.setEvalReady) → useEvals().setEvalReady. All Id<"sessions"> replaced with string. Build passes. |
| [x] | **5.2**: Migrate Settings.tsx (8 hooks) | 1h | Replaced all 8 Convex hooks with useUser() from hooks/. Changed: useQuery(me)+useQuery(stats) → useUser().user+stats, 5 mutations (generateApiKey, revokeApiKey, deleteAllData, deleteAccount, updateEnabledAgents) → useUser() destructured. Updated CONVEX_URL → POCKETBASE_URL, hasApiKey → apiKey, createdAt → created. Build passes. Done in v1.3.0-pb.21. |
| [x] | **5.3**: Migrate Context.tsx (5 hooks) | 45m | Replaced 5 Convex hooks: useQuery(searchSessionsPaginated) → useSearchSessions, useQuery(searchMessagesPaginated) → useSearchMessages, useQuery(sessions.get) → useSession, useQuery(sessions.getMarkdown) → useSession().markdown (now passed as prop to SessionSlideOver). Updated all Id<"sessions">/Id<"messages"> to string. Updated SessionResultCard, MessageResultCard, SessionSlideOver, SlideOverMessageBlock types. Footer changed to "Pocketbase Full-Text Search". Build passes. Done in v1.3.0-pb.22. |
| [x] | **5.4**: Migrate Evals.tsx (5 hooks) | 45m | Replaced 4 Convex hooks: useQuery(me) → useUser(), useQuery(listEvalSessions) + useQuery(getEvalTags) + useAction(generateEvalExport) → useEvals(). Updated Id<"sessions"> to string, session._id to session.id. Added loading state. Build passes. Done in v1.3.0-pb.23. |
| [ ] | **5.5**: Migrate PublicSession.tsx (2 hooks) | 30m | Public URL loads session without auth |
| [ ] | **5.6**: Migrate SessionViewer.tsx (4 hooks) | 1h | Full session detail, actions work |
| | | | |
| | **Phase 6: Sync API (~4h)** | | |
| [ ] | **6.1**: Create sync endpoints (session, message, batch) | 90m | Plugin POST creates session in PB |
| [ ] | **6.2**: Implement API key validation middleware | 30m | Invalid key returns 401 |
| [ ] | **6.3**: Create read API endpoints (list, get, search) | 45m | `GET /api/sessions` returns JSON |
| [ ] | **6.4**: Create export endpoints (markdown, JSON, CSV) | 45m | Download button triggers file download |
| [ ] | **6.5**: Update plugin to v2.0 for Pocketbase | 30m | Plugin syncs to new endpoints |
| | | | |
| | **Phase 7: Cleanup & Deploy (~3h)** | | |
| [ ] | **7.1**: Remove Convex packages and `convex/` dir | 30m | `npm run build` succeeds, no Convex imports |
| [ ] | **7.2**: Update AGENTS.md and README | 30m | Docs reflect Pocketbase architecture |
| [ ] | **7.3**: Create database backup script | 30m | `backup.sh` copies `pb_data/` with timestamp |
| [ ] | **7.4**: End-to-end testing | 60m | Fresh setup -> sync -> view -> search -> export |
| [ ] | **7.5**: Production deployment (systemd) | 30m | `systemctl status opensync-pb` shows running |
| | | | |
| | **Deferred: Vector Search** | | |
| [ ] | **D.1**: Create embedding collections | 30m | Collections exist in admin UI |
| [ ] | **D.2**: Implement embedding generation on sync | 60m | Sync triggers OpenAI API call |
| [ ] | **D.3**: Implement brute-force semantic search | 90m | Semantic search returns relevant results |

---

## Legend

- `[ ]` Pending
- `[x]` Complete
- `[!]` Blocked

---

## Progress Summary

| Phase | Tasks | Est. Time | Completed |
|-------|-------|-----------|-----------|
| Phase 1: Setup | 8 | 2h | 8 |
| Phase 2: SDK & Auth | 7 | 3h | 7 |
| Phase 3: Data Hooks | 9 | 6h | 9 |
| Phase 4: Mutations | 4 | 3h | 4 |
| Phase 5: Pages | 6 | 8h | 4 |
| Phase 6: API | 5 | 4h | 0 |
| Phase 7: Cleanup | 5 | 3h | 0 |
| Deferred | 3 | 3h | 0 |
| **Total** | **47** | **~32h** | **31** |

---

## Notes

- **Priority Order:** Phase 1-2 (setup) -> Phase 3-4 (hooks) -> Phase 5 (pages) -> Phase 6 (API) -> Phase 7 (cleanup)
- **Dependencies:** Each phase depends on previous phases completing
- **Parallel Work:**
  - Phase 1: Tasks 1.2-1.6 (collections) can be done in parallel
  - Phase 3: Tasks 3.1-3.7 (hooks) can be done in parallel
  - Phase 5: Tasks 5.3-5.6 can be parallelized after 5.1 (Dashboard is the reference)
- **Testing Strategy:** Test after each task using acceptance criteria
- **Rollback:** Keep Convex code until Phase 7 in case of issues
- **Auth:** Already Authelia-compatible - `src/lib/auth.tsx` uses `/api/me` header pass-through
- **Analytics Strategy:** Single `useAnalytics` hook fetches all sessions once, computes summary/daily/model/project stats client-side to avoid multiple round-trips
- **Resolved:** Task 2.3 created src/lib/types.ts with comprehensive Pocketbase types. The User type now includes firstName/lastName derived from the name field via toUser() helper, fixing TypeScript errors in Dashboard, Settings, Context, Evals, and Header components.

---

## Source Code Analysis Summary

### Convex Usage by File (to be migrated)
| File | Total Hooks | Notes |
|------|-------------|-------|
| Dashboard.tsx | 19 | Largest migration, includes analytics |
| Settings.tsx | 8 | User data, API key, danger zone |
| Context.tsx | 5 | Search functionality |
| Evals.tsx | 5 | Eval list and export |
| SessionViewer.tsx | 4 | Session detail with actions |
| PublicSession.tsx | 2 | Public session view |
| **Total** | **43** | |

### Files Requiring No Changes
- `src/lib/theme.tsx` - Pure theme provider
- `src/lib/utils.ts` - Utility functions
- `src/lib/source.ts` - Source type utilities
- `src/pages/Docs.tsx` - Static content
- `src/pages/Login.tsx` - Simple redirect
- `src/components/Charts.tsx` - Presentational
- `src/components/ConfirmModal.tsx` - UI only
- `src/components/LegalModal.tsx` - Static content
- `src/components/Header.tsx` - Uses local auth only

### Convex API Endpoints to Replicate
**Users:** me, stats, getOrCreate, generateApiKey, revokeApiKey, updateEnabledAgents, deleteAllData
**Sessions:** list, get, getPublic, getMarkdown, exportAllDataCSV, setVisibility, remove
**Analytics:** summaryStats, dailyStats, modelStats, projectStats, providerStats, sourceStats
**Search:** searchSessionsPaginated, searchMessagesPaginated, semanticSearch (deferred)
**Evals:** listEvalSessions, getEvalTags, setEvalReady, updateEvalNotes, updateEvalTags, generateEvalExport
