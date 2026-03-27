#!/bin/bash
# Tesla Dashboard — Start
# Double-click in Finder to launch server and open in browser.
# ─────────────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Kill any existing instance on port 3000
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null

# Install deps if missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
fi

# Start server in background
node server.js &
SERVER_PID=$!

# Wait for it to be ready
echo "Starting Tesla Dashboard..."
for i in {1..10}; do
  if curl -s http://localhost:3000/api/status &>/dev/null; then
    break
  fi
  sleep 0.5
done

# Detect Mac IP for phone connection
MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "your-mac-ip")

echo ""
echo "⚡ Tesla Dashboard running"
echo "   Mac:   http://localhost:3000"
echo "   Phone: http://$MAC_IP:3000"
echo ""
echo "Close this window to stop the server."
echo "(Or keep it open — the server runs in the background.)"

# Open in default browser
open "http://localhost:3000"

# Keep terminal open so closing it stops the server
trap "kill $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM EXIT
wait $SERVER_PID
