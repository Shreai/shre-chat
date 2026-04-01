// @ts-check
// Notification routes — cross-app real-time notifications in chat
// Subscribes to Redis event bus for task/service/agent events and stores in SQLite
import { randomUUID } from "node:crypto";

/**
 * @typedef {object} NotificationDeps
 * @property {import('shre-sdk').Logger} log
 * @property {import('shre-sdk').EventBus} eventBus
 * @property {import('better-sqlite3').Database} chatDb
 */

/** Event type → human-readable formatter */
const EVENT_FORMATTERS = {
  "task.completed": (data) => ({
    type: "task.completed",
    title: `Agent finished: ${data.title || data.task_title || "task"}`,
    body: data.summary || data.agent || null,
    source: data.agent || "fleet",
  }),
  "task.failed": (data) => ({
    type: "task.failed",
    title: `Task failed: ${data.title || data.task_title || "task"}`,
    body: data.reason || data.error || null,
    source: data.agent || "fleet",
  }),
  "task.started": (data) => ({
    type: "task.started",
    title: `Agent picked up: ${data.title || data.task_title || "task"}`,
    body: data.agent ? `Assigned to ${data.agent}` : null,
    source: data.agent || "fleet",
  }),
  "task.assigned": (data) => ({
    type: "task.assigned",
    title: `Task assigned: ${data.title || data.task_title || "task"}`,
    body: data.agent ? `Assigned to ${data.agent}` : null,
    source: data.assigned_by || "fleet",
  }),
  "task.unblocked": (data) => ({
    type: "task.unblocked",
    title: `Task unblocked: ${data.title || data.task_title || "task"}`,
    body: data.reason || "Dependencies resolved",
    source: data.agent || "fleet",
  }),
  "service.unhealthy": (data) => ({
    type: "service.unhealthy",
    title: `${data.service || data.name || "Service"} is down`,
    body: data.reason || data.error || null,
    source: data.service || "monitor",
  }),
  "service.started": (data) => ({
    type: "service.started",
    title: `${data.service || data.name || "Service"} is back up`,
    body: null,
    source: data.service || "monitor",
  }),
  "agent.quality_alert": (data) => ({
    type: "agent.quality_alert",
    title: `Quality score dropped on ${data.task || data.title || "task"}`,
    body: data.score != null ? `Score: ${data.score}` : null,
    source: data.agent || "scorer",
  }),
  "fleet.agent_status": (data) => ({
    type: "fleet.agent_status",
    title: `Agent ${data.name || data.agent || "unknown"} went ${data.status || "offline"}`,
    body: null,
    source: "fleet",
  }),
  "anomaly.dispatched": (data) => ({
    type: "anomaly.dispatched",
    title: `Auto-dispatched: ${data.anomaly_type || "anomaly"} → ${data.agent || "agent"}`,
    body: data.message || data.title || null,
    source: "monitor",
  }),
  "prediction.alert.fired": (data) => ({
    type: "prediction.alert.fired",
    title: `${data.severity === "critical" ? "🚨" : "⚠️"} ${data.message || `Alert: ${data.metric}`}`,
    body: data.diagnostic
      ? `${data.diagnostic.suggestedActions?.[0] || ""} | Confidence: ${Math.round((data.confidence?.score || 0) * 100)}%`
      : `Value: ${data.value}${data.threshold != null ? ` (threshold: ${data.threshold})` : ""}`,
    source: "prediction",
  }),
  "prediction.alert.acknowledged": (data) => ({
    type: "prediction.alert.acknowledged",
    title: `Alert acknowledged: ${data.metric}`,
    body: null,
    source: "prediction",
  }),
};

/**
 * Default formatter for unrecognized event types.
 * @param {string} eventType
 * @param {any} data
 * @returns {{ type: string, title: string, body: string|null, source: string }}
 */
function defaultFormatter(eventType, data) {
  const name = data.title || data.name || data.service || data.agent || eventType;
  return {
    type: eventType,
    title: `${eventType}: ${name}`,
    body: data.summary || data.message || data.reason || null,
    source: data.source || data.service || data.agent || "system",
  };
}

