/**
 * Test helpers for route-level unit tests.
 *
 * These helpers create mock req/res/helpers objects that can be passed
 * directly to the real route handlers from routes/*.js, so tests
 * exercise the actual production code — not a reimplemented copy.
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

// ── Mock logger ──────────────────────────────────────────────────────

export function createMockLogger() {
  return {
    info: (..._args: any[]) => {},
    warn: (..._args: any[]) => {},
    error: (..._args: any[]) => {},
    debug: (..._args: any[]) => {},
  };
}

// ── Mock request ─────────────────────────────────────────────────────

export interface MockReqOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  remoteAddress?: string;
}

/**
 * Create a mock IncomingMessage that emits body data.
 * The returned object is an EventEmitter with the right shape for route handlers.
 */
export function createMockReq(opts: MockReqOptions = {}): IncomingMessage {
  const emitter = new EventEmitter() as any;
  emitter.method = opts.method || "GET";
  emitter.url = opts.url || "/";
  emitter.headers = {};
  // Normalize header keys to lowercase (Node.js convention)
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      emitter.headers[k.toLowerCase()] = v;
    }
  }
  emitter.socket = { remoteAddress: opts.remoteAddress || "127.0.0.1" } as Socket;

  // Schedule body emission on next tick so listeners can attach
  if (opts.body !== undefined) {
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(opts.body!));
      emitter.emit("end");
    });
  } else {
    process.nextTick(() => {
      emitter.emit("end");
    });
  }

  return emitter as IncomingMessage;
}

// ── Mock response ────────────────────────────────────────────────────

export interface MockResResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
}

export interface MockRes extends ServerResponse {
  /** Resolved when the response has been written. */
  _promise: Promise<MockResResult>;
  _result: MockResResult;
}

/**
 * Create a mock ServerResponse that captures status, headers, and body.
 */
export function createMockRes(): MockRes {
  const result: MockResResult = { statusCode: 200, headers: {}, body: "" };
  let resolvePromise: (r: MockResResult) => void;
  const promise = new Promise<MockResResult>((resolve) => { resolvePromise = resolve; });

  const res = {
    statusCode: 200,
    _result: result,
    _promise: promise,
    writeHead(status: number, headers?: Record<string, string>) {
      result.statusCode = status;
      res.statusCode = status;
      if (headers) Object.assign(result.headers, headers);
      return res;
    },
    setHeader(name: string, value: string | string[]) {
      result.headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return result.headers[name.toLowerCase()];
    },
    end(data?: string) {
      if (data) result.body += data;
      result.statusCode = res.statusCode;
      resolvePromise!(result);
    },
    write(data: string) {
      result.body += data;
      return true;
    },
  } as any;

  return res as MockRes;
}

// ── Mock route helpers (json, collectBody, rateLimit, authCookie) ────

/**
 * A `json` helper that writes JSON to the mock response.
 * Mirrors the real json() from serve.js.
 */
export function createJsonHelper() {
  return function json(res: any, data: any, status = 200) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
}

/**
 * A `collectBody` helper that reads from a mock request.
 */
export function createCollectBodyHelper(maxBytes = 1024 * 1024) {
  return function collectBody(req: IncomingMessage, limit?: number): Promise<string> {
    const max = limit || maxBytes;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > max) {
          reject(new Error("Body too large"));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  };
}

/**
 * A rate limiter mock. By default allows everything.
 * Pass `maxAllowed` to simulate rate limiting after N calls.
 */
export function createRateLimitHelper(maxAllowed = Infinity) {
  let callCount = 0;
  return function rateLimit(_key: string, _bucket: string, _limit: number, _window: number) {
    callCount++;
    if (callCount > maxAllowed) {
      return { allowed: false, retryAfter: 60 };
    }
    return { allowed: true, retryAfter: 0 };
  };
}

/**
 * A mock authCookie helper.
 */
export function createAuthCookieHelper() {
  return function authCookie(name: string, value: string, maxAge: number, _req: any): string {
    return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict`;
  };
}

// ── Helper to parse mock response body as JSON ───────────────────────

export async function getJsonResponse(resPromise: Promise<MockResResult>): Promise<{ status: number; body: any }> {
  const result = await resPromise;
  let body: any;
  try {
    body = JSON.parse(result.body);
  } catch {
    body = result.body;
  }
  return { status: result.statusCode, body };
}
