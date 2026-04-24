# shre-chat

Port: 5510 | Protocol: HTTPS | Dir: shre-chat/

## Purpose
Web-based chat interface for the Shre AI platform. All chat routes through shre-router for trust gate, budget enforcement, cost tracking, muscle memory, and conversation learning.

## Key Files
- `serve.js` — Express backend: shre-router proxy, auth, session sync, suggestions, reminders, task proxy
- `src/ChatView.tsx` — Main chat UI: message send/receive, streaming, process bar, agent switching
- `src/gateway-ws.ts` — WebSocket: terminal, notifications
- `src/router-client.ts` — HTTP streaming: SSE parsing, status mapping, shre-router primary
- `src/StatusBar.tsx` — Persistent status bar: connection status, active agents, pending tasks, calendar, reminders
- `src/taskDetector.ts` — "remind me to..." pattern detection + task creation via shre-tasks proxy
- `src/components/SuggestionsBar.tsx` — Contextual quick-reply suggestions based on assistant response patterns
- `src/components/process-bar/` — ExecutionTimeline, ProcessBar, ProcessDetail components
- `src/store.ts` — Zustand state: sessions, messages, activity feed, streaming state

## Status Bar (V2)
The StatusBar shows: gateway connection status (green/red dot), active agent count from shre-fleet, pending task count from shre-tasks, next calendar event countdown, reminder badge, agent busy/idle indicator, and mic button. Data fetched via `/api/status-bar` every 60s with 2s initial delay.

## Task Creation from Chat
When a user types "remind me to...", "create task:...", "todo:...", or similar patterns, the `taskDetector.ts` module detects the intent and fires a POST to `/api/tasks/create` (serve.js proxy to shre-tasks). Rate limited to 10/min. 2s cooldown between creations. Task confirmation appears as a system message in chat.

## Project Progress Events
When autonomous project execution is active, real-time progress events flow via WebSocket `/ws/notifications`:
- `project_progress:task_assigned` — "Agent picked up: [task title]"
- `project_progress:task_completed` — "Task done: [title] (N/M tasks)"
- `project_progress:task_failed` — "Task failed: [title] — self-correcting"
- `project_progress:project_completed` — "Project complete!"

Events rendered as inline system messages in chat via `useEscalationListener` hook. Classifications in `chat-utils.ts`.

## Conversation Reopen Events
Reactive automation rules (shre-cron Phase 3 dispatcher) can resurface a closed thread by firing a `conversation.reopen` action. shre-router handles that at `POST /v1/sessions/:id/reopen` and emits `conversation.reopened` on the bus. serve.js forwards it to WS clients; `useEscalationListener` routes it to the target session BEFORE the active-session filter, so the follow-up message lands in the correct thread even if the user is on a different one. The session's `updatedAt` bumps and the sidebar re-sorts so the reopened thread surfaces.

## Chat Flow (v2.0)
All chat messages route through shre-router — no bypass:
1. Browser → `sendMessage()` in `router-client.ts` → POST `/api/router/v1/chat`
2. serve.js proxies to shre-router:5497 (SSE streaming-safe)
3. shre-router: trust gate → budget → soul injection → RAG → 10-gate routing → provider proxy → cost recording → learning
4. If shre-router is down → user sees error (no silent fallback)

WebSocket paths: `/ws/terminal` (PTY), `/ws/notifications` (reminders/status). All other WS upgrade requests are rejected (403).

The `/v1/*` proxy also routes through shre-router.

## Dependencies
- shre-router (port 5497) — PRIMARY: all chat, model routing, Whisper, cost tracking, learning
- shre-tasks (port 5460) — task creation from chat, pending task counts for status bar
- shre-fleet (port 5498) — active agent count for status bar
- Ollama (port 11434) — direct mode fallback (local models)
- Cloudflare Tunnel — exposed at chat.nirtek.net
