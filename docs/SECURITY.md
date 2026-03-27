# Security

## Token Handling

| Token | Storage | Lifetime |
|-------|---------|----------|
| Access | RAM only | 8 hours |
| Refresh | RAM only | Single-use |

Tokens never written to disk. Server restart requires re-authentication.

## OAuth Flow

1. User clicks "Connect Tesla"
2. Redirect to `auth.tesla.com` with PKCE
3. User authenticates with Tesla (we never see credentials)
4. Tesla redirects to `/callback` with authorization code
5. Server exchanges code for tokens
6. Tokens stored in memory

## Data Privacy

- No telemetry sent to third parties
- No analytics or tracking
- Vehicle data cached in RAM only
- No logs contain tokens or PII

## Transport

- HTTPS enforced (Railway handles TLS)
- HSTS headers enabled
- WebSocket over WSS only

## Key Management

| Key | Location | Purpose |
|-----|----------|---------|
| Public | `/.well-known/...` | Tesla verifies app identity |
| Private | `keys/private.pem` | Signs commands (gitignored) |

Private key never leaves the server. Required only for post-2021 vehicle commands.
