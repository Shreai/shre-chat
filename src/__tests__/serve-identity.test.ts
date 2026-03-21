/**
 * Unit tests for the /api/verify-identity endpoint.
 *
 * Tests the REAL route handler from routes/auth.js (registerAuthRoutes)
 * for the identity verification path. The handler spawns a shell script
 * which we can't mock at the handler level, so we test:
 * 1. Input validation (code format, missing code, etc.) — fully testable
 * 2. Rate limiting — fully testable
 * 3. The overall handler registration — verifiable by checking return value
 *
 * The actual vault script spawn is tested via integration tests.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  createMockLogger,
  createMockReq,
  createMockRes,
  createJsonHelper,
  createRateLimitHelper,
  createAuthCookieHelper,
  getJsonResponse,
} from "./route-test-helpers";

// Mock shre-sdk (auth.js imports are handled at module level)
vi.mock("shre-sdk", () => ({
  serviceUrl: (name: string) => `http://mock-${name}:9999`,
  infraUrl: (name: string) => `http://mock-${name}:9999`,
}));

// We need to mock the filesystem and child_process to avoid hitting real vault
// The auth module reads signing keys and users from disk at import time.
// We mock the relevant fs functions to prevent errors.
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    existsSync: (path: string) => {
      // Return false for vault-related paths to trigger safe defaults
      if (path.includes(".shre/auth/signing-key") ||
          path.includes(".shre/vault/users.json") ||
          path.includes(".shre/.vault-key") ||
          path.includes("vault-verify-identity")) {
        return false;
      }
      return original.existsSync(path);
    },
    readFileSync: (path: string, ...args: any[]) => {
      if (path.includes(".shre/auth/signing-key")) {
        throw new Error("No signing key in test");
      }
      return original.readFileSync(path, ...args);
    },
    writeFileSync: (path: string, ...args: any[]) => {
      if (path.includes(".shre/vault/users.json")) {
        return; // swallow
      }
      return original.writeFileSync(path, ...args);
    },
    mkdirSync: (path: string, ...args: any[]) => {
      if (path.includes(".shre")) {
        return; // swallow
      }
      return original.mkdirSync(path, ...args);
    },
  };
});

// Import the REAL route handler
import { registerAuthRoutes } from "../../routes/auth.js";

const log = createMockLogger();
const json = createJsonHelper();
const authCookie = createAuthCookieHelper();

let handleAuth: ReturnType<typeof registerAuthRoutes>;

beforeAll(() => {
  handleAuth = registerAuthRoutes({ log: log as any });
});

/** Helper to POST an identity verification request */
async function verifyIdentity(
  body: any,
  opts: { ip?: string; rateLimitHelper?: ReturnType<typeof createRateLimitHelper> } = {},
) {
  const req = createMockReq({
    method: "POST",
    url: "/api/verify-identity",
    headers: {
      "content-type": "application/json",
      ...(opts.ip ? { "x-forwarded-for": opts.ip } : {}),
    },
    body: JSON.stringify(body),
    remoteAddress: "127.0.0.1",
  });
  const res = createMockRes();
  const url = new URL("/api/verify-identity", "http://localhost");
  const rateLimit = opts.rateLimitHelper || createRateLimitHelper();
  handleAuth(req, res, url, { json, rateLimit, authCookie });
  return getJsonResponse(res._promise);
}

