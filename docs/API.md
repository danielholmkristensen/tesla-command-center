# API Reference

Base URL: `https://commandcenter.agency`

## Auth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/tesla` | GET | Start OAuth flow |
| `/callback` | GET | OAuth callback (internal) |
| `/api/configured` | GET | Check if authenticated |
| `/api/logout` | POST | Clear session |

## Vehicle

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vehicles` | GET | List vehicles |
| `/api/vehicles/:id/data` | GET | Full vehicle state |
| `/api/vehicles/:id/location` | GET | GPS coordinates |

## Commands

`POST /api/command/:cmd`

| Command | Effect |
|---------|--------|
| `lock` | Lock doors |
| `unlock` | Unlock doors |
| `climate_on` | Start HVAC |
| `climate_off` | Stop HVAC |
| `flash` | Flash lights |
| `honk` | Honk horn |
| `open_frunk` | Open front trunk |
| `open_trunk` | Open rear trunk |
| `start_charge` | Begin charging |
| `stop_charge` | Stop charging |
| `sentry_on` | Enable Sentry Mode |
| `sentry_off` | Disable Sentry Mode |

**Body params (optional):**
```json
{ "temp": 21, "charge_limit": 80 }
```

## Real-time

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `/events` | SSE | Vehicle state updates |
| `/fleet-telemetry` | WebSocket | Diagnostic signals |

## Errors

```json
{ "error": "Token expired" }
```

| Status | Meaning |
|--------|---------|
| 401 | Re-authenticate required |
| 408 | Vehicle asleep, retry |
| 500 | Server/API error |
