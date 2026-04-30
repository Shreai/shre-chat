# Shre Chat — Architecture

## System Overview

Shre Chat is a browser-first chat UI that can run either through `shre-router` or directly against the local chat service. It runs as a static site with a Node.js backend proxy (`serve.js`) handling auth, streaming, sessions, and sync.

Shre Chat is also the command surface for Shre OS. Product launches may flow through it, but product ownership stays separate from the command center. If a product like AROS needs its own identity, release cadence, or support path, treat it as a separate product with shared platform services rather than a hard fork of the core shell.

AROS can layer on its own theme pack and brand tokens while reusing the shared shell, which gives it a distinct identity without duplicating the core UI.

Frontend and backend stay separated on purpose: the React app owns presentation, the Node backend owns auth, routing, and secret-bearing operations, and the browser only talks to server APIs. Shared data should cross that boundary through secure API routes, not through direct secret access in the client bundle.

Backend work should be treated as a schema/API discipline and frontend work as a UI/motion discipline. The backend expert should shape data models, database tables, auth flows, and secure API contracts first. The frontend expert should shape layout, CSS, animation, responsive behavior, and accessibility. Generalist delivery is fine, but the review checklist should still split those concerns.

The platform also uses a memory and retrieval pattern that should stay narrow by default: store facts structurally, retrieve the smallest useful context first, keep raw/summary/embedding forms separate, and route work to the smallest capable agent. See [Memory and Retrieval Blueprint](MEMORY-RETRIEVAL-BLUEPRINT.md) for the concrete pattern.

```
                                    Shre Platform
                 ┌──────────────────────────────┐
                 │      shre-router :5497       │
                 │  trust gate / policy / sync   │
                 └───────────────┬───────────────┘
                                 │ async sync
                                 ▼
  Browser (React SPA)   HTTP/SSE ┌─────────────────────┐
  ┌──────────────────┐──────────►│  serve.js :5510     │
  │ ChatView         │           │  ┌──────────────┐   │
  │ Sidebar          │           │  │ Local direct │   │
  │ StatusBar        │           │  │ chat path    │   │
  │ TerminalView     │           │  │ Auth (JWT)   │   │
  │ VoiceAssistant   │           │  │ Session DB   │   │
  └────────┬─────────┘           │  │ SSE Proxy    │   │
           │ WebSocket            │  │ PTY Terminal │   │
           ▼                      │  │ Voice Proxy  │   │
  ┌──────────────────┐            │  │ Heartbeat    │   │
  │ local providers   │            │  │ Training WAL │   │
  │ Ollama, OpenAI,   │            │  └──────────────┘   │
  │ Anthropic, Google │            └─────────────────────┘
  └──────────────────┘
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

Direct mode is local-first. If enabled, `/api/direct/v1/chat` streams from the local model path,
persists the conversation locally, and syncs a learning record back to `shre-router`
asynchronously.

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
    ├── /api/direct/*   → Local direct chat path with async router sync
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

Canonical history lives in `chat_sessions.messages`.
The `chat_messages` table is treated as a secondary extracted/indexed view for compatibility,
search, and recovery rather than the primary source of truth.
Trimmed-session restore reads the full canonical session history rather than a paginated excerpt.

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
- **Client boundary:** secrets, tokens, and backend credentials stay on the server; the frontend only calls safe API routes
- **Role boundary:** backend architecture, database schema, and API design are reviewed separately from frontend layout, motion, and visual polish

## Data Flow: Chat Message

```
1. User types in ChatComposer → Ctrl+Enter
2. store.addMessage(userMsg)
3. router-client.ts → POST /api/direct/v1/chat when direct mode is enabled, otherwise POST /api/router/v1/chat (SSE)
4. serve.js:
   a. Validates JWT, extracts user claims
   b. Routes direct mode to local model execution and persists it locally
   c. Proxies router mode to shre-router without mutating the payload
   d. Syncs direct-mode learning records back to shre-router asynchronously
5. SSE events stream back:
   - delta: partial token → store.appendToken()
   - done: full response → store.finalizeMessage()
   - tool_use: tool execution → ProcessBar animation
6. serve.js post-stream:
    a. Extracts user/assistant messages for local SQLite history
    b. Client posts `/api/conversation-log` for audit/training side effects
    c. Session state syncs separately via `/api/chat-sessions/*`
