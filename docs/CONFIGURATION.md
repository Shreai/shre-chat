# Shre Chat — Configuration

## Environment Variables

### Required

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5510` | Server port |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode (`production` enables TLS, stricter CSP) |
| `ROUTER_ADMIN_TOKEN` | — | Admin token for shre-router API calls |
| `SHRE_ADMIN_USER` | — | Admin username override (fallback auth) |
| `SHRE_ADMIN_PASSWORD` | — | Admin password override (fallback auth) |
| `SHRE_TASKS_TOKEN` | — | Auth token for shre-tasks API |
| `SHRE_FEED_TOKEN` | — | Auth token for activity feed |
| `SHRE_CHAT_URL` | `http://localhost:5510` | Public URL (for share links, Cloudflare Tunnel) |
| `SHRE_DIR` | `~/.shre` | Data directory for sessions, config |
| `CORTEXDB_URL` | `http://127.0.0.1:5400` | CortexDB connection URL |
| `CORTEX_PG_PASSWORD` | — | PostgreSQL password for CortexDB |
| `CENTRIX_URL` | — | Centrix ERP URL (for centrix-agent proxy) |
| `OPENAI_API_KEY` | — | Direct OpenAI key (used only for fallback, not routing) |
| `ANTHROPIC_API_KEY` | — | Direct Anthropic key (used only for fallback, not routing) |
| `NODE_EXTRA_CA_CERTS` | — | Path to additional CA certificates |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5510` | Base URL for E2E tests |
| `DEV_BYPASS_AUTH` | — | Set to `true` to skip auth in dev mode |

## Ports

shre-chat listens on port **5510** (configurable via `PORT` env var).

Dependent services and their ports (from `ports.json`):

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| shre-chat | 5510 | HTTP | This service |
| shre-router | 5497 | HTTP | AI routing gateway |
| shre-auth | 5455 | HTTP | Authentication |
| shre-auth-gate | 5431 | HTTP | Auth middleware |
| shre-tasks | 5460 | HTTP | Task management |
| shre-fleet | 5498 | HTTP | Agent orchestration |
| shre-meter | 5495 | HTTP | Cost tracking |
| shre-contacts | 5468 | HTTP | Contact search |
| shre-context | 5462 | HTTP | Context injection |
| CortexDB | 5400 | HTTP | Database (Docker) |
| cortex-bridge | 5450 | HTTP | DB bridge |
| Ollama | 11434 | HTTP | Local LLM inference |

## Auth Setup

shre-chat delegates authentication to shre-auth:

1. User submits credentials via `/api/auth/login`
2. shre-chat proxies to `shre-auth:5455/v1/auth/login`
3. On success, JWT token set as `shre_token` httpOnly cookie
4. All subsequent requests validate the JWT

### Signing Key

JWT verification uses a shared signing key at `~/.shre/auth/signing-key.hex`. Both shre-auth and shre-chat must use the same key.

### 2FA (Optional)

Users with 2FA enabled in `~/.shre/users.json` receive a TOTP code via email. Device trust tokens can bypass 2FA on recognized devices.

### Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Login (localhost) | 30 attempts | 15 minutes |
| Login (external) | 5 attempts | 15 minutes |
| Identity verify | 3 attempts | 15 minutes |

Rate limits are in-memory and reset on server restart.

## TLS / HTTPS

TLS is optional. When TLS cert/key are present at `~/.shre/tls/`, the server starts in HTTPS mode. Otherwise, it runs HTTP.

For production behind Cloudflare Tunnel, TLS termination happens at the tunnel — the server runs HTTP internally.

## Data Directories

| Path | Purpose |
|------|---------|
| `~/.shre/sessions.db` | SQLite session database |
| `~/.shre/users.json` | Local user store (2FA config) |
| `~/.shre/auth/signing-key.hex` | JWT signing key |
| `~/.shre/tls/` | TLS certificate and key |
| `~/.shre/training/` | Training data WAL |
| `~/Library/Logs/shre-services/` | Service logs (macOS) |

## Cloudflare Tunnel

Public access via `chat.nirtek.net` is routed through a Cloudflare Tunnel:

```
chat.nirtek.net → Cloudflare Tunnel → localhost:5510
```

LaunchAgent: `~/Library/LaunchAgents/ai.shre.cloudflare-tunnel.plist`
