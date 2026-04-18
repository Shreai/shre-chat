// @ts-check
// Auth routes — login, logout, 2FA, identity verification, login history
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash, createHmac, timingSafeEqual, scryptSync, randomBytes, createDecipheriv, createCipheriv } from "node:crypto";
import { spawn } from "node:child_process";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} UserRecord
 * @property {string} hash - password hash (scrypt or legacy sha256)
 * @property {string} [role]
 * @property {string} [name]
 * @property {boolean} [twoFactor]
 * @property {string} [email]
 */

/** @typedef {Record<string, UserRecord>} UsersMap */

/**
 * @typedef {object} JWTClaims
 * @property {string} sub - username
 * @property {string} role
 * @property {number} iat
 * @property {number} exp
 * @property {string} jti
 */

/**
 * @typedef {object} OTPEntry
 * @property {string} code
 * @property {number} expires
 * @property {number} attempts
 */

/**
 * @typedef {object} TrustedDeviceEntry
 * @property {string} trustedAt
 * @property {number} expiresAt
 */

/**
 * @typedef {object} ParsedUA
 * @property {string} browser
 * @property {string} browserVersion
 * @property {string} os
 * @property {string} osVersion
 * @property {string} deviceType
 */

/**
 * @typedef {object} AuthRouteHelpers
 * @property {(res: ServerResponse, data: any, status?: number) => void} json
 * @property {(key: string, bucket: string, limit: number, window: number) => { allowed: boolean, retryAfter?: number }} rateLimit
 * @property {(name: string, value: string, maxAge: number, req: IncomingMessage) => string} authCookie
 */

// ── Constants ──
const AUTH_SIGNING_KEY_PATH = join(homedir(), ".shre", "auth", "signing-key.hex");
const USERS_PATH = join(homedir(), ".shre", "vault", "users.json");
const AUTH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const otpStore = new Map();
const SEND_EMAIL_SCRIPT = join(import.meta.dirname, "..", "shre-gmail", "send-email.mjs");
const TRUST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const TRUSTED_DEVICES_PATH = join(homedir(), ".shre", "vault", "trusted-devices.json");
const LOGIN_LOG_PATH = join(homedir(), ".shre", "logs", "logins.jsonl");
const AUDIT_LOG = join(homedir(), ".shre", "logs", "auth-audit.jsonl");
const VAULT_KEY_PATH = join(homedir(), ".shre", ".vault-key");

// ── Vault encryption ──
/** @type {string|null} */
let _vaultKey = null;
/** @returns {string|null} */
function getVaultKey() {
  if (_vaultKey) return _vaultKey;
  try {
    const raw = readFileSync(VAULT_KEY_PATH, "utf8").trim();
    const idx = raw.indexOf(":");
    _vaultKey = idx >= 0 ? raw.slice(idx + 1) : raw;
    return _vaultKey;
  } catch { return null; }
}

/**
 * Read and decrypt a vault file.
 * @param {string} filePath
 * @returns {string}
 */