describe("POST /api/verify-identity — input validation", () => {
  it("returns 400 when code is missing", async () => {
    const { status, body } = await verifyIdentity({});
    expect(status).toBe(400);
    expect(body.verified).toBe(false);
    expect(body.error).toContain("Code required");
  });

  it("returns 400 when code is null", async () => {
    const { status, body } = await verifyIdentity({ code: null });
    expect(status).toBe(400);
    expect(body.verified).toBe(false);
  });

  it("returns 400 when code is a number", async () => {
    const { status, body } = await verifyIdentity({ code: 123456 });
    expect(status).toBe(400);
    expect(body.verified).toBe(false);
  });

  it("returns 400 when code is too short (< 4 chars)", async () => {
    const { status, body } = await verifyIdentity({ code: "ab" });
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid code format");
  });

  it("returns 400 when code contains special characters", async () => {
    const { status, body } = await verifyIdentity({ code: "code!@#$%^&*()" });
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid code format");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/verify-identity",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = createMockRes();
    const url = new URL("/api/verify-identity", "http://localhost");
    const rateLimit = createRateLimitHelper();
    handleAuth(req, res, url, { json, rateLimit, authCookie });
    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(400);
    expect(body.verified).toBe(false);
  });

  it("accepts code with hyphens and underscores (valid format)", async () => {
    // The code format is valid, but the vault script doesn't exist in test
    // so we expect 503 (verification unavailable) rather than a format error
    const { status, body } = await verifyIdentity({ code: "my-code_with-dashes" });
    expect(status).not.toBe(400); // not a format error
    // Should be 503 because vault script doesn't exist in test env
    expect(status).toBe(503);
    expect(body.error).toContain("Verification unavailable");
  });

  it("rejects code longer than 64 characters", async () => {
    const longCode = "a".repeat(65);
    const { status, body } = await verifyIdentity({ code: longCode });
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid code format");
  });

  it("accepts code of exactly 4 characters", async () => {
    const { status } = await verifyIdentity({ code: "abcd" });
    // Valid format, so should NOT be 400
    expect(status).not.toBe(400);
  });

  it("accepts code of exactly 64 characters", async () => {
    const code64 = "a".repeat(64);
    const { status } = await verifyIdentity({ code: code64 });
    expect(status).not.toBe(400);
  });
});

describe("POST /api/verify-identity — rate limiting", () => {
  it("returns 429 when rate limit exceeded", async () => {
    const rl = createRateLimitHelper(0); // immediately blocked
    const { status, body } = await verifyIdentity({ code: "test1234" }, { rateLimitHelper: rl });
    expect(status).toBe(429);
    expect(body.verified).toBe(false);
    expect(body.error).toContain("Too many attempts");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("allows requests within rate limit", async () => {
    const rl = createRateLimitHelper(5);
    const { status } = await verifyIdentity({ code: "test1234" }, { rateLimitHelper: rl });
    // Should not be 429
    expect(status).not.toBe(429);
  });
});

describe("POST /api/verify-identity — route matching", () => {
  it("handler returns true for POST /api/verify-identity", () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/verify-identity",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test1234" }),
    });
    const res = createMockRes();
    const url = new URL("/api/verify-identity", "http://localhost");
    const rateLimit = createRateLimitHelper();
    const result = handleAuth(req, res, url, { json, rateLimit, authCookie });
    expect(result).toBe(true);
  });

  it("handler returns false for GET /api/verify-identity", () => {
    const req = createMockReq({ method: "GET", url: "/api/verify-identity" });
    const res = createMockRes();
    const url = new URL("/api/verify-identity", "http://localhost");
    const rateLimit = createRateLimitHelper();
    const result = handleAuth(req, res, url, { json, rateLimit, authCookie });
    expect(result).toBe(false);
  });

  it("handler returns false for unrelated paths", () => {
    const req = createMockReq({ method: "POST", url: "/api/other" });
    const res = createMockRes();
    const url = new URL("/api/other", "http://localhost");
    const rateLimit = createRateLimitHelper();
    const result = handleAuth(req, res, url, { json, rateLimit, authCookie });
    expect(result).toBe(false);
  });
});

describe("POST /api/verify-identity — whitespace and edge cases", () => {
  it("returns 400 for empty string code", async () => {
    const { status, body } = await verifyIdentity({ code: "" });
    expect(status).toBe(400);
  });

  it("returns 400 for whitespace-only code", async () => {
    const { status, body } = await verifyIdentity({ code: "    " });
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid code format");
  });
});
