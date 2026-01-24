# OpenCode Sync Plugin

Sync your OpenCode sessions to the OpenSync dashboard.

Published on npm: [opencode-sync-plugin](https://www.npmjs.com/package/opencode-sync-plugin)

## v2.0 - Pocketbase Backend

**Version 2.0** migrates from Convex (cloud) to Pocketbase (self-hosted). The API contract remains the same, so existing credentials continue to work once you update the URL.

### Breaking Changes in v2.0

- **URL changed**: Use your Pocketbase URL instead of Convex URL
- **API key prefix**: New keys use `os_*` prefix (old `osk_*` keys still work)

## Installation

```bash
npm install -g opencode-sync-plugin
```

## Authentication

```bash
opencode-sync login
```

Enter when prompted:
- **OpenSync URL**: Your Pocketbase deployment URL (e.g., `https://opensync.yourdomain.com`)
- **API Key**: Your API key from Settings page (starts with `os_` or `osk_`)

No browser authentication required.

### Getting Your API Key

1. Log into your OpenSync dashboard
2. Go to **Settings**
3. Click **Generate API Key**
4. Copy the key (starts with `os_`)

## Configuration

Add the plugin to your project's `opencode.json`:

```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

Or add globally at `~/.config/opencode/opencode.json`.

## Usage

Start an OpenCode session and your sessions sync automatically.

### CLI Commands

| Command | Description |
|---------|-------------|
| `opencode-sync login` | Configure with OpenSync URL and API Key |
| `opencode-sync verify` | Verify credentials and OpenCode config |
| `opencode-sync sync` | Test connectivity and create a test session |
| `opencode-sync sync --new` | Sync only new sessions (uses local tracking) |
| `opencode-sync sync --all` | Sync all sessions (queries backend, skips existing) |
| `opencode-sync sync --force` | Clear tracking and resync all sessions |
| `opencode-sync logout` | Clear stored credentials |
| `opencode-sync status` | Show authentication status |
| `opencode-sync config` | Show current configuration |
| `opencode-sync version` | Show installed version |
| `opencode-sync help` | Show help message |

## What Gets Synced

| Data | Description |
|------|-------------|
| Session metadata | Project name, directory, git branch, timestamps |
| Messages | User prompts and assistant responses |
| Tool calls | Which tools were used and their outcomes |
| Token usage | Input and output token counts |
| Model info | Which model was used |
| Cost | Estimated cost per session |

## Configuration Storage

Credentials are stored at:

```
~/.opensync/
  credentials.json      # OpenSync URL, API Key
  synced-sessions.json  # Local tracking for sync --new
```

### credentials.json format

```json
{
  "url": "https://opensync.yourdomain.com",
  "apiKey": "os_your_api_key_here"
}
```

For backward compatibility, the plugin also accepts:
- `convexUrl` field (legacy v1.x format)
- Both `os_*` and `osk_*` API key prefixes

## URL Format

The plugin accepts URLs for both backends:
- **Pocketbase (v2.0+)**: `https://opensync.yourdomain.com`
- **Convex (v1.x)**: `https://your-project.convex.cloud` or `https://your-project.convex.site`

## Troubleshooting

### Plugin not syncing

1. Verify authentication: `opencode-sync status`
2. Check the plugin is in `opencode.json`
3. Check Pocketbase is running (`bin/pocketbase serve`)

### "Invalid API key" errors

1. Go to OpenSync Settings
2. Generate a new API key
3. Run `opencode-sync login` with the new key

### Sessions not appearing in dashboard

1. Wait a few seconds for sync to complete
2. Refresh the OpenSync dashboard
3. Check your user account matches between plugin and dashboard

### Migrating from v1.x (Convex) to v2.0 (Pocketbase)

1. Deploy your Pocketbase instance (see [Homelab Setup](./HOMELAB_SETUP.md))
2. Run `opencode-sync login` with the new Pocketbase URL
3. Generate a new API key in the Pocketbase dashboard Settings
4. Your old `osk_*` key will NOT work with the new backend

## Related

- [OpenSync Setup Guide](./SETUP.md) - Deploy your own OpenSync instance
- [API Reference](./API.md) - Access your sessions programmatically
- [Plugin Auth PRD](./PLUGIN-AUTH-PRD.md) - Authentication specification
