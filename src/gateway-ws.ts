/**
 * OpenClaw Gateway WebSocket Client
 *
 * Connects to OpenClaw via WebSocket (same protocol as native chat UI).
 * This ensures Shre Chat and OpenClaw share the same sessions.
 *
 * Features:
 * - Auto-reconnect with exponential backoff via partysocket (1s → 2s → 4s → 8s → 16s max)
 * - Heartbeat ping every 30s to detect dead connections
 * - Auto-reconnect before send if connection dropped
 */

import { stripProviderPrefix } from "./openclaw";
import ReconnectingWebSocket from "partysocket/ws";

// Connect via same-origin proxy (serve.js proxies WS to OpenClaw 18789)
// Use wss:// when served over HTTPS, ws:// otherwise
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

// Gateway token — fetched from server at runtime (never bundled in JS)
let _gatewayToken = "";
let _tokenFetchFailed = false;
async function getGatewayToken(): Promise<string> {
  if (_gatewayToken) return _gatewayToken;
  try {
    const res = await fetch("/api/gateway-token");
    if (!res.ok) {
      // 401 means user isn't authenticated — don't retry until next explicit connect
      _tokenFetchFailed = true;
      return "";
    }
    const data = await res.json();
    _gatewayToken = data.token || "";
    _tokenFetchFailed = !_gatewayToken;
  } catch {
    _tokenFetchFailed = true;
  }
  return _gatewayToken;
}

