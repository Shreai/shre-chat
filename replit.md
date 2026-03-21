# Shre Chat (AROS)

## Overview
Web-based AI-powered chat interface for the Shre platform. Built with React + Vite + TypeScript + Tailwind CSS. Designed primarily for Electron desktop deployment, but also runs as a web SPA.

## Architecture

### Frontend (Vite + React)
- **Entry**: `src/main.tsx`
- **Framework**: React 19, Vite 6, TypeScript
- **Styling**: Tailwind CSS + CSS custom properties (design tokens in `src/index.css`)
- **State**: Zustand (`src/store.ts`)
- **Port**: 5000 (dev), served as static in production

### Backend (serve.js)
- Express-like Node.js HTTP server
- Proxies chat requests to `shre-router` (port 5497)
- WebSocket support for terminal and notifications
- Routes in `routes/` directory

### Key Source Files
- `src/ChatView.tsx` — Main chat interface
- `src/Sidebar.tsx` — Sidebar with agent picker slide-out panel
- `src/LoginView.tsx` — Login + 2FA authentication view
- `src/components/ModelPicker.tsx` — Model picker slide-out panel
- `src/components/SuggestionsBar.tsx` — Horizontal suggestion chips (starter + contextual)
- `src/components/ChatComposer.tsx` — Message input composer with toolbar
- `src/components/MessageBubble.tsx` — Chat message bubbles with actions
- `src/gateway-ws.ts` — WebSocket client (terminal/notifications)
- `src/openclaw.ts` — HTTP SSE streaming chat client
- `src/StatusBar.tsx` — Status bar with connection/agent info
- `src/store.ts` — Zustand state management
- `serve.js` — Production backend server

### Design System
- **Dark palette**: Layered charcoal (#0d0d0f / #161618 / #1e1e22), not true black
- **Accent**: Periwinkle blue (#638dff), used for buttons, links, active states
- **Text hierarchy**: Clean neutral grays (#ececf1 → #6b6b76)
- **CSS vars**: `--c-bg-main`, `--c-bg-sidebar`, `--c-bg-1` through `--c-bg-3`, `--c-text-1` through `--c-text-5`, `--c-accent`, `--c-border-1`/`--c-border-2`
- **Slide-out panels**: Model & Agent pickers use z-[70]/z-[71] with backdrop blur overlay and `slide-in-left` animation
- **DEV_BYPASS_AUTH**: Flag in `src/App.tsx` — `true` for UI-only dev, `false` for real backend auth

## Local Stub Packages
The project depends on two proprietary packages not published to npm:
- **`shre-sdk`**: Stubs in `stubs/shre-sdk/` — provides logger, service discovery URLs, event bus
- **`@shre/ui-kit`**: Stubs in `stubs/shre-ui-kit/` — provides SBadge, SButton, SInput, SDialog, PoweredByNirlab, and theme utilities. All components use CSS custom properties for theming.

These stubs are wired via `package.json` `file:` references pointing to `stubs/`.

## External Dependencies
- `shre-router` (port 5497) — All chat routing and AI model access
- `shre-tasks` (port 5460) — Task creation and management
- `shre-fleet` (port 5498) — Agent fleet management
- `openclaw-gateway` (port 18789) — AI gateway (accessed via shre-router only)

## Port Configuration
A `ports.json` file at `/home/runner/ports.json` (parent of workspace) contains port mappings for all services. The app source imports it as `../../ports.json` from `src/`.

## Development
```bash
npm run dev       # Start Vite dev server on port 5000
npm run build     # Build production bundle to dist/
npm run serve     # Run production serve.js backend
```

## Deployment
Configured as a static site deployment (builds `dist/` with `npm run build`).
