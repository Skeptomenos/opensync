# claude-code-sync

Sync your Claude Code sessions to a web dashboard. Track your coding sessions, analyze tool usage, and monitor token consumption across projects.

Works with the [opencode-sync webui](https://github.com/yourusername/opencode-sync-webui) to give you a unified view of all your AI coding sessions.

## Installation

### From the marketplace

```bash
/plugin install yourusername/claude-code-sync
```

### During development

```bash
claude --plugin-dir /path/to/claude-code-sync
```

## Configuration

Create a config file at `~/.claude-code-sync.json`:

```json
{
  "convex_url": "https://your-deployment.convex.cloud",
  "api_key": "optional-api-key",
  "auto_sync": true,
  "sync_tool_calls": true,
  "sync_thinking": false
}
```

Or use environment variables:

```bash
export CLAUDE_SYNC_CONVEX_URL="https://your-deployment.convex.cloud"
export CLAUDE_SYNC_API_KEY="optional-api-key"
export CLAUDE_SYNC_AUTO="true"
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `convex_url` | string | required | Your Convex deployment URL |
| `api_key` | string | optional | API key for authentication |
| `auto_sync` | boolean | `true` | Automatically sync when sessions end |
| `sync_tool_calls` | boolean | `true` | Include tool call details |
| `sync_thinking` | boolean | `false` | Include thinking/reasoning traces |

## Commands

### Check sync status

```
/claude-code-sync:sync-status
```

Shows your current configuration and tests the connection to your Convex backend.

### Manual sync

```
/claude-code-sync:sync-now
```

Manually sync the current session without waiting for it to end.

## What gets synced

The plugin captures:

- **Session metadata**: project name, working directory, git branch, timestamps
- **User prompts**: your messages to Claude (truncated for privacy)
- **Tool calls**: which tools were used and their outcomes
- **Token usage**: input and output token counts
- **Model info**: which Claude model was used

Sensitive data like passwords, tokens, and API keys are automatically redacted.

## How it works

The plugin registers hooks that fire at key points in Claude Code's lifecycle:

1. **SessionStart**: Records when you begin a session
2. **UserPromptSubmit**: Tracks each prompt you send
3. **PostToolUse**: Logs tool executions
4. **Stop**: Notes when Claude finishes responding
5. **SessionEnd**: Syncs the full transcript

All events are sent to your Convex backend in real-time.

## Privacy

- All data goes to YOUR Convex deployment. No third parties.
- Sensitive fields are redacted before sync.
- Full file contents are not synced, only paths and lengths.
- Thinking traces are off by default.
- You control what gets synced via configuration.

## Requirements

- Claude Code v1.0.41 or later
- Python 3.10+ with `uv` available
- A deployed Convex backend (see webui setup)

## Troubleshooting

### "No Convex URL configured"

Create the config file at `~/.claude-code-sync.json` with your deployment URL.

### "Connection failed"

Check that:
1. Your Convex deployment is running
2. The URL is correct (should end in `.convex.cloud`)
3. Your API key is valid (if using authentication)

### Sync not working

Run `/claude-code-sync:sync-status` to diagnose issues.

## License

MIT
