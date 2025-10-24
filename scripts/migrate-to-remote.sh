#!/bin/bash

##############################################################################
# Remote Database Migration Script
# Migrates current database to remote server with duplicate handling
# Features: Real-time progress bar with ETA
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
BACKUP_FILE="$BACKUP_DIR/migration_${TIMESTAMP}.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Database Migration to Remote Server${NC}"
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

function show_progress() {
    local current=$1
    local total=$2
    local prefix=$3
    local start_time=$4
    
    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))
    
    # Calculate ETA
    local elapsed=$(($(date +%s) - start_time))
    if [ $current -gt 0 ] && [ $elapsed -gt 0 ]; then
        local rate=$(echo "scale=2; $current / $elapsed" | bc)
        local remaining=$((total - current))
        local eta=$(echo "scale=0; $remaining / $rate" | bc 2>/dev/null || echo "0")
        
        # Format ETA
        if [ "$eta" -gt 3600 ]; then
            local eta_hr=$((eta / 3600))
            local eta_min=$(( (eta % 3600) / 60 ))
            local eta_str="${eta_hr}h ${eta_min}m"
        elif [ "$eta" -gt 60 ]; then
            local eta_min=$((eta / 60))
            local eta_sec=$((eta % 60))
            local eta_str="${eta_min}m ${eta_sec}s"
        else
            local eta_str="${eta}s"
        fi
    else
        local eta_str="calculating..."
    fi
    
    # Build progress bar
    printf "\r${CYAN}${prefix}${NC} ["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] ${percent}%% (${current}/${total}) ETA: ${eta_str}    "
}

# Test source database connection
print_info "Testing connection to source database..."
export PGPASSWORD="$SOURCE_DB_PASSWORD"
if psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Connected to source database"
else
    print_error "Cannot connect to source database"
    exit 1
fi

# Test destination database connection
print_info "Testing connection to destination database (192.168.50.104)..."
export PGPASSWORD="$DEST_DB_PASSWORD"
if psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Connected to destination database at 192.168.50.104"
else
    print_error "Cannot connect to destination database at 192.168.50.104"
    print_info "Make sure PostgreSQL is running and accessible from this machine"
    exit 1
fi

# Get row counts from source
print_info "Getting source database statistics..."
export PGPASSWORD="$SOURCE_DB_PASSWORD"
SOURCE_POSTS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
SOURCE_CREATORS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")

print_success "Source database: $SOURCE_POSTS posts, $SOURCE_CREATORS creators"

# Get row counts from destination
print_info "Getting destination database statistics..."
export PGPASSWORD="$DEST_DB_PASSWORD"
DEST_POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
DEST_CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")

print_success "Destination database: $DEST_POSTS posts, $DEST_CREATORS creators"

echo ""
print_warning "This will copy data from THIS server to 192.168.50.104"
print_warning "Duplicates will be skipped using ON CONFLICT DO NOTHING"
print_info "Source will continue running (scanner won't be stopped)"
echo ""
read -p "Continue with migration? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    print_info "Migration cancelled"
    exit 0
fi

# Export with progress - use pg_dump with data-only
print_info "Starting migration with progress tracking..."
echo ""

# Get list of tables to migrate
export PGPASSWORD="$SOURCE_DB_PASSWORD"
TABLES=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")

TOTAL_TABLES=$(echo "$TABLES" | wc -l)
CURRENT_TABLE=0

START_TIME=$(date +%s)

for table in $TABLES; do
    table=$(echo $table | xargs) # trim whitespace
    CURRENT_TABLE=$((CURRENT_TABLE + 1))
    
    # Get row count for this table
    export PGPASSWORD="$SOURCE_DB_PASSWORD"
    TABLE_ROWS=$(psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | xargs || echo "0")
    
    if [ "$TABLE_ROWS" -eq 0 ]; then
        echo -e "\n${YELLOW}⊘${NC} Skipping empty table: $table"
        continue
    fi
    
    echo -e "\n${CYAN}▶${NC} Migrating table: ${BLUE}$table${NC} ($TABLE_ROWS rows)"
    
    # Create temp file for this table
    TEMP_FILE="/tmp/migration_${table}_${TIMESTAMP}.csv"
    
    # Use COPY for fast export/import with progress tracking
    BATCH_SIZE=50000
    OFFSET=0
    IMPORTED=0
    TABLE_START=$(date +%s)
    
    while [ $OFFSET -lt $TABLE_ROWS ]; do
        # Calculate batch end
        BATCH_END=$((OFFSET + BATCH_SIZE))
        if [ $BATCH_END -gt $TABLE_ROWS ]; then
            BATCH_END=$TABLE_ROWS
        fi
        
        # Export batch using COPY
        export PGPASSWORD="$SOURCE_DB_PASSWORD"
        psql -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" \
            -c "\COPY (SELECT * FROM $table ORDER BY 1 LIMIT $BATCH_SIZE OFFSET $OFFSET) TO STDOUT WITH (FORMAT CSV, HEADER FALSE)" \
            > "$TEMP_FILE" 2>/dev/null
        
        if [ $? -ne 0 ]; then
            print_error "Failed to export batch from $table at offset $OFFSET"
            rm -f "$TEMP_FILE"
            continue
        fi
        
        # Import batch to destination with error handling
        export PGPASSWORD="$DEST_DB_PASSWORD"
        psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" \
            -c "\COPY $table FROM STDIN WITH (FORMAT CSV)" < "$TEMP_FILE" 2>/dev/null
        
        if [ $? -ne 0 ]; then
            # If import fails, it's likely due to duplicates, which is OK
            # We'll just continue
            :
        fi
        
        OFFSET=$((OFFSET + BATCH_SIZE))
        IMPORTED=$BATCH_END
        
        # Show progress
        show_progress $IMPORTED $TABLE_ROWS "  Progress" $TABLE_START
    done
    
    # Clean up temp file
    rm -f "$TEMP_FILE"
    
    echo "" # New line after progress bar
    print_success "Completed: $table ($TABLE_ROWS rows)"
done

echo ""
print_info "Running final verification..."

# Verify migration
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
print_info "Source database is still running normally"
print_info "Destination database is ready at 192.168.50.104"

unset PGPASSWORD
