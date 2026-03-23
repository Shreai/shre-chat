// Shre Chat — production static server with OpenClaw proxy + session sync + WebSocket proxy
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { createServer as createNetServer } from "node:net";
// net.createConnection removed — using http upgrade proxy instead
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, appendFileSync, mkdirSync, openSync, readSync, closeSync, renameSync } from "node:fs";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { randomUUID, createHmac, createHash, timingSafeEqual } from "node:crypto";
import { join, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { WebSocketServer } from "ws";
import { createLogger, extractCorrelationId, createEventBus, createLifecycleEmitter, serviceUrl, infraUrl, createFeedbackPipeline } from "shre-sdk";
import { createConversationLearner } from "shre-sdk/rag";
import { writeConversation, startWALReplay } from "shre-sdk/training";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerVoiceRoutes } from "./routes/voice.js";
import { registerIntentRouter } from "./routes/intent-router.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSuggestionsRoutes } from "./routes/suggestions.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerReportRoutes, checkDueReports } from "./routes/reports.js";
import { registerHandoffRoutes } from "./routes/handoff.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPushRoutes } from "./routes/push.js";

// ── Trust mkcert CA so Node verifies local TLS certs properly ──
const _mkcertCA = join(homedir(), "Library", "Application Support", "mkcert", "rootCA.pem");
if (existsSync(_mkcertCA) && !process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_EXTRA_CA_CERTS = _mkcertCA;
}

const PORT = Number(process.env.PORT) || 5510;
const log = createLogger("shre-chat");
const eventBus = createEventBus("shre-chat");
const conversationLearner = createConversationLearner("shre-chat", { logger: log, eventBus });
const feedbackPipeline = createFeedbackPipeline({ agentId: "chat-service", workspaceId: "shre" });
const lifecycle = createLifecycleEmitter(eventBus, "shre-chat", { port: PORT });
const DIST = join(import.meta.dirname, "dist");
const OPENCLAW_HOST = "127.0.0.1";
const OPENCLAW_PORT = Number(new URL(infraUrl("openclaw-gateway")).port);
const OPENCLAW_HOME = join(homedir(), ".openclaw");
const MIB007_PORT = Number(new URL(serviceUrl("mib007")).port);
const CORTEXDB_URL = process.env.CORTEXDB_URL || infraUrl("cortexservice-api");

// ── Gateway token — read from openclaw.json server-side (never expose in bundle) ──
let GATEWAY_TOKEN = "";
try {
  const ocConfig = JSON.parse(readFileSync(join(OPENCLAW_HOME, "openclaw.json"), "utf8"));
  // Token lives at gateway.auth.token in openclaw.json
  GATEWAY_TOKEN = ocConfig?.gateway?.auth?.token || ocConfig?.auth?.token || "";
} catch { /* will fail gracefully — gateway calls won't auth */ }

// ── Anthropic API key — for direct calls that bypass OpenClaw session tracking ──
let ANTHROPIC_API_KEY = "";
let OPENAI_API_KEY = "";
try {
  // Try auth-profiles first, then env
  const agentDirs = readdirSync(join(OPENCLAW_HOME, "agents"));
  for (const dir of agentDirs) {
    const authPath = join(OPENCLAW_HOME, "agents", dir, "agent", "auth-profiles.json");
    if (existsSync(authPath)) {
      const profiles = JSON.parse(readFileSync(authPath, "utf8"));
      if (!ANTHROPIC_API_KEY) {
        const key = profiles?.profiles?.["anthropic:default"]?.key
          || Object.values(profiles?.profiles || {}).find(p => p?.key?.startsWith("sk-ant-"))?.key;
        if (key) ANTHROPIC_API_KEY = key;
      }
      if (!OPENAI_API_KEY) {
        const key = profiles?.profiles?.["openai:default"]?.key
          || Object.values(profiles?.profiles || {}).find(p => p?.key?.startsWith("sk-proj"))?.key;
        if (key) OPENAI_API_KEY = key;
      }
      if (ANTHROPIC_API_KEY && OPENAI_API_KEY) break;
    }
  }
  if (!ANTHROPIC_API_KEY) ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!OPENAI_API_KEY) OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
} catch { /* suggestions will gracefully fail */ }

// ─── Chat Session DB (SQLite) ────────────────────────────────────
import Database from 'better-sqlite3';

const CHAT_DB_PATH = join(homedir(), '.shre', 'chat-sessions.db');
mkdirSync(join(homedir(), '.shre'), { recursive: true });
const chatDb = new Database(CHAT_DB_PATH);
chatDb.pragma('journal_mode = WAL');
chatDb.pragma('busy_timeout = 5000');
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL DEFAULT 'New chat',
    agent_id     TEXT NOT NULL DEFAULT 'main',
    messages     TEXT NOT NULL DEFAULT '[]',
    pinned       INTEGER NOT NULL DEFAULT 0,
    tags         TEXT,
    system_prompt TEXT,
    parent_id    TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at);

  CREATE TABLE IF NOT EXISTS deleted_sessions (
    id           TEXT PRIMARY KEY,
    title        TEXT,
    agent_id     TEXT,
    messages     TEXT,
    pinned       INTEGER,
    tags         TEXT,
    system_prompt TEXT,
    parent_id    TEXT,
    created_at   INTEGER,
    updated_at   INTEGER,
    deleted_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    deleted_by   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_deleted_at ON deleted_sessions(deleted_at);
`);

// ── Chat Messages (individual message persistence) ──────────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    model       TEXT,
    agent_id    TEXT,
    user_id     TEXT NOT NULL DEFAULT 'system',
    metadata    TEXT DEFAULT '{}',
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_agent ON chat_messages(agent_id, created_at);
`);

// ── Migration: add tenant isolation columns ────────────────────────
// ALTER TABLE ADD COLUMN is safe in SQLite — no-ops if column already exists
try { chatDb.exec(`ALTER TABLE chat_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system'`); } catch {}
try { chatDb.exec(`ALTER TABLE chat_sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`); } catch {}
try { chatDb.exec(`ALTER TABLE chat_sessions ADD COLUMN summary TEXT`); } catch {} // Auto-generated session summary
try { chatDb.exec(`ALTER TABLE deleted_sessions ADD COLUMN user_id TEXT`); } catch {}
try { chatDb.exec(`ALTER TABLE deleted_sessions ADD COLUMN tenant_id TEXT`); } catch {}
chatDb.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON chat_sessions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_tenant ON chat_sessions(user_id, tenant_id);
  CREATE INDEX IF NOT EXISTS idx_deleted_user ON deleted_sessions(user_id);
`);

// ── Voice Intent Learning DB ──────────────────────────────────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS voice_intents (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    normalized TEXT NOT NULL,
    intent TEXT NOT NULL,
    target_app TEXT NOT NULL,
    params TEXT,
    confidence REAL DEFAULT 1.0,
    hit_count INTEGER DEFAULT 1,
    last_used INTEGER,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_voice_intents_normalized ON voice_intents(normalized);

  CREATE TABLE IF NOT EXISTS voice_sessions (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    agent_id TEXT NOT NULL DEFAULT 'main',
    turn_count INTEGER NOT NULL DEFAULT 0,
    topics TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_voice_sessions_created ON voice_sessions(created_at);
`);

// ── Scheduled Reports DB ──────────────────────────────────────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_reports (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    schedule TEXT NOT NULL,
    agent_id TEXT DEFAULT 'shre',
    last_run INTEGER,
    next_run INTEGER,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_next_run ON scheduled_reports(next_run);
  CREATE INDEX IF NOT EXISTS idx_reports_enabled ON scheduled_reports(enabled);
`);

// ── Agent Handoffs DB ─────────────────────────────────────────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS handoffs (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    reason TEXT,
    summary TEXT,
    context TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
  CREATE INDEX IF NOT EXISTS idx_handoffs_created ON handoffs(created_at);
`);

// ── Notifications DB ────────────────────────────────────────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    source TEXT,
    read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
`);

// ── Voice Audit Log — full request/response recording ──────────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS voice_audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    event_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    payload TEXT,
    latency_ms INTEGER,
    model TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    agent_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_voice_audit_session ON voice_audit_log(session_id);
  CREATE INDEX IF NOT EXISTS idx_voice_audit_created ON voice_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_voice_audit_type ON voice_audit_log(event_type);
`);

// ── Voice Turns — full conversation turns (no truncation) ──────
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS voice_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    phase TEXT,
    action_type TEXT,
    action_result TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_voice_turns_session ON voice_turns(session_id);
`);

// ── Voice Actions — tracks what the agent DID (task creation, edits, etc.) ──
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS voice_actions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id TEXT,
    action_type TEXT NOT NULL,
    target TEXT,
    payload TEXT,
    result TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_voice_actions_session ON voice_actions(session_id);
`);

// ── Voice Sessions — add missing columns ───────────────────────
try { chatDb.exec(`ALTER TABLE voice_sessions ADD COLUMN ended_at INTEGER`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_sessions ADD COLUMN context_summary TEXT`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_sessions ADD COLUMN text_session_id TEXT`); } catch {} // Bridge voice ↔ text

// ── Chat Audit Log — parity with voice_audit_log for text conversations ──
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS chat_audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    trace_id TEXT,
    event_type TEXT NOT NULL,
    agent_id TEXT,
    model TEXT,
    user_id TEXT,
    user_message TEXT,
    assistant_response TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    latency_ms INTEGER,
    tool_calls TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_audit_session ON chat_audit_log(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_audit_created ON chat_audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_audit_agent ON chat_audit_log(agent_id);
  CREATE INDEX IF NOT EXISTS idx_chat_audit_trace ON chat_audit_log(trace_id);
`);
// Migration: add user_id column to existing chat_audit_log tables (must run BEFORE index creation)
try { chatDb.exec(`ALTER TABLE chat_audit_log ADD COLUMN user_id TEXT`); } catch {}
chatDb.exec(`CREATE INDEX IF NOT EXISTS idx_chat_audit_user ON chat_audit_log(user_id)`);

// ── Chat Actions — tracks what the agent DID in text conversations ──
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS chat_actions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target TEXT,
    payload TEXT,
    result TEXT,
    status TEXT DEFAULT 'completed',
    agent_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_actions_session ON chat_actions(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_actions_created ON chat_actions(created_at);
`);

// ── FTS5 Full-Text Search — fast keyword search across conversations ──
try {
  chatDb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chat_audit_fts USING fts5(
      user_message, assistant_response, agent_id, content=chat_audit_log, content_rowid=rowid
    );
  `);
  // Auto-sync triggers (fire on INSERT to chat_audit_log)
  chatDb.exec(`
    CREATE TRIGGER IF NOT EXISTS chat_audit_fts_insert AFTER INSERT ON chat_audit_log BEGIN
      INSERT INTO chat_audit_fts(rowid, user_message, assistant_response, agent_id)
      VALUES (NEW.rowid, NEW.user_message, NEW.assistant_response, NEW.agent_id);
    END;
  `);
} catch (ftsErr) { log.warn("FTS5 setup skipped (may already exist)", {}); }

const stmtUpsert = chatDb.prepare(`
  INSERT OR REPLACE INTO chat_sessions (id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetAll = chatDb.prepare(`SELECT id, title, agent_id, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`);
const stmtGetOne = chatDb.prepare(`SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?`);
const stmtDelete = chatDb.prepare(`DELETE FROM chat_sessions WHERE id = ? AND user_id = ?`);
const stmtSoftDelete = chatDb.prepare(`
  INSERT OR REPLACE INTO deleted_sessions (id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, deleted_at, deleted_by, user_id, tenant_id)
  SELECT id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, unixepoch() * 1000, ?, user_id, tenant_id
  FROM chat_sessions WHERE id = ? AND user_id = ?
`);
const stmtRestoreDeleted = chatDb.prepare(`
  INSERT OR REPLACE INTO chat_sessions (id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id)
  SELECT id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id
  FROM deleted_sessions WHERE id = ? AND user_id = ?
`);
const stmtRemoveFromTrash = chatDb.prepare(`DELETE FROM deleted_sessions WHERE id = ? AND user_id = ?`);
const stmtListDeleted = chatDb.prepare(`SELECT id, title, agent_id, deleted_at, deleted_by FROM deleted_sessions WHERE user_id = ? ORDER BY deleted_at DESC LIMIT 50`);
// Auto-purge trash older than 30 days
const stmtPurgeTrash = chatDb.prepare(`DELETE FROM deleted_sessions WHERE deleted_at < ?`);

// ── Chat message prepared statements ────────────────────────────
const stmtInsertMessage = chatDb.prepare(`
  INSERT OR IGNORE INTO chat_messages (id, session_id, role, content, model, agent_id, user_id, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetMessages = chatDb.prepare(`
  SELECT id, session_id, role, content, model, agent_id, user_id, metadata, created_at
  FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?
`);
const stmtCountMessages = chatDb.prepare(`
  SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?
`);

function upsertSession(s, userId = 'system', tenantId = 'default') {
  stmtUpsert.run(
    s.id,
    s.sessionTitle || s.title || 'New chat',
    s.agentId || s.agent_id || 'main',
    typeof s.messages === 'string' ? s.messages : JSON.stringify(s.messages || []),
    s.pinned ? 1 : 0,
    JSON.stringify(s.tags || []),
    s.systemPrompt || s.system_prompt || null,
    s.parentId || s.parent_id || null,
    s.createdAt || s.created_at || Date.now(),
    s.updatedAt || s.updated_at || Date.now(),
    s.userId || s.user_id || userId,
    s.tenantId || s.tenant_id || tenantId
  );
}


function dbSessionToClient(row) {
  return {
    id: row.id,
    title: row.title,
    agentId: row.agent_id,
    messages: JSON.parse(row.messages || '[]'),
    pinned: !!row.pinned,
    tags: JSON.parse(row.tags || '[]'),
    systemPrompt: row.system_prompt,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    tenantId: row.tenant_id,
  };
}

// ── Skill Learning Pipeline — extract skills from conversations and propagate ──
const SKILLS_PORT = 5490;
const SKILLS_KEY = (() => {
  try {
    return readFileSync(join(homedir(), ".shre/vault/shre-skills.key"), "utf-8").trim();
  } catch { return ""; }
})();
const CORTEX_BRIDGE_PORT = 5450;

// HTTPS POST to localhost services with self-signed certs
function localHttpsPost(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = httpsRequest({
      hostname: "127.0.0.1", port, path, method: "POST",
      headers: { "Content-Type": "application/json", ...headers, "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => buf += c);
      res.on("end", () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, json: JSON.parse(buf) }); }
        catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, json: null }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end(data);
  });
}

async function extractAndLogSkills(agentId, conversationText) {
  if (!SKILLS_KEY || !conversationText || conversationText.length < 50) return;

  try {
    // 1. Extract skills from conversation text via shre-skills
    const extractRes = await localHttpsPost(SKILLS_PORT, "/v1/extract",
      { text: conversationText, agentId },
      { Authorization: `Bearer ${SKILLS_KEY}` }
    );
    if (!extractRes.ok || !extractRes.json) return;
    const { extracted, industries } = extractRes.json;
    if (!extracted || extracted.length === 0) return;

    log.info(`[skill-learn] Agent ${agentId}: extracted ${extracted.length} skills, industries: ${industries?.join(", ") || "none"}`);

    // 2. Find the highest-confidence skill and propagate it to peers
    const topSkill = extracted.reduce((a, b) => b.confidence > a.confidence ? b : a);
    if (topSkill.confidence >= 0.6) {
      const inferredLevel = topSkill.confidence >= 0.9 ? 4 : 3;
      localHttpsPost(SKILLS_PORT, "/v1/propagate",
        { sourceAgent: agentId, skill: topSkill.skill, level: inferredLevel },
        { Authorization: `Bearer ${SKILLS_KEY}` }
      ).then((r) => {
        if (r.ok && r.json?.propagatedCount > 0) {
          log.info(`[skill-learn] Propagated ${topSkill.skill} from ${agentId} to ${r.json.propagatedCount} peers`);
        }
      }).catch(() => { /* non-blocking */ });
    }

    // 3. Write learning event to CortexDB for long-term memory
    const learningEvent = {
      data_type: "skill_learning",
      payload: {
        agentId,
        skills: extracted.map(e => ({ skill: e.skill, confidence: e.confidence })),
        industries,
        conversationLength: conversationText.length,
        timestamp: new Date().toISOString(),
      },
      actor: "shre-chat",
    };
    fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(learningEvent),
      signal: AbortSignal.timeout(5000),
    }).catch(() => { /* CortexDB write is best-effort */ });

    // 4. Emit event for shre-meter + shre-monitor observability
    //    Uses CortexDB event type that subscribers can poll
    const observabilityEvent = {
      data_type: "platform_event",
      payload: {
        event_type: "skill.learned",
        service: "shre-chat",
        agentId,
        skillCount: extracted.length,
        topSkill: topSkill?.skill || null,
        topConfidence: topSkill?.confidence || 0,
        industries,
        timestamp: new Date().toISOString(),
      },
      actor: "shre-chat",
    };
    fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(observabilityEvent),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

  } catch (err) {
    log.error("[skill-learn] Error:", err.message);
  }
}

/**
 * Build agent memory block from CortexDB for injection into system prompt.
 * Queries long-term memories + shared knowledge from other agents.
 * Returns formatted markdown or null on failure.
 */
async function buildAgentMemory(agentId) {
  if (!agentId || agentId === "main") return null;
  try {
    const [memoriesRes, sharedRes] = await Promise.all([
      // Long-term agent memories
      fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_type: "agent_memory",
          filters: { agentId, importance: { $gte: 0.3 } },
          limit: 20,
          sort: { created_at: -1 },
        }),
        signal: AbortSignal.timeout(2000),
      }).then(r => r.json()).catch(() => ({ results: [] })),
      // Shared knowledge from other agents
      fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_type: "agent_shared_knowledge",
          filters: { confidence: { $gte: 0.85 } },
          limit: 5,
          sort: { created_at: -1 },
        }),
        signal: AbortSignal.timeout(2000),
      }).then(r => r.json()).catch(() => ({ results: [] })),
    ]);

    const memories = memoriesRes?.results || memoriesRes?.data || [];
    const shared = sharedRes?.results || sharedRes?.data || [];

    if (memories.length === 0 && shared.length === 0) return null;

    const lines = ["## Your Memory (from past sessions)\n"];
    for (const m of memories) {
      const payload = m.payload || m;
      const summary = payload.summary || payload.content || payload.text;
      if (summary) lines.push(`- ${summary.slice(0, 300)}`);
    }
    if (shared.length > 0) {
      lines.push("\n### Shared Knowledge (from other agents)\n");
      for (const s of shared) {
        const payload = s.payload || s;
        const summary = payload.summary || payload.content || payload.text;
        if (summary) lines.push(`- ${summary.slice(0, 200)}`);
      }
    }
    const block = lines.join("\n");
    log.info(`[agent-memory] Injected memory for ${agentId}: ${block.length} chars, ${memories.length} memories, ${shared.length} shared`);
    return block;
  } catch (err) {
    log.warn(`[agent-memory] Failed to build memory for ${agentId}:`, err.message);
    return null;
  }
}

/**
 * Emit a task.complete event to Redis Streams so shre-scorer evaluates this
 * conversation and feeds muscle memory, skills, and training data.
 * Fire-and-forget: never blocks the user.
 */
async function emitConversationComplete(agentId, userMessage, assistantResponse, source = "openclaw", model = "unknown") {
  // Only emit for meaningful exchanges (not trivial greetings)
  if (!assistantResponse || assistantResponse.length < 100) return;
  if (!agentId || agentId === "shre-scorer" || agentId === "system") return;

  try {
    const sessionKey = `chat-${source}-${Date.now()}`;
    const transcript = `User: ${userMessage.slice(0, 4000)}\n\nAssistant: ${assistantResponse.slice(0, 8000)}`;
    await eventBus.publish("task.complete", "info", {
      agentId: agentId || "shre",
      sessionKey,
      taskType: "conversation",
      transcript,
      summary: userMessage.slice(0, 200),
      timestamp: new Date().toISOString(),
      source,
      model,
    });
  } catch { /* event bus may be down — graceful degradation */ }
}

/**
 * Log a completed conversation to CortexDB for the learning pipeline.
 * Fires for every user↔agent exchange — captures both OpenClaw WS and CLI paths.
 * Fire-and-forget: never blocks the user.
 */
async function logConversationToCortex(agentId, userMessage, assistantResponse, source = "openclaw", model = "unknown") {
  if (!userMessage || !assistantResponse || assistantResponse.length < 20) return;
  try {
    const event = {
      data_type: "agent_conversation",
      payload: {
        agentId: agentId || "shre",
        source,
        model,
        userMessage: userMessage.slice(0, 5000),
        assistantResponse: assistantResponse.slice(0, 10000),
        userMessageLength: userMessage.length,
        assistantResponseLength: assistantResponse.length,
        timestamp: new Date().toISOString(),
      },
      actor: "shre-chat",
    };
    fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    }).catch(() => { /* CortexDB write is best-effort */ });

    // Also ingest to Qdrant vectors for semantic search (conversation recall)
    if (assistantResponse.length >= 80) {
      const vectorContent = `[${new Date().toISOString().slice(0, 10)}] User: ${userMessage.slice(0, 200)} | Assistant: ${assistantResponse.slice(0, 300)}`;
      fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/superadmin/rag/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Conversation with ${agentId || "shre"}`,
          content: vectorContent,
          workspace_id: "platform",
          metadata: {
            type: "conversation",
            agentId: agentId || "shre",
            source,
            model,
            importance: "low",
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 day retention
          },
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    // Durable training write — shre-sdk/training (local backup + CortexDB + WAL retry)
    // NEVER truncates — full conversation preserved for fine-tuning pipeline
    writeConversation({
      source: "shre-chat",
      agentId: agentId || "shre",
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantResponse },
      ],
      model: model || "unknown",
      tenantId: "platform",
    }).catch(() => {});

  } catch { /* never block */ }
}

