// CLI Session Ledger — records all request/response pairs in human-readable + machine-readable formats
// Each CLI session creates: session.json (metadata), ledger.md (transcript), events.jsonl (structured)
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const LEDGER_ROOT = join(homedir(), ".shre", "sessions", "cli");

// ── Session types ──────────────────────────────────────────────────────
// chat     — single conversation, auto-closes on idle
// task     — tied to a shre-tasks task ID, closes on task completion
// project  — long-lived, spans multiple sessions, aggregates context
const VALID_TYPES = ["chat", "task", "project"];

// ── Core functions ─────────────────────────────────────────────────────

/**
 * Create a new session ledger directory with metadata and empty files.
 * Returns { sessionId, sessionDir, ledgerPath, eventsPath, metaPath }
 */
export function createSession({ agentId = "main", type = "chat", title, taskId, projectId } = {}) {
  const sessionId = `cli-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const sessionDir = join(LEDGER_ROOT, sessionId);
  mkdirSync(sessionDir, { recursive: true });

  const now = new Date().toISOString();
  const meta = {
    id: sessionId,
    agentId,
    type: VALID_TYPES.includes(type) ? type : "chat",
    title: title || `CLI Session ${now.slice(0, 16).replace("T", " ")}`,
    status: "active",
    createdAt: now,
    updatedAt: now,
    taskId: taskId || null,
    projectId: projectId || null,
    messageCount: 0,
    totalTokensEstimate: 0,
    totalCost: 0,
  };

  const metaPath = join(sessionDir, "session.json");
  const ledgerPath = join(sessionDir, "ledger.md");
  const eventsPath = join(sessionDir, "events.jsonl");

  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // Initialize ledger with header
  const header = [
    `# CLI Session: ${meta.title}`,
    ``,
    `- **ID:** \`${sessionId}\``,
    `- **Agent:** ${agentId}`,
    `- **Type:** ${type}`,
    `- **Created:** ${now}`,
    ``,
    `---`,
    ``,
  ].join("\n");
  writeFileSync(ledgerPath, header);

  // Write init event to JSONL
  const initEvt = { type: "session_init", sessionId, agentId, sessionType: type, timestamp: now };
  writeFileSync(eventsPath, JSON.stringify(initEvt) + "\n");

  return { sessionId, sessionDir, ledgerPath, eventsPath, metaPath };
}

/**
 * Append a user message to the session ledger.
 * Returns the message ID.
 */
export function appendUserMessage(sessionId, content, { source = "text", voiceTranscript } = {}) {
  const sessionDir = join(LEDGER_ROOT, sessionId);
  if (!existsSync(sessionDir)) throw new Error(`Session not found: ${sessionId}`);

  const msgId = `msg-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();
  const timeLabel = now.slice(11, 19);

  // Append to ledger.md
  const ledgerPath = join(sessionDir, "ledger.md");
  const block = [
    `## [${timeLabel}] User${source === "voice" ? " (voice)" : ""}`,
    ``,
    content,
    ``,
  ].join("\n");
  appendFileSync(ledgerPath, block);

  // Append to events.jsonl
  const eventsPath = join(sessionDir, "events.jsonl");
  const evt = {
    type: "user_message",
    id: msgId,
    timestamp: now,
    source,
    content,
    voiceTranscript: voiceTranscript || null,
  };
  appendFileSync(eventsPath, JSON.stringify(evt) + "\n");

  // Update meta
  updateMeta(sessionId, (meta) => {
    meta.messageCount++;
    meta.updatedAt = now;
  });

  return msgId;
}

/**
 * Append a CLI response to the session ledger.
 * Stores both full response and optional summary.
 */
export function appendCliResponse(sessionId, msgId, fullResponse, {
  model, cost, duration, tools = [], summary,
} = {}) {
  const sessionDir = join(LEDGER_ROOT, sessionId);
  if (!existsSync(sessionDir)) throw new Error(`Session not found: ${sessionId}`);

  const now = new Date().toISOString();
  const timeLabel = now.slice(11, 19);

  // Append to ledger.md
  const ledgerPath = join(sessionDir, "ledger.md");
  const toolSection = tools.length
    ? `\n**Tools used:** ${tools.map((t) => `\`${t.name}\``).join(", ")}\n`
    : "";
  const costLine = cost ? `\n*Cost: $${cost.toFixed(4)} | Model: ${model || "unknown"} | Duration: ${duration || "?"}ms*\n` : "";

  const block = [
    `## [${timeLabel}] Assistant${model ? ` (${model})` : ""}`,
    toolSection,
    fullResponse,
    costLine,
    `---`,
    ``,
  ].join("\n");
  appendFileSync(ledgerPath, block);

  // Append to events.jsonl — store both full and summary
  const eventsPath = join(sessionDir, "events.jsonl");
  const evt = {
    type: "cli_response",
    id: `res-${Date.now()}-${randomUUID().slice(0, 6)}`,
    parentMsgId: msgId,
    timestamp: now,
    model: model || null,
    cost: cost || null,
    duration: duration || null,
    tools,
    content: fullResponse,
    summary: summary || null,
    hasSummary: !!summary,
  };
  appendFileSync(eventsPath, JSON.stringify(evt) + "\n");

  // Update meta
  updateMeta(sessionId, (meta) => {
    meta.messageCount++;
    meta.updatedAt = now;
    meta.totalCost += cost || 0;
  });
}

