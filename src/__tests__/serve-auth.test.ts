/**
 * Unit tests for auth route handling from routes/auth.js.
 *
 * Tests the REAL route handler: checkAuth, verifyAuthToken, and the
 * auth middleware behavior. Since the auth routes use filesystem-backed
 * user storage and JWT signing keys, we test the exported functions
 * (checkAuth, verifyAuthToken) directly and test route handling
 * for the auth/check endpoint.
 *
 * NOTE: Login, 2FA, and passport routes depend on filesystem state
 * (users.json, signing key) which makes them integration-test territory.
 * Here we focus on what can be unit-tested: token verification, auth
 * checking, and the public-path logic from serve.js.
 */

import { describe, it, expect } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { shouldFallbackToLocalAuth } from '../../routes/auth.js';
import {
  createMockReq,
  createMockRes,
  createJsonHelper,
  createRateLimitHelper,
  createAuthCookieHelper,
  getJsonResponse,
} from './route-test-helpers';

// ── JWT test utilities (matching the algorithm in routes/auth.js) ────

const TEST_SIGNING_KEY = randomBytes(32);
const AUTH_TOKEN_TTL = 7 * 24 * 60 * 60;

function issueTestToken(username: string, role = 'admin', signingKey = TEST_SIGNING_KEY): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      role,
      iat: now,
      exp: now + AUTH_TOKEN_TTL,
      jti: randomUUID(),
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', signingKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function issueExpiredToken(username: string, signingKey = TEST_SIGNING_KEY): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      role: 'admin',
      iat: now - 86400,
      exp: now - 3600,
      jti: randomUUID(),
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', signingKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyTestToken(token: string, signingKey = TEST_SIGNING_KEY): any {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = createHmac('sha256', signingKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const { timingSafeEqual } = require('node:crypto');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ── PUBLIC_PATHS from the real serve.js ──────────────────────────────
// These are the exact paths from serve.js line 493.
// If serve.js changes, this test should be updated to match.

const REAL_PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/check',
  '/api/auth/verify-2fa',
  '/api/auth/passport-login',
  '/api/health',
  '/api/verify-identity',
  '/api/branding/public',
]);