/** Clear cached token so next connectGateway() re-fetches (call after login) */
export function clearGatewayToken() {
  _gatewayToken = "";
  _tokenFetchFailed = false;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 16000;
const HEARTBEAT_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

type WSState = "disconnected" | "connecting" | "connected" | "failed";

/** Extended state info for UI consumption. */
export interface WSStateInfo {
  state: WSState;
  attempt?: number;       // reconnect attempt number (when connecting/failed)
  maxAttempts?: number;   // max reconnect attempts
  errorMessage?: string;  // error detail (when failed)
}

let ws: ReconnectingWebSocket | null = null;
let wsState: WSState = "disconnected";
let wsErrorMessage: string | undefined;
let connectedResolve: (() => void) | null = null;
let connectedReject: ((err: Error) => void) | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let autoReconnect = true;

const pendingCalls = new Map<string, {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}>();
const eventListeners = new Map<string, Set<(payload: any) => void>>();

// ── Per-agent stream tracking ───────────────────────────────────────
//
// Tracks which agents currently have active streaming responses.
// Each entry maps a composite key (agentId:sessionKey) to stream metadata.
// This enables:
//   - UI status indicators per agent
//   - Stream isolation (one agent's error doesn't kill others)
//   - Concurrent send safety

export interface ActiveStream {
  agentId: string;
  sessionKey: string;
  fullSessionKey: string;
  runId: string | null;
  startedAt: number;
  status: "connecting" | "thinking" | "writing" | "compacting";
}

const activeStreams = new Map<string, ActiveStream>();

type StreamChangeListener = (streams: ActiveStream[]) => void;
const streamChangeListeners = new Set<StreamChangeListener>();

// ── Cross-tab state sync via BroadcastChannel ─────────────────────────
// When one tab starts/stops a stream, other tabs see the update.
// This prevents duplicate sends and shows accurate streaming indicators.

type CrossTabMessage =
  | { type: "stream-update"; streams: ActiveStream[] }
  | { type: "ws-state"; state: WSState; errorMessage?: string }
  | { type: "queue-update"; count: number };

let crossTabChannel: BroadcastChannel | null = null;
try {
  crossTabChannel = new BroadcastChannel("shre-chat-ws");
  crossTabChannel.onmessage = (ev: MessageEvent<CrossTabMessage>) => {
    const msg = ev.data;
    if (msg.type === "stream-update") {
      // Merge remote streams — keep local streams, add remote ones
      for (const remote of msg.streams) {
        const key = `${remote.agentId}:${remote.sessionKey}`;
        if (!activeStreams.has(key)) {
          activeStreams.set(key, remote);
        }
      }
      const snapshot = getActiveStreams();
      streamChangeListeners.forEach((fn) => fn(snapshot));
    } else if (msg.type === "ws-state") {
      // If another tab is connected, we know the WS is alive
      if (msg.state === "connected" && wsState === "disconnected") {
        wsState = "connected";
        notifyState();
      }
    } else if (msg.type === "queue-update") {
      // Notify local queue listeners of remote queue depth change
      queueListeners.forEach((fn) => fn(getMessageQueue()));
    }
  };
} catch {
  // BroadcastChannel not available (e.g., older browsers, SSR)
}

function broadcastCrossTab(msg: CrossTabMessage) {
  try { crossTabChannel?.postMessage(msg); } catch { /* ignore */ }
}

function notifyStreamChange() {
  const snapshot = getActiveStreams();
  streamChangeListeners.forEach((fn) => fn(snapshot));
  // Broadcast to other tabs
  broadcastCrossTab({ type: "stream-update", streams: snapshot });
}

/** Subscribe to active stream changes (for UI status indicators). */
export function onStreamChange(fn: StreamChangeListener): () => void {
  streamChangeListeners.add(fn);
  return () => streamChangeListeners.delete(fn);
}

/** Returns a snapshot of all currently active agent streams. */
export function getActiveStreams(): ActiveStream[] {
  return Array.from(activeStreams.values());
}

/** Check if a specific agent has an active stream. */
export function isAgentStreaming(agentId: string): boolean {
  for (const stream of activeStreams.values()) {
    if (stream.agentId === agentId) return true;
  }
  return false;
}

// State change listeners (for UI updates)
type StateListener = (state: WSState, info: WSStateInfo) => void;
const stateListeners = new Set<StateListener>();

export function onStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/** Get current detailed state info. */
export function getStateInfo(): WSStateInfo {
  return {
    state: wsState,
    attempt: ws?.retryCount ?? 0,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    errorMessage: wsErrorMessage,
  };
}

function notifyState(errorMsg?: string) {
  wsErrorMessage = errorMsg;
  const info: WSStateInfo = {
    state: wsState,
    attempt: ws?.retryCount ?? 0,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    errorMessage: errorMsg,
  };
  stateListeners.forEach((fn) => fn(wsState, info));
  // Broadcast WS state to other tabs
  broadcastCrossTab({ type: "ws-state", state: wsState, errorMessage: errorMsg });
}

// ── Message queue for offline/reconnecting sends ──────────────────────
//
// When a user sends a message while WS is reconnecting, it gets queued
// here and automatically flushed once the connection is re-established.

export interface QueuedMessage {
  id: string;
  agentId: string;
  sessionKey: string;
  message: string;
  callbacks: WSStreamCallbacks;
  modelOverride?: string;
  systemPrompt?: string;
  queuedAt: number;
}

const messageQueue: QueuedMessage[] = [];
type QueueListener = (queue: QueuedMessage[]) => void;
const queueListeners = new Set<QueueListener>();

export function onQueueChange(fn: QueueListener): () => void {
  queueListeners.add(fn);
  return () => queueListeners.delete(fn);
}

function notifyQueue() {
  const snapshot = [...messageQueue];
  queueListeners.forEach((fn) => fn(snapshot));
  // Broadcast queue depth to other tabs
  broadcastCrossTab({ type: "queue-update", count: snapshot.length });
}

export function getMessageQueue(): QueuedMessage[] {
  return [...messageQueue];
}

// ── Stream stall/retry listeners ──────────────────────────────────────
//
// Fires when a stream has received no data for 30s (stall warning)
// or when the 90s timeout triggers an auto-retry.

export type StreamStallState = "stalling" | "retrying" | "clear";
export interface StreamStallInfo {
  state: StreamStallState;
  agentId: string;
  sessionKey: string;
  stalledSince?: number; // timestamp when stall detected
  elapsedMs?: number;    // ms since last data — for countdown UI
}

type StreamStallListener = (info: StreamStallInfo) => void;
const streamStallListeners = new Set<StreamStallListener>();

/** Subscribe to stream stall/retry events (for UI indicators). */
export function onStreamStall(fn: StreamStallListener): () => void {
  streamStallListeners.add(fn);
  return () => streamStallListeners.delete(fn);
}

function notifyStreamStall(info: StreamStallInfo) {
  streamStallListeners.forEach((fn) => fn(info));
}

/** Queue a message for sending when WS reconnects. */
export function queueMessage(
  agentId: string,
  sessionKey: string,
  message: string,
  callbacks: WSStreamCallbacks,
  modelOverride?: string,
  systemPrompt?: string,
): string {
  const id = uuid();
  messageQueue.push({ id, agentId, sessionKey, message, callbacks, modelOverride, systemPrompt, queuedAt: Date.now() });
  notifyQueue();
  return id;
}

/** Remove a queued message by id. */
export function dequeueMessage(id: string): boolean {
  const idx = messageQueue.findIndex((m) => m.id === id);
  if (idx >= 0) {
    messageQueue.splice(idx, 1);
    notifyQueue();
    return true;
  }
  return false;
}

/** Flush all queued messages by sending them via WS. Called on reconnect. */
async function flushMessageQueue() {
  if (messageQueue.length === 0) return;
  console.log(`[ws] flushing ${messageQueue.length} queued message(s)`);
  // Drain queue into a local copy so new messages during send go to a fresh queue
  const toSend = messageQueue.splice(0, messageQueue.length);
  notifyQueue();
  for (const msg of toSend) {
    try {
      await sendChatWS(msg.agentId, msg.sessionKey, msg.message, msg.callbacks, msg.modelOverride, msg.systemPrompt);
    } catch (err) {
      msg.callbacks.onError(`Failed to send queued message: ${err}`);
    }
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

function onEvent(event: string, handler: (payload: any) => void): () => void {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event)!.add(handler);
  return () => eventListeners.get(event)?.delete(handler);
}

function emitEvent(event: string, payload: any) {
  // Isolate each listener — if one throws, others still receive the event.
  // This is critical for multi-agent streams: an error in agent A's handler
  // must not prevent agent B's handler from processing the same event batch.
  eventListeners.get(event)?.forEach((h) => {
    try {
      h(payload);
    } catch (err) {
      console.error(`[ws] event listener error for "${event}":`, err);
    }
  });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === ReconnectingWebSocket.OPEN) {
      try {
        sendRaw({ type: "req", id: uuid(), method: "health", params: {} });
      } catch { /* ignore */ }
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Reconnection is handled by partysocket's ReconnectingWebSocket.
// It uses exponential backoff from RECONNECT_BASE_MS to RECONNECT_MAX_MS
// and stops after MAX_RECONNECT_ATTEMPTS retries.

/**
 * Connect to OpenClaw gateway via WebSocket.
 * Returns a promise that resolves when the connection is authenticated.
 *
 * Uses partysocket's ReconnectingWebSocket for automatic reconnection
 * with exponential backoff. The auth handshake (connect.challenge → connect)
 * runs on every new connection (initial + each reconnect).
 */
export async function connectGateway(): Promise<void> {
  if (wsState === "connected" && ws?.readyState === ReconnectingWebSocket.OPEN) return;
  if (wsState === "connecting") {
    return new Promise((resolve, reject) => {
      const prevResolve = connectedResolve;
      const prevReject = connectedReject;
      connectedResolve = () => { prevResolve?.(); resolve(); };
      connectedReject = (err) => { prevReject?.(err); reject(err); };
    });
  }

  // Pre-fetch gateway token before connecting
  const token = await getGatewayToken();
  if (!token) {
    // No token available (user not authenticated or server unreachable)
    // Don't open WS — it will just fail and trigger a reconnect loop
    wsState = "disconnected";
    autoReconnect = false; // Stop reconnect loop until next explicit connect
    notifyState(_tokenFetchFailed ? "Not authenticated — sign in to connect" : undefined);
    return Promise.reject(new Error("No gateway token"));
  }

  wsState = "connecting";
  notifyState();

  return new Promise((resolve, reject) => {
    connectedResolve = resolve;
    connectedReject = reject;

    try {
      ws = new ReconnectingWebSocket(WS_URL, undefined, {
        minReconnectionDelay: RECONNECT_BASE_MS,
        maxReconnectionDelay: RECONNECT_MAX_MS,
        reconnectionDelayGrowFactor: 2,
        maxRetries: MAX_RECONNECT_ATTEMPTS,
        startClosed: false,
        debug: false,
      });
    } catch (err) {
      wsState = "disconnected";
      notifyState();
      reject(new Error("WebSocket creation failed"));
      return;
    }

    ws.onopen = () => {
      // Each time a new underlying connection opens (initial or reconnect),
      // we wait for the connect.challenge event from server.
      // If this is a reconnect, transition state back to connecting.
      if (wsState !== "connecting") {
        wsState = "connecting";
        notifyState();
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const frame = JSON.parse(event.data as string);
        handleFrame(frame);
      } catch { /* skip malformed */ }
    };

    ws.onerror = () => {
      // On error during initial connect, reject the promise.
      // partysocket will still attempt reconnection automatically.
      if (connectedReject && wsState === "connecting") {
        wsState = "disconnected";
        notifyState();
        connectedReject(new Error("WebSocket connection failed"));
        connectedResolve = null;
        connectedReject = null;
      }
    };

    ws.onclose = () => {
      stopHeartbeat();

      // Reject any pending RPC calls and clear their timeout timers
      for (const [, pending] of pendingCalls) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("WebSocket closed"));
      }
      pendingCalls.clear();

      // Clear all active streams — connection is gone
      if (activeStreams.size > 0) {
        activeStreams.clear();
        notifyStreamChange();
      }

      // Check if partysocket has given up (max retries reached)
      if (ws && !ws.shouldReconnect) {
        wsState = "failed";
        notifyState("Max reconnection attempts reached");
        // Reject pending connect promise if still waiting
        if (connectedReject) {
          connectedReject(new Error("Max reconnection attempts reached"));
          connectedResolve = null;
          connectedReject = null;
        }
      } else {
        // partysocket will auto-reconnect; mark as connecting
        wsState = "connecting";
        notifyState();
      }
    };
  });
}

function handleFrame(frame: any) {
  if (frame.type === "event") {
    if (frame.event === "connect.challenge") {
      sendRaw({
        type: "req",
        id: uuid(),
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "webchat",
            version: "1.0.0",
            platform: "web",
            mode: "ui",
          },
          role: "operator",
          scopes: ["operator.admin"],
          auth: {
            token: _gatewayToken,
            password: "",
          },
          caps: ["tool-events"],
        },
      });
      return;
    }

    // Emit to listeners (e.g., "chat" events for streaming)
    emitEvent(frame.event, frame.payload);
    return;
  }

  if (frame.type === "res") {
    // Check if this is the connect response
    if (frame.ok && frame.payload?.type === "hello-ok") {
      wsState = "connected";
      notifyState();
      startHeartbeat();
      connectedResolve?.();
      connectedResolve = null;
      connectedReject = null;
      console.log("[ws] connected to OpenClaw gateway");
      // Flush any messages queued during reconnection
      flushMessageQueue();
      return;
    }

    // Check if connect failed
    if (!frame.ok && wsState === "connecting") {
      const errMsg = frame.error?.message || "Connect rejected";
      console.error("[ws] connect rejected:", errMsg);
      // Don't auto-reconnect for auth/validation errors — they won't fix themselves
      if (frame.error?.code === "INVALID_REQUEST" || frame.error?.code === "AUTH_FAILED") {
        autoReconnect = false;
      }
      wsState = "failed";
      notifyState(errMsg);
      connectedReject?.(new Error(errMsg));
      connectedResolve = null;
      connectedReject = null;
      ws?.close();
      return;
    }

    // Route to pending call
    const pending = pendingCalls.get(frame.id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingCalls.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error(frame.error?.message || "RPC error"));
      }
    }
    return;
  }
}

