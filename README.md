# Tesla Command Center

> Personal Tesla dashboard with real-time vehicle control, diagnostics, and monitoring.

**Live:** [commandcenter.agency](https://commandcenter.agency)

---

## Quick Start

### Cloud (Recommended)

1. Visit [commandcenter.agency](https://commandcenter.agency)
2. Click **"Connect Tesla"** — authenticates via Tesla OAuth
3. Add to Home Screen (iOS/Android) or Dock (macOS)

### Self-Hosted

```bash
git clone https://github.com/danielholmkristensen/tesla-command-center.git
cd tesla-command-center
npm install
```

Set environment variables:
```bash
export TESLA_CLIENT_ID="your-client-id"
export TESLA_CLIENT_SECRET="your-client-secret"
```

```bash
npm start
# Open http://localhost:3000
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Battery & Range** | Real-time charge state, range estimation, charging controls |
| **Climate** | Pre-condition, seat heaters, window venting |
| **Location** | Live map, Flash/Honk/Open micro-actions |
| **Sentry** | Enable/disable, geo-fence alerts, dashcam triggers |
| **Diagnostics** | Battery health, degradation analysis, fault detection |
| **Save Money** | Charging cost optimization for Danish market |

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for:
- System context and containers (C4 model)
- Component breakdown
- Data flow diagrams
- Deployment topology

---

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design (arc42 structure) |
| [API.md](docs/API.md) | REST API reference |
| [ADR/](docs/adr/) | Architecture Decision Records |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway, Vercel, Docker setup |
| [SECURITY.md](docs/SECURITY.md) | OAuth flow, token handling, data privacy |

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Real-time:** WebSocket (Fleet Telemetry), Server-Sent Events
- **Frontend:** Vanilla JS, PWA, Service Worker
- **Deployment:** Railway / Docker
- **Auth:** Tesla Fleet API OAuth 2.0

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TESLA_CLIENT_ID` | Yes | Tesla Developer App client ID |
| `TESLA_CLIENT_SECRET` | Yes | Tesla Developer App client secret |
| `TESLA_API_REGION` | No | `eu` (default) or `na` |
| `PORT` | No | Server port (default: 3000) |

---

## Project Structure

```
tesla-command-center/
├── server.js           # Express server, API routes, OAuth, WebSocket
├── client.html         # PWA frontend (single-file, no build step)
├── package.json        # Dependencies
├── railway.json        # Railway deployment config
├── .well-known/        # Tesla public key for Fleet API
├── keys/               # EC keypair (private key gitignored)
├── docs/               # Architecture & API documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   └── adr/            # Architecture Decision Records
├── start.command       # macOS launcher
├── setup.command       # macOS first-time setup
└── menubar.5m.sh       # SwiftBar menu bar plugin
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style and PR guidelines.

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Acknowledgments

- [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api)
- [Clean Code](https://www.oreilly.com/library/view/clean-code-a/9780136083238/) by Robert C. Martin
- [arc42](https://arc42.org/) documentation template
- [C4 Model](https://c4model.com/) for architecture visualization
