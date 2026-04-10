/**
 * WebSocket connection management — connect, reconnect, heartbeat, protocol handling.
 */
import ReconnectingWebSocket from 'partysocket/ws';
import { getGatewayToken, clearGatewayToken, isTokenFetchFailed } from './ws-token';
import { ws, wsState, connectedResolve, connectedReject, heartbeatTimer, autoReconnect, setWs, setWsState, setConnectedResolve, setConnectedReject, setHeartbeatTimer, setAutoReconnect, pendingCalls, activeStreams, notifyState, notifyStreamChange, sendRaw, emitEvent, uuid, RECONNECT_BASE_MS, RECONNECT_MAX_MS, MAX_RECONNECT_ATTEMPTS, HEARTBEAT_MS, } from './ws-state';
import { flushMessageQueue } from './ws-queue';
// Connect via same-origin proxy (serve.js proxies WS to gateway)
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
function startHeartbeat() {
    stopHeartbeat();
    setHeartbeatTimer(setInterval(() => {
        if (ws?.readyState === ReconnectingWebSocket.OPEN) {
            try {
                sendRaw({ type: 'req', id: uuid(), method: 'health', params: {} });
            }
            catch (err) {
                console.debug('heartbeat send failed', err);
            }
        }
    }, HEARTBEAT_MS));
}
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        setHeartbeatTimer(null);
    }
}
function handleFrame(frame) {
    if (frame.type === 'event') {
        if (frame.event === 'connect.challenge') {
            getGatewayToken().then((token) => {
                sendRaw({
                    type: 'req',
                    id: uuid(),
                    method: 'connect',
                    params: {
                        minProtocol: 3,
                        maxProtocol: 3,
                        client: {
                            id: 'webchat',
                            version: '1.0.0',
                            platform: 'web',
                            mode: 'ui',
                        },
                        role: 'operator',
                        scopes: ['operator.admin'],
                        auth: {
                            token,
                            password: '',
                        },
                        caps: ['tool-events'],
                    },
                });
            });
            return;
        }
        emitEvent(frame.event, frame.payload);
        return;
    }
    if (frame.type === 'res') {
        if (frame.ok && frame.payload?.type === 'hello-ok') {
            setWsState('connected');
            notifyState();
            startHeartbeat();
            connectedResolve?.();
            setConnectedResolve(null);
            setConnectedReject(null);
            console.log('[ws] connected to router gateway');
            flushMessageQueue();
            return;
        }
        if (!frame.ok && wsState === 'connecting') {
            const errMsg = frame.error?.message || 'Connect rejected';
            console.error('[ws] connect rejected:', errMsg);
            if (frame.error?.code === 'INVALID_REQUEST' || frame.error?.code === 'AUTH_FAILED') {
                setAutoReconnect(false);
            }
            setWsState('failed');
            notifyState(errMsg);
            connectedReject?.(new Error(errMsg));
            setConnectedResolve(null);
            setConnectedReject(null);
            ws?.close();
            return;
        }
        const pending = pendingCalls.get(frame.id);
        if (pending) {
            clearTimeout(pending.timeoutId);
            pendingCalls.delete(frame.id);
            if (frame.ok) {
                pending.resolve(frame.payload);
            }
            else {
                pending.reject(new Error(frame.error?.message || 'RPC error'));
            }
        }
        return;
    }
}
/**
 * Connect to router gateway via WebSocket.
 */
export async function connectGateway() {
    if (wsState === 'connected' && ws?.readyState === ReconnectingWebSocket.OPEN)
        return;
    if (wsState === 'connecting') {
        return new Promise((resolve, reject) => {
            const prevResolve = connectedResolve;
            const prevReject = connectedReject;
            setConnectedResolve(() => {
                prevResolve?.();
                resolve();
            });
            setConnectedReject((err) => {
                prevReject?.(err);
                reject(err);
            });
        });
    }
    const token = await getGatewayToken();
    if (!token) {
        setWsState('disconnected');
        setAutoReconnect(false);
        notifyState(isTokenFetchFailed() ? 'Not authenticated — sign in to connect' : undefined);
        return Promise.reject(new Error('No gateway token'));
    }
    setWsState('connecting');
    notifyState();
    return new Promise((resolve, reject) => {
        setConnectedResolve(resolve);
        setConnectedReject(reject);
        try {
            const newWs = new ReconnectingWebSocket(WS_URL, undefined, {
                minReconnectionDelay: RECONNECT_BASE_MS,
                maxReconnectionDelay: RECONNECT_MAX_MS,
                reconnectionDelayGrowFactor: 2,
                maxRetries: MAX_RECONNECT_ATTEMPTS,
                startClosed: false,
                debug: false,
            });
            setWs(newWs);
            newWs.onopen = () => {
                if (wsState !== 'connecting') {
                    setWsState('connecting');
                    notifyState();
                }
            };
            newWs.onmessage = (event) => {
                try {
                    const frame = JSON.parse(event.data);
                    handleFrame(frame);
                }
                catch (err) {
                    console.debug('WS frame parse failed', err);
                }
            };
            newWs.onerror = () => {
                if (connectedReject && wsState === 'connecting') {
                    setWsState('disconnected');
                    notifyState();
                    connectedReject(new Error('WebSocket connection failed'));
                    setConnectedResolve(null);
                    setConnectedReject(null);
                }
            };
            newWs.onclose = () => {
                stopHeartbeat();
                for (const [, pending] of pendingCalls) {
                    clearTimeout(pending.timeoutId);
                    pending.reject(new Error('WebSocket closed'));
                }
                pendingCalls.clear();
                if (activeStreams.size > 0) {
                    activeStreams.clear();
                    notifyStreamChange();
                }
                if (ws && !ws.shouldReconnect) {
                    setWsState('failed');
                    notifyState('Max reconnection attempts reached');
                    if (connectedReject) {
                        connectedReject(new Error('Max reconnection attempts reached'));
                        setConnectedResolve(null);
                        setConnectedReject(null);
                    }
                }
                else {
                    setWsState('connecting');
                    notifyState();
                }
            };
        }
        catch (err) {
            setWsState('disconnected');
            notifyState();
            reject(new Error('WebSocket creation failed'));
        }
    });
}
/**
 * Ensure connected — reconnect if needed.
 */
