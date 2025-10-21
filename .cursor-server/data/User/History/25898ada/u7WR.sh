#!/bin/bash

# Extract minimal credentials from Raw-API-call.md and create .env file
# Only extracts the Bearer token since that's all we need for public feeds

RAW_FILE="Raw-API-call.md"
ENV_FILE=".env"

echo "🔍 Extracting minimal credentials from Raw-API-call.md..."

# Check if Raw-API-call.md exists
if [ ! -f "$RAW_FILE" ]; then
    echo "❌ Error: $RAW_FILE not found"
    echo "💡 Make sure you have the Raw-API-call.md file in the project root"
    exit 1
fi

# Extract bearer token
BEARER_TOKEN=$(grep -A1 "authorization" "$RAW_FILE" | tail -1 | sed 's/Bearer //')

if [ -z "$BEARER_TOKEN" ]; then
    echo "❌ Error: Could not find Bearer token in $RAW_FILE"
    echo "💡 Make sure the file contains an 'authorization' header with a Bearer token"
    exit 1
fi

# Extract optional user agent
USER_AGENT=$(grep -A1 "user-agent" "$RAW_FILE" | tail -1)

# Extract optional accept language
ACCEPT_LANGUAGE=$(grep -A1 "accept-language" "$RAW_FILE" | tail -1)

# Write minimal .env file
echo "# Minimal Authentication for Sora Feed" > "$ENV_FILE"
echo "# Only the Bearer token is required for accessing public video feeds" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"
echo "# REQUIRED: OpenAI Bearer Token (JWT)" >> "$ENV_FILE"
echo "AUTH_BEARER_TOKEN=$BEARER_TOKEN" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"

# Add optional variables if found
if [ ! -z "$USER_AGENT" ]; then
    echo "# OPTIONAL: User Agent" >> "$ENV_FILE"
    echo "USER_AGENT=$USER_AGENT" >> "$ENV_FILE"
    echo "" >> "$ENV_FILE"
fi

if [ ! -z "$ACCEPT_LANGUAGE" ]; then
    echo "# OPTIONAL: Accept Language" >> "$ENV_FILE"
    echo "ACCEPT_LANGUAGE=$ACCEPT_LANGUAGE" >> "$ENV_FILE"
    echo "" >> "$ENV_FILE"
fi

echo "# NOTE: Session cookies and Cloudflare tokens are NOT required for public feeds" >> "$ENV_FILE"
echo "# The following are no longer needed:" >> "$ENV_FILE"
echo "# - COOKIE_SESSION" >> "$ENV_FILE"
echo "# - CF_CLEARANCE" >> "$ENV_FILE"
echo "# - CF_BM" >> "$ENV_FILE"
echo "# - OAI_SC" >> "$ENV_FILE"
echo "# - OAI_DID" >> "$ENV_FILE"

echo "✅ Minimal .env file created successfully!"
echo "🎯 Only Bearer token is required for public video feeds"
echo "📝 Check ENVIRONMENT.md for detailed setup instructions"

# Show token info (first and last 10 characters for security)
TOKEN_START=$(echo "$BEARER_TOKEN" | cut -c1-10)
TOKEN_END=$(echo "$BEARER_TOKEN" | tail -c11)
echo "🔑 Bearer token extracted: ${TOKEN_START}...${TOKEN_END}"