/**
 * Append tool execution events to the session ledger.
 */
export function appendToolEvent(sessionId, toolName, input, output, { isError = false } = {}) {
  const sessionDir = join(LEDGER_ROOT, sessionId);
  if (!existsSync(sessionDir)) return;

  const eventsPath = join(sessionDir, "events.jsonl");
  const evt = {
    type: "tool_execution",
    timestamp: new Date().toISOString(),
    tool: toolName,
    input: typeof input === "string" ? input.slice(0, 2000) : JSON.stringify(input || {}).slice(0, 2000),
    output: typeof output === "string" ? output.slice(0, 2000) : JSON.stringify(output || {}).slice(0, 2000),
    isError,
  };
  appendFileSync(eventsPath, JSON.stringify(evt) + "\n");
}

/**
 * Store or update the summary for a specific response.
 */
export function setSummary(sessionId, responseId, summary) {
  const sessionDir = join(LEDGER_ROOT, sessionId);
  if (!existsSync(sessionDir)) return false;

  const eventsPath = join(sessionDir, "events.jsonl");
  const content = readFileSync(eventsPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  let updated = false;

  const newLines = lines.map((line) => {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "cli_response" && evt.id === responseId) {
        evt.summary = summary;
        evt.hasSummary = true;
        updated = true;
        return JSON.stringify(evt);
      }
    } catch { /* skip */ }
    return line;
  });

  if (updated) {
    writeFileSync(eventsPath, newLines.join("\n") + "\n");
  }
  return updated;
}

/**
 * Get session metadata.
 */
export function getSession(sessionId) {
  const metaPath = join(LEDGER_ROOT, sessionId, "session.json");
  if (!existsSync(metaPath)) return null;
  return JSON.parse(readFileSync(metaPath, "utf8"));
}

/**
 * Get the full ledger markdown.
 */
export function getLedger(sessionId) {
  const ledgerPath = join(LEDGER_ROOT, sessionId, "ledger.md");
  if (!existsSync(ledgerPath)) return null;
  return readFileSync(ledgerPath, "utf8");
}

/**
 * Get all events from the session (structured data).
 */
