/**
 * Setup file for gateway-ws tests.
 * Must run before gateway-ws.ts module evaluation so that
 * browser globals (location, WebSocket, crypto) are available.
 */

// Stub location — used at module top-level in gateway-ws.ts
(globalThis as any).location = {
  protocol: 'https:',
  host: 'localhost:5510',
};

// Stub crypto.randomUUID — crypto is a read-only getter in Node,
// so we need to override just randomUUID on the existing object.
let uuidCounter = 0;
if (typeof globalThis.crypto !== 'undefined') {
  (globalThis.crypto as any).randomUUID = () => {
    uuidCounter++;
    return `test-uuid-${uuidCounter}`;
  };
} else {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => {
        uuidCounter++;
        return `test-uuid-${uuidCounter}`;
      },
    },
    writable: true,
    configurable: true,
  });
}

// Stub WebSocket with static constants and EventTarget methods
// partysocket's ReconnectingWebSocket calls addEventListener/removeEventListener
class MockWebSocketBase {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0;
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  onclose: any = null;
  sent: string[] = [];

  private _listeners: Map<string, Set<Function>> = new Map();

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '', wasClean: true });
  }

  addEventListener(type: string, listener: Function) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Function) {
    this._listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const type = event.type || event;
    this._listeners.get(type)?.forEach((fn) => fn(event));
    return true;
  }
}

(globalThis as any).WebSocket = MockWebSocketBase;
