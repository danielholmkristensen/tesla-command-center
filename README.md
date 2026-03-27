# Tesla Dashboard

## Mac Setup (2 minutes)

1. **Double-click `setup.command`** — installs Node.js check, deps, optional auto-start and menu bar
2. **Double-click `start.command`** — starts server, opens browser automatically
3. **Get your token** at [tesla-auth.netlify.app](https://tesla-auth.netlify.app) → paste in the onboarding screen
4. **Add to Dock**: Safari → Share → **Add to Dock** → looks and behaves like a native Mac app

**Auto-start on login:** Setup script offers to configure this. Edit `~/Library/LaunchAgents/dev.tesla-dashboard.plist` with your token after.

**Menu bar:** `menubar.5m.sh` installs automatically if SwiftBar is present. Shows battery %, lock state, sentry status. Lock/unlock/flash/honk from the menu bar without opening a browser.

**Keyboard shortcuts** (when in browser):

| Key | Action |
|-----|--------|
| `L` | Lock |
| `U` | Unlock |
| `F` | Flash lights |
| `H` | Honk |
| `C` | Start climate |
| `1–6` | Open tile (Location, Climate, Charge, Health, Sentry, Save) |

---

## iPhone Setup (1 minute)

1. Make sure your Mac is running the dashboard (start.command)
2. Your Mac and iPhone must be on the **same WiFi**
3. Open Safari on iPhone → go to `http://YOUR-MAC-IP:3000`
   (IP is shown in the terminal when you run start.command)
4. Safari → Share → **Add to Home Screen**
5. Paste your token in the onboarding — done

---

## Glitch / Cloud Deployment

Drop all files into a Glitch project. Set in `.env`:
```
TESLA_REFRESH_TOKEN=your_token_here
TESLA_API_REGION=eu
```
Open the Glitch URL on your phone → Add to Home Screen.

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js backend (API proxy, geo-fence, telemetry) |
| `client.html` | PWA frontend (adapts to phone + Mac) |
| `start.command` | Double-click to start on Mac |
| `setup.command` | First-time Mac setup |
| `menubar.5m.sh` | SwiftBar menu bar plugin |
| `render.yaml` | One-click Render.com cloud deployment |
| `Dockerfile.proxy` | Tesla Vehicle Command Proxy (unlocks all commands) |
| `PROXY_SETUP.md` | Proxy setup guide |

---

## Token expiry

Tesla refresh tokens expire after ~8 hours of inactivity. If the app shows a connection error:
- On Mac: open `start.command` again (re-onboarding is automatic if token is stale)
- Set `TESLA_REFRESH_TOKEN` in the LaunchAgent plist for permanent background operation
