// @ts-check
// Task & issue routes — task creation proxy to shre-tasks, issue creation proxy to MIB007
import { serviceUrl } from "shre-sdk";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} TaskPayload
 * @property {string} title
 * @property {string} [description]
 * @property {string} priority
 * @property {string} source
 * @property {string} created_by
 * @property {string} status
 */

/**
 * @typedef {object} RouteHelpers
 * @property {(res: ServerResponse, data: any, status?: number) => void} json
 * @property {(req: IncomingMessage, maxBytes?: number) => Promise<string>} collectBody
 * @property {(key: string, bucket: string, limit: number, window: number) => { allowed: boolean, retryAfter?: number }} rateLimit
 */

/**
 * Register task routes.
 * @param {{ log: import('shre-sdk').Logger }} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: RouteHelpers) => Promise<boolean|void>}
 */
export function registerTaskRoutes({ log }) {

  return async function handleTaskRoute(req, res, url, { json, collectBody, rateLimit }) {

    // ── Task creation from chat — "remind me to..." / "create task:" proxy ──
    if (url.pathname === "/api/tasks/create" && req.method === "POST") {
      // @ts-ignore -- x-forwarded-for is always a string in practice
      const taskIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const taskRl = rateLimit(taskIp, "task-create", 10, 60_000);
      if (!taskRl.allowed) return json(res, { error: "Too many task creation requests", retryAfter: taskRl.retryAfter }, 429);

      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { title, description, priority, source } = JSON.parse(body);
        if (!title || typeof title !== "string") return json(res, { error: "title required" }, 400);
        const cleanTitle = String(title).replace(/<[^>]*>/g, "").slice(0, 500).trim();
        if (!cleanTitle) return json(res, { error: "title cannot be empty after sanitization" }, 400);
        const cleanDesc = description ? String(description).replace(/<[^>]*>/g, "").slice(0, 2000).trim() : undefined;

        const svcToken = process.env.SHRE_TASKS_TOKEN || "";

        // Route through universal intake endpoint for approval classification
        const intakePayload = {
          title: cleanTitle,
          description: cleanDesc,
          priority: priority || "medium",
          source: "chat",
          requestor: "shre-chat",
          category: "general",
          skip_decompose: true, // simple chat tasks don't need decomposition
        };

        // Forward user context headers for workspace scoping
        const userHeaders = {};
        if (req.headers["authorization"]) userHeaders["Authorization"] = req.headers["authorization"];
        if (req.headers["x-user-id"]) userHeaders["X-User-Id"] = req.headers["x-user-id"];
        if (req.headers["x-workspace-id"]) userHeaders["X-Workspace-Id"] = req.headers["x-workspace-id"];

        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(svcToken ? { Authorization: `Bearer ${svcToken}` } : {}),
            ...userHeaders,
          },
          body: JSON.stringify(intakePayload),
          signal: AbortSignal.timeout(5000),
        });

        if (!taskRes.ok) {
          const errText = await taskRes.text().catch(() => "");
          log.warn("Task creation failed", { status: taskRes.status, error: errText.slice(0, 200) });
          return json(res, { error: "Failed to create task", detail: errText.slice(0, 200) }, taskRes.status);
        }

        const result = await taskRes.json();
        log.info("Task created from chat via intake", { taskId: result.objective_id, title: cleanTitle.slice(0, 50), approval: result.approval_needed });
        // Return in the shape the client expects
        return json(res, { ok: true, task: { id: result.objective_id, title: cleanTitle, status: result.status, approval_needed: result.approval_needed } });
      } catch (e) {
        log.error("Task creation error", {}, e);
        return json(res, { error: e.message }, 400);
      }
    }

    // ── Issue creation from chat — "create an issue:", "file a bug:" proxy to MIB007 ──
    if (url.pathname === "/api/issues/create" && req.method === "POST") {
      const issueIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const issueRl = rateLimit(issueIp, "issue-create", 10, 60_000);
      if (!issueRl.allowed) return json(res, { error: "Too many issue creation requests", retryAfter: issueRl.retryAfter }, 429);

      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { title, description, priority, companyId } = JSON.parse(body);
        if (!title || typeof title !== "string") return json(res, { error: "title required" }, 400);
        const cleanTitle = String(title).replace(/<[^>]*>/g, "").slice(0, 500).trim();
        if (!cleanTitle) return json(res, { error: "title cannot be empty after sanitization" }, 400);
        const cleanDesc = description ? String(description).replace(/<[^>]*>/g, "").slice(0, 2000).trim() : undefined;

        // Resolve company ID: use provided, or fetch the default company
        const mibBase = serviceUrl("mib007");
        let targetCompanyId = companyId;
        if (!targetCompanyId) {
          const companiesRes = await fetch(`${mibBase}/api/companies`, {
            headers: { "X-Service-Source": "shre-chat" },
            signal: AbortSignal.timeout(3000),
          });
          if (companiesRes.ok) {
            const companies = await companiesRes.json();
            targetCompanyId = companies[0]?.id;
          }
        }
        if (!targetCompanyId) return json(res, { error: "No company found — cannot create issue" }, 400);

        const issuePayload = {
          title: cleanTitle,
          description: cleanDesc || `Created from Shre Chat: "${cleanTitle}"`,
          priority: priority || "medium",
          status: "backlog",
        };

        const issueRes = await fetch(`${mibBase}/api/companies/${targetCompanyId}/issues`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Source": "shre-chat",
          },
          body: JSON.stringify(issuePayload),
          signal: AbortSignal.timeout(5000),
        });

        if (!issueRes.ok) {
          const errText = await issueRes.text().catch(() => "");
          log.warn("Issue creation failed", { status: issueRes.status, error: errText.slice(0, 200) });
          return json(res, { error: "Failed to create issue", detail: errText.slice(0, 200) }, issueRes.status);
        }

        const result = await issueRes.json();
        log.info("Issue created from chat", { issueId: result.id, identifier: result.identifier, title: cleanTitle.slice(0, 50) });
        return json(res, { ok: true, issue: result });
      } catch (e) {
        log.error("Issue creation error", {}, e);
        return json(res, { error: e.message }, 400);
      }
    }

    // ── List tasks — proxy to shre-tasks with filters ──
    if (url.pathname === "/api/tasks" && req.method === "GET") {
      try {
        const svcToken = process.env.SHRE_TASKS_TOKEN || "";
        const status = url.searchParams.get("status") || "";
        const limit = url.searchParams.get("limit") || "50";
        const assignee = url.searchParams.get("assignee") || "";
        const priority = url.searchParams.get("priority") || "";
        const since = url.searchParams.get("since") || "";
        const updatedSince = url.searchParams.get("updated_since") || "";

        let queryStr = `?limit=${limit}`;
        if (status) queryStr += `&status=${encodeURIComponent(status)}`;
        if (assignee) queryStr += `&assignee=${encodeURIComponent(assignee)}`;
        if (priority) queryStr += `&priority=${encodeURIComponent(priority)}`;
        if (since) queryStr += `&since=${encodeURIComponent(since)}`;
        if (updatedSince) queryStr += `&updated_since=${encodeURIComponent(updatedSince)}`;

        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks${queryStr}`, {
          headers: {
            ...(svcToken ? { Authorization: `Bearer ${svcToken}` } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!taskRes.ok) {
          const errText = await taskRes.text().catch(() => "");
          return json(res, { error: "Failed to list tasks", detail: errText.slice(0, 200) }, taskRes.status);
        }

        const result = await taskRes.json();
        return json(res, result);
      } catch (e) {
        log.error("Task list error", {}, e);
        return json(res, { error: e.message }, 500);
      }
    }

    // ── Get task details ──
    if (url.pathname.match(/^\/api\/tasks\/[a-zA-Z0-9_-]+$/) && req.method === "GET") {
      const taskId = url.pathname.split("/api/tasks/")[1];
      if (!taskId || taskId === "create") return false; // skip, handled above
      try {
        const svcToken = process.env.SHRE_TASKS_TOKEN || "";
        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks/${encodeURIComponent(taskId)}`, {
          headers: {
            ...(svcToken ? { Authorization: `Bearer ${svcToken}` } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!taskRes.ok) {
          return json(res, { error: "Task not found", status: taskRes.status }, taskRes.status);
        }

        const result = await taskRes.json();
        return json(res, result);
      } catch (e) {
        log.error("Task get error", {}, e);
        return json(res, { error: e.message }, 500);
      }
    }

    // ── Update task ──
    if (url.pathname.match(/^\/api\/tasks\/[a-zA-Z0-9_-]+$/) && req.method === "PATCH") {
      const taskId = url.pathname.split("/api/tasks/")[1];
      if (!taskId) return json(res, { error: "Missing task ID" }, 400);
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const updates = JSON.parse(body);
        // Whitelist allowed update fields
        const allowed = ["title", "description", "status", "priority", "assignee", "due_date", "tags"];
        const cleanUpdates = {};
        for (const key of allowed) {
          if (updates[key] !== undefined) {
            cleanUpdates[key] = typeof updates[key] === "string"
              ? updates[key].replace(/<[^>]*>/g, "").slice(0, 2000).trim()
              : updates[key];
          }
        }

        if (Object.keys(cleanUpdates).length === 0) {
          return json(res, { error: "No valid update fields provided" }, 400);
        }

        const svcToken = process.env.SHRE_TASKS_TOKEN || "";
        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(svcToken ? { Authorization: `Bearer ${svcToken}` } : {}),
          },
          body: JSON.stringify(cleanUpdates),
          signal: AbortSignal.timeout(5000),
        });

        if (!taskRes.ok) {
          const errText = await taskRes.text().catch(() => "");
          return json(res, { error: "Failed to update task", detail: errText.slice(0, 200) }, taskRes.status);
        }

        const result = await taskRes.json();
        log.info("Task updated from chat", { taskId, fields: Object.keys(cleanUpdates) });
        return json(res, { ok: true, task: result });
      } catch (e) {
        log.error("Task update error", {}, e);
        return json(res, { error: e.message }, 400);
      }
    }

    // ── Delete task ──
    if (url.pathname.match(/^\/api\/tasks\/[a-zA-Z0-9_-]+$/) && req.method === "DELETE") {
      const taskId = url.pathname.split("/api/tasks/")[1];
      if (!taskId) return json(res, { error: "Missing task ID" }, 400);
      try {
        const svcToken = process.env.SHRE_TASKS_TOKEN || "";
        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks/${encodeURIComponent(taskId)}`, {
          method: "DELETE",
          headers: {
            ...(svcToken ? { Authorization: `Bearer ${svcToken}` } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!taskRes.ok) {
          return json(res, { error: "Failed to delete task" }, taskRes.status);
        }

        log.info("Task deleted from chat", { taskId });
        return json(res, { ok: true, deleted: taskId });
      } catch (e) {
        log.error("Task delete error", {}, e);
        return json(res, { error: e.message }, 500);
      }
    }

    return false;
  };
}
