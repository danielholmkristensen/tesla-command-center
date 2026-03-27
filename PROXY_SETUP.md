# Vehicle Command Proxy Setup
# Unlocks: all commands on post-2021 Tesla (lock, climate, summon, autopark, etc.)
# Time: ~25 minutes total

## Why you need this

Post-2021 Tesla vehicles require commands to be signed with a private key
paired to the vehicle. Without this, the API returns "unsigned command rejected."
The proxy sits between your dashboard and Tesla — it signs every command
automatically using your private key.

---

## Step 1 — Generate your key pair (2 min)

Open Terminal on Mac and run:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
openssl ec -in private-key.pem -pubout -out public-key.pem
cat public-key.pem
```

Copy everything printed by the last command — you'll need it shortly.

---

## Step 2 — Host the public key (5 min)

Tesla needs to fetch your public key from a public URL to verify your app.

**Easiest option — use your Glitch/Render dashboard URL:**

If your dashboard is at `https://tesla-dashboard.onrender.com`, then Tesla
will look for your key at:
```
https://tesla-dashboard.onrender.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```

The server.js already serves this route — you just need to set the env var:

In Render.com → Environment → add:
```
TESLA_PUBLIC_KEY = <paste the full contents of public-key.pem>
```

Verify it works:
```bash
curl https://your-app.onrender.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```

---

## Step 3 — Register with Tesla Fleet API (5 min)

1. Go to https://developer.tesla.com → create an app
   - Name: "My Tesla Dashboard" (personal use)
   - Domain: your Render URL (e.g. https://tesla-dashboard.onrender.com)
   - Redirect URI: https://tesla-dashboard.onrender.com/callback

2. Note your `CLIENT_ID` and `CLIENT_SECRET`

3. Get a partner token:
```bash
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret

curl --request POST \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode 'scope=openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds' \
  --data-urlencode 'audience=https://fleet-api.prd.eu.vn.cloud.tesla.com' \
  'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
```

4. Register your domain (run once):
```bash
PARTNER_TOKEN=<from above>
curl -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"domain":"your-app.onrender.com"}' \
  -X POST \
  'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts'
```

---

## Step 4 — Pair key with your vehicle (3 min)

Generate an authorization URL:
```
https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/authorize?
  client_id=YOUR_CLIENT_ID
  &redirect_uri=https://your-app.onrender.com/callback
  &response_type=code
  &scope=openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds
  &state=abc123
```

Open this URL in a browser → log in with your Tesla account → Approve.

A popup will appear in the **Tesla mobile app** asking you to add the key to
your vehicle. **Tap Approve on your phone.**

---

## Step 5 — Deploy the proxy on Render.com (5 min)

1. Push this entire folder to a GitHub repo
2. Go to render.com → New → Blueprint → connect your repo
3. Render reads `render.yaml` and creates both services automatically
4. Set environment variables in each service:
   - `tesla-dashboard`: TESLA_REFRESH_TOKEN, TESLA_CLIENT_ID, TESLA_PUBLIC_KEY
   - `tesla-proxy`: add TESLA_OAUTH_TOKEN (your user access token)

5. Once both services are deployed:
   - Copy the proxy URL (e.g. `https://tesla-proxy.onrender.com`)
   - In the dashboard service, set: `TESLA_PROXY_URL=https://tesla-proxy.onrender.com/api/1`
   - Redeploy

6. Run one test command:
```bash
TESLA_TOKEN=your_access_token
VIN=your_vin
curl -H "Authorization: Bearer $TESLA_TOKEN" \
  https://tesla-proxy.onrender.com/api/1/vehicles/$VIN/command/door_lock \
  -X POST
```

If you see `{"result": true}` — the proxy is working.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `unsigned command rejected` | Key not paired with vehicle — redo Step 4 |
| `public key not found` | TESLA_PUBLIC_KEY env var not set correctly |
| `invalid audience` | Wrong region — use `na` URL for North America |
| `session info error: BadParameter` | Key regeneration needed — redo Steps 1-4 |
| Render free tier sleeps | Upgrade to Starter ($7/mo) or keep dashboard tab open |

---

## Notes

- Free tier Render services sleep after 15 min of inactivity. First request after
  sleep takes ~30s. Upgrade to Starter tier to keep always-on.
- The proxy runs on your Render infrastructure — your private key never leaves
  your environment.
- Private key MUST NOT be committed to git. Use Render environment variables or
  a mounted secret.
