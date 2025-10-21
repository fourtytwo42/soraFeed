# 🍪 Automated Cookie Management

This system significantly reduces the need for manual cookie updates from daily to weekly/monthly.

## 🔄 **How It Works**

### 1. **Automatic Cookie Refresh**
- Scanner automatically refreshes cookies every 12 hours
- Detects cookie-related errors and refreshes immediately
- No manual intervention required for normal operation

### 2. **Manual Cookie Refresh**
```bash
npm run refresh-cookies
```

### 3. **Scheduled Cookie Updates (Optional)**
Set up a cron job to refresh cookies every 12 hours:
```bash
# Add to crontab (run: crontab -e)
0 */12 * * * /home/hendo420/soraFeed/scripts/cron-refresh.sh
```

## 🛠️ **Setup Instructions**

### Option 1: Fully Automated (Recommended)
1. **Initial Setup**: Run once to get fresh cookies
   ```bash
   npm run refresh-cookies
   ```

2. **Start Scanner**: The scanner will handle everything automatically
   ```bash
   npm run scanner
   ```

### Option 2: With Cron Job (Most Reliable)
1. **Set up cron job**:
   ```bash
   # Edit crontab
   crontab -e
   
   # Add this line:
   0 */12 * * * /home/hendo420/soraFeed/scripts/cron-refresh.sh
   ```

2. **Start scanner**:
   ```bash
   npm run scanner
   ```

## 📊 **Monitoring**

### Check Cookie Status
```bash
# View recent cookie refresh logs
tail -f /home/hendo420/soraFeed/logs/cookie-refresh.log

# Check scanner logs for cookie refresh messages
# Look for: "🍪 Cookies are stale, refreshing..." or "🍪 Detected cookie-related error"
```

### Manual Cookie Check
```bash
# Force refresh cookies
npm run refresh-cookies

# Check if cookies were updated
cat .cookies.json
```

## 🔧 **Troubleshooting**

### If Cookies Still Expire
1. **Check cron job**:
   ```bash
   crontab -l
   ```

2. **Manual refresh**:
   ```bash
   npm run refresh-cookies
   ```

3. **Check logs**:
   ```bash
   cat /home/hendo420/soraFeed/logs/cookie-refresh.log
   ```

### If Scanner Still Fails
The scanner will automatically detect cookie errors and attempt refresh. If it continues to fail:

1. **Manual cookie update**: Get fresh cookies from browser and update `.env`
2. **Check network**: Ensure server can reach `sora.chatgpt.com`
3. **Verify cron job**: Make sure it's running every 12 hours

## 📈 **Benefits**

- ✅ **Reduced Manual Work**: From daily to weekly/monthly updates
- ✅ **Automatic Recovery**: Scanner detects and fixes cookie issues
- ✅ **Backup System**: Cookies saved to `.cookies.json` for recovery
- ✅ **Error Detection**: Smart detection of cookie-related failures
- ✅ **Scheduled Updates**: Optional cron job for maximum reliability

## 🎯 **Expected Behavior**

- **Normal Operation**: Scanner runs continuously without manual intervention
- **Cookie Refresh**: Happens automatically every 12 hours
- **Error Recovery**: Automatic refresh when cookie errors are detected
- **Manual Override**: `npm run refresh-cookies` for immediate refresh

The system is designed to be "set it and forget it" - you should only need to manually update cookies in rare cases where the automatic system fails.
