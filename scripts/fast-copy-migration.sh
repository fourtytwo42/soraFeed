#!/bin/bash

##############################################################################
# Ultra-Fast COPY Migration (for empty destination database)
# Uses PostgreSQL COPY - the fastest method possible
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Source database
SOURCE_DB_HOST=${DB_HOST:-localhost}
SOURCE_DB_PORT=${DB_PORT:-5432}
SOURCE_DB_NAME=${DB_NAME:-sora_feed}
SOURCE_DB_USER=${DB_USER:-postgres}
SOURCE_DB_PASSWORD=${DB_PASSWORD:-postgres}

# Destination database
DEST_DB_HOST="192.168.50.104"
DEST_DB_PORT="5432"
DEST_DB_NAME="sora_feed"
DEST_DB_USER="postgres"
DEST_DB_PASSWORD="postgres"

TEMP_DIR="/tmp/migration_fast"
mkdir -p "$TEMP_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Ultra-Fast COPY Migration${NC}"
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

# Test connections
print_info "Testing connections..."
export PGPASSWORD="$SOURCE_DB_PASSWORD"
psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -c "SELECT 1" > /dev/null 2>&1 || { print_error "Can't connect to source"; exit 1; }

export PGPASSWORD="$DEST_DB_PASSWORD"
psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -c "SELECT 1" > /dev/null 2>&1 || { print_error "Can't connect to destination"; exit 1; }

print_success "Connected to both databases"

# Verify destination is empty
DEST_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
if [ "$DEST_POSTS" -gt 1000 ]; then
    print_error "Destination has $DEST_POSTS posts - should be empty!"
    echo "Run: TRUNCATE TABLE sora_posts, creators, scanner_stats CASCADE;"
    exit 1
fi

print_success "Destination is empty and ready"
echo ""

START_TIME=$(date +%s)

# Migrate each table using COPY
for table in creators scanner_stats sora_posts; do
    export PGPASSWORD="$SOURCE_DB_PASSWORD"
    ROW_COUNT=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | xargs)
    
    echo -e "${CYAN}▶${NC} Migrating: ${BLUE}$table${NC} ($(printf '%\''d' $ROW_COUNT) rows)"
    
    TABLE_START=$(date +%s)
    TEMP_FILE="$TEMP_DIR/${table}.dat"
    
    # Export using COPY (super fast)
    print_info "  Exporting from source..."
    export PGPASSWORD="$SOURCE_DB_PASSWORD"
    psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" \
         -c "\COPY $table TO STDOUT BINARY" > "$TEMP_FILE" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        FILE_SIZE=$(du -h "$TEMP_FILE" | cut -f1)
        print_success "  Exported: $FILE_SIZE"
        
        # Import using COPY (super fast)  
        print_info "  Importing to destination..."
        export PGPASSWORD="$DEST_DB_PASSWORD"
        
        # Import with progress monitoring
        (
            cat "$TEMP_FILE" | psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" \
                 -c "\COPY $table FROM STDIN BINARY" 2>&1
        ) &
        
        IMPORT_PID=$!
        
        # Show progress while importing
        while kill -0 $IMPORT_PID 2>/dev/null; do
            CURRENT=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | xargs || echo "0")
            if [ "$CURRENT" -gt 0 ]; then
                PERCENT=$((CURRENT * 100 / ROW_COUNT))
                if [ $PERCENT -gt 100 ]; then PERCENT=100; fi
                
                ELAPSED=$(($(date +%s) - TABLE_START))
                if [ $ELAPSED -gt 0 ] && [ $CURRENT -gt 0 ]; then
                    RATE=$((CURRENT / ELAPSED))
                    REMAINING=$((ROW_COUNT - CURRENT))
                    if [ $RATE -gt 0 ]; then
                        ETA=$((REMAINING / RATE))
                        if [ $ETA -gt 60 ]; then
                            ETA_STR="$((ETA / 60))m $((ETA % 60))s"
                        else
                            ETA_STR="${ETA}s"
                        fi
                    else
                        ETA_STR="..."
                    fi
                    
                    FILLED=$((PERCENT / 2))
                    EMPTY=$((50 - FILLED))
                    printf "\r  ["
                    printf "%${FILLED}s" | tr ' ' '█'
                    printf "%${EMPTY}s" | tr ' ' '░'
                    printf "] %d%% (%'d/%'d) %'d/s ETA:%s   " $PERCENT $CURRENT $ROW_COUNT $RATE "$ETA_STR"
                fi
            fi
            sleep 1
        done
        
        wait $IMPORT_PID
        
        # Final count
        FINAL=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | xargs)
        
        TABLE_TIME=$(($(date +%s) - TABLE_START))
        echo ""
        print_success "  Completed: $(printf '%\''d' $FINAL) rows in ${TABLE_TIME}s"
        
        # Clean up
        rm -f "$TEMP_FILE"
    else
        print_error "  Failed to export $table"
    fi
    
    echo ""
done

# Final verification
print_info "Final verification..."
export PGPASSWORD="$DEST_DB_PASSWORD"
FINAL_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
FINAL_CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
TOTAL_MIN=$((TOTAL_TIME / 60))
TOTAL_SEC=$((TOTAL_TIME % 60))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print_success "Migration Complete!"
echo ""
printf "  📊 Posts:     %'d\n" $FINAL_POSTS
printf "  👤 Creators:  %'d\n" $FINAL_CREATORS
echo ""
echo "  ⏱️  Total time: ${TOTAL_MIN}m ${TOTAL_SEC}s"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Cleanup
rm -rf "$TEMP_DIR"
unset PGPASSWORD

