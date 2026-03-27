/**
 * Tesla Dashboard v5
 * New: Location tab + Find My Car micro-actions
 *      Geo-fence anti-theft with Web Push alerts
 *      Save Money wizard with Danish charging market analysis
 *      /api/menubar endpoint for SwiftBar / xbar Mac plugin
 *      Driving session log (accumulates while server runs)
 */

const express = require("express");
const axios   = require("axios");
const http    = require("http");
const WebSocket = require("ws");
const fs      = require("fs");
const path    = require("path");
const { networkInterfaces } = require("os");

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: "/fleet-telemetry" });
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 3000;
const REGION     = process.env.TESLA_API_REGION || "eu";
const PROXY_URL  = process.env.TESLA_PROXY_URL  || null;
const API_BASE   = PROXY_URL || (REGION === "na"
  ? "https://fleet-api.prd.na.vn.cloud.tesla.com/api/1"
  : "https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1");
const AUTH_URL   = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
const AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize";

// Token state — seeded from env vars at startup, overridable at runtime via
// POST /api/configure so onboarding works without touching .env
let accessToken  = process.env.TESLA_ACCESS_TOKEN  || null;
let refreshToken = process.env.TESLA_REFRESH_TOKEN || null;
let clientId     = process.env.TESLA_CLIENT_ID     || null;
let clientSecret = process.env.TESLA_CLIENT_SECRET || null;
let configured   = !!(accessToken || refreshToken); // true once server has credentials

