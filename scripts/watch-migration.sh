#!/bin/bash

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

DEST_DB_HOST="192.168.50.104"
DEST_DB_PORT="5432"
DEST_DB_NAME="sora_feed"
DEST_DB_USER="postgres"
DEST_DB_PASSWORD="postgres"

EXPECTED_POSTS=1758000
EXPECTED_CREATORS=396000

START_TIME=$(date +%s)
LAST_POSTS=0
LAST_CHECK=$(date +%s)

clear

while true; do
    export PGPASSWORD="$DEST_DB_PASSWORD"
    
    # Get current counts
    POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
    CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)
    
    # Calculate progress
    if [ "$POSTS" -gt 0 ]; then
        POSTS_PERCENT=$((POSTS * 100 / EXPECTED_POSTS))
    else
        POSTS_PERCENT=0
    fi
    
    if [ "$CREATORS" -gt 0 ]; then
        CREATORS_PERCENT=$((CREATORS * 100 / EXPECTED_CREATORS))
    else
        CREATORS_PERCENT=0
    fi
    
    # Calculate rate and ETA for posts
    NOW=$(date +%s)
    TIME_DIFF=$((NOW - LAST_CHECK))
    
    if [ $TIME_DIFF -ge 2 ] && [ "$POSTS" -gt "$LAST_POSTS" ]; then
        RATE=$(( (POSTS - LAST_POSTS) / TIME_DIFF ))
        REMAINING=$((EXPECTED_POSTS - POSTS))
        
        if [ $RATE -gt 0 ]; then
            ETA=$((REMAINING / RATE))
            ETA_MIN=$((ETA / 60))
            ETA_SEC=$((ETA % 60))
            ETA_STR="${ETA_MIN}m ${ETA_SEC}s"
            RATE_STR="${RATE} rows/sec"
        else
            ETA_STR="calculating..."
            RATE_STR="calculating..."
        fi
        
        LAST_POSTS=$POSTS
        LAST_CHECK=$NOW
    fi
    
    # Draw progress bars
    tput cup 0 0
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Live Migration Progress - 192.168.50.104${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Posts progress bar
    echo -e "${CYAN}Posts:${NC}"
    POSTS_FILLED=$((POSTS_PERCENT / 2))
    POSTS_EMPTY=$((50 - POSTS_FILLED))
    printf "  ["
    printf "%${POSTS_FILLED}s" | tr ' ' '█'
    printf "%${POSTS_EMPTY}s" | tr ' ' '░'
    printf "] %d%%\n" $POSTS_PERCENT
    printf "  %'d / %'d rows\n" $POSTS $EXPECTED_POSTS
    if [ -n "$RATE_STR" ]; then
        echo "  Rate: $RATE_STR | ETA: ${ETA_STR:-calculating...}"
    fi
    echo ""
    
    # Creators progress bar
    echo -e "${CYAN}Creators:${NC}"
    CREATORS_FILLED=$((CREATORS_PERCENT / 2))
    CREATORS_EMPTY=$((50 - CREATORS_FILLED))
    printf "  ["
    printf "%${CREATORS_FILLED}s" | tr ' ' '█'
    printf "%${CREATORS_EMPTY}s" | tr ' ' '░'
    printf "] %d%%\n" $CREATORS_PERCENT
    printf "  %'d / %'d rows\n" $CREATORS $EXPECTED_CREATORS
    echo ""
    
    # Elapsed time
    ELAPSED=$((NOW - START_TIME))
    ELAPSED_MIN=$((ELAPSED / 60))
    ELAPSED_SEC=$((ELAPSED % 60))
    echo -e "${CYAN}Elapsed:${NC} ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Press Ctrl+C to stop watching"
    
    # Check if complete
    if [ "$POSTS" -ge $EXPECTED_POSTS ] && [ "$CREATORS" -ge $((EXPECTED_CREATORS - 1000)) ]; then
        echo ""
        echo -e "${GREEN}✓ Migration Complete!${NC}"
        break
    fi
    
    sleep 2
done

unset PGPASSWORD

