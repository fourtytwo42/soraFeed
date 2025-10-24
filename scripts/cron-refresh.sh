#!/bin/bash

# Cron job script to refresh cookies every 12 hours
# Add this to crontab: 0 */12 * * * /path/to/soraFeed/scripts/cron-refresh.sh
# 
# To set up the cron job:
# 1. Make this script executable: chmod +x scripts/cron-refresh.sh
# 2. Edit crontab: crontab -e
# 3. Add line: 0 */12 * * * /full/path/to/soraFeed/scripts/cron-refresh.sh

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR"

# Create logs directory if it doesn't exist
mkdir -p logs

# Log the refresh attempt
echo "$(date): Starting cookie refresh..." >> logs/cookie-refresh.log

# Run the cookie refresh
npm run refresh-cookies >> logs/cookie-refresh.log 2>&1

# Check if refresh was successful
if [ $? -eq 0 ]; then
    echo "$(date): Cookie refresh completed successfully" >> logs/cookie-refresh.log
else
    echo "$(date): Cookie refresh failed" >> logs/cookie-refresh.log
fi
