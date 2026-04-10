/**
 * Shared mutable state for the WebSocket gateway client.
 * Centralized here so all gateway modules can read/write consistently.
 */
// ── Constants ──
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 16000;
export const HEARTBEAT_MS = 30000;
export const MAX_RECONNECT_ATTEMPTS = 10;
// ── Core state ──
export let ws = null;
export let wsState = 'disconnected';
export let wsErrorMessage;
export let connectedResolve = null;
export let connectedReject = null;
export let heartbeatTimer = null;
export let autoReconnect = true;
export function setWs(v) {
    ws = v;
}
export function setWsState(v) {
    wsState = v;
}
export function setWsErrorMessage(v) {
    wsErrorMessage = v;
}
export function setConnectedResolve(v) {
    connectedResolve = v;
}
export function setConnectedReject(v) {
    connectedReject = v;
}
export function setHeartbeatTimer(v) {
    heartbeatTimer = v;
}
export function setAutoReconnect(v) {
    autoReconnect = v;
}
// ── RPC tracking ──
export const pendingCalls = new Map();
// ── Event listeners ──
export const eventListeners = new Map();
// ── Stream tracking ──
export const activeStreams = new Map();
const streamChangeListeners = new Set();
export function onStreamChange(fn) {
    streamChangeListeners.add(fn);
    return () => streamChangeListeners.delete(fn);
}
export function getActiveStreams() {
    return Array.from(activeStreams.values());
}
export function isAgentStreaming(agentId) {
    for (const stream of activeStreams.values()) {
        if (stream.agentId === agentId)
            return true;
    }
    return false;
}
export function notifyStreamChange() {
    const snapshot = getActiveStreams();
    streamChangeListeners.forEach((fn) => fn(snapshot));
    broadcastCrossTab({ type: 'stream-update', streams: snapshot });
}
// ── State listeners ──
const stateListeners = new Set();
export function onStateChange(fn) {
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
}
export function getStateInfo() {
    return {
        state: wsState,
        attempt: ws?.retryCount ?? 0,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        errorMessage: wsErrorMessage,
    };
}
export function notifyState(errorMsg) {
    wsErrorMessage = errorMsg;
    const info = {
        state: wsState,
        attempt: ws?.retryCount ?? 0,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        errorMessage: errorMsg,
    };
    stateListeners.forEach((fn) => fn(wsState, info));
    broadcastCrossTab({ type: 'ws-state', state: wsState, errorMessage: errorMsg });
}
// ── Queue state ──
export const messageQueue = [];
const queueListeners = new Set();
export function onQueueChange(fn) {
    queueListeners.add(fn);
    return () => queueListeners.delete(fn);
}
export function getMessageQueue() {
    return [...messageQueue];
}
export function notifyQueue() {
    const snapshot = [...messageQueue];
    queueListeners.forEach((fn) => fn(snapshot));
    broadcastCrossTab({ type: 'queue-update', count: snapshot.length });
}
// ── Stream stall listeners ──
const streamStallListeners = new Set();
export function onStreamStall(fn) {
    streamStallListeners.add(fn);
    return () => streamStallListeners.delete(fn);
}
export function notifyStreamStall(info) {
    streamStallListeners.forEach((fn) => fn(info));
}
// ── Health listeners ──
export let _lastHealthUp = null;
const healthListeners = new Set();
export function onHealthChange(fn) {
    healthListeners.add(fn);
    return () => healthListeners.delete(fn);
}
export function getLastHealth() {
    return _lastHealthUp;
}
export function notifyHealth(up) {
    if (_lastHealthUp !== up) {
        _lastHealthUp = up;
        healthListeners.forEach((fn) => fn(up));
    }
}
// ── Cross-tab sync ──
let crossTabChannel = null;
try {
    crossTabChannel = new BroadcastChannel('shre-chat-ws');
    crossTabChannel.onmessage = (ev) => {
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
        }
        else if (msg.type === 'ws-state') {
            if (msg.state === 'connected' && wsState === 'disconnected') {
                wsState = 'connected';
                notifyState();
            }
        }
        else if (msg.type === 'queue-update') {
            queueListeners.forEach((fn) => fn(getMessageQueue()));
        }
    };
}
catch (err) {
    console.debug('BroadcastChannel not available', err);
}
export function broadcastCrossTab(msg) {
    try {
        crossTabChannel?.postMessage(msg);
    }
    catch (err) {
        console.debug('crossTab postMessage failed', err);
    }
}
// ── Helpers ──
export function uuid() {
    return crypto.randomUUID();
}
export function onEvent(event, handler) {
    if (!eventListeners.has(event))
        eventListeners.set(event, new Set());
    eventListeners.get(event).add(handler);
    return () => eventListeners.get(event)?.delete(handler);
}
export function emitEvent(event, payload) {
    eventListeners.get(event)?.forEach((h) => {
        try {
            h(payload);
        }
        catch (err) {
            console.error(`[ws] event listener error for "${event}":`, err);
        }
    });
}
export function sendRaw(data) {
    ws?.send(JSON.stringify(data));
}