// Public key for Tesla Fleet API verification
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoOCE+WLAc2uiUVObrhCUIQl2Goca
xUOuYUadBmJPVWRiLB9MvuaX4bH5hkA5SiXLl09hJ/K6sgGs7hzcaAVbyg==
-----END PUBLIC KEY-----`;

// ── State ─────────────────────────────────────────────────────────────────────
let cachedVehicles = [];
let lastVehicleData = {};          // VIN → latest vehicle_data response
let driveLog = [];                 // accumulated location/speed/soc snapshots
let pushSubscriptions = [];        // Web Push endpoints

const geofence = {
  active: false,
  name: "Home",
  center: null,      // { lat, lon }
  radiusKm: 0.5,
  status: "UNKNOWN", // INSIDE | OUTSIDE | UNKNOWN
  lastBreachAt: null,
  lastCheckedAt: null,
  history: [],       // last 20 status changes
};

const telemetry = {
  connected: false,
  signals: {},
  alerts: [],
};
const sseClients = new Set();

// ── Auth ──────────────────────────────────────────────────────────────────────
async function ensureToken() {
  if (accessToken) return accessToken;
  return doRefresh();
}
async function doRefresh() {
  if (!refreshToken) throw new Error("No refresh token. Complete onboarding or set TESLA_REFRESH_TOKEN env var.");
  if (!clientId) throw new Error("No client ID. Set TESLA_CLIENT_ID env var.");
  const params = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  };
  if (clientSecret) params.client_secret = clientSecret;
  const p = new URLSearchParams(params);
  const r = await axios.post(AUTH_URL, p.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  accessToken = r.data.access_token;
  if (r.data.refresh_token) refreshToken = r.data.refresh_token;
  return accessToken;
}
async function tesla(method, path, body, retry = false) {
  const token = await ensureToken();
  try {
    const r = await axios({ method, url: `${API_BASE}${path}`, data: body,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 35000,
      httpsAgent: PROXY_URL ? new (require("https").Agent)({ rejectUnauthorized: false }) : undefined,
    });
    return r.data;
  } catch (e) {
    if (e.response?.status === 401 && !retry) { accessToken = null; return tesla(method, path, body, true); }
    throw new Error(e.response?.data?.error || e.response?.data?.message || e.message);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Partner registration (required once per region)
let partnerRegistered = false;
async function ensurePartnerRegistered() {
  if (partnerRegistered) return;
  if (!clientId || !clientSecret) throw new Error("Client ID and Secret required for partner registration");

  // Get client_credentials token (app-only)
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "openid vehicle_device_data vehicle_cmds vehicle_charging_cmds"
  });
  const authRes = await axios.post(AUTH_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  const appToken = authRes.data.access_token;

  // Register with Fleet API region
  try {
    await axios.post(`${API_BASE}/partner_accounts`, { domain: process.env.RAILWAY_PUBLIC_DOMAIN || "commandcenter.agency" }, {
      headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" }
    });
    console.log("✓ Partner registered with Fleet API region");
  } catch (e) {
    // 409 = already registered, that's fine
    if (e.response?.status !== 409) {
      console.warn("Partner registration warning:", e.response?.data || e.message);
    }
  }
  partnerRegistered = true;
}

// ── Fleet Telemetry WS ────────────────────────────────────────────────────────
wss.on("connection", ws => {
  telemetry.connected = true;
  ws.on("message", raw => {
    try {
      const records = JSON.parse(raw.toString());
      (Array.isArray(records) ? records : [records]).forEach(rec => {
        if (rec.alerts) rec.alerts.forEach(a => { telemetry.alerts.push({ ...a, receivedAt: new Date().toISOString() }); if (telemetry.alerts.length > 50) telemetry.alerts.shift(); });
        if (rec.data) Object.assign(telemetry.signals, rec.data);
      });
      broadcast({ signals: telemetry.signals, alerts: telemetry.alerts.slice(-20), connected: true });
    } catch (_) {}
  });
  ws.on("close", () => { telemetry.connected = false; });
});
function broadcast(payload) {
  const s = JSON.stringify(payload);
  sseClients.forEach(res => { try { res.write(`data: ${s}\n\n`); } catch (_) {} });
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Web Push (simple fetch-based, no library needed) ─────────────────────────
async function sendPushToAll(notification) {
  // Broadcast over SSE as fallback (works in open browser tabs)
  broadcast({ type: "alert", notification });
  // For true background push you need VAPID keys + web-push library
  // See PROXY_SETUP.md for full push configuration
  console.log(`[PUSH] ${notification.title}: ${notification.body}`);
}

// ── Geo-fence Polling Loop ────────────────────────────────────────────────────
async function pollGeofence() {
  if (!geofence.active || !geofence.center || !cachedVehicles.length) return;
  const vin = cachedVehicles[0].vin || cachedVehicles[0].id;
  try {
    const r = await tesla("get", `/vehicles/${cachedVehicles[0].id}/vehicle_data?endpoints=drive_state`);
    const ds = r.response?.drive_state;
    if (!ds?.latitude) return;
    const distKm = haversineKm(geofence.center.lat, geofence.center.lon, ds.latitude, ds.longitude);
    geofence.lastCheckedAt = new Date().toISOString();
    lastVehicleData._lastLocation = { lat: ds.latitude, lon: ds.longitude, heading: ds.heading, speed: ds.speed, timestamp: new Date().toISOString() };
    // Log for drive pattern analysis
    if (ds.speed > 0) {
      driveLog.push({ lat: ds.latitude, lon: ds.longitude, speed: Math.round(ds.speed * 1.609), soc: r.response?.charge_state?.battery_level, timestamp: new Date().toISOString() });
      if (driveLog.length > 5000) driveLog.shift();
    }
    const wasInside = geofence.status === "INSIDE";
    const isInside  = distKm <= geofence.radiusKm;
    if (wasInside && !isInside) {
      geofence.status = "OUTSIDE";
      geofence.lastBreachAt = new Date().toISOString();
      geofence.history.unshift({ event: "EXIT", distKm: distKm.toFixed(2), at: geofence.lastBreachAt, lat: ds.latitude, lon: ds.longitude });
      if (geofence.history.length > 20) geofence.history.pop();
      await sendPushToAll({ title: `🚨 ${geofence.name} — Vehicle Left Fence`, body: `${distKm.toFixed(1)} km from ${geofence.name} · ${new Date().toLocaleTimeString()}`, urgent: true, lat: ds.latitude, lon: ds.longitude });
    } else if (!wasInside && isInside) {
      geofence.status = "INSIDE";
      geofence.history.unshift({ event: "ENTER", distKm: distKm.toFixed(2), at: new Date().toISOString(), lat: ds.latitude, lon: ds.longitude });
    } else if (geofence.status === "UNKNOWN") {
      geofence.status = isInside ? "INSIDE" : "OUTSIDE";
    }
  } catch (_) {}
}
setInterval(pollGeofence, 120_000); // every 2 minutes

// ── Routes ────────────────────────────────────────────────────────────────────

// Serve Tesla public key for Fleet API verification
app.get("/.well-known/appspecific/com.tesla.3p.public-key.pem", (req, res) => {
  res.type("application/x-pem-file").send(PUBLIC_KEY);
});

// OAuth: Start authorization flow
app.get("/auth/tesla", (req, res) => {
  if (!clientId) return res.status(500).send("TESLA_CLIENT_ID not configured");
  const host = req.get("host");
  const protocol = req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const redirectUri = `${protocol}://${host}/callback`;
  const state = Math.random().toString(36).slice(2);
  const scope = "openid offline_access user_data vehicle_device_data vehicle_location vehicle_cmds vehicle_charging_cmds";
  const url = `${AUTHORIZE_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
  res.redirect(url);
});

// OAuth: Handle callback from Tesla
app.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
  if (!code) return res.status(400).send("Missing authorization code");
  if (!clientId) return res.status(500).send("TESLA_CLIENT_ID not configured");

  const host = req.get("host");
  const protocol = req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const redirectUri = `${protocol}://${host}/callback`;

  try {
    const params = {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri
    };
    if (clientSecret) params.client_secret = clientSecret;
    const p = new URLSearchParams(params);
    const r = await axios.post(AUTH_URL, p.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    accessToken = r.data.access_token;
    refreshToken = r.data.refresh_token;
    configured = true;
    console.log("✓ OAuth callback: tokens received");
    res.redirect("/?auth=success");
  } catch (e) {
    console.error("OAuth callback error:", e.response?.data || e.message);
    res.status(500).send(`Token exchange failed: ${e.response?.data?.error_description || e.message}`);
  }
});