/**
 * Register notification routes.
 * @param {NotificationDeps} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerNotificationRoutes({ log, eventBus, chatDb }) {
  // Prepared statements
  const stmtInsert = chatDb.prepare(`
    INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `);
  const stmtGetRecent = chatDb.prepare(`
    SELECT id, type, title, body, source, read, created_at FROM notifications
    WHERE created_at > ? ORDER BY created_at DESC LIMIT ?
  `);
  const stmtMarkRead = chatDb.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`);
  const stmtUnreadCount = chatDb.prepare(`SELECT COUNT(*) as count FROM notifications WHERE read = 0`);
  const stmtUnreadByType = chatDb.prepare(`SELECT type, COUNT(*) as count FROM notifications WHERE read = 0 GROUP BY type`);
  const stmtPrune = chatDb.prepare(`DELETE FROM notifications WHERE created_at < ?`);
  const stmtDelete = chatDb.prepare(`DELETE FROM notifications WHERE id = ?`);
  const stmtMarkReadBulk = chatDb.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`);

  // Transactions for bulk operations
  const txMarkReadBulk = chatDb.transaction((/** @type {string[]} */ ids) => {
    for (const id of ids) stmtMarkReadBulk.run(id);
  });
  const txDeleteBulk = chatDb.transaction((/** @type {string[]} */ ids) => {
    for (const id of ids) stmtDelete.run(id);
  });

  // ── Event debouncing (100ms window) ──
  /** @type {{ eventType: string, data: any }[]} */
  let eventBuffer = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let debounceTimer = null;

  function flushEventBuffer() {
    if (eventBuffer.length === 0) return;
    const batch = eventBuffer;
    eventBuffer = [];
    debounceTimer = null;

    const txInsertBatch = chatDb.transaction((/** @type {typeof batch} */ events) => {
      for (const { eventType, data } of events) {
        try {
          const formatter = EVENT_FORMATTERS[eventType];
          const notification = formatter
            ? formatter(typeof data === "string" ? { title: data } : data)
            : defaultFormatter(eventType, typeof data === "string" ? { title: data } : data);
          const id = randomUUID();
          stmtInsert.run(id, notification.type, notification.title, notification.body, notification.source, Date.now());
          log.debug("Notification stored", { id, type: notification.type });
        } catch (err) {
          log.error("Failed to store notification", { eventType }, err);
        }
      }
    });

    try {
      txInsertBatch(batch);
    } catch (err) {
      log.error("Failed to flush notification batch", { count: batch.length }, err);
    }
  }

  function enqueueEvent(eventType, data) {
    eventBuffer.push({ eventType, data });
    if (!debounceTimer) {
      debounceTimer = setTimeout(flushEventBuffer, 100);
    }
  }

  // Subscribe to known event types
  const unsubs = [];
  for (const eventType of Object.keys(EVENT_FORMATTERS)) {
    const unsub = eventBus.subscribe(eventType, (event) => {
      const data = event.data || event.payload || event;
      enqueueEvent(eventType, data);
    });
    unsubs.push(unsub);
  }

  // Also subscribe to a wildcard or common additional events with default formatter
  // (additional event types arriving via the known subscriptions are handled above;
  //  the default formatter handles any event type passed to enqueueEvent)

  // Prune old notifications on startup (older than 7 days)
  // Also cap repetitive escalation notifications — keep only 5 most recent per type
  try {
    stmtPrune.run(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Prune escalation noise: keep only the 5 most recent per noisy type
    for (const noisyType of ['ellie.escalation', 'ellie.failed', 'error.escalation']) {
      chatDb.prepare(`
        DELETE FROM notifications WHERE type = ? AND id NOT IN (
          SELECT id FROM notifications WHERE type = ? ORDER BY created_at DESC LIMIT 5
        )
      `).run(noisyType, noisyType);
    }
  } catch (err) {
    log.warn("Failed to prune old notifications on startup", {}, err);
  }

  // Diversified query: fetch latest per type to avoid one noisy type burying others
  const stmtGetDiversified = chatDb.prepare(`
    SELECT id, type, title, body, source, read, created_at FROM notifications
    WHERE created_at > ? ORDER BY created_at DESC LIMIT ?
  `);

  return async function handleNotificationRoute(req, res, url, { json, collectBody }) {
    // GET /api/notifications?since=<timestamp>&limit=20
    if (url.pathname === "/api/notifications" && req.method === "GET") {
      const since = Number(url.searchParams.get("since")) || 0;
      const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
      try {
        // Fetch 3x the limit then deduplicate by type — ensure each type gets representation
        const rows = stmtGetDiversified.all(since, limit * 3);
        /** @type {Map<string, typeof rows>} */
        const byType = new Map();
        for (const r of rows) {
          if (!byType.has(r.type)) byType.set(r.type, []);
          byType.get(r.type).push(r);
        }
        // Round-robin: take up to 3 per type, then fill remaining with newest
        /** @type {Set<string>} */
        const pickedIds = new Set();
        const picked = [];
        const maxPerType = Math.max(3, Math.floor(limit / byType.size) || 3);
        for (const [, typeRows] of byType) {
          for (const r of typeRows.slice(0, maxPerType)) {
            if (picked.length < limit) {
              picked.push(r);
              pickedIds.add(r.id);
            }
          }
        }
        // Fill remaining slots with newest not yet picked
        if (picked.length < limit) {
          for (const r of rows) {
            if (picked.length >= limit) break;
            if (!pickedIds.has(r.id)) {
              picked.push(r);
              pickedIds.add(r.id);
            }
          }
        }
        // Sort final result by created_at descending
        picked.sort((a, b) => b.created_at - a.created_at);
        return json(res, { notifications: picked.map(r => ({
          id: r.id,
          type: r.type,
          title: r.title,
          body: r.body,
          source: r.source,
          read: !!r.read,
          createdAt: r.created_at,
        }))});
      } catch (err) {
        log.error("Failed to fetch notifications", {}, err);
        return json(res, { notifications: [] });
      }
    }

    // PATCH /api/notifications/:id/read
    if (url.pathname.match(/^\/api\/notifications\/[^/]+\/read$/) && req.method === "PATCH") {
      const id = url.pathname.split("/")[3];
      try {
        stmtMarkRead.run(id);
        return json(res, { ok: true });
      } catch (err) {
        log.error("Failed to mark notification read", { id }, err);
        return json(res, { error: "Failed to mark read" }, 500);
      }
    }

    // POST /api/notifications/mark-read — bulk mark as read
    if (url.pathname === "/api/notifications/mark-read" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { ids } = JSON.parse(body);
        if (!Array.isArray(ids) || ids.length === 0) {
          return json(res, { error: "ids must be a non-empty array" }, 400);
        }
        if (ids.length > 500) {
          return json(res, { error: "Maximum 500 ids per request" }, 400);
        }
        txMarkReadBulk(ids);
        return json(res, { ok: true, count: ids.length });
      } catch (err) {
        log.error("Failed to bulk mark notifications read", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // DELETE /api/notifications/bulk — bulk delete
    if (url.pathname === "/api/notifications/bulk" && req.method === "DELETE") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { ids } = JSON.parse(body);
        if (!Array.isArray(ids) || ids.length === 0) {
          return json(res, { error: "ids must be a non-empty array" }, 400);
        }
        if (ids.length > 500) {
          return json(res, { error: "Maximum 500 ids per request" }, 400);
        }
        txDeleteBulk(ids);
        return json(res, { ok: true, count: ids.length });
      } catch (err) {
        log.error("Failed to bulk delete notifications", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // DELETE /api/notifications/:id — delete single notification
    const deleteMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const id = deleteMatch[1];
      try {
        const result = stmtDelete.run(id);
        if (result.changes === 0) return json(res, { error: "Notification not found" }, 404);
        return json(res, { ok: true, id });
      } catch (err) {
        log.error("Failed to delete notification", { id }, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // GET /api/notifications/unread-count — with breakdown by type
    if (url.pathname === "/api/notifications/unread-count" && req.method === "GET") {
      try {
        const row = stmtUnreadCount.get();
        const typeRows = stmtUnreadByType.all();
        /** @type {Record<string, number>} */
        const byType = {};
        for (const r of typeRows) {
          byType[r.type] = r.count;
        }
        return json(res, { count: row?.count || 0, byType });
      } catch (err) {
        log.error("Failed to count unread notifications", {}, err);
        return json(res, { count: 0, byType: {} });
      }
    }

    return false;
  };
}
