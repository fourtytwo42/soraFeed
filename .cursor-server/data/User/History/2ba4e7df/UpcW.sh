#!/bin/bash

# Load environment variables
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
else
    echo "❌ .env file not found. Run extract_credentials.sh first."
    exit 1
fi

BASE_URL="https://sora.chatgpt.com/backend/project_y"
ENDPOINT="/feed?limit=${FEED_LIMIT}&cut=${FEED_CUT}"
URL="${BASE_URL}${ENDPOINT}"

echo "🧪 Testing Sora API..."
echo "📍 URL: $URL"
echo ""

# Test 1: Full headers and cookies (baseline)
echo "🔬 Test 1: Full headers and cookies"
curl -s -w "HTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  -H "Accept: */*" \
  -H "Accept-Language: ${ACCEPT_LANGUAGE}" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "Referer: https://sora.chatgpt.com/explore" \
  -H "Cookie: __Secure-next-auth.session-token=${COOKIE_SESSION}; cf_clearance=${CF_CLEARANCE}; __cf_bm=${CF_BM}; oai-sc=${OAI_SC}; oai-did=${OAI_DID}" \
  "$URL" | head -20

echo -e "\n" && sleep 2

# Test 2: Minimal headers (just Bearer token)
echo "🔬 Test 2: Just Bearer token"
curl -s -w "HTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  "$URL" | head -10

echo -e "\n" && sleep 2

# Test 3: Bearer + Session cookie only
echo "🔬 Test 3: Bearer + Session cookie only"
curl -s -w "HTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  -H "Cookie: __Secure-next-auth.session-token=${COOKIE_SESSION}" \
  "$URL" | head -10

echo -e "\n" && sleep 2

# Test 4: Bearer + CF clearance only
echo "🔬 Test 4: Bearer + CF clearance only"
curl -s -w "HTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  -H "Cookie: cf_clearance=${CF_CLEARANCE}" \
  "$URL" | head -10

echo -e "\n" && sleep 2

# Test 5: Essential headers (what we think we need)
echo "🔬 Test 5: Essential headers"
curl -s -w "HTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
  -H "Accept: */*" \
  -H "User-Agent: ${USER_AGENT}" \
  -H "Cookie: __Secure-next-auth.session-token=${COOKIE_SESSION}; cf_clearance=${CF_CLEARANCE}" \
  "$URL" | head -10

echo -e "\n✅ API testing complete!"
