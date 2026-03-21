// @ts-check
// Web Push notification routes — background push delivery for iOS/mobile
// Uses VAPID (Voluntary Application Server Identification) for authentication
import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const VAPID_DIR = join(homedir(), ".shre", "push");
const VAPID_FILE = join(VAPID_DIR, "vapid-keys.json");

/**
 * @typedef {object} PushDeps
 * @property {import('shre-sdk').Logger} log
 * @property {import('better-sqlite3').Database} chatDb
 */

/**
 * Load or generate VAPID keys. Persisted to ~/.shre/push/vapid-keys.json
 * @returns {{ publicKey: string, privateKey: string }}
 */
function loadOrGenerateVapidKeys(log) {
  if (existsSync(VAPID_FILE)) {
    try {
      return JSON.parse(readFileSync(VAPID_FILE, "utf8"));
    } catch (err) {
      log.warn("Failed to read VAPID keys, regenerating", {}, err);
    }
  }
  const keys = webpush.generateVAPIDKeys();
  try {
    mkdirSync(VAPID_DIR, { recursive: true });
    writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
    log.info("Generated new VAPID keys", { path: VAPID_FILE });
  } catch (err) {
    log.warn("Failed to persist VAPID keys", {}, err);
  }
  return keys;
}

/**
 * Register push notification routes and return a sendPush helper.
 * @param {PushDeps} deps
 */
export function registerPushRoutes({ log, chatDb }) {
  // ── VAPID setup ──
  const vapidKeys = loadOrGenerateVapidKeys(log);
  webpush.setVapidDetails(
    "mailto:nir@nirlab.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // ── Push subscriptions table ──
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      last_push_at INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
  `);

  const stmtInsert = chatDb.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const stmtDelete = chatDb.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
  const stmtGetAll = chatDb.prepare(`SELECT * FROM push_subscriptions WHERE fail_count < 3`);
  const stmtIncrFail = chatDb.prepare(`UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE endpoint = ?`);
  const stmtResetFail = chatDb.prepare(`UPDATE push_subscriptions SET fail_count = 0, last_push_at = ? WHERE endpoint = ?`);
  const stmtPrune = chatDb.prepare(`DELETE FROM push_subscriptions WHERE fail_count >= 5`);
  const stmtCount = chatDb.prepare(`SELECT COUNT(*) as count FROM push_subscriptions`);

  // Prune dead subscriptions on startup
  try { stmtPrune.run(); } catch {}

  /**
   * Send a push notification to ALL active subscriptions.
   * Called from broadcastNotification() in serve.js.
   * @param {{ title: string, body?: string, type?: string, url?: string, badge?: number }} payload
   */
  async function sendPushToAll(payload) {
    /** @type {any[]} */
    let subs;
    try {
      subs = stmtGetAll.all();
    } catch (err) {
      log.error("Failed to load push subscriptions", {}, err);
      return;
    }
    if (subs.length === 0) return;

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body || "",
      type: payload.type || "notification",
      url: payload.url || "/",
      badge: payload.badge ?? 1,
      timestamp: Date.now(),
    });

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(pushSub, message, { TTL: 3600 });
          stmtResetFail.run(Date.now(), sub.endpoint);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expired/invalid — remove it
            stmtDelete.run(sub.endpoint);
            log.info("Removed expired push subscription", { endpoint: sub.endpoint.slice(0, 60) });
          } else {
            stmtIncrFail.run(sub.endpoint);
            log.warn("Push delivery failed", { endpoint: sub.endpoint.slice(0, 60), status: err.statusCode });
          }
        }
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    if (sent > 0) log.debug("Push sent", { sent, total: subs.length });
  }

  /**
   * Route handler for push-related API endpoints.
   */
  async function handlePushRoute(req, res, url, { json, collectBody }) {
    // GET /api/push/vapid-key — public key for client subscription
    if (url.pathname === "/api/push/vapid-key" && req.method === "GET") {
      return json(res, { publicKey: vapidKeys.publicKey });
    }

    // POST /api/push/subscribe — register push subscription
    if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { subscription } = JSON.parse(body);
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
          return json(res, { error: "Invalid subscription: needs endpoint, keys.p256dh, keys.auth" }, 400);
        }
        const id = randomUUID();
        stmtInsert.run(
          id,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          req.headers["user-agent"] || null,
          Date.now()
        );
        log.info("Push subscription registered", { id, endpoint: subscription.endpoint.slice(0, 60) });
        return json(res, { ok: true, id });
      } catch (err) {
        log.error("Failed to store push subscription", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // POST /api/push/unsubscribe — remove push subscription
    if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { endpoint } = JSON.parse(body);
        if (!endpoint) return json(res, { error: "endpoint required" }, 400);
        stmtDelete.run(endpoint);
        log.info("Push subscription removed", { endpoint: endpoint.slice(0, 60) });
        return json(res, { ok: true });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // GET /api/push/status — subscription count (for admin)
    if (url.pathname === "/api/push/status" && req.method === "GET") {
      const row = stmtCount.get();
      return json(res, { subscriptions: row?.count || 0 });
    }

    // POST /api/push/test — send a test notification (for debugging)
    if (url.pathname === "/api/push/test" && req.method === "POST") {
      await sendPushToAll({
        title: "Shre AI",
        body: "Push notifications are working!",
        type: "test",
        url: "/",
      });
      return json(res, { ok: true });
    }

    return false;
  }

  return { handlePushRoute, sendPushToAll };
}
