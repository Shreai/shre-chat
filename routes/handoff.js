// @ts-check
// Agent handoff routes — seamless agent switches mid-conversation with context preserved
import { randomUUID } from "node:crypto";
import { AGENT_ALIASES, resolveAgentId } from "./voice.js";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} HandoffDeps
 * @property {import('shre-sdk').Logger} log
 * @property {import('better-sqlite3').Database} chatDb
 */

const KNOWN_AGENTS = new Set(Object.values(AGENT_ALIASES));
const HANDOFF_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_LAST_MESSAGES = 50;
const MAX_SUMMARY_CHARS = 5000;

/**
 * Validate lastMessages array: must be array of {role, content} objects.
 * Returns sanitized array or null if invalid.
 * @param {any} msgs
 * @returns {{ valid: true, messages: Array<{role: string, content: string}> } | { valid: false, error: string }}
 */
function validateLastMessages(msgs) {
  if (!Array.isArray(msgs)) return { valid: false, error: "lastMessages must be an array" };
  if (msgs.length > MAX_LAST_MESSAGES) return { valid: false, error: `lastMessages exceeds max of ${MAX_LAST_MESSAGES}` };

  const validated = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m || typeof m !== "object") return { valid: false, error: `lastMessages[${i}] is not an object` };
    if (typeof m.role !== "string" || !m.role) return { valid: false, error: `lastMessages[${i}].role must be a non-empty string` };
    if (typeof m.content !== "string") return { valid: false, error: `lastMessages[${i}].content must be a string` };
    validated.push({ role: m.role.slice(0, 20), content: m.content.slice(0, 2000) });
  }
  return { valid: true, messages: validated };
}

