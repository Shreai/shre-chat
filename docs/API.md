# Shre Chat — API Reference

Base URL: `http://localhost:5510`

## Authentication

All authenticated endpoints require a JWT token as an `shre_token` cookie (set on login).

### POST /api/auth/login

Login and receive a JWT token.

```bash
curl -X POST http://localhost:5510/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5510" \
  -d '{"username":"rapidnir","password":"rapid@nir"}'
```

**Response (200):**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "username": "rapidnir", "email": "...", "name": "Nir" },
  "workspace": { "id": "uuid", "name": "Nirlab", "role": "owner" }
}
```

**Rate Limits:** 30 attempts/15min from localhost, 5 from external IPs.

### GET /api/auth/check

Check if current session is authenticated.

**Response:** `{ "authenticated": true, "user": {...} }`

---

## Chat

### POST /api/router/v1/chat

Send a chat message. Returns an SSE stream.

```bash
curl -X POST http://localhost:5510/api/router/v1/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: shre_token=eyJ..." \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"auto"}'
```

**SSE Events:**
```
data: {"type":"delta","content":"Hello"}
data: {"type":"delta","content":" there!"}
data: {"type":"done","content":"Hello there!","model":"gpt-4o","tokens":12}
```

### POST /api/cli/chat

Same as above, for CLI clients.

---

## Sessions

### GET /api/sessions/:agentId

List all sessions for an agent.

**Response:** `Session[]` — array of `{ id, title, lastMessage, updatedAt }`

### GET /api/sessions/:agentId/:sessionId

Get a session with full message history.

**Response:** `{ id, title, messages: Message[], model, createdAt, updatedAt }`

### POST /api/sessions/:agentId/:sessionId/compact

Compact old messages into a summary to reduce context size.

**Response:** `{ ok: true, compacted: 15, remaining: 5 }`

---

## Voice

### POST /api/transcribe

Speech-to-text. Send audio as `audio/webm`.

```bash
curl -X POST http://localhost:5510/api/transcribe \
  -H "Cookie: shre_token=eyJ..." \
  -H "Content-Type: audio/webm" \
  --data-binary @recording.webm
```

**Response:** `{ "text": "transcribed text here" }`

### POST /api/tts

Text-to-speech. Returns MP3 audio.

```bash
curl -X POST http://localhost:5510/api/tts \
  -H "Content-Type: application/json" \
  -H "Cookie: shre_token=eyJ..." \
  -d '{"text":"Hello world"}' --output speech.mp3
```

### POST /api/tts/stream

Streaming TTS. Returns SSE audio chunks.

---

## Agents

### GET /api/agents

List available agents.

**Response:**
```json
[
  { "id": "shre", "name": "Shre", "description": "CEO agent", "status": "online" },
  { "id": "ellie", "name": "Ellie", "description": "President agent" }
]
```

---

## Tasks

### GET /api/tasks

List pending tasks (proxied from shre-tasks).

### POST /api/tasks/create

Create a task from chat (e.g., "remind me to...").

```json
{ "title": "Review PR", "priority": "medium", "dueAt": "2026-04-12T10:00:00Z" }
```

---

## Files

### GET /api/files/view?path=/path/to/file

Serve a file with correct Content-Type. Public endpoint (no auth).

### GET /api/files/preview?path=/path/to/file&width=200

Get file metadata and optional thumbnail. Public endpoint.

### GET /api/files/recent?dir=Downloads&count=10

List recent files from common directories.

---

## Model

### GET /api/model

Get current model. **Response:** `{ "model": "auto" }`

### POST /api/model

Switch model. **Body:** `{ "model": "gpt-4o" }`

---

## Sharing

### POST /api/share

Create shareable link for a session.

**Body:** `{ "sessionId": "uuid", "agentId": "shre" }`
**Response:** `{ "shareId": "abc123", "url": "http://localhost:5510/share/abc123" }`

### GET /api/share/:shareId

View a shared session (public, no auth).

---

## Notification Delivery

### GET /api/notification-delivery/config

Return the current Slack/email delivery config and effective status.

### PUT /api/notification-delivery/config

Persist local Slack/email delivery config in `~/.shre/shre-chat-notification-delivery.json`.

**Body:**
```json
{
  "slackEnabled": true,
  "slackWebhookUrl": "https://hooks.slack.com/services/...",
  "slackWebhookRoutes": {
    "fleet": "https://hooks.slack.com/services/...",
    "project:abc123": "https://hooks.slack.com/services/..."
  },
  "emailEnabled": true,
  "emailTo": "alerts@company.com",
  "emailAccount": "default",
  "importantOnly": true
}
```

### POST /api/notification-delivery/test

Send a test notification to Slack and/or email.

**Body:**
```json
{ "channels": ["slack", "email"] }
```

---

## Search

### GET /api/search?q=query

Search across all chat sessions.

**Response:** `SearchResult[]` with matched messages and sessions.

---

## Cost Data

### GET /api/costs/:path

Proxy to shre-meter for cost tracking data.

---

## WebSocket

### WS /ws/terminal

PTY terminal session. Send/receive terminal data as binary frames.

**Query params:** `?cols=80&rows=24&cmd=bash`

### WS /ws/notifications

Notification stream. Receives JSON messages:

```json
{ "type": "reminder.due", "title": "Review PR", "source": "tasks" }
{ "type": "project_progress:task_completed", "title": "Task done: Fix login" }
{ "type": "ellie.escalation", "title": "Ellie is investigating" }
```

---

## Health

### GET /health

**Response:**
```json
{
  "ok": true,
  "service": "shre-chat",
  "port": 5510,
  "uptime": 3600,
  "tls": false,
  "gatewayToken": true,
  "activeCLI": 0,
  "activeTerminal": false,
  "memory": { "rss": 43, "heap": 17 }
}
```

### GET /readyz

Readiness probe. Returns 200 when ready, 503 during startup.
