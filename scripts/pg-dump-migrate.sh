#!/bin/bash

##############################################################################
# PostgreSQL Database Migration Script using pg_dump/pg_restore
# This is the most reliable method for PostgreSQL migrations
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables (only DB related ones)
if [ -f .env ]; then
    export $(cat .env | grep -E '^DB_' | xargs)
fi

# Configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-sora_feed}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

BACKUP_DIR="database-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PostgreSQL Database Migration Tool${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

function print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

function print_error() {
    echo -e "${RED}✗${NC} $1"
}

function export_database() {
    print_info "Exporting database: $DB_NAME"
    
    # Set password for pg_dump
    export PGPASSWORD="$DB_PASSWORD"
    
    # Dump database
    print_info "Creating SQL dump..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
            --clean \
            --if-exists \
            --create \
            --format=plain \
            --encoding=UTF8 \
            "$DB_NAME" > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        print_success "Database exported to: $BACKUP_FILE"
        
        # Get file size
        FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        print_info "Backup size: $FILE_SIZE"
        
        # Compress the backup
        print_info "Compressing backup..."
        gzip "$BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
            print_success "Compressed to: $COMPRESSED_FILE"
            print_info "Compressed size: $COMPRESSED_SIZE"
            
            echo ""
            print_success "Export complete!"
            echo ""
            print_info "To transfer to another server, run:"
            echo "  scp $COMPRESSED_FILE user@remote-server:/path/to/soraFeed/database-backups/"
            echo ""
            print_info "Then on the remote server, run:"
            echo "  cd /path/to/soraFeed"
            echo "  bash scripts/pg-dump-migrate.sh import $COMPRESSED_FILE"
        else
            print_error "Failed to compress backup"
            exit 1
        fi
    else
        print_error "Failed to export database"
        exit 1
    fi
    
    unset PGPASSWORD
}

function import_database() {
    local IMPORT_FILE="$1"
    
    if [ -z "$IMPORT_FILE" ]; then
        print_error "Please specify a backup file to import"
        echo "Usage: $0 import <backup-file>"
        exit 1
    fi
    
    if [ ! -f "$IMPORT_FILE" ]; then
        print_error "Backup file not found: $IMPORT_FILE"
        exit 1
    fi
    
    print_info "Importing database from: $IMPORT_FILE"
    
    # Decompress if needed
    if [[ "$IMPORT_FILE" == *.gz ]]; then
        print_info "Decompressing backup..."
        SQL_FILE="${IMPORT_FILE%.gz}"
        gunzip -c "$IMPORT_FILE" > "$SQL_FILE"
        
        if [ $? -ne 0 ]; then
            print_error "Failed to decompress backup"
            exit 1
        fi
    else
        SQL_FILE="$IMPORT_FILE"
    fi
    
    print_warning "This will replace the existing database: $DB_NAME"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Import cancelled"
        exit 0
    fi
    
    # Set password for psql
    export PGPASSWORD="$DB_PASSWORD"
    
    # Import the database
    print_info "Restoring database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres < "$SQL_FILE"
    
    if [ $? -eq 0 ]; then
        print_success "Database imported successfully!"
        
        # Clean up decompressed file if we created it
        if [[ "$IMPORT_FILE" == *.gz ]]; then
            rm -f "$SQL_FILE"
        fi
    else
        print_error "Failed to import database"
        exit 1
    fi
    
    unset PGPASSWORD
}

function list_backups() {
    print_info "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        ls -lh "$BACKUP_DIR" | grep -v "^total" | awk '{print "  " $9 " (" $5 ")"}'
    else
        print_warning "No backups found"
    fi
}

function show_help() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  export              Export/backup the current database"
    echo "  import <file>       Import a database backup"
    echo "  list                List available backups"
    echo "  help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 export"
    echo "  $0 import database-backups/sora_feed_20250101_120000.sql.gz"
    echo "  $0 list"
    echo ""
    echo "Environment variables (from .env):"
    echo "  DB_HOST     = $DB_HOST"
    echo "  DB_PORT     = $DB_PORT"
    echo "  DB_NAME     = $DB_NAME"
    echo "  DB_USER     = $DB_USER"
    echo ""
}

# Main script
case "${1:-help}" in
    export)
        export_database
        ;;
    import)
        import_database "$2"
        ;;
    list)
        list_backups
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

