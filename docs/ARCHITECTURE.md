# Shre Chat — Architecture

## System Overview

Shre Chat is a browser-first chat UI that connects to the Shre AI platform via shre-router. It runs as a static site with a Node.js backend proxy (`serve.js`) handling auth, streaming, sessions, and WebSocket.

```
                                    Shre Platform
                                    ┌─────────────────────┐
  Browser (React SPA)               │  shre-router :5497  │
  ┌──────────────────┐    HTTP/SSE  │  ┌───────────────┐  │
  │ ChatView         ├─────────────►│  │ Trust Gate    │  │
  │ Sidebar          │              │  │ Budget Check  │  │
  │ StatusBar        │              │  │ RAG Injection │  │
  │ TerminalView     │              │  │ Model Routing │  │
  │ VoiceAssistant   │              │  │ Cost Tracking │  │
  └────────┬─────────┘              │  └───────────────┘  │
           │                        └─────────────────────┘
           │ WebSocket                        │
           ▼                                  ▼
  ┌──────────────────┐              ┌─────────────────────┐
  │ serve.js :5510   │              │  AI Providers       │
  │ ┌──────────────┐ │              │  Ollama, OpenAI,    │
  │ │ Auth (JWT)   │ │              │  Anthropic, Google  │
  │ │ Session DB   │ │              └─────────────────────┘
  │ │ SSE Proxy    │ │
  │ │ PTY Terminal │ │              ┌─────────────────────┐
  │ │ Voice Proxy  │ │              │  Platform Services  │
  │ │ Heartbeat    │ │              │  shre-tasks :5460   │
  │ │ Training WAL │ │              │  shre-fleet :5498   │
  │ └──────────────┘ │              │  shre-auth  :5455   │
  └──────────────────┘              │  shre-meter :5495   │
                                    └─────────────────────┘
```

## Frontend Architecture

**Stack:** React 19, Vite, Zustand, Tailwind CSS, xterm.js

### Component Tree

```
App
├── Sidebar
│   ├── AgentPicker
│   ├── SessionList (date-grouped)
│   ├── NavigationIcons (views)
│   └── ThemeToggle / WriteToggle
├── ChatView
│   ├── MessageList
│   │   ├── UserMessage
│   │   ├── AssistantMessage (markdown + code blocks)
│   │   └── SystemMessage (grouped under user prompt)
│   ├── ChatComposer (textarea + send + attachments)
│   ├── SuggestionsBar
│   └── TerminalView (xterm.js, tabbed)
├── StatusBar
│   ├── ConnectionDot (green/red)
│   ├── AgentCount (from shre-fleet)
│   ├── TaskCount (from shre-tasks)
│   ├── PipelineIndicator (route → model → exec → score)
│   └── MicButton
└── ViewNavHeader
    └── View switcher (chat, tasks, agents, history, files, terminal, agent-trace)
```

### State Management (Zustand)

```
store.ts
├── sessions: Map<agentId, Session[]>
├── messages: Map<sessionKey, Message[]>
├── activeAgent: string
├── activeSession: string
├── view: 'chat' | 'tasks' | 'agents' | ...
├── streaming: boolean
├── connectionStatus: 'connected' | 'disconnected'
└── theme: 'dark' | 'light'
```

### Views

| View | Component | Purpose |
|------|-----------|---------|
| `chat` | ChatView | Primary chat interface |
| `tasks` | TasksView | Task list from shre-tasks |
| `agents` | AgentsView | Agent directory |
| `history` | HistoryView | Session history |
| `files` | FilesView | File browser |
| `terminal` | TerminalView | PTY terminal |
| `agent-trace` | AgentTraceView | Agent routing/metrics |
| `router-gateway` | RouterGatewayEmbed | Router status panel |
| `preview` | PreviewView | Document preview |

## Backend Architecture (serve.js)

`serve.js` is a single-file Node.js HTTP server (~7200 lines) that handles:

### Request Pipeline

```
Incoming Request
    │
    ├── Security Headers (CSP, HSTS, X-Frame-Options)
    ├── CSRF Check (Origin validation)
    ├── Rate Limiting (per-IP, per-user buckets)
    ├── JWT Auth Check (except PUBLIC_PATHS)
    │
    ├── /api/auth/*     → Auth module (routes/auth.js)
    ├── /api/router/*   → SSE proxy to shre-router
    ├── /api/sessions/* → Session module (routes/sessions.js)
    ├── /api/voice/*    → Voice module (routes/voice.js)
    ├── /api/tasks/*    → Task proxy to shre-tasks
    ├── /ws/terminal    → PTY WebSocket
    ├── /ws/notifications → Notification WebSocket
    │
    └── Static files    → dist/ (Vite build output)
```

### Session Storage

Sessions are stored in SQLite (`~/.shre/sessions.db`):
- Per-agent, per-user session isolation
- Message compaction (summarize old messages)
- Cross-device sync via auth token

### Training Data Pipeline

Every conversation writes to the training WAL (Write-Ahead Log) via `shre-sdk/training`:
- Conversations stored for model fine-tuning
- Never truncated (append-only)
- Replayed on startup for durability

## Security Model

- **Auth:** JWT tokens via shre-auth, stored as httpOnly cookies
- **2FA:** Optional per-user, TOTP via email
- **CSRF:** Origin header validation on all mutations
- **Rate Limiting:** 30 attempts/15min for localhost, 5 for external
- **Identity Gate:** Optional vault-based identity verification
- **Input Sanitization:** DOMPurify for rendered markdown
- **CSP:** Strict Content-Security-Policy headers

## Data Flow: Chat Message

```
1. User types in ChatComposer → Ctrl+Enter
2. store.addMessage(userMsg)
3. router-client.ts → POST /api/router/v1/chat (SSE)
4. serve.js:
   a. Validates JWT, extracts user claims
   b. Injects x-tenant-id, x-user-id, x-channel headers
   c. Fetches context from shre-context (platform, RAG, data, contacts)
   d. Proxies to shre-router with context injection
5. SSE events stream back:
   - delta: partial token → store.appendToken()
   - done: full response → store.finalizeMessage()
   - tool_use: tool execution → ProcessBar animation
6. serve.js post-stream:
   a. Writes conversation to training WAL
   b. Triggers conversation learner (RAG extraction)
   c. Emits event bus notification
```
