/**
 * Shared mutable state for the WebSocket gateway client.
 * Centralized here so all gateway modules can read/write consistently.
 */

import ReconnectingWebSocket from 'partysocket/ws';
import type {
  WSState,
  WSStateInfo,
  ActiveStream,
  QueuedMessage,
  StateListener,
  StreamChangeListener,
  QueueListener,
  StreamStallListener,
  HealthListener,
  CrossTabMessage,
} from './ws-types';

// ── Constants ──
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 16000;
export const HEARTBEAT_MS = 30000;
export const MAX_RECONNECT_ATTEMPTS = 10;

// ── Core state ──
export let ws: ReconnectingWebSocket | null = null;
export let wsState: WSState = 'disconnected';
export let wsErrorMessage: string | undefined;
export let connectedResolve: (() => void) | null = null;
export let connectedReject: ((err: Error) => void) | null = null;
export let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
export let autoReconnect = true;

export function setWs(v: ReconnectingWebSocket | null) {
  ws = v;
}
export function setWsState(v: WSState) {
  wsState = v;
}
export function setWsErrorMessage(v: string | undefined) {
  wsErrorMessage = v;
}
export function setConnectedResolve(v: (() => void) | null) {
  connectedResolve = v;
}
export function setConnectedReject(v: ((err: Error) => void) | null) {
  connectedReject = v;
}
export function setHeartbeatTimer(v: ReturnType<typeof setInterval> | null) {
  heartbeatTimer = v;
}
export function setAutoReconnect(v: boolean) {
  autoReconnect = v;
}

// ── RPC tracking ──
export const pendingCalls = new Map<
  string,
  {
    resolve: (payload: any) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

// ── Event listeners ──
export const eventListeners = new Map<string, Set<(payload: any) => void>>();

// ── Stream tracking ──
export const activeStreams = new Map<string, ActiveStream>();
const streamChangeListeners = new Set<StreamChangeListener>();

export function onStreamChange(fn: StreamChangeListener): () => void {
  streamChangeListeners.add(fn);
  return () => streamChangeListeners.delete(fn);
}

export function getActiveStreams(): ActiveStream[] {
  return Array.from(activeStreams.values());
}

export function isAgentStreaming(agentId: string): boolean {
  for (const stream of activeStreams.values()) {
    if (stream.agentId === agentId) return true;
  }
  return false;
}

export function notifyStreamChange() {
  const snapshot = getActiveStreams();
  streamChangeListeners.forEach((fn) => fn(snapshot));
  broadcastCrossTab({ type: 'stream-update', streams: snapshot });
}

// ── State listeners ──
const stateListeners = new Set<StateListener>();

export function onStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getStateInfo(): WSStateInfo {
  return {
    state: wsState,
    attempt: ws?.retryCount ?? 0,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    errorMessage: wsErrorMessage,
  };
}

export function notifyState(errorMsg?: string) {
  wsErrorMessage = errorMsg;
  const info: WSStateInfo = {
    state: wsState,
    attempt: ws?.retryCount ?? 0,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    errorMessage: errorMsg,
  };
  stateListeners.forEach((fn) => fn(wsState, info));
  broadcastCrossTab({ type: 'ws-state', state: wsState, errorMessage: errorMsg });
}

// ── Queue state ──
export const messageQueue: QueuedMessage[] = [];
const queueListeners = new Set<QueueListener>();

export function onQueueChange(fn: QueueListener): () => void {
  queueListeners.add(fn);
  return () => queueListeners.delete(fn);
}

export function getMessageQueue(): QueuedMessage[] {
  return [...messageQueue];
}

export function notifyQueue() {
  const snapshot = [...messageQueue];
  queueListeners.forEach((fn) => fn(snapshot));
  broadcastCrossTab({ type: 'queue-update', count: snapshot.length });
}

// ── Stream stall listeners ──
const streamStallListeners = new Set<StreamStallListener>();

export function onStreamStall(fn: StreamStallListener): () => void {
  streamStallListeners.add(fn);
  return () => streamStallListeners.delete(fn);
}

export function notifyStreamStall(info: import('./ws-types').StreamStallInfo) {
  streamStallListeners.forEach((fn) => fn(info));
}

// ── Health listeners ──
export let _lastHealthUp: boolean | null = null;
const healthListeners = new Set<HealthListener>();

export function onHealthChange(fn: HealthListener): () => void {
  healthListeners.add(fn);
  return () => healthListeners.delete(fn);
}

export function getLastHealth(): boolean | null {
  return _lastHealthUp;
}

export function notifyHealth(up: boolean) {
  if (_lastHealthUp !== up) {
    _lastHealthUp = up;
    healthListeners.forEach((fn) => fn(up));
  }
}

// ── Cross-tab sync ──
let crossTabChannel: BroadcastChannel | null = null;
try {
  crossTabChannel = new BroadcastChannel('shre-chat-ws');
  crossTabChannel.onmessage = (ev: MessageEvent<CrossTabMessage>) => {
    const msg = ev.data;
    if (msg.type === 'stream-update') {
      for (const remote of msg.streams) {
        const key = `${remote.agentId}:${remote.sessionKey}`;
        if (!activeStreams.has(key)) {
          activeStreams.set(key, remote);
        }
      }
      const snapshot = getActiveStreams();
      streamChangeListeners.forEach((fn) => fn(snapshot));
    } else if (msg.type === 'ws-state') {
      if (msg.state === 'connected' && wsState === 'disconnected') {
        wsState = 'connected';
        notifyState();
      }
    } else if (msg.type === 'queue-update') {
      queueListeners.forEach((fn) => fn(getMessageQueue()));
    }
  };
} catch (err) {
  console.debug('BroadcastChannel not available', err);
}

export function broadcastCrossTab(msg: CrossTabMessage) {
  try {
    crossTabChannel?.postMessage(msg);
  } catch (err) {
    console.debug('crossTab postMessage failed', err);
  }
}

// ── Helpers ──
export function uuid(): string {
  return crypto.randomUUID();
}

export function onEvent(event: string, handler: (payload: any) => void): () => void {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event)!.add(handler);
  return () => eventListeners.get(event)?.delete(handler);
}

export function emitEvent(event: string, payload: any) {
  eventListeners.get(event)?.forEach((h) => {
    try {
      h(payload);
    } catch (err) {
      console.error(`[ws] event listener error for "${event}":`, err);
    }
  });
}

export function sendRaw(data: any) {
  ws?.send(JSON.stringify(data));
}
