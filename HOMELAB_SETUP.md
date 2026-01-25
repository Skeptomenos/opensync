# OpenSync Homelab Setup (Pocketbase Edition)

Self-hosted deployment for OpenSync with Pocketbase backend, Authelia authentication, and Traefik reverse proxy.

## Architecture

```
Browser -> Cloudflare Tunnel -> Traefik -> Authelia -> Vite:5173 -> Pocketbase:8090
                                  |
                          authelia-file middleware
                          (redirects to auth if not logged in)
```

## Prerequisites

- Node.js 18+
- Pocketbase binary (Linux amd64 or Darwin arm64)
- Cloudflare Tunnel routing your domain to Traefik
- Traefik reverse proxy with cert resolver
- Authelia running with `authelia-file` middleware

---

## Quick Start (Development)

```bash
cd ~/opensync-pocketbase

# Terminal 1: Start Pocketbase
npm run pocketbase

# Terminal 2: Start Vite dev server
npm install
npm run dev:host
```

Visit `https://opensync.yourdomain.com` - Authelia prompts for login.

---

## Production Deployment

### Option 1: Systemd Services (Recommended)

```bash
cd ~/opensync-pocketbase

sudo ./deploy/install.sh
```

This creates and enables:
- `opensync-pb.service` - Pocketbase on port 8090
- `opensync-frontend.service` - Vite on port 5173

#### Verify Deployment

```bash
systemctl status opensync-pb
systemctl status opensync-frontend
```

#### Manage Services

```bash
sudo systemctl start opensync-pb
sudo systemctl stop opensync-pb
sudo systemctl restart opensync-pb
sudo systemctl status opensync-pb

journalctl -u opensync-pb -f
journalctl -u opensync-frontend -f
```

#### Service Logs

```
/var/log/opensync/pocketbase.log
/var/log/opensync/frontend.log
```

### Option 2: Manual (tmux)

```bash
tmux new-session -d -s opensync
tmux send-keys -t opensync "cd ~/opensync-pocketbase && npm run pocketbase" Enter
tmux new-window -t opensync
tmux send-keys -t opensync "cd ~/opensync-pocketbase && npm run dev:host" Enter
tmux attach -t opensync
```

Detach: `Ctrl+B, D`. Reattach: `tmux attach -t opensync`.

---

## Traefik Configuration

Create `opensync.yml` in your Traefik config directory:

```yaml
http:
  routers:
    opensync:
      rule: "Host(`opensync.yourdomain.com`)"
      entryPoints:
        - "websecure"
      service: "opensync"
      middlewares:
        - "authelia-file"
      tls:
        certResolver: "letsencrypt"

  services:
    opensync:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:5173"
```

The `authelia-file` middleware should be defined as:

```yaml
middlewares:
  authelia-file:
    forwardAuth:
      address: "http://authelia:9091/api/authz/forward-auth"
      trustForwardHeader: true
      authResponseHeaders:
        - "Remote-User"
        - "Remote-Groups"
        - "Remote-Name"
        - "Remote-Email"
```

---

## Authentication Flow

1. **Traefik** receives request at `opensync.yourdomain.com`
2. **Authelia middleware** checks authentication
3. If not logged in: redirects to Authelia login
4. If logged in: forwards request with headers:
   - `Remote-Email`: user email
   - `Remote-Name`: display name
   - `Remote-Groups`: user groups
5. **Vite** handles `/api/me` endpoint returning user from headers
6. **React app** calls `/api/me` to get user info
7. **userSync** creates/updates Pocketbase user from Authelia identity

---

## File Structure

```
/opt/opensync/                    # Production install (or ~/opensync-pocketbase for dev)
  bin/pocketbase                  # Pocketbase binary
  pb_data/                        # SQLite database
  pb_migrations/                  # Schema migrations
  storage/                        # File uploads
  src/                            # React frontend
  server/                         # Sync API endpoints
  .env.local                      # Environment variables
  
/var/log/opensync/               # Service logs (production)
  pocketbase.log
  frontend.log

/etc/systemd/system/             # Systemd services (production)
  opensync-pb.service
  opensync-frontend.service
```

