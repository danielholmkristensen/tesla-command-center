#!/bin/bash
# Tesla Dashboard — First Time Setup
# Double-click this file in Finder to run.
# ─────────────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "⚡ Tesla Dashboard — Setup"
echo "──────────────────────────"

# ── Check Node.js ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ""
  echo "Node.js is not installed."
  echo "Opening nodejs.org for you..."
  open "https://nodejs.org/en/download"
  echo ""
  echo "Install Node.js LTS, then run this script again."
  echo "Press any key to exit."
  read -n1; exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
echo "✓ Node.js $NODE_VER"

# ── Install dependencies ───────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies ready"
fi

# ── Install SwiftBar (optional, for menu bar) ──────────────────────────
if command -v brew &>/dev/null; then
  if ! brew list --cask swiftbar &>/dev/null 2>&1; then
    echo ""
    read -p "Install SwiftBar for Mac menu bar integration? (y/n) " -n1 ans
    echo ""
    if [[ "$ans" == "y" ]]; then
      brew install --cask swiftbar
      echo "✓ SwiftBar installed"
    fi
  else
    echo "✓ SwiftBar already installed"
  fi
fi

# ── Create LaunchAgent for auto-start on login ─────────────────────────
PLIST="$HOME/Library/LaunchAgents/dev.tesla-dashboard.plist"
if [ ! -f "$PLIST" ]; then
  echo ""
  read -p "Auto-start Tesla Dashboard on Mac login? (y/n) " -n1 ans
  echo ""
  if [[ "$ans" == "y" ]]; then
    cat > "$PLIST" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.tesla-dashboard</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>$DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/.tesla-dashboard.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/.tesla-dashboard.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TESLA_REFRESH_TOKEN</key>
    <string>__REPLACE_WITH_YOUR_TOKEN__</string>
    <key>TESLA_API_REGION</key>
    <string>eu</string>
  </dict>
</dict>
</plist>
PLISTEOF
    launchctl load "$PLIST"
    echo "✓ Auto-start configured"
    echo ""
    echo "⚠  Edit $PLIST"
    echo "   Replace __REPLACE_WITH_YOUR_TOKEN__ with your Tesla token"
    echo "   Then run: launchctl unload $PLIST && launchctl load $PLIST"
  fi
fi

# ── Setup SwiftBar plugin ──────────────────────────────────────────────
SWIFTBAR_DIR="$HOME/Library/Application Support/SwiftBar/Plugins"
if [ -d "$SWIFTBAR_DIR" ] && [ ! -f "$SWIFTBAR_DIR/tesla.5m.sh" ]; then
  cp "$DIR/menubar.5m.sh" "$SWIFTBAR_DIR/tesla.5m.sh"
  chmod +x "$SWIFTBAR_DIR/tesla.5m.sh"
  echo "✓ Menu bar plugin installed"
fi

echo ""
echo "──────────────────────────────────────────"
echo "✅  Setup complete."
echo ""
echo "Next steps:"
echo "  1. Double-click 'start.command' to launch"
echo "  2. Open http://localhost:3000 in Safari"
echo "  3. Paste your Tesla token (from tesla-auth.netlify.app)"
echo "  4. Safari → Share → Add to Dock  (for Mac app feel)"
echo "  5. On iPhone: open http://$(ipconfig getifaddr en0 2>/dev/null || echo "your-mac-ip"):3000"
echo "     Safari → Share → Add to Home Screen"
echo ""
echo "Press any key to exit."
read -n1