/**
 * Register handoff routes.
 * @param {HandoffDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerHandoffRoutes({ log, chatDb }) {

  // ── DB schema validation at init ──
  let dbReady = false;
  try {
    const tables = chatDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = 'handoffs'`
    ).all();
    if (tables.length > 0) {
      dbReady = true;
      // Add expires_at column if missing (migration-safe)
      try {
        chatDb.prepare(`SELECT expires_at FROM handoffs LIMIT 0`).run();
      } catch {
        chatDb.exec(`ALTER TABLE handoffs ADD COLUMN expires_at INTEGER`);
        log.info("Handoff DB: added expires_at column");
      }
    } else {
      log.warn("Handoff DB: handoffs table missing — routes will return errors");
    }
  } catch (err) {
    log.warn("Handoff DB schema check failed", {}, err);
  }

  // ── Auto-expire stale handoffs every 60s ──
  const expireInterval = setInterval(() => {
    if (!dbReady) return;
    try {
      const now = Date.now();
      chatDb.prepare(
        `UPDATE handoffs SET status = 'expired' WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`
      ).run(now);
    } catch { /* non-fatal */ }
  }, 60_000);
  expireInterval.unref?.();

  return async function handleHandoffRoute(req, res, url, { json, collectBody }) {

    // ── POST /api/handoff — initiate an agent handoff ──
    if (url.pathname === "/api/handoff" && req.method === "POST") {
      if (!dbReady) return json(res, { error: "Handoff service unavailable" }, 503);

      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { fromAgentId, toAgentId, reason, conversationSummary, lastMessages } = JSON.parse(body);
        if (!fromAgentId || typeof fromAgentId !== "string") return json(res, { error: "fromAgentId required" }, 400);
        if (!toAgentId || typeof toAgentId !== "string") return json(res, { error: "toAgentId required" }, 400);

        // ── Agent validation — resolve aliases and reject unknown agents ──
        const resolvedFrom = resolveAgentId(fromAgentId);
        const resolvedTo = resolveAgentId(toAgentId);
        if (!KNOWN_AGENTS.has(resolvedFrom)) return json(res, { error: `Unknown fromAgentId: "${fromAgentId}"` }, 400);
        if (!KNOWN_AGENTS.has(resolvedTo)) return json(res, { error: `Unknown toAgentId: "${toAgentId}"` }, 400);

        // ── Context validation ──
        const msgResult = validateLastMessages(lastMessages || []);
        if (!msgResult.valid) return json(res, { error: msgResult.error }, 400);

        const summary = typeof conversationSummary === "string"
          ? conversationSummary.slice(0, MAX_SUMMARY_CHARS)
          : "";

        const id = randomUUID().replace(/-/g, "").slice(0, 16);
        const now = Date.now();
        const expiresAt = now + HANDOFF_TTL_MS;

        // Serialize context: last messages + any extra metadata
        const context = JSON.stringify({
          lastMessages: msgResult.messages.slice(-20),
          summary,
        });

        chatDb.prepare(
          `INSERT INTO handoffs (id, from_agent, to_agent, reason, summary, context, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).run(id, resolvedFrom.slice(0, 100), resolvedTo.slice(0, 100), (reason || "").slice(0, 500), summary, context, now, expiresAt);

        log.info("Handoff created", { handoffId: id, from: resolvedFrom, to: resolvedTo, reason: (reason || "").slice(0, 80), expiresAt });

        return json(res, {
          handoffId: id,
          fromAgent: resolvedFrom,
          toAgent: resolvedTo,
          status: "pending",
          reason: (reason || "").slice(0, 500),
          summary,
          context: { lastMessages: msgResult.messages.slice(-20), summary },
          expiresAt,
        });
      } catch (err) {
        log.error("Handoff creation error", {}, err);
        return json(res, { error: err.message }, 400);
      }
    }

    // ── GET /api/handoff/history — recent handoffs ──
    if (url.pathname === "/api/handoff/history" && req.method === "GET") {
      if (!dbReady) return json(res, { handoffs: [] });
      try {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 50);
        const handoffs = chatDb.prepare(
          `SELECT id, from_agent, to_agent, reason, summary, status, created_at, expires_at
           FROM handoffs ORDER BY created_at DESC LIMIT ?`
        ).all(limit);

        const now = Date.now();
        const result = handoffs.map(h => ({
          handoffId: h.id,
          fromAgent: h.from_agent,
          toAgent: h.to_agent,
          reason: h.reason,
          summary: h.summary,
          status: (h.status === "pending" && h.expires_at && h.expires_at < now) ? "expired" : h.status,
          createdAt: h.created_at,
          expiresAt: h.expires_at,
        }));

        return json(res, { handoffs: result });
      } catch (err) {
        log.error("Handoff history error", {}, err);
        return json(res, { handoffs: [] });
      }
    }

    // ── GET /api/handoff/:id — get handoff context (used by receiving agent) ──
    const getMatch = url.pathname.match(/^\/api\/handoff\/([a-zA-Z0-9]+)$/);
    if (getMatch && req.method === "GET") {
      if (!dbReady) return json(res, { error: "Handoff service unavailable" }, 503);
      try {
        const id = getMatch[1];
        const handoff = chatDb.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(id);
        if (!handoff) return json(res, { error: "Handoff not found" }, 404);

        // ── TTL check — return 410 Gone if expired ──
        const now = Date.now();
        if (handoff.expires_at && handoff.expires_at < now) {
          if (handoff.status === "pending") {
            chatDb.prepare(`UPDATE handoffs SET status = 'expired' WHERE id = ?`).run(id);
          }
          return json(res, { error: "Handoff expired", handoffId: id, status: "expired" }, 410);
        }

        // Mark as accepted
        if (handoff.status === "pending") {
          chatDb.prepare(`UPDATE handoffs SET status = 'accepted' WHERE id = ?`).run(id);
        }

        let parsedContext = {};
        try { parsedContext = JSON.parse(handoff.context || "{}"); } catch {}

        return json(res, {
          handoffId: handoff.id,
          fromAgent: handoff.from_agent,
          toAgent: handoff.to_agent,
          reason: handoff.reason,
          summary: handoff.summary,
          context: parsedContext,
          status: "accepted",
          createdAt: handoff.created_at,
          expiresAt: handoff.expires_at,
        });
      } catch (err) {
        log.error("Handoff get error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    return false;
  };
}
