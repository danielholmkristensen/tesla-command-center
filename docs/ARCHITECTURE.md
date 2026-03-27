# Architecture

## Context

```
┌──────────┐      ┌─────────────────────┐      ┌─────────────┐
│  User    │─────▶│  Command Center     │─────▶│  Tesla API  │
│  (PWA)   │◀─────│  (Node.js/Railway)  │◀─────│  (Fleet)    │
└──────────┘      └─────────────────────┘      └─────────────┘
```

Single server proxies all Tesla API calls. Client is a PWA — installable, offline-capable, no app store.

## Containers

| Container | Stack | Role |
|-----------|-------|------|
| Web Server | Express | OAuth, API proxy, SSE |
| WebSocket | ws | Fleet Telemetry signals |
| Client | Vanilla JS | PWA with Service Worker |

## Key Flows

**Auth:** `/auth/tesla` → Tesla OAuth → `/callback` → tokens stored in RAM

**Commands:** Client → `POST /api/command/:cmd` → Server signs → Fleet API → Vehicle

**Real-time:** Fleet Telemetry → WebSocket → Server → SSE → Client

## Constraints

- **Fleet API only** — Owner API deprecated
- **Signed commands** — Post-2021 vehicles require EC signatures
- **8h token expiry** — Auto-refresh on 401

## Decisions

| Decision | Rationale |
|----------|-----------|
| Single-file client | No build step, instant deploys |
| Railway over Vercel | WebSocket support required |
| RAM-only tokens | Security: no disk persistence |
| Fleet API | Owner API ceased 2024 |

## Quality Targets

| Metric | Target |
|--------|--------|
| Page load | < 2s |
| Command latency | < 5s |
| Uptime | 99.5% |

## Risks

| Risk | Mitigation |
|------|------------|
| API changes | Abstract calls, monitor Tesla announcements |
| Token revocation | Clear messaging, easy re-auth |
