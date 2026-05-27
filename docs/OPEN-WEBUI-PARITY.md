# Shre Chat — Open WebUI Parity Matrix

Last updated: 2026-05-26 (Phase 1 in progress)

This document defines the parity target for "make MIB chat like Open WebUI" as a concrete implementation checklist for `shre-chat`.

## Scope baseline

Parity target categories:
- Core chat UX
- Model/provider controls
- Tool usage UX
- File and multimodal support
- Knowledge/RAG behavior
- Session management and search
- Share and collaboration
- Auth, roles, and admin
- Voice and realtime
- Mobile/responsive behavior

Status legend:
- `complete`: present and user-usable
- `partial`: present but below Open WebUI UX/behavior
- `missing`: not implemented or not wired end-to-end

## Parity matrix

| Area | Capability | Status | Evidence | Gap to close |
|---|---|---|---|---|
| Core Chat | Streaming chat + markdown/code output | complete | `src/router-client.ts`, `src/components/MessageList.tsx` | Keep performance tuning |
| Core Chat | Retry/edit/regenerate flow | partial | edit/branch UI exists in `src/ChatView.tsx` | Add explicit regenerate controls and clearer version timeline UX |
| Core Chat | Conversation presets / system persona controls | partial | `SystemPromptEditor`, mode controls exist | Need first-class preset management UX |
| Models | Per-conversation model selection | partial | `ModelPicker`, payload `model` in `router-client.ts`, session-scoped model persistence added in `src/ChatView.tsx` | Add explicit UI label that model is locked for current conversation |
| Models | Provider-level selection and fallback visibility | partial | provider grouping in `ModelPicker.tsx` | Add routed-provider trace visibility in main chat header |
| Tools | Tool discovery list | partial | Tool selection + payload wiring + active-tools confirmation system event | Add backend response acknowledgment for enforced tool subset |
| Tools | Tool execution visibility | complete | `ToolExecutionChip`, process bar | Add collapsible grouped tool runs for long sessions |
| Files | Attach files/images in prompt | complete | `ChatComposer` pending files, attachment payload | Add drag-and-drop affordances on mobile |
| Files | In-chat file preview and artifacts | complete | `PreviewPanel`, `ArtifactCanvas`, message parts | Improve preview performance for large files |
| RAG | Router-side context injection | partial | user-facing retrieval profile/depth controls added in chat header and payload | Add per-source toggles and explainability of retrieved context |
| Sessions | Multi-session history + restore | complete | `routes/sessions.js`, store integration | Improve session pinning/folders |
| Sessions | Full-text chat search | partial | switched to `/api/chat-sessions/search`; agent/type filters added in global search modal | Add date-range filter and stable e2e verification |
| Share | Shareable session snapshots | partial | expiry + revoke added to API and ShareBar UI | Add persisted share management list/history view |
| Auth/Admin | Login/session controls | complete | `routes/auth.js`, `AppAuth.tsx` | Add clearer device/session management UX |
| Auth/Admin | Role-based admin controls | partial | `AdminView.tsx` exists | Harden role-gated UI pathways and audit views |
| Voice | STT/TTS + voice assistant flow | complete | `/api/transcribe`, `/api/tts`, `VoiceAssistant` | Add voice onboarding and fallback messaging |
| Realtime | WebSocket notifications + terminal | complete | `/ws/notifications`, `/ws/terminal` | Improve offline/reconnect UX copy |
| Mobile | Responsive layout across breakpoints | partial | responsive tests exist (`docs/TESTING.md`), sticky toolbar/input shell updates landed, mobile sidebar open/close assertions added in `e2e/responsive.spec.ts` | Finish session-rail interaction polish and run full mobile e2e regression |
| Mobile | Touch-first composer/toolbar behavior | partial | sticky input + safe-area + compact action rail updates landed | Increase control discoverability and tune touch spacing in all composer states |

## Priority implementation phases

1. Phase 1: Mobile-first shell parity
- Rework chat shell to Open WebUI-like responsive layout.
- Keep existing backend APIs and data flow unchanged.
- Deliverables: collapsible session rail, sticky composer, compact header actions.

2. Phase 2: Tooling parity
- Upgrade ToolPicker from read-only to selectable.
- Persist tool selection per session and send selected tools in chat request payload.
- Add visible "active tools" indicators in header/composer.

3. Phase 3: Model + context parity
- Add per-session model lock with clear fallback display.
- Add user-facing retrieval/context controls (RAG toggles/depth/profile).

4. Phase 4: Session/share/admin parity
- Add session folders/pinning and richer search filters.
- Add share expiration/revoke controls.
- Tighten admin role UX and session/device management screens.

5. Phase 5: QA hardening
- Extend Playwright coverage for each parity item.
- Add dedicated mobile regression suite gates for iPhone/Android breakpoints.

## Definition of done for "Open WebUI parity"

All matrix rows must be `complete`, and each row must have:
- an implemented UI flow,
- backend wiring verified,
- automated test coverage (unit/e2e as appropriate),
- mobile behavior validated at 360x800, 375x667, 390x844, and 667x375.