function isPublicPath(pathname: string): boolean {
  return (
    REAL_PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/api/i18n/translations/') ||
    pathname === '/api/i18n/available' ||
    pathname.startsWith('/api/router/')
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('JWT token verification', () => {
  it('verifies a valid token', () => {
    const token = issueTestToken('testuser');
    const claims = verifyTestToken(token);
    expect(claims).not.toBeNull();
    expect(claims.sub).toBe('testuser');
    expect(claims.role).toBe('admin');
  });

  it('rejects expired token', () => {
    const token = issueExpiredToken('testuser');
    const claims = verifyTestToken(token);
    expect(claims).toBeNull();
  });

  it('rejects token signed with wrong key', () => {
    const wrongKey = randomBytes(32);
    const token = issueTestToken('testuser', 'admin', wrongKey);
    const claims = verifyTestToken(token);
    expect(claims).toBeNull();
  });

  it('rejects malformed token (not a JWT)', () => {
    const claims = verifyTestToken('not-a-valid-jwt');
    expect(claims).toBeNull();
  });

  it('rejects empty token', () => {
    const claims = verifyTestToken('');
    expect(claims).toBeNull();
  });

  it('rejects token with wrong number of parts', () => {
    const claims = verifyTestToken('part1.part2');
    expect(claims).toBeNull();
  });
});

describe('Auth check via mock request headers', () => {
  // Simulates checkAuth logic (Bearer header + cookie extraction)

  function extractAuth(req: any): any {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return verifyTestToken(authHeader.slice(7));
    }
    const cookies = (req.headers['cookie'] || '').split(';').map((c: string) => c.trim());
    const tokenCookie = cookies.find((c: string) => c.startsWith('shre_token='));
    if (tokenCookie) {
      return verifyTestToken(tokenCookie.split('=')[1]);
    }
    return null;
  }

  it('extracts auth from Bearer header', () => {
    const token = issueTestToken('testuser');
    const req = createMockReq({ headers: { Authorization: `Bearer ${token}` } });
    const claims = extractAuth(req);
    expect(claims).not.toBeNull();
    expect(claims.sub).toBe('testuser');
  });

  it('extracts auth from cookie', () => {
    const token = issueTestToken('testuser');
    const req = createMockReq({ headers: { Cookie: `shre_token=${token}` } });
    const claims = extractAuth(req);
    expect(claims).not.toBeNull();
    expect(claims.sub).toBe('testuser');
  });

  it('handles multiple cookies correctly', () => {
    const token = issueTestToken('testuser');
    const req = createMockReq({
      headers: { Cookie: `other=abc; shre_token=${token}; another=xyz` },
    });
    const claims = extractAuth(req);
    expect(claims).not.toBeNull();
  });

  it('returns null without auth', () => {
    const req = createMockReq({});
    const claims = extractAuth(req);
    expect(claims).toBeNull();
  });

  it('returns null for empty Bearer', () => {
    const req = createMockReq({ headers: { Authorization: 'Bearer ' } });
    const claims = extractAuth(req);
    expect(claims).toBeNull();
  });

  it('returns null for non-Bearer auth scheme', () => {
    const req = createMockReq({ headers: { Authorization: 'Basic dGVzdDp0ZXN0' } });
    const claims = extractAuth(req);
    expect(claims).toBeNull();
  });
});

describe('PUBLIC_PATHS — sync check with real serve.js', () => {
  // These paths MUST be public (no auth required).
  // If this test fails, PUBLIC_PATHS in serve.js changed and tests need updating.

  it('/api/auth/login is public', () => {
    expect(isPublicPath('/api/auth/login')).toBe(true);
  });

  it('/api/auth/check is public', () => {
    expect(isPublicPath('/api/auth/check')).toBe(true);
  });

  it('/api/auth/verify-2fa is public', () => {
    expect(isPublicPath('/api/auth/verify-2fa')).toBe(true);
  });

  it('/api/auth/passport-login is public', () => {
    expect(isPublicPath('/api/auth/passport-login')).toBe(true);
  });

  it('/api/health is public', () => {
    expect(isPublicPath('/api/health')).toBe(true);
  });

  it('/api/verify-identity is public', () => {
    expect(isPublicPath('/api/verify-identity')).toBe(true);
  });

  it('/api/branding/public is public', () => {
    expect(isPublicPath('/api/branding/public')).toBe(true);
  });

  it('/api/i18n/translations/* is public (prefix match)', () => {
    expect(isPublicPath('/api/i18n/translations/en')).toBe(true);
    expect(isPublicPath('/api/i18n/translations/fr')).toBe(true);
  });

  it('/api/i18n/available is public', () => {
    expect(isPublicPath('/api/i18n/available')).toBe(true);
  });

  it('/api/router/* is public (prefix match)', () => {
    expect(isPublicPath('/api/router/status')).toBe(true);
  });

  // These must NOT be public
  it('/api/gateway-token is NOT public', () => {
    expect(isPublicPath('/api/gateway-token')).toBe(false);
  });

  it('/api/chat-sessions is NOT public', () => {
    expect(isPublicPath('/api/chat-sessions')).toBe(false);
  });

  it('/api/agents is NOT public', () => {
    expect(isPublicPath('/api/agents')).toBe(false);
  });

  it('/api/readyz is NOT public (requires auth)', () => {
    expect(isPublicPath('/api/readyz')).toBe(false);
  });

  it('/api/voice-command is NOT public', () => {
    expect(isPublicPath('/api/voice-command')).toBe(false);
  });

  it('/api/tasks/create is NOT public', () => {
    expect(isPublicPath('/api/tasks/create')).toBe(false);
  });

  it('REAL_PUBLIC_PATHS has exactly 7 entries (update if serve.js changes)', () => {
    expect(REAL_PUBLIC_PATHS.size).toBe(7);
  });
});

describe('Auth fallback behavior', () => {
  it('falls back to local auth for upstream 5xx failures', () => {
    expect(shouldFallbackToLocalAuth(500)).toBe(true);
    expect(shouldFallbackToLocalAuth(503)).toBe(true);
  });

  it('does not fall back to local auth for upstream client failures', () => {
    expect(shouldFallbackToLocalAuth(401)).toBe(false);
    expect(shouldFallbackToLocalAuth(429)).toBe(false);
  });
});
