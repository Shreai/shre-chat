# Customer Message Flow (Single Source of Truth)

This document defines the canonical cycle for customer messages and assistant responses.
All services must implement this contract exactly.

## Scope

- Inbound path: `shre-chat` `POST /v1/chat` and `POST /api/voice-to-voice`
- Upstream: `shre-router` `POST /v1/chat`
- Downstream consumers: `shre-chat` UI + voice flow + `shre-core` agent chat storage

## Canonical Flow

1. Customer message arrives at `shre-chat`.
2. `shre-chat` builds trace headers:
   - `x-trace-route-id`
   - `x-correlation-id`
   - `x-session-id` (if present)
   - `x-shre-chat-hop` incremented by 1
3. `shre-chat` forwards request to `shre-router /v1/chat`.
4. `shre-router` returns one of:
   - SSE stream (`text/event-stream`)
   - JSON payload (`application/json`) for non-stream
5. Consumer extracts assistant text from response.
6. If extracted assistant text is empty, cycle fails with explicit error (`UPSTREAM_EMPTY`) instead of silent success.
7. If non-empty, cycle completes:
   - chat route returns stream/body
   - voice route runs TTS + voice command
   - core route stores extracted assistant text

## SSE Text Extraction Contract

Consumers MUST accept all of these event shapes when extracting assistant text:

1. Router normalized chunks:
`{"type":"delta","text":"..."}`

2. Anthropic-style relay chunks:
`{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`

3. Legacy/simple text delta:
`{"type":"text_delta","text":"..."}`

4. Compatibility fallbacks:
- `choices[0].delta.content`
- `delta.text`
- `content`

## Gap Found and Fixed

- Gap: `shre-chat` voice path only parsed `type=delta`.
- Gap: `shre-core` chat storage only parsed lines containing `text_delta` and assumed top-level `text`.
- Result: valid assistant output could be treated as empty, causing incomplete cycle and `UPSTREAM_EMPTY`.
- Fix: unified tolerant SSE parsing in both `shre-chat` and `shre-core`.

## File Ownership

- `shre-chat/src/index.ts`
  - `parseAssistantTextFromSse`
  - voice-to-voice completion behavior
- `shre-core/src/api/agent.js`
  - `extractAssistantTextFromSse`
  - storage extraction for `chat_messages.response`
- `shre-core/tests/agent.test.js`
  - contract tests for `delta` and `content_block_delta`

## Regression Rule

Any change to SSE response format or parser behavior must update:

1. `shre-chat/src/index.ts`
2. `shre-core/src/api/agent.js`
3. `shre-core/tests/agent.test.js`
4. This document
