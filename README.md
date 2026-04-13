# Shre Chat

Web-based chat interface for the Shre AI platform. All AI routing goes through shre-router for trust gate, budget enforcement, cost tracking, and conversation learning.

**Port:** 5510 | **Stack:** Vite + React 19 + Zustand | **Backend:** Node.js (serve.js)

## Quick Start

```bash
# Install dependencies
pnpm install

# Development (hot reload on port 5000)
npm run dev

# Production build + serve
npm run build
npm run serve          # Starts on port 5510
```

Open `http://localhost:5510` in your browser. Login: `rapidnir` / `rapid@nir`

## Architecture

```
Browser ──► serve.js (port 5510) ──► shre-router (port 5497) ──► AI providers
              │                           │
              ├── /api/auth/*             ├── Trust gate
              ├── /api/router/v1/chat     ├── Budget enforcement
              ├── /api/sessions/*         ├── Cost tracking
              ├── /ws/terminal (PTY)      └── Model routing
              └── /ws/notifications
```

### Key Files

| File | Purpose |
|------|---------|
| `serve.js` | Production server: auth, proxy, sessions, WebSocket, voice |
| `src/ChatView.tsx` | Main chat UI: messaging, streaming, agent switching |
| `src/Sidebar.tsx` | Session list, navigation, agent picker |
| `src/StatusBar.tsx` | Connection status, agent count, tasks, calendar |
| `src/TerminalView.tsx` | Embedded terminal (xterm.js + PTY) |
| `src/store.ts` | Zustand state: sessions, messages, streaming |
| `contract.json` | API contract: all endpoints, types, events |
| `routes/auth.js` | Authentication: JWT, 2FA, rate limiting |
| `routes/voice.js` | Voice: STT/TTS via shre-router |

### Chat Flow

1. User types message in `ChatView.tsx`
2. `router-client.ts` sends POST to `/api/router/v1/chat`
3. `serve.js` proxies to shre-router:5497 (SSE streaming)
4. shre-router: trust gate -> budget -> RAG -> routing -> provider -> cost recording
5. Response streams back as SSE events

### WebSocket Channels

| Path | Purpose |
|------|---------|
| `/ws/terminal` | PTY terminal sessions |
| `/ws/notifications` | Reminders, status updates, project progress |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 5000, hot reload) |
| `npm run build` | Production Vite build to `dist/` |
| `npm run serve` | Start production server (port 5510) |
| `npm run preview` | Vite preview (port 5510) |
| `npm run build:app` | Build Electron desktop app |
| `npm run test:e2e` | Run all Playwright E2E tests |
| `npm run qa` | Full QA: run tests + create bug tasks |
| `npm run qa:agent -- chat-core` | Run single test agent |
| `npm run qa:rerun` | Re-run only failed tests |
| `npm run qa:dry` | Test run without creating tasks |
| `npm run test:android` | Run tests on connected Android device |

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the full test guide including Android device testing.

```bash
# Quick smoke test
npm run qa:agent -- smoke

# Full QA suite (all 16 agents, ~8 min)
npm run qa

# Test on Android device (USB debugging required)
npm run test:android
```

## Configuration

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for environment variables, ports, and auth setup.

## Dependencies

| Service | Port | Required | Purpose |
|---------|------|----------|---------|
| shre-router | 5497 | Yes | AI routing, trust gate, cost tracking |
| shre-auth | 5455 | Yes | Authentication |
| shre-tasks | 5460 | Optional | Task creation from chat |
| shre-fleet | 5498 | Optional | Agent count for status bar |
| Ollama | 11434 | Optional | Local model fallback |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, component map |
| [API Reference](docs/API.md) | All endpoints with request/response examples |
| [Testing Guide](docs/TESTING.md) | Test infrastructure, agents, Android testing |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, ports, auth |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [CLAUDE.md](CLAUDE.md) | AI assistant context (auto-loaded) |
