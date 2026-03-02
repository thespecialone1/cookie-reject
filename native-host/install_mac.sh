#!/bin/bash

# Cookie Reject — yt-dlp Native Host Installer for macOS
DIR="$( cd "$( dirname "$0" )" && pwd )"
HOST_NAME="com.cookie_reject.ytdlp"

echo ""
echo "Cookie Reject - Native Host Installer"
echo "-------------------------------------"
echo "Please enter your Chrome Extension ID (you can copy this"
echo "from the Downloader Setup Guide or chrome://extensions):"
read -p "> " EXT_ID

if [ -z "$EXT_ID" ]; then
    echo "❌ Extension ID cannot be empty. Installation aborted."
    exit 1
fi

# 1. Create directory to store native messaging host for Chrome
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$TARGET_DIR"

# 2. Copy the manifest, update the shell script path to be absolute, and inject the extension ID
cat "$DIR/$HOST_NAME.json" \
    | sed "s|\"path\": \"ytdlp_host.sh\"|\"path\": \"$DIR/ytdlp_host.sh\"|g" \
    | awk '{gsub(/"chrome-extension:\/\/[a-zA-Z]+\/"/, "\"chrome-extension://'"$EXT_ID"'\/\""); print}' \
    > "$TARGET_DIR/$HOST_NAME.json"

# 3. Make the scripts executable
chmod +x "$DIR/ytdlp_host.sh"
chmod +x "$DIR/ytdlp_host.py"

echo ""
echo "✅ Native messaging host $HOST_NAME has been installed to Chrome."
echo "✅ Registered for Extension ID: $EXT_ID"
echo "You can now safely close this terminal and refresh the Downloader page!"
echo ""