app.get("/api/status", (req, res) => res.json({ ok: true, proxy: !!PROXY_URL, region: REGION, telemetry: { connected: telemetry.connected }, geofence: { active: geofence.active, status: geofence.status } }));

// ── Token configuration ───────────────────────────────────────────────────────

// Tells client whether server has credentials — no token value is ever exposed
app.get("/api/configured", (req, res) => res.json({ configured }));

// Called by onboarding: client POSTs the refresh token once, server validates
// it immediately by attempting a token exchange, then stores it in memory.
// The token lives in server RAM — restarts require re-onboard OR env var.
// For persistent deployments: set TESLA_REFRESH_TOKEN in .env / Glitch env.
app.post("/api/configure", async (req, res) => {
  const { refreshToken: rt, accessToken: at, clientId: cid } = req.body;

  // If access token provided, use it directly (skip refresh)
  if (at && typeof at === "string" && at.length > 50) {
    accessToken = at.trim();
    if (rt) refreshToken = rt.trim();
    if (cid) clientId = cid;
    configured = true;
    console.log("✓ Token configured via /api/configure (access token)");

    // Validate by making a test call
    try {
      await tesla("get", "/vehicles");
      return res.json({ ok: true, configured: true, tokenPrefix: at.slice(0, 8) + "..." });
    } catch (e) {
      accessToken = null;
      refreshToken = null;
      configured = false;
      return res.status(401).json({ error: "Token rejected by Tesla: " + e.message });
    }
  }

  if (!rt || typeof rt !== "string" || rt.length < 20) {
    return res.status(400).json({ error: "Invalid token format." });
  }

  // Temporarily set so doRefresh can use it
  const prev = { rt: refreshToken, cid: clientId, at: accessToken };
  refreshToken = rt.trim();
  if (cid) clientId = cid;
  accessToken = null; // force fresh exchange

  try {
    // Validate immediately — this calls Tesla's auth server
    const token = await doRefresh();
    configured = true;
    console.log("✓ Token configured via /api/configure");
    res.json({ ok: true, configured: true, tokenPrefix: token.slice(0, 8) + "..." });
  } catch (e) {
    // Roll back if invalid
    refreshToken = prev.rt;
    clientId     = prev.cid;
    accessToken  = prev.at;
    console.warn("✗ /api/configure rejected:", e.message);
    res.status(401).json({ error: "Token rejected by Tesla: " + e.message });
  }
});

