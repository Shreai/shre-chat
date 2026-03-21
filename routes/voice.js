// @ts-check
// Voice routes — voice-command (intent classification) + voice-assist (non-streaming chat)
import { serviceUrl } from "shre-sdk";
import { randomUUID } from "node:crypto";
import { classifyIntent, learnIntent, getTargetForIntent, getTopShortcuts } from "./intent-router.js";
import { chunkIntoSentences, scoreRelevance, assembleContext, detectStoreReferences } from "./voice-context.js";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} VoiceDeps
 * @property {import('shre-sdk').Logger} log
 * @property {string} OPENCLAW_HOST
 * @property {number|string} OPENCLAW_PORT
 * @property {string} GATEWAY_TOKEN
 * @property {import('better-sqlite3').Database} chatDb
 */

/**
 * @typedef {object} VoiceCommandResult
 * @property {string|null} action - "task_created" | "task_list" | "task_error" | "digest" | "digest_error" | "clarify" | null
 * @property {string} [spoken] - text-to-speech response
 * @property {string} [transcript] - raw data transcript (when different from spoken)
 * @property {any} [task] - created task object
 * @property {any[]} [tasks] - task list
 * @property {any} [digest] - digest data
 * @property {string} [mib007Link] - deep link into MIB007 UI
 */

/**
 * @typedef {object} IntentClassification
 * @property {"task_create"|"task_list"|"digest"|"data_query"|"project"|"clarify"|"none"} intent
 * @property {string} [title]
 * @property {string} [priority]
 * @property {string} [question]
 */

// ── Shared agent alias map ──
export const AGENT_ALIASES = {
  engineering: "founding-engineer",
  engineer: "founding-engineer",
  security: "guardian",
  support: "rapidrms-support",
  data: "rapidrms-admin",
  marketing: "herald",
  finance: "ledger",
  design: "weaver",
  ops: "pulse",
  operations: "pulse",
  architecture: "architect",
  architect: "architect",
  guardian: "guardian",
  "founding-engineer": "founding-engineer",
  "founding-architect": "founding-architect",
  "founding-security": "founding-security",
  "rapidrms-support": "rapidrms-support",
  "rapidrms-admin": "rapidrms-admin",
  "ops-manager": "ops-manager",
  herald: "herald",
  ledger: "ledger",
  weaver: "weaver",
  pulse: "pulse",
  shre: "shre",
  ellie: "ellie",
  nova: "nova",
  main: "main",
};

const KNOWN_AGENTS = new Set(Object.values(AGENT_ALIASES));

/**
 * Resolve agent name with fuzzy matching against known aliases.
 * @param {string} raw - raw agent name from user input
 * @returns {string} resolved agent ID
 */
export function resolveAgentId(raw) {
  const cleaned = (raw || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (AGENT_ALIASES[cleaned]) return AGENT_ALIASES[cleaned];
  // Fuzzy: check if raw is a substring of any known agent
  for (const [alias, id] of Object.entries(AGENT_ALIASES)) {
    if (alias.includes(cleaned) || cleaned.includes(alias)) return id;
  }
  return "main"; // fallback
}

/**
 * Extract balanced JSON from AI text, handling markdown fences and greedy braces.
 * @param {string} text
 * @returns {string|null}
 */
function extractJSON(text) {
  // Strip markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text;

  // Find the first '{' and its balanced '}'
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") depth--;
    if (depth === 0) return cleaned.slice(start, i + 1);
  }
  return null; // unbalanced
}

/**
 * Validate prompt string: must be non-empty string under 10000 chars.
 * @param {any} prompt
 * @returns {string|null} error message or null if valid
 */
function validatePrompt(prompt) {
  if (typeof prompt !== "string") return "prompt must be a string";
  if (prompt.length === 0) return "prompt must not be empty";
  if (prompt.length > 10000) return "prompt exceeds maximum length (10000 chars)";
  return null;
}

