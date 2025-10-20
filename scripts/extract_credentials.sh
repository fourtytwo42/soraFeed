#!/bin/bash

# Extract credentials from Raw-API-call.md and create .env file

RAW_FILE="../Raw-API-call.md"
ENV_FILE="../.env"

echo "🔍 Extracting credentials from Raw-API-call.md..."

# Extract bearer token
BEARER_TOKEN=$(grep -A1 "authorization" "$RAW_FILE" | tail -1 | sed 's/Bearer //')

# Extract cookie line
COOKIE_LINE=$(grep -A1 "cookie" "$RAW_FILE" | tail -1)

# Extract specific cookie values
SESSION_TOKEN=$(echo "$COOKIE_LINE" | grep -o '__Secure-next-auth\.session-token=[^;]*' | cut -d'=' -f2)
CF_CLEARANCE=$(echo "$COOKIE_LINE" | grep -o 'cf_clearance=[^;]*' | cut -d'=' -f2)
CF_BM=$(echo "$COOKIE_LINE" | grep -o '__cf_bm=[^;]*' | cut -d'=' -f2)
OAI_SC=$(echo "$COOKIE_LINE" | grep -o 'oai-sc=[^;]*' | cut -d'=' -f2)
OAI_DID=$(echo "$COOKIE_LINE" | grep -o 'oai-did=[^;]*' | cut -d'=' -f2)

# Extract user agent
USER_AGENT=$(grep -A1 "user-agent" "$RAW_FILE" | tail -1)

# Create .env file
cat > "$ENV_FILE" << EOF
# Authentication
AUTH_BEARER_TOKEN=$BEARER_TOKEN

# Cookies
COOKIE_SESSION=$SESSION_TOKEN
CF_CLEARANCE=$CF_CLEARANCE
CF_BM=$CF_BM
OAI_SC=$OAI_SC
OAI_DID=$OAI_DID

# Headers
USER_AGENT=$USER_AGENT
ACCEPT_LANGUAGE=en-US,en;q=0.9

# API Config
FEED_LIMIT=16
FEED_CUT=nf2_latest
EOF

echo "✅ .env file created successfully"
echo "🔑 Extracted credentials:"
echo "   Bearer Token: ${BEARER_TOKEN:0:50}..."
echo "   Session Token: ${SESSION_TOKEN:0:50}..."
echo "   CF Clearance: ${CF_CLEARANCE:0:50}..."
echo "   OAI DID: $OAI_DID"
