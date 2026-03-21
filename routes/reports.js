// @ts-check
// Scheduled reports — create, list, delete, run, preview, history, and auto-check due reports
import { serviceUrl } from "shre-sdk";
import { randomUUID } from "node:crypto";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} ReportDeps
 * @property {import('shre-sdk').Logger} log
 * @property {import('better-sqlite3').Database} chatDb
 */

/** Day name → JS getDay() value */
const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Validate a schedule string and return a normalized form, or null if invalid.
 * Supported formats:
 *   "daily_8am"           → daily at 08:00 (legacy)
 *   "daily_<hour>"        → daily at <hour>:00, hour 0–23
 *   "weekly_monday"       → weekly on Monday at 08:00 (legacy)
 *   "weekly_<day>"        → weekly on <day> at 08:00
 *   "monthly_1st"         → monthly on the 1st at 08:00 (legacy)
 *   "monthly_<day>"       → monthly on day 1–28 at 08:00
 * @param {string} schedule
 * @returns {string|null} Normalized schedule or null if invalid
 */
function validateSchedule(schedule) {
  if (typeof schedule !== "string") return null;
  const s = schedule.trim().toLowerCase();

  // Legacy formats
  if (s === "daily_8am") return "daily_8";
  if (s === "weekly_monday") return "weekly_monday";
  if (s === "monthly_1st") return "monthly_1";

  // daily_<hour>
  const dailyMatch = s.match(/^daily_(\d{1,2})$/);
  if (dailyMatch) {
    const hour = Number(dailyMatch[1]);
    if (hour >= 0 && hour <= 23) return `daily_${hour}`;
    return null;
  }

  // weekly_<day>
  const weeklyMatch = s.match(/^weekly_([a-z]+)$/);
  if (weeklyMatch) {
    if (DAY_MAP[weeklyMatch[1]] !== undefined) return `weekly_${weeklyMatch[1]}`;
    return null;
  }

  // monthly_<day>
  const monthlyMatch = s.match(/^monthly_(\d{1,2})$/);
  if (monthlyMatch) {
    const day = Number(monthlyMatch[1]);
    if (day >= 1 && day <= 28) return `monthly_${day}`;
    return null;
  }

  return null;
}

/**
 * Parse hour from a schedule string (defaults to 8).
 * @param {string} schedule
 * @returns {number}
 */
function parseHour(schedule) {
  const dailyMatch = schedule.match(/^daily_(\d{1,2})$/);
  if (dailyMatch) return Number(dailyMatch[1]);
  return 8;
}

/**
 * Calculate the next run timestamp (epoch ms) for a given schedule.
 * @param {string} schedule — normalized schedule string
 * @returns {number}
 */