export function getEvents(sessionId) {
  const eventsPath = join(LEDGER_ROOT, sessionId, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const content = readFileSync(eventsPath, "utf8");
  return content.split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/**
 * Get messages with optional view mode (full or summary).
 */
export function getMessages(sessionId, { viewMode = "full" } = {}) {
  const events = getEvents(sessionId);
  return events
    .filter((e) => e.type === "user_message" || e.type === "cli_response")
    .map((e) => {
      if (e.type === "cli_response" && viewMode === "summary" && e.hasSummary) {
        return { ...e, displayContent: e.summary, viewMode: "summary" };
      }
      return { ...e, displayContent: e.content, viewMode: "full" };
    });
}

/**
 * Close a session (mark as completed/abandoned).
 */
export function closeSession(sessionId, { reason = "completed" } = {}) {
  return updateMeta(sessionId, (meta) => {
    meta.status = reason === "abandoned" ? "abandoned" : "completed";
    meta.closedAt = new Date().toISOString();
    meta.updatedAt = meta.closedAt;
  });
}

/**
 * List all sessions, optionally filtered.
 */
export function listSessions({ type, status, agentId, limit = 50 } = {}) {
  if (!existsSync(LEDGER_ROOT)) return [];
  const dirs = readdirSync(LEDGER_ROOT).filter((d) => {
    const metaPath = join(LEDGER_ROOT, d, "session.json");
    return existsSync(metaPath);
  });

  let sessions = dirs.map((d) => {
    try {
      return JSON.parse(readFileSync(join(LEDGER_ROOT, d, "session.json"), "utf8"));
    } catch { return null; }
  }).filter(Boolean);

  if (type) sessions = sessions.filter((s) => s.type === type);
  if (status) sessions = sessions.filter((s) => s.status === status);
  if (agentId) sessions = sessions.filter((s) => s.agentId === agentId);

  // Sort by updatedAt descending
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return sessions.slice(0, limit);
}

/**
 * Get or create the active session for an agent.
 * Reuses the most recent "active" session if one exists.
 */
export function getOrCreateActiveSession(agentId, { type = "chat", title, taskId, projectId } = {}) {
  const active = listSessions({ agentId, status: "active", type }).find(Boolean);
  if (active) {
    return {
      sessionId: active.id,
      sessionDir: join(LEDGER_ROOT, active.id),
      ledgerPath: join(LEDGER_ROOT, active.id, "ledger.md"),
      eventsPath: join(LEDGER_ROOT, active.id, "events.jsonl"),
      metaPath: join(LEDGER_ROOT, active.id, "session.json"),
      resumed: true,
    };
  }
  return { ...createSession({ agentId, type, title, taskId, projectId }), resumed: false };
}

/**
 * Generate a context block from session history for CLI prompt injection.
 * This gives Claude CLI memory of the session.
 */
export function buildSessionContext(sessionId, maxMessages = 20) {
  const messages = getMessages(sessionId, { viewMode: "full" });
  if (!messages.length) return "";

  const recent = messages.slice(-maxMessages);
  const lines = recent.map((m) => {
    const role = m.type === "user_message" ? "User" : "Assistant";
    const text = m.content.length > 3000 ? m.content.slice(0, 3000) + "..." : m.content;
    return `[${role}]: ${text}`;
  });

  return `<session_context session_id="${sessionId}">\n${lines.join("\n\n")}\n</session_context>`;
}

// ── Internal helpers ───────────────────────────────────────────────────

function updateMeta(sessionId, mutator) {
  const metaPath = join(LEDGER_ROOT, sessionId, "session.json");
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  mutator(meta);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

// ── HTTP route handler ─────────────────────────────────────────────────

export function registerCliLedgerRoutes({ log }) {
  return async function handleCliLedger(req, res, url) {
    // GET /api/cli/sessions — list sessions
    if (url.pathname === "/api/cli/sessions" && req.method === "GET") {
      const type = url.searchParams.get("type") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const agentId = url.searchParams.get("agentId") || undefined;
      const sessions = listSessions({ type, status, agentId });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(sessions));
      return true;
    }

    // GET /api/cli/sessions/:id — get session detail
    if (url.pathname.match(/^\/api\/cli\/sessions\/[^/]+$/) && req.method === "GET") {
      const sessionId = url.pathname.split("/").pop();
      const session = getSession(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return true;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(session));
      return true;
    }

    // GET /api/cli/sessions/:id/ledger — get markdown transcript
    if (url.pathname.match(/^\/api\/cli\/sessions\/[^/]+\/ledger$/) && req.method === "GET") {
      const sessionId = url.pathname.split("/").slice(-2, -1)[0];
      const ledger = getLedger(sessionId);
      if (!ledger) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Ledger not found" }));
        return true;
      }
      const format = url.searchParams.get("format");
      if (format === "json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content: ledger }));
      } else {
        res.writeHead(200, { "Content-Type": "text/markdown" });
        res.end(ledger);
      }
      return true;
    }

    // GET /api/cli/sessions/:id/messages — get messages with view mode
    if (url.pathname.match(/^\/api\/cli\/sessions\/[^/]+\/messages$/) && req.method === "GET") {
      const sessionId = url.pathname.split("/").slice(-2, -1)[0];
      const viewMode = url.searchParams.get("view") || "full";
      const messages = getMessages(sessionId, { viewMode });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(messages));
      return true;
    }

    // POST /api/cli/sessions/:id/close — close a session
    if (url.pathname.match(/^\/api\/cli\/sessions\/[^/]+\/close$/) && req.method === "POST") {
      const sessionId = url.pathname.split("/").slice(-2, -1)[0];
      const meta = closeSession(sessionId);
      if (!meta) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return true;
      }
      log.info(`[cli-ledger] Session closed: ${sessionId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(meta));
      return true;
    }

    // POST /api/cli/sessions/:id/summary — generate summary for a response
    if (url.pathname.match(/^\/api\/cli\/sessions\/[^/]+\/summary$/) && req.method === "POST") {
      const sessionId = url.pathname.split("/").slice(-2, -1)[0];
      try {
        const body = await collectBodyStr(req);
        const { responseId, content } = JSON.parse(body);
        if (!responseId || !content) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "responseId and content required" }));
          return true;
        }

        // Generate summary via shre-router (routes to local Ollama for speed)
        const summary = await generateSummary(content, log);
        if (summary) {
          setSummary(sessionId, responseId, summary);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ summary: summary || content.slice(0, 500) + "..." }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    return false; // not handled
  };
}

// ── Summary generation via shre-router ─────────────────────────────────

async function generateSummary(content, log) {
  try {
    const { serviceUrl } = await import("shre-sdk");
    const routerUrl = serviceUrl("shre-router");
    const res = await fetch(`${routerUrl}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "auto",
        agentId: "system",
        messages: [
          {
            role: "system",
            content: "You are a concise summarizer. Summarize the following AI assistant response in 2-4 bullet points, focusing on what was done, what changed, and any important outcomes. Keep it under 200 words.",
          },
          { role: "user", content: content.slice(0, 8000) },
        ],
        metadata: { taskType: "summarization", channel: "cli-ledger" },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      log.warn("[cli-ledger] Summary generation failed:", res.status);
      return null;
    }

    const data = await res.json();
    return data.content?.[0]?.text || data.message?.content || data.choices?.[0]?.message?.content || null;
  } catch (err) {
    log.warn("[cli-ledger] Summary generation error:", err.message);
    return null;
  }
}

function collectBodyStr(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