export async function ensureConnected() {
    if (wsState === 'connected' && ws?.readyState === ReconnectingWebSocket.OPEN)
        return;
    await connectGateway();
}
/**
 * Send an RPC request and wait for the response.
 */
export async function rpc(method, params) {
    await ensureConnected();
    const id = uuid();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                reject(new Error(`RPC timeout: ${method}`));
            }
        }, 30000);
        pendingCalls.set(id, { resolve, reject, timeoutId });
        sendRaw({ type: 'req', id, method, params });
    });
}
/**
 * Check if WebSocket is currently connected.
 */
export function isWSConnected() {
    return wsState === 'connected' && ws?.readyState === ReconnectingWebSocket.OPEN;
}
/**
 * Manually retry after reconnect attempts are exhausted.
 */
export function retryConnection() {
    setAutoReconnect(true);
    clearGatewayToken();
    if (ws) {
        ws.close();
        setWs(null);
    }
    setWsState('disconnected');
    return connectGateway();
}
/**
 * Disconnect the WebSocket (disables auto-reconnect).
 */
export function disconnectGateway() {
    setAutoReconnect(false);
    stopHeartbeat();
    stopHealthPoll();
    ws?.close();
    setWs(null);
    setWsState('disconnected');
    notifyState();
}
// ── Health polling ──
const HEALTH_POLL_MS = 30_000;
let healthPollTimer = null;
import { notifyHealth } from './ws-state';
async function pollHealth() {
    try {
        const res = await fetch('/api/health', {
            signal: AbortSignal.timeout?.(5000),
        });
        if (res.ok) {
            const data = await res.json();
            return data.gatewayToken === true;
        }
        return true;
    }
    catch (err) {
        console.debug('pollHealth failed', err);
        return false;
    }
}
export function startHealthPoll() {
    if (healthPollTimer)
        return;
    // Health poll only reports server reachability — no WS reconnect.
    // Gateway WS is disabled; all chat routes through HTTP/SSE via shre-router.
    pollHealth().then((up) => {
        notifyHealth(up);
    });
    healthPollTimer = setInterval(async () => {
        const up = await pollHealth();
        notifyHealth(up);
    }, HEALTH_POLL_MS);
}
export function stopHealthPoll() {
    if (healthPollTimer) {
        clearInterval(healthPollTimer);
        healthPollTimer = null;
    }
}
function triggerHealthReconnect() {
    if (!autoReconnect)
        return;
    console.log('[ws] gateway health OK — triggering reconnect');
    if (ws) {
        ws.close();
        setWs(null);
    }
    setWsState('disconnected');
    connectGateway().catch(() => {
        // Will be retried on next health poll
        void 0;
    });
}
/** Map model ID to router modelApi format */
export function getModelApi(modelId) {
    if (modelId.startsWith('anthropic/'))
        return 'anthropic';
    if (modelId.startsWith('openai/'))
        return 'openai';
    if (modelId.startsWith('google/'))
        return 'google-generative-ai';
    if (modelId.startsWith('ollama'))
        return 'ollama';
    return 'anthropic';
}
/** Map model ID to provider name */
export function getProviderName(modelId) {
    if (modelId.startsWith('anthropic/'))
        return 'anthropic';
    if (modelId.startsWith('openai/'))
        return 'openai';
    if (modelId.startsWith('google/'))
        return 'google';
    if (modelId.startsWith('ollama'))
        return 'ollama';
    return 'anthropic';
}
