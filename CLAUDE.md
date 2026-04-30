# shre-chat

Port: 5510 | Protocol: HTTPS | Dir: shre-chat/

## Purpose
Web-based chat interface for the Shre AI platform. Default chat uses the local direct path for fast recovery and offline resilience, while the router-backed path remains available for trust gate, budget enforcement, cost tracking, muscle memory, and conversation learning. Direct mode syncs durable state back to router asynchronously.

## Key Files
- `serve.js` — Express backend: local direct chat path, shre-router sync/proxy, auth, session sync, suggestions, reminders, task proxy
- `src/ChatView.tsx` — Main chat UI: message send/receive, streaming, process bar, agent switching
- `src/gateway-ws.ts` — WebSocket: terminal, notifications
- `src/router-client.ts` — HTTP streaming: SSE parsing, status mapping, router-backed and direct-local chat paths
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
Direct mode is local-first. Router-backed mode remains available when the trust gate or shared routing features are needed:
1. Browser → `sendMessage()` in `router-client.ts` → POST `/api/router/v1/chat`
2. `gatewayMode=direct` → POST `/api/direct/v1/chat`
3. `serve.js` streams local Ollama output, persists the conversation locally, and syncs a learning record back to shre-router
4. If the direct path is unavailable → user sees a local-service error

WebSocket paths: `/ws/terminal` (PTY), `/ws/notifications` (reminders/status). All other WS upgrade requests are rejected (403).

The `/v1/*` proxy still routes through shre-router for the features that depend on the shared gateway.

## Dependencies
- shre-router (port 5497) — PRIMARY for routed chat, memory sync, Whisper, cost tracking, learning
- Ollama (port 11434) — primary local direct-mode model path
- shre-tasks (port 5460) — task creation from chat, pending task counts for status bar
- shre-fleet (port 5498) — active agent count for status bar
- Cloudflare Tunnel — exposed at chat.nirtek.net