function readVault(filePath) {
  const content = readFileSync(filePath, "utf8").trim();
  if (!content.startsWith("ENC:")) return content;
  const parts = content.split(":");
  const algo = parts[1];
  const iv = parts[2];
  const data = parts.slice(3).join(":");
  const key = getVaultKey();
  if (!key) throw new Error("Vault key not found");
  const decipher = createDecipheriv(algo, Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
  let decrypted = decipher.update(data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Encrypt and write a vault file.
 * @param {string} filePath
 * @param {string} plaintext
 */
function writeVault(filePath, plaintext) {
  const key = getVaultKey();
  if (!key) {
    writeFileSync(filePath, plaintext, { mode: 0o600 });
    return;
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  writeFileSync(filePath, `ENC:aes-256-cbc:${iv.toString("hex")}:${encrypted}`, { mode: 0o600 });
}

// ── User management ──
/** @returns {UsersMap} */
export function loadUsers() {
  try {
    if (!existsSync(USERS_PATH)) return {};
    return JSON.parse(readVault(USERS_PATH));
  } catch { return {}; }
}

/** @param {UsersMap} users */
function saveUsers(users) {
  try { writeVault(USERS_PATH, JSON.stringify(users, null, 2)); }
  catch { /* best effort */ }
}

/**
 * @param {string} password
 * @param {string} [salt]
 * @returns {string} scrypt hash in format "scrypt:salt:hash"
 */
function hashPassword(password, salt) {
  if (!salt) salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

/**
 * @param {string} password
 * @param {string} stored - stored hash (scrypt or legacy sha256)
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
  }
  const legacy = createHash("sha256").update(password).digest("hex");
  if (stored.length === 64) {
    return timingSafeEqual(Buffer.from(legacy, "hex"), Buffer.from(stored, "hex"));
  }
  return false;
}

/**
 * @param {string} username
 * @param {string} password
 * @param {UsersMap} users
 */
function upgradePasswordIfNeeded(username, password, users) {
  const user = users[username];
  if (!user || user.hash.startsWith("scrypt:")) return;
  user.hash = hashPassword(password);
  saveUsers(users);
}

// ── Trusted devices ──
/** @returns {Record<string, TrustedDeviceEntry>} */
function loadTrustedDevices() {
  try { return existsSync(TRUSTED_DEVICES_PATH) ? JSON.parse(readFileSync(TRUSTED_DEVICES_PATH, "utf8")) : {}; }
  catch { return {}; }
}

/** @param {Record<string, TrustedDeviceEntry>} devices */
function saveTrustedDevices(devices) {
  const dir = join(homedir(), ".shre", "vault");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TRUSTED_DEVICES_PATH, JSON.stringify(devices, null, 2), { mode: 0o600 });
}

/**
 * @param {string} username
 * @param {string|undefined} deviceToken
 * @returns {boolean}
 */
function isDeviceTrusted(username, deviceToken) {
  if (!deviceToken) return false;
  const devices = loadTrustedDevices();
  const key = `${username}:${deviceToken}`;
  const entry = devices[key];
  if (!entry) return false;
  if (Date.now() / 1000 > entry.expiresAt) {
    delete devices[key];
    saveTrustedDevices(devices);
    return false;
  }
  return true;
}

/**
 * @param {string} username
 * @returns {string} device trust token (UUID)
 */
function trustDevice(username) {
  const token = randomUUID();
  const devices = loadTrustedDevices();
  devices[`${username}:${token}`] = { trustedAt: new Date().toISOString(), expiresAt: Math.floor(Date.now() / 1000) + TRUST_TTL };
  saveTrustedDevices(devices);
  return token;
}

// ── Login tracking ──
/**
 * @param {string} ua - raw User-Agent header
 * @returns {ParsedUA}
 */
function parseUserAgent(ua) {
  if (!ua) return { browser: "unknown", browserVersion: "", os: "unknown", osVersion: "", deviceType: "unknown" };
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  let browser = "unknown", browserVersion = "";
  if (/Edg\//i.test(ua)) { browser = "Edge"; browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] || ""; }
  else if (/Chrome\//i.test(ua)) { browser = "Chrome"; browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || ""; }
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) { browser = "Safari"; browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || ""; }
  else if (/Firefox\//i.test(ua)) { browser = "Firefox"; browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || ""; }
  let os = "unknown", osVersion = "";
  if (/Windows NT/i.test(ua)) { os = "Windows"; osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] || ""; }
  else if (/Mac OS X/i.test(ua)) { os = "macOS"; osVersion = ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, ".") || ""; }
  else if (/Android/i.test(ua)) { os = "Android"; osVersion = ua.match(/Android ([\d.]+)/)?.[1] || ""; }
  else if (/iPhone OS|iPad/i.test(ua)) { os = "iOS"; osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""; }
  else if (/Linux/i.test(ua)) { os = "Linux"; }
  return { browser, browserVersion, os, osVersion, deviceType };
}

/**
 * @param {string} username
 * @param {IncomingMessage} req
 * @param {string} [event]
 */
function logLogin(username, req, event = "login") {
  try {
    const dir = join(homedir(), ".shre", "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // @ts-ignore — x-forwarded-for is always a string in practice
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "";
    const parsed = parseUserAgent(ua);
    const entry = JSON.stringify({
      ts: new Date().toISOString(), event, username, ip,
      ...parsed, userAgent: ua,
    });
    appendFileSync(LOGIN_LOG_PATH, entry + "\n");
  } catch { /* best effort */ }
}

// ── OTP ──
/** @returns {string} 6-digit zero-padded OTP code */
function generateOTP() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return String(((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0) % 1000000).padStart(6, "0");
}

/**
 * @param {string} email
 * @param {string} code
 * @param {string} username
 */
function sendOTPEmail(email, code, username) {
  const subject = `${code} is your Shre verification code`;
  const body = `Your Shre Chat verification code is:\n\n${code}\n\nThis code expires in 5 minutes.\nIf you did not request this, please ignore this email.\n\n@chat.nirtek.net #${code}\n\n— Shre AI`;
  const child = spawn("node", [SEND_EMAIL_SCRIPT, email, subject, "ENV_BODY"], {
    cwd: join(import.meta.dirname, "..", ".."),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HOME: homedir(), SHRE_EMAIL_BODY: body },
  });
  child.stdin.end(body);
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  child.on("close", () => {});
}

// ── Audit logging ──
/**
 * @param {string} event
 * @param {Record<string, any>} data
 */
function auditLog(event, data) {
  try {
    const dir = join(homedir(), ".shre", "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
    appendFileSync(AUDIT_LOG, entry + "\n");
  } catch { /* best effort */ }
}

// ── JWT ──
/** @type {Buffer|null} */
let authSigningKey = null;
try {
  authSigningKey = Buffer.from(readFileSync(AUTH_SIGNING_KEY_PATH, "utf8").trim(), "hex");
} catch { /* auth disabled if no key */ }

/**
 * @param {string} username
 * @param {string} [role]
 * @returns {string|null} JWT token or null if signing key unavailable
 */
function issueAuthToken(username, role = "admin") {
  if (!authSigningKey) return null;
  // Use cached platformId (UUID from shre-auth) so local fallback tokens
  // produce the same user_id as platform tokens — critical for session sync.
  const users = loadUsers();
  const userRecord = users[username] || {};
  const sub = userRecord.platformId || username;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub, role, username, iat: now, exp: now + AUTH_TOKEN_TTL, jti: randomUUID() };
  // Include cached workspace so tenant_id stays consistent
  if (userRecord.activeWorkspaceId) claims.activeWorkspaceId = userRecord.activeWorkspaceId;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", authSigningKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Extract sub (user UUID) from a platform JWT without verifying signature */
function extractSubFromToken(token) {
  try {
    const parts = (token || "").split(".");
    if (parts.length < 2) return null;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return claims.sub || null;
  } catch { return null; }
}

/** Cache the platform UUID + workspace in local users.json for fallback token consistency */
function cachePlatformId(username, platformToken) {
  try {
    const parts = (platformToken || "").split(".");
    if (parts.length < 2) return;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const platformSub = claims.sub;
    if (!platformSub || platformSub === username) return;
    const users = loadUsers();
    if (!users[username]) return;
    let changed = false;
    if (users[username].platformId !== platformSub) {
      users[username].platformId = platformSub;
      changed = true;
    }
    if (claims.activeWorkspaceId && users[username].activeWorkspaceId !== claims.activeWorkspaceId) {
      users[username].activeWorkspaceId = claims.activeWorkspaceId;
      changed = true;
    }
    if (changed) saveUsers(users);
  } catch { /* best effort */ }
}

/**
 * @param {string|null|undefined} token
 * @returns {JWTClaims|null}
 */
export function verifyAuthToken(token) {
  if (!authSigningKey || !token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = createHmac("sha256", authSigningKey).update(`${header}.${payload}`).digest("base64url");
    const sigBuf = Buffer.from(sig, "utf-8");
    const expBuf = Buffer.from(expected, "utf-8");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (claims.tokenType && claims.tokenType !== "platform_user") return null;
    return claims;
  } catch { return null; }
}

/**
 * Check if request has valid auth. Returns claims or null.
 * @param {IncomingMessage} req
 * @returns {JWTClaims|null}
 */
export function checkAuth(req) {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return verifyAuthToken(authHeader.slice(7));
  }
  const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith("shre_token="));
  if (tokenCookie) {
    return verifyAuthToken(tokenCookie.split("=")[1]);
  }
  return null;
}

// Create default user if none exist
if (!existsSync(USERS_PATH)) {
  const dir = join(homedir(), ".shre", "vault");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USERS_PATH, JSON.stringify({
    [process.env.SHRE_ADMIN_USER || "admin"]: { hash: hashPassword(process.env.SHRE_ADMIN_PASSWORD || (() => { throw new Error("SHRE_ADMIN_PASSWORD env var required"); })()), role: "admin", name: "Admin" }
  }, null, 2), { mode: 0o600 });
}

/**
 * Register auth routes on the request handler.
 * @param {{ log: import('shre-sdk').Logger }} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: AuthRouteHelpers) => boolean|void}
 */
export function registerAuthRoutes({ log }) {

  return async function handleAuthRoute(req, res, url, { json, rateLimit, authCookie }) {

    // ── Login (delegates to shre-auth centralized auth) ──
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      // @ts-ignore — x-forwarded-for is always a string in practice
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      // Higher rate limit for localhost / tunnel-proxied (QA/dev) vs external
      const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";
      const isTunnelProxied = !isLocal && (
        !!req.headers["cf-connecting-ip"] ||            // Cloudflare Tunnel
        !!req.headers["cf-ray"] ||                      // Cloudflare edge
        req.headers["x-forwarded-for"]?.includes("127.0.0.1") ||  // auth-gate at :5431
        req.headers["x-forwarded-for"]?.includes("::1")
      );
      const loginLimit = isLocal ? 30 : isTunnelProxied ? 30 : 15;
      const rl = rateLimit(clientIp, "login", loginLimit, 15 * 60_000);
      if (!rl.allowed) {
        auditLog("login_rate_limited", { ip: clientIp });
        return json(res, { error: "Too many login attempts. Try again later.", retryAfter: rl.retryAfter }, 429);
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { username, password } = JSON.parse(body);
          if (!username || !password) return json(res, { error: "Username and password required" }, 400);
          const ulr = rateLimit(username, "login-user", loginLimit, 5 * 60_000);
          if (!ulr.allowed) {
            auditLog("login_rate_limited", { ip: clientIp, username });
            return json(res, { error: "Too many login attempts for this account. Try again later.", retryAfter: ulr.retryAfter }, 429);
          }

          // Delegate to shre-auth centralized auth
          try {
            const { serviceUrl } = await import("shre-sdk/discovery");
            const authUrl = serviceUrl("shre-auth");
            const authRes = await fetch(`${authUrl}/v1/auth/login`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": clientIp,
                "user-agent": req.headers["user-agent"] || "",
              },
              body: JSON.stringify({ username, password }),
              signal: AbortSignal.timeout(10000),
            });
            const data = await authRes.json();

            if (!authRes.ok) {
              auditLog("login_failed", { ip: clientIp, username, code: data.code });
              return json(res, { error: data.error || "Login failed" }, authRes.status);
            }

            // Check 2FA (local shre-chat feature — applies on top of shre-auth)
            if (!data.requiresWorkspaceSelection) {
              const users = loadUsers();
              const localUser = users[username];
              if (localUser?.twoFactor && localUser.email) {
                const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
                const trustCookie = cookies.find(c => c.startsWith("shre_trust="));
                const trustToken = trustCookie?.split("=")[1];
                if (trustToken && isDeviceTrusted(username, trustToken)) {
                  // Trusted device — skip 2FA
                  cachePlatformId(username, data.token);
                  res.setHeader("Set-Cookie", authCookie("shre_token", data.token, AUTH_TOKEN_TTL, req));
                  auditLog("login_success_trusted", { ip: clientIp, username });
                  logLogin(username, req, "login_trusted_device");
                  return json(res, data);
                }
                // Need 2FA — stash the platform token for after verification
                const code = generateOTP();
                otpStore.set(username, { code, expires: Date.now() + OTP_TTL, attempts: 0, platformData: data });
                sendOTPEmail(localUser.email, code, username);
                const masked = localUser.email.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c);
                auditLog("2fa_sent", { ip: clientIp, username });
                return json(res, { requires2FA: true, maskedEmail: masked });
              }
            }

            // Success or workspace selection needed
            if (data.token) {
              cachePlatformId(username, data.token);
              res.setHeader("Set-Cookie", authCookie("shre_token", data.token, AUTH_TOKEN_TTL, req));
              auditLog("login_success", { ip: clientIp, username });
              logLogin(username, req, "login");
            }
            // Pass username for client-side migration trigger
            if (data.user && !data.user.username) data.user.username = username;
            return json(res, data);
          } catch (authErr) {
            // shre-auth unavailable — fall back to local auth
            log.warn("[auth] shre-auth unavailable, falling back to local auth", { error: authErr?.message });
            const users = loadUsers();
            const user = users[username];
            if (!user || !verifyPassword(password, user.hash)) {
              auditLog("login_failed", { ip: clientIp, username });
              return json(res, { error: "Invalid credentials" }, 401);
            }
            upgradePasswordIfNeeded(username, password, users);
            if (user.twoFactor && user.email) {
              const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
              const trustCookie = cookies.find(c => c.startsWith("shre_trust="));
              const trustToken = trustCookie?.split("=")[1];
              if (trustToken && isDeviceTrusted(username, trustToken)) {
                const token = issueAuthToken(username, user.role || "admin");
                if (!token) return json(res, { error: "Auth system unavailable" }, 500);
                res.setHeader("Set-Cookie", authCookie("shre_token", token, AUTH_TOKEN_TTL, req));
                auditLog("login_success_trusted", { ip: clientIp, username });
                logLogin(username, req, "login_trusted_device");
                return json(res, { token, user: { username, name: user.name || username, role: user.role || "admin" } });
              }
              const code = generateOTP();
              otpStore.set(username, { code, expires: Date.now() + OTP_TTL, attempts: 0 });
              sendOTPEmail(user.email, code, username);
              const masked = user.email.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c);
              auditLog("2fa_sent", { ip: clientIp, username });
              return json(res, { requires2FA: true, maskedEmail: masked });
            }
            const token = issueAuthToken(username, user.role || "admin");
            if (!token) return json(res, { error: "Auth system unavailable" }, 500);
            res.setHeader("Set-Cookie", authCookie("shre_token", token, AUTH_TOKEN_TTL, req));
            auditLog("login_success", { ip: clientIp, username });
            logLogin(username, req, "login");
            return json(res, { token, user: { username, name: user.name || username, role: user.role || "admin" } });
          }
        } catch { return json(res, { error: "Invalid request" }, 400); }
      });
      return true;
    }

    // ── Signup (delegates to shre-auth centralized auth) ──
    if (url.pathname === "/api/auth/signup" && req.method === "POST") {
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const rl = rateLimit(clientIp, "signup", 5, 60 * 60_000); // 5 signups/hour per IP
      if (!rl.allowed) {
        return json(res, { error: "Too many signup attempts. Try again later.", retryAfter: rl.retryAfter }, 429);
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed.email || !parsed.password) return json(res, { error: "Email and password required" }, 400);
          if (parsed.password.length < 8) return json(res, { error: "Password must be at least 8 characters" }, 400);

          const { serviceUrl } = await import("shre-sdk/discovery");
          const authUrl = serviceUrl("shre-auth");
          const authRes = await fetch(`${authUrl}/v1/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": clientIp },
            body: JSON.stringify({
              email: parsed.email,
              password: parsed.password,
              name: parsed.name || parsed.email.split("@")[0],
              workspaceName: parsed.workspaceName,
            }),
            signal: AbortSignal.timeout(10000),
          });
          const data = await authRes.json();
          if (!authRes.ok) return json(res, data, authRes.status);

          // Set auth cookie (same as login)
          if (data.token) {
            res.setHeader("Set-Cookie", authCookie("shre_token", data.token, 7 * 86400, req));
          }
          auditLog("signup_success", { ip: clientIp, email: parsed.email });
          json(res, data);
        } catch (err) {
          log.error("[signup] Error:", err.message);
          json(res, { error: "Signup failed" }, 500);
        }
      });
      return true;
    }

    // ── 2FA verification ──
    if (url.pathname === "/api/auth/verify-2fa" && req.method === "POST") {
      // @ts-ignore — x-forwarded-for is always a string in practice
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { username, code, trustDevice: shouldTrust } = JSON.parse(body);
          if (!username || !code) return json(res, { error: "Username and code required" }, 400);
          const otp = otpStore.get(username);
          if (!otp) return json(res, { error: "No pending verification. Please log in again." }, 400);
          if (Date.now() > otp.expires) {
            otpStore.delete(username);
            auditLog("2fa_expired", { ip: clientIp, username });
            return json(res, { error: "Code expired. Please log in again." }, 401);
          }
          otp.attempts++;
          if (otp.attempts > 5) {
            otpStore.delete(username);
            auditLog("2fa_lockout", { ip: clientIp, username });
            return json(res, { error: "Too many attempts. Please log in again." }, 429);
          }
          const inputBuf = Buffer.from(code.trim().padEnd(6, "\0"));
          const expectedBuf = Buffer.from(otp.code.padEnd(6, "\0"));
          if (!timingSafeEqual(inputBuf, expectedBuf)) {
            auditLog("2fa_failed", { ip: clientIp, username, attempt: otp.attempts });
            return json(res, { error: `Invalid code. ${5 - otp.attempts} attempts remaining.` }, 401);
          }
          // Check if platform auth data was stashed from shre-auth login
          const platformData = otp.platformData;
          otpStore.delete(username);
          if (platformData) {
            // Return the platform JWT from shre-auth
            const cookieHeaders = [authCookie("shre_token", platformData.token, AUTH_TOKEN_TTL, req)];
            if (shouldTrust) {
              const deviceToken = trustDevice(username);
              cookieHeaders.push(authCookie("shre_trust", deviceToken, TRUST_TTL, req));
              auditLog("device_trusted", { ip: clientIp, username });
            }
            res.setHeader("Set-Cookie", cookieHeaders);
            auditLog("login_success_2fa", { ip: clientIp, username });
            logLogin(username, req, "login_2fa");
            return json(res, platformData);
          }
          // Fallback: local auth (shre-auth was unavailable during login)
          const users = loadUsers();
          const user = users[username];
          const token = issueAuthToken(username, user?.role || "admin");
          if (!token) return json(res, { error: "Auth system unavailable" }, 500);
          const cookieHeaders = [authCookie("shre_token", token, AUTH_TOKEN_TTL, req)];
          if (shouldTrust) {
            const deviceToken = trustDevice(username);
            cookieHeaders.push(authCookie("shre_trust", deviceToken, TRUST_TTL, req));
            auditLog("device_trusted", { ip: clientIp, username });
          }
          res.setHeader("Set-Cookie", cookieHeaders);
          auditLog("login_success_2fa", { ip: clientIp, username });
          logLogin(username, req, "login_2fa");
          return json(res, { token, user: { username, name: user?.name || username, role: user?.role || "admin" } });
        } catch { return json(res, { error: "Invalid request" }, 400); }
      });
      return true;
    }

    // ── Auth check (try shre-auth first, fallback to local) ──
    if (url.pathname === "/api/auth/check" && req.method === "GET") {
      const authHeader = req.headers["authorization"];
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) return json(res, { authenticated: false }, 401);

      // Try platform JWT validation via shre-auth
      try {
        const { serviceUrl } = await import("shre-sdk/discovery");
        const authUrl = serviceUrl("shre-auth");
        const valRes = await fetch(`${authUrl}/v1/auth/validate-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(5000),
        });
        const valData = await valRes.json();
        if (valData.valid && valData.claims) {
          return json(res, {
            authenticated: true,
            user: {
              id: valData.claims.sub,
              username: valData.claims.email,
              name: valData.claims.name,
              role: valData.claims.role,
              isSuperAdmin: valData.claims.isSuperAdmin,
            },
            workspace: {
              id: valData.claims.activeWorkspaceId,
              name: valData.claims.activeWorkspaceName,
              role: valData.claims.role,
            },
            workspaces: valData.claims.workspaceIds,
          });
        }
      } catch {
        // shre-auth unavailable — fall back to local check
      }

      // Local JWT fallback
      const claims = checkAuth(req);
      if (!claims) return json(res, { authenticated: false }, 401);
      const users = loadUsers();
      const user = users[claims.sub];
      json(res, { authenticated: true, user: { username: claims.sub, name: user?.name || claims.sub, role: claims.role } });
      return true;
    }

    // ── SSO from shre-auth-gate ──
    if (url.pathname === "/api/auth/gate-sso" && req.method === "GET") {
      const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
      const gateToken = cookies.find(c => c.startsWith("shre_gate_token="))?.split("=")[1];
      
      if (!gateToken) {
        log.debug("[auth] No gate token found in cookies");
        return json(res, { sso: false }, 200);
      }

      try {
        const authUrl = process.env.SHRE_AUTH_URL || "http://127.0.0.1:5455";
        const valRes = await fetch(`${authUrl}/v1/verify`, {
          headers: { "Authorization": `Bearer ${gateToken}` },
          signal: AbortSignal.timeout(3000)
        });

        if (valRes.ok) {
          const valData = await valRes.json();
          // Generate a local token matching these claims
          const token = signAuthToken({
            sub: valData.claims.sub,
            username: valData.claims.username,
            role: valData.claims.role || "user"
          });
          
          res.setHeader("Set-Cookie", authCookie("shre_token", token, AUTH_TOKEN_TTL, req));
          return json(res, {
            sso: true,
            token,
            user: {
              username: valData.claims.username,
              name: valData.claims.name || valData.claims.username,
              role: valData.claims.role
            }
          });
        }
      } catch (err) {
        log.warn("[auth] gate-sso verify failed", { error: err.message });
      }
      return json(res, { sso: false }, 200);
    }

    // ── Workspace switch (proxy to shre-auth) ──
    if (url.pathname === "/api/auth/switch-workspace" && req.method === "POST") {
      const authHeader = req.headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) return json(res, { error: "Unauthorized" }, 401);
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { serviceUrl } = await import("shre-sdk/discovery");
          const authUrl = serviceUrl("shre-auth");
          const switchRes = await fetch(`${authUrl}/v1/auth/switch-workspace`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
            },
            body,
            signal: AbortSignal.timeout(10000),
          });
          const data = await switchRes.json();
          if (data.token) {
            res.setHeader("Set-Cookie", authCookie("shre_token", data.token, AUTH_TOKEN_TTL, req));
          }
          json(res, data, switchRes.status);
        } catch {
          json(res, { error: "Auth service unavailable" }, 503);
        }
      });
      return true;
    }

    // ── Select workspace (proxy to shre-auth) ──
    if (url.pathname === "/api/auth/select-workspace" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { serviceUrl } = await import("shre-sdk/discovery");
          const authUrl = serviceUrl("shre-auth");
          const selRes = await fetch(`${authUrl}/v1/auth/select-workspace`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: AbortSignal.timeout(10000),
          });
          const data = await selRes.json();
          if (data.token) {
            res.setHeader("Set-Cookie", authCookie("shre_token", data.token, AUTH_TOKEN_TTL, req));
          }
          json(res, data, selRes.status);
        } catch {
          json(res, { error: "Auth service unavailable" }, 503);
        }
      });
      return true;
    }

    // ── Refresh (proxy to shre-auth, rotates JTI, returns fresh 8h JWT) ──
    if (url.pathname === "/api/auth/refresh" && req.method === "POST") {
      const authHeader = req.headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) {
        return json(res, { error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
      }
      try {
        const { serviceUrl } = await import("shre-sdk/discovery");
        const authUrl = serviceUrl("shre-auth");
        const upstream = await fetch(`${authUrl}/v1/auth/refresh`, {
          method: "POST",
          headers: { "Authorization": authHeader },
          signal: AbortSignal.timeout(5000),
        });
        const body = await upstream.json().catch(() => ({}));
        if (!upstream.ok || !body?.token) {
          return json(res, body?.error ? body : { error: "Refresh failed" }, upstream.status || 401);
        }
        // Mirror login: set cookie so SSR/cookie-bearing clients stay in sync
        res.setHeader("Set-Cookie", authCookie("shre_token", body.token, 8 * 60 * 60, req));
        return json(res, { token: body.token });
      } catch (err) {
        return json(res, { error: "Refresh unavailable" }, 503);
      }
    }

    // ── Logout (also revoke at shre-auth) ──
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const authHeader = req.headers["authorization"];
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const { serviceUrl } = await import("shre-sdk/discovery");
          const authUrl = serviceUrl("shre-auth");
          fetch(`${authUrl}/v1/auth/logout`, {
            method: "POST",
            headers: { "Authorization": authHeader },
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
        } catch { /* ignore */ }
      }
      res.setHeader("Set-Cookie", authCookie("shre_token", "", 0, req));
      json(res, { ok: true });
      return true;
    }

    // ── Identity verification ──
    if (url.pathname === "/api/verify-identity" && req.method === "POST") {
      // @ts-ignore — x-forwarded-for is always a string in practice
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const rl = rateLimit(clientIp, "verify-identity", 3, 15 * 60_000);
      if (!rl.allowed) {
        auditLog("verify_identity_rate_limited", { ip: clientIp });
        return json(res, { verified: false, error: "Too many attempts. Try again later.", retryAfter: rl.retryAfter }, 429);
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { code } = JSON.parse(body);
          if (!code || typeof code !== "string") return json(res, { verified: false, error: "Code required" }, 400);
          if (!/^[a-zA-Z0-9\-_]{4,64}$/.test(code)) {
            return json(res, { verified: false, error: "Invalid code format" }, 400);
          }
          const scriptPath = join(homedir(), ".local", "bin", "vault-verify-identity.sh");
          if (!existsSync(scriptPath)) return json(res, { verified: false, error: "Verification unavailable" }, 503);
          const child = spawn("bash", [scriptPath, code], { timeout: 5000 });
          let stdout = "";
          child.stdout.on("data", (d) => { stdout += d.toString(); });
          child.on("close", () => {
            const result = stdout.trim();
            if (result === "match") {
              // @ts-ignore — x-forwarded-for is always a string in practice
              auditLog("identity_verified", { ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown" });
              return json(res, { verified: true });
            }
            // @ts-ignore — x-forwarded-for is always a string in practice
            auditLog("identity_failed", { ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown" });
            return json(res, { verified: false });
          });
          child.on("error", () => json(res, { verified: false, error: "Verification failed" }, 500));
        } catch { return json(res, { verified: false, error: "Invalid request" }, 400); }
      });
      return true;
    }

    // ── Passport login (Phase 2: passport-based auth) ──
    // Delegates to shre-passport /v1/passport/login for JWT issuance.
    // Falls back to existing local auth if passport service is unavailable.
    if (url.pathname === "/api/auth/passport-login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { email, passcode } = JSON.parse(body);
          if (!email || !passcode) return json(res, { error: "email and passcode required" }, 400);

          // Try passport service first
          try {
            const { serviceUrl } = await import("shre-sdk/discovery");
            const passportUrl = serviceUrl("shre-passport");
            const passportRes = await fetch(`${passportUrl}/v1/passport/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, passcode }),
              signal: AbortSignal.timeout(5000),
            });
            const data = await passportRes.json();
            if (passportRes.ok && data.token) {
              auditLog("passport_login_success", { email, passportId: data.passportId });
              return json(res, {
                token: data.token,
                passportId: data.passportId,
                type: data.type,
                scopes: data.scopes,
                expiresAt: data.expiresAt,
              });
            }
            auditLog("passport_login_failed", { email, error: data.error });
            return json(res, { error: data.error || "Authentication failed" }, passportRes.status);
          } catch (err) {
            log.warn("[auth] Passport service unavailable, using local auth fallback", { error: err?.message });
            // Fall back to local identity verification
            return json(res, { error: "Passport service unavailable" }, 503);
          }
        } catch { return json(res, { error: "Invalid request" }, 400); }
      });
      return true;
    }

    // ── Login history ──
    if (url.pathname === "/api/auth/sessions" && req.method === "GET") {
      try {
        const claims = checkAuth(req);
        if (!claims) return json(res, { error: "Unauthorized" }, 401);
        const lines = existsSync(LOGIN_LOG_PATH)
          ? readFileSync(LOGIN_LOG_PATH, "utf8").trim().split("\n").filter(Boolean)
          : [];
        const entries = lines
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(e => e && e.username === claims.sub)
          .reverse()
          .slice(0, 50);
        json(res, { logins: entries });
      } catch { json(res, { logins: [] }); }
      return true;
    }

    return false; // not handled
  };
}
