#!/bin/bash
# OpenSync Production Deployment Script
# Installs systemd services for Pocketbase and Vite frontend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
INSTALL_DIR="${OPENSYNC_INSTALL_DIR:-/opt/opensync}"
SERVICE_USER="${OPENSYNC_USER:-opensync}"
LOG_DIR="/var/log/opensync"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Parse arguments
SKIP_USER=false
SKIP_COPY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-user) SKIP_USER=true; shift ;;
        --skip-copy) SKIP_COPY=true; shift ;;
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        --user) SERVICE_USER="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --install-dir DIR   Installation directory (default: /opt/opensync)"
            echo "  --user USER         Service user (default: opensync)"
            echo "  --skip-user         Skip creating system user"
            echo "  --skip-copy         Skip copying files (useful for updates)"
            echo "  -h, --help          Show this help"
            exit 0
            ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

log_info "OpenSync Production Deployment"
log_info "================================"
log_info "Install directory: $INSTALL_DIR"
log_info "Service user: $SERVICE_USER"
log_info "Repository: $REPO_DIR"
echo

# Step 1: Create system user
if [[ "$SKIP_USER" == "false" ]]; then
    if ! id "$SERVICE_USER" &>/dev/null; then
        log_info "Creating system user: $SERVICE_USER"
        useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    else
        log_info "User $SERVICE_USER already exists"
    fi
fi

# Step 2: Create directories
log_info "Creating directories..."
mkdir -p "$INSTALL_DIR"/{bin,pb_data,pb_migrations,storage,backups}
mkdir -p "$LOG_DIR"

# Step 3: Copy application files
if [[ "$SKIP_COPY" == "false" ]]; then
    log_info "Copying application files..."
    
    # Copy essential files
    cp -r "$REPO_DIR/bin/pocketbase" "$INSTALL_DIR/bin/"
    cp -r "$REPO_DIR/pb_migrations/"* "$INSTALL_DIR/pb_migrations/" 2>/dev/null || true
    cp -r "$REPO_DIR/src" "$INSTALL_DIR/"
    cp -r "$REPO_DIR/server" "$INSTALL_DIR/"
    cp -r "$REPO_DIR/public" "$INSTALL_DIR/"
    cp -r "$REPO_DIR/scripts" "$INSTALL_DIR/"
    cp "$REPO_DIR/package.json" "$INSTALL_DIR/"
    cp "$REPO_DIR/package-lock.json" "$INSTALL_DIR/" 2>/dev/null || true
    cp "$REPO_DIR/vite.config.ts" "$INSTALL_DIR/"
    cp "$REPO_DIR/tsconfig.json" "$INSTALL_DIR/"
    cp "$REPO_DIR/tsconfig.node.json" "$INSTALL_DIR/" 2>/dev/null || true
    cp "$REPO_DIR/tailwind.config.js" "$INSTALL_DIR/"
    cp "$REPO_DIR/postcss.config.js" "$INSTALL_DIR/"
    cp "$REPO_DIR/index.html" "$INSTALL_DIR/"
    
    # Copy .env.local if exists
    if [[ -f "$REPO_DIR/.env.local" ]]; then
        cp "$REPO_DIR/.env.local" "$INSTALL_DIR/"
    else
        log_warn "No .env.local found - creating from example"
        if [[ -f "$REPO_DIR/.env.example" ]]; then
            cp "$REPO_DIR/.env.example" "$INSTALL_DIR/.env.local"
        else
            echo "VITE_POCKETBASE_URL=http://127.0.0.1:8090" > "$INSTALL_DIR/.env.local"
        fi
    fi
    
    # Make pocketbase executable
    chmod +x "$INSTALL_DIR/bin/pocketbase"
fi

# Step 4: Install npm dependencies
log_info "Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install --production=false

# Step 5: Set ownership
log_info "Setting file ownership..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"

# Step 6: Install systemd services
log_info "Installing systemd services..."

# Update service files with correct paths
sed "s|/opt/opensync|$INSTALL_DIR|g" "$SCRIPT_DIR/opensync-pb.service" > /etc/systemd/system/opensync-pb.service
sed "s|/opt/opensync|$INSTALL_DIR|g" "$SCRIPT_DIR/opensync-frontend.service" > /etc/systemd/system/opensync-frontend.service

# Update user in service files
sed -i "s|User=opensync|User=$SERVICE_USER|g" /etc/systemd/system/opensync-pb.service
sed -i "s|Group=opensync|Group=$SERVICE_USER|g" /etc/systemd/system/opensync-pb.service
sed -i "s|User=opensync|User=$SERVICE_USER|g" /etc/systemd/system/opensync-frontend.service
sed -i "s|Group=opensync|Group=$SERVICE_USER|g" /etc/systemd/system/opensync-frontend.service

# Reload systemd
systemctl daemon-reload

# Step 7: Enable and start services
log_info "Enabling services..."
systemctl enable opensync-pb.service
systemctl enable opensync-frontend.service

log_info "Starting services..."
systemctl start opensync-pb.service
sleep 2  # Wait for Pocketbase to start
systemctl start opensync-frontend.service

# Step 8: Verify services
log_info "Verifying services..."
echo

if systemctl is-active --quiet opensync-pb.service; then
    log_info "opensync-pb.service: RUNNING"
else
    log_error "opensync-pb.service: FAILED"
    systemctl status opensync-pb.service --no-pager
fi

if systemctl is-active --quiet opensync-frontend.service; then
    log_info "opensync-frontend.service: RUNNING"
else
    log_error "opensync-frontend.service: FAILED"
    systemctl status opensync-frontend.service --no-pager
fi

echo
log_info "================================"
log_info "Installation complete!"
echo
log_info "Services:"
log_info "  - Pocketbase:  http://127.0.0.1:8090"
log_info "  - Frontend:    http://127.0.0.1:5173"
log_info "  - Admin UI:    http://127.0.0.1:8090/_/"
echo
log_info "Logs:"
log_info "  - Pocketbase:  $LOG_DIR/pocketbase.log"
log_info "  - Frontend:    $LOG_DIR/frontend.log"
echo
log_info "Commands:"
log_info "  systemctl status opensync-pb"
log_info "  systemctl status opensync-frontend"
log_info "  journalctl -u opensync-pb -f"
log_info "  journalctl -u opensync-frontend -f"
echo
log_info "Next steps:"
log_info "  1. Configure Traefik to proxy to port 5173"
log_info "  2. Set up Pocketbase admin at http://127.0.0.1:8090/_/"
log_info "  3. Configure Authelia middleware for authentication"
