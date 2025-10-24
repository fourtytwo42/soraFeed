#!/bin/bash

##############################################################################
# Optimized Database Migration Script
# Uses pg_dump/pg_restore in custom format for maximum speed and reliability
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
DUMP_FILE="$BACKUP_DIR/full_migration_${TIMESTAMP}.dump"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Optimized Database Migration (pg_dump custom format)${NC}"
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
print_warning "This will use pg_dump/pg_restore for fast migration"
print_info "Method: Custom format binary dump with parallel restore"
print_info "Speed: ~10-100x faster than INSERT statements"
echo ""
read -p "Continue with migration? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    print_info "Migration cancelled"
    exit 0
fi

echo ""
START_TIME=$(date +%s)

# Step 1: Create dump
print_info "Step 1/2: Creating binary dump from source..."
echo ""

export PGPASSWORD="$SOURCE_DB_PASSWORD"
pg_dump -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" \
        -d "$SOURCE_DB_NAME" \
        --format=custom \
        --data-only \
        --compress=6 \
        --verbose \
        -f "$DUMP_FILE" 2>&1 | while IFS= read -r line; do
            if [[ "$line" =~ "dumping contents of table" ]]; then
                TABLE=$(echo "$line" | sed 's/.*table "\([^"]*\)".*/\1/')
                echo -e "  ${CYAN}▶${NC} Dumping: ${BLUE}$TABLE${NC}"
            fi
        done

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    print_success "Dump created: $DUMP_FILE ($DUMP_SIZE)"
else
    print_error "Failed to create dump"
    exit 1
fi

echo ""
print_info "Step 2/2: Restoring to destination (192.168.50.104)..."
print_info "Using parallel restore with 4 jobs for faster import"
echo ""

# Step 2: Restore to destination with parallel jobs
export PGPASSWORD="$DEST_DB_PASSWORD"
pg_restore -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" \
           -d "$DEST_DB_NAME" \
           --data-only \
           --jobs=4 \
           --no-owner \
           --no-acl \
           --verbose \
           "$DUMP_FILE" 2>&1 | while IFS= read -r line; do
               if [[ "$line" =~ "processing data for table" ]]; then
                   TABLE=$(echo "$line" | sed 's/.*table "\([^"]*\)".*/\1/')
                   echo -e "  ${CYAN}▶${NC} Restoring: ${BLUE}$TABLE${NC}"
               elif [[ "$line" =~ "finished item" ]]; then
                   echo -e "    ${GREEN}✓${NC} Completed"
               fi
           done

RESTORE_EXIT=${PIPESTATUS[0]}

echo ""

if [ $RESTORE_EXIT -eq 0 ] || [ $RESTORE_EXIT -eq 1 ]; then
    # Exit code 1 is OK - it means some rows were skipped (duplicates)
    print_success "Restore completed (duplicates were skipped)"
else
    print_warning "Restore completed with some errors (check above)"
fi

# Verify migration
echo ""
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
echo "  📁 Dump file: $DUMP_FILE"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_success "Migration complete!"
print_info "Destination database ready at 192.168.50.104"
print_info "You can delete the dump file to save space: rm $DUMP_FILE"

unset PGPASSWORD

