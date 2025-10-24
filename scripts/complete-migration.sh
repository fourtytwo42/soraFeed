#!/bin/bash

##############################################################################
# Complete Migration Script
# Run this to migrate the database to 192.168.50.104
##############################################################################

REMOTE_HOST="192.168.50.104"
REMOTE_USER="hendo420"
DUMP_FILE="database-backups/migration_final.sql.gz"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Complete Migration to $REMOTE_HOST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if dump exists
if [ ! -f "$DUMP_FILE" ]; then
    echo "✗ Dump file not found: $DUMP_FILE"
    echo "Creating it now..."
    PGPASSWORD=postgres pg_dump -h localhost -U postgres -d sora_feed \
        --data-only --disable-triggers | gzip > "$DUMP_FILE"
    echo "✓ Dump created: $(du -h $DUMP_FILE | cut -f1)"
else
    echo "✓ Using existing dump: $(du -h $DUMP_FILE | cut -f1)"
fi

echo ""
echo "Step 1: Transferring dump to remote server..."
echo "Password: Country1!"
echo ""

scp "$DUMP_FILE" ${REMOTE_USER}@${REMOTE_HOST}:/tmp/migration.sql.gz

if [ $? -ne 0 ]; then
    echo "✗ Transfer failed"
    exit 1
fi

echo ""
echo "✓ Transfer complete"
echo ""
echo "Step 2: Restoring on remote server..."
echo "Password: Country1! (again)"
echo ""

ssh ${REMOTE_USER}@${REMOTE_HOST} << 'EOF'
echo "Wiping database..."
PGPASSWORD=postgres psql -U postgres -d sora_feed -c "TRUNCATE TABLE sora_posts, creators, scanner_stats CASCADE;" 2>&1 | head -3

echo ""
echo "Restoring from dump (this will take 2-3 minutes)..."
START=$(date +%s)

gunzip < /tmp/migration.sql.gz | PGPASSWORD=postgres psql -U postgres -d sora_feed 2>&1 | grep -E "(ERROR|COPY)" | head -10

END=$(date +%s)

echo ""
echo "Verifying..."
POSTS=$(PGPASSWORD=postgres psql -U postgres -d sora_feed -t -c "SELECT COUNT(*) FROM sora_posts" | xargs)
CREATORS=$(PGPASSWORD=postgres psql -U postgres -d sora_feed -t -c "SELECT COUNT(*) FROM creators" | xargs)
STATS=$(PGPASSWORD=postgres psql -U postgres -d sora_feed -t -c "SELECT COUNT(*) FROM scanner_stats" | xargs)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Migration Complete!"
echo ""
printf "  Posts:         %'d\n" $POSTS
printf "  Creators:      %'d\n" $CREATORS  
printf "  Scanner Stats: %'d\n" $STATS
echo ""
echo "  Time: $(($END - $START))s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -f /tmp/migration.sql.gz
EOF

echo ""
echo "✓ All done!"

