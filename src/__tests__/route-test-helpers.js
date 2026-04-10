/**
 * Test helpers for route-level unit tests.
 *
 * These helpers create mock req/res/helpers objects that can be passed
 * directly to the real route handlers from routes/*.js, so tests
 * exercise the actual production code — not a reimplemented copy.
 */
import { EventEmitter } from 'node:events';
// ── Mock logger ──────────────────────────────────────────────────────
export function createMockLogger() {
    return {
        info: (..._args) => { },
        warn: (..._args) => { },
        error: (..._args) => { },
        debug: (..._args) => { },
    };
}
/**
 * Create a mock IncomingMessage that emits body data.
 * The returned object is an EventEmitter with the right shape for route handlers.
 */
export function createMockReq(opts = {}) {
    const emitter = new EventEmitter();
    emitter.method = opts.method || 'GET';
    emitter.url = opts.url || '/';
    emitter.headers = {};
    // Normalize header keys to lowercase (Node.js convention)
    if (opts.headers) {
        for (const [k, v] of Object.entries(opts.headers)) {
            emitter.headers[k.toLowerCase()] = v;
        }
    }
    emitter.socket = { remoteAddress: opts.remoteAddress || '127.0.0.1' };
    // Schedule body emission on next tick so listeners can attach
    if (opts.body !== undefined) {
        process.nextTick(() => {
            emitter.emit('data', Buffer.from(opts.body));
            emitter.emit('end');
        });
    }
    else {
        process.nextTick(() => {
            emitter.emit('end');
        });
    }
    return emitter;
}
/**
 * Create a mock ServerResponse that captures status, headers, and body.
 */
export function createMockRes() {
    const result = { statusCode: 200, headers: {}, body: '' };
    let resolvePromise;
    const promise = new Promise((resolve) => {
        resolvePromise = resolve;
    });
    const res = {
        statusCode: 200,
        _result: result,
        _promise: promise,
        writeHead(status, headers) {
            result.statusCode = status;
            res.statusCode = status;
            if (headers)
                Object.assign(result.headers, headers);
            return res;
        },
        setHeader(name, value) {
            result.headers[name.toLowerCase()] = value;
            return res;
        },
        getHeader(name) {
            return result.headers[name.toLowerCase()];
        },
        end(data) {
            if (data)
                result.body += data;
            result.statusCode = res.statusCode;
            resolvePromise(result);
        },
        write(data) {
            result.body += data;
            return true;
        },
    };
    return res;
}
// ── Mock route helpers (json, collectBody, rateLimit, authCookie) ────
/**
 * A `json` helper that writes JSON to the mock response.
 * Mirrors the real json() from serve.js.
 */
export function createJsonHelper() {
    return function json(res, data, status = 200) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
}
/**
 * A `collectBody` helper that reads from a mock request.
 */
export function createCollectBodyHelper(maxBytes = 1024 * 1024) {
    return function collectBody(req, limit) {
        const max = limit || maxBytes;
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > max) {
                    reject(new Error('Body too large'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => resolve(Buffer.concat(chunks).toString()));
            req.on('error', reject);
        });
    };
}
/**
 * A rate limiter mock. By default allows everything.
 * Pass `maxAllowed` to simulate rate limiting after N calls.
 */
export function createRateLimitHelper(maxAllowed = Infinity) {
    let callCount = 0;
    return function rateLimit(_key, _bucket, _limit, _window) {
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
    return function authCookie(name, value, maxAge, _req) {
        return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict`;
    };
}
// ── Helper to parse mock response body as JSON ───────────────────────
export async function getJsonResponse(resPromise) {
    const result = await resPromise;
    let body;
    try {
        body = JSON.parse(result.body);
    }
    catch {
        body = result.body;
    }
    return { status: result.statusCode, body };
}