/**
 * Register voice routes.
 * @param {VoiceDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerVoiceRoutes({ log, OPENCLAW_HOST, OPENCLAW_PORT, GATEWAY_TOKEN, chatDb }) {

  // ── DB schema validation at init ──
  let dbReady = false;
  try {
    const requiredTables = ["voice_intents", "voice_sessions", "voice_audit_log", "voice_turns", "voice_actions"];
    const tables = chatDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map(() => "?").join(",")})`
    ).all(...requiredTables);
    const tableNames = new Set(tables.map(t => t.name));
    const missing = requiredTables.filter(t => !tableNames.has(t));
    if (missing.length === 0) {
      dbReady = true;
    } else {
      log.warn("Voice DB tables missing — DB operations will be skipped", { missing });
    }
  } catch (err) {
    log.warn("Voice DB schema check failed — DB operations will be skipped", {}, err);
  }

  // ── Audit logging helper ──
  const auditLog = (sessionId, eventType, direction, payload, extra = {}) => {
    if (!dbReady) return;
    try {
      chatDb.prepare(
        `INSERT INTO voice_audit_log (id, session_id, event_type, direction, payload, latency_ms, model, tokens_in, tokens_out, agent_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(), sessionId || null, eventType, direction,
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        extra.latencyMs || null, extra.model || null,
        extra.tokensIn || null, extra.tokensOut || null,
        extra.agentId || null, Date.now()
      );
    } catch (err) {
      log.warn("Audit log write failed", { eventType }, err);
    }
  };

  // ── Voice turn persistence (full content, no truncation) ──
  const saveTurn = (sessionId, role, content, phase, actionType, actionResult) => {
    if (!dbReady) return;
    try {
      chatDb.prepare(
        `INSERT INTO voice_turns (id, session_id, role, content, phase, action_type, action_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), sessionId, role, content, phase || null, actionType || null, actionResult || null, Date.now());
    } catch {}
  };

  // ── Voice action tracking ──
  const saveAction = (sessionId, turnId, actionType, target, payload, result, status) => {
    if (!dbReady) return;
    try {
      chatDb.prepare(
        `INSERT INTO voice_actions (id, session_id, turn_id, action_type, target, payload, result, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), sessionId, turnId || null, actionType, target || null,
        typeof payload === 'string' ? payload : JSON.stringify(payload || null),
        typeof result === 'string' ? result : JSON.stringify(result || null),
        status || 'completed', Date.now());
    } catch {}
  };

  return async function handleVoiceRoute(req, res, url, { json, collectBody }) {

    // ── Voice Command — detect actionable intents and execute them ──
    if (url.pathname === "/api/voice-command" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const parsed = JSON.parse(body);
        const { prompt } = parsed;

        // ── Input validation ──
        const promptErr = validatePrompt(prompt);
        if (promptErr) return json(res, { error: promptErr }, 400);

          auditLog(null, 'voice_command_request', 'in', { prompt: prompt.slice(0, 2000) });

        const text = prompt.trim();
        const lower = text.toLowerCase();

        const tasksToken = process.env.SHRE_TASKS_TOKEN || "";
        const fwdAuth = tasksToken ? { Authorization: `Bearer ${tasksToken}` } : {};

        // ── Check learned patterns first (sub-1ms) ──
        if (dbReady) {
          try {
            const learned = classifyIntent(text, chatDb);
            if (learned) {
              log.info("Voice intent: learned pattern match", { pattern: learned.normalized, intent: learned.intent, hits: learned.hit_count });

              // Route based on learned intent
              if (learned.intent === "task_create" && learned.params?.title) {
                const title = learned.params.title;
                const priority = learned.params?.priority || "medium";
                try {
                  const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/intake`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...fwdAuth },
                    body: JSON.stringify({ title, priority, source: "chat", requestor: "voice-assistant", category: "general", skip_decompose: true }),
                    signal: AbortSignal.timeout(5000),
                  });
                  if (taskRes.ok) {
                    const task = await taskRes.json();
                    return json(res, { action: "task_created", spoken: `Got it! I've created a task: "${title}".`, transcript: `Task created: ${title} [${priority}]`, task: { id: task.objective_id, title }, mib007Link: "/SHR/tasks" });
                  }
                } catch (err) {
                  log.warn("Learned intent task_create failed", {}, err);
                }
              } else if (learned.intent === "task_list") {
                try {
                  const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=created,todo,in_progress,started&limit=10`, { headers: { ...fwdAuth }, signal: AbortSignal.timeout(5000) });
                  if (taskRes.ok) {
                    const data = await taskRes.json();
                    const tasks = data.tasks || data || [];
                    if (tasks.length === 0) return json(res, { action: "task_list", spoken: "You're all clear! No pending tasks right now.", transcript: "0 pending tasks", tasks: [], mib007Link: "/SHR/tasks" });
                    const taskLines = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}${t.priority === "high" || t.priority === "critical" ? " — urgent" : ""}`);
                    const transcript = taskLines.join("\n");
                    return json(res, { action: "task_list", spoken: `You have ${tasks.length} pending task${tasks.length === 1 ? "" : "s"}. ${taskLines.join(". ")}.`, transcript, tasks, mib007Link: "/SHR/tasks" });
                  }
                } catch (err) {
                  log.warn("Learned intent task_list failed", {}, err);
                }
              } else if (learned.intent === "digest" || learned.intent === "status") {
                try {
                  const digestRes = await fetch(`${serviceUrl("shre-tasks")}/v1/digest`, { headers: { ...fwdAuth }, signal: AbortSignal.timeout(5000) });
                  if (digestRes.ok) {
                    const digest = await digestRes.json();
                    const active = digest.activeProjects || 0;
                    const pending = digest.pendingTasks || 0;
                    const completed = digest.completedToday || 0;
                    const blocked = digest.blockedTasks || 0;
                    const transcript = `Active: ${active}, Pending: ${pending}, Completed today: ${completed}, Blocked: ${blocked}`;
                    return json(res, {
                      action: "digest",
                      spoken: `Here's your status update. You have ${active} active project${active === 1 ? "" : "s"}, ${pending} pending task${pending === 1 ? "" : "s"}, and ${completed} completed today.${blocked > 0 ? ` ${blocked} task${blocked === 1 ? " is" : "s are"} blocked.` : ""}`,
                      transcript,
                      digest,
                    });
                  }
                } catch (err) {
                  log.warn("Learned intent digest failed", {}, err);
                }
              } else if (learned.intent === "data_query") {
                // Data queries fall through to voice-assist (returns null) — include store references
                const storeRefs = detectStoreReferences(text);
                log.info("Voice intent: learned data_query, deferring to voice-assist", { stores: storeRefs.stores, metric: storeRefs.metric });
                return json(res, { action: null, meta: { stores: storeRefs.stores, metric: storeRefs.metric, period: storeRefs.period, comparison: storeRefs.comparison } });
              }
              // If learned intent execution failed, fall through to regex/AI
            }
          } catch (learnErr) {
            log.warn("Voice intent DB check failed (non-fatal)", {}, learnErr);
          }
        }

        // ── Create task / reminder ──
        const taskPatterns = [
          { re: /^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:task|to-?do|reminder)\s*(?::|called|named|titled|for)\s+(.+)/i, extract: 1 },
          { re: /^(?:please\s+)?(?:create|add|make)\s+(.+?)\s+as\s+(?:a\s+)?(?:task|to-?do|reminder)\s*$/i, extract: 1 },
          { re: /^(?:please\s+)?remind\s+me\s+to\s+(.+)/i, extract: 1 },
          { re: /^(?:please\s+)?(?:don'?t\s+let\s+me\s+forget\s+to)\s+(.+)/i, extract: 1 },
          { re: /^(?:please\s+)?set\s+(?:a\s+)?reminder\s+(?:to|for)\s+(.+)/i, extract: 1 },
          { re: /^to-?do[:\s]+(.+)/i, extract: 1 },
          { re: /^(?:i\s+need\s+to|i\s+have\s+to|i\s+should)\s+(.+?)(?:\s*[.!]?\s*$)/i, extract: 1 },
          { re: /^task[:\s]+(.+)/i, extract: 1 },
        ];

        for (const pat of taskPatterns) {
          const m = text.match(pat.re);
          if (m && m[pat.extract]) {
            const title = m[pat.extract].replace(/[.!?]+$/, "").trim().slice(0, 500);
            if (!title) continue;

            let priority = "medium";
            if (/\b(urgent|asap|immediately|critical)\b/i.test(title)) priority = "high";
            if (/\b(whenever|eventually|someday|low priority)\b/i.test(title)) priority = "low";

            let due_at = undefined;
            const byMatch = title.match(/\bby\s+(tomorrow|tonight|end of day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
            if (byMatch) {
              const when = byMatch[1].toLowerCase();
              const now = new Date();
              if (when === "tomorrow") { now.setDate(now.getDate() + 1); now.setHours(17, 0, 0, 0); due_at = Math.floor(now.getTime() / 1000); }
              else if (when === "tonight" || when === "end of day") { now.setHours(23, 59, 0, 0); due_at = Math.floor(now.getTime() / 1000); }
              else {
                const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
                const target = days.indexOf(when);
                if (target >= 0) {
                  let diff = target - now.getDay();
                  if (diff <= 0) diff += 7;
                  now.setDate(now.getDate() + diff);
                  now.setHours(17, 0, 0, 0);
                  due_at = Math.floor(now.getTime() / 1000);
                }
              }
            }

            try {
              const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/intake`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...fwdAuth },
                body: JSON.stringify({
                  title,
                  description: `Created via voice command: "${text}"`,
                  priority,
                  source: "chat",
                  requestor: "voice-assistant",
                  category: "general",
                  skip_decompose: true,
                }),
                signal: AbortSignal.timeout(5000),
              });
              if (taskRes.ok) {
                const task = await taskRes.json();
                task.id = task.objective_id; // normalize for downstream
                log.info("Task created from voice", { taskId: task.id, title: title.slice(0, 50) });
                // Learn the pattern for future instant matching
                if (dbReady) { try { learnIntent(text, "task_create", "shre-tasks", { title, priority }, chatDb); } catch {} }
                const dueText = due_at ? ` It's due ${byMatch[1]}.` : "";
                const prioText = priority !== "medium" ? ` Marked as ${priority} priority.` : "";
                return json(res, {
                  action: "task_created",
                  spoken: `Got it! I've created a task: "${title}".${prioText}${dueText}`,
                  transcript: `Task created: ${title} [${priority}]${due_at ? ` due ${byMatch[1]}` : ""}`,
                  task: { id: task.id, title },
                  mib007Link: "/SHR/tasks",
                });
              } else {
                const errBody = await taskRes.text().catch(() => "");
                log.warn("Voice task creation failed", { status: taskRes.status, body: errBody.slice(0, 300) });
                return json(res, {
                  action: "task_error",
                  spoken: "I tried to create that task but something went wrong. You can try again or type it in the chat.",
                });
              }
            } catch (err) {
              log.error("Voice task creation error", {}, err);
              return json(res, {
                action: "task_error",
                spoken: "Sorry, I couldn't reach the task service right now. Try again in a moment.",
              });
            }
          }
        }

        // ── List tasks / todos ──
        if (/\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do(?:\s*list)?|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?|action items?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?|action items?)|my\s+(?:tasks?|to-?do(?:\s*list)?|todos?)|do\s+i\s+have\s+(?:any\s+)?(?:tasks?|to-?do|todos?))\b/i.test(lower)) {
          try {
            const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=created,todo,in_progress,started&limit=10`, {
              headers: { ...fwdAuth },
              signal: AbortSignal.timeout(5000),
            });
            if (taskRes.ok) {
              // Learn the pattern
              if (dbReady) { try { learnIntent(text, "task_list", "shre-tasks", null, chatDb); } catch {} }
              const data = await taskRes.json();
              const tasks = data.tasks || data || [];
              if (tasks.length === 0) {
                return json(res, { action: "task_list", spoken: "You're all clear! No pending tasks right now.", transcript: "0 pending tasks", tasks: [], mib007Link: "/SHR/tasks" });
              }
              const taskLines = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}${t.priority === "high" || t.priority === "critical" ? " — urgent" : ""}`);
              const more = tasks.length > 5 ? ` And ${tasks.length - 5} more.` : "";
              const transcript = taskLines.join("\n") + (tasks.length > 5 ? `\n... and ${tasks.length - 5} more` : "");
              return json(res, {
                action: "task_list",
                spoken: `You have ${tasks.length} pending task${tasks.length === 1 ? "" : "s"}. ${taskLines.join(". ")}.${more}`,
                transcript,
                tasks,
                mib007Link: "/SHR/tasks",
              });
            }
          } catch (err) {
            log.error("Voice task list error", {}, err);
          }
          return json(res, { action: "task_error", spoken: "I couldn't fetch your tasks right now. The task service might be busy." });
        }

        // ── Get digest / summary of work ──
        if (/\b(?:give\s+me\s+(?:a\s+)?(?:digest|briefing|summary|overview|status|update)|what(?:'s| is)\s+(?:the\s+)?(?:status|digest|briefing|update)|morning\s+briefing|daily\s+digest|project\s+status|status\s+update)\b/i.test(lower)) {
          try {
            const digestRes = await fetch(`${serviceUrl("shre-tasks")}/v1/digest`, {
              headers: { ...fwdAuth },
              signal: AbortSignal.timeout(5000),
            });
            if (digestRes.ok) {
              // Learn the pattern
              if (dbReady) { try { learnIntent(text, "digest", "shre-tasks", null, chatDb); } catch {} }
              const digest = await digestRes.json();
              const active = digest.activeProjects || 0;
              const blocked = digest.blockedTasks || 0;
              const completed = digest.completedToday || 0;
              const pending = digest.pendingTasks || 0;
              const transcript = `Active: ${active}, Pending: ${pending}, Completed today: ${completed}, Blocked: ${blocked}`;
              return json(res, {
                action: "digest",
                spoken: `Here's your status update. You have ${active} active project${active === 1 ? "" : "s"}, ${pending} pending task${pending === 1 ? "" : "s"}, and ${completed} completed today.${blocked > 0 ? ` ${blocked} task${blocked === 1 ? " is" : "s are"} blocked and may need attention.` : ""}`,
                transcript,
                digest,
              });
            }
          } catch (err) {
            log.error("Voice digest error", {}, err);
          }
          return json(res, { action: "digest_error", spoken: "I couldn't pull up your status right now." });
        }

        // ── Skip AI classification for queries that clearly aren't task/reminder/digest ──
        // Data queries, analytics, reports, general questions → return null immediately so voice-assist handles them
        if (/\b(?:sales|revenue|report|analytics|inventory|orders?|customers?|transactions?|profit|margin|pull|fetch|show\s+me|look\s+up|how\s+(?:much|many)|what(?:'s| is| are)\s+(?:the|my)\s+(?:sales|revenue|total|balance|count))\b/i.test(lower)) {
          const storeRefs = detectStoreReferences(text);
          log.info("Voice command: data query detected, skipping to voice-assist", { text: text.slice(0, 80), stores: storeRefs.stores, metric: storeRefs.metric });
          return json(res, { action: null, meta: { stores: storeRefs.stores, metric: storeRefs.metric, period: storeRefs.period, comparison: storeRefs.comparison } });
        }

        // ── Schedule a report via voice ──
        const scheduleMatch = text.match(/^(?:send|email|schedule|deliver)\s+(?:me\s+)?(.+?)\s+(?:every\s+)?(morning|daily|weekly|monthly|(?:every\s+)?(?:day|week|month))/i);
        if (scheduleMatch) {
          const reportName = scheduleMatch[1].replace(/[.!?]+$/, "").trim().slice(0, 200);
          const rawSchedule = scheduleMatch[2].toLowerCase();
          let schedule = "daily_8am";
          if (/weekly|week/.test(rawSchedule)) schedule = "weekly_monday";
          else if (/monthly|month/.test(rawSchedule)) schedule = "monthly_1st";

          try {
            // Use internal fetch to the reports API
            const reportRes = await fetch(`https://127.0.0.1:${Number(process.env.PORT) || 5510}/api/reports/schedule`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: reportName, query: reportName, schedule }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => null);

            if (reportRes?.ok) {
              const scheduleLabel = schedule === "daily_8am" ? "every morning" : schedule === "weekly_monday" ? "every Monday" : "on the 1st of each month";
              return json(res, {
                action: "report_scheduled",
                spoken: `Done! I'll send you ${reportName} ${scheduleLabel}. You can manage schedules in settings.`,
                transcript: `Report scheduled: ${reportName} [${schedule}]`,
              });
            }
          } catch (err) {
            log.warn("Voice schedule report failed", {}, err);
          }
          // If internal fetch failed, still acknowledge — the report table might not exist yet
          const scheduleLabel = schedule === "daily_8am" ? "every morning" : schedule === "weekly_monday" ? "every Monday" : "on the 1st of each month";
          return json(res, {
            action: "report_scheduled",
            spoken: `Done! I'll send you ${reportName} ${scheduleLabel}. You can manage schedules in settings.`,
            transcript: `Report scheduled: ${reportName} [${schedule}]`,
          });
        }

        // ── Agent handoff via voice ──
        const handoffMatch = text.match(/\b(?:let\s+me\s+talk\s+to|bring\s+in|switch\s+to|hand\s*off\s+to|transfer\s+(?:me\s+)?to)\s+(.+?)(?:\s*[.!?]?\s*$)/i);
        if (handoffMatch) {
          const rawTarget = handoffMatch[1].replace(/[.!?]+$/, "").trim().toLowerCase();
          const targetAgent = resolveAgentId(rawTarget);
          log.info("Voice handoff request detected", { rawTarget, resolvedAgent: targetAgent, text: text.slice(0, 80) });

          // Build a brief conversation summary from recent voice history
          let recentContext = "";
          if (dbReady) {
            recentContext = (chatDb.prepare?.(
              `SELECT summary FROM voice_sessions ORDER BY created_at DESC LIMIT 1`
            )?.get?.())?.summary || "";
          }

          try {
            const handoffRes = await fetch(`https://127.0.0.1:${Number(process.env.PORT) || 5510}/api/handoff`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fromAgentId: "shre",
                toAgentId: targetAgent,
                reason: `User requested: "${text}"`,
                conversationSummary: recentContext || "No prior context available.",
                lastMessages: [],
              }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => null);

            const handoffData = handoffRes?.ok ? await handoffRes.json().catch(() => null) : null;

            return json(res, {
              action: "agent_switch",
              spoken: `Alright, let me bring in ${targetAgent}. One moment.`,
              transcript: `Handoff: shre → ${targetAgent}`,
              agentId: targetAgent,
              handoffId: handoffData?.handoffId || null,
            });
          } catch (err) {
            log.warn("Voice handoff creation failed", {}, err);
          }
          return json(res, {
            action: "agent_switch",
            spoken: `Alright, switching you to ${targetAgent}.`,
            transcript: `Handoff: shre → ${targetAgent}`,
            agentId: targetAgent,
          });
        }

        // ── AI-powered intent classification fallback ──
        log.info("Voice command: no regex match, trying AI classification", { text: text.slice(0, 80) });
        try {
          const classifyPrompt = `You are a JSON-only intent classifier. Output raw JSON, nothing else. No markdown, no explanation, no code fences.

Rules:
- User wants to CREATE a task/reminder/to-do → {"intent":"task_create","title":"<extracted task>","priority":"medium"}
- User wants to SEE/LIST tasks → {"intent":"task_list"}
- User wants a status/digest/briefing → {"intent":"digest"}
- User asks about sales, revenue, inventory, reports, analytics, "how much", "show me", "pull", "what are my sales" → {"intent":"data_query"}
- User wants to create/list projects or issues → {"intent":"project"}
- Request is ambiguous / unclear what they want → {"intent":"clarify","question":"<ask a clarifying question>"}
- General conversation / anything else → {"intent":"none"}

Examples:
"I gotta remember to pick up milk" → {"intent":"task_create","title":"pick up milk","priority":"medium"}
"jot down fixing the server" → {"intent":"task_create","title":"fix the server","priority":"medium"}
"add buy groceries to my list" → {"intent":"task_create","title":"buy groceries","priority":"medium"}
"what do I need to do" → {"intent":"task_list"}
"what were my sales today" → {"intent":"data_query"}
"show me the revenue report" → {"intent":"data_query"}
"how much did we make this week" → {"intent":"data_query"}
"pull up inventory" → {"intent":"data_query"}
"create a project for the new feature" → {"intent":"project"}
"check that thing" → {"intent":"clarify","question":"Which thing do you mean — a task, a project, or something else?"}
"how's the weather" → {"intent":"none"}`;

          // Route through shre-router — NEVER directly to OpenClaw
          const classifyRes = await fetch(`${serviceUrl("shre-router")}/v1/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "anthropic/claude-haiku-4-5-20251001",
              messages: [{ role: "system", content: classifyPrompt }, { role: "user", content: text }],
              stream: false,
              max_tokens: 150,
              temperature: 0,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (classifyRes.ok) {
            // shre-router may return SSE or JSON depending on stream flag
            const rawText = await classifyRes.text();
            let aiText = "";
            // Try SSE parse first
            for (const line of rawText.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === "delta" && evt.text) aiText += evt.text;
              } catch { /* skip non-JSON lines */ }
            }
            // If no SSE content, try direct JSON response
            if (!aiText) {
              try {
                const directJson = JSON.parse(rawText);
                aiText = (directJson.choices?.[0]?.message?.content || directJson.message?.content || directJson.content || "").trim();
              } catch {
                aiText = rawText.trim();
              }
            }
            log.info("AI intent classification", { input: text.slice(0, 60), aiText: aiText.slice(0, 200) });

            const jsonStr = extractJSON(aiText);
            if (jsonStr) {
              let classified;
              try { classified = JSON.parse(jsonStr); } catch (parseErr) {
                log.warn("Failed to parse AI intent JSON", { raw: jsonStr.slice(0, 100) });
                classified = null;
              }

              // ── Handle clarify intent ──
              if (classified?.intent === "clarify" && classified.question) {
                return json(res, { action: "clarify", spoken: classified.question, mib007Link: null });
              }

              if (classified?.intent === "task_create" && classified.title) {
                const title = classified.title.replace(/[.!?]+$/, "").trim().slice(0, 500);
                if (title) {
                  const priority = classified.priority || "medium";
                  const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/intake`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...fwdAuth },
                    body: JSON.stringify({ title, priority, source: "chat", requestor: "voice-assistant", category: "general", skip_decompose: true }),
                    signal: AbortSignal.timeout(5000),
                  });
                  if (taskRes.ok) {
                    const task = await taskRes.json();
                    task.id = task.objective_id; // normalize
                    log.info("AI-classified task created via intake", { taskId: task.id, title: title.slice(0, 50) });
                    // Learn from this classification for next time
                    if (dbReady) { try { learnIntent(text, "task_create", getTargetForIntent("task_create"), { title, priority }, chatDb); } catch {} }
                    return json(res, {
                      action: "task_created",
                      spoken: `Got it! I've created a task: "${title}".`,
                      transcript: `Task created: ${title} [${priority}]`,
                      task: { id: task.id, title },
                      mib007Link: "/SHR/tasks",
                    });
                  } else {
                    log.warn("AI-classified task creation failed", { status: taskRes.status });
                    return json(res, { action: "task_error", spoken: "I understood you want a task, but couldn't create it right now. Try again." });
                  }
                }
              } else if (classified?.intent === "task_list") {
                // Learn from this classification
                if (dbReady) { try { learnIntent(text, "task_list", getTargetForIntent("task_list"), null, chatDb); } catch {} }
                const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=created,todo,in_progress,started&limit=10`, { headers: { ...fwdAuth }, signal: AbortSignal.timeout(5000) });
                if (taskRes.ok) {
                  const data = await taskRes.json();
                  const tasks = data.tasks || data || [];
                  if (tasks.length === 0) return json(res, { action: "task_list", spoken: "You're all clear! No pending tasks.", transcript: "0 pending tasks", tasks: [], mib007Link: "/SHR/tasks" });
                  const taskLines = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}${t.priority === "high" || t.priority === "critical" ? " — urgent" : ""}`);
                  const transcript = taskLines.join("\n");
                  return json(res, { action: "task_list", spoken: `You have ${tasks.length} pending task${tasks.length === 1 ? "" : "s"}. ${taskLines.join(". ")}.`, transcript, tasks, mib007Link: "/SHR/tasks" });
                } else {
                  return json(res, { action: "task_error", spoken: "I couldn't fetch your tasks right now." });
                }
              } else if (classified?.intent === "digest") {
                // Learn from this classification
                if (dbReady) { try { learnIntent(text, "digest", getTargetForIntent("digest"), null, chatDb); } catch {} }
                const digestRes = await fetch(`${serviceUrl("shre-tasks")}/v1/digest`, { headers: { ...fwdAuth }, signal: AbortSignal.timeout(5000) });
                if (digestRes.ok) {
                  const digest = await digestRes.json();
                  const transcript = `Pending: ${digest.pendingTasks || 0}, Completed today: ${digest.completedToday || 0}`;
                  return json(res, { action: "digest", spoken: `You have ${digest.pendingTasks || 0} pending tasks and ${digest.completedToday || 0} completed today.`, transcript, digest });
                } else {
                  return json(res, { action: "digest_error", spoken: "I couldn't pull up your status right now." });
                }
              } else if (classified?.intent === "data_query") {
                // Learn and defer to voice-assist — include store references
                if (dbReady) { try { learnIntent(text, "data_query", getTargetForIntent("data_query"), null, chatDb); } catch {} }
                const storeRefs = detectStoreReferences(text);
                log.info("AI classified as data_query, deferring to voice-assist", { stores: storeRefs.stores, metric: storeRefs.metric });
                return json(res, { action: null, meta: { stores: storeRefs.stores, metric: storeRefs.metric, period: storeRefs.period, comparison: storeRefs.comparison } });
              } else if (classified?.intent === "project") {
                // Learn and link to MIB007
                if (dbReady) { try { learnIntent(text, "project", getTargetForIntent("project"), null, chatDb); } catch {} }
                return json(res, { action: null });
              }
            }
          }
        } catch (aiErr) {
          log.warn("AI intent classification fallback failed", {}, aiErr);
        }

        auditLog(null, 'voice_command_response', 'out', { action: null, spoken: null });
        return json(res, { action: null });

      } catch (err) {
        log.error("Voice command parse error", {}, err);
        return json(res, { action: null });
      }
    }

    // ── Voice Assistant — non-streaming chat for voice conversations ──
    if (url.pathname === "/api/voice-assist" && req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          const { prompt, agentId, messages: chatHistory, voiceHistory, dataQueryMeta } = body;

          const auditStart = Date.now();
          const voiceTurnsCount = (voiceHistory || []).length;
          auditLog(body.sessionId || null, 'voice_assist_request', 'in', { prompt, agentId, voiceTurnCount: voiceTurnsCount }, { agentId });

          // ── Input validation ──
          const promptErr = validatePrompt(prompt);
          if (promptErr) return json(res, { error: promptErr }, 400);

          // ── Smart context pipeline: chunk → score → assemble focused context ──
          const sentenceChunks = chunkIntoSentences((chatHistory || []).slice(-20));
          const scored = scoreRelevance(sentenceChunks, prompt);
          const assembled = assembleContext(scored, 3000);

          // Log pipeline stats for tuning
          const top3 = scored.slice(0, 3).map((c) => ({ score: c.score, text: c.text.slice(0, 60), role: c.role }));
          log.info("Voice context pipeline", {
            totalSentences: sentenceChunks.length,
            top3,
            relevant: assembled.relevant,
            contextChars: assembled.totalChars || 0,
            contextChunks: assembled.chunkCount || 0,
          });

          const voiceTurns = (voiceHistory || []).map((t) => ({
            role: t.role,
            content: t.content || t.text || "",
          }));

          // Fetch last 3 voice session summaries for context
          let prevSessionsMsg = "";
          let actionMemoryMsg = "";
          if (dbReady) {
            try {
              const prevSessions = chatDb.prepare(
                `SELECT summary FROM voice_sessions ORDER BY created_at DESC LIMIT 3`
              ).all();
              if (prevSessions.length > 0) {
                prevSessionsMsg = "Previous voice sessions: " + prevSessions.map((s, i) => `${i + 1}. ${s.summary}`).join(" ");
              }
            } catch {}
            // Fetch recent actions from this session for action memory
            try {
              const recentActions = chatDb.prepare(
                `SELECT action_type, target, result, status, created_at FROM voice_actions ORDER BY created_at DESC LIMIT 10`
              ).all();
              if (recentActions.length > 0) {
                actionMemoryMsg = "Actions you've taken this session: " + recentActions.map((a) =>
                  `${a.action_type}${a.target ? ` on "${a.target}"` : ""} → ${a.status}${a.result ? `: ${String(a.result).slice(0, 100)}` : ""}`
                ).join("; ");
              }
            } catch {}
          }

          // Save user turn to DB
          const sessionId = body.sessionId || null;
          saveTurn(sessionId, "user", prompt, "thinking", null, null);

          const systemPrompt = `You are ${agentId || "Shre"}, a real person having a spoken conversation. This is voice — not text chat. Everything you say will be read aloud by a text-to-speech engine.

Personality:
- You're a sharp, warm colleague who genuinely cares. Think senior engineer at a coffee shop, not customer support.
- You have your own opinions and aren't afraid to share them. "Honestly, I'd skip that approach" is better than "There are several options to consider."
- Match the user's energy. If they're casual, be casual. If they're stressed, be calm and direct. If they're excited, share the enthusiasm.

How to speak:
- Use contractions always (I'm, you're, that's, won't, couldn't). Never say "I am" or "do not" — nobody talks like that.
- Start responses naturally. Use openers like "So...", "Yeah,", "Honestly,", "Oh,", "Right,", "Well," — not every time, but when it fits.
- Use brief thinking cues when the question is complex: "Hmm, let me think about that..." or "That's a good question..."
- Add verbal connectors: "the thing is...", "basically...", "here's the deal...", "long story short..."
- Express genuine reactions: "Oh nice!", "Yeah that makes sense", "Ah, gotcha", "Ooh, that's tricky"
- It's okay to be brief. "Yep, that's right" or "Nah, I wouldn't do that" are perfectly fine answers.
- Keep it to 1-3 sentences for simple things, up to 5 for complex topics. Don't ramble.

What NOT to do:
- Never output markdown, bullet points, numbered lists, code blocks, URLs, or any formatting.
- Never read data tables, JSON, or code verbatim. Summarize: "You've got about 12 tasks, mostly around the router" not the raw data.
- Never say "As an AI" or "I don't have feelings" — stay in character.
- Never start with "Sure!" or "Of course!" or "Absolutely!" — those are robotic fillers. Be more natural.
- Never use the word "certainly" — real people don't say it.

You have context from recent chat messages below — this includes data the user already pulled (sales reports, task lists, analytics, etc.).
IMPORTANT: If the user asks about data that's already in the chat context, summarize it conversationally. Do NOT say "I can't access that" or "I don't have that data" — the data is RIGHT HERE in the context below. Read it, understand it, and give a spoken summary.
For example, if the chat shows sales data, and the user asks "what were my sales today?" — just summarize the numbers from the context.`;

          // ── Data query metadata — when voice-command detected a multi-store/metric query ──
          let dataQueryHint = "";
          const dqm = dataQueryMeta || {};
          if (dqm.metric || (dqm.stores && dqm.stores.length > 0)) {
            const storesLabel = dqm.stores?.length ? dqm.stores.join(", ") : "the store";
            const periodLabel = dqm.period || "the requested time range";
            const metricLabel = dqm.metric || "the requested data";
            dataQueryHint = `\nThe user is asking about ${metricLabel} for ${storesLabel} during ${periodLabel}. If you have this data in the chat context, summarize it. If comparing stores, present the comparison clearly.`;
          }

          const contextSystemMsg = assembled.relevant
            ? "Data from the user's recent chat (summarize this if asked):\n" + assembled.context + dataQueryHint
            : "No relevant data in recent chat. Answer based on your knowledge or ask the user to pull the data in chat first." + dataQueryHint;

          const allMessages = [
            { role: "system", content: systemPrompt },
            { role: "system", content: contextSystemMsg },
            ...(prevSessionsMsg ? [{ role: "system", content: prevSessionsMsg }] : []),
            ...(actionMemoryMsg ? [{ role: "system", content: actionMemoryMsg }] : []),
            ...voiceTurns,
            { role: "user", content: prompt },
          ];

          const apiRes = await fetch(`${serviceUrl("shre-router")}/v1/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "auto",
              max_tokens: 400,
              messages: allMessages,
            }),
            signal: AbortSignal.timeout(20000),
          });

          if (!apiRes.ok) {
            const errBody = await apiRes.text();
            return json(res, { error: `AI failed: ${errBody}`, response: "Sorry, I couldn't process that." }, 502);
          }

          const sseText = await apiRes.text();
          let response = "";
          // Try SSE parse first (shre-router streams by default)
          for (const line of sseText.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "delta" && evt.text) response += evt.text;
              // Also handle OpenAI-compatible format
              else if (evt.choices?.[0]?.delta?.content) response += evt.choices[0].delta.content;
              else if (evt.choices?.[0]?.message?.content) response += evt.choices[0].message.content;
            } catch { /* skip non-JSON lines */ }
          }
          // If no SSE content, try direct JSON response
          if (!response) {
            try {
              const directJson = JSON.parse(sseText);
              response = (directJson.choices?.[0]?.message?.content || directJson.message?.content || directJson.content || directJson.text || "").trim();
            } catch {
              // Last resort: use raw text if it looks like a real response
              if (sseText.length > 5 && sseText.length < 5000 && !sseText.startsWith("{")) response = sseText.trim();
            }
          }
          response = response.trim();
          auditLog(sessionId, 'voice_assist_response', 'out', { response: response.slice(0, 2000), sseLines: sseText.split("\n").length }, { latencyMs: Date.now() - auditStart, agentId, model: 'auto' });
          // Save assistant turn to DB for context persistence
          saveTurn(sessionId, "assistant", response || "I didn't catch that.", "speaking", null, null);
          log.info("Voice assist response", { chars: response.length, preview: response.slice(0, 80), sseLines: sseText.split("\n").length });
          return json(res, { response: response || "I didn't catch that. Could you try again?" });
        } catch (err) {
          return json(res, { error: err.message, response: "Sorry, something went wrong." }, 502);
        }
      });
      return true;
    }

    // ── Voice Briefing — proactive morning briefing ──
    if (url.pathname === "/api/voice-briefing" && req.method === "GET") {
      try {
        const tasksToken = process.env.SHRE_TASKS_TOKEN || "";
        const fwdAuth = tasksToken ? { Authorization: `Bearer ${tasksToken}` } : {};

        // 1. Fetch task digest
        let digest = null;
        try {
          const digestRes = await fetch(`${serviceUrl("shre-tasks")}/v1/digest`, {
            headers: { ...fwdAuth },
            signal: AbortSignal.timeout(5000),
          });
          if (digestRes.ok) digest = await digestRes.json();
        } catch (err) {
          log.warn("Voice briefing: tasks digest failed (non-fatal)", {}, err);
        }

        // 2. Fetch fleet status — validate response shape
        let fleet = null;
        try {
          const fleetRes = await fetch(`${serviceUrl("shre-fleet")}/v1/agents/status`, {
            signal: AbortSignal.timeout(3000),
          });
          if (fleetRes.ok) {
            const fleetData = await fleetRes.json();
            // Validate fleet response shape — don't assume any field exists
            if (fleetData && typeof fleetData === "object") {
              fleet = fleetData;
            }
          }
        } catch {
          // non-fatal
        }

        // 3. Query last 3 voice intents (recent learned queries)
        let recentIntents = [];
        if (dbReady) {
          try {
            recentIntents = chatDb.prepare(
              `SELECT pattern, intent FROM voice_intents ORDER BY last_used DESC LIMIT 3`
            ).all();
          } catch {}
        }

        // 4. Compose natural spoken briefing
        const parts = [];
        const hour = new Date().getHours();
        if (hour < 12) parts.push("Morning.");
        else if (hour < 17) parts.push("Good afternoon.");
        else parts.push("Evening.");

        if (digest) {
          const pending = digest.pendingTasks || 0;
          const high = digest.highPriority || digest.blockedTasks || 0;
          const completed = digest.completedToday || 0;
          parts.push(`You've got ${pending} task${pending === 1 ? "" : "s"} pending${high > 0 ? `, ${high} ${high === 1 ? "is" : "are"} high priority` : ""}.`);
          if (completed > 0) parts.push(`${completed} completed today so far.`);
        }

        if (fleet) {
          // Safe extraction: try multiple possible shapes
          let activeAgents = 0;
          if (typeof fleet.activeAgents === "number") activeAgents = fleet.activeAgents;
          else if (typeof fleet.active === "number") activeAgents = fleet.active;
          else if (Array.isArray(fleet.agents)) activeAgents = fleet.agents.filter(a => a && a.status === "active").length;
          else if (typeof fleet.count === "number") activeAgents = fleet.count;

          if (activeAgents > 0) parts.push(`Your fleet has ${activeAgents} agent${activeAgents === 1 ? "" : "s"} active.`);
        }

        if (recentIntents.length > 0) {
          const topic = recentIntents[0].pattern?.slice(0, 60) || recentIntents[0].intent;
          parts.push(`Last time you asked about ${topic}.`);
        }

        if (parts.length <= 1) parts.push("Everything looks quiet. What can I help with?");

        return json(res, {
          briefing: parts.join(" "),
          data: { tasks: digest, fleet, recentIntents },
        });
      } catch (err) {
        log.error("Voice briefing error", {}, err);
        return json(res, { briefing: "Hey! Ready when you are.", data: {} });
      }
    }

    // ── Voice Session Summary — save/retrieve session summaries ──
    if (url.pathname === "/api/voice-session-summary" && req.method === "POST") {
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { turns, agentId: sessAgentId, sessionId } = JSON.parse(body);
        if (!turns || !Array.isArray(turns) || turns.length < 4) {
          return json(res, { saved: false, reason: "Too few turns" });
        }

        if (!dbReady) {
          return json(res, { saved: false, reason: "Voice DB not ready" });
        }

        // Generate summary via shre-router
        let summary = "";
        try {
          const summaryPrompt = turns.slice(-20).map(t => `${t.role}: ${(t.text || t.content || "").slice(0, 200)}`).join("\n");
          const apiRes = await fetch(`${serviceUrl("shre-router")}/v1/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "auto",
              max_tokens: 100,
              messages: [
                { role: "system", content: "Summarize this voice conversation in 1-2 sentences. Be concise. Output only the summary, nothing else." },
                { role: "user", content: summaryPrompt },
              ],
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (apiRes.ok) {
            const sseText = await apiRes.text();
            for (const line of sseText.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === "delta" && evt.text) summary += evt.text;
                else if (evt.choices?.[0]?.delta?.content) summary += evt.choices[0].delta.content;
              } catch { /* skip */ }
            }
            // JSON fallback
            if (!summary) {
              try {
                const dj = JSON.parse(sseText);
                summary = (dj.choices?.[0]?.message?.content || dj.content || dj.text || "").trim();
              } catch {}
            }
            summary = summary.trim();
          }
        } catch (err) {
          log.warn("Voice session summary generation failed", {}, err);
        }

        if (!summary) {
          // Fallback: simple description
          const userTurns = turns.filter(t => t.role === "user");
          summary = `Voice conversation with ${turns.length} turns about: ${userTurns.slice(0, 2).map(t => (t.text || t.content || "").slice(0, 40)).join(", ")}`;
        }

        // Extract topics from recent intents used during this session
        let topics = "";
        try {
          const recentIntents = chatDb.prepare(
            `SELECT DISTINCT intent FROM voice_intents WHERE last_used > ? ORDER BY last_used DESC LIMIT 5`
          ).all(Date.now() - 600000); // last 10 minutes
          topics = recentIntents.map(i => i.intent).join(",");
        } catch {}

        // Save to voice_sessions (including context_summary and ended_at)
        const id = sessionId || randomUUID();
        chatDb.prepare(
          `INSERT OR REPLACE INTO voice_sessions (id, summary, context_summary, agent_id, turn_count, topics, created_at, ended_at, text_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, summary, summary, sessAgentId || "main", turns.length, topics || null, Date.now(), Date.now(), null);

        log.info("Voice session saved", { id, turnCount: turns.length, summaryLen: summary.length });
        return json(res, { saved: true, id, summary });
      } catch (err) {
        log.error("Voice session summary save error", {}, err);
        return json(res, { error: "Failed to save session" }, 500);
      }
    }

    if (url.pathname === "/api/voice-session-summary" && req.method === "GET") {
      if (!dbReady) return json(res, { sessions: [] });
      try {
        const limit = parseInt(url.searchParams.get("limit") || "3", 10);
        const sessions = chatDb.prepare(
          `SELECT id, summary, agent_id, turn_count, topics, created_at FROM voice_sessions ORDER BY created_at DESC LIMIT ?`
        ).all(Math.min(limit, 10));
        return json(res, { sessions });
      } catch (err) {
        log.error("Voice session summary list error", {}, err);
        return json(res, { sessions: [] });
      }
    }

    // ── Voice Shortcuts — top voice commands as quick-tap buttons ──
    if (url.pathname === "/api/voice-shortcuts" && req.method === "GET") {
      if (!dbReady) return json(res, { shortcuts: [] });
      try {
        const shortcuts = getTopShortcuts(chatDb);
        return json(res, { shortcuts });
      } catch (err) {
        log.error("Voice shortcuts error", {}, err);
        return json(res, { shortcuts: [] });
      }
    }

    // ── Voice Audit Log — retrieve audit entries ──
    if (url.pathname === "/api/voice-audit" && req.method === "GET") {
      if (!dbReady) return json(res, { logs: [] });
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const sessionId = url.searchParams.get("session_id");
        const eventType = url.searchParams.get("event_type");

        let query = "SELECT * FROM voice_audit_log";
        const conditions = [];
        const params = [];
        if (sessionId) { conditions.push("session_id = ?"); params.push(sessionId); }
        if (eventType) { conditions.push("event_type = ?"); params.push(eventType); }
        if (conditions.length) query += " WHERE " + conditions.join(" AND ");
        query += " ORDER BY created_at DESC LIMIT ?";
        params.push(limit);

        const logs = chatDb.prepare(query).all(...params);
        return json(res, { logs });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // ── Voice Turns — batch sync from client (POST) ──
    if (url.pathname === "/api/voice-turns/sync" && req.method === "POST") {
      if (!dbReady) return json(res, { error: "DB not ready" }, 503);
      let body;
      try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const { sessionId, turns } = JSON.parse(body);
        if (!sessionId || !Array.isArray(turns)) return json(res, { error: "sessionId and turns[] required" }, 400);

        // Get existing turn count to avoid duplicates
        const existing = chatDb.prepare("SELECT COUNT(*) as cnt FROM voice_turns WHERE session_id = ?").get(sessionId);
        const existingCount = existing?.cnt || 0;

        // Only insert turns beyond what we already have
        const newTurns = turns.slice(existingCount);
        if (newTurns.length > 0) {
          const insert = chatDb.prepare(
            `INSERT INTO voice_turns (id, session_id, role, content, phase, action_type, action_result, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          );
          const batch = chatDb.transaction((items) => {
            for (const t of items) {
              insert.run(randomUUID(), sessionId, t.role, t.text || t.content || "", t.phase || null, t.actionType || null, t.actionResult || null, t.created_at || Date.now());
            }
          });
          batch(newTurns);
        }

        return json(res, { ok: true, synced: newTurns.length, total: existingCount + newTurns.length });
      } catch (err) {
        log.warn("Voice turn sync error", {}, err);
        return json(res, { error: err.message }, 400);
      }
    }

    // ── Voice Turns — full turn history for a session ──
    if (url.pathname.startsWith("/api/voice-turns/") && req.method === "GET") {
      if (!dbReady) return json(res, { turns: [] });
      const sessionId = url.pathname.split("/api/voice-turns/")[1];
      if (!sessionId) return json(res, { error: "Missing session_id" }, 400);
      try {
        const turns = chatDb.prepare(
          "SELECT * FROM voice_turns WHERE session_id = ? ORDER BY created_at ASC"
        ).all(sessionId);
        return json(res, { turns });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // ── Voice Actions — action history for a session ──
    if (url.pathname.startsWith("/api/voice-actions/") && req.method === "GET") {
      if (!dbReady) return json(res, { actions: [] });
      const sessionId = url.pathname.split("/api/voice-actions/")[1];
      if (!sessionId) return json(res, { error: "Missing session_id" }, 400);
      try {
        const actions = chatDb.prepare(
          "SELECT * FROM voice_actions WHERE session_id = ? ORDER BY created_at ASC"
        ).all(sessionId);
        return json(res, { actions });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // ── Training Data Extraction — converts audit logs into training pairs ──
    if (url.pathname === "/api/voice-training-data" && req.method === "GET") {
      if (!dbReady) return json(res, { pairs: [], count: 0 });
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
        const since = url.searchParams.get("since") || "0";

        // Extract request/response pairs from audit log
        const requests = chatDb.prepare(
          `SELECT al1.payload AS request_payload, al1.agent_id, al1.created_at AS req_time,
                  al2.payload AS response_payload, al2.latency_ms, al2.model
           FROM voice_audit_log al1
           JOIN voice_audit_log al2 ON al1.session_id = al2.session_id
             AND al2.event_type = REPLACE(al1.event_type, '_request', '_response')
             AND al2.direction = 'out'
             AND al2.created_at >= al1.created_at
             AND al2.created_at <= al1.created_at + 30000
           WHERE al1.direction = 'in'
             AND al1.created_at > ?
           ORDER BY al1.created_at DESC
           LIMIT ?`
        ).all(parseInt(since), limit);

        const pairs = requests.map((r) => {
          try {
            const req = JSON.parse(r.request_payload || "{}");
            const resp = JSON.parse(r.response_payload || "{}");
            return {
              input: req.prompt || "",
              output: resp.response || resp.spoken || "",
              agentId: r.agent_id,
              model: r.model,
              latencyMs: r.latency_ms,
              timestamp: r.req_time,
            };
          } catch { return null; }
        }).filter(Boolean).filter((p) => p.input && p.output);

        return json(res, { pairs, count: pairs.length });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // ── Voice Session Context Rebuild — returns full context for a session ──
    if (url.pathname === "/api/voice-context" && req.method === "GET") {
      if (!dbReady) return json(res, { context: null });
      try {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) return json(res, { error: "Missing session_id" }, 400);

        const session = chatDb.prepare(
          "SELECT * FROM voice_sessions WHERE id = ?"
        ).get(sessionId);

        const turns = chatDb.prepare(
          "SELECT role, content, phase, action_type, action_result, created_at FROM voice_turns WHERE session_id = ? ORDER BY created_at ASC"
        ).all(sessionId);

        const actions = chatDb.prepare(
          "SELECT action_type, target, result, status, created_at FROM voice_actions WHERE session_id = ? ORDER BY created_at ASC"
        ).all(sessionId);

        // Build a condensed context string for AI consumption
        const contextParts = [];
        if (session?.summary) contextParts.push(`Session summary: ${session.summary}`);
        for (const t of turns.slice(-15)) {
          contextParts.push(`${t.role}: ${t.content}`);
          if (t.action_type) contextParts.push(`[Action: ${t.action_type} → ${t.action_result || 'done'}]`);
        }

        return json(res, {
          session,
          turns,
          actions,
          contextString: contextParts.join("\n"),
        });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    return false;
  };
}