---

## Environment Variables

Create `.env.local`:

```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

For production with Pocketbase superuser auth (sync API):

```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_SUPERUSER_EMAIL=admin@localhost
POCKETBASE_SUPERUSER_PASSWORD=your-secure-password
```

---

## Sync Plugin Setup

### Generate API Key

1. Log into OpenSync dashboard
2. Go to Settings -> API Keys
3. Click "Generate API Key"
4. Copy the `os_...` key

### Configure Plugin

Create `~/.opensync/credentials.json`:

```json
{
  "pocketbaseUrl": "https://opensync.yourdomain.com",
  "apiKey": "os_your_api_key_here"
}
```

### OpenCode Plugin

```bash
npm install -g opencode-sync-plugin
```

Add to `opencode.json`:
```json
{
  "plugins": ["opencode-sync-plugin"]
}
```

### Claude Code Plugin

```bash
npm install -g @anthropic/claude-code-sync
```

Add to settings:
```json
{
  "hooks": {
    "onSessionEnd": "claude-code-sync sync"
  }
}
```

### Verify Setup

```bash
opencode-sync verify
opencode-sync status
```

---

## Database Management

### Backup

```bash
cd ~/opensync-pocketbase
./scripts/backup.sh

./scripts/backup.sh --list
./scripts/backup.sh --quiet
```

### Restore

```bash
./scripts/restore.sh --list

./scripts/restore.sh backups/opensync_backup_20260125_120000.tar.gz
```

### Access Admin UI

Development: `http://localhost:8090/_/`

Production: Forward port or access via internal network:
```bash
ssh -L 8090:localhost:8090 your-server
```
Then visit `http://localhost:8090/_/`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | Services not running | `sudo systemctl start opensync-pb opensync-frontend` |
| "Not authenticated" | Authelia headers missing | Check Traefik middleware config |
| Empty dashboard | Pocketbase errors | Check browser console, verify Pocketbase running |
| CORS errors | Vite proxy misconfigured | Check `vite.config.ts` proxy settings |
| Sync fails | Invalid API key | Regenerate key in Settings, update credentials.json |
| 403 from Vite | allowedHosts not set | Add `server.allowedHosts: true` to vite.config.ts |

### Check Service Status

```bash
systemctl status opensync-pb
systemctl status opensync-frontend
```

### View Logs

```bash
journalctl -u opensync-pb -f
journalctl -u opensync-frontend -f

tail -f /var/log/opensync/pocketbase.log
tail -f /var/log/opensync/frontend.log
```

### Test Pocketbase Health

```bash
curl http://localhost:8090/api/health
```

### Test Auth Flow

```bash
curl -sI https://opensync.yourdomain.com | head -5
```

---

## Upgrading

```bash
cd ~/opensync-pocketbase
git pull origin feature/pocketbase-migration

sudo ./deploy/install.sh --skip-user
```

---

## Uninstalling

```bash
sudo systemctl stop opensync-pb opensync-frontend
sudo systemctl disable opensync-pb opensync-frontend
sudo rm /etc/systemd/system/opensync-pb.service
sudo rm /etc/systemd/system/opensync-frontend.service
sudo systemctl daemon-reload

sudo userdel opensync
sudo rm -rf /opt/opensync
sudo rm -rf /var/log/opensync
```

---

## Related Documentation

- [OpenCode Plugin Setup](docs/OPENCODE-PLUGIN.md)
- [Claude Code Plugin Setup](docs/CLAUDE-CODE-PLUGIN.md)
- [Pocketbase Documentation](https://pocketbase.io/docs/)
- [Migration Spec](ralph-wiggum/specs/POCKETBASE_MIGRATION.md)
