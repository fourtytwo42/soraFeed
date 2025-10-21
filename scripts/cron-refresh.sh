#!/bin/bash

# Cron job script to refresh cookies every 12 hours
# Add this to crontab: 0 */12 * * * /path/to/soraFeed/scripts/cron-refresh.sh

cd /home/hendo420/soraFeed

# Log the refresh attempt
echo "$(date): Starting cookie refresh..." >> /home/hendo420/soraFeed/logs/cookie-refresh.log

# Run the cookie refresh
npm run refresh-cookies >> /home/hendo420/soraFeed/logs/cookie-refresh.log 2>&1

# Check if refresh was successful
if [ $? -eq 0 ]; then
    echo "$(date): Cookie refresh completed successfully" >> /home/hendo420/soraFeed/logs/cookie-refresh.log
else
    echo "$(date): Cookie refresh failed" >> /home/hendo420/soraFeed/logs/cookie-refresh.log
fi
