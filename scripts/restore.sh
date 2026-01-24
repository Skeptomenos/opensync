#!/bin/bash
#
# OpenSync Pocketbase Database Restore Script
#
# Restores a backup to the pb_data directory.
# Usage: ./scripts/restore.sh <backup-file>
#
# Options:
#   -f, --force       Skip confirmation prompt
#   -l, --list        List available backups
#   -h, --help        Show this help message
#
# Examples:
#   ./scripts/restore.sh --list                          # Show available backups
#   ./scripts/restore.sh backups/pb_data_backup_*.tar.gz # Restore specific backup
#   ./scripts/restore.sh -f backups/pb_data_backup_*.tar.gz  # Force restore

set -euo pipefail

# Default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PB_DATA_DIR="${PROJECT_ROOT}/pb_data"
BACKUP_DIR="${PROJECT_ROOT}/backups"
FORCE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warn() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

# Show help
show_help() {
    sed -n '3,17p' "$0" | sed 's/^# //' | sed 's/^#//'
}

# List available backups
list_backups() {
    echo "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "  No backup directory found."
        exit 0
    fi
    
    BACKUPS=$(find "$BACKUP_DIR" -name "pb_data_backup_*.tar.gz" -type f 2>/dev/null | sort -r)
    
    if [ -z "$BACKUPS" ]; then
        echo "  No backups found."
        exit 0
    fi
    
    echo "  # | Date       | Time     | Size   | Filename"
    echo "  --|------------|----------|--------|------------------------------------------"
    
    COUNT=1
    while IFS= read -r backup; do
        FILENAME=$(basename "$backup")
        SIZE=$(du -h "$backup" 2>/dev/null | cut -f1)
        # Extract timestamp from filename: pb_data_backup_YYYYMMDD_HHMMSS.tar.gz
        TIMESTAMP=$(echo "$FILENAME" | sed 's/pb_data_backup_//' | sed 's/\.tar\.gz//')
        DATE=$(echo "$TIMESTAMP" | cut -d_ -f1 | sed 's/\(....\)\(..\)\(..\)/\1-\2-\3/')
        TIME=$(echo "$TIMESTAMP" | cut -d_ -f2 | sed 's/\(..\)\(..\)\(..\)/\1:\2:\3/')
        printf "  %d | %s | %s | %s | %s\n" "$COUNT" "$DATE" "$TIME" "$SIZE" "$FILENAME"
        COUNT=$((COUNT + 1))
    done <<< "$BACKUPS"
    
    echo ""
    echo "To restore: ./scripts/restore.sh backups/<filename>"
}

# Parse arguments
BACKUP_FILE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -l|--list)
            list_backups
            exit 0
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# Validate backup file argument
if [ -z "$BACKUP_FILE" ]; then
    error "No backup file specified."
    echo ""
    show_help
    exit 1
fi

# Validate backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not found: $BACKUP_FILE"
    echo ""
    echo "Available backups:"
    list_backups
    exit 1
fi

# Confirm restore
if [ "$FORCE" = false ]; then
    warn "This will REPLACE the current database with the backup."
    
    if [ -d "$PB_DATA_DIR" ]; then
        CURRENT_SIZE=$(du -sh "$PB_DATA_DIR" 2>/dev/null | cut -f1)
        echo "Current pb_data: $CURRENT_SIZE"
    fi
    
    BACKUP_SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1)
    echo "Backup file: $BACKUP_SIZE"
    echo ""
    
    read -p "Are you sure you want to restore? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Check if Pocketbase is running
if pgrep -x "pocketbase" > /dev/null 2>&1; then
    error "Pocketbase is currently running!"
    error "Stop Pocketbase before restoring: pkill pocketbase"
    exit 1
fi

echo ""
echo "Starting restore..."
echo "  Backup: $BACKUP_FILE"
echo "  Destination: $PB_DATA_DIR"

# Backup current pb_data if it exists (just in case)
if [ -d "$PB_DATA_DIR" ]; then
    SAFETY_BACKUP="${PB_DATA_DIR}_pre_restore_$(date +%Y%m%d_%H%M%S)"
    echo "  Creating safety backup: $SAFETY_BACKUP"
    mv "$PB_DATA_DIR" "$SAFETY_BACKUP"
fi

# Extract backup
echo "  Extracting backup..."
if tar -xzf "$BACKUP_FILE" -C "$PROJECT_ROOT" 2>/dev/null; then
    success "Restore completed successfully!"
    
    # Show restored size
    RESTORED_SIZE=$(du -sh "$PB_DATA_DIR" 2>/dev/null | cut -f1)
    echo ""
    echo "Restored pb_data: $RESTORED_SIZE"
    echo ""
    echo "Next steps:"
    echo "  1. Start Pocketbase: ./bin/pocketbase serve"
    echo "  2. Verify data at: http://localhost:8090/_/"
    
    # Offer to remove safety backup
    if [ -d "$SAFETY_BACKUP" ] && [ "$FORCE" = false ]; then
        echo ""
        read -p "Remove safety backup ($SAFETY_BACKUP)? (yes/no): " REMOVE_SAFETY
        if [ "$REMOVE_SAFETY" = "yes" ]; then
            rm -rf "$SAFETY_BACKUP"
            success "Safety backup removed."
        else
            echo "Safety backup kept at: $SAFETY_BACKUP"
        fi
    fi
else
    error "Restore failed!"
    
    # Attempt to recover from safety backup
    if [ -d "$SAFETY_BACKUP" ]; then
        warn "Attempting to recover from safety backup..."
        mv "$SAFETY_BACKUP" "$PB_DATA_DIR"
        success "Original database restored."
    fi
    
    exit 1
fi

exit 0
