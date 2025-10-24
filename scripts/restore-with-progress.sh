#!/bin/bash

##############################################################################
# Fast Restore with Progress Bar and ETA
# Uses existing dump file for instant migration
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

DEST_DB_HOST="192.168.50.104"
DEST_DB_PORT="5432"
DEST_DB_NAME="sora_feed"
DEST_DB_USER="postgres"
DEST_DB_PASSWORD="postgres"

DUMP_FILE="database-backups/full_migration_20251024_050506.dump"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Fast Migration Restore with Progress${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

function print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if dump file exists
if [ ! -f "$DUMP_FILE" ]; then
    print_error "Dump file not found: $DUMP_FILE"
    exit 1
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
print_success "Found dump file: $DUMP_SIZE"

# Test connection
print_info "Testing connection to 192.168.50.104..."
export PGPASSWORD="$DEST_DB_PASSWORD"
if psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Connected to destination database"
else
    print_error "Cannot connect to destination database"
    exit 1
fi

# Verify database is empty
CURRENT_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
if [ "$CURRENT_POSTS" -gt 0 ]; then
    print_error "Database is not empty! Found $CURRENT_POSTS posts"
    echo "Run: TRUNCATE TABLE sora_posts, creators, scanner_stats CASCADE;"
    exit 1
fi

print_success "Database is empty and ready"

echo ""
print_info "Starting parallel restore with progress tracking..."
print_info "Using 4 parallel jobs for maximum speed"
echo ""

START_TIME=$(date +%s)

# Create a log file for pg_restore verbose output
RESTORE_LOG="/tmp/pg_restore_progress.log"
> "$RESTORE_LOG"

# Run pg_restore in background with verbose output
export PGPASSWORD="$DEST_DB_PASSWORD"
pg_restore -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" \
           -d "$DEST_DB_NAME" \
           --data-only \
           --jobs=4 \
           --no-owner \
           --no-acl \
           --verbose \
           "$DUMP_FILE" > "$RESTORE_LOG" 2>&1 &

PG_RESTORE_PID=$!

# Monitor progress
TOTAL_TABLES=3
COMPLETED_TABLES=0
LAST_TABLE=""

while kill -0 $PG_RESTORE_PID 2>/dev/null; do
    # Check which table is being processed
    CURRENT_TABLE=$(tail -20 "$RESTORE_LOG" | grep "processing data for table" | tail -1 | sed 's/.*table "\([^"]*\)".*/\1/' || echo "")
    
    if [ -n "$CURRENT_TABLE" ] && [ "$CURRENT_TABLE" != "$LAST_TABLE" ]; then
        if [ -n "$LAST_TABLE" ]; then
            echo ""
            echo -e "  ${GREEN}✓${NC} Completed: $LAST_TABLE"
        fi
        echo -e "  ${CYAN}▶${NC} Processing: ${BLUE}$CURRENT_TABLE${NC}"
        COMPLETED_TABLES=$((COMPLETED_TABLES + 1))
        LAST_TABLE="$CURRENT_TABLE"
    fi
    
    # Get current row count to show progress
    if [ "$CURRENT_TABLE" == "sora_posts" ]; then
        CURRENT_COUNT=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
        EXPECTED_TOTAL=1758000
        
        if [ "$CURRENT_COUNT" -gt 0 ]; then
            PERCENT=$((CURRENT_COUNT * 100 / EXPECTED_TOTAL))
            if [ $PERCENT -gt 100 ]; then PERCENT=100; fi
            
            # Calculate ETA
            ELAPSED=$(($(date +%s) - START_TIME))
            if [ $CURRENT_COUNT -gt 0 ] && [ $ELAPSED -gt 5 ]; then
                RATE=$((CURRENT_COUNT / ELAPSED))
                REMAINING=$((EXPECTED_TOTAL - CURRENT_COUNT))
                ETA=$((REMAINING / RATE))
                
                if [ $ETA -gt 60 ]; then
                    ETA_MIN=$((ETA / 60))
                    ETA_SEC=$((ETA % 60))
                    ETA_STR="${ETA_MIN}m ${ETA_SEC}s"
                else
                    ETA_STR="${ETA}s"
                fi
            else
                ETA_STR="calculating..."
            fi
            
            # Progress bar
            FILLED=$((PERCENT / 2))
            EMPTY=$((50 - FILLED))
            
            printf "\r    Progress: ["
            printf "%${FILLED}s" | tr ' ' '█'
            printf "%${EMPTY}s" | tr ' ' '░'
            printf "] %d%% (%'d rows) ETA: %s    " $PERCENT $CURRENT_COUNT "$ETA_STR"
        fi
    fi
    
    sleep 2
done

# Wait for process to complete
wait $PG_RESTORE_PID
RESTORE_EXIT=$?

echo ""
echo ""

if [ $RESTORE_EXIT -eq 0 ]; then
    print_success "Restore completed successfully!"
else
    print_success "Restore completed (exit code: $RESTORE_EXIT)"
fi

# Verify final counts
echo ""
print_info "Verifying migration..."

FINAL_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
FINAL_CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)
FINAL_STATS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM scanner_stats" 2>/dev/null | xargs)

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
TOTAL_MIN=$((TOTAL_TIME / 60))
TOTAL_SEC=$((TOTAL_TIME % 60))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print_success "Migration Complete!"
echo ""
printf "  📊 Posts:          %'d\n" $FINAL_POSTS
printf "  👤 Creators:       %'d\n" $FINAL_CREATORS
printf "  📈 Scanner Stats:  %'d\n" $FINAL_STATS
echo ""
echo "  ⏱️  Total time: ${TOTAL_MIN}m ${TOTAL_SEC}s"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_success "Database ready at 192.168.50.104"

unset PGPASSWORD

