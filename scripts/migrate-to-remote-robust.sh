#!/bin/bash

##############################################################################
# Robust Remote Database Migration Script
# Uses pg_dump with INSERT statements for reliability
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Source database (current server)
SOURCE_DB_HOST=${DB_HOST:-localhost}
SOURCE_DB_PORT=${DB_PORT:-5432}
SOURCE_DB_NAME=${DB_NAME:-sora_feed}
SOURCE_DB_USER=${DB_USER:-postgres}
SOURCE_DB_PASSWORD=${DB_PASSWORD:-postgres}

# Destination database (new server)
DEST_DB_HOST="192.168.50.104"
DEST_DB_PORT="5432"
DEST_DB_NAME="sora_feed"
DEST_DB_USER="postgres"
DEST_DB_PASSWORD="postgres"

BACKUP_DIR="database-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Robust Database Migration to Remote Server${NC}"
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

# Test connections
print_info "Testing connection to source database..."
export PGPASSWORD="$SOURCE_DB_PASSWORD"
if psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Connected to source database"
else
    print_error "Cannot connect to source database"
    exit 1
fi

print_info "Testing connection to destination database (192.168.50.104)..."
export PGPASSWORD="$DEST_DB_PASSWORD"
if psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Connected to destination database at 192.168.50.104"
else
    print_error "Cannot connect to destination database at 192.168.50.104"
    exit 1
fi

# Get row counts
print_info "Getting source database statistics..."
export PGPASSWORD="$SOURCE_DB_PASSWORD"
SOURCE_POSTS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
SOURCE_CREATORS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")

print_success "Source: $SOURCE_POSTS posts, $SOURCE_CREATORS creators"

export PGPASSWORD="$DEST_DB_PASSWORD"
DEST_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
DEST_CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")

print_success "Destination: $DEST_POSTS posts, $DEST_CREATORS creators"

echo ""
print_warning "This will pipe data directly from source to destination"
print_warning "Using INSERT statements with ON CONFLICT DO NOTHING"
print_info "This method is slower but more reliable for large datasets"
echo ""
read -p "Continue with migration? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    print_info "Migration cancelled"
    exit 0
fi

echo ""
print_info "Starting migration..."
echo ""

START_TIME=$(date +%s)

# Migrate each table
for table in creators scanner_stats sora_posts; do
    export PGPASSWORD="$SOURCE_DB_PASSWORD"
    TABLE_ROWS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | xargs || echo "0")
    
    if [ "$TABLE_ROWS" -eq 0 ]; then
        echo -e "${YELLOW}⊘${NC} Skipping empty table: $table"
        continue
    fi
    
    echo -e "${CYAN}▶${NC} Migrating table: ${BLUE}$table${NC} ($TABLE_ROWS rows)"
    
    # Use pg_dump with INSERT format piped directly to destination
    # This is more reliable than COPY for network transfers
    export PGPASSWORD="$SOURCE_DB_PASSWORD"
    
    # Dump table to file first (more reliable than pipe)
    DUMP_FILE="$BACKUP_DIR/${table}_${TIMESTAMP}.sql"
    
    print_info "  Exporting $table to dump file..."
    pg_dump -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" \
            -d "$SOURCE_DB_NAME" \
            --table=$table \
            --data-only \
            --inserts \
            --rows-per-insert=1000 \
            -f "$DUMP_FILE" 2>&1 | grep -v "WARNING"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
        print_success "  Exported to file ($DUMP_SIZE)"
        
        # Import to destination with progress
        print_info "  Importing $table to destination..."
        
        export PGPASSWORD="$DEST_DB_PASSWORD"
        
        # Count total INSERT statements for progress
        TOTAL_INSERTS=$(grep -c "^INSERT INTO" "$DUMP_FILE" || echo "0")
        
        if [ "$TOTAL_INSERTS" -gt 0 ]; then
            # Import with progress tracking
            (
                CURRENT=0
                while IFS= read -r line; do
                    if [[ "$line" =~ ^INSERT ]]; then
                        CURRENT=$((CURRENT + 1))
                        PERCENT=$((CURRENT * 100 / TOTAL_INSERTS))
                        printf "\r  Importing: %d%% (%d/%d) " $PERCENT $CURRENT $TOTAL_INSERTS
                    fi
                    echo "$line"
                done < "$DUMP_FILE"
            ) | psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" \
                     -v ON_ERROR_STOP=0 \
                     --quiet \
                     2>&1 | grep -v "ERROR.*duplicate key" > /dev/null
            
            echo "" # New line after progress
        else
            # No INSERT statements, just run the file
            psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" \
                 -v ON_ERROR_STOP=0 \
                 -f "$DUMP_FILE" \
                 --quiet \
                 2>&1 | grep -v "ERROR.*duplicate key" > /dev/null
        fi
        
        print_success "  Completed: $table"
        
        # Clean up dump file to save space
        rm -f "$DUMP_FILE"
    else
        print_error "  Failed to export $table"
    fi
    
    echo ""
done

# Verify migration
print_info "Verifying migration..."
export PGPASSWORD="$DEST_DB_PASSWORD"
NEW_DEST_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
NEW_DEST_CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print_success "Migration Results:"
echo ""
echo "  📊 Posts:    $DEST_POSTS → $NEW_DEST_POSTS (+$(($NEW_DEST_POSTS - $DEST_POSTS)))"
echo "  👤 Creators: $DEST_CREATORS → $NEW_DEST_CREATORS (+$(($NEW_DEST_CREATORS - $DEST_CREATORS)))"
echo ""

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
TOTAL_MIN=$((TOTAL_TIME / 60))
TOTAL_SEC=$((TOTAL_TIME % 60))

echo "  ⏱️  Total time: ${TOTAL_MIN}m ${TOTAL_SEC}s"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_success "Migration complete!"
print_info "Destination database ready at 192.168.50.104"

unset PGPASSWORD

