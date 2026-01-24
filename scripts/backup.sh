#!/bin/bash
#
# OpenSync Pocketbase Database Backup Script
#
# Creates timestamped backups of the pb_data directory.
# Usage: ./scripts/backup.sh [options]
#
# Options:
#   -d, --dest DIR    Backup destination directory (default: ./backups)
#   -k, --keep N      Number of backups to keep (default: 10, 0 = unlimited)
#   -q, --quiet       Suppress output except errors
#   -h, --help        Show this help message
#
# Examples:
#   ./scripts/backup.sh                        # Backup to ./backups
#   ./scripts/backup.sh -d /mnt/nas/backups    # Backup to NAS
#   ./scripts/backup.sh -k 5                   # Keep only 5 recent backups

set -euo pipefail

# Default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PB_DATA_DIR="${PROJECT_ROOT}/pb_data"
BACKUP_DEST="${PROJECT_ROOT}/backups"
KEEP_BACKUPS=10
QUIET=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log() {
    if [ "$QUIET" = false ]; then
        echo -e "$1"
    fi
}

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

success() {
    log "${GREEN}$1${NC}"
}

warn() {
    log "${YELLOW}WARNING: $1${NC}"
}

# Show help
show_help() {
    sed -n '3,17p' "$0" | sed 's/^# //' | sed 's/^#//'
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dest)
            BACKUP_DEST="$2"
            shift 2
            ;;
        -k|--keep)
            KEEP_BACKUPS="$2"
            shift 2
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate pb_data directory exists
if [ ! -d "$PB_DATA_DIR" ]; then
    error "Pocketbase data directory not found: $PB_DATA_DIR"
    error "Make sure Pocketbase has been initialized."
    exit 1
fi

# Create backup destination if it doesn't exist
if [ ! -d "$BACKUP_DEST" ]; then
    log "Creating backup directory: $BACKUP_DEST"
    mkdir -p "$BACKUP_DEST"
fi

# Generate timestamp and backup name
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pb_data_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DEST}/${BACKUP_NAME}"
BACKUP_ARCHIVE="${BACKUP_PATH}.tar.gz"

# Get size of pb_data for logging
PB_SIZE=$(du -sh "$PB_DATA_DIR" 2>/dev/null | cut -f1)

log "Starting backup..."
log "  Source: $PB_DATA_DIR ($PB_SIZE)"
log "  Destination: $BACKUP_ARCHIVE"

# Perform backup
# Using tar with gzip for efficient storage
# Exclude logs and temporary files
if tar -czf "$BACKUP_ARCHIVE" \
    -C "$(dirname "$PB_DATA_DIR")" \
    --exclude='pb_data/logs/*' \
    --exclude='pb_data/*.tmp' \
    "$(basename "$PB_DATA_DIR")" 2>/dev/null; then
    
    BACKUP_SIZE=$(du -sh "$BACKUP_ARCHIVE" 2>/dev/null | cut -f1)
    success "Backup created successfully: $BACKUP_ARCHIVE ($BACKUP_SIZE)"
else
    error "Backup failed!"
    rm -f "$BACKUP_ARCHIVE" 2>/dev/null
    exit 1
fi

# Cleanup old backups if KEEP_BACKUPS > 0
if [ "$KEEP_BACKUPS" -gt 0 ]; then
    BACKUP_COUNT=$(find "$BACKUP_DEST" -name "pb_data_backup_*.tar.gz" -type f | wc -l | tr -d ' ')
    
    if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
        log "Cleaning up old backups (keeping $KEEP_BACKUPS most recent)..."
        
        # Find and delete oldest backups beyond the keep limit
        REMOVE_COUNT=$((BACKUP_COUNT - KEEP_BACKUPS))
        find "$BACKUP_DEST" -name "pb_data_backup_*.tar.gz" -type f -print0 | \
            xargs -0 ls -t | \
            tail -n "$REMOVE_COUNT" | \
            while read -r OLD_BACKUP; do
                log "  Removing: $(basename "$OLD_BACKUP")"
                rm -f "$OLD_BACKUP"
            done
        
        success "Removed $REMOVE_COUNT old backup(s)"
    fi
fi

# Show backup summary
if [ "$QUIET" = false ]; then
    echo ""
    echo "Backup Summary"
    echo "=============="
    echo "  Archive:   $BACKUP_ARCHIVE"
    echo "  Size:      $BACKUP_SIZE"
    echo "  Timestamp: $TIMESTAMP"
    
    TOTAL_BACKUPS=$(find "$BACKUP_DEST" -name "pb_data_backup_*.tar.gz" -type f | wc -l | tr -d ' ')
    echo "  Total backups: $TOTAL_BACKUPS"
    
    if [ "$KEEP_BACKUPS" -gt 0 ]; then
        echo "  Retention: $KEEP_BACKUPS"
    else
        echo "  Retention: unlimited"
    fi
fi

exit 0
