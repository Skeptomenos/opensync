# Project Context

> This file provides shared context for all Ralphus agents.

## Ralphus Structure

**CRITICAL**: All Ralphus files live under `ralph-wiggum/`:
- `ralph-wiggum/specs/` - Technical specifications
- `ralph-wiggum/prds/` - Product requirement docs
- `ralph-wiggum/memory/` - Shared context (this file)
- `ralph-wiggum/code/` - Implementation plan

**NEVER** create `specs/`, `prds/`, or `inbox/` at the project root.

## Project Overview

**OpenSync** is an AI coding session dashboard that captures, stores, searches, and exports coding sessions from AI-assisted coding tools (OpenCode CLI, Claude Code).

**Current State:** Migrating from Convex (cloud) to Pocketbase (self-hosted).

**Key Goals:**
- Session capture from AI coding tools
- Full-text and semantic search
- Session export for LLM evaluation
- Self-hosted with full data ownership

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + Tailwind + TypeScript |
| Backend | Pocketbase (target) / Convex (current) |
| Auth | Authelia (SSO via reverse proxy headers) |
| Database | SQLite (via Pocketbase) |
| Embeddings | OpenAI text-embedding-3-small |

## Architecture

```
Browser -> Authelia -> Vite:5173 -> Pocketbase:8090
                                 -> OpenAI (embeddings)
```

**Data Model:**
- `users` - Linked to Authelia, API keys
- `sessions` - Coding sessions with metadata
- `messages` - Messages within sessions
- `parts` - Message parts (text, code, tool calls)
- `sessionEmbeddings` / `messageEmbeddings` - Vector search (deferred)
- `apiLogs` - API access audit

## Development Workflow

```bash
# Terminal 1: Pocketbase
./pocketbase serve   # :8090

# Terminal 2: Vite
npm run dev -- --host   # :5173
```

- Pocketbase Admin: http://localhost:8090/_/
- Production: https://opensync.helmus.me

## Conventions

- TypeScript strict mode
- React functional components with hooks
- Tailwind for styling (dark/tan theme support)
- API keys prefixed with `osk_*`
- Source tracking: "opencode", "claude-code", "factory-droid"

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/pocketbase.ts` | Pocketbase client (Phase 2 - to be created) |
| `src/lib/types.ts` | Pocketbase collection types (Phase 2 - to be created) |
| `src/lib/auth.tsx` | Authelia auth context (exists, needs update) |
| `src/pages/Dashboard.tsx` | Main dashboard (19 Convex hooks to migrate) |
| `src/pages/Settings.tsx` | User settings, API keys (8 hooks) |
| `src/pages/Context.tsx` | Full-text search (5 hooks) |
| `src/components/SessionViewer.tsx` | Session detail view (4 hooks) |
| `convex/schema.ts` | Current data schema (reference for migration) |
| `convex/` | Legacy Convex backend (delete in Phase 7) |

## Current Focus

See `ralph-wiggum/code/plan.md` for detailed implementation plan.

**Migration Phases (47 tasks, ~32h estimated):**
1. Pocketbase setup & collections (8 tasks, 2h)
2. Client & auth integration (7 tasks, 3h)
3. Data hooks - replace Convex queries (9 tasks, 6h)
4. Mutations - replace Convex mutations (4 tasks, 3h)
5. Page migration (6 tasks, 8h)
6. Sync API endpoints (5 tasks, 4h)
7. Cleanup & deploy (5 tasks, 3h)

**Status:**
- Frontend UI: Complete (all components exist)
- Frontend data layer: 0% (still uses Convex)
- Backend: 0% (Pocketbase not yet set up)
- Migration: Not started