function sendRaw(data: any) {
  ws?.send(JSON.stringify(data));
}

/**
 * Ensure connected — reconnect if needed.
 */
async function ensureConnected(): Promise<void> {
  if (wsState === "connected" && ws?.readyState === ReconnectingWebSocket.OPEN) return;
  await connectGateway();
}

/**
 * Send an RPC request and wait for the response.
 */
async function rpc(method: string, params?: any): Promise<any> {
  await ensureConnected();

  const id = uuid();
  return new Promise((resolve, reject) => {
    // Timeout after 30s
    const timeoutId = setTimeout(() => {
      if (pendingCalls.has(id)) {
        pendingCalls.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 30000);

    pendingCalls.set(id, { resolve, reject, timeoutId });
    sendRaw({ type: "req", id, method, params });
  });
}

// ── Public API ──────────────────────────────────────────────────────

export interface WSStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  onStatus?: (status: string, detail?: string) => void;
  onActivity?: (text: string) => void;
  /** Fired when the server acknowledges receipt of the message (RPC response OK). */
  onAck?: (runId: string | null) => void;
}

/**
 * Send a chat message via WebSocket (same protocol as OpenClaw native chat).
 * This writes to the SAME session as the native chat UI.
 * Auto-reconnects if the connection dropped.
 */

/** Map model ID to OpenClaw modelApi format */
function getModelApi(modelId: string): string {
  if (modelId.startsWith("anthropic/")) return "anthropic";
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("google/")) return "google-generative-ai";
  if (modelId.startsWith("ollama")) return "ollama";
  return "anthropic";
}