// Clear credentials (logout)
app.post("/api/logout", (req, res) => {
  accessToken = process.env.TESLA_ACCESS_TOKEN || null;
  refreshToken = process.env.TESLA_REFRESH_TOKEN || null;
  configured = !!(accessToken || refreshToken);
  res.json({ ok: true, configured });
});

app.get("/api/vehicles", async (req, res) => {
  try {
    await ensurePartnerRegistered();
    const d = await tesla("get", "/vehicles");
    cachedVehicles = d.response || [];
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/vehicles/:id/data", async (req, res) => {
  try {
    const ep = req.query.endpoints || "charge_state;climate_state;drive_state;vehicle_state;vehicle_config";
    const d = await tesla("get", `/vehicles/${req.params.id}/vehicle_data?endpoints=${encodeURIComponent(ep)}`);
    if (d.response) lastVehicleData = d.response;
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/vehicles/:id/location", async (req, res) => {
  try {
    const d = await tesla("get", `/vehicles/${req.params.id}/vehicle_data?endpoints=drive_state`);
    const ds = d.response?.drive_state;
    if (!ds?.latitude) return res.status(404).json({ error: "Location not available. Vehicle may not have location_data scope." });
    if (geofence.center) {
      ds._distFromFence = haversineKm(geofence.center.lat, geofence.center.lon, ds.latitude, ds.longitude);
      ds._fenceName = geofence.name;
    }
    res.json({ lat: ds.latitude, lon: ds.longitude, heading: ds.heading, speed: ds.speed ? Math.round(ds.speed * 1.609) : 0, timestamp: new Date().toISOString(), fenceInfo: ds._distFromFence !== undefined ? { distKm: ds._distFromFence.toFixed(2), name: ds._fenceName, status: geofence.status } : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/vehicles/:id/wake", async (req, res) => {
  try {
    await tesla("post", `/vehicles/${req.params.id}/wake_up`);
    for (let i = 0; i < 10; i++) { await sleep(3000); const v = await tesla("get", `/vehicles/${req.params.id}`); if (v.response?.state === "online") return res.json({ state: "online" }); }
    res.json({ state: "pending" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/vehicles/:id/command/:cmd", async (req, res) => {
  try { res.json(await tesla("post", `/vehicles/${req.params.id}/command/${req.params.cmd}`, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Geo-fence
app.get("/api/geofence", (req, res) => res.json(geofence));
app.post("/api/geofence", (req, res) => {
  const { active, center, radiusKm, name } = req.body;
  if (typeof active !== "undefined") geofence.active = active;
  if (center) { geofence.center = center; geofence.status = "UNKNOWN"; }
  if (radiusKm) geofence.radiusKm = radiusKm;
  if (name) geofence.name = name;
  res.json(geofence);
  if (geofence.active) pollGeofence(); // immediate check
});

// Drive log
app.get("/api/drivelog", (req, res) => res.json({ points: driveLog.length, log: driveLog.slice(-200) }));

// Money analysis (server-side calculation with Danish market data)
app.post("/api/money/analyze", (req, res) => {
  const { annualKm, useType, homeCharging, workCharging, primaryTrip } = req.body;
  const CONSUMPTION_KWH_PER_100KM = primaryTrip === "highway" ? 22 : primaryTrip === "urban" ? 14 : 18;
  const annualKwh = (annualKm / 100) * CONSUMPTION_KWH_PER_100KM;

  // Estimate public vs home split
  let publicPct = 0.3; // default: 30% public
  if (homeCharging === "none") publicPct = 0.90;
  else if (homeCharging === "outlet") publicPct = 0.50;
  else if (homeCharging === "charger") publicPct = 0.15;
  if (workCharging === "free") publicPct -= 0.10;
  if (useType === "frequent_trips") publicPct += 0.20;
  publicPct = Math.max(0.05, Math.min(0.95, publicPct));
  const homeKwh   = annualKwh * (1 - publicPct);
  const publicKwh = annualKwh * publicPct;

  // Scenarios (DKK/kWh)
  const HOME_STANDARD  = 3.26; // avg Danish home electricity
  const HOME_SMART     = 1.20; // weekend noon dynamic tariff average
  const CLEVER_ADHOC   = 5.00; // DC fast charger
  const CLEVER_SUB     = 799 * 12; // annual subscription
  const SPIRII_AC      = 3.13;
  const SPIRII_DC      = 5.19;
  const TESLA_SC       = 4.50;

  const scenarios = {
    current: {
      label: "Current (no optimization)",
      annualDKK: Math.round(homeKwh * HOME_STANDARD + publicKwh * CLEVER_ADHOC),
      perKm: null, notes: "Standard home tariff + ad-hoc CLEVER DC",
    },
    smart_home: {
      label: "Smart charging (off-peak at home)",
      annualDKK: Math.round(homeKwh * HOME_SMART + publicKwh * SPIRII_AC),
      perKm: null, notes: "Sunday noon at home + Spirii AC public. Denmark's weekend midday is 65% cheaper than weekday peak.",
    },
    clever_sub: {
      label: "CLEVER Unlimited subscription",
      annualDKK: Math.round(CLEVER_SUB + homeKwh * HOME_SMART),
      perKm: null, notes: "799 DKK/month unlimited · Includes home charger · Best if >1,800 km/month public",
    },
    hybrid: {
      label: "Hybrid: Smart home + Spirii",
      annualDKK: Math.round(homeKwh * HOME_SMART + publicKwh * SPIRII_AC),
      perKm: null, notes: "Recommended for <25,000 km/year with home charging",
    },
  };
  Object.values(scenarios).forEach(s => { s.perKm = (s.annualDKK / annualKm).toFixed(2); });

  const savings = scenarios.current.annualDKK - Math.min(...Object.values(scenarios).map(s => s.annualDKK));
  const best = Object.entries(scenarios).sort((a, b) => a[1].annualDKK - b[1].annualDKK)[0];

  // Break-even for CLEVER subscription
  const cleverBreakEvenPublicKmMonth = Math.round(CLEVER_SUB / 12 / ((CLEVER_ADHOC - HOME_SMART) * CONSUMPTION_KWH_PER_100KM / 100));

  res.json({
    inputs: { annualKm, annualKwh: Math.round(annualKwh), publicPct: Math.round(publicPct * 100), homeKwh: Math.round(homeKwh), publicKwh: Math.round(publicKwh) },
    scenarios,
    savings: Math.round(savings),
    bestScenario: best[0],
    cleverBreakEvenKmMonth: cleverBreakEvenPublicKmMonth,
    tip: savings > 5000 ? `You could save ${Math.round(savings).toLocaleString()} DKK/year with smarter charging.` : `Your current setup is reasonably optimized.`,
  });
});

// Telemetry SSE
app.get("/api/telemetry/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.setHeader("X-Accel-Buffering", "no"); res.flushHeaders();
  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ signals: telemetry.signals, alerts: telemetry.alerts.slice(-20), connected: telemetry.connected })}\n\n`);
  const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch (_) {} }, 25000);
  req.on("close", () => { sseClients.delete(res); clearInterval(hb); });
});

// Push subscriptions
app.post("/api/push/subscribe", (req, res) => {
  pushSubscriptions.push(req.body);
  res.json({ ok: true });
});

// ── Mac Menu Bar endpoint ─────────────────────────────────────────────────────
app.get("/api/menubar", async (req, res) => {
  try {
    // Returns SwiftBar-formatted text
    const d = lastVehicleData;
    const cs = d?.charge_state, vs = d?.vehicle_state;
    const pct   = cs?.battery_level ?? "?";
    const locked = vs?.locked ? "🔒" : "🔓";
    const state  = cs?.charging_state === "Charging" ? " ⚡" : "";
    const warn   = (cs?.battery_level < 20 || [vs?.tpms_soft_warning_fl, vs?.tpms_soft_warning_fr, vs?.tpms_soft_warning_rl, vs?.tpms_soft_warning_rr].some(Boolean)) ? " ⚠" : "";
    const geo    = geofence.active ? (geofence.status === "OUTSIDE" ? " 🚨" : "") : "";
    const line1  = `T ${pct}%${state}${locked}${warn}${geo}`;
    // SwiftBar submenu
    const menu = [
      line1, "---",
      `Battery: ${pct}% | color=#FFFFFF`,
      `Range: ${cs ? Math.round((cs.est_battery_range||0)*1.609) : "—"} km | color=#A0A0B0`,
      `Status: ${cs?.charging_state || "—"} | color=#A0A0B0`,
      `Sentry: ${vs?.sentry_mode ? "ON 🔴" : "OFF"} | color=#A0A0B0`,
      `Fence: ${geofence.active ? geofence.status : "OFF"} | color=#A0A0B0`,
      "---",
      `Open Dashboard | href=http://localhost:${PORT}`,
      "---",
      `Lock | bash=/usr/local/bin/curl param1=-s param2=-X param3=POST param4=http://localhost:${PORT}/api/vehicles/${cachedVehicles[0]?.id}/command/door_lock terminal=false refresh=true`,
      `Unlock | bash=/usr/local/bin/curl param1=-s param2=-X param3=POST param4=http://localhost:${PORT}/api/vehicles/${cachedVehicles[0]?.id}/command/door_unlock terminal=false refresh=true`,
      `Flash Lights | bash=/usr/local/bin/curl param1=-s param2=-X param3=POST param4=http://localhost:${PORT}/api/vehicles/${cachedVehicles[0]?.id}/command/flash_lights terminal=false`,
      `Honk | bash=/usr/local/bin/curl param1=-s param2=-X param3=POST param4=http://localhost:${PORT}/api/vehicles/${cachedVehicles[0]?.id}/command/honk_horn terminal=false`,
      `Start Climate | bash=/usr/local/bin/curl param1=-s param2=-X param3=POST param4=http://localhost:${PORT}/api/vehicles/${cachedVehicles[0]?.id}/command/auto_conditioning_start terminal=false refresh=true`,
    ].join("\n");
    res.type("text/plain").send(menu);
  } catch (e) { res.type("text/plain").send(`T ⚠ | color=red\n---\nError: ${e.message}`); }
});

// Public key
app.get("/.well-known/appspecific/com.tesla.3p.public-key.pem", (req, res) => {
  const k = process.env.TESLA_PUBLIC_KEY; if (!k) return res.status(404).send("Not configured"); res.type("text/plain").send(k);
});

// PWA assets
app.get("/manifest.json", (req, res) => res.json({ name: "Tesla", short_name: "Tesla", start_url: "/", display: "standalone", background_color: "#08080A", theme_color: "#08080A", orientation: "portrait", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }));
app.get("/sw.js", (req, res) => { res.setHeader("Content-Type", "application/javascript"); res.send(`const C='t5';self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['/'])));self.skipWaiting();});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/')||e.request.url.includes('/fleet-'))return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('/'))));});self.addEventListener('push',e=>{const d=e.data?.json()||{title:'Tesla Alert',body:'Vehicle notification'};e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'/icon.svg',tag:'tesla',requireInteraction:d.urgent}));});`); });
app.get("/icon.svg", (req, res) => { res.type("image/svg+xml"); res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#E31937"/><text x="96" y="132" font-size="108" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">T</text></svg>`); });

app.get("/", (req, res) => res.sendFile(require("path").join(__dirname, "client.html")));

server.listen(PORT, "0.0.0.0", () => {
  const ip = (() => { for (const i of Object.values(networkInterfaces())) for (const a of i) if (a.family === "IPv4" && !a.internal) return a.address; return "localhost"; })();
  console.log(`\n⚡ Tesla Dashboard v5\n   Local:  http://localhost:${PORT}\n   Phone:  http://${ip}:${PORT}\n   Bar:    http://localhost:${PORT}/api/menubar\n`);
});

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────
