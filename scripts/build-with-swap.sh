#!/bin/bash

# Build script with automatic swap management
# Usage: ./scripts/build-with-swap.sh [sudo_password]

SUDO_PASS="${1:-Country1!}"
SWAP_FILE="/tmp/nextjs-build-swap"
SWAP_SIZE_MB=2048

echo "🔧 Preparing for Next.js build..."

# Check if scanner is running and stop it
if pgrep -f "scanner.js" > /dev/null; then
    echo "🛑 Stopping scanner to free memory..."
    pkill -f "scanner.js"
    SCANNER_WAS_RUNNING=true
else
    SCANNER_WAS_RUNNING=false
fi

# Create and enable swap if needed
if [ ! -f "$SWAP_FILE" ]; then
    echo "💾 Creating ${SWAP_SIZE_MB}MB swap file..."
    echo "$SUDO_PASS" | sudo -S dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$SWAP_SIZE_MB status=progress 2>&1 | tail -1
    echo "$SUDO_PASS" | sudo -S chmod 600 "$SWAP_FILE"
    echo "$SUDO_PASS" | sudo -S mkswap "$SWAP_FILE"
    echo "$SUDO_PASS" | sudo -S swapon "$SWAP_FILE"
    SWAP_CREATED=true
    echo "✅ Swap enabled"
else
    SWAP_CREATED=false
    echo "ℹ️  Swap file already exists"
fi

# Show memory status
echo ""
echo "📊 Memory status before build:"
free -h

# Run the build
echo ""
echo "🏗️  Starting build..."
cd "$(dirname "$0")/.." || exit 1
npm run build

BUILD_EXIT_CODE=$?

# Cleanup swap if we created it
if [ "$SWAP_CREATED" = true ]; then
    echo ""
    echo "🧹 Cleaning up swap file..."
    echo "$SUDO_PASS" | sudo -S swapoff "$SWAP_FILE" 2>/dev/null
    echo "$SUDO_PASS" | sudo -S rm "$SWAP_FILE" 2>/dev/null
    echo "✅ Swap cleaned up"
fi

# Restart scanner if it was running
if [ "$SCANNER_WAS_RUNNING" = true ]; then
    echo "🔄 Restarting scanner..."
    npm run scanner > /dev/null 2>&1 &
    echo "✅ Scanner restarted"
fi

# Show final status
echo ""
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo "✅ Build completed successfully!"
else
    echo "❌ Build failed with exit code $BUILD_EXIT_CODE"
fi

echo ""
echo "📊 Memory status after build:"
free -h

exit $BUILD_EXIT_CODE