function calcNextRun(schedule) {
  const now = new Date();

  // daily_<hour>
  const dailyMatch = schedule.match(/^daily_(\d{1,2})$/);
  if (dailyMatch) {
    const hour = Number(dailyMatch[1]);
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  // weekly_<day>
  const weeklyMatch = schedule.match(/^weekly_([a-z]+)$/);
  if (weeklyMatch) {
    const targetDay = DAY_MAP[weeklyMatch[1]];
    const hour = 8;
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    const currentDay = next.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead < 0) daysAhead += 7;
    if (daysAhead === 0 && next <= now) daysAhead = 7;
    next.setDate(next.getDate() + daysAhead);
    return next.getTime();
  }

  // monthly_<day>
  const monthlyMatch = schedule.match(/^monthly_(\d{1,2})$/);
  if (monthlyMatch) {
    const targetDate = Number(monthlyMatch[1]);
    const hour = 8;
    const next = new Date(now.getFullYear(), now.getMonth(), targetDate, hour, 0, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next.getTime();
  }

  // Fallback: tomorrow 8am
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(8, 0, 0, 0);
  return fallback.getTime();
}

/**
 * Execute a report query against shre-router and return the response text.
 * @param {string} name — report name
 * @param {string} query — report query
 * @param {import('shre-sdk').Logger} log
 * @returns {Promise<{ text: string, ok: boolean, error?: string }>}
 */
async function executeReportQuery(name, query, log) {
  try {
    const routerRes = await fetch(`${serviceUrl("shre-router")}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "auto",
        max_tokens: 1000,
        messages: [
          { role: "system", content: `You are generating a scheduled report. Be concise and data-focused. Report name: "${name}".` },
          { role: "user", content: query },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!routerRes.ok) {
      const errBody = await routerRes.text().catch(() => "");
      const errorMsg = `shre-router returned ${routerRes.status}: ${errBody.slice(0, 200)}`;
      log.warn("Report query failed", { name, status: routerRes.status });
      return { text: "", ok: false, error: errorMsg };
    }

    let responseText = "";
    const sseText = await routerRes.text();
    for (const line of sseText.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "delta" && evt.text) responseText += evt.text;
      } catch { /* skip malformed SSE lines */ }
    }

    responseText = responseText.trim();
    if (!responseText) {
      return { text: `Report "${name}" could not be generated at this time.`, ok: true };
    }
    return { text: responseText, ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.warn("Report query exception", { name, error: errorMsg });
    return { text: "", ok: false, error: errorMsg };
  }
}

/**
 * Check for due scheduled reports and execute them.
 * @param {import('better-sqlite3').Database} chatDb
 * @param {import('shre-sdk').Logger} log
 * @param {((type: string, data: any) => void)|null} [broadcastFn]
 */
export async function checkDueReports(chatDb, log, broadcastFn) {
  try {
    const now = Date.now();
    const due = chatDb.prepare(
      `SELECT * FROM scheduled_reports WHERE next_run <= ? AND enabled = 1`
    ).all(now);

    if (!due || due.length === 0) return;

    for (const report of due) {
      const runId = randomUUID();
      const startTime = Date.now();

      try {
        log.info("Running scheduled report", { id: report.id, name: report.name, schedule: report.schedule });

        // Record run start
        chatDb.prepare(
          `INSERT INTO report_runs (id, report_id, status, created_at) VALUES (?, ?, 'running', ?)`
        ).run(runId, report.id, startTime);

        const result = await executeReportQuery(report.name, report.query, log);
        const durationMs = Date.now() - startTime;

        if (result.ok) {
          // Record successful run
          chatDb.prepare(
            `UPDATE report_runs SET status = 'completed', result_summary = ?, duration_ms = ? WHERE id = ?`
          ).run(result.text.slice(0, 500), durationMs, runId);

          // Broadcast as notification if there are connected WS clients
          if (broadcastFn) {
            broadcastFn("scheduled_report", {
              reportId: report.id,
              name: report.name,
              content: result.text,
            });
          }
        } else {
          // Record failed run
          chatDb.prepare(
            `UPDATE report_runs SET status = 'failed', error = ?, duration_ms = ? WHERE id = ?`
          ).run(result.error || "Unknown error", durationMs, runId);
        }

        // Update last_run and next_run regardless
        const nextRun = calcNextRun(report.schedule);
        chatDb.prepare(
          `UPDATE scheduled_reports SET last_run = ?, next_run = ? WHERE id = ?`
        ).run(now, nextRun, report.id);

        log.info("Scheduled report completed", { id: report.id, name: report.name, status: result.ok ? "completed" : "failed", nextRun: new Date(nextRun).toISOString() });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Record crash in report_runs
        try {
          chatDb.prepare(
            `UPDATE report_runs SET status = 'failed', error = ?, duration_ms = ? WHERE id = ?`
          ).run(errorMsg, durationMs, runId);
        } catch { /* best-effort */ }
        log.warn("Scheduled report execution failed", { id: report.id, name: report.name, error: errorMsg });
      }
    }
  } catch (err) {
    log.warn("checkDueReports error", {}, err);
  }
}

/**
 * Register report routes.
 * @param {ReportDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerReportRoutes({ log, chatDb }) {

  // Ensure report_runs table exists
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS report_runs (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      result_summary TEXT,
      tokens_used INTEGER,
      duration_ms INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  try {
    chatDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_runs_report ON report_runs(report_id);`);
  } catch { /* index may already exist */ }

  return async function handleReportRoute(req, res, url, { json, collectBody }) {

    // ── POST /api/reports/preview — run a query once without saving ──
    if (url.pathname === "/api/reports/preview" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { name, query } = JSON.parse(body);
        if (!name || typeof name !== "string" || name.length < 1 || name.length > 200) {
          return json(res, { error: "name must be 1-200 characters" }, 400);
        }
        if (!query || typeof query !== "string" || query.length < 1 || query.length > 2000) {
          return json(res, { error: "query must be 1-2000 characters" }, 400);
        }

        const result = await executeReportQuery(name, query, log);
        if (!result.ok) {
          return json(res, { error: result.error || "Report generation failed" }, 502);
        }
        return json(res, { ok: true, name, response: result.text });
      } catch (err) {
        log.error("Report preview error", {}, err);
        return json(res, { error: err.message }, 400);
      }
    }

    // ── POST /api/reports/schedule — create a scheduled report ──
    if (url.pathname === "/api/reports/schedule" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { name, query, schedule, agentId } = JSON.parse(body);

        // Input validation
        if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 200) {
          return json(res, { error: "name must be 1-200 characters" }, 400);
        }
        if (!query || typeof query !== "string" || query.trim().length < 1 || query.trim().length > 2000) {
          return json(res, { error: "query must be 1-2000 characters" }, 400);
        }

        const sched = validateSchedule(schedule);
        if (!sched) {
          return json(res, {
            error: "Invalid schedule. Supported: daily_<hour> (0-23), weekly_<day>, monthly_<day> (1-28), daily_8am, weekly_monday, monthly_1st",
          }, 400);
        }

        const id = randomUUID().replace(/-/g, "").slice(0, 12);
        const now = Date.now();
        const nextRun = calcNextRun(sched);

        chatDb.prepare(
          `INSERT INTO scheduled_reports (id, name, query, schedule, agent_id, next_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, name.trim().slice(0, 200), query.trim().slice(0, 2000), sched, agentId || "shre", nextRun, now);

        log.info("Scheduled report created", { id, name: name.slice(0, 50), schedule: sched, nextRun: new Date(nextRun).toISOString() });
        return json(res, { id, name: name.trim(), schedule: sched, nextRun, enabled: true });
      } catch (err) {
        log.error("Report schedule error", {}, err);
        return json(res, { error: err.message }, 400);
      }
    }

    // ── GET /api/reports — list all scheduled reports ──
    if (url.pathname === "/api/reports" && req.method === "GET") {
      try {
        const reports = chatDb.prepare(
          `SELECT id, name, query, schedule, agent_id, last_run, next_run, enabled, created_at FROM scheduled_reports ORDER BY created_at DESC`
        ).all();
        return json(res, { reports });
      } catch (err) {
        log.error("Report list error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // ── GET /api/reports/:id — get a single report with last run info ──
    const getMatch = url.pathname.match(/^\/api\/reports\/([a-zA-Z0-9]+)$/);
    if (getMatch && req.method === "GET") {
      try {
        const id = getMatch[1];
        const report = chatDb.prepare(
          `SELECT id, name, query, schedule, agent_id, last_run, next_run, enabled, created_at FROM scheduled_reports WHERE id = ?`
        ).get(id);
        if (!report) return json(res, { error: "Report not found" }, 404);

        // Attach last run info
        const lastRun = chatDb.prepare(
          `SELECT id, status, result_summary, tokens_used, duration_ms, error, created_at FROM report_runs WHERE report_id = ? ORDER BY created_at DESC LIMIT 1`
        ).get(id);

        return json(res, { report, lastRun: lastRun || null });
      } catch (err) {
        log.error("Report get error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // ── GET /api/reports/:id/history — execution history for a report ──
    const historyMatch = url.pathname.match(/^\/api\/reports\/([a-zA-Z0-9]+)\/history$/);
    if (historyMatch && req.method === "GET") {
      try {
        const id = historyMatch[1];
        const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
        const runs = chatDb.prepare(
          `SELECT id, report_id, status, result_summary, tokens_used, duration_ms, error, created_at FROM report_runs WHERE report_id = ? ORDER BY created_at DESC LIMIT ?`
        ).all(id, limit);
        return json(res, { runs });
      } catch (err) {
        log.error("Report history error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // ── DELETE /api/reports/:id — remove a report ──
    const deleteMatch = url.pathname.match(/^\/api\/reports\/([a-zA-Z0-9]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      try {
        const id = deleteMatch[1];
        const result = chatDb.prepare(`DELETE FROM scheduled_reports WHERE id = ?`).run(id);
        if (result.changes === 0) return json(res, { error: "Report not found" }, 404);
        // Also clean up run history
        chatDb.prepare(`DELETE FROM report_runs WHERE report_id = ?`).run(id);
        log.info("Scheduled report deleted", { id });
        return json(res, { ok: true, id });
      } catch (err) {
        log.error("Report delete error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    // ── POST /api/reports/:id/run — manually trigger a report ──
    const runMatch = url.pathname.match(/^\/api\/reports\/([a-zA-Z0-9]+)\/run$/);
    if (runMatch && req.method === "POST") {
      try {
        const id = runMatch[1];
        const report = chatDb.prepare(`SELECT * FROM scheduled_reports WHERE id = ?`).get(id);
        if (!report) return json(res, { error: "Report not found" }, 404);

        log.info("Manually running report", { id, name: report.name });

        const runId = randomUUID();
        const startTime = Date.now();

        // Record run start
        chatDb.prepare(
          `INSERT INTO report_runs (id, report_id, status, created_at) VALUES (?, ?, 'running', ?)`
        ).run(runId, id, startTime);

        const result = await executeReportQuery(report.name, report.query, log);
        const durationMs = Date.now() - startTime;

        if (result.ok) {
          chatDb.prepare(
            `UPDATE report_runs SET status = 'completed', result_summary = ?, duration_ms = ? WHERE id = ?`
          ).run(result.text.slice(0, 500), durationMs, runId);
        } else {
          chatDb.prepare(
            `UPDATE report_runs SET status = 'failed', error = ?, duration_ms = ? WHERE id = ?`
          ).run(result.error || "Unknown error", durationMs, runId);
        }

        // Update last_run
        chatDb.prepare(`UPDATE scheduled_reports SET last_run = ? WHERE id = ?`).run(Date.now(), id);

        if (!result.ok) {
          return json(res, { error: result.error || "Report generation failed", runId }, 502);
        }
        return json(res, { ok: true, id, name: report.name, response: result.text, runId, durationMs });
      } catch (err) {
        log.error("Report run error", {}, err);
        return json(res, { error: err.message }, 500);
      }
    }

    return false;
  };
}
