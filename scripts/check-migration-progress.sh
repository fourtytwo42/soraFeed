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

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Migration Progress Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

export PGPASSWORD="$DEST_DB_PASSWORD"

echo -e "${CYAN}Destination Server: ${NC}192.168.50.104"
echo ""

# Get current counts
POSTS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM sora_posts" 2>/dev/null | xargs)
CREATORS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM creators" 2>/dev/null | xargs)
STATS=$(psql -h "$DEST_DB_HOST" -p "$DEST_DB_PORT" -U "$DEST_DB_USER" -d "$DEST_DB_NAME" -t -c "SELECT COUNT(*) FROM scanner_stats" 2>/dev/null | xargs)

echo -e "${GREEN}✓${NC} Posts:          $(printf '%10s' $POSTS | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
echo -e "${GREEN}✓${NC} Creators:       $(printf '%10s' $CREATORS | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
echo -e "${GREEN}✓${NC} Scanner Stats:  $(printf '%10s' $STATS | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

unset PGPASSWORD

