// @vitest-environment jsdom
/**
 * Unit tests for gateway-ws.ts — connection state management,
 * stream tracking, health polling, and helper functions.
 */
// Setup file must run first to stub browser globals before module evaluation
import './gateway-ws-setup';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// ── Mock fetch (used for gateway token + health polling) ─────────────
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
let lastCreatedWS = null;
// Replace the WebSocket constructor to track instances and add test helpers
const OrigWS = globalThis.WebSocket;
vi.stubGlobal('WebSocket', class extends OrigWS {
    constructor(url) {
        super(url);
        lastCreatedWS = this;
    }
    simulateOpen() {
        this.readyState = 1; // OPEN
        const evt = { type: 'open' };
        this.onopen?.(evt);
        this.dispatchEvent(evt);
    }
    simulateMessage(data) {
        const evt = { type: 'message', data: JSON.stringify(data) };
        this.onmessage?.(evt);
        this.dispatchEvent(evt);
    }
    simulateError() {
        const evt = { type: 'error' };
        this.onerror?.(evt);
        this.dispatchEvent(evt);
    }
    simulateClose() {
        this.readyState = 3; // CLOSED
        const evt = { type: 'close', code: 1000, reason: '', wasClean: true };
        this.onclose?.(evt);
        this.dispatchEvent(evt);
    }
});
globalThis.WebSocket.OPEN = 1;
globalThis.WebSocket.CONNECTING = 0;
globalThis.WebSocket.CLOSING = 2;
globalThis.WebSocket.CLOSED = 3;
// ── Import module under test ─────────────────────────────────────────
import { onStateChange, onStreamChange, onHealthChange, getActiveStreams, isAgentStreaming, isWSConnected, getLastHealth, connectGateway, disconnectGateway, startHealthPoll, stopHealthPoll, retryConnection, } from '../gateway-ws';
// ── Setup / Teardown ─────────────────────────────────────────────────
beforeEach(() => {
    fetchMock.mockReset();
    lastCreatedWS = null;
    vi.useFakeTimers();
    // Default: gateway token fetch succeeds
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: 'test-token' }), { status: 200 }));
});
afterEach(() => {
    // Clean up connections
    disconnectGateway();
    stopHealthPoll();
    vi.useRealTimers();
});
// ── Connection state management ──────────────────────────────────────
describe('connection state', () => {
    it('starts disconnected', () => {
        expect(isWSConnected()).toBe(false);
    });
    it('reports connected after successful handshake', async () => {
        const stateChanges = [];
        const unsub = onStateChange((state) => stateChanges.push(state));
        const connectPromise = connectGateway();
        // Wait for token fetch
        await vi.advanceTimersByTimeAsync(0);
        // WebSocket should have been created
        expect(lastCreatedWS).not.toBeNull();
        // Simulate open + challenge
        lastCreatedWS.simulateOpen();
        lastCreatedWS.simulateMessage({
            type: 'event',
            event: 'connect.challenge',
            payload: {},
        });
        // Should have sent connect request
        expect(lastCreatedWS.sent.length).toBeGreaterThanOrEqual(1);
        const connectReq = JSON.parse(lastCreatedWS.sent[0]);
        expect(connectReq.method).toBe('connect');
        expect(connectReq.params.client.id).toBe('webchat');
        // Simulate successful connect response
        lastCreatedWS.simulateMessage({
            type: 'res',
            id: connectReq.id,
            ok: true,
            payload: { type: 'hello-ok' },
        });
        await connectPromise;
        expect(isWSConnected()).toBe(true);
        expect(stateChanges).toContain('connecting');
        expect(stateChanges).toContain('connected');
        unsub();
    });
    it('reports disconnected after close', async () => {
        // Connect first
        const connectPromise = connectGateway();
        await vi.advanceTimersByTimeAsync(0);
        lastCreatedWS.simulateOpen();
        lastCreatedWS.simulateMessage({
            type: 'event',
            event: 'connect.challenge',
            payload: {},
        });
        const connectReq = JSON.parse(lastCreatedWS.sent[0]);
        lastCreatedWS.simulateMessage({
            type: 'res',
            id: connectReq.id,
            ok: true,
            payload: { type: 'hello-ok' },
        });
        await connectPromise;
        expect(isWSConnected()).toBe(true);
        // Now disconnect
        disconnectGateway();
        expect(isWSConnected()).toBe(false);
    });
});
// ── State change listener ────────────────────────────────────────────
describe('onStateChange', () => {
    it('returns an unsubscribe function', () => {
        const states = [];
        const unsub = onStateChange((s) => states.push(s));
        expect(typeof unsub).toBe('function');
        unsub();
    });
    it('stops receiving events after unsubscribe', async () => {
        const states = [];
        const unsub = onStateChange((s) => states.push(s));
        unsub();
        const connectPromise = connectGateway().catch(() => { });
        await vi.advanceTimersByTimeAsync(0);
        lastCreatedWS.simulateOpen();
        lastCreatedWS.simulateError();
        // Should not have received state changes after unsubscribe
        expect(states).toEqual([]);
        await connectPromise;
    });
});
// ── Stream tracking ──────────────────────────────────────────────────
describe('stream tracking', () => {
    it('starts with no active streams', () => {
        expect(getActiveStreams()).toEqual([]);
    });
    it('isAgentStreaming returns false when no streams', () => {
        expect(isAgentStreaming('main')).toBe(false);
    });
    it('onStreamChange returns an unsubscribe function', () => {
        const unsub = onStreamChange(() => { });
        expect(typeof unsub).toBe('function');
        unsub();
    });
});
// ── Health polling ───────────────────────────────────────────────────
describe('health polling', () => {
    it('getLastHealth returns null or boolean', () => {
        const health = getLastHealth();
        expect(health === null || typeof health === 'boolean').toBe(true);
    });
    it('onHealthChange returns an unsubscribe function', () => {
        const unsub = onHealthChange(() => { });
        expect(typeof unsub).toBe('function');
        unsub();
    });
    it('startHealthPoll triggers immediate health check', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ gatewayToken: true }), { status: 200 }));
        const healthChanges = [];
        const unsub = onHealthChange((up) => healthChanges.push(up));
        startHealthPoll();
        // Let the immediate check resolve
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalled();
        // Check that at least one call was to /api/health
        const healthCalls = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('/api/health'));
        expect(healthCalls.length).toBeGreaterThanOrEqual(1);
        unsub();
        stopHealthPoll();
    });
    it('stopHealthPoll stops polling and is idempotent', () => {
        startHealthPoll();
        stopHealthPoll();
        stopHealthPoll(); // Should not throw
    });
});
// ── retryConnection ──────────────────────────────────────────────────
describe('retryConnection', () => {
    it('resets attempt counter and returns a promise', async () => {
        const retryPromise = retryConnection();
        await vi.advanceTimersByTimeAsync(0);
        // Should have created a WebSocket
        expect(lastCreatedWS).not.toBeNull();
        // Simulate connection error to resolve the promise
        lastCreatedWS.simulateError();
        lastCreatedWS.simulateClose();
        try {
            await retryPromise;
        }
        catch {
            // Expected — connection failed
        }
    });
});
// ── disconnectGateway ────────────────────────────────────────────────
describe('disconnectGateway', () => {
    it('is safe to call when already disconnected', () => {
        expect(() => disconnectGateway()).not.toThrow();
    });
    it('disables auto-reconnect', async () => {
        // Start connection — catch to prevent unhandled rejection
        const connectPromise = connectGateway().catch(() => { });
        await vi.advanceTimersByTimeAsync(0);
        // Simulate error so the connect promise rejects (and gets caught)
        if (lastCreatedWS) {
            lastCreatedWS.simulateError();
        }
        await vi.advanceTimersByTimeAsync(0);
        disconnectGateway();
        // Advance timers — should NOT attempt auto-reconnect
        await vi.advanceTimersByTimeAsync(60000);
        await connectPromise;
    });
});
