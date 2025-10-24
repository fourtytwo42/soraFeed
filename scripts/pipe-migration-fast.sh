#!/bin/bash

##############################################################################
# Fastest Migration - Direct Pipe with Progress
##############################################################################

SOURCE_HOST="localhost"
SOURCE_DB="sora_feed"
SOURCE_USER="postgres"
SOURCE_PASS="postgres"

DEST_HOST="192.168.50.104"
DEST_DB="sora_feed"
DEST_USER="postgres"
DEST_PASS="postgres"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FASTEST MIGRATION - Direct Pipe Method"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the pipe in background
echo "Starting migration pipe..."
PGPASSWORD=$SOURCE_PASS pg_dump -h $SOURCE_HOST -U $SOURCE_USER -d $SOURCE_DB \
    --data-only \
    --disable-triggers \
    2>/dev/null | \
PGPASSWORD=$DEST_PASS psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB \
    --quiet \
    2>/dev/null &

PIPE_PID=$!
echo "Migration started (PID: $PIPE_PID)"
echo ""

# Get expected totals
EXPECTED_POSTS=$(PGPASSWORD=$SOURCE_PASS psql -h $SOURCE_HOST -U $SOURCE_USER -d $SOURCE_DB -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
EXPECTED_CREATORS=$(PGPASSWORD=$SOURCE_PASS psql -h $SOURCE_HOST -U $SOURCE_USER -d $SOURCE_DB -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)

echo "Expected: $EXPECTED_POSTS posts, $EXPECTED_CREATORS creators"
echo ""

START_TIME=$(date +%s)
LAST_COUNT=0
LAST_TIME=$START_TIME

# Monitor progress
while kill -0 $PIPE_PID 2>/dev/null; do
    CURRENT_POSTS=$(PGPASSWORD=$DEST_PASS psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs || echo "0")
    CURRENT_CREATORS=$(PGPASSWORD=$DEST_PASS psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs || echo "0")
    
    if [ "$CURRENT_POSTS" -gt 0 ]; then
        PERCENT=$((CURRENT_POSTS * 100 / EXPECTED_POSTS))
        if [ $PERCENT -gt 100 ]; then PERCENT=100; fi
        
        # Calculate rate and ETA
        NOW=$(date +%s)
        ELAPSED=$((NOW - START_TIME))
        
        if [ $ELAPSED -gt 5 ] && [ $CURRENT_POSTS -gt $LAST_COUNT ]; then
            TIME_DIFF=$((NOW - LAST_TIME))
            if [ $TIME_DIFF -gt 0 ]; then
                RATE=$(( (CURRENT_POSTS - LAST_COUNT) / TIME_DIFF ))
                REMAINING=$((EXPECTED_POSTS - CURRENT_POSTS))
                
                if [ $RATE -gt 0 ]; then
                    ETA=$((REMAINING / RATE))
                    if [ $ETA -gt 60 ]; then
                        ETA_STR="$((ETA / 60))m $((ETA % 60))s"
                    else
                        ETA_STR="${ETA}s"
                    fi
                    RATE_STR="$RATE/s"
                else
                    ETA_STR="calc..."
                    RATE_STR="calc..."
                fi
                
                LAST_COUNT=$CURRENT_POSTS
                LAST_TIME=$NOW
            fi
        fi
        
        # Progress bar
        FILLED=$((PERCENT / 2))
        EMPTY=$((50 - FILLED))
        
        printf "\rPosts: ["
        printf "%${FILLED}s" | tr ' ' '█'
        printf "%${EMPTY}s" | tr ' ' '░'
        printf "] %d%% (%'d/%'d) %s ETA:%s | Creators: %'d   " \
            $PERCENT $CURRENT_POSTS $EXPECTED_POSTS "${RATE_STR:-0/s}" "${ETA_STR:-...}" $CURRENT_CREATORS
    else
        printf "\rWaiting for data transfer to begin...   "
    fi
    
    sleep 2
done

wait $PIPE_PID
EXIT_CODE=$?

echo ""
echo ""

# Final counts
FINAL_POSTS=$(PGPASSWORD=$DEST_PASS psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
FINAL_CREATORS=$(PGPASSWORD=$DEST_PASS psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
TOTAL_MIN=$((TOTAL_TIME / 60))
TOTAL_SEC=$((TOTAL_TIME % 60))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Migration Complete!"
echo ""
printf "  Posts:     %'d\n" $FINAL_POSTS
printf "  Creators:  %'d\n" $FINAL_CREATORS
echo ""
echo "  Time: ${TOTAL_MIN}m ${TOTAL_SEC}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