/**
 * Post an agent conversation summary to MIB007 comms so store teams see agent activity.
 * Discovers the first company + first comms channel, then POSTs the summary.
 * Fire-and-forget: never blocks the user.
 */
async function postAgentSummaryToComms(agentId, summary) {
  try {
    // Discover first company
    const companiesRes = await fetch(`http://127.0.0.1:${MIB007_PORT}/api/companies`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!companiesRes.ok) return;
    const companies = await companiesRes.json();
    const companyId = companies?.[0]?.id;
    if (!companyId) return;

    // Discover first comms channel
    const channelsRes = await fetch(`http://127.0.0.1:${MIB007_PORT}/api/companies/${companyId}/comms/channels`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!channelsRes.ok) return;
    const channels = await channelsRes.json();
    const channelId = channels?.[0]?.id;
    if (!channelId) return;

    const chatBaseUrl = process.env.SHRE_CHAT_URL || `https://localhost:${PORT}`;
    await fetch(`http://127.0.0.1:${MIB007_PORT}/api/companies/${companyId}/comms/agent-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        agentId,
        summary: summary.slice(0, 2000),
        sessionUrl: `${chatBaseUrl}/?agent=${encodeURIComponent(agentId)}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* MIB007 may be down — graceful degradation */ }
}

// ── CSRF protection — verify origin on mutating requests ──
function isOriginAllowed(req) {
  const origin = req.headers["origin"] || "";
  const referer = req.headers["referer"] || "";
  // Allow same-origin (localhost on our port)
  if (!origin && !referer) return true; // non-browser clients (curl, etc.)
  const allowed = [
    `http://localhost:${PORT}`, `https://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`, `https://127.0.0.1:${PORT}`,
    "https://chat.nirtek.net", "http://chat.nirtek.net",
    "https://app.nirtek.net", "http://app.nirtek.net",
    "https://shre.nirtek.net", "http://shre.nirtek.net",
  ];
  if (origin && allowed.some((a) => origin.startsWith(a))) return true;
  if (referer && allowed.some((a) => referer.startsWith(a))) return true;
  if (origin && origin.endsWith(".replit.dev")) return true;
  if (referer && referer.includes(".replit.dev")) return true;
  // Cloudflare tunnel: trust requests where X-Forwarded-Host matches *.nirtek.net
  const fwdHost = req.headers["x-forwarded-host"] || "";
  if (fwdHost.endsWith(".nirtek.net") || fwdHost === "nirtek.net") return true;
  return false;
}

// ── Auth — JWT verification for middleware + route deps ──────────────
const AUTH_SIGNING_KEY_PATH = join(homedir(), ".shre", "auth", "signing-key.hex");

let authSigningKey = null;
try {
  authSigningKey = Buffer.from(readFileSync(AUTH_SIGNING_KEY_PATH, "utf8").trim(), "hex");
} catch { /* auth disabled if no key */ }

function verifyAuthToken(token) {
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

/** Check if request has valid auth. Returns claims or null. */
function checkAuth(req) {
  // Check Authorization header first
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return verifyAuthToken(authHeader.slice(7));
  }
  // Check cookie fallback
  const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith("shre_token="));
  if (tokenCookie) {
    return verifyAuthToken(tokenCookie.split("=")[1]);
  }
  return null;
}

// ── Briefing cache (5 min TTL) ────────────────────────────────────
let _briefingCache = null;
let _briefingCacheTs = 0;
let _feedToken = undefined; // Lazy-loaded feed service token

// ── Reminders persistence ─────────────────────────────────────────
const REMINDERS_PATH = join(homedir(), ".shre", "reminders.json");

function loadReminders() {
  try {
    if (!existsSync(REMINDERS_PATH)) return [];
    return JSON.parse(readFileSync(REMINDERS_PATH, "utf8"));
  } catch { return []; }
}

function saveReminders(reminders) {
  const dir = join(homedir(), ".shre");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Atomic write: write to tmp file then rename (prevents corruption on concurrent access)
  const tmpPath = REMINDERS_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(reminders, null, 2));
  renameSync(tmpPath, REMINDERS_PATH);
}

// Auto-cleanup: purge completed reminders older than 30 days (runs daily)
setInterval(() => {
  try {
    const reminders = loadReminders();
    const cutoff = Date.now() - 30 * 86400_000;
    const cleaned = reminders.filter(r => !(r.completed && new Date(r.createdAt).getTime() < cutoff));
    if (cleaned.length < reminders.length) {
      saveReminders(cleaned);
      log.info(`[reminders] Cleaned ${reminders.length - cleaned.length} old completed reminders`);
    }
  } catch { /* best effort */ }
}, 86400_000).unref(); // every 24h

// ── Briefing config persistence ──────────────────────────────────
const BRIEFING_CONFIG_PATH = join(homedir(), ".shre", "chat", "briefing-config.json");

function loadBriefingConfig() {
  try {
    if (!existsSync(BRIEFING_CONFIG_PATH)) return { time: "08:00", enabled: true };
    return JSON.parse(readFileSync(BRIEFING_CONFIG_PATH, "utf8"));
  } catch { return { time: "08:00", enabled: true }; }
}

function saveBriefingConfig(config) {
  const dir = join(homedir(), ".shre", "chat");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = BRIEFING_CONFIG_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  renameSync(tmpPath, BRIEFING_CONFIG_PATH);
}

// ── Background reminder checker — every 60s, log due reminders ────
setInterval(() => {
  try {
    const reminders = loadReminders();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed || r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    if (due.length > 0) {
      for (const d of due) {
        log.info(`[reminders] Due reminder: "${d.text}" (id=${d.id})`);
        const idx = reminders.findIndex(r => r.id === d.id);
        if (idx >= 0) reminders[idx].notified = true;
      }
      saveReminders(reminders);
      // Emit via event bus so WebSocket clients can be notified
      eventBus.emit("reminder.due", { reminders: due.map(r => ({ id: r.id, text: r.text, due: r.due })) });
    }
  } catch (e) {
    log.error("[reminders] Background checker error", {}, e);
  }
}, 60_000).unref(); // every 60s

