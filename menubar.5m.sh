#!/bin/bash
# tesla.5m.sh — Tesla Dashboard menu bar plugin for SwiftBar / xbar
#
# INSTALL:
#   1. brew install swiftbar        (or download from swiftbar.app)
#   2. Set plugin folder in SwiftBar preferences
#   3. Copy this file there: cp tesla.5m.sh ~/Library/Application\ Support/SwiftBar/Plugins/
#   4. chmod +x tesla.5m.sh
#   5. Edit DASHBOARD_URL below if not using localhost
#   6. SwiftBar auto-refreshes every 5 minutes (the "5m" in the filename)
#
# The filename format is: <name>.<interval><unit>.sh
#   Intervals: 5s, 1m, 5m, 1h, etc.

DASHBOARD_URL="http://localhost:3000"

# ── Fetch from dashboard ──────────────────────────────────────────────────────
RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 "$DASHBOARD_URL/api/menubar" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  # Dashboard not running — show minimal indicator
  echo "T ●"
  echo "---"
  echo "Dashboard offline | color=#505060"
  echo "Start: cd ~/your-dashboard && node server.js | color=#505060"
  echo "---"
  echo "Open Dashboard | href=$DASHBOARD_URL"
  exit 0
fi

# ── Output SwiftBar content ───────────────────────────────────────────────────
# The /api/menubar endpoint already returns SwiftBar-formatted text
echo "$RESPONSE"