```

## Evidence-First Runtime

The preferred runtime model for enterprise chat is:

```
User request
  ↓
Classifier + policy gate
  ↓
Scoped evidence retrieval
  ↓
Reasoning over evidence packet
  ↓
Tool execution only if needed
  ↓
Verifier
  ↓
Final answer or action with sources + audit log
```

### Core Split

- `Files / records / docs` = evidence
- `Tools` = actions
- `Models` = reasoning engines
- `Policy` = gatekeeper

### Runtime Plan

The model should not begin by exploring tools. It should first receive a citable context packet assembled from the allowed tenant, domain, and object scope.

```
Workspace / Tenant
 ├─ Source Registry
 │   ├─ ERP
 │   ├─ CRM
 │   ├─ POS
 │   ├─ Accounting
 │   └─ Scheduling
 │
 ├─ Business Object Index
 │   ├─ Customer
 │   ├─ Invoice
 │   ├─ Payment
 │   ├─ Product
 │   ├─ Shift
 │   └─ LedgerEntry
 │
 ├─ Retrieval Layer
 │   ├─ vector search
 │   ├─ keyword search
 │   ├─ SQL lookups
 │   └─ record resolver
 │
 ├─ Tool Registry
 │   ├─ read tools
 │   ├─ write tools
 │   └─ workflow tools
 │
 ├─ Policy Engine
 │   ├─ permissions
 │   ├─ allowed domains
 │   ├─ allowed tools
 │   └─ allowed models
 │
 └─ Agent Runtime
     ├─ router
     ├─ specialist agents
     ├─ verifier
     └─ audit log
```

### Tool Scoping Rule

For a POS reconciliation issue, the router should expose only the relevant tools:

```json
{
  "allowed_tools": [
    "crm_customer_lookup",
    "pos_transaction_search",
    "accounting_invoice_search",
    "accounting_payment_match"
  ]
}
```

Payroll, HR, inventory-write, and scheduling tools should stay blocked unless the classifier and policy engine explicitly widen scope.

### Verifier Requirements

The verifier should run before any final answer or action. It should check:

- Did the answer cite retrieved records?
- Was every tool allowed?
- Were permissions checked?
- Did the model invent any field?
- Is this read-only, or does it change state?

### High-Risk Action Flow

For money, payroll, tax, refunds, inventory, or schedule changes:

```
draft → preview → user approval → execute
```

### Hard Runtime Phases

The chat runtime now treats every request as a three-stage flow:

```
research → planning → implementation
```

- Research: fetch and normalize evidence only
- Planning: choose scope, allowed tools, and action path
- Implementation: answer, call approved tools, or execute the approved write path

The client records phase timing and predicts slowdowns when:

- source layers are missing or stale
- evidence retrieval is slow
- scope is broad or tool menus are too large
- first-token latency is high
- compare mode fans out to many models
- approval-gated writes are likely to stall

### Combined Pattern

- Perplexity-style layer: find the right evidence
- Agent/tool layer: take the right action
- Policy layer: only within allowed scope
- Verifier: prove it before saying it
- Bottleneck predictor: surface slow or failing stages early

The concrete runtime contract lives in [runtime-contract.json](runtime-contract.json).

## Perplexity Analogy

Public Perplexity documentation supports the idea that Spaces and Internal Knowledge Search behave like a source layer rather than a simple folder tree:

- Spaces can use web sources, attached files, and enterprise sources.
- Uploaded files are parsed and become searchable sources in a Space or org file repository.
- Long files are reduced to the most relevant sections for a query.
- Responses include file citations.
- Users can choose source scope such as `Web`, `Org Files`, `Web + Org Files`, or `None`.

That supports the high-level design claim:

> The model likely does not browse a folder tree directly. It reasons over retrieved evidence from a controlled source layer.

What is still speculative is the exact internal implementation:

- whether Perplexity uses a literal graph, a tree, or both
- whether the primary retrieval stack is vector search, keyword search, or hybrid ranking
- how source normalization is implemented internally

So the safe conclusion is:

> Public evidence supports a source-registry + retrieval-index abstraction. The exact storage topology remains an inference.