/** Map model ID to provider name */
function getProviderName(modelId: string): string {
  if (modelId.startsWith("anthropic/")) return "anthropic";
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("google/")) return "google";
  if (modelId.startsWith("ollama")) return "ollama";
  return "anthropic";
}

/**
 * Set the active model by writing directly to openclaw.json.
 * The config-sync plugin (before_model_resolve hook) picks up changes
 * immediately — bypasses the gateway's broken sessions.patch RPC.
 */
export async function setModelWS(modelId: string, agentId: string = "main"): Promise<void> {
  try {
    const res = await fetch("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, modelId }),
    });
    const result = await res.json();
    if (!result.ok) {
      console.warn("[ws] Model sync failed:", result.error);
    } else {
      console.log("[ws] Model synced to config:", modelId);
    }
  } catch (err) {
    console.warn("[ws] Model sync error:", err);
  }
}

export async function sendChatWS(
  agentId: string,
  sessionKey: string,
  message: string,
  callbacks: WSStreamCallbacks,
  modelOverride?: string,
  systemPrompt?: string,
): Promise<void> {
  const fullSessionKey = `agent:${agentId}:${sessionKey}`;
  const streamKey = `${agentId}:${sessionKey}`;
  const runIdempotencyKey = uuid();

  let fullText = "";
  let currentRunId: string | null = null;

  // Register this stream
  activeStreams.set(streamKey, {
    agentId,
    sessionKey,
    fullSessionKey,
    runId: null,
    startedAt: Date.now(),
    status: "connecting",
  });
  notifyStreamChange();

  /** Clean up stream tracking on completion */
  function finalizeStream() {
    activeStreams.delete(streamKey);
    notifyStreamChange();
  }

  /** Update stream status without removing it */
  function updateStreamStatus(status: ActiveStream["status"]) {
    const stream = activeStreams.get(streamKey);
    if (stream) {
      stream.status = status;
      notifyStreamChange();
    }
  }

  // Stream stall warning — fires after 30s of no data (before the 90s hard timeout)
  let lastEventAt = Date.now();
  const STREAM_STALL_MS = 30_000;
  const STREAM_TIMEOUT_MS = 90_000;
  let stallNotified = false;
  let streamTimeoutRetried = false;

  const streamStallTimer = setInterval(() => {
    const elapsed = Date.now() - lastEventAt;
    if (elapsed > STREAM_STALL_MS) {
      if (!stallNotified) {
        stallNotified = true;
        console.warn(`[ws] Stream stalling for agent ${agentId} — no data in ${STREAM_STALL_MS / 1000}s`);
      }
      // Re-emit with updated elapsed time for countdown UI
      notifyStreamStall({ state: "stalling", agentId, sessionKey, stalledSince: lastEventAt, elapsedMs: elapsed });
    }
  }, 5_000);

  // Stream timeout — if no events arrive within 90s, auto-retry once then error
  const streamTimeoutTimer = setInterval(() => {
    if (Date.now() - lastEventAt > STREAM_TIMEOUT_MS) {
      clearInterval(streamTimeoutTimer);
      clearInterval(streamStallTimer);

      if (!streamTimeoutRetried) {
        // First timeout — auto-retry with a fresh stream
        streamTimeoutRetried = true;
        console.warn(`[ws] Stream timeout for agent ${agentId} — retrying once`);
        notifyStreamStall({ state: "retrying", agentId, sessionKey });
        unsubscribe();
        finalizeStream();
        callbacks.onStatus?.("reconnecting");
        // Retry the same send
        sendChatWS(agentId, sessionKey, message, callbacks, modelOverride, systemPrompt).catch((retryErr) => {
          callbacks.onError(`Retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
          notifyStreamStall({ state: "clear", agentId, sessionKey });
        });
        return;
      }

      console.warn(`[ws] Stream timeout for agent ${agentId} — no events in ${STREAM_TIMEOUT_MS / 1000}s (after retry)`);
      notifyStreamStall({ state: "clear", agentId, sessionKey });
      unsubscribe();
      finalizeStream();
      callbacks.onError("Stream timeout — no response after retry. Please try again.");
    }
  }, 10_000);

  // Listen for chat events — wrapped in try/catch for stream isolation.
  // If this handler throws, it only affects THIS agent's stream, not others.
  const unsubscribe = onEvent("chat", (payload) => {
    try {
      lastEventAt = Date.now();
      // Clear stall warning when data resumes
      if (stallNotified) {
        stallNotified = false;
        notifyStreamStall({ state: "clear", agentId, sessionKey });
      }
      console.log("[ws] chat event:", payload.state, "sessionKey:", payload.sessionKey, "expected:", fullSessionKey, "runId:", payload.runId, "payload:", JSON.stringify(payload).slice(0, 300));
      if (payload.sessionKey !== fullSessionKey) {
        console.warn("[ws] sessionKey mismatch — ignoring event. got:", payload.sessionKey, "expected:", fullSessionKey);
        return;
      }
      if (currentRunId && payload.runId !== currentRunId) {
        console.warn("[ws] runId mismatch — ignoring event. got:", payload.runId, "expected:", currentRunId);
        return;
      }

      if (payload.state === "delta") {
        const content = payload.message?.content;

        // Handle tool_use, thinking, and other non-text blocks → route to activity
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use" || block.type === "thinking" || block.type === "tool_result") {
              const activityText = block.type === "tool_use"
                ? `Using tool: ${block.name || "unknown"}`
                : block.type === "thinking"
                  ? (block.thinking || block.text || "Thinking...")
                  : `Tool result: ${(block.content || "").toString().slice(0, 100)}`;
              callbacks.onActivity?.(activityText);
              callbacks.onStatus?.("thinking");
              updateStreamStatus("thinking");
              continue;
            }
            if (block.type === "text" && block.text) {
              fullText += block.text;
              callbacks.onToken(block.text);
            }
          }
        } else if (typeof content === "string") {
          // Check if this is cumulative (starts with existing fullText) or a pure delta
          if (content.length > fullText.length && content.startsWith(fullText)) {
            // Cumulative — extract only the new part
            const delta = content.slice(fullText.length);
            fullText = content;
            callbacks.onToken(delta);
          } else if (fullText.length === 0 || !content.startsWith(fullText.slice(0, Math.min(20, fullText.length)))) {
            // Pure delta
            fullText += content;
            callbacks.onToken(content);
          } else {
            // Cumulative (short overlap case)
            fullText = content;
            callbacks.onToken(""); // No new content to show
          }
        }
        callbacks.onStatus?.("writing");
        updateStreamStatus("writing");
      } else if (payload.state === "thinking" || payload.state === "tool_use") {
        // These are intermediate agent steps — route to activity
        const detail = payload.message?.content || payload.detail || payload.state;
        const text = typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200);
        callbacks.onActivity?.(text);
        callbacks.onStatus?.("thinking");
        updateStreamStatus("thinking");
      } else if (payload.state === "compacting" || payload.state === "summarizing") {
        // Context compaction — non-blocking, let user know
        callbacks.onStatus?.(payload.state);
        updateStreamStatus("compacting");
      } else if (payload.state === "final") {
        const content = payload.message?.content;
        let finalText = "";
        if (Array.isArray(content)) {
          finalText = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        } else if (typeof content === "string") {
          finalText = content;
        }
        clearInterval(streamTimeoutTimer);
        clearInterval(streamStallTimer);
        if (stallNotified) notifyStreamStall({ state: "clear", agentId, sessionKey });
        unsubscribe();
        finalizeStream();
        callbacks.onDone(finalText || fullText);
      } else if (payload.state === "aborted") {
        clearInterval(streamTimeoutTimer);
        clearInterval(streamStallTimer);
        if (stallNotified) notifyStreamStall({ state: "clear", agentId, sessionKey });
        unsubscribe();
        finalizeStream();
        callbacks.onDone(fullText);
      } else if (payload.state === "error") {
        clearInterval(streamTimeoutTimer);
        clearInterval(streamStallTimer);
        if (stallNotified) notifyStreamStall({ state: "clear", agentId, sessionKey });
        unsubscribe();
        finalizeStream();
        // Stream isolation: error only affects this agent's callbacks
        callbacks.onError(payload.errorMessage || "Unknown error");
      }
    } catch (handlerErr) {
      // Stream isolation: catch handler errors so they don't propagate
      // to the event emitter and affect other agents' listeners.
      console.error(`[ws] stream handler error for agent ${agentId}:`, handlerErr);
      clearInterval(streamTimeoutTimer);
      clearInterval(streamStallTimer);
      if (stallNotified) notifyStreamStall({ state: "clear", agentId, sessionKey });
      unsubscribe();
      finalizeStream();
      callbacks.onError(`Stream handler error: ${handlerErr}`);
    }
  });

  try {
    callbacks.onStatus?.("connecting");

    // Sync model to openclaw.json — config-sync plugin enforces it at runtime
    if (modelOverride) {
      await setModelWS(modelOverride, agentId);
    }

    const rpcParams: Record<string, unknown> = {
      sessionKey: fullSessionKey,
      message,
      idempotencyKey: runIdempotencyKey,
      deliver: false,
    };
    if (modelOverride) {
      rpcParams.model = stripProviderPrefix(modelOverride);
    }
    if (systemPrompt) {
      rpcParams.systemPrompt = systemPrompt;
    }
    const result = await rpc("chat.send", rpcParams);
    currentRunId = result?.runId || null;

    // Update stream with runId
    const stream = activeStreams.get(streamKey);
    if (stream) {
      stream.runId = currentRunId;
      stream.status = "thinking";
    }
    notifyStreamChange();

    // ACK: server confirmed receipt of the message
    callbacks.onAck?.(currentRunId);

    console.log("[ws] chat.send OK, runId:", currentRunId, "sessionKey:", fullSessionKey);
    callbacks.onStatus?.("thinking");
  } catch (err) {
    console.error("[ws] chat.send FAILED:", err);
    clearInterval(streamTimeoutTimer);
    clearInterval(streamStallTimer);
    if (stallNotified) notifyStreamStall({ state: "clear", agentId, sessionKey });
    unsubscribe();
    finalizeStream();
    throw err;
  }
}

/**
 * Abort all active streams. Used on page unload for cleanup.
 */
export function abortAllStreams(): void {
  const streams = Array.from(activeStreams.values());
  activeStreams.clear();
  notifyStreamChange();
  for (const stream of streams) {
    rpc("chat.abort", { sessionKey: stream.fullSessionKey }).catch(() => {});
  }
}

/**
 * Abort the current chat run.
 * Cleans up the stream tracker so getActiveStreams() stays accurate.
 */
export async function abortChatWS(agentId: string, sessionKey: string): Promise<void> {
  const streamKey = `${agentId}:${sessionKey}`;
  activeStreams.delete(streamKey);
  notifyStreamChange();

  try {
    await rpc("chat.abort", {
      sessionKey: `agent:${agentId}:${sessionKey}`,
    });
  } catch { /* best effort */ }
}

/**
 * Load chat history via WebSocket RPC.
 */
export async function loadHistoryWS(
  agentId: string,
  sessionKey: string,
  limit: number = 200,
): Promise<Array<{ role: string; content: string; timestamp?: number }>> {
  const result = await rpc("chat.history", {
    sessionKey: `agent:${agentId}:${sessionKey}`,
    limit,
  });
  if (!result?.messages) return [];

  return result.messages.map((m: any) => {
    let text = "";
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    }
    return {
      role: m.role,
      content: text,
      timestamp: m.timestamp,
    };
  }).filter((m: any) => m.content.trim());
}

/**
 * Check if WebSocket is currently connected.
 */
export function isWSConnected(): boolean {
  return wsState === "connected" && ws?.readyState === ReconnectingWebSocket.OPEN;
}

/**
 * Manually retry after reconnect attempts are exhausted (state === "failed").
 * Resets the attempt counter and reconnects.
 */
export function retryConnection(): Promise<void> {
  autoReconnect = true;
  clearGatewayToken(); // Re-fetch token (user may have just logged in)
  // If we have an existing socket, close it cleanly and create a fresh one
  if (ws) {
    ws.close();
    ws = null;
  }
  wsState = "disconnected";
  return connectGateway();
}

/**
 * Disconnect the WebSocket (disables auto-reconnect).
 */
export function disconnectGateway() {
  autoReconnect = false;
  stopHeartbeat();
  stopHealthPoll();
  ws?.close();
  ws = null;
  wsState = "disconnected";
  notifyState();
}

// ── Health polling for reconnection ─────────────────────────────────
//
// When the WS is in "disconnected" or "failed" state (i.e. all reconnect
// attempts exhausted), we periodically ping the gateway health endpoint.
// Once the gateway comes back, we trigger a reconnect automatically.

const HEALTH_POLL_MS = 30_000;
let healthPollTimer: ReturnType<typeof setInterval> | null = null;
let _lastHealthUp: boolean | null = null;

type HealthListener = (up: boolean) => void;
const healthListeners = new Set<HealthListener>();

/** Subscribe to gateway health status changes (HTTP-level reachability). */
export function onHealthChange(fn: HealthListener): () => void {
  healthListeners.add(fn);
  return () => healthListeners.delete(fn);
}

/** Get the last known health status. */
export function getLastHealth(): boolean | null {
  return _lastHealthUp;
}

async function pollHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", {
      signal: AbortSignal.timeout?.(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.gatewayToken === true;
    }
    return true; // server is up even if health check returns non-200
  } catch {
    return false;
  }
}

function notifyHealth(up: boolean) {
  if (_lastHealthUp !== up) {
    _lastHealthUp = up;
    healthListeners.forEach((fn) => fn(up));
  }
}

/**
 * Start health polling. Runs every HEALTH_POLL_MS.
 * When WS is already connected, polling still runs (to keep gatewayUp
 * state accurate) but does not trigger reconnect logic.
 * When WS is disconnected/failed and health returns OK, triggers reconnect.
 */
export function startHealthPoll() {
  if (healthPollTimer) return; // already running

  // Do an immediate check
  pollHealth().then((up) => {
    notifyHealth(up);
    if (up && (wsState === "disconnected" || wsState === "failed")) {
      triggerHealthReconnect();
    }
  });

  healthPollTimer = setInterval(async () => {
    const up = await pollHealth();
    notifyHealth(up);

    // If gateway is reachable but WS is down, reconnect
    if (up && (wsState === "disconnected" || wsState === "failed")) {
      triggerHealthReconnect();
    }
  }, HEALTH_POLL_MS);
}

/** Stop health polling. */
export function stopHealthPoll() {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }
}

function triggerHealthReconnect() {
  // Don't reconnect if user explicitly disconnected (autoReconnect === false)
  if (!autoReconnect) return;

  console.log("[ws] gateway health OK — triggering reconnect");
  // Close the old socket so connectGateway creates a fresh one with reset retries
  if (ws) {
    ws.close();
    ws = null;
  }
  wsState = "disconnected";
  connectGateway().catch(() => {
    // Will be retried on next health poll
  });
}