// ── Shared cookie config — dynamic domain (nirtek.net for tunnel, omit for localhost) ──
function authCookie(name, value, maxAge, req) {
  // Cloudflare tunnel forwards the original host in X-Forwarded-Host / CF headers
  const host = (req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(":")[0];
  const isNirtek = host.endsWith(".nirtek.net") || host === "nirtek.net";
  const domainPart = isNirtek ? "; Domain=.nirtek.net" : "";
  const secure = tlsOpts || isNirtek ? "; Secure" : "";
  // SameSite=None required for cross-origin cookie delivery via Cloudflare tunnel on mobile Safari
  const sameSite = isNirtek ? "None" : "Lax";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}${domainPart}; Max-Age=${maxAge}${secure}`;
}

// Routes that don't require auth
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/check", "/api/auth/verify-2fa", "/api/auth/passport-login", "/api/auth/select-workspace", "/api/health", "/api/verify-identity", "/api/branding/public", "/api/version"]);

// TLS — load certs from ~/.shre/tls/ (mkcert)
const TLS_DIR = join(homedir(), ".shre", "tls");
const TLS_CERT = join(TLS_DIR, "localhost.pem");
const TLS_KEY = join(TLS_DIR, "localhost-key.pem");
let tlsOpts = null;
try {
  if (existsSync(TLS_CERT) && existsSync(TLS_KEY)) {
    tlsOpts = { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) };
    log.info("[shre-chat] TLS enabled — loading certs from", { certDir: TLS_DIR });
  }
} catch { /* fall back to HTTP */ }
const SCHEME = tlsOpts ? "https" : "http";

// ── Rate limiter (fixed-window, in-memory) ──────────────────────────
const rateBuckets = new Map(); // key → { count, resetAt }

function rateLimit(ip, bucket, maxRequests, windowMs) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }
  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

// Clean up expired rate-limit entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) {
    if (now >= entry.resetAt) rateBuckets.delete(key);
  }
}, 60_000).unref();

// ── CLI concurrency guard ────────────────────────────────────────────
let activeCLICount = 0;
const MAX_CLI_CONCURRENT = 2;

// ── URL unfurl cache (max 200 entries) ─────────────────────────────
const unfurlCache = new Map();

// ── Share snapshots (max 500 entries, LRU eviction) ────────────────
const shareStore = new Map(); // id → { title, messages, model, createdAt }
const SHARE_MAX = 500;

function shareId() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

// ── Body collector with size limit ──────────────────────────────────
function collectBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, data, status = 200) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, must-revalidate, private", "Pragma": "no-cache" });
  res.end(JSON.stringify(data));
}

// ── Session reading from OpenClaw JSONL files ────────────────────────

function getSessionsDir(agentId) {
  return join(OPENCLAW_HOME, "agents", agentId, "sessions");
}

function readSessionIndex(agentId) {
  const indexPath = join(getSessionsDir(agentId), "sessions.json");
  if (!existsSync(indexPath)) return {};
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return {};
  }
}

function parseJsonlMessages(content, sinceTs = 0) {
  const messages = [];
  const events = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      const ts = evt.timestamp ? new Date(evt.timestamp).getTime() : 0;
      // Collect all events for feed
      events.push({
        type: evt.type,
        id: evt.id,
        timestamp: evt.timestamp,
        role: evt.message?.role,
        model: evt.message?.model,
        provider: evt.message?.provider,
        stopReason: evt.message?.stopReason,
        usage: evt.message?.usage,
      });
      // Only extract actual messages (user/assistant)
      if (evt.type === "message" && evt.message && ts > sinceTs) {
        const content = evt.message.content;
        // Flatten content array to text
        let text = "";
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("");
        }
        if (text) {
          messages.push({
            role: evt.message.role,
            content: text,
            timestamp: ts,
            id: evt.id,
            model: evt.message.model,
            provider: evt.message.provider,
            usage: evt.message.usage,
            stopReason: evt.message.stopReason,
          });
        }
      }
    } catch { /* skip malformed lines */ }
  }
  return { messages, events };
}

// ── Session writing — persist CLI conversations to OpenClaw JSONL ────

// CLI session file per agent (separate from OpenClaw's native sessions)
const CLI_SESSION_KEY = "cli-chat";

function getOrCreateCliSession(agentId) {
  const sessDir = getSessionsDir(agentId);
  if (!existsSync(sessDir)) mkdirSync(sessDir, { recursive: true });

  // Check if a CLI session already exists in the index
  const index = readSessionIndex(agentId);
  const cliKey = `agent:${agentId}:${CLI_SESSION_KEY}`;

  if (index[cliKey]) {
    return { sessionId: index[cliKey].sessionId, filePath: join(sessDir, `${index[cliKey].sessionId}.jsonl`) };
  }

  // Create new session
  const sessionId = randomUUID();
  const filePath = join(sessDir, `${sessionId}.jsonl`);

  // Write session init event
  const initEvt = {
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: new Date().toISOString(),
    cwd: join(OPENCLAW_HOME, "workspace"),
    source: "shre-chat-cli",
  };
  appendFileSync(filePath, JSON.stringify(initEvt) + "\n");

  // Update session index
  const indexPath = join(sessDir, "sessions.json");
  const existing = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
  existing[cliKey] = { sessionId, updatedAt: new Date().toISOString() };
  writeFileSync(indexPath, JSON.stringify(existing, null, 2));

  return { sessionId, filePath };
}

function appendMessageToSession(agentId, role, content, model, parentId) {
  try {
    const { filePath } = getOrCreateCliSession(agentId);
    const evt = {
      type: "message",
      id: randomUUID().slice(0, 8),
      parentId: parentId || null,
      timestamp: new Date().toISOString(),
      message: {
        role,
        content: [{ type: "text", text: content }],
        timestamp: Date.now(),
        model: model || "claude-cli",
        provider: "cli",
        api: "claude-cli",
      },
    };
    appendFileSync(filePath, JSON.stringify(evt) + "\n");
    return evt.id;
  } catch (err) {
    log.error("[cli-session] Failed to write:", err.message);
    return null;
  }
}

function loadCliHistory(agentId, maxMessages = 20) {
  try {
    const { filePath } = getOrCreateCliSession(agentId);
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, "utf8");
    const { messages } = parseJsonlMessages(content, 0);
    // Return last N messages for context
    return messages.slice(-maxMessages);
  } catch {
    return [];
  }
}

// ── Route module initialization ──────────────────────────────────────
const handleAuth = registerAuthRoutes({ log });
const intentRouter = registerIntentRouter({ log, chatDb });
const handleVoice = registerVoiceRoutes({ log, OPENCLAW_HOST, OPENCLAW_PORT, GATEWAY_TOKEN, chatDb });
const handleTasks = registerTaskRoutes({ log });
const handleSessions = registerSessionRoutes({ log, chatDb, stmtGetAll, stmtGetOne, stmtDelete, stmtSoftDelete, stmtRestoreDeleted, stmtRemoveFromTrash, stmtListDeleted, stmtPurgeTrash, upsertSession, dbSessionToClient, checkAuth });
const handleSuggestions = registerSuggestionsRoutes({ log, loadReminders, getBriefingCache: () => _briefingCache });
const handleHealth = registerHealthRoutes({ log, PORT, tlsOpts, GATEWAY_TOKEN, getActiveCLICount: () => activeCLICount, getActivePty: () => activePty });
const handleReports = registerReportRoutes({ log, chatDb });
const handleHandoff = registerHandoffRoutes({ log, chatDb });
const handleNotifications = registerNotificationRoutes({ log, eventBus, chatDb });
const { handlePushRoute, sendPushToAll } = registerPushRoutes({ log, chatDb });

// ── Request handler ──────────────────────────────────────────────────

// Create both HTTP and HTTPS servers when TLS available (dual-protocol on same port)
const httpsServer = tlsOpts ? createHttpsServer(tlsOpts, requestHandler) : null;
const httpServer = createHttpServer(requestHandler);
const server = httpsServer || httpServer;


// ── Content Security Policy ──────────────────────────────────────
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ws: wss:`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// ── Geo-blocking — only allow US and India ──────────────────────
const ALLOWED_COUNTRIES = new Set(["US", "IN"]);

async function requestHandler(req, res) {
  const url = new URL(req.url ?? "/", `${SCHEME}://localhost:${PORT}`);
  const correlationId = extractCorrelationId(req.headers);
  res.setHeader("x-correlation-id", correlationId);

  // ── Geo-blocking via Cloudflare CF-IPCountry header ──────────
  const country = req.headers["cf-ipcountry"];
  if (country && !ALLOWED_COUNTRIES.has(country)) {
    // Allow health checks through
    if (url.pathname !== "/api/health") {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Access denied — region not allowed");
      return;
    }
  }

  // ── Security headers middleware ────────────────────────────────
  // Wrap writeHead to inject security headers on every response
  // and add CSP only on HTML responses (not API/JSON).
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, reasonOrHeaders, maybeHeaders) {
    // Guard: don't attempt to set headers after they've already been sent
    if (res.headersSent) return res;

    // Normalize arguments — writeHead accepts (code, headers) or (code, reason, headers)
    let headers = maybeHeaders || (typeof reasonOrHeaders === "object" ? reasonOrHeaders : undefined);
    let reason = typeof reasonOrHeaders === "string" ? reasonOrHeaders : undefined;

    // Apply security headers to all responses
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(k, v);
    }

    // Apply CSP only to HTML responses
    const ct = (headers && (headers["Content-Type"] || headers["content-type"])) || res.getHeader("content-type") || "";
    if (typeof ct === "string" && ct.includes("text/html")) {
      res.setHeader("Content-Security-Policy", CSP);
    }

    if (reason) {
      return origWriteHead(statusCode, reason, headers);
    }
    return origWriteHead(statusCode, headers);
  };

  // ── CSRF check on all POST/PUT/DELETE ──────────────────────────
  if (["POST", "PUT", "DELETE"].includes(req.method) && !isOriginAllowed(req)) {
    return json(res, { error: "Origin not allowed" }, 403);
  }

  // ── Route module delegation ────────────────────────────────────
  const _routeUtils = { json, collectBody, rateLimit, authCookie };
  // Auth routes (public — before auth middleware)
  if (await handleAuth(req, res, url, _routeUtils)) return;

  // ── Auth middleware — protect /api/* routes (except public paths) ──
  // Parse JWT claims for auth + tenant context injection on router proxy.
  // checkAuth() verifies the HMAC signature and returns decoded claims.
  // Works for both local JWTs (sub=username) and platform JWTs (sub=UUID, activeWorkspaceId).
  const isPublic = PUBLIC_PATHS.has(url.pathname)
    || url.pathname.startsWith("/api/i18n/translations/")
    || url.pathname === "/api/i18n/available"
    || url.pathname === "/api/push/vapid-key";
  const authClaims = checkAuth(req);
  const isRouterProxy = url.pathname.startsWith("/api/router/");
  if (url.pathname.startsWith("/api/") && !isPublic && !isRouterProxy) {
    if (!authClaims) {
      return json(res, { error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
    }
  }

  // Health routes (after auth for readyz, but health is in PUBLIC_PATHS)
  if (await handleHealth(req, res, url, _routeUtils)) return;
  // Voice routes
  if (await handleVoice(req, res, url, _routeUtils)) return;
  // Task creation routes
  if (await handleTasks(req, res, url, _routeUtils)) return;
  // Suggestions routes
  if (handleSuggestions(req, res, url, _routeUtils)) return;
  // Session persistence routes (SQLite)
  if (await handleSessions(req, res, url, _routeUtils)) return;

  // ── GET /api/chat-sessions/:id/messages — retrieve persisted messages ──
  const msgMatch = url.pathname.match(/^\/api\/chat-sessions\/([^/]+)\/messages$/);
  if (msgMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(msgMatch[1]);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    try {
      const messages = stmtGetMessages.all(sessionId, limit, offset);
      const total = stmtCountMessages.get(sessionId)?.count || 0;
      return json(res, { messages, total, limit, offset });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // Scheduled report routes
  if (await handleReports(req, res, url, _routeUtils)) return;
  // Agent handoff routes
  if (await handleHandoff(req, res, url, _routeUtils)) return;
  // Notification routes
  if (await handleNotifications(req, res, url, _routeUtils)) return;
  // Web Push routes (subscribe/unsubscribe/vapid-key)
  if (await handlePushRoute(req, res, url, _routeUtils)) return;

  // ── Cost dashboard proxies (shre-meter) ──
  if (url.pathname.startsWith("/api/costs/") && req.method === "GET") {
    const meterPath = url.pathname.replace("/api/costs/", "/v1/costs/");
    const qs = url.search || "";
    try {
      const meterUrl = serviceUrl("shre-meter");
      const upstream = await fetch(`${meterUrl}${meterPath}${qs}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Cost proxy failed:", err.message);
      json(res, { error: "shre-meter unreachable" }, 502);
    }
    return;
  }

  // ── Budget proxy (shre-router) ──
  if (url.pathname === "/api/budgets/tenants" && req.method === "GET") {
    try {
      const routerUrl = serviceUrl("shre-router");
      const upstream = await fetch(`${routerUrl}/v1/budgets`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Budget proxy failed:", err.message);
      json(res, { error: "shre-router unreachable" }, 502);
    }
    return;
  }

  // ── Marketplace proxy (shre-hr) ──
  if (url.pathname === "/api/marketplace/agents" && req.method === "GET") {
    try {
      const hrUrl = serviceUrl("shre-hr");
      const upstream = await fetch(`${hrUrl}/v1/agents`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Marketplace proxy failed:", err.message);
      json(res, { error: "shre-hr unreachable" }, 502);
    }
    return;
  }

  // ── Feed analytics proxy (shre-feed) ──
  if (url.pathname === "/api/feed/analytics" && req.method === "GET") {
    try {
      const feedUrl = serviceUrl("shre-feed");
      const upstream = await fetch(`${feedUrl}/v1/feed/analytics${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Feed analytics proxy failed:", err.message);
      json(res, { error: "shre-feed unreachable" }, 502);
    }
    return;
  }

  // ── Task timeline proxy (shre-tasks) ──
  if (url.pathname === "/api/task-timeline" && req.method === "GET") {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const upstream = await fetch(`${tasksUrl}/v1/tasks${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Task timeline proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Finetune status proxy ──
  if (url.pathname.startsWith("/api/finetune/") && req.method === "GET") {
    try {
      const ftUrl = serviceUrl("shre-finetune");
      const ftPath = url.pathname.replace("/api/finetune/", "/v1/pipeline/");
      const upstream = await fetch(`${ftUrl}${ftPath}${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Finetune proxy failed:", err.message);
      json(res, { error: "shre-finetune unreachable" }, 502);
    }
    return;
  }

  // ── Contacts search proxy (shre-contacts) ──
  if (url.pathname === "/api/contacts/search" && req.method === "GET") {
    try {
      const contactsUrl = serviceUrl("shre-contacts");
      const upstream = await fetch(`${contactsUrl}/v1/contacts/search${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Contacts proxy failed:", err.message);
      json(res, { error: "shre-contacts unreachable" }, 502);
    }
    return;
  }

  // ── User preferences (theme sync across apps) ──
  if (url.pathname === "/api/user/preferences") {
    const prefsPath = join(homedir(), ".shre", "user-preferences.json");
    if (req.method === "GET") {
      try {
        const raw = await readFile(prefsPath, "utf-8");
        return json(res, JSON.parse(raw));
      } catch {
        return json(res, {});
      }
    }
    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const incoming = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          // Merge with existing preferences
          let existing = {};
          try { existing = JSON.parse(await readFile(prefsPath, "utf-8")); } catch { /* new file */ }
          const merged = { ...existing, ...incoming, theme: { ...(existing.theme || {}), ...(incoming.theme || {}) } };
          const dir = join(homedir(), ".shre");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          await writeFile(prefsPath, JSON.stringify(merged, null, 2));
          return json(res, merged);
        } catch (err) {
          return json(res, { error: "Invalid JSON: " + err.message }, 400);
        }
      });
      return;
    }
    return json(res, { error: "Method not allowed" }, 405);
  }

  // ── White-label branding proxy (public, unauthenticated) ──
  if (url.pathname === "/api/branding/public" && req.method === "GET") {
    const domain = url.searchParams.get("domain") || "localhost";
    try {
      const brandRes = await fetch(`http://localhost:5416/v1/branding/public/${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (brandRes.ok) {
        const data = await brandRes.json();
        return json(res, data);
      }
    } catch { /* shre-brand not running — return empty defaults */ }
    return json(res, { brandName: "Shre", theme: null });
  }

  // ── Remaining inline routes below ─────────────────────────────────

  // ── Whisper transcription endpoint — accepts audio, returns text (via shre-router) ──
  if (url.pathname === "/api/transcribe" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      const boundary = (req.headers["content-type"] || "").match(/boundary=([^\s;]+)/)?.[1];
      if (!boundary) return json(res, { error: "Missing multipart boundary" }, 400);
      try {
        const routerRes = await fetch(`${serviceUrl("shre-router")}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { "Content-Type": req.headers["content-type"] },
          body,
        });
        const oaBody = await routerRes.text();
        try {
          const result = JSON.parse(oaBody);
          if (routerRes.status >= 400) return json(res, { error: result.error?.message || "Whisper error" }, routerRes.status);
          return json(res, { text: result.text || "" });
        } catch {
          return json(res, { error: "Invalid Whisper response" }, 502);
        }
      } catch (err) {
        return json(res, { error: "Whisper request failed: " + err.message }, 502);
      }
    });
    return;
  }

  // ── TTS endpoint — converts text to speech via shre-router (OpenAI TTS) ──
  if (url.pathname === "/api/tts" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        if (!body.input) return json(res, { error: "Missing input text" }, 400);

        const routerRes = await fetch(`${serviceUrl("shre-router")}/v1/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: body.input,
            voice: body.voice || "nova",
            model: body.model || "tts-1-hd",
            speed: body.speed || 1.05,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!routerRes.ok) {
          const errBody = await routerRes.text();
          return json(res, { error: `TTS failed: ${errBody}` }, routerRes.status);
        }

        const audioBuffer = await routerRes.arrayBuffer();
        res.writeHead(200, {
          "Content-Type": routerRes.headers.get("Content-Type") || "audio/mpeg",
          "Content-Length": audioBuffer.byteLength,
        });
        res.end(Buffer.from(audioBuffer));
      } catch (err) {
        return json(res, { error: "TTS request failed: " + err.message }, 502);
      }
    });
    return;
  }

  // ── Streaming TTS — chunked audio for low-latency playback ──
  if (url.pathname === "/api/tts/stream" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const parsed = JSON.parse(body);
      if (!parsed.input) return json(res, { error: "Missing input text" }, 400);

      const routerRes = await fetch(`${serviceUrl("shre-router")}/v1/audio/speech/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: parsed.input,
          voice: parsed.voice || "nova",
          model: parsed.model || "tts-1-hd",
          speed: parsed.speed || 1.05,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!routerRes.ok) {
        const errBody = await routerRes.text();
        return json(res, { error: `TTS stream failed: ${errBody}` }, routerRes.status);
      }

      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "X-TTS-Provider": routerRes.headers.get("X-TTS-Provider") || "unknown",
        "Cache-Control": "no-cache",
      });

      // Pipe the streaming response body to the client
      const nodeStream = Readable.fromWeb(routerRes.body);
      nodeStream.pipe(res);
      nodeStream.on("error", () => { try { res.end(); } catch {} });
    } catch (err) {
      if (!res.headersSent) return json(res, { error: "TTS stream failed: " + err.message }, 502);
      try { res.end(); } catch {}
    }
    return;
  }

  // ── Run endpoint — execute shell commands directly on the host ──
  if (url.pathname === "/api/run" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const command = body.command?.trim();
        if (!command) return json(res, { error: "Missing command" }, 400);
        if (command.length > 4096) return json(res, { error: "Command too long" }, 400);

        // Block destructive patterns (rm -rf /, shutdown, etc.)
        const blocked = /\brm\s+-rf\s+\/\s*$|\bshutdown\b|\breboot\b|\bmkfs\b|\bdd\s+if=.*of=\/dev/i;
        if (blocked.test(command)) {
          return json(res, { error: "Blocked: potentially destructive command" }, 403);
        }

        log.info("run_command", { command: command.slice(0, 200) });

        const proc = spawn("bash", ["-lc", command], {
          cwd: homedir(),
          timeout: 30000,
          maxBuffer: 1024 * 512,
          env: { ...process.env, HOME: homedir(), PATH: process.env.PATH },
        });

        let stdout = "", stderr = "";
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });

        proc.on("close", (code) => {
          json(res, {
            exitCode: code,
            stdout: stdout.slice(0, 50000),
            stderr: stderr.slice(0, 10000),
            truncated: stdout.length > 50000 || stderr.length > 10000,
          });
        });

        proc.on("error", (err) => {
          json(res, { error: `Spawn failed: ${err.message}`, exitCode: -1 }, 500);
        });
      } catch (err) {
        return json(res, { error: "Invalid request: " + err.message }, 400);
      }
    });
    return;
  }

  // ── Gateway token endpoint — client fetches token at runtime ──
  if (url.pathname === "/api/gateway-token" && req.method === "GET") {
    return json(res, { token: GATEWAY_TOKEN });
  }

  // ── Client Info API ─────────────────────────────────────────────

  // GET /api/client-info — returns client IP, geo hints, and accepts system info POST
  if (url.pathname === "/api/client-info" && req.method === "GET") {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.headers["x-real-ip"]
      || req.socket.remoteAddress
      || "unknown";
    // Clean IPv6-mapped IPv4
    const cleanIp = ip.replace(/^::ffff:/, "");
    return json(res, {
      ip: cleanIp,
      timestamp: new Date().toISOString(),
      headers: {
        userAgent: req.headers["user-agent"] || "",
        acceptLanguage: req.headers["accept-language"] || "",
        referer: req.headers["referer"] || "",
      },
    });
  }

  // POST /api/client-info — frontend sends full system info, we enrich with IP
  if (url.pathname === "/api/client-info" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const clientInfo = JSON.parse(body);
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
        || req.headers["x-real-ip"]
        || req.socket.remoteAddress
        || "unknown";
      const cleanIp = ip.replace(/^::ffff:/, "");

      const enriched = {
        ip: cleanIp,
        timestamp: new Date().toISOString(),
        ...clientInfo,
      };

      // Store latest client info in memory for agents to query
      global.__clientInfo = enriched;
      log.info("[client-info]", JSON.stringify(enriched));
      return json(res, { ok: true, info: enriched });
    } catch {
      return json(res, { error: "Invalid JSON" }, 400);
    }
  }

  // GET /api/client-context — agents can query latest client info
  if (url.pathname === "/api/client-context" && req.method === "GET") {
    return json(res, global.__clientInfo || { error: "No client info yet" });
  }

  // ── Share API — create and retrieve conversation snapshots ───────

  // POST /api/share — create a shareable snapshot
  if (url.pathname === "/api/share" && req.method === "POST") {
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const rl = rateLimit(clientIp, "share", 10, 60_000);
    if (!rl.allowed) {
      return json(res, { error: "Rate limit exceeded", retryAfter: rl.retryAfter }, 429);
    }
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { title, messages, model } = JSON.parse(body);
      if (!messages || !Array.isArray(messages)) {
        return json(res, { error: "messages array required" }, 400);
      }
      // LRU eviction — delete oldest when over limit
      if (shareStore.size >= SHARE_MAX) {
        const oldestKey = shareStore.keys().next().value;
        shareStore.delete(oldestKey);
      }
      const id = shareId();
      shareStore.set(id, { title: title || "Shared chat", messages, model: model || null, createdAt: new Date().toISOString() });
      const shareUrl = `${SCHEME}://localhost:${PORT}/shared/${id}`;
      return json(res, { id, url: shareUrl });
    } catch {
      return json(res, { error: "Invalid JSON" }, 400);
    }
    return;
  }

  // GET /api/share/:id — retrieve a snapshot
  const shareMatch = url.pathname.match(/^\/api\/share\/([a-z0-9]{8})$/);
  if (shareMatch && req.method === "GET") {
    const id = shareMatch[1];
    const snapshot = shareStore.get(id);
    if (!snapshot) return json(res, { error: "Share not found" }, 404);
    // Move to end for LRU freshness
    shareStore.delete(id);
    shareStore.set(id, snapshot);
    return json(res, snapshot);
  }

  // GET /shared/:id — serve SPA so frontend handles rendering
  if (url.pathname.match(/^\/shared\/[a-z0-9]{8}$/)) {
    try {
      const content = readFileSync(join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache, no-store, must-revalidate" });
      res.end(content);
      return;
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
  }

  // ── Session API endpoints ────────────────────────────────────────

  // GET /api/agents — list all agents
  if (url.pathname === "/api/agents" && req.method === "GET") {
    const agentsDir = join(OPENCLAW_HOME, "agents");
    if (!existsSync(agentsDir)) return json(res, []);
    const agents = readdirSync(agentsDir).filter((d) => {
      const p = join(agentsDir, d);
      return statSync(p).isDirectory();
    });
    return json(res, agents);
  }

  // GET /api/sessions/:agentId — list sessions for an agent
  const sessionsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionsMatch && req.method === "GET") {
    const agentId = decodeURIComponent(sessionsMatch[1]);
    const index = readSessionIndex(agentId);
    const sessions = Object.entries(index).map(([key, val]) => ({
      key,
      sessionId: val.sessionId,
      updatedAt: val.updatedAt,
      sessionFile: val.sessionFile,
    }));
    return json(res, sessions);
  }

  // GET /api/sessions/:agentId/:sessionKey?since=<timestamp>&limit=N&offset=M — get messages
  // limit: max messages to return (default: all). offset: skip first N messages.
  // When limit is set, returns from the END of the conversation (most recent).
  const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/([^/]+)$/);
  if (messagesMatch && req.method === "GET") {
    const agentId = decodeURIComponent(messagesMatch[1]);
    const sessionKey = decodeURIComponent(messagesMatch[2]);
    const since = Number(url.searchParams.get("since") || "0");
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : 0;
    const offset = Number(url.searchParams.get("offset") || "0");

    const index = readSessionIndex(agentId);
    const fullKey = `agent:${agentId}:${sessionKey}`;
    const entry = index[fullKey];

    if (!entry) return json(res, { messages: [], events: [], error: "Session not found" }, 404);

    const sessionFile = join(getSessionsDir(agentId), `${entry.sessionId}.jsonl`);
    if (!existsSync(sessionFile)) return json(res, { messages: [], events: [] });

    try {
      const content = await readFile(sessionFile, "utf8");
      const { messages, events } = parseJsonlMessages(content, since);
      const totalMessages = messages.length;

      // Apply pagination: return most recent messages when limit is set
      let paginated = messages;
      if (limit > 0) {
        // offset counts from the end (0 = most recent page)
        const end = totalMessages - offset;
        const start = Math.max(0, end - limit);
        paginated = messages.slice(start, Math.max(0, end));
      }

      return json(res, {
        messages: paginated,
        events,
        sessionId: entry.sessionId,
        updatedAt: entry.updatedAt,
        totalEvents: events.length,
        totalMessages,
        hasMore: limit > 0 && (totalMessages - offset - limit) > 0,
      });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // POST /api/sessions/:agentId/:sessionKey/compact — compact old messages
  // Moves messages older than `keepDays` (default 1) into an archive file,
  // leaving a summary placeholder + the recent messages in the active JSONL.
  const compactMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/([^/]+)\/compact$/);
  if (compactMatch && req.method === "POST") {
    const agentId = decodeURIComponent(compactMatch[1]);
    const sessionKey = decodeURIComponent(compactMatch[2]);

    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    const opts = body ? JSON.parse(body) : {};
    const keepDays = opts.keepDays ?? 1;
    const cutoff = Date.now() - keepDays * 86400000;

    const index = readSessionIndex(agentId);
    const fullKey = `agent:${agentId}:${sessionKey}`;
    const entry = index[fullKey];
    if (!entry) return json(res, { error: "Session not found" }, 404);

    const sessionFile = join(getSessionsDir(agentId), `${entry.sessionId}.jsonl`);
    if (!existsSync(sessionFile)) return json(res, { error: "Session file missing" }, 404);

    try {
      const content = await readFile(sessionFile, "utf8");
      const lines = content.split("\n").filter((l) => l.trim());
      const recentLines = [];
      const archivedLines = [];

      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          const ts = evt.timestamp ? new Date(evt.timestamp).getTime() : Date.now();
          if (ts < cutoff) {
            archivedLines.push(line);
          } else {
            recentLines.push(line);
          }
        } catch {
          recentLines.push(line); // keep unparseable lines
        }
      }

      if (archivedLines.length === 0) {
        return json(res, { compacted: 0, remaining: recentLines.length, archived: 0 });
      }

      // Write archived lines to a separate archive file
      const archiveFile = join(getSessionsDir(agentId), `${entry.sessionId}.archive.jsonl`);
      const existingArchive = existsSync(archiveFile) ? await readFile(archiveFile, "utf8") : "";
      await writeFile(archiveFile, existingArchive + archivedLines.join("\n") + "\n");

      // Add a summary placeholder as the first line of the compacted file
      const summaryEvt = {
        type: "message",
        id: `compact-${Date.now()}`,
        timestamp: new Date(cutoff).toISOString(),
        message: {
          role: "system",
          content: `[${archivedLines.length} older messages archived — ${new Date(cutoff).toLocaleDateString()}]`,
        },
      };
      const compactedContent = JSON.stringify(summaryEvt) + "\n" + recentLines.join("\n") + "\n";
      await writeFile(sessionFile, compactedContent);

      log.info(`[compact] ${agentId}/${sessionKey}: archived ${archivedLines.length}, kept ${recentLines.length}`);
      return json(res, {
        compacted: archivedLines.length,
        remaining: recentLines.length,
        archived: archivedLines.length,
        archiveFile: `${entry.sessionId}.archive.jsonl`,
      });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // GET /api/search?q=<query> — cross-session full-text search
  if (url.pathname === "/api/search" && req.method === "GET") {
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (query.length < 2) return json(res, { results: [] });

    const agentsDir = join(OPENCLAW_HOME, "agents");
    if (!existsSync(agentsDir)) return json(res, { results: [] });

    const results = [];
    const agents = readdirSync(agentsDir).filter((d) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(d)) return false;
      try { return statSync(join(agentsDir, d)).isDirectory(); } catch { return false; }
    });

    for (const agentId of agents) {
      const index = readSessionIndex(agentId);
      for (const [key, val] of Object.entries(index)) {
        if (!/^[a-f0-9-]+$/i.test(val.sessionId)) continue;
        const sessionFile = join(getSessionsDir(agentId), `${val.sessionId}.jsonl`);
        if (!existsSync(sessionFile)) continue;
        try {
          const content = readFileSync(sessionFile, "utf8");
          const lower = content.toLowerCase();
          if (!lower.includes(query)) continue;
          // Count matches and extract preview
          let matches = 0;
          let preview = "";
          for (const line of content.split("\n")) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              // Content can be a string or array of {type, text} blocks
              const raw = evt.message?.content || evt.content || "";
              const text = Array.isArray(raw) ? raw.map((b) => b.text || b.content || "").join(" ") : String(raw);
              if (text.toLowerCase().includes(query)) {
                matches++;
                if (!preview) {
                  const idx = text.toLowerCase().indexOf(query);
                  const start = Math.max(0, idx - 40);
                  const end = Math.min(text.length, idx + query.length + 60);
                  preview = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
                }
              }
            } catch { /* skip line */ }
          }
          if (matches > 0) {
            results.push({ agentId, sessionKey: key, sessionId: val.sessionId, matches, preview });
          }
        } catch { /* skip file */ }
      }
      if (results.length >= 50) break; // cap results
    }

    results.sort((a, b) => b.matches - a.matches);
    return json(res, { results: results.slice(0, 30) });
  }

  // GET /api/feed?since=<timestamp> — get events across ALL agents for feed
  if (url.pathname === "/api/feed" && req.method === "GET") {
    const since = Number(url.searchParams.get("since") || "0");
    const agentsDir = join(OPENCLAW_HOME, "agents");
    if (!existsSync(agentsDir)) return json(res, { entries: [] });

    const entries = [];
    const agents = readdirSync(agentsDir).filter((d) =>
      statSync(join(agentsDir, d)).isDirectory()
    );

    for (const agentId of agents) {
      const index = readSessionIndex(agentId);
      for (const [key, val] of Object.entries(index)) {
        // Only check recently updated sessions
        if (val.updatedAt && new Date(val.updatedAt).getTime() < since) continue;

        const sessionFile = join(getSessionsDir(agentId), `${val.sessionId}.jsonl`);
        if (!existsSync(sessionFile)) continue;

        // Skip files that haven't been modified since the since timestamp (mtime check)
        try {
          const fstat = statSync(sessionFile);
          if (since > 0 && fstat.mtimeMs < since) continue;
        } catch { continue; }

        try {
          const content = readFileSync(sessionFile, "utf8");
          const { messages } = parseJsonlMessages(content, since);
          for (const msg of messages) {
            entries.push({
              agentId,
              sessionKey: key,
              ...msg,
            });
          }
        } catch { /* skip */ }
      }
    }

    // Also fetch MIB007 comms messages for the unified feed
    try {
      if (!global.__mib007CompanyId) {
        const companiesResp = await new Promise((resolve, reject) => {
          const r = httpRequest({ hostname: "127.0.0.1", port: MIB007_PORT, path: "/api/companies", method: "GET" }, (resp) => {
            let d = "";
            resp.on("data", (c) => (d += c));
            resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
          });
          r.on("error", reject);
          r.end();
        });
        const companies = JSON.parse(companiesResp.body);
        if (companies.length > 0 && /^[a-f0-9-]{36}$/i.test(companies[0].id)) {
          global.__mib007CompanyId = companies[0].id;
        }
      }

      if (global.__mib007CompanyId) {
        const channelsResp = await new Promise((resolve, reject) => {
          const cid = global.__mib007CompanyId;
          const r = httpRequest({ hostname: "127.0.0.1", port: MIB007_PORT, path: `/api/companies/${cid}/comms/channels`, method: "GET" }, (resp) => {
            let d = "";
            resp.on("data", (c) => (d += c));
            resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
          });
          r.on("error", reject);
          r.setTimeout(3000, () => { r.destroy(); reject(new Error("timeout")); });
          r.end();
        });

        const channels = JSON.parse(channelsResp.body);
        for (const ch of channels) {
          if (!ch.last_message_at || ch.last_message_at < since) continue;
          try {
            const msgsResp = await new Promise((resolve, reject) => {
              const cid = global.__mib007CompanyId;
              const qs = since > 0 ? `?after=${since}&limit=50` : "?limit=20";
              const r = httpRequest({ hostname: "127.0.0.1", port: MIB007_PORT, path: `/api/companies/${cid}/comms/channels/${ch.id}/messages${qs}`, method: "GET" }, (resp) => {
                let d = "";
                resp.on("data", (c) => (d += c));
                resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
              });
              r.on("error", reject);
              r.setTimeout(3000, () => { r.destroy(); reject(new Error("timeout")); });
              r.end();
            });
            const msgs = JSON.parse(msgsResp.body);
            for (const msg of msgs) {
              if (msg.created_at > since) {
                entries.push({
                  agentId: msg.type === "ai" ? "ellie" : null,
                  sessionKey: `comms:${ch.name}`,
                  role: msg.type === "ai" ? "assistant" : "user",
                  content: msg.content,
                  timestamp: msg.created_at,
                  id: msg.id,
                  source: "comms",
                  channelName: ch.name,
                  userName: msg.user_name,
                });
              }
            }
          } catch { /* skip channel */ }
        }
      }
    } catch (err) {
      // MIB007 comms not reachable — continue with agent sessions only
      log.error("[feed] MIB007 comms fetch failed:", err.message);
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp - b.timestamp);
    return json(res, { entries, count: entries.length });
  }

  // ── Agent Feed proxy (shre-feed) — cached token, shared helper ────
  if (url.pathname.startsWith("/api/agent-feed") && req.method === "GET") {
    const FEED_PORT = 5436;
    // Token cached at module scope (lazy init)
    if (_feedToken === undefined) {
      try { _feedToken = readFileSync(join(homedir(), ".shre", "keys", "shre-feed.key"), "utf8").trim(); } catch { _feedToken = process.env.SHRE_FEED_TOKEN || ""; }
    }
    const feedHeaders = {};
    if (_feedToken) feedHeaders["Authorization"] = `Bearer ${_feedToken}`;

    const feedFetch = async (path, timeoutMs = 10_000) => {
      return fetch(`https://127.0.0.1:${FEED_PORT}${path}`, {
        headers: feedHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });
    };

    // GET /api/agent-feed — paginated feed
    if (url.pathname === "/api/agent-feed") {
      const qs = url.search || "";
      try {
        const resp = await feedFetch(`/v1/feed${qs}`);
        if (!resp.ok) return json(res, { error: `shre-feed returned ${resp.status}` }, resp.status);
        return json(res, await resp.json());
      } catch (err) {
        log.error("[agent-feed] proxy failed:", err.message);
        return json(res, { error: "Feed service unreachable", posts: [], total: 0 }, 503);
      }
    }

    // GET /api/agent-feed/agents — per-agent summary
    if (url.pathname === "/api/agent-feed/agents") {
      try {
        const resp = await feedFetch("/v1/feed/agents");
        return json(res, await resp.json());
      } catch { return json(res, { agents: [] }, 503); }
    }

    // GET /api/agent-feed/unread — unread count
    if (url.pathname === "/api/agent-feed/unread") {
      try {
        const resp = await feedFetch("/v1/feed/unread", 5_000);
        return json(res, await resp.json());
      } catch { return json(res, { count: 0 }, 503); }
    }
  }

  // ── CLI Mode: spawn `claude` CLI and stream response via SSE ────

  if (url.pathname === "/api/cli/chat" && req.method === "POST") {
    let body;
    try { body = await collectBody(req, 5 * 1024 * 1024); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { message, continueConversation, agentId } = JSON.parse(body);
      if (!message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "message required" }));
        return;
      }

      // Concurrency guard — reject if too many CLI sessions active
        if (activeCLICount >= MAX_CLI_CONCURRENT) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Too many CLI sessions running. Please wait." }));
          return;
        }
        activeCLICount++;
        let decremented = false;
        function releaseSlot() {
          if (!decremented) { decremented = true; activeCLICount--; }
        }

        const agent = agentId || "main";

        // Load conversation history and build context-aware prompt
        const history = loadCliHistory(agent, 20);
        let contextPrompt = message;
        if (history.length > 0 && !continueConversation) {
          // Build conversation context so LLM has memory of past CLI chats
          const historyBlock = history.map((m) =>
            `[${m.role === "user" ? "User" : "Assistant"}]: ${m.content.length > 2000 ? m.content.slice(0, 2000) + "..." : m.content}`
          ).join("\n\n");
          contextPrompt = `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n${message}`;
        }

        // Save user message to session
        const userMsgId = appendMessageToSession(agent, "user", message);

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        // Build claude CLI args
        const args = ["-p", contextPrompt, "--output-format", "stream-json", "--verbose"];
        if (continueConversation) {
          // When continuing, don't prepend history (claude CLI has its own --continue context)
          args[1] = message;
          args.push("--continue");
        }

        const cliEnv = { ...process.env, NO_COLOR: "1" };
        delete cliEnv.CLAUDECODE;
        delete cliEnv.CLAUDE_CODE_SESSION;
        delete cliEnv.CLAUDE_CODE_CONVERSATION_ID;

        const proc = spawn("claude", args, {
          env: cliEnv,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let buffer = "";
        let fullResponseText = ""; // Accumulate full response for session saving

        proc.stdout.on("data", (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              // Claude CLI stream-json format:
              // { type: "system", subtype: "init", ... } — session info
              // { type: "assistant", message: { content: [...] }, error: "..." } — response or error
              // { type: "result", result: "...", total_cost_usd: N, duration_ms: N } — final
              if (evt.type === "system") {
                res.write(`data: ${JSON.stringify({ type: "status", event: "init", model: evt.model })}\n\n`);
              } else if (evt.type === "assistant") {
                // Extract text from content blocks
                const content = evt.message?.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === "text" && block.text) {
                      fullResponseText += block.text;
                      res.write(`data: ${JSON.stringify({ type: "delta", text: block.text })}\n\n`);
                    } else if (block.type === "tool_use") {
                      res.write(`data: ${JSON.stringify({ type: "status", event: "tool_use", tool: block.name })}\n\n`);
                    }
                  }
                }
                if (evt.error) {
                  res.write(`data: ${JSON.stringify({ type: "error", error: evt.error })}\n\n`);
                }
              } else if (evt.type === "result") {
                // Use result text if we didn't accumulate from streaming
                if (!fullResponseText && evt.result) fullResponseText = evt.result;
                res.write(`data: ${JSON.stringify({ type: "done", text: evt.result || "", cost: evt.total_cost_usd, duration: evt.duration_ms, model: evt.model, sessionId: evt.session_id })}\n\n`);
              } else if (evt.type === "content_block_delta" && evt.delta?.text) {
                fullResponseText += evt.delta.text;
                res.write(`data: ${JSON.stringify({ type: "delta", text: evt.delta.text })}\n\n`);
              } else {
                res.write(`data: ${JSON.stringify({ type: "status", event: evt.type, subtype: evt.subtype })}\n\n`);
              }
            } catch {
              // Non-JSON output — treat as plain text
              res.write(`data: ${JSON.stringify({ type: "delta", text: line })}\n\n`);
            }
          }
        });

        proc.stderr.on("data", (data) => {
          const text = data.toString().trim();
          if (text) {
            log.error("[cli]", text);
            res.write(`data: ${JSON.stringify({ type: "status", event: "stderr", text })}\n\n`);
          }
        });

        proc.on("close", (code) => {
          if (buffer.trim()) {
            try {
              const evt = JSON.parse(buffer);
              if (evt.type === "result") {
                if (!fullResponseText && evt.result) fullResponseText = evt.result;
                res.write(`data: ${JSON.stringify({ type: "done", text: evt.result || "", cost: evt.cost_usd, duration: evt.duration_ms, model: evt.model })}\n\n`);
              }
            } catch { /* ignore */ }
          }

          // Save assistant response to agent's session
          if (fullResponseText) {
            appendMessageToSession(agent, "assistant", fullResponseText, "claude-cli", userMsgId);
            log.info(`[cli-session] Saved conversation to agent:${agent}:${CLI_SESSION_KEY} (${fullResponseText.length} chars)`);

            // Skill learning pipeline — extract skills from conversation (non-blocking)
            const conversationForSkills = `User: ${message}\n\nAssistant: ${fullResponseText}`;
            extractAndLogSkills(agent, conversationForSkills).catch(() => {});

            // Log conversation to CortexDB for learning pipeline
            logConversationToCortex(agent, message, fullResponseText, "openclaw-cli", "claude-cli").catch(() => {});

            // Emit task.complete → shre-scorer evaluates, feeds muscle memory + skills + training data
            emitConversationComplete(agent, message, fullResponseText, "openclaw-cli", "claude-cli").catch(() => {});

            // RAG conversation learner — extract insights into CortexDB vectors for semantic recall
            conversationLearner.learn(message, fullResponseText, "platform", agent).catch(() => {});

            // Feedback pipeline — report conversation to MIB + Shre + Ellie
            feedbackPipeline.reportKnowledgeLearned("conversation", fullResponseText.slice(0, 200), `chat:${agent}`).catch(() => {});
          }

          releaseSlot();
          res.write(`data: ${JSON.stringify({ type: "end", code })}\n\n`);
          res.end();
        });

        proc.on("error", (err) => {
          releaseSlot();
          res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
          res.end();
        });

        // Handle client disconnect
        req.on("close", () => {
          if (!proc.killed) proc.kill("SIGTERM");
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      }
    return;
  }

  // ── Model Sync (writes to openclaw.json, config-sync plugin picks it up) ──

  if (url.pathname === "/api/model" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { agentId, modelId } = JSON.parse(body);
      if (!agentId || !modelId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "agentId and modelId required" }));
        return;
      }
      const configPath = join(OPENCLAW_HOME, "openclaw.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const list = config?.agents?.list;
      if (!Array.isArray(list)) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "agents.list not found in config" }));
        return;
      }
      const agent = list.find((a) => a.id === agentId);
      if (!agent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: `agent ${agentId} not found` }));
        return;
      }
      // Update the agent's primary model
      if (agent.model && typeof agent.model === "object") {
        agent.model.primary = modelId;
      } else {
        agent.model = { primary: modelId };
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      log.info(`[model-sync] ${agentId} → ${modelId}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, agentId, modelId }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  if (url.pathname === "/api/model" && req.method === "GET") {
    try {
      const agentId = url.searchParams.get("agentId") || "main";
      const configPath = join(OPENCLAW_HOME, "openclaw.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const agent = config?.agents?.list?.find((a) => a.id === agentId);
      const primary = agent?.model?.primary || agent?.model || config?.agents?.defaults?.model?.primary || null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agentId, model: primary }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // ── i18n API — proxy to shre-i18n service + locale management ──────────
  const I18N_PORT = 5407;

  // GET /api/i18n/locale — get current user's locale preference
  if (url.pathname === "/api/i18n/locale" && req.method === "GET") {
    const claims = verifyToken(req);
    if (!claims) return json(res, { effectiveLocale: "en" });
    try {
      const i18nRes = await localHttpsPost(I18N_PORT, `/v1/user/${encodeURIComponent(claims.sub)}/locale`, "", {});
      // localHttpsPost does POST but we need GET — use http.request instead
    } catch {}
    // Fallback — check localStorage-synced preference
    return json(res, { effectiveLocale: "en", userId: claims.sub });
  }

  // PUT /api/i18n/locale — save user's locale preference
  if (url.pathname === "/api/i18n/locale" && req.method === "PUT") {
    const claims = verifyToken(req);
    if (!claims) return json(res, { error: "Unauthorized" }, 401);
    let body;
    try { body = JSON.parse(await collectBody(req)); } catch { return json(res, { error: "Invalid JSON" }, 400); }

    const { locale } = body;
    if (!locale) return json(res, { error: "locale required" }, 400);

    // Save to shre-i18n service
    localHttpsPost(I18N_PORT, `/v1/user/${encodeURIComponent(claims.sub)}/locale`,
      { locale }, { "Content-Type": "application/json" }
    ).catch(() => {});

    return json(res, { ok: true, locale, userId: claims.sub });
  }

  // GET /api/i18n/translations/:service/:locale — proxy translation fetch
  const i18nTxMatch = url.pathname.match(/^\/api\/i18n\/translations\/([^/]+)\/([^/]+)$/);
  if (i18nTxMatch && req.method === "GET") {
    const [, service, locale] = i18nTxMatch;
    try {
      // Use httpsRequest for GET
      const txData = await new Promise((resolve, reject) => {
        const r = httpsRequest({
          hostname: "127.0.0.1", port: I18N_PORT, path: `/v1/translations/${service}/${locale}`,
          method: "GET",
        }, (proxyRes) => {
          let buf = "";
          proxyRes.on("data", c => buf += c);
          proxyRes.on("end", () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
        });
        r.on("error", reject);
        r.setTimeout(3000, () => { r.destroy(); reject(new Error("timeout")); });
        r.end();
      });
      return json(res, txData);
    } catch {
      return json(res, {}); // Service unavailable — empty translations
    }
  }

  // GET /api/i18n/available — list locales available to this user
  if (url.pathname === "/api/i18n/available" && req.method === "GET") {
    const allLocales = ["en", "es", "de", "fr", "pt-BR", "zh-CN", "zh-TW", "hi", "ar", "ja", "ko", "ru", "it", "nl", "tr"];
    // TODO: filter by workspace policy when workspace context is available
    return json(res, { locales: allLocales });
  }

  // ── OpenClaw Channel Webhook ────────────────────────────────────
  // OpenClaw gateway pushes outbound messages here when shre-chat is
  // registered as a channel. We forward them to all connected WS clients.

  if (url.pathname === "/webhook/openclaw" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const payload = JSON.parse(body);
      log.info("[webhook] OpenClaw channel event:", payload.type || "unknown");

      // Broadcast to all connected WebSocket clients
      if (termWss) {
        // Use the main WS server to broadcast — but we don't mix terminal WS
        // The webhook is informational; actual chat already flows via WS proxy
      }

      json(res, { ok: true, received: payload.type || "unknown" });
    } catch (e) {
      json(res, { error: "Invalid JSON" }, 400);
    }
    return;
  }

  // GET /webhook/openclaw — health probe for the channel
  if (url.pathname === "/webhook/openclaw" && req.method === "GET") {
    return json(res, {
      ok: true,
      channel: "shre-chat",
      port: PORT,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  // ── URL unfurl — extract Open Graph metadata for link previews ───

  if (url.pathname === "/api/unfurl" && req.method === "GET") {
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const rl = rateLimit(clientIp, "unfurl", 30, 60_000);
    if (!rl.allowed) {
      return json(res, { error: "Rate limit exceeded", retryAfter: rl.retryAfter }, 429);
    }
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return json(res, { error: "Invalid or missing url parameter" }, 400);
    }

    // SSRF protection — block requests to private/internal networks
    try {
      const parsed = new URL(targetUrl);
      const h = parsed.hostname.toLowerCase();
      if (
        h === "localhost" ||
        h === "0.0.0.0" ||
        h === "::1" ||
        h === "[::1]" ||
        /^127\./.test(h) ||
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h)
      ) {
        return json(res, { error: "URL targets a private/internal address" }, 403);
      }
    } catch {
      return json(res, { error: "Invalid URL" }, 400);
    }

    // Check cache first
    if (unfurlCache.has(targetUrl)) {
      return json(res, unfurlCache.get(targetUrl));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const resp = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "ShreChat/1.0 (link-preview)",
          "Accept": "text/html",
        },
        redirect: "manual",
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        return json(res, { url: targetUrl });
      }

      const html = await resp.text();

      // Extract OG tags
      const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
      const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1];
      const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

      // Fallback to <title> tag
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      // Fallback to meta description
      const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];

      const result = {
        url: targetUrl,
        title: ogTitle || titleTag || null,
        description: ogDesc || metaDesc || null,
        image: ogImage || null,
      };

      // Cache with eviction at 200 entries
      if (unfurlCache.size >= 200) {
        const firstKey = unfurlCache.keys().next().value;
        unfurlCache.delete(firstKey);
      }
      unfurlCache.set(targetUrl, result);

      return json(res, result);
    } catch {
      // Timeout or network error — return empty gracefully
      return json(res, { url: targetUrl });
    }
  }

  // ── Proxy /api/comms/* to MIB007 comms API ─────────────────────────

  if (url.pathname.startsWith("/api/comms/")) {
    // Strip /api/comms prefix → forward as /api/companies/... to MIB007
    // Expected format: /api/comms/channels, /api/comms/channels/:id/messages
    // We need a company ID — fetch it once from MIB007
    if (!global.__mib007CompanyId) {
      try {
        const companiesResp = await new Promise((resolve, reject) => {
          const r = httpRequest({ hostname: "127.0.0.1", port: MIB007_PORT, path: "/api/companies", method: "GET" }, (resp) => {
            let d = "";
            resp.on("data", (c) => (d += c));
            resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
          });
          r.on("error", reject);
          r.setTimeout(5000, () => { r.destroy(); reject(new Error("timeout")); });
          r.end();
        });
        const companies = JSON.parse(companiesResp.body);
        if (companies.length > 0) global.__mib007CompanyId = companies[0].id;
      } catch (err) {
        log.error("[comms-proxy] Failed to fetch company ID:", err.message);
        return json(res, { error: "MIB007 not reachable" }, 502);
      }
    }

    if (!global.__mib007CompanyId) {
      return json(res, { error: "No company configured in MIB007" }, 503);
    }

    // Validate company ID is a UUID
    if (!/^[a-f0-9-]{36}$/i.test(global.__mib007CompanyId)) {
      global.__mib007CompanyId = null;
      return json(res, { error: "Invalid company ID" }, 500);
    }

    // Map: /api/comms/channels → /api/companies/{id}/comms/channels
    const commsPath = url.pathname.replace("/api/comms/", "");
    // Prevent path traversal — only allow alphanumeric, hyphens, slashes, and query params
    if (/\.\./.test(commsPath) || /[^a-zA-Z0-9/_?&=\-%]/.test(commsPath)) {
      return json(res, { error: "Invalid path" }, 400);
    }
    const mibPath = `/api/companies/${global.__mib007CompanyId}/comms/${commsPath}${url.search || ""}`;

    const fwdHeaders = { ...req.headers, host: `127.0.0.1:${MIB007_PORT}` };
    delete fwdHeaders["accept-encoding"];

    const proxyReq = httpRequest(
      { hostname: "127.0.0.1", port: MIB007_PORT, path: mibPath, method: req.method, headers: fwdHeaders },
      (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers["cache-control"] = "no-cache";
        res.writeHead(proxyRes.statusCode ?? 502, headers);
        proxyRes.on("data", (chunk) => res.write(chunk));
        proxyRes.on("end", () => res.end());
      },
    );
    proxyReq.on("error", (err) => {
      log.error("[comms-proxy] MIB007 error:", err.message);
      if (!res.headersSent) json(res, { error: "MIB007 comms unreachable" }, 502);
    });
    req.pipe(proxyReq);
    return;
  }

  // ── POST /api/conversation-log — client reports completed WS conversations for learning ──
  if (url.pathname === "/api/conversation-log" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { agentId, userMessage, assistantResponse, model } = JSON.parse(body);
      if (!userMessage || !assistantResponse) return json(res, { error: "userMessage and assistantResponse required" }, 400);

      // ── Chat audit log — persist every exchange to SQLite for total recall ──
      const traceId = randomUUID();
      try {
        const sessionId = req.headers["x-session-id"] || "unknown";
        const auditUserId = authClaims?.sub || 'system';
        chatDb.prepare(
          `INSERT INTO chat_audit_log (id, session_id, trace_id, event_type, agent_id, model, user_id, user_message, assistant_response, created_at)
           VALUES (?, ?, ?, 'chat_exchange', ?, ?, ?, ?, ?, ?)`
        ).run(randomUUID(), sessionId, traceId, agentId || "shre", model || "unknown",
          auditUserId, userMessage.slice(0, 5000), assistantResponse.slice(0, 10000), Date.now());

        // Auto-summarize session (lightweight — first user message + topic extraction)
        if (sessionId !== "unknown") {
          try {
            const summaryUserId = authClaims?.sub || 'system';
            const existing = chatDb.prepare("SELECT summary FROM chat_sessions WHERE id = ? AND user_id = ?").get(sessionId, summaryUserId);
            if (!existing?.summary) {
              const summary = `${agentId || "shre"}: ${userMessage.slice(0, 100)}${userMessage.length > 100 ? "..." : ""}`;
              chatDb.prepare("UPDATE chat_sessions SET summary = ? WHERE id = ? AND user_id = ?").run(summary, sessionId, summaryUserId);
            }
          } catch {}
        }
      } catch (auditErr) { log.warn("Chat audit log failed", {}, auditErr); }

      // Fire-and-forget: log to CortexDB + extract skills
      logConversationToCortex(agentId || "shre", userMessage, assistantResponse, "openclaw-ws", model || "unknown").catch(() => {});
      const conversationForSkills = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
      extractAndLogSkills(agentId || "shre", conversationForSkills).catch(() => {});

      // Emit task.complete → shre-scorer evaluates, feeds muscle memory + skills + training data
      emitConversationComplete(agentId || "shre", userMessage, assistantResponse, "openclaw-ws", model || "unknown").catch(() => {});

      // RAG conversation learner — extract insights into CortexDB vectors for semantic recall
      conversationLearner.learn(userMessage, assistantResponse, "platform", agentId || "shre").catch(() => {});

      // Feedback pipeline — report conversation to MIB + Shre + Ellie
      feedbackPipeline.reportKnowledgeLearned("conversation", assistantResponse.slice(0, 200), `ws:${agentId || "shre"}`).catch(() => {});

      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // ── Proxy /api/router/* to shre-router (SSE streaming-safe) ──────
  if (url.pathname.startsWith("/api/router/")) {
    const routerPath = url.pathname.replace("/api/router", "");
    const routerUrl = `${serviceUrl("shre-router")}${routerPath}${url.search}`;

    // Capture request body for post-stream learning pipeline
    let reqBody = "";
    try {
      const routerHeaders = { ...req.headers, host: new URL(serviceUrl("shre-router")).host };
      delete routerHeaders["accept-encoding"]; // avoid gzip for streaming
      delete routerHeaders["content-length"]; // body may be modified (memory injection) — let Node use chunked encoding
      // Strip client-supplied trust headers to prevent spoofing, then set from validated JWT
      delete routerHeaders["x-tenant-id"];
      delete routerHeaders["x-user-id"];
      if (authClaims?.activeWorkspaceId) {
        routerHeaders["x-tenant-id"] = authClaims.activeWorkspaceId;
        routerHeaders["x-user-id"] = authClaims.sub;
      }
      const routerReq = (serviceUrl("shre-router").startsWith("https") ? (await import("https")).default : (await import("http")).default).request(
        routerUrl,
        { method: req.method, headers: routerHeaders, rejectUnauthorized: false },
        (routerRes) => {
          // Debug: log.info("[router-proxy] response", { status: routerRes.statusCode, ct: routerRes.headers["content-type"]?.slice(0, 40) });
          const rHeaders = { ...routerRes.headers };
          rHeaders["cache-control"] = "no-cache";
          rHeaders["x-accel-buffering"] = "no";
          res.writeHead(routerRes.statusCode ?? 502, rHeaders);

          // Buffer SSE chunks for post-stream learning (cap at 50KB to avoid memory pressure)
          const chunks = [];
          let totalLen = 0;
          const MAX_CAPTURE = 50 * 1024;

          routerRes.on("data", (chunk) => {
            try { res.write(chunk); } catch { /* client disconnected */ }
            if (totalLen < MAX_CAPTURE) {
              chunks.push(chunk);
              totalLen += chunk.length;
            }
          });
          routerRes.on("end", () => {
            // Debug: log.info("[router-proxy] stream ended", { totalLen });
            try { res.end(); } catch { /* client disconnected */ }
            // Fire-and-forget: extract agent response from SSE and run learning pipeline
            try {
              const sseText = Buffer.concat(chunks).toString("utf8");
              const parsed = JSON.parse(reqBody || "{}");
              const agentId = parsed.agentId || "shre";
              const userMessage = Array.isArray(parsed.messages)
                ? (parsed.messages.filter(m => m.role === "user").pop()?.content || "").slice(0, 5000)
                : "";
              // Extract assistant text from SSE delta events OR plain JSON response
              let assistantResponse = "";
              if (sseText.includes("data: ")) {
                // SSE streaming response
                for (const line of sseText.split("\n")) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const evt = JSON.parse(line.slice(6));
                    if (evt.type === "delta" && evt.content) assistantResponse += evt.content;
                    else if (evt.type === "content_block_delta" && evt.delta?.text) assistantResponse += evt.delta.text;
                  } catch { /* not JSON or not a delta */ }
                }
              } else {
                // Non-streaming JSON response (stream: false)
                try {
                  const jsonRes = JSON.parse(sseText);
                  if (typeof jsonRes.content === "string") assistantResponse = jsonRes.content;
                  else if (Array.isArray(jsonRes.content)) assistantResponse = jsonRes.content.filter(b => b.type === "text").map(b => b.text).join("");
                } catch { /* not valid JSON */ }
              }

              // ── Persist user message to chat_messages ──
              const sessionId = parsed.sessionId || parsed.session_id || req.headers["x-session-id"];
              if (sessionId && userMessage) {
                try {
                  stmtInsertMessage.run(
                    `msg-${Date.now()}-u-${Math.random().toString(36).slice(2, 8)}`,
                    sessionId, "user", userMessage.slice(0, 50000),
                    parsed.model || null, agentId, parsed.userId || "system", "{}", Date.now()
                  );
                } catch { /* best-effort */ }
              }

              if (userMessage && assistantResponse.length >= 80) {
                const model = parsed.model || "unknown";
                logConversationToCortex(agentId, userMessage, assistantResponse, "router-proxy", model).catch(() => {});
                emitConversationComplete(agentId, userMessage, assistantResponse, "router-proxy", model).catch(() => {});
                conversationLearner.learn(userMessage, assistantResponse, "platform", agentId).catch(() => {});
                extractAndLogSkills(agentId, `User: ${userMessage}\n\nAssistant: ${assistantResponse}`).catch(() => {});
                // Push agent-summary to MIB007 comms for store-facing agents
                if (agentId !== "shre" && agentId !== "main") {
                  postAgentSummaryToComms(agentId, assistantResponse.slice(0, 500)).catch(() => {});
                }
                // ── Persist assistant message to chat_messages ──
                if (sessionId) {
                  try {
                    stmtInsertMessage.run(
                      `msg-${Date.now()}-a-${Math.random().toString(36).slice(2, 8)}`,
                      sessionId, "assistant", assistantResponse.slice(0, 50000),
                      parsed.model || null, agentId, "system", "{}", Date.now()
                    );
                  } catch { /* best-effort */ }
                }
                // ── Auto-summarize every 10 messages → agent memory in CortexDB ──
                if (sessionId) {
                  try {
                    const msgCount = stmtCountMessages.get(sessionId)?.count || 0;
                    if (msgCount > 0 && msgCount % 10 === 0) {
                      const recentMsgs = stmtGetMessages.all(sessionId, 10, Math.max(0, msgCount - 10));
                      const convoText = recentMsgs.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join("\n");
                      const memorySummary = {
                        data_type: "agent_memory",
                        payload: {
                          agentId,
                          category: "relationship",
                          summary: `Session ${sessionId} (msgs ${msgCount - 9}-${msgCount}): ${convoText.slice(0, 1000)}`,
                          importance: 0.5,
                          sessionId,
                          messageCount: msgCount,
                          timestamp: new Date().toISOString(),
                        },
                        actor: "shre-chat",
                      };
                      fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/write`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(memorySummary),
                        signal: AbortSignal.timeout(5000),
                      }).catch(() => {});
                    }
                  } catch { /* auto-summarize is best-effort */ }
                }
              }
            } catch { /* learning pipeline is best-effort */ }
          });
        },
      );
      routerReq.on("error", (err) => {
        log.error("[router-proxy] shre-router error:", err.message);
        if (!res.headersSent) { res.writeHead(502); res.end(JSON.stringify({ error: "shre-router unreachable" })); }
      });
      // Buffer request body for memory injection
      const reqChunks = [];
      req.on("data", (chunk) => { reqChunks.push(chunk); reqBody += chunk; });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(reqBody || "{}");
          const agentId = parsed.agentId || "shre";

          // ── Agent memory injection ──
          const memoryBlock = await buildAgentMemory(agentId).catch(() => null);
          if (memoryBlock && parsed.systemPrompt !== undefined) {
            parsed.systemPrompt = memoryBlock + "\n\n" + (parsed.systemPrompt || "");
          } else if (memoryBlock) {
            // Inject as first system message or add systemPrompt field
            parsed.systemPrompt = memoryBlock;
          }

          routerReq.end(JSON.stringify(parsed));
        } catch {
          // If JSON parse fails, forward raw body
          for (const chunk of reqChunks) routerReq.write(chunk);
          routerReq.end();
        }
      });
    } catch (err) {
      log.error("[router-proxy] proxy failed:", err.message);
      if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: "Proxy error" })); }
    }
    return;
  }

  // ── Proxy /v1/* through shre-router (enforces trust gate, budgets, cost tracking) ──
  // All /v1/ requests route through shre-router — no direct OpenClaw bypass.

  if (url.pathname.startsWith("/v1/")) {
    const routerBase = serviceUrl("shre-router");
    const routerUrl = `${routerBase}${url.pathname}${url.search}`;
    try {
      const routerHeaders = { ...req.headers, host: new URL(routerBase).host };
      delete routerHeaders["accept-encoding"];
      // Strip client-supplied trust headers, inject from validated JWT
      delete routerHeaders["x-tenant-id"];
      delete routerHeaders["x-user-id"];
      if (authClaims?.activeWorkspaceId) {
        routerHeaders["x-tenant-id"] = authClaims.activeWorkspaceId;
        routerHeaders["x-user-id"] = authClaims.sub;
      }
      const routerReq = (routerBase.startsWith("https") ? (await import("https")).default : (await import("http")).default).request(
        routerUrl,
        { method: req.method, headers: routerHeaders, rejectUnauthorized: false },
        (routerRes) => {
          const rHeaders = { ...routerRes.headers };
          rHeaders["cache-control"] = "no-cache";
          rHeaders["x-accel-buffering"] = "no";
          res.writeHead(routerRes.statusCode ?? 502, rHeaders);
          routerRes.on("data", (chunk) => { try { res.write(chunk); } catch {} });
          routerRes.on("end", () => { try { res.end(); } catch {} });
        },
      );
      routerReq.on("error", (err) => {
        log.error("[v1-proxy] shre-router error:", err.message);
        if (!res.headersSent) { res.writeHead(502); res.end(JSON.stringify({ error: "shre-router unreachable" })); }
      });
      req.on("data", (chunk) => routerReq.write(chunk));
      req.on("end", () => routerReq.end());
    } catch (err) {
      log.error("[v1-proxy] proxy failed:", err.message);
      if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: "Proxy error" })); }
    }
    return;
  }

  // ── Briefing — personal assistant daily briefing ──────────────────
  if (url.pathname === "/api/briefing" && req.method === "GET") {
    // Server-side cache (5 minutes)
    if (_briefingCache && Date.now() - _briefingCacheTs < 300_000) {
      return json(res, _briefingCache);
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning, Nir" : hour < 17 ? "Good afternoon, Nir" : "Good evening, Nir";
    const sections = {};
    const warnings = [];

    // Fetch tasks (via pipeline briefing), agent activity, and calendar in parallel
    const [taskResult, pipelineResult, agentResult, calendarResult] = await Promise.allSettled([
      // 1. Aggregate tasks from shre-tasks
      (async () => {
        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?limit=20&status=pending`, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!taskRes.ok) throw new Error("tasks API error");
        const taskData = await taskRes.json();
        const tasks = taskData.tasks || taskData || [];
        const today = new Date().toDateString();
        const overdue = tasks.filter(t => t.due && new Date(t.due) < new Date() && t.status !== "done");
        const dueToday = tasks.filter(t => t.due && new Date(t.due).toDateString() === today);
        return {
          total: tasks.length, overdue: overdue.length, due_today: dueToday.length,
          items: [...overdue, ...dueToday].slice(0, 8).map(t => ({
            title: t.title || t.name || "Untitled", status: t.status || "pending",
            priority: t.priority || "normal",
            due: t.due ? new Date(t.due).toLocaleDateString([], { month: "short", day: "numeric" }) : null,
          })),
        };
      })(),
      // 1b. Pipeline briefing from shre-tasks (approvals, objectives, stats)
      (async () => {
        const briefRes = await fetch(`${serviceUrl("shre-tasks")}/v1/briefing`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!briefRes.ok) return null;
        return await briefRes.json();
      })(),
      // 2. Agent activity — scan recent sessions (tail-read optimization)
      (async () => {
        const agentsDir = join(OPENCLAW_HOME, "agents");
        if (!existsSync(agentsDir)) return null;
        const allEntries = await readdir(agentsDir);
        const agents = [];
        for (const d of allEntries) {
          const s = await stat(join(agentsDir, d));
          if (s.isDirectory()) agents.push(d);
        }
        const dayAgo = Date.now() - 86400_000;
        const agentActivity = [];
        let totalToday = 0;
        const recentConversations = [];

        for (const agentId of agents.slice(0, 20)) {
          try {
            const sessDir = getSessionsDir(agentId);
            if (!existsSync(sessDir)) continue;
            const index = readSessionIndex(agentId);
            let agentMsgCount = 0;
            let lastTs = 0;

            for (const [key, entry] of Object.entries(index)) {
              const filePath = join(sessDir, `${entry.sessionId}.jsonl`);
              if (!existsSync(filePath)) continue;
              try {
                const stat = statSync(filePath);
                if (stat.mtimeMs > dayAgo) {
                  // Read only last 8KB for preview (tail-read optimization)
                  const fileSize = stat.size;
                  const readSize = Math.min(fileSize, 8192);
                  const fd = openSync(filePath, "r");
                  const buf = Buffer.alloc(readSize);
                  readSync(fd, buf, 0, readSize, Math.max(0, fileSize - readSize));
                  closeSync(fd);
                  let content = buf.toString("utf8");
                  // If we read from middle, skip first partial line
                  if (fileSize > readSize) {
                    const nlIdx = content.indexOf("\n");
                    if (nlIdx >= 0) content = content.slice(nlIdx + 1);
                  }
                  const { messages } = parseJsonlMessages(content, dayAgo);
                  agentMsgCount += messages.length;
                  totalToday += messages.length;
                  if (messages.length > 0) {
                    const lastMsg = messages[messages.length - 1];
                    if (lastMsg.timestamp > lastTs) lastTs = lastMsg.timestamp;
                    recentConversations.push({
                      agent: agentId,
                      preview: (lastMsg.content || "").slice(0, 100),
                      time: new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      timestamp: lastMsg.timestamp,
                    });
                  }
                }
              } catch { /* skip broken sessions */ }
            }

            if (agentMsgCount > 0) {
              let name = agentId;
              try {
                const profilePath = join(OPENCLAW_HOME, "agents", agentId, "agent", "profile.json");
                if (existsSync(profilePath)) {
                  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
                  name = profile.name || profile.displayName || agentId;
                }
              } catch { /* use id as fallback */ }
              agentActivity.push({ id: agentId, name, lastActivity: lastTs ? new Date(lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—", messageCount: agentMsgCount });
            }
          } catch { /* skip broken agent dirs */ }
        }

        agentActivity.sort((a, b) => b.messageCount - a.messageCount);
        recentConversations.sort((a, b) => b.timestamp - a.timestamp);
        return { agents: { active: agentActivity.length, total: agents.length, recent: agentActivity.slice(0, 5) },
          conversations: { today: totalToday, unread: 0, recent: recentConversations.slice(0, 5) } };
      })(),
      // 3. Calendar — fetch upcoming events via check-calendar.mjs child process
      (async () => {
        const calScript = join(import.meta.dirname, "..", "shre-gmail", "check-calendar.mjs");
        if (!existsSync(calScript)) return null;
        return new Promise((resolve) => {
          let stdout = "";
          const proc = spawn("node", [calScript], {
            timeout: 5000,
            env: { ...process.env, HOME: homedir() },
            stdio: ["pipe", "pipe", "pipe"],
          });
          proc.stdout.on("data", (c) => { stdout += c; });
          proc.on("close", (code) => {
            try {
              if (code === 0 && stdout.trim()) {
                const data = JSON.parse(stdout);
                const events = data.events || data || [];
                const now = new Date();
                resolve({
                  upcoming: events.length,
                  items: events.slice(0, 5).map(e => {
                    const start = new Date(e.start || e.startTime);
                    const minutesAway = Math.max(0, Math.round((start - now) / 60000));
                    return {
                      title: e.title || e.summary || "(no title)",
                      time: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      minutesAway,
                      meetingUrl: e.meetingUrl || e.hangoutLink || null,
                    };
                  }),
                });
              } else { resolve(null); }
            } catch { resolve(null); }
          });
          proc.on("error", () => resolve(null));
        });
      })(),
    ]);

    if (taskResult.status === "fulfilled") sections.tasks = taskResult.value;
    else warnings.push("Tasks service unreachable");

    // Merge pipeline briefing data (pending approvals, active objectives)
    if (pipelineResult.status === "fulfilled" && pipelineResult.value) {
      const pipeline = pipelineResult.value;
      sections.pipeline = {
        pending_approvals: pipeline.pending_approvals || [],
        active_objectives: pipeline.active_objectives || [],
        completed_today: (pipeline.completed_today || []).slice(0, 5),
        stats: pipeline.stats || {},
      };
    }

    if (agentResult.status === "fulfilled" && agentResult.value) {
      sections.agents = agentResult.value.agents;
      sections.conversations = agentResult.value.conversations;
    } else { warnings.push("Agent scan failed"); }

    if (calendarResult.status === "fulfilled" && calendarResult.value) {
      sections.calendar = calendarResult.value;
    }

    // 4. Reminders
    try {
      const reminders = loadReminders();
      const now = new Date();
      const upcoming = reminders.filter(r => !r.completed && new Date(r.snoozed || r.due) >= now);
      const overdueReminders = reminders.filter(r => !r.completed && new Date(r.snoozed || r.due) < now);
      sections.reminders = {
        upcoming: upcoming.length + overdueReminders.length,
        items: [...overdueReminders.map(r => ({ ...r, overdue: true })), ...upcoming.slice(0, 5).map(r => ({ ...r, overdue: false }))]
          .slice(0, 8)
          .map(r => ({
            id: r.id,
            text: r.text,
            due: new Date(r.due).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            overdue: r.overdue,
          })),
      };
    } catch { /* reminders unavailable */ }

    // 4. Tip of the day
    const tips = [
      'Say "Hey Shre" to use voice commands hands-free.',
      "Use Cmd+G to search across all conversations.",
      "Pin important sessions so they stay at the top of your sidebar.",
      "Tag conversations with colors for quick filtering.",
      "Try the Compare mode to test different models side by side.",
      "You can snooze reminders from the Reminders view.",
      "The Feed view shows activity across all your agents in one place.",
      "Use Cmd+F to search within the current conversation.",
      "Branch a conversation to explore a different direction without losing context.",
      "Set up recurring reminders for daily standups or weekly reviews.",
    ];
    sections.tip = tips[Math.floor(Date.now() / 86400_000) % tips.length];

    const briefingData = { greeting, timestamp: new Date().toISOString(), sections, warnings: warnings.length > 0 ? warnings : undefined };
    _briefingCache = briefingData;
    _briefingCacheTs = Date.now();
    return json(res, briefingData);
  }

  // ── Status bar — lightweight endpoint for persistent status bar ──
  if (url.pathname === "/api/status-bar" && req.method === "GET") {
    const reminders = loadReminders();
    const now = new Date();
    const active = reminders.filter(r => !r.completed);
    const overdue = active.filter(r => new Date(r.snoozed || r.due) < now);
    const nextReminder = active
      .filter(r => new Date(r.snoozed || r.due) > now)
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];

    // Get next calendar event from briefing cache if available
    let nextEvent = null;
    if (_briefingCache?.sections?.calendar?.items?.length > 0) {
      nextEvent = _briefingCache.sections.calendar.items[0];
    }

    // Task count from briefing cache
    const tasksDue = _briefingCache?.sections?.tasks?.due_today ?? 0;
    const tasksOverdue = _briefingCache?.sections?.tasks?.overdue ?? 0;

    // Fetch active agent count from shre-fleet /health (with timeout + fallback)
    let activeAgents = 0;
    try {
      const fleetRes = await fetch(`${serviceUrl("shre-fleet")}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        activeAgents = fleetData.activeAgents ?? fleetData.active ?? 0;
      }
    } catch { /* shre-fleet unreachable — show 0 */ }

    // Fetch pending tasks count from shre-tasks (with timeout + fallback)
    let pendingTasks = 0;
    try {
      const tasksRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?limit=100&status=in_progress`, {
        signal: AbortSignal.timeout(2000),
        headers: req.headers["authorization"] ? { Authorization: req.headers["authorization"] } : {},
      });
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        pendingTasks = Array.isArray(tasksData) ? tasksData.length : 0;
      }
    } catch { /* shre-tasks unreachable — show 0 */ }

    // Check OpenClaw gateway connectivity (gateway is HTTP, not HTTPS)
    let gatewayConnected = false;
    try {
      const gwReq = httpRequest({
        hostname: OPENCLAW_HOST, port: OPENCLAW_PORT, path: "/health",
        method: "GET", timeout: 1500,
      });
      gatewayConnected = await new Promise((resolve) => {
        gwReq.on("response", (r) => { r.resume(); resolve(r.statusCode < 500); });
        gwReq.on("error", () => resolve(false));
        gwReq.on("timeout", () => { gwReq.destroy(); resolve(false); });
        gwReq.end();
      });
    } catch { /* gateway unreachable */ }

    return json(res, {
      reminders: { active: active.length, overdue: overdue.length },
      nextReminder: nextReminder ? { text: nextReminder.text, due: nextReminder.due } : null,
      nextEvent,
      tasks: { due: tasksDue, overdue: tasksOverdue },
      streaming: activeCLICount > 0,
      // V2 fields
      gatewayConnected,
      activeAgents,
      pendingTasks,
    });
  }

  // ── Reminders — personal assistant reminders system ──────────────

  // GET /api/reminders — list all reminders
  if (url.pathname === "/api/reminders" && req.method === "GET") {
    return json(res, { reminders: loadReminders() });
  }

  // POST /api/reminders — create a reminder
  if (url.pathname === "/api/reminders" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { text, due, recurring } = JSON.parse(body);
      if (!text || !due) return json(res, { error: "text and due required" }, 400);
      // Sanitize: strip HTML, enforce max length, validate due date
      const cleanText = String(text).replace(/<[^>]*>/g, "").slice(0, 500).trim();
      if (!cleanText) return json(res, { error: "text cannot be empty after sanitization" }, 400);
      if (isNaN(new Date(due).getTime())) return json(res, { error: "invalid due date" }, 400);
      if (recurring && !["daily", "weekly", "monthly"].includes(recurring)) return json(res, { error: "recurring must be daily, weekly, or monthly" }, 400);
      const reminder = {
        id: randomUUID().slice(0, 12),
        text: cleanText,
        due,
        recurring: recurring || null,
        completed: false,
        snoozed: null,
        createdAt: new Date().toISOString(),
        source: "manual",
      };
      const reminders = loadReminders();
      reminders.push(reminder);
      saveReminders(reminders);
      return json(res, { ok: true, reminder });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // GET /api/reminders/due — check for due reminders (for notifications)
  if (url.pathname === "/api/reminders/due" && req.method === "GET") {
    const reminders = loadReminders();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed) return false;
      if (r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    // Mark as notified
    if (due.length > 0) {
      for (const d of due) {
        const idx = reminders.findIndex(r => r.id === d.id);
        if (idx >= 0) reminders[idx].notified = true;
      }
      saveReminders(reminders);
    }
    return json(res, { due });
  }

  // POST /api/reminders/parse — natural language parsing via Claude
  if (url.pathname === "/api/reminders/parse" && req.method === "POST") {
    // Rate limit: 10 NL parses per minute per IP
    const parseIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const parseRl = rateLimit(parseIp, "reminder-parse", 10, 60_000);
    if (!parseRl.allowed) return json(res, { error: "Too many parse requests", retryAfter: parseRl.retryAfter }, 429);

    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { text } = JSON.parse(body);
      if (!text) return json(res, { error: "text required" }, 400);
      if (text.length > 500) return json(res, { error: "text too long (max 500 chars)" }, 400);

      const now = new Date();
      const systemPrompt = `Parse reminder requests and extract structured data. Current date/time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long" })}).

Respond with ONLY valid JSON (no markdown, no explanation):
{"text": "the reminder text", "due": "ISO 8601 timestamp", "recurring": null or "daily" or "weekly" or "monthly"}

Examples:
"Remind me to call John at 3pm" → {"text": "Call John", "due": "2026-03-17T15:00:00", "recurring": null}
"Every Monday review PRs at 10am" → {"text": "Review PRs", "due": "2026-03-23T10:00:00", "recurring": "weekly"}`;

      const apiRes = await fetch(`${serviceUrl("shre-router")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-haiku-4-5",
          max_tokens: 200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!apiRes.ok) return json(res, { error: "AI parsing failed" }, 502);
      const apiData = await apiRes.json();
      let responseText = (apiData.choices?.[0]?.message?.content || "").trim();
      // Strip markdown code fences if present
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      }
      const parsed = JSON.parse(responseText);
      return json(res, parsed);
    } catch (e) {
      return json(res, { error: "Failed to parse reminder: " + e.message }, 400);
    }
  }

  // PUT /api/reminders/:id — update a reminder
  const reminderUpdateMatch = url.pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderUpdateMatch && req.method === "PUT") {
    const id = reminderUpdateMatch[1];
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const updates = JSON.parse(body);
      const reminders = loadReminders();
      const idx = reminders.findIndex(r => r.id === id);
      if (idx < 0) return json(res, { error: "Not found" }, 404);

      if (updates.completed !== undefined) {
        reminders[idx].completed = updates.completed;
        // If completing a recurring reminder, create the next one
        if (updates.completed && reminders[idx].recurring) {
          const next = { ...reminders[idx], id: randomUUID().slice(0, 12), completed: false, notified: false, snoozed: null, createdAt: new Date().toISOString() };
          const due = new Date(next.due);
          if (next.recurring === "daily") due.setDate(due.getDate() + 1);
          else if (next.recurring === "weekly") due.setDate(due.getDate() + 7);
          else if (next.recurring === "monthly") due.setMonth(due.getMonth() + 1);
          next.due = due.toISOString();
          reminders.push(next);
        }
      }
      if (updates.snoozed !== undefined) {
        reminders[idx].snoozed = updates.snoozed;
        reminders[idx].notified = false; // reset notification flag on snooze
      }
      if (updates.text !== undefined) reminders[idx].text = updates.text;
      if (updates.due !== undefined) reminders[idx].due = updates.due;

      saveReminders(reminders);
      return json(res, { ok: true, reminder: reminders[idx] });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // DELETE /api/reminders/:id — delete a reminder
  if (reminderUpdateMatch && req.method === "DELETE") {
    const id = reminderUpdateMatch[1];
    const reminders = loadReminders();
    const filtered = reminders.filter(r => r.id !== id);
    if (filtered.length === reminders.length) return json(res, { error: "Not found" }, 404);
    saveReminders(filtered);
    return json(res, { ok: true });
  }

  // ── /v1/ API routes — external service-to-service interface ──────

  // GET /v1/briefing — generate morning briefing (proxies to /api/briefing logic)
  if (url.pathname === "/v1/briefing" && req.method === "GET") {
    // Reuse briefing cache
    if (_briefingCache && Date.now() - _briefingCacheTs < 300_000) {
      return json(res, _briefingCache);
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const sections = {};
    const warnings = [];

    // Aggregate from shre-tasks (pipeline briefing + raw tasks), shre-health, shre-meter in parallel
    const [taskResult, pipelineBriefResult, healthResult, budgetResult] = await Promise.allSettled([
      // 1. Pending tasks from shre-tasks
      (async () => {
        const taskRes = await fetch(`${serviceUrl("shre-tasks")}/v1/tasks?limit=20&status=pending`, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!taskRes.ok) throw new Error("tasks API error");
        const taskData = await taskRes.json();
        const tasks = taskData.tasks || taskData || [];
        const today = new Date().toDateString();
        const overdue = tasks.filter(t => t.due && new Date(t.due) < new Date() && t.status !== "done");
        const dueToday = tasks.filter(t => t.due && new Date(t.due).toDateString() === today);
        return {
          total: tasks.length, overdue: overdue.length, due_today: dueToday.length,
          items: [...overdue, ...dueToday].slice(0, 8).map(t => ({
            title: t.title || t.name || "Untitled", status: t.status || "pending",
            priority: t.priority || "normal",
            due: t.due ? new Date(t.due).toLocaleDateString([], { month: "short", day: "numeric" }) : null,
          })),
        };
      })(),
      // 1b. Pipeline briefing (pending approvals, objectives, stats)
      (async () => {
        const briefRes = await fetch(`${serviceUrl("shre-tasks")}/v1/briefing`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!briefRes.ok) return null;
        return await briefRes.json();
      })(),
      // 2. Agent activity from shre-health
      (async () => {
        const healthRes = await fetch(`${serviceUrl("shre-health")}/v1/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!healthRes.ok) throw new Error("health API error");
        return await healthRes.json();
      })(),
      // 3. Budget status from shre-meter
      (async () => {
        const budgetRes = await fetch(`${serviceUrl("shre-meter")}/v1/budget/check`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!budgetRes.ok) throw new Error("meter API error");
        return await budgetRes.json();
      })(),
    ]);

    if (taskResult.status === "fulfilled") {
      sections.tasks = taskResult.value;
    } else {
      warnings.push("Tasks unavailable");
    }

    // Merge pipeline briefing data (pending approvals, objectives)
    if (pipelineBriefResult.status === "fulfilled" && pipelineBriefResult.value) {
      const pipeline = pipelineBriefResult.value;
      sections.pipeline = {
        pending_approvals: pipeline.pending_approvals || [],
        active_objectives: pipeline.active_objectives || [],
        completed_today: (pipeline.completed_today || []).slice(0, 5),
        stats: pipeline.stats || {},
      };
    }

    if (healthResult.status === "fulfilled") {
      const health = healthResult.value;
      const services = health.services || [];
      sections.agents = {
        active: services.filter(s => s.status === "up" || s.healthy).length,
        total: services.length,
        recent: services.slice(0, 5).map(s => ({
          id: s.name || s.id, name: s.name || s.id,
          lastActivity: s.lastSeen || s.checkedAt || "unknown",
          status: s.status || (s.healthy ? "up" : "down"),
        })),
      };
    } else {
      warnings.push("Agent status unavailable");
    }

    if (budgetResult.status === "fulfilled") {
      sections.budget = budgetResult.value;
    } else {
      warnings.push("Budget status unavailable");
    }

    // Include active reminders summary
    const reminders = loadReminders();
    const now = new Date();
    const activeReminders = reminders.filter(r => !r.completed);
    const overdueReminders = activeReminders.filter(r => new Date(r.snoozed || r.due) < now);
    sections.reminders = {
      upcoming: activeReminders.length,
      items: activeReminders.slice(0, 5).map(r => ({
        id: r.id, text: r.text,
        due: new Date(r.due).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        overdue: new Date(r.snoozed || r.due) < now,
      })),
    };

    const briefingData = {
      greeting, timestamp: new Date().toISOString(), sections,
      config: loadBriefingConfig(),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
    _briefingCache = briefingData;
    _briefingCacheTs = Date.now();
    return json(res, briefingData);
  }

  // POST /v1/briefing/config — update briefing preferences
  if (url.pathname === "/v1/briefing/config" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const updates = JSON.parse(body);
      const config = loadBriefingConfig();
      if (updates.time !== undefined) {
        // Validate HH:MM format
        if (!/^\d{2}:\d{2}$/.test(updates.time)) return json(res, { error: "time must be HH:MM format" }, 400);
        config.time = updates.time;
      }
      if (updates.enabled !== undefined) {
        config.enabled = !!updates.enabled;
      }
      saveBriefingConfig(config);
      return json(res, { ok: true, config });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // GET /v1/briefing/config — read briefing preferences
  if (url.pathname === "/v1/briefing/config" && req.method === "GET") {
    return json(res, loadBriefingConfig());
  }

  // GET /v1/reminders — list active reminders
  if (url.pathname === "/v1/reminders" && req.method === "GET") {
    return json(res, { reminders: loadReminders() });
  }

  // POST /v1/reminders — create a reminder
  if (url.pathname === "/v1/reminders" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const parsed = JSON.parse(body);
      const { text, recurring } = parsed;
      // Support both "due" and "remind_at" for compatibility
      const due = parsed.remind_at || parsed.due;
      if (!text || !due) return json(res, { error: "text and remind_at required" }, 400);
      const cleanText = String(text).replace(/<[^>]*>/g, "").slice(0, 500).trim();
      if (!cleanText) return json(res, { error: "text cannot be empty after sanitization" }, 400);
      const dueDate = new Date(due);
      if (isNaN(dueDate.getTime())) return json(res, { error: "invalid remind_at date" }, 400);
      // Cap at 2 years in the future
      if (dueDate.getTime() > Date.now() + 2 * 365 * 86400_000) return json(res, { error: "remind_at too far in the future (max 2 years)" }, 400);
      if (recurring && !["daily", "weekly", "monthly"].includes(recurring)) return json(res, { error: "recurring must be daily, weekly, or monthly" }, 400);
      // Cap total active reminders at 200
      const existing = loadReminders().filter(r => !r.completed);
      if (existing.length >= 200) return json(res, { error: "Maximum 200 active reminders reached" }, 400);
      const reminder = {
        id: randomUUID().slice(0, 12),
        text: cleanText,
        due: dueDate.toISOString(),
        recurring: recurring || null,
        completed: false,
        snoozed: null,
        createdAt: new Date().toISOString(),
        source: "v1-api",
      };
      const reminders = loadReminders();
      reminders.push(reminder);
      saveReminders(reminders);
      return json(res, { ok: true, reminder });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // DELETE /v1/reminders/:id — cancel a reminder
  const v1ReminderMatch = url.pathname.match(/^\/v1\/reminders\/([^/]+)$/);
  if (v1ReminderMatch && req.method === "DELETE") {
    const id = v1ReminderMatch[1];
    const reminders = loadReminders();
    const filtered = reminders.filter(r => r.id !== id);
    if (filtered.length === reminders.length) return json(res, { error: "Not found" }, 404);
    saveReminders(filtered);
    return json(res, { ok: true });
  }

  // ── Terminal exec — agents send commands to the active PTY ──────

  if (url.pathname === "/api/terminal/exec" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { command, waitMs } = JSON.parse(body);
      if (!command) return json(res, { error: "command required" }, 400);
      if (!activePty) return json(res, { error: "no active terminal — open the terminal first" }, 503);

      // Clear output buffer, write command, wait for output
      activePtyOutput = "";
      activePty.write(command + "\r");

      const wait = Math.min(Number(waitMs) || 3000, 30000);
      setTimeout(() => {
        // Strip ANSI escape codes for clean output
        const clean = activePtyOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "");
        json(res, { ok: true, output: clean.slice(0, 10000) });
      }, wait);
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
    return;
  }

  if (url.pathname === "/api/terminal/status" && req.method === "GET") {
    return json(res, { active: !!activePty });
  }

  // ── GET /api/version — build fingerprint for cache-busting ──
  if (url.pathname === "/api/version" && req.method === "GET") {
    try {
      const hash = createHash("md5");
      const assetsDir = resolve(DIST, "assets");
      if (existsSync(assetsDir)) {
        for (const f of readdirSync(assetsDir).sort()) {
          hash.update(f);
        }
      }
      const indexPath = resolve(DIST, "index.html");
      if (existsSync(indexPath)) {
        hash.update(String(statSync(indexPath).mtimeMs));
      }
      const buildHash = hash.digest("hex").slice(0, 12);
      return json(res, { version: buildHash, service: "shre-chat", builtAt: statSync(indexPath).mtime.toISOString() });
    } catch (err) {
      return json(res, { error: "Version check failed" }, 500);
    }
  }

  // ── Serve static files ───────────────────────────────────────────

  let filePath = resolve(DIST, url.pathname === "/" ? "index.html" : "." + url.pathname);
  // Guard: if a prior handler already closed the response, bail out
  if (res.writableEnded) return;

  // Path traversal guard — ensure resolved path is within DIST
  if (!filePath.startsWith(DIST)) filePath = join(DIST, "index.html");
  if (!existsSync(filePath)) {
    // Asset requests (.js, .css, etc.) should 404 — not fall back to index.html
    // SPA fallback to index.html only for navigation requests (no file extension)
    const reqExt = extname(filePath);
    if (reqExt && reqExt !== ".html") {
      if (!res.writableEnded) { res.writeHead(404); res.end("Not found"); }
      return;
    }
    filePath = join(DIST, "index.html");
  }

  try {
    if (res.writableEnded) return;
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    // Vite hashed assets can be cached forever; HTML should never be cached
    const cacheControl = ext === ".html" ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable";
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cacheControl });
    res.end(content);
  } catch {
    if (!res.headersSent && !res.writableEnded) { res.writeHead(404); res.end("Not found"); }
  }
}

// ── WebSocket proxy — OpenClaw upgrade handler ───────────────────

function proxyOpenClawWS(req, socket, head) {
  log.info("[ws-proxy] Upgrade request received");

  const proxyReq = httpRequest({
    hostname: OPENCLAW_HOST,
    port: OPENCLAW_PORT,
    path: req.url,
    method: "GET",
    headers: {
      ...req.headers,
      host: `${OPENCLAW_HOST}:${OPENCLAW_PORT}`,
      origin: `http://${OPENCLAW_HOST}:${OPENCLAW_PORT}`,
    },
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    log.info("[ws-proxy] Connected to OpenClaw WebSocket");

    let responseHead = "HTTP/1.1 101 Switching Protocols\r\n";
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      responseHead += `${key}: ${value}\r\n`;
    }
    responseHead += "\r\n";
    socket.write(responseHead);

    if (proxyHead.length > 0) socket.write(proxyHead);
    if (head.length > 0) proxySocket.write(head);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on("error", (err) => { log.error("[ws-proxy] proxySocket error:", err.message); socket.destroy(); });
    socket.on("error", (err) => { log.error("[ws-proxy] clientSocket error:", err.message); proxySocket.destroy(); });
    proxySocket.on("close", () => { log.info("[ws-proxy] proxySocket closed (gateway side)"); socket.destroy(); });
    socket.on("close", () => { log.info("[ws-proxy] clientSocket closed (browser side)"); proxySocket.destroy(); });
  });

  proxyReq.on("error", (err) => {
    log.error("[ws-proxy] OpenClaw WebSocket error:", err.message);
    socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    socket.destroy();
  });

  proxyReq.end();
}

// ── Notification WebSocket — push due reminders + status updates ──

const notifyWss = new WebSocketServer({ noServer: true });
const notifyClients = new Set();

notifyWss.on("connection", (ws) => {
  notifyClients.add(ws);
  ws.on("close", () => notifyClients.delete(ws));
  ws.on("error", () => notifyClients.delete(ws));
});

function broadcastNotification(type, data) {
  const msg = JSON.stringify({ type, ...data, ts: Date.now() });
  for (const ws of notifyClients) {
    try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
  }
  // Also send via Web Push for background/mobile delivery
  if (type === "reminders_due") {
    const reminders = data.reminders || [];
    for (const r of reminders) {
      sendPushToAll({
        title: "Reminder",
        body: r.title || r.text || "You have a reminder due",
        type: "reminder",
        url: "/",
      }).catch(() => {});
    }
  } else if (type === "status_update") {
    // Don't push routine status updates — too noisy for mobile
  } else {
    // Generic notification push
    const title = data.title || type.replace(/\./g, " ");
    sendPushToAll({
      title,
      body: data.body || data.summary || data.message || "",
      type,
      url: "/",
    }).catch(() => {});
  }
}

// Check for due reminders every 30s and push via WebSocket
setInterval(() => {
  try {
    if (notifyClients.size === 0) return; // no connected clients
    const reminders = loadReminders();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed || r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    if (due.length > 0) {
      for (const d of due) {
        const idx = reminders.findIndex(r => r.id === d.id);
        if (idx >= 0) reminders[idx].notified = true;
      }
      saveReminders(reminders);
      broadcastNotification("reminders_due", { reminders: due });
    }
  } catch { /* best effort */ }
}, 30_000).unref();

// Broadcast status updates periodically (every 60s)
setInterval(() => {
  if (notifyClients.size === 0) return;
  try {
    const reminders = loadReminders();
    const active = reminders.filter(r => !r.completed);
    const overdue = active.filter(r => new Date(r.snoozed || r.due) < new Date());
    broadcastNotification("status_update", {
      reminders: { active: active.length, overdue: overdue.length },
      streaming: activeCLICount > 0,
    });
  } catch { /* best effort */ }
}, 60_000).unref();

// Check for due scheduled reports every 60s
setInterval(() => {
  checkDueReports(chatDb, log, broadcastNotification).catch(() => {});
}, 60_000).unref();

// ── Terminal WebSocket — interactive PTY via /ws/terminal ─────────

const termWss = new WebSocketServer({ noServer: true });

// Active PTY reference — shared so agents can send commands via REST API
let activePty = null;
let activePtyOutput = ""; // Rolling output buffer for exec capture
let execResolvers = []; // Pending exec result callbacks

termWss.on("connection", (ws) => {
  log.info("[terminal] New PTY session (via python3 pty)");

  const cwd = process.env.HOME || "/Users/aibot";

  // Strip Claude Code env vars so `claude` CLI works inside the terminal
  const termEnv = { ...process.env, TERM: "xterm-256color", SHELL: "/bin/zsh" };
  delete termEnv.CLAUDECODE;
  delete termEnv.CLAUDE_CODE_SESSION;
  delete termEnv.CLAUDE_CODE_CONVERSATION_ID;

  // Use Python's pty.fork() to get a real PTY (echo, line editing, job control)
  const ptyScript = `
import pty, os, sys, select, signal, struct, fcntl, termios

cols, rows = 80, 24

pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(cwd)})
    os.execv("/bin/zsh", ["/bin/zsh", "-l"])
else:
    # Set initial window size
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def handle_sigterm(sig, frame):
        try: os.kill(pid, signal.SIGTERM)
        except: pass
        sys.exit(0)
    signal.signal(signal.SIGTERM, handle_sigterm)

    try:
        while True:
            r, _, _ = select.select([fd, 0], [], [], 0.05)
            if fd in r:
                try:
                    data = os.read(fd, 16384)
                    if not data: break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                except OSError: break
            if 0 in r:
                data = os.read(0, 16384)
                if not data: break
                os.write(fd, data)
    except (IOError, OSError):
        pass
    finally:
        try: os.kill(pid, signal.SIGTERM)
        except: pass
`;

  let proc;
  try {
    proc = spawn("python3", ["-u", "-c", ptyScript], {
      cwd,
      env: termEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    log.error("[terminal] Failed to spawn PTY:", err.message);
    try { ws.send(`\r\n\x1b[31m[Terminal error: ${err.message}]\x1b[0m\r\n`); } catch {}
    try { ws.close(); } catch {}
    return;
  }

  const shellHandle = {
    write(data) { try { proc.stdin.write(data); } catch {} },
    kill() { proc.kill(); },
    resize(cols, rows) {
      // Send resize via stdin as special escape sequence
      // Python script handles TIOCSWINSZ on the pty fd
    },
  };
  activePty = shellHandle;

  proc.stdout.on("data", (data) => {
    try { ws.send(data.toString()); } catch {}
    if (execResolvers.length > 0) activePtyOutput += data.toString();
  });

  proc.stderr.on("data", (data) => {
    try { ws.send(data.toString()); } catch {}
  });

  proc.on("exit", (code) => {
    log.info("[terminal] PTY exited:", code);
    try { ws.send("\r\n[Process exited]\r\n"); } catch {}
    try { ws.close(); } catch {}
    if (activePty === shellHandle) activePty = null;
  });

  ws.on("message", (msg) => {
    const str = msg.toString();
    if (str.startsWith("{")) {
      try {
        const cmd = JSON.parse(str);
        if (cmd.type === "resize") return; // TODO: resize support
      } catch {}
    }
    // Real PTY — send raw input (including \r for Enter)
    try { proc.stdin.write(str); } catch {}
  });

  ws.on("close", () => {
    log.info("[terminal] WebSocket closed, killing PTY");
    proc.kill();
    if (activePty === shellHandle) activePty = null;
  });
});

// Route WebSocket upgrades — only known paths allowed (no raw OpenClaw proxy)
function handleUpgrade(req, socket, head) {
  const pathname = new URL(req.url, `${SCHEME}://${req.headers.host}`).pathname;
  if (pathname === "/ws/terminal") {
    termWss.handleUpgrade(req, socket, head, (ws) => {
      termWss.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/notifications") {
    notifyWss.handleUpgrade(req, socket, head, (ws) => {
      notifyWss.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/openclaw" && req.headers["x-shre-admin"]) {
    // Admin-only OpenClaw proxy (debug/diagnostic use only)
    proxyOpenClawWS(req, socket, head);
  } else {
    log.warn("[ws] Rejected unknown WebSocket path", { pathname });
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
  }
}

// Attach upgrade handler to all active servers
server.on("upgrade", handleUpgrade);
if (httpsServer && httpServer !== httpsServer) {
  httpServer.on("upgrade", handleUpgrade);
}

let _listenServer = null; // Track whichever server is actually listening
if (tlsOpts && httpsServer) {
  // Dual-protocol: detect TLS vs plaintext on same port
  // Peek at first byte: 0x16 = TLS ClientHello, else HTTP
  const netServer = createNetServer({ pauseOnConnect: true }, (socket) => {
    socket.once("readable", () => {
      const buf = socket.read(1);
      if (!buf) return;
      socket.unshift(buf);
      const target = buf[0] === 0x16 ? httpsServer : httpServer;
      target.emit("connection", socket);
      socket.resume();
    });
    socket.on("error", () => {});
  });
  _listenServer = netServer;
  netServer.listen(PORT, '0.0.0.0', () => {
    log.info("Server started (dual-protocol)", { port: PORT });
    log.info(`[shre-chat] serving on https+http://localhost:${PORT}`);
    log.info(`[shre-chat] All chat routes through shre-router (trust gate, budgets, cost tracking)`);
    log.info(`[shre-chat] WebSocket: /ws/terminal, /ws/notifications (no raw OpenClaw proxy)`);
    lifecycle.started();
    feedbackPipeline.start();
    startWALReplay(60_000); // Retry failed training writes every 60s
  });
} else {
  _listenServer = server;
  server.listen(PORT, '0.0.0.0', () => {
    log.info("Server started (HTTP only)", { port: PORT });
    log.info(`[shre-chat] serving on http://localhost:${PORT}`);
    log.info(`[shre-chat] All chat routes through shre-router (trust gate, budgets, cost tracking)`);
    log.info(`[shre-chat] WebSocket: /ws/terminal, /ws/notifications (no raw OpenClaw proxy)`);
    lifecycle.started();
    feedbackPipeline.start();
    startWALReplay(60_000); // Retry failed training writes every 60s
  });
}

// ─── Subscribe to pipeline briefing events ──────────────────────────────────
eventBus.subscribe("briefing.daily", async (event) => {
  const digest = event?.data?.digest_markdown;
  if (digest) {
    log.info("[briefing] Daily briefing received via event bus");
    // Broadcast to connected WebSocket clients
    broadcastNotification("briefing_daily", {
      digest_markdown: digest,
      stats: event?.data?.stats || {},
      date: event?.data?.date || new Date().toISOString().slice(0, 10),
    });
    // Invalidate briefing cache so next /api/briefing fetch gets fresh data
    _briefingCache = null;
    _briefingCacheTs = 0;
  }
}).catch((err) => {
  log.warn("[briefing] Failed to subscribe to briefing.daily events", {}, err);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
  log.info(`${signal} received — shutting down gracefully`);
  lifecycle.stopping(signal);
  // Close WebSocket servers
  notifyWss.close();
  termWss.close();
  // Close the listening server
  feedbackPipeline.stop().catch(() => {});
  eventBus.shutdown().catch(() => {});
  (_listenServer || server).close(() => {
    log.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  if (err.code === "EADDRINUSE") {
    log.error(`[shre-chat] Port ${PORT} already in use`);
    process.exit(1);
  }
  log.error("[shre-chat] Uncaught exception", {}, err);
  // Graceful shutdown — flush sessions before exiting
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  log.error("[shre-chat] Unhandled rejection", { reason: String(reason) });
  // Don't exit on unhandled rejections — log and continue
});

