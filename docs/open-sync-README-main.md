# OpenSync

Sync, search, and share your OpenCode sessions. Built with Convex.

```
   ____                   _____                 
  / __ \                 / ____|                
 | |  | |_ __   ___ _ __| (___  _   _ _ __   ___ 
 | |  | | '_ \ / _ \ '_ \\___ \| | | | '_ \ / __|
 | |__| | |_) |  __/ | | |___) | |_| | | | | (__ 
  \____/| .__/ \___|_| |_|____/ \__, |_| |_|\___|
        | |                      __/ |          
        |_|                     |___/           
```

## What is this?

OpenSync stores your OpenCode (Claude Code, Cursor, etc.) sessions in the cloud:

- **Automatic sync** as you code
- **Full-text search** across all sessions
- **Semantic search** to find sessions by meaning
- **Public sharing** with one click
- **API access** for context engineering and integrations
- **Usage stats** including tokens, cost, time

## Quick Start

### 1. Deploy Your Backend

```bash
# Clone the repo
git clone https://github.com/your-org/opencode-sync.git
cd opencode-sync

# Install dependencies
npm install

# Deploy to Convex
npx convex dev
```

See [SETUP.md](docs/SETUP.md) for detailed instructions.

### 2. Install the Plugin

```bash
npm install -g opencode-sync-plugin
```

### 3. Authenticate

```bash
opencode-sync login
```

Enter your Convex URL and WorkOS Client ID when prompted.

### 4. Add to OpenCode Config

```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

### 5. Start Coding

Your sessions sync automatically.

## Features

| Feature | Description |
|---------|-------------|
| Auto Sync | Sessions sync in real-time as you work |
| Full-Text Search | Search by keywords across all sessions |
| Semantic Search | Search by meaning using vector embeddings |
| Hybrid Search | Combines full-text and semantic for best results |
| Public Sharing | Share sessions with a single click |
| Markdown Export | Download sessions as Markdown files |
| API Access | Secure API for external integrations |
| Usage Stats | Track tokens, cost, time per session and overall |
| RAG Support | Built-in retrieval for context engineering |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   OpenCode      │────▶│   Plugin        │────▶│   Convex        │
│   (CLI/IDE)     │     │   (Sync)        │     │   (Backend)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │   Web UI        │
                                                │   (React+Vite)  │
                                                └─────────────────┘
```

## API Endpoints

All endpoints require authentication via Bearer token (JWT or API key).

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | List all sessions |
| `GET /api/sessions/get?id=` | Get session with messages |
| `GET /api/search?q=&type=` | Search (fulltext/semantic/hybrid) |
| `GET /api/context?q=` | Get relevant context for LLM |
| `GET /api/export?id=&format=` | Export session (json/markdown/jsonl) |
| `GET /api/stats` | Get usage statistics |

Generate an API key in Settings to use these endpoints.

## Project Structure

```
opencode-sync/           # This repo - Convex backend + React UI
├── convex/              # Convex functions
│   ├── schema.ts        # Database schema
│   ├── sessions.ts      # Session queries/mutations
│   ├── search.ts        # Full-text and semantic search
│   ├── http.ts          # HTTP endpoints
│   └── api.ts           # Secure API functions
├── src/                 # React frontend
│   ├── pages/           # Login, Dashboard, Settings, Docs
│   └── components/      # Header, Sidebar, SessionViewer
└── docs/                # Documentation

opencode-sync-plugin/    # Separate repo - npm package
├── src/
│   ├── index.ts         # Plugin hooks
│   └── cli.ts           # CLI commands
└── README.md
```

## Documentation

- [Setup Guide](docs/SETUP.md) - Full deployment instructions
- [API Reference](docs/API.md) - API endpoint documentation
- [Plugin README](https://github.com/your-org/opencode-sync-plugin) - Plugin installation

## Tech Stack

- **Backend**: [Convex](https://convex.dev) - Real-time database with built-in search
- **Auth**: [WorkOS](https://workos.com) - Enterprise authentication
- **Frontend**: React + Vite + Tailwind
- **Embeddings**: OpenAI text-embedding-3-small

## Resources

- [Convex Documentation](https://docs.convex.dev)
- [Convex Vector Search](https://docs.convex.dev/search/vector-search)
- [Convex Full-Text Search](https://docs.convex.dev/search/text-search)
- [WorkOS User Management](https://workos.com/docs/user-management)

## License

MIT
