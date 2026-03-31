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
import { spawn, execSync } from "node:child_process";
import pg from "pg";
import { Readable } from "node:stream";
import { WebSocketServer } from "ws";
import { createLogger, extractCorrelationId, createEventBus, createLifecycleEmitter, serviceUrl, infraUrl, createFeedbackPipeline } from "shre-sdk";
import { createConversationLearner } from "shre-sdk/rag";
import { writeConversation, startWALReplay } from "shre-sdk/training";
import { createHeartbeatMonitor } from "shre-sdk/heartbeat";
import { createTraceMiddleware, getRecentTraces, getRecentFailures, getTraceStats } from "shre-sdk/trace";
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
import { initVoiceQualityMonitor, recordVoiceFailure, getVoiceQualityStats } from "./routes/voice-quality-monitor.js";
import { createConversationEvaluator } from "./routes/conversation-evaluator.js";

// ── Trust mkcert CA so Node verifies local TLS certs properly ──
const _mkcertCA = join(homedir(), "Library", "Application Support", "mkcert", "rootCA.pem");
if (existsSync(_mkcertCA) && !process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_EXTRA_CA_CERTS = _mkcertCA;
}

const PORT = Number(process.env.PORT) || 5510;
const _serverStartedAt = new Date().toISOString();
let _investorCache = null;
let _investorCacheAt = 0;
const log = createLogger("shre-chat");
const eventBus = createEventBus("shre-chat");
const conversationLearner = createConversationLearner("shre-chat", { logger: log, eventBus });
const feedbackPipeline = createFeedbackPipeline({ agentId: "chat-service", workspaceId: "shre" });
const lifecycle = createLifecycleEmitter(eventBus, "shre-chat", { port: PORT });
const heartbeat = createHeartbeatMonitor("shre-chat", {
  intervalMs: 30_000,
  publishFn: (event, severity, data) => eventBus.publish(event, severity, data),
});
heartbeat.registerDependency("cortexdb", `${infraUrl("cortexservice-api")}/health/live`);
heartbeat.registerDependency("shre-router", "https://127.0.0.1:5497/health");
const DIST = join(import.meta.dirname, "dist");
const OPENCLAW_HOST = "127.0.0.1";
const OPENCLAW_PORT = Number(new URL(infraUrl("openclaw-gateway")).port);
const OPENCLAW_HOME = join(homedir(), ".openclaw");
const MIB007_PORT = Number(new URL(serviceUrl("mib007")).port);
const CORTEXDB_URL = process.env.CORTEXDB_URL || infraUrl("cortexservice-api");

// ── CortexDB PostgreSQL pool (replaces execSync docker exec psql) ──
const cortexPool = new pg.Pool({
  host: "127.0.0.1",
  port: 5433,
  user: "cortex",
  password: process.env.CORTEX_PG_PASSWORD || "",
  database: "cortexdb",
  max: 5,
  idleTimeoutMillis: 120_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
});
cortexPool.on("error", (err) => log.warn("[cortexPool] Idle client error", { error: err.message }));

// ── Gateway token — read from openclaw.json server-side (never expose in bundle) ──
let GATEWAY_TOKEN = "";
try {
  const ocConfig = JSON.parse(readFileSync(join(OPENCLAW_HOME, "openclaw.json"), "utf8"));
  // Token lives at gateway.auth.token in openclaw.json
  GATEWAY_TOKEN = ocConfig?.gateway?.auth?.token || ocConfig?.auth?.token || "";
} catch { /* will fail gracefully — gateway calls won't auth */ }

// ── MIB007 service token — for loopback API calls to MIB007 ──
let MIB007_SERVICE_TOKEN = "";
try {
  const svcTokens = JSON.parse(readFileSync(join(homedir(), ".shre", "service-tokens.json"), "utf8"));
  MIB007_SERVICE_TOKEN = svcTokens.mib007 || "";
} catch { /* no service token — MIB007 proxy will fail auth */ }

// ── Service tokens for inter-service auth ──
let CONTACTS_TOKEN = "";
try {
  const vaultOut = execSync("bash scripts/vault-read.sh tokens.env", { cwd: join(import.meta.dirname, ".."), timeout: 5000 }).toString("utf-8");
  const match = vaultOut.match(/SHRE_CONTACTS_TOKEN=([^\s\n]+)/);
  if (match) CONTACTS_TOKEN = match[1].trim();
  if (CONTACTS_TOKEN) log.info("Contacts token loaded");
} catch (err) { log.warn("Failed to load contacts token:", err.message); }

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
    user_id      TEXT NOT NULL DEFAULT 'system',
    tenant_id    TEXT NOT NULL DEFAULT 'default',
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
    user_id      TEXT,
    tenant_id    TEXT,
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
try { chatDb.exec(`ALTER TABLE voice_sessions ADD COLUMN user_id TEXT DEFAULT 'system'`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_sessions ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_turns ADD COLUMN user_id TEXT DEFAULT 'system'`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_turns ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_actions ADD COLUMN user_id TEXT DEFAULT 'system'`); } catch {}
try { chatDb.exec(`ALTER TABLE voice_actions ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch {}
try { chatDb.exec(`ALTER TABLE chat_actions ADD COLUMN user_id TEXT DEFAULT 'system'`); } catch {}
try { chatDb.exec(`ALTER TABLE chat_actions ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch {}

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
const stmtGetAll = chatDb.prepare(`SELECT id, title, agent_id, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id FROM chat_sessions WHERE user_id = ? AND tenant_id = ? ORDER BY updated_at DESC LIMIT 100`);
const stmtGetOne = chatDb.prepare(`SELECT * FROM chat_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?`);
const stmtDelete = chatDb.prepare(`DELETE FROM chat_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?`);
const stmtSoftDelete = chatDb.prepare(`
  INSERT OR REPLACE INTO deleted_sessions (id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, deleted_at, deleted_by, user_id, tenant_id)
  SELECT id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, unixepoch() * 1000, ?, user_id, tenant_id
  FROM chat_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?
`);
const stmtRestoreDeleted = chatDb.prepare(`
  INSERT OR REPLACE INTO chat_sessions (id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id)
  SELECT id, title, agent_id, messages, pinned, tags, system_prompt, parent_id, created_at, updated_at, user_id, tenant_id
  FROM deleted_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?
`);
const stmtRemoveFromTrash = chatDb.prepare(`DELETE FROM deleted_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?`);
const stmtListDeleted = chatDb.prepare(`SELECT id, title, agent_id, deleted_at, deleted_by FROM deleted_sessions WHERE user_id = ? AND tenant_id = ? ORDER BY deleted_at DESC LIMIT 50`);
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

// ── Emergency response cache — FTS5 search for similar past Q&A when router is down ──
const stmtFTSSearch = chatDb.prepare(`
  SELECT user_message, assistant_response, agent_id, model
  FROM chat_audit_log
  WHERE rowid IN (SELECT rowid FROM chat_audit_fts WHERE chat_audit_fts MATCH ?)
  ORDER BY created_at DESC LIMIT 1
`);

function emergencyResponseLookup(userMessage) {
  try {
    if (!userMessage || userMessage.length < 10) return null;
    // Build FTS5 query: take first 5 significant words
    const words = userMessage.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2).slice(0, 5);
    if (words.length < 2) return null;
    const ftsQuery = words.join(" OR ");
    const row = stmtFTSSearch.get(ftsQuery);
    if (row && row.assistant_response && row.assistant_response.length > 50) {
      return {
        content: row.assistant_response,
        agent_id: row.agent_id || "shre",
        model: row.model || "cached",
        cached: true,
      };
    }
  } catch { /* FTS search failed — no fallback available */ }
  return null;
}

// ── Helper: date range for employee activity queries ──
function getDateRange(period) {
  const tz = "America/New_York";
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  switch (period) {
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const yStr = y.toLocaleDateString("en-CA", { timeZone: tz });
      return { from: yStr, to: yStr };
    }
    case "week": {
      const w = new Date(now); w.setDate(w.getDate() - 7);
      return { from: w.toLocaleDateString("en-CA", { timeZone: tz }), to: todayStr };
    }
    case "month": {
      const m = new Date(now); m.setDate(m.getDate() - 30);
      return { from: m.toLocaleDateString("en-CA", { timeZone: tz }), to: todayStr };
    }
    default: return { from: todayStr, to: todayStr };
  }
}

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
 * Fetch unified context from shre-context:5462 for injection into system prompt.
 * Includes soul, platform state, RAG vectors, live data, and contacts — all in parallel.
 * Returns the combined injection string or null on failure.
 */
async function fetchContextInjection(agentId, prompt, tenantId) {
  try {
    const contextUrl = serviceUrl("shre-context");
    const res = await fetch(`${contextUrl}/v1/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agentId || "shre",
        prompt: prompt || "",
        tenantId: tenantId || "default",
        // Skip soul — shre-router injects it during routing. Include live data layers only.
        layers: ["platform", "rag", "data", "contacts"],
        format: "markdown",
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log.warn(`[context] shre-context returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    const injection = data.injection || "";
    if (injection.length > 0) {
      log.info(`[context] Injected ${injection.length} chars for ${agentId} (${(data.layers || []).map(l => l.name).join(",")})`);
    }
    return injection || null;
  } catch (err) {
    log.warn(`[context] shre-context unavailable:`, err.message);
    return null;
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
async function logConversationToCortex(agentId, userMessage, assistantResponse, source = "openclaw", model = "unknown", tenantId = "default") {
  if (!userMessage || !assistantResponse || assistantResponse.length < 20) return;
  try {
    const event = {
      data_type: "agent_conversation",
      payload: {
        agentId: agentId || "shre",
        source,
        model,
        tenantId,
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

    // Vector ingestion handled by conversationLearner.learn() via shre-sdk/rag
    // (calls CortexDB:5400 /v1/superadmin/rag/ingest with proper auth)

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
      tenantId: tenantId || "default",
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
    const companyId = await mib007CompanyId();
    if (!companyId) return;

    // Discover first comms channel
    const channelsRes = await mib007Fetch(`/api/companies/${companyId}/comms/channels`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!channelsRes.ok) return;
    const channels = await channelsRes.json();
    const channelId = channels?.[0]?.id;
    if (!channelId) return;

    const chatBaseUrl = process.env.SHRE_CHAT_URL || `https://localhost:${PORT}`;
    await mib007Fetch(`/api/companies/${companyId}/comms/agent-summary`, {
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
  // .replit.dev CORS removed — not used in production
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

/**
 * Extract user context from request auth claims.
 * Returns { userId, tenantId, companyId } — all default to safe fallbacks.
 * Every data operation should scope to these values.
 */
function getUserContext(req) {
  const claims = checkAuth(req);
  return {
    userId: claims?.sub || "system",
    tenantId: claims?.activeWorkspaceId || "default",
    companyId: claims?.companyId || claims?.company_id || null,
    claims,
  };
}

/**
 * Build standard user-context headers for proxying to downstream services.
 * Services should use these to scope data to the right user/workspace.
 */
function userContextHeaders(req) {
  const ctx = getUserContext(req);
  const headers = {};
  if (ctx.userId !== "system") headers["X-User-Id"] = ctx.userId;
  if (ctx.tenantId !== "default") headers["X-Workspace-Id"] = ctx.tenantId;
  if (ctx.companyId) headers["X-Company-Id"] = ctx.companyId;
  // Forward original auth token so downstream can verify if needed
  if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];
  return headers;
}

// ── Briefing cache (5 min TTL) ────────────────────────────────────
let _briefingCache = null;
let _briefingCacheTs = 0;
let _feedToken = undefined; // Lazy-loaded feed service token

// ── Reminders persistence (SQLite — durable, never auto-purged) ───
// User data is NEVER automatically deleted. Only agents' ephemeral data gets cleaned up.
// Create reminders table (new installs get user_id/tenant_id from the start)
chatDb.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    due         TEXT,
    recurring   TEXT,
    completed   INTEGER NOT NULL DEFAULT 0,
    snoozed     TEXT,
    notified    INTEGER NOT NULL DEFAULT 0,
    source      TEXT DEFAULT 'manual',
    contact_email TEXT,
    user_id     TEXT NOT NULL DEFAULT 'system',
    tenant_id   TEXT NOT NULL DEFAULT 'default',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due);
  CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(completed);
`);
// Add user_id/tenant_id columns if upgrading from previous schema (existing table without these cols)
try { chatDb.exec(`ALTER TABLE reminders ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system'`); } catch { /* already exists */ }
try { chatDb.exec(`ALTER TABLE reminders ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`); } catch { /* already exists */ }
// Now safe to create the index (columns guaranteed to exist)
chatDb.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, tenant_id)`);

// Migrate from legacy JSON file if it exists and has data
const REMINDERS_LEGACY_PATH = join(homedir(), ".shre", "reminders.json");
try {
  if (existsSync(REMINDERS_LEGACY_PATH)) {
    const legacy = JSON.parse(readFileSync(REMINDERS_LEGACY_PATH, "utf8"));
    if (Array.isArray(legacy) && legacy.length > 0) {
      const insert = chatDb.prepare(`INSERT OR IGNORE INTO reminders (id, text, due, recurring, completed, snoozed, notified, source, contact_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const migrate = chatDb.transaction((items) => {
        for (const r of items) {
          insert.run(r.id, r.text, r.due || null, r.recurring || null, r.completed ? 1 : 0, r.snoozed || null, r.notified ? 1 : 0, r.source || "manual", r.contact_email || null, r.createdAt || new Date().toISOString(), r.updatedAt || r.createdAt || new Date().toISOString());
        }
      });
      migrate(legacy);
      log.info(`[reminders] Migrated ${legacy.length} reminders from JSON to SQLite`);
      // Rename legacy file so it's not re-imported
      renameSync(REMINDERS_LEGACY_PATH, REMINDERS_LEGACY_PATH + ".migrated");
    }
  }
} catch (err) {
  log.warn("[reminders] Legacy migration failed (non-fatal)", {}, err);
}

// Prepared statements for reminders (user-scoped)
const stmtLoadReminders = chatDb.prepare(`SELECT * FROM reminders WHERE user_id = ? AND tenant_id = ? ORDER BY created_at DESC`);
const stmtLoadAllReminders = chatDb.prepare(`SELECT * FROM reminders ORDER BY created_at DESC`);
const stmtInsertReminder = chatDb.prepare(`INSERT OR REPLACE INTO reminders (id, text, due, recurring, completed, snoozed, notified, source, contact_email, user_id, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const stmtUpdateReminderById = chatDb.prepare(`UPDATE reminders SET text = ?, due = ?, recurring = ?, completed = ?, snoozed = ?, notified = ?, source = ?, contact_email = ?, updated_at = ? WHERE id = ? AND user_id = ? AND tenant_id = ?`);
const stmtDeleteReminderScoped = chatDb.prepare(`DELETE FROM reminders WHERE id = ? AND user_id = ? AND tenant_id = ?`);

function reminderRow(r) {
  return {
    id: r.id,
    text: r.text,
    due: r.due,
    recurring: r.recurring || undefined,
    completed: !!r.completed,
    snoozed: r.snoozed || undefined,
    notified: !!r.notified,
    source: r.source || "manual",
    contact_email: r.contact_email || undefined,
    user_id: r.user_id || "system",
    tenant_id: r.tenant_id || "default",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Load reminders scoped to a user+workspace. */
function loadReminders(userId = "system", tenantId = "default") {
  try {
    return stmtLoadReminders.all(userId, tenantId).map(reminderRow);
  } catch (err) {
    log.error("[reminders] loadReminders failed", {}, err);
    return [];
  }
}

/** Load ALL reminders (for background jobs like due-check). */
function loadAllReminders() {
  try {
    return stmtLoadAllReminders.all().map(reminderRow);
  } catch (err) {
    log.error("[reminders] loadAllReminders failed", {}, err);
    return [];
  }
}

/** Save a single reminder (insert or replace). */
function saveReminder(r) {
  try {
    stmtInsertReminder.run(r.id, r.text, r.due || null, r.recurring || null, r.completed ? 1 : 0, r.snoozed || null, r.notified ? 1 : 0, r.source || "manual", r.contact_email || null, r.user_id || "system", r.tenant_id || "default", r.createdAt || new Date().toISOString(), r.updatedAt || r.createdAt || new Date().toISOString());
  } catch (err) {
    log.error("[reminders] saveReminder failed", {}, err);
  }
}

/** Bulk save — replaces all reminders for a given user+workspace. */
function saveReminders(reminders, userId = "system", tenantId = "default") {
  try {
    const tx = chatDb.transaction((items) => {
      chatDb.prepare(`DELETE FROM reminders WHERE user_id = ? AND tenant_id = ?`).run(userId, tenantId);
      for (const r of items) {
        stmtInsertReminder.run(r.id, r.text, r.due || null, r.recurring || null, r.completed ? 1 : 0, r.snoozed || null, r.notified ? 1 : 0, r.source || "manual", r.contact_email || null, userId, tenantId, r.createdAt || new Date().toISOString(), r.updatedAt || r.createdAt || new Date().toISOString());
      }
    });
    tx(reminders);
  } catch (err) {
    log.error("[reminders] saveReminders failed", {}, err);
  }
}

// No auto-cleanup — user data is never automatically deleted.
// Only agent ephemeral data (training batches, stale executions) gets purged.

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

// ── Background reminder checker — every 60s, check ALL users' reminders ────
setInterval(() => {
  try {
    const reminders = loadAllReminders();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed || r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    if (due.length > 0) {
      for (const d of due) {
        log.info(`[reminders] Due reminder: "${d.text}" (id=${d.id}, user=${d.user_id})`);
        d.notified = true;
        saveReminder(d);
      }
      eventBus.emit("reminder.due", { reminders: due.map(r => ({ id: r.id, text: r.text, due: r.due, user_id: r.user_id, tenant_id: r.tenant_id })) });
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
  // Strict for same-origin (local dev / direct access) — tightest XSS protection
  const sameSite = isNirtek ? "None" : "Strict";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}${domainPart}; Max-Age=${maxAge}${secure}`;
}

// Routes that don't require auth
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/check", "/api/auth/verify-2fa", "/api/auth/passport-login", "/api/auth/select-workspace", "/health", "/readyz", "/api/health", "/api/readyz", "/api/verify-identity", "/api/branding/public", "/api/version", "/api/employee-activity", "/api/employee-activity/alerts", "/api/notifications", "/api/messages/append", "/api/voice-quality", "/api/sitemap", "/demo"]);

// ── CSRF token generation + validation ─────────────────────────────
// Token = HMAC-SHA256(sessionSeed, authSigningKey || fallback). Validated on POST/PUT/DELETE.
// Bearer-token-authed API requests are exempt (API clients don't use cookies).
const CSRF_FALLBACK_KEY = randomUUID(); // per-process fallback if no signing key
function generateCsrfToken(sessionSeed) {
  const key = authSigningKey || Buffer.from(CSRF_FALLBACK_KEY, "utf-8");
  return createHmac("sha256", key).update(`csrf:${sessionSeed}`).digest("hex");
}
function validateCsrfToken(req, token) {
  // Requests with Bearer auth header are exempt — they don't rely on cookies
  if (req.headers["authorization"]?.startsWith("Bearer ")) return true;
  if (!token) return false;
  // Derive session seed from auth cookie
  const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith("shre_token="));
  if (!tokenCookie) return true; // No cookie-based auth — CSRF not applicable
  const sessionSeed = createHash("sha256").update(tokenCookie.split("=")[1] || "").digest("hex").slice(0, 16);
  const expected = generateCsrfToken(sessionSeed);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token, "utf-8"), Buffer.from(expected, "utf-8"));
}

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

// ── MIB007 authenticated fetch helper ──
const mib007Headers = () => MIB007_SERVICE_TOKEN
  ? { Authorization: `Bearer ${MIB007_SERVICE_TOKEN}` }
  : {};

async function mib007Fetch(path, opts = {}) {
  const headers = { ...mib007Headers(), ...opts.headers };
  return fetch(`http://127.0.0.1:${MIB007_PORT}${path}`, { ...opts, headers });
}

/**
 * Get the company ID for a request. Uses user context from JWT if available,
 * falls back to querying MIB007 for the user's companies.
 */
async function mib007CompanyId(req) {
  // 1. Check JWT claims for company context
  if (req) {
    const ctx = getUserContext(req);
    if (ctx.companyId) return ctx.companyId;
    // 2. Query MIB007 with user context headers to get their companies
    try {
      const r = await mib007Fetch("/api/companies", {
        signal: AbortSignal.timeout(5000),
        headers: req ? userContextHeaders(req) : {},
      });
      const companies = r.ok ? await r.json() : [];
      return companies?.[0]?.id || null;
    } catch { return null; }
  }
  // 3. Fallback: service-level query
  const r = await mib007Fetch("/api/companies", { signal: AbortSignal.timeout(5000) });
  const companies = r.ok ? await r.json() : [];
  return companies?.[0]?.id || null;
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
const conversationEvaluator = createConversationEvaluator({ log, chatDb });
const handleVoice = registerVoiceRoutes({
  log, OPENCLAW_HOST, OPENCLAW_PORT, GATEWAY_TOKEN, chatDb,
  logConversationToCortex, emitConversationComplete, extractAndLogSkills,
  conversationLearner, conversationEvaluator, feedbackPipeline,
});
const handleTasks = registerTaskRoutes({ log });
const handleSessions = registerSessionRoutes({ log, chatDb, stmtGetAll, stmtGetOne, stmtDelete, stmtSoftDelete, stmtRestoreDeleted, stmtRemoveFromTrash, stmtListDeleted, stmtPurgeTrash, upsertSession, dbSessionToClient, checkAuth });
const handleSuggestions = registerSuggestionsRoutes({ log, loadReminders, getUserContext, getBriefingCache: () => _briefingCache });
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
const IS_DEV = process.env.NODE_ENV !== "production";
const CSP_CONNECT_SRC = `connect-src 'self' https://localhost:* https://127.0.0.1:* http://localhost:* http://127.0.0.1:* wss://chat.nirtek.net wss://shre.nirtek.net ws://localhost:* wss://localhost:*`;
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  CSP_CONNECT_SRC,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate",
};

// ── Geo-blocking — only allow US and India ──────────────────────
const ALLOWED_COUNTRIES = new Set(["US", "IN"]);

async function requestHandler(req, res) {
  const url = new URL(req.url ?? "/", `${SCHEME}://localhost:${PORT}`);
  const correlationId = extractCorrelationId(req.headers);
  res.setHeader("x-correlation-id", correlationId);

  // ── AI crawler blocking — reject known bot user-agents ────────
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const AI_BOTS = ["gptbot", "chatgpt-user", "google-extended", "ccbot", "anthropic-ai", "claudebot", "bytespider", "amazonbot", "facebookbot", "applebot-extended", "perplexitybot", "cohere-ai", "diffbot", "omgili", "youbot"];
  if (AI_BOTS.some(bot => ua.includes(bot))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

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

    // Apply security headers to all responses (skip frame restrictions for embedded app proxies)
    const EMBED_PREFIXES = ["/openclaw", "/shre-dashboard", "/cortexdb-ui", "/storepulse", "/app-marketplace"];
    const isEmbedProxy = EMBED_PREFIXES.some(p => url.pathname.startsWith(p));
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (isEmbedProxy && k === "X-Frame-Options") continue;
      res.setHeader(k, v);
    }

    // Apply CSP only to HTML responses (relax frame-ancestors for embedded proxies)
    const ct = (headers && (headers["Content-Type"] || headers["content-type"])) || res.getHeader("content-type") || "";
    if (typeof ct === "string" && ct.includes("text/html")) {
      if (isEmbedProxy) {
        res.setHeader("Content-Security-Policy", CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
      } else {
        res.setHeader("Content-Security-Policy", CSP);
      }
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

  // ── GET /api/csrf-token — issue a CSRF token for the current session ──
  if (url.pathname === "/api/csrf-token" && req.method === "GET") {
    const cookies = (req.headers["cookie"] || "").split(";").map(c => c.trim());
    const tokenCookie = cookies.find(c => c.startsWith("shre_token="));
    const sessionSeed = tokenCookie
      ? createHash("sha256").update(tokenCookie.split("=")[1] || "").digest("hex").slice(0, 16)
      : randomUUID().slice(0, 16);
    const csrfToken = generateCsrfToken(sessionSeed);
    return json(res, { csrfToken });
  }

  // ── CSRF token validation on state-changing requests ──────────
  // Exempt: Bearer-token-authed requests (API clients), public auth paths, router proxy (has its own auth)
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const csrfExempt = PUBLIC_PATHS.has(url.pathname)
      || url.pathname.startsWith("/api/auth/")
      || url.pathname.startsWith("/api/router/")
      || url.pathname.startsWith("/v1/")
      || req.headers["authorization"]?.startsWith("Bearer ");
    if (!csrfExempt) {
      const csrfToken = req.headers["x-csrf-token"] || "";
      if (!validateCsrfToken(req, csrfToken)) {
        log.warn("[csrf] Token validation failed", { path: url.pathname });
        return json(res, { error: "CSRF token invalid or missing", code: "CSRF_FAILED" }, 403);
      }
    }
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
      // Emit structured auth failure event for security dashboard
      try {
        const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
        const reason = req.headers.authorization ? "invalid_signature" : "no_token";
        eventBus.publish("proxy.auth.failure", "warning", {
          tenantId: "unknown",
          reason,
          ip: clientIp,
          path: url.pathname,
          timestamp: Date.now(),
        }).catch(() => {});
      } catch { /* non-blocking */ }
      return json(res, { error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
    }
  }

  // Health routes (after auth for readyz, but health is in PUBLIC_PATHS)
  if (await handleHealth(req, res, url, _routeUtils)) return;

  // Trace endpoints
  if (url.pathname === "/v1/traces" && req.method === "GET") {
    return json(res, getRecentTraces(Number(url.searchParams.get("limit") || 50)));
  }
  if (url.pathname === "/v1/traces/failures" && req.method === "GET") {
    return json(res, getRecentFailures(Number(url.searchParams.get("limit") || 50)));
  }
  if (url.pathname === "/v1/traces/stats" && req.method === "GET") {
    return json(res, getTraceStats());
  }

  // ── GET /api/sitemap — view registry for agent deep-linking ──
  if (url.pathname === "/api/sitemap" && req.method === "GET") {
    const mib007Base = serviceUrl("mib007");
    const prefix = "SHR";
    const sitemap = [
      { id: "chat", label: "Chat", description: "AI chat with Shre and agents", category: "work", type: "view", keywords: ["chat", "ask", "message", "talk", "conversation"] },
      { id: "tasks", label: "Tasks", description: "View and manage all tasks — filter by status, priority, agent", category: "work", type: "view", keywords: ["tasks", "todo", "action items", "assignments", "pending"] },
      { id: "projects", label: "Projects", description: "Browse projects with associated tasks", category: "work", type: "view", keywords: ["projects", "initiatives", "workstreams"] },
      { id: "reminders", label: "Reminders", description: "Personal reminders with NL input, recurring schedules, snooze", category: "work", type: "view", keywords: ["reminders", "remind me", "alerts", "schedule", "due"] },
      { id: "task-timeline", label: "Task Timeline", description: "Gantt chart visualization of tasks over time", category: "work", type: "view", keywords: ["timeline", "gantt", "schedule"] },
      { id: "briefing", label: "Briefing", description: "Morning briefing — pending tasks, active agents, summary", category: "work", type: "view", keywords: ["briefing", "morning", "summary", "digest"] },
      { id: "activity", label: "Activity", description: "Activity log — recent actions and events", category: "work", type: "view", keywords: ["activity", "log", "history"] },
      { id: "feed", label: "Feed", description: "Real-time activity feed — gateway events", category: "analytics", type: "view", keywords: ["feed", "live", "stream", "events"] },
      { id: "feed-analytics", label: "Feed Analytics", description: "Charts for feed events by agent, category, severity", category: "analytics", type: "view", keywords: ["analytics", "charts", "metrics"] },
      { id: "cost-dashboard", label: "Cost Dashboard", description: "AI cost tracking — by model, agent, budget", category: "analytics", type: "view", keywords: ["costs", "spend", "budget", "billing", "usage"] },
      { id: "reports", label: "Reports", description: "Schedule and manage automated reports", category: "analytics", type: "view", keywords: ["reports", "scheduled", "automated"] },
      { id: "marketplace", label: "Marketplace", description: "Agent marketplace — catalog, quality, costs", category: "apps", type: "view", keywords: ["marketplace", "agents", "catalog", "apps"] },
      { id: "admin", label: "Admin", description: "System administration — agent roster, stats", category: "tools", type: "view", keywords: ["admin", "system", "settings"] },
      { id: "finetune", label: "Fine-Tuning", description: "LoRA fine-tuning pipeline monitor", category: "tools", type: "view", keywords: ["finetune", "training", "lora"] },
      { id: "mib-tasks", label: "Tasks (MIB007)", description: "Full task management in MIB007", category: "external", type: "external", url: `${mib007Base}/${prefix}/tasks`, keywords: ["mib tasks", "kanban"] },
      { id: "mib-projects", label: "Projects (MIB007)", description: "Full project management in MIB007", category: "external", type: "external", url: `${mib007Base}/${prefix}/projects`, keywords: ["mib projects"] },
      { id: "mib-agents", label: "Agents (MIB007)", description: "Agent management in MIB007", category: "external", type: "external", url: `${mib007Base}/${prefix}/agents/all`, keywords: ["mib agents"] },
      { id: "mib-issues", label: "Issues (MIB007)", description: "Issue tracker in MIB007", category: "external", type: "external", url: `${mib007Base}/${prefix}/issues`, keywords: ["mib issues", "bugs"] },
      { id: "mib-home", label: "MIB007 Home", description: "MIB007 main dashboard", category: "external", type: "external", url: `${mib007Base}/${prefix}/home`, keywords: ["mib", "mib007", "home"] },
      { id: "investor", label: "Investor Dashboard", description: "Real-time investor KPIs — business metrics, platform health, AI agent ROI, opportunities, roadmap", category: "analytics", type: "view", keywords: ["investor", "kpi", "metrics", "revenue", "arr", "pipeline", "roi", "fundraising"] },
    ];
    return json(res, { sitemap, navigation_event: "shre:switch-view", note: "Dispatch CustomEvent with view id as detail to navigate" });
  }

  // ── Investor KPI API — versioned, auto-updated with live platform data ──
  if (url.pathname === "/api/investor/kpis" && req.method === "GET") {
    try {
      // Serve from cache if fresh (30s TTL)
      if (_investorCache && Date.now() - _investorCacheAt < 30_000) return json(res, _investorCache);

      // Load persisted business KPIs (manual/investor-controlled)
      const kpiPath = join(import.meta.dirname, ".investor-kpis.json");
      let business = {};
      if (existsSync(kpiPath)) business = JSON.parse(readFileSync(kpiPath, "utf-8"));

      // Fetch live platform metrics in parallel (all with 2s timeout)
      const to = (ms) => AbortSignal.timeout(ms);
      const [heartbeatRes, fleetRes, tasksInProgress, tasksCompleted, tasksFailed, trainingRes] = await Promise.allSettled([
        fetch(`${serviceUrl("shre-health")}/v1/heartbeat`, { signal: to(2000) }).then(r => r.json()),
        fetch(`${serviceUrl("shre-fleet")}/v1/fleet/status`, { signal: to(2000) }).then(r => r.json()),
        fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=in_progress&limit=1`, { signal: to(2000), headers: req.headers["authorization"] ? { Authorization: req.headers["authorization"] } : {} }).then(r => r.json()),
        fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=completed&limit=1`, { signal: to(2000), headers: req.headers["authorization"] ? { Authorization: req.headers["authorization"] } : {} }).then(r => r.json()),
        fetch(`${serviceUrl("shre-tasks")}/v1/tasks?status=failed&limit=1`, { signal: to(2000), headers: req.headers["authorization"] ? { Authorization: req.headers["authorization"] } : {} }).then(r => r.json()),
        fetch(`${serviceUrl("shre-scorer")}/v1/training/stats`, { signal: to(2000) }).then(r => r.json()),
      ]);

      // Count services from ports.json
      let serviceCount = 30, agentCount = 17;
      try {
        const ports = JSON.parse(readFileSync(join(import.meta.dirname, "..", "ports.json"), "utf-8"));
        const svcs = Object.entries(ports).filter(([k]) => !k.startsWith("_"));
        serviceCount = svcs.length;
        agentCount = svcs.filter(([, v]) => v?.category === "agent-mgmt" || v?.tags?.includes("agent")).length || 17;
      } catch { /* fallback to defaults */ }

      // Extract heartbeat service health
      let servicesHealthy = 0, servicesDegraded = 0, servicesDown = 0;
      if (heartbeatRes.status === "fulfilled") {
        const hb = heartbeatRes.value;
        const svcs = hb.services || hb.signals || [];
        for (const s of Array.isArray(svcs) ? svcs : Object.values(svcs)) {
          const st = s.status || s.state;
          if (st === "healthy" || st === "up") servicesHealthy++;
          else if (st === "degraded") servicesDegraded++;
          else servicesDown++;
        }
      }

      // Extract fleet data
      let activeAgents = 0, completedToday = 0;
      if (fleetRes.status === "fulfilled") {
        const f = fleetRes.value;
        activeAgents = f.active_count ?? f.activeAssignments?.length ?? f.active ?? 0;
        completedToday = f.completed_today ?? 0;
      }

      // Extract task counts
      const taskCount = (r) => r.status === "fulfilled" ? (r.value?.total ?? (Array.isArray(r.value) ? r.value.length : 0)) : 0;
      const inProgress = taskCount(tasksInProgress);
      const completed = taskCount(tasksCompleted);
      const failed = taskCount(tasksFailed);

      // Extract training stats
      let trainingData = { dataPoints: 0, lastRun: null, modelVersion: "shre-ft:latest" };
      if (trainingRes.status === "fulfilled") {
        const t = trainingRes.value;
        trainingData = {
          dataPoints: t.data_points ?? t.totalSamples ?? t.count ?? 0,
          lastRun: t.last_run ?? t.lastRun ?? null,
          modelVersion: t.model_version ?? t.modelVersion ?? "shre-ft:latest",
        };
      }

      // Merge: business KPIs (manual) + platform KPIs (live)
      const result = {
        ...business,
        version: business.version || "1.0.0",
        updatedAt: new Date().toISOString(),
        stage: business.stage || "Pre-Launch / Beta",
        customers: business.customers ?? 0,
        revenue: business.revenue || { mrr: 0, arr: 0 },
        pipeline: business.pipeline || { leads: 0, pilots: 0, converted: 0 },
        dataAdvantage: business.dataAdvantage || { locations: 200, partner: "RapidRMS", views: 22 },
        costStructure: business.costStructure || { infra: 45, compute: 30, total: 75 },
        // Live platform data
        platform: {
          services: { total: serviceCount, healthy: servicesHealthy, degraded: servicesDegraded, down: servicesDown },
          agents: { total: agentCount, active: activeAgents, completedToday },
          tasks: { inProgress, completed, failed, total: inProgress + completed + failed },
          training: trainingData,
          uptime: { since: _serverStartedAt },
        },
        techStack: { services: serviceCount, agents: agentCount, sdkModules: 15, e2eTests: 110, ...(business.techStack || {}) },
      };

      _investorCache = result;
      _investorCacheAt = Date.now();
      return json(res, result);
    } catch (err) { log.error("[investor] KPI fetch failed", { error: err.message }); return json(res, { error: "Failed to load KPIs" }, 500); }
  }
  if (url.pathname === "/api/investor/kpis" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        const kpiPath = join(import.meta.dirname, ".investor-kpis.json");
        let existing = { version: "1.0.0", changelog: [] };
        if (existsSync(kpiPath)) existing = JSON.parse(readFileSync(kpiPath, "utf-8"));
        if (!existing.changelog) existing.changelog = [];
        // Auto-increment version
        const [major, minor, patch] = (existing.version || "1.0.0").split(".").map(Number);
        const newVersion = update.bumpMajor ? `${major + 1}.0.0` : update.bumpMinor ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
        // Build changelog entry from changes
        const changes = [];
        if (update.customers !== undefined && update.customers !== existing.customers) changes.push(`Customers: ${existing.customers || 0} → ${update.customers}`);
        if (update.revenue?.mrr !== undefined && update.revenue.mrr !== existing.revenue?.mrr) changes.push(`MRR: $${existing.revenue?.mrr || 0} → $${update.revenue.mrr}`);
        if (update.stage !== undefined && update.stage !== existing.stage) changes.push(`Stage: ${existing.stage} → ${update.stage}`);
        if (update.pipeline) {
          for (const k of ["leads", "pilots", "converted"]) {
            if (update.pipeline[k] !== undefined && update.pipeline[k] !== existing.pipeline?.[k]) changes.push(`Pipeline ${k}: ${existing.pipeline?.[k] || 0} → ${update.pipeline[k]}`);
          }
        }
        if (update.changeNote) changes.push(update.changeNote);
        const entry = { version: newVersion, date: new Date().toISOString(), changes };
        existing.changelog.unshift(entry);
        // Keep last 50 entries
        if (existing.changelog.length > 50) existing.changelog = existing.changelog.slice(0, 50);
        delete update.bumpMajor; delete update.bumpMinor; delete update.changeNote;
        const merged = { ...existing, ...update, version: newVersion, updatedAt: new Date().toISOString() };
        writeFileSync(kpiPath, JSON.stringify(merged, null, 2));
        log.info("[investor] KPIs updated", { version: newVersion, changes });
        return json(res, { ok: true, version: newVersion, changes });
      } catch { return json(res, { error: "Invalid JSON" }, 400); }
    });
    return;
  }

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
      log.error("[chat-sessions] Message query failed", { error: err.message });
      return json(res, { error: "Internal server error" }, 500);
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

  // ── Usage summary proxy (shre-meter) ──
  if (url.pathname === "/api/usage-summary" && req.method === "GET") {
    const qs = url.search || "";
    try {
      const meterUrl = serviceUrl("shre-meter");
      const upstream = await fetch(`${meterUrl}/v1/costs/summary${qs}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Usage summary proxy failed:", err.message);
      json(res, { error: "shre-meter unreachable" }, 502);
    }
    return;
  }

  // ── Trial status proxy (shre-stripe) ──
  if (url.pathname === "/api/trial-status" && req.method === "GET") {
    const workspaceId = url.searchParams.get("workspaceId") || "";
    if (!workspaceId) return json(res, { error: "Missing workspaceId" }, 400);
    try {
      const stripeUrl = serviceUrl("shre-stripe");
      const upstream = await fetch(`${stripeUrl}/v1/trials/${encodeURIComponent(workspaceId)}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Trial status proxy failed:", err.message);
      json(res, { error: "shre-stripe unreachable" }, 502);
    }
    return;
  }

  // ── Checkout proxy (shre-stripe) ──
  if (url.pathname === "/api/checkout" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      const stripeUrl = serviceUrl("shre-stripe");
      const upstream = await fetch(`${stripeUrl}/v1/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Checkout proxy failed:", err.message);
      json(res, { error: "shre-stripe unreachable" }, 502);
    }
    return;
  }

  // ── Billing portal proxy (shre-stripe) ──
  if (url.pathname === "/api/billing-portal" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      const stripeUrl = serviceUrl("shre-stripe");
      const upstream = await fetch(`${stripeUrl}/v1/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Billing portal proxy failed:", err.message);
      json(res, { error: "shre-stripe unreachable" }, 502);
    }
    return;
  }

  // ── Workspace provisioning endpoint ──
  if (url.pathname === "/api/provision-workspace" && req.method === "POST") {
    try {
      const body = JSON.parse(await collectBody(req));
      const { userId, name, businessName, industry, size } = body;
      if (!userId || !name) return json(res, { error: "Missing userId or name" }, 400);

      // Try marketplace API first, fall back to local script
      let workspaceId = null;
      try {
        const marketplaceUrl = serviceUrl("shre-marketplace");
        const mpRes = await fetch(`${marketplaceUrl}/v1/workspaces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, name, businessName, industry, size, plan: "free" }),
          signal: AbortSignal.timeout(15000),
        });
        if (mpRes.ok) {
          const mpData = await mpRes.json();
          workspaceId = mpData.workspaceId || mpData.id;
        }
      } catch {
        // marketplace unavailable — fall back to provision script
      }

      if (!workspaceId) {
        try {
          const scriptPath = join(import.meta.dirname, "..", "scripts", "provision-workspace.mjs");
          if (existsSync(scriptPath)) {
            const result = execSync(
              `node ${scriptPath} --user-id="${userId}" --name="${name.replace(/"/g, '\\"')}" --business="${(businessName || "").replace(/"/g, '\\"')}" --industry="${(industry || "").replace(/"/g, '\\"')}" --size="${size || "solo"}"`,
              { timeout: 30000, encoding: "utf-8" }
            );
            const parsed = JSON.parse(result.trim().split("\n").pop() || "{}");
            workspaceId = parsed.workspaceId || parsed.id;
          }
        } catch (scriptErr) {
          log.warn("Provision script failed:", scriptErr.message);
        }
      }

      // Generate a fallback workspace ID if all else fails
      if (!workspaceId) {
        workspaceId = `ws_${userId}_${Date.now().toString(36)}`;
      }

      log.info("Workspace provisioned", { workspaceId, userId });
      json(res, { workspaceId, status: "created" });
    } catch (err) {
      log.error("Workspace provisioning failed:", err.message);
      json(res, { error: "Provisioning failed" }, 500);
    }
    return;
  }

  // ── Agent capabilities proxy (shre-router) ──
  if (url.pathname === "/api/agents/capabilities" && req.method === "GET") {
    try {
      const routerUrl = serviceUrl("shre-router");
      const upstream = await fetch(`${routerUrl}/v1/agents/capabilities`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Agent capabilities proxy failed:", err.message);
      json(res, { error: "shre-router unreachable" }, 502);
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

  // ── Marketplace catalog proxy (shre-marketplace) ──
  if (url.pathname === "/api/marketplace/catalog" && req.method === "GET") {
    try {
      const marketplaceUrl = serviceUrl("shre-marketplace");
      const upstream = await fetch(`${marketplaceUrl}/v1/marketplace/catalog${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Marketplace catalog proxy failed:", err.message);
      json(res, { error: "shre-marketplace unreachable" }, 502);
    }
    return;
  }

  // ── Marketplace catalog detail proxy (shre-marketplace) ──
  if (url.pathname.startsWith("/api/marketplace/catalog/detail/") && req.method === "GET") {
    try {
      const itemId = url.pathname.split("/api/marketplace/catalog/detail/")[1];
      const marketplaceUrl = serviceUrl("shre-marketplace");
      const upstream = await fetch(`${marketplaceUrl}/v1/marketplace/catalog/detail/${encodeURIComponent(itemId)}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Marketplace detail proxy failed:", err.message);
      json(res, { error: "shre-marketplace unreachable" }, 502);
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

  // ── Tasks CRUD proxy (shre-tasks) — forwards user context headers ──
  if (url.pathname === "/api/tasks" && (req.method === "GET" || req.method === "POST")) {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const ctxHeaders = userContextHeaders(req);
      if (req.method === "GET") {
        const upstream = await fetch(`${tasksUrl}/v1/tasks${url.search || "?limit=100"}`, { headers: ctxHeaders, signal: AbortSignal.timeout(8000) });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await fetch(`${tasksUrl}/v1/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctxHeaders },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Tasks proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Single task update proxy ──
  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)$/);
  if (taskIdMatch && (req.method === "PATCH" || req.method === "GET")) {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const ctxHeaders = userContextHeaders(req);
      const taskId = taskIdMatch[1];
      if (req.method === "GET") {
        const upstream = await fetch(`${tasksUrl}/v1/tasks/${taskId}`, { headers: ctxHeaders, signal: AbortSignal.timeout(5000) });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await fetch(`${tasksUrl}/v1/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...ctxHeaders },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Task update proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Task assignment proxy (shre-tasks) ──
  const assignMatch = url.pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/assignment$/);
  if (assignMatch && req.method === "PATCH") {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const ctxHeaders = userContextHeaders(req);
      const taskId = assignMatch[1];
      const body = await collectBody(req);
      const upstream = await fetch(`${tasksUrl}/v1/tasks/${taskId}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...ctxHeaders },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Task assignment proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Projects proxy (shre-tasks) ──
  if (url.pathname === "/api/projects" && (req.method === "GET" || req.method === "POST")) {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const ctxHeaders = userContextHeaders(req);
      if (req.method === "GET") {
        const upstream = await fetch(`${tasksUrl}/v1/projects${url.search || ""}`, { headers: ctxHeaders, signal: AbortSignal.timeout(8000) });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await fetch(`${tasksUrl}/v1/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctxHeaders },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Projects proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Briefing proxy (shre-tasks) ──
  if (url.pathname === "/api/briefing" && req.method === "GET") {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      const upstream = await fetch(`${tasksUrl}/v1/briefing`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Briefing proxy failed:", err.message);
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

  // ── Contacts list proxy (shre-contacts) ──
  if (url.pathname === "/api/contacts" && req.method === "GET") {
    try {
      const contactsUrl = serviceUrl("shre-contacts");
      const headers = CONTACTS_TOKEN ? { Authorization: `Bearer ${CONTACTS_TOKEN}` } : {};
      const upstream = await fetch(`${contactsUrl}/v1/contacts${url.search || ""}`, { headers, signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Contacts list proxy failed:", err.message);
      json(res, { error: "shre-contacts unreachable" }, 502);
    }
    return;
  }

  // ── Contacts search proxy (shre-contacts) ──
  if (url.pathname === "/api/contacts/search" && req.method === "GET") {
    try {
      const contactsUrl = serviceUrl("shre-contacts");
      const headers = CONTACTS_TOKEN ? { Authorization: `Bearer ${CONTACTS_TOKEN}` } : {};
      const upstream = await fetch(`${contactsUrl}/v1/contacts/search${url.search || ""}`, { headers, signal: AbortSignal.timeout(8000) });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Contacts proxy failed:", err.message);
      json(res, { error: "shre-contacts unreachable" }, 502);
    }
    return;
  }

  // ── Contacts create proxy (shre-contacts) ──
  if (url.pathname === "/api/contacts" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      const contactsUrl = serviceUrl("shre-contacts");
      const authHeaders = CONTACTS_TOKEN ? { Authorization: `Bearer ${CONTACTS_TOKEN}` } : {};
      const upstream = await fetch(`${contactsUrl}/v1/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Contacts create proxy failed:", err.message);
      json(res, { error: "shre-contacts unreachable" }, 502);
    }
    return;
  }

  // ── Projects proxy (shre-tasks) ──
  if (url.pathname === "/api/projects" && (req.method === "GET" || req.method === "POST")) {
    try {
      const tasksUrl = serviceUrl("shre-tasks");
      if (req.method === "GET") {
        const upstream = await fetch(`${tasksUrl}/v1/projects${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await fetch(`${tasksUrl}/v1/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Projects proxy failed:", err.message);
      json(res, { error: "shre-tasks unreachable" }, 502);
    }
    return;
  }

  // ── Issues proxy (MIB007) — forwards user context ──
  if (url.pathname === "/api/issues" && (req.method === "GET" || req.method === "POST")) {
    try {
      const companyId = await mib007CompanyId(req);
      if (!companyId) return json(res, { error: "No company found" }, 404);
      const ctxHeaders = userContextHeaders(req);

      if (req.method === "GET") {
        const upstream = await mib007Fetch(`/api/companies/${companyId}/issues${url.search || ""}`, { signal: AbortSignal.timeout(8000), headers: ctxHeaders });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await mib007Fetch(`/api/companies/${companyId}/issues`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctxHeaders },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Issues proxy failed:", err.message);
      json(res, { error: "MIB007 unreachable" }, 502);
    }
    return;
  }

  // ── Goals proxy (MIB007) — forwards user context ──
  if (url.pathname === "/api/goals" && (req.method === "GET" || req.method === "POST")) {
    try {
      const companyId = await mib007CompanyId(req);
      if (!companyId) return json(res, { error: "No company found" }, 404);
      const ctxHeaders = userContextHeaders(req);

      if (req.method === "GET") {
        const upstream = await mib007Fetch(`/api/companies/${companyId}/goals${url.search || ""}`, { signal: AbortSignal.timeout(8000), headers: ctxHeaders });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        const body = await collectBody(req);
        const upstream = await mib007Fetch(`/api/companies/${companyId}/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctxHeaders },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
      }
    } catch (err) {
      log.warn("Goals proxy failed:", err.message);
      json(res, { error: "MIB007 unreachable" }, 502);
    }
    return;
  }

  // ── Email proxy (all routes via MIB007 email API) ──
  // Helper: parse "Name <email>" into { name, email }
  function parseEmailParticipant(raw) {
    if (!raw) return { name: "Unknown", email: "" };
    const match = raw.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    if (raw.includes("@")) return { name: raw.split("@")[0], email: raw };
    return { name: raw, email: raw };
  }

  // Helper: transform MIB007 message list → shre-chat ThreadSummary[]
  function toThreadSummaries(messages, myEmail) {
    const threadMap = new Map();
    for (const msg of messages) {
      const tid = msg.threadId || msg.id;
      if (!threadMap.has(tid)) threadMap.set(tid, []);
      threadMap.get(tid).push(msg);
    }
    const threads = [];
    for (const [tid, msgs] of threadMap) {
      msgs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const first = msgs[0];
      const last = msgs[msgs.length - 1];
      const fromP = parseEmailParticipant(first.from);
      const lastFromP = parseEmailParticipant(last.from);
      const participantSet = new Map();
      for (const m of msgs) {
        const p = parseEmailParticipant(m.from);
        if (p.email) participantSet.set(p.email, p);
      }
      threads.push({
        id: tid,
        subject: first.subject || "(no subject)",
        snippet: last.snippet || "",
        messageCount: msgs.length,
        from: fromP,
        lastFrom: lastFromP,
        participants: [...participantSet.values()],
        date: last.date,
        timestamp: new Date(last.date).getTime(),
        unread: msgs.some((m) => m.labelIds?.includes?.("UNREAD")),
        hasAttachments: msgs.some((m) => m.hasAttachments),
      });
    }
    threads.sort((a, b) => b.timestamp - a.timestamp);
    return { threads, myEmail: myEmail || "" };
  }

  // Helper: transform MIB007 message detail → shre-chat EmailThread
  function toEmailThread(detail, threadMessages, myEmail) {
    const messages = (threadMessages || [detail]).map((m) => {
      const fromP = parseEmailParticipant(m.from);
      const toList = (m.to || "").split(",").filter(Boolean).map((t) => parseEmailParticipant(t.trim()));
      const ccList = (m.cc || "").split(",").filter(Boolean).map((t) => parseEmailParticipant(t.trim()));
      return {
        id: m.id || m.messageId,
        threadId: m.threadId || detail.threadId,
        from: fromP,
        to: toList,
        cc: ccList,
        subject: m.subject || detail.subject || "",
        date: m.date || "",
        timestamp: new Date(m.date || "").getTime(),
        body: m.body || m.htmlBody || m.textBody || "",
        attachments: (m.attachments || []).map((a) => ({
          id: a.attachmentId,
          messageId: m.id || m.messageId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size || 0,
        })),
        isMe: myEmail ? fromP.email.toLowerCase() === myEmail.toLowerCase() : false,
        unread: m.labelIds?.includes?.("UNREAD") || false,
        snippet: m.snippet || "",
      };
    });
    const participantSet = new Map();
    for (const m of messages) {
      if (m.from.email) participantSet.set(m.from.email, m.from);
      for (const t of m.to) if (t.email) participantSet.set(t.email, t);
      for (const c of m.cc) if (c.email) participantSet.set(c.email, c);
    }
    return {
      id: detail.threadId || detail.id,
      subject: detail.subject || messages[0]?.subject || "",
      messages,
      participants: [...participantSet.values()],
      myEmail: myEmail || "",
    };
  }

  // GET /api/email/threads → MIB007 list messages, grouped into threads
  if (url.pathname === "/api/email/threads" && req.method === "GET") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { threads: [], myEmail: "" });
      const max = url.searchParams.get("max") || "30";
      const query = url.searchParams.get("q") || "";
      const label = url.searchParams.get("label") || "INBOX";
      const params = new URLSearchParams({ maxResults: max, folder: label });
      if (query) params.set("q", query);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/email/messages?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) throw new Error(`MIB007 email list failed: ${upstream.status}`);
      const data = await upstream.json();
      const messages = data.messages || data || [];
      // Get myEmail from accounts endpoint
      let myEmail = "";
      try {
        const acctRes = await mib007Fetch(`/api/companies/${companyId}/email/accounts`, { signal: AbortSignal.timeout(5000) });
        if (acctRes.ok) {
          const accts = await acctRes.json();
          myEmail = accts?.accounts?.[0]?.email || accts?.[0]?.email || "";
        }
      } catch {}
      json(res, toThreadSummaries(messages, myEmail));
    } catch (err) {
      log.warn("Email threads failed:", err.message);
      json(res, { error: err.message || "Failed to fetch threads" }, 502);
    }
    return;
  }

  // GET /api/email/thread/:threadId → MIB007 get message (returns thread context)
  const threadMatch = url.pathname.match(/^\/api\/email\/thread\/([a-zA-Z0-9]+)$/);
  if (threadMatch && req.method === "GET") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/email/messages/${threadMatch[1]}`, { signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) throw new Error(`MIB007 email get failed: ${upstream.status}`);
      const detail = await upstream.json();
      // Get myEmail
      let myEmail = "";
      try {
        const acctRes = await mib007Fetch(`/api/companies/${companyId}/email/accounts`, { signal: AbortSignal.timeout(5000) });
        if (acctRes.ok) {
          const accts = await acctRes.json();
          myEmail = accts?.accounts?.[0]?.email || accts?.[0]?.email || "";
        }
      } catch {}
      json(res, toEmailThread(detail, detail.threadMessages || detail.thread || [detail], myEmail));
    } catch (err) {
      log.warn("Email thread fetch failed:", err.message);
      json(res, { error: err.message }, 502);
    }
    return;
  }

  // POST /api/email/reply → MIB007 send with threading
  if (url.pathname === "/api/email/reply" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      if (!body.threadId || !body.body) return json(res, { error: "threadId and body required" }, 400);
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const sendBody = {
        to: body.to || "",
        subject: body.subject || "",
        body: body.body,
        threadId: body.threadId,
        inReplyTo: body.inReplyTo || undefined,
      };
      if (body.cc) sendBody.cc = body.cc;
      if (body.add) sendBody.cc = [body.cc, body.add].filter(Boolean).join(",");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) throw new Error(`MIB007 send failed: ${upstream.status}`);
      const result = await upstream.json();
      json(res, result);
    } catch (err) {
      log.warn("Email reply failed:", err.message);
      json(res, { error: err.message }, 500);
    }
    return;
  }

  // GET /api/email/attachment/:messageId/:attachmentId → MIB007 attachment proxy
  const attachMatch = url.pathname.match(/^\/api\/email\/attachment\/([a-zA-Z0-9]+)\/(.+)$/);
  if (attachMatch && req.method === "GET") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const upstream = await mib007Fetch(
        `/api/companies/${companyId}/email/messages/${attachMatch[1]}/attachments/${attachMatch[2]}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!upstream.ok) throw new Error(`Attachment download failed: ${upstream.status}`);
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = upstream.headers.get("content-type") || "application/octet-stream";
      const cd = upstream.headers.get("content-disposition") || "";
      res.writeHead(200, { "Content-Type": ct, "Content-Length": buf.length, ...(cd ? { "Content-Disposition": cd } : {}) });
      res.end(buf);
    } catch (err) {
      log.warn("Attachment download failed:", err.message);
      json(res, { error: "Attachment download failed" }, 502);
    }
    return;
  }

  // POST /api/email/draft → MIB007 AI draft
  if (url.pathname === "/api/email/draft" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      if (!body.to || !body.subject) return json(res, { error: "to and subject required" }, 400);
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/email/ai-compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Write an email to ${body.to} about: ${body.subject}${body.context ? `\n\nContext: ${body.context}` : ""}`,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!upstream.ok) {
        // Fallback to shre-router for AI drafting
        const systemPrompt = `You are a professional email composer. Write a concise, well-structured email body. Do NOT include subject, greeting, or signature — just the body. Keep it professional but natural.`;
        const userPrompt = `To: ${body.to}\nSubject: ${body.subject}${body.context ? `\n\nContext:\n${body.context}` : ""}\n\nWrite the email body:`;
        const apiRes = await fetch(`${serviceUrl("shre-router")}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "anthropic/claude-haiku-4-5", max_tokens: 1000, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!apiRes.ok) return json(res, { error: "AI drafting failed" }, 502);
        const apiData = await apiRes.json();
        return json(res, { to: body.to, subject: body.subject, body: (apiData.choices?.[0]?.message?.content || "").trim() });
      }
      const result = await upstream.json();
      json(res, { to: body.to, subject: body.subject, body: result.body || result.draft || "" });
    } catch (err) {
      log.warn("Email draft failed:", err.message);
      json(res, { error: "Draft failed" }, 500);
    }
    return;
  }

  // POST /api/email/send → MIB007 send
  if (url.pathname === "/api/email/send" && req.method === "POST") {
    try {
      const body = await collectBody(req);
      if (!body.to) return json(res, { error: "Missing 'to' field" }, 400);
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: body.to, subject: body.subject || "(no subject)", body: body.body || "", attachments: body.attachments }),
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) throw new Error(`MIB007 send failed: ${upstream.status}`);
      const result = await upstream.json();
      json(res, { ok: true, ...result });
    } catch (err) {
      log.warn("Email send failed:", err.message);
      json(res, { error: "Email send failed" }, 500);
    }
    return;
  }

  // ── CRM proxy (MIB007) ──
  if (url.pathname.startsWith("/api/crm/") || url.pathname === "/api/crm") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const subpath = url.pathname.replace("/api/crm", "");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/crm${subpath}${url.search || ""}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        ...(["POST", "PUT", "PATCH"].includes(req.method) ? { body: JSON.stringify(await collectBody(req)) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.json().catch(() => ({}));
      json(res, data, upstream.status);
    } catch (err) {
      log.warn("CRM proxy failed:", err.message);
      json(res, { error: "CRM proxy failed" }, 502);
    }
    return;
  }

  // ── Calendar proxy (MIB007) ──
  if (url.pathname.startsWith("/api/calendar/") || url.pathname === "/api/calendar") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const subpath = url.pathname.replace("/api/calendar", "");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/calendar${subpath}${url.search || ""}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        ...(["POST", "PUT", "PATCH"].includes(req.method) ? { body: JSON.stringify(await collectBody(req)) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.json().catch(() => ({}));
      json(res, data, upstream.status);
    } catch (err) {
      log.warn("Calendar proxy failed:", err.message);
      json(res, { error: "Calendar proxy failed" }, 502);
    }
    return;
  }

  // ── Dashboard proxy (MIB007) ──
  if (url.pathname.startsWith("/api/dashboards/") || url.pathname === "/api/dashboards") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const subpath = url.pathname.replace("/api/dashboards", "");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/dashboards${subpath}${url.search || ""}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        ...(["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? { body: JSON.stringify(await collectBody(req)) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.json().catch(() => ({}));
      json(res, data, upstream.status);
    } catch (err) {
      log.warn("Dashboard proxy failed:", err.message);
      json(res, { error: "Dashboard proxy failed" }, 502);
    }
    return;
  }

  // ── Support proxy (MIB007) ──
  if (url.pathname.startsWith("/api/support/") || url.pathname === "/api/support") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const subpath = url.pathname.replace("/api/support", "");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/support${subpath}${url.search || ""}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        ...(["POST", "PUT", "PATCH"].includes(req.method) ? { body: JSON.stringify(await collectBody(req)) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.json().catch(() => ({}));
      json(res, data, upstream.status);
    } catch (err) {
      log.warn("Support proxy failed:", err.message);
      json(res, { error: "Support proxy failed" }, 502);
    }
    return;
  }

  // ── Network monitor proxy (MIB007) ──
  if (url.pathname.startsWith("/api/network/") || url.pathname === "/api/network") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, { error: "No company" }, 400);
      const subpath = url.pathname.replace("/api/network", "");
      const upstream = await mib007Fetch(`/api/companies/${companyId}/network${subpath}${url.search || ""}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.json().catch(() => ({}));
      json(res, data, upstream.status);
    } catch (err) {
      log.warn("Network proxy failed:", err.message);
      json(res, { error: "Network proxy failed" }, 502);
    }
    return;
  }

  // ── Nodes proxy (MIB007) ──
  if (url.pathname === "/api/nodes" && req.method === "GET") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, []);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/nodes${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.json().catch(() => []);
      json(res, data);
    } catch (err) {
      log.warn("Nodes proxy failed:", err.message);
      json(res, [], 502);
    }
    return;
  }

  // ── Tools/Skills proxy (MIB007 marketplace) ──
  if (url.pathname === "/api/tools" && req.method === "GET") {
    try {
      const upstream = await mib007Fetch(`/api/marketplace/skills${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.json().catch(() => []);
      json(res, data);
    } catch (err) {
      log.warn("Tools proxy failed:", err.message);
      json(res, [], 502);
    }
    return;
  }

  // ── Permissions proxy (MIB007 vault) ──
  if (url.pathname === "/api/permissions" && req.method === "GET") {
    try {
      const companyId = await mib007CompanyId();
      if (!companyId) return json(res, []);
      const upstream = await mib007Fetch(`/api/companies/${companyId}/vault/tool-permissions${url.search || ""}`, { signal: AbortSignal.timeout(8000) });
      const data = await upstream.json().catch(() => []);
      json(res, data);
    } catch (err) {
      log.warn("Permissions proxy failed:", err.message);
      json(res, [], 502);
    }
    return;
  }

  // ── Agents list proxy (enriched with fleet session data) ──
  if (url.pathname === "/api/agents" && req.method === "GET") {
    try {
      // Fetch agent config + fleet sessions + CLI sessions in parallel
      const [configRes, fleetRes, cliRes] = await Promise.allSettled([
        fetch(`${serviceUrl("shre-router")}/v1/config/agents`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${serviceUrl("shre-fleet")}/v1/fleet`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${serviceUrl("shre-fleet")}/v1/cli-sessions`, { signal: AbortSignal.timeout(3000) }),
      ]);

      // Parse agent config
      let agentModels = {};
      if (configRes.status === "fulfilled" && configRes.value.ok) {
        agentModels = await configRes.value.json();
      }

      // Parse fleet sessions (active spawned agents)
      let fleetSessions = [];
      if (fleetRes.status === "fulfilled" && fleetRes.value.ok) {
        const fleetData = await fleetRes.value.json();
        fleetSessions = fleetData.sessions || [];
      }

      // Parse CLI sessions (active Claude Code sessions)
      let cliSessions = [];
      if (cliRes.status === "fulfilled" && cliRes.value.ok) {
        const cliData = await cliRes.value.json();
        cliSessions = (cliData.sessions || []).filter(s => s.status === "active");
      }

      // Build agent → active session lookup
      const agentSessionMap = new Map();
      for (const s of fleetSessions) {
        agentSessionMap.set(s.agent, {
          taskId: s.task_id,
          title: s.title,
          phase: s.phase,
          progress: s.progress,
          elapsedMs: s.elapsed_ms,
          type: "fleet",
        });
      }
      for (const s of cliSessions) {
        if (s.agent && !agentSessionMap.has(s.agent)) {
          agentSessionMap.set(s.agent, {
            taskId: s.task_id,
            title: s.intent || "CLI session",
            phase: "active",
            progress: `${s.prompt_count} prompts`,
            elapsedMs: s.age_ms,
            type: "cli",
          });
        }
      }

      // Merge: agent config + live session data
      const agents = Object.entries(agentModels)
        .filter(([k]) => k !== "_default")
        .map(([id, model]) => {
          const session = agentSessionMap.get(id);
          return {
            id,
            name: id,
            model,
            status: session ? "busy" : "idle",
            currentTask: session || null,
          };
        });

      // Also add any agents that are active in fleet but not in router config
      for (const [agentId, session] of agentSessionMap) {
        if (!agentModels[agentId]) {
          agents.push({
            id: agentId,
            name: agentId,
            model: fleetSessions.find(s => s.agent === agentId)?.model || "unknown",
            status: "busy",
            currentTask: session,
          });
        }
      }

      // Sort: busy agents first
      agents.sort((a, b) => (a.status === "busy" ? 0 : 1) - (b.status === "busy" ? 0 : 1));

      return json(res, agents);
    } catch (err) {
      log.warn("Agents proxy failed:", err.message);
      json(res, [], 502);
    }
    return;
  }

  // ── Centrix ERP proxy ──
  if (url.pathname.startsWith("/api/centrix/") || url.pathname === "/api/centrix") {
    try {
      const subpath = url.pathname.replace("/api/centrix", "") || "/";
      const centrixBase = process.env.CENTRIX_URL || serviceUrl("centrix");
      const centrixOpts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Source": "shre-chat",
          ...(req.headers["authorization"] ? { Authorization: req.headers["authorization"] } : {}),
        },
        signal: AbortSignal.timeout(15000),
      };
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        centrixOpts.body = JSON.stringify(await collectBody(req));
      }
      const upstream = await fetch(`${centrixBase}/api${subpath}${url.search || ""}`, centrixOpts);
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Centrix proxy failed:", err.message);
      json(res, { error: "Centrix unavailable" }, 502);
    }
    return;
  }

  // ── Platform status (aggregated health — full service list) ──
  if (url.pathname === "/api/platform-status" && req.method === "GET") {
    try {
      const healthUrl = serviceUrl("shre-health");

      // Try shre-health /v1/services first (full list with latency/uptime)
      let servicesData = null;
      try {
        const svcRes = await fetch(`${healthUrl}/v1/services`, { signal: AbortSignal.timeout(8000) });
        if (svcRes.ok) servicesData = await svcRes.json();
      } catch { /* try fallback */ }

      if (servicesData && servicesData.services) {
        const svcList = servicesData.services.map(s => ({
          name: s.name,
          port: s.port,
          type: s.type || "service",
          healthy: s.status === "ok",
          status: s.status || "unknown",
          latency_ms: s.latency_ms ?? null,
          uptime_pct: s.uptime_pct ?? null,
        }));
        // Sort: unhealthy first, then by name
        svcList.sort((a, b) => (a.healthy ? 1 : 0) - (b.healthy ? 1 : 0) || a.name.localeCompare(b.name));
        const healthy = svcList.filter(s => s.healthy).length;
        return json(res, {
          services: svcList,
          summary: `${healthy}/${svcList.length} services healthy`,
        });
      }

      // Fallback: try /v1/status
      try {
        const statusRes = await fetch(`${healthUrl}/v1/status`, { signal: AbortSignal.timeout(5000) });
        if (statusRes.ok) {
          const data = await statusRes.json();
          return json(res, data);
        }
      } catch { /* try final fallback */ }

      // Final fallback: read ports.json and probe top services
      const { readFileSync } = await import("node:fs");
      const portsPath = join(import.meta.dirname || process.cwd(), "..", "ports.json");
      let ports = {};
      try { ports = JSON.parse(readFileSync(portsPath, "utf-8")); } catch { /* no ports.json */ }
      const svcNames = Object.keys(ports).filter(k => ports[k]?.port && ports[k]?.health_check !== false).slice(0, 25);
      const results = await Promise.allSettled(
        svcNames.map(async (svc) => {
          const start = Date.now();
          try {
            const svcUrl = serviceUrl(svc);
            const r = await fetch(`${svcUrl}/health`, { signal: AbortSignal.timeout(3000) });
            return { name: svc, port: ports[svc].port, healthy: r.ok, status: r.ok ? "ok" : "down", latency_ms: Date.now() - start, uptime_pct: null };
          } catch {
            return { name: svc, port: ports[svc].port, healthy: false, status: "unreachable", latency_ms: null, uptime_pct: null };
          }
        })
      );
      const svcList = results.map((r) => r.status === "fulfilled" ? r.value : { name: "unknown", healthy: false, status: "error" });
      svcList.sort((a, b) => (a.healthy ? 1 : 0) - (b.healthy ? 1 : 0) || a.name.localeCompare(b.name));
      const healthy = svcList.filter(s => s.healthy).length;
      json(res, { services: svcList, summary: `${healthy}/${svcList.length} services healthy` });
    } catch (err) {
      log.warn("Platform status failed:", err.message);
      json(res, { services: [], summary: "Health check failed" }, 502);
    }
    return;
  }

  // ── Service restart proxy (shre-health) ──
  const restartMatch = url.pathname.match(/^\/api\/services\/([a-zA-Z0-9_-]+)\/restart$/);
  if (restartMatch && req.method === "POST") {
    try {
      const svcName = restartMatch[1];
      const healthUrl = serviceUrl("shre-health");
      const upstream = await fetch(`${healthUrl}/v1/services/${svcName}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000), // restart can take up to 8s (unload + load + 3s health check)
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      log.warn("Service restart proxy failed:", err.message);
      json(res, { ok: false, error: "shre-health unreachable" }, 502);
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
      const brandRes = await fetch(`${serviceUrl("shre-brand")}/v1/branding/public/${encodeURIComponent(domain)}`, {
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
      const sttStart = Date.now();

      // Fallback chain: shre-router (OpenAI) → shre-voice → browser SpeechRecognition signal
      const sttEndpoints = [
        `${serviceUrl("shre-router")}/v1/audio/transcriptions`,
        `http://127.0.0.1:5456/v1/audio/transcriptions`,
      ];

      for (let i = 0; i < sttEndpoints.length; i++) {
        const endpoint = sttEndpoints[i];
        try {
          const sttRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": req.headers["content-type"], "X-Source": "shre-chat" },
            body,
            signal: AbortSignal.timeout(15_000),
          });

          if (sttRes.status === 429 || sttRes.status >= 500) {
            // Rate limited or server error — try next endpoint
            const errBody = await sttRes.text().catch(() => "");
            log.warn(`[transcribe] ${sttRes.status} from ${endpoint}, trying fallback`, { status: sttRes.status, detail: errBody.slice(0, 100) });
            continue;
          }

          const oaBody = await sttRes.text();
          try {
            const result = JSON.parse(oaBody);
            if (sttRes.status >= 400) {
              recordVoiceFailure("stt_error", { detail: `HTTP ${sttRes.status}: ${(result.error?.message || "Whisper error").slice(0, 200)}` });
              return json(res, { error: result.error?.message || "Whisper error" }, sttRes.status);
            }
            if (!result.text || result.text.trim().length === 0) {
              const latency = Date.now() - sttStart;
              if (latency > 12000) {
                recordVoiceFailure("stt_timeout", { detail: `Whisper returned empty after ${latency}ms` });
              }
            }
            return json(res, { text: result.text || "" });
          } catch {
            recordVoiceFailure("stt_error", { detail: "Invalid Whisper response (JSON parse failed)" });
            return json(res, { error: "Invalid Whisper response" }, 502);
          }
        } catch (err) {
          const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
          if (i < sttEndpoints.length - 1) {
            log.warn(`[transcribe] ${isTimeout ? "timeout" : "error"} from ${endpoint}, trying fallback`, { error: err.message });
            continue;
          }
          recordVoiceFailure(isTimeout ? "stt_timeout" : "stt_error", { detail: err.message });
        }
      }

      // All server-side STT failed — signal client to use browser SpeechRecognition
      log.warn("[transcribe] All STT endpoints failed, signaling browser fallback");
      recordVoiceFailure("stt_all_failed", { detail: "All STT endpoints exhausted, browser fallback" });
      return json(res, { text: "", fallback: "browser", message: "Server transcription unavailable — using browser speech recognition" });
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
            provider: body.provider || "auto",
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!routerRes.ok) {
          const errBody = await routerRes.text();
          recordVoiceFailure("tts_error", { detail: `HTTP ${routerRes.status}: ${errBody.slice(0, 200)}` });
          return json(res, { error: `TTS failed: ${errBody}` }, routerRes.status);
        }

        const audioBuffer = await routerRes.arrayBuffer();
        res.writeHead(200, {
          "Content-Type": routerRes.headers.get("Content-Type") || "audio/mpeg",
          "Content-Length": audioBuffer.byteLength,
        });
        res.end(Buffer.from(audioBuffer));
      } catch (err) {
        recordVoiceFailure("tts_error", { detail: err.message, critical: err.name === "AbortError" });
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
          provider: parsed.provider || "auto",
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!routerRes.ok) {
        const errBody = await routerRes.text();
        recordVoiceFailure("tts_stream_error", { detail: `HTTP ${routerRes.status}: ${errBody.slice(0, 200)}` });
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
      nodeStream.on("error", (err) => {
        recordVoiceFailure("tts_stream_error", { detail: `Stream interrupted: ${err.message}` });
        try { res.end(); } catch {}
      });
    } catch (err) {
      recordVoiceFailure("tts_stream_error", { detail: err.message });
      if (!res.headersSent) return json(res, { error: "TTS stream failed: " + err.message }, 502);
      try { res.end(); } catch {}
    }
    return;
  }

  // ── Run endpoint — execute shell commands directly on the host ──
  // SECURITY: localhost-only — blocks access via Cloudflare tunnel / external networks
  if (url.pathname === "/api/run" && req.method === "POST") {
    const clientIp = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    if (clientIp !== "127.0.0.1" && clientIp !== "::1") {
      log.warn("run_command blocked — non-local access", { ip: clientIp });
      return json(res, { error: "Forbidden" }, 403);
    }
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
          json(res, { error: "Command execution failed", exitCode: -1 }, 500);
        });
      } catch (err) {
        return json(res, { error: "Invalid request body" }, 400);
      }
    });
    return;
  }

  // ── Gateway token endpoint — client fetches token at runtime ──
  // SECURITY: localhost-only — gateway token must never leak externally
  if (url.pathname === "/api/gateway-token" && req.method === "GET") {
    const clientIp = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    if (clientIp !== "127.0.0.1" && clientIp !== "::1") {
      log.warn("gateway-token blocked — non-local access", { ip: clientIp });
      return json(res, { error: "Forbidden" }, 403);
    }
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

  // ── Browser Approval Proxy (shre-browser:5476) ────────────────────
  if (url.pathname === "/api/browser/approvals/resolve" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const parsed = JSON.parse(body);
      const approvalId = parsed.approvalId;
      if (!approvalId) return json(res, { error: "approvalId required" }, 400);
      const upstream = await fetch(`http://127.0.0.1:5476/v1/approvals/${encodeURIComponent(approvalId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: parsed.status, resolvedBy: parsed.resolvedBy || "user", comment: parsed.comment }),
      });
      const data = await upstream.json();
      return json(res, data, upstream.status);
    } catch (err) {
      return json(res, { error: "Browser service unavailable" }, 502);
    }
  }

  if (url.pathname === "/api/browser/approvals" && req.method === "GET") {
    try {
      const upstream = await fetch("http://127.0.0.1:5476/v1/approvals");
      const data = await upstream.json();
      return json(res, data);
    } catch (err) {
      return json(res, { error: "Browser service unavailable", approvals: [] }, 502);
    }
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

  // GET /demo — serve SPA with demo mode enabled (no auth required)
  if (url.pathname === "/demo") {
    try {
      let content = readFileSync(join(DIST, "index.html"), "utf-8");
      // Inject demo flag into HTML so the React app detects it
      content = content.replace("</head>", `<script>window.__SHRE_DEMO_MODE__=true;</script></head>`);
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache, no-store, must-revalidate" });
      res.end(content);
      return;
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
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
      log.error("[activity] Query failed", { error: err.message });
      return json(res, { error: "Internal server error" }, 500);
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
      log.error("[archive] Archive operation failed", { error: err.message });
      return json(res, { error: "Internal server error" }, 500);
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

  // ── Claude CLI Tool Execution — proxy to shre-router /v1/execute/claude ──
  // This is the preferred path for tool-based Claude CLI execution from the chat UI.
  // It goes through shre-router's budget guards, permissions, and monitoring.

  if (url.pathname === "/api/claude-tool/execute" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { prompt, agentId, cwd, maxTurns, stream } = JSON.parse(body);
      if (!prompt) return json(res, { error: "prompt required" }, 400);

      const routerUrl = serviceUrl("shre-router");
      const routerBody = {
        prompt,
        agentId: agentId || "shre",
        cwd: cwd || null,
        maxTurns: maxTurns || undefined,
        stream: stream !== false,
      };

      if (stream === false) {
        // Non-streaming: proxy and return JSON
        const upstream = await fetch(`${routerUrl}/v1/execute/claude`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(routerBody),
          signal: AbortSignal.timeout(300000), // 5 min timeout for long tasks
        });
        const data = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(data);
        return;
      }

      // Streaming: forward SSE from shre-router
      const routerReqMod = (routerUrl.startsWith("https") ? await import("https") : await import("http")).default;
      const routerReq = routerReqMod.request(
        `${routerUrl}/v1/execute/claude`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          rejectUnauthorized: false,
        },
        (routerRes) => {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          });

          let fullText = "";
          routerRes.on("data", (chunk) => {
            const text = chunk.toString();
            res.write(text);

            // Parse SSE events to extract final response for learning
            for (const line of text.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === "delta" && evt.text) fullText += evt.text;
              } catch { /* not JSON */ }
            }
          });

          routerRes.on("end", () => {
            res.end();
            // Log conversation for learning pipeline
            if (fullText.length > 50) {
              logConversationToCortex(agentId || "shre", prompt, fullText, "claude-tool", "claude-cli").catch(() => {});
              emitConversationComplete(agentId || "shre", prompt, fullText, "claude-tool", "claude-cli").catch(() => {});
            }
          });
        }
      );

      routerReq.on("error", (err) => {
        if (!res.headersSent) {
          json(res, { error: "shre-router unreachable: " + err.message }, 502);
        }
      });

      routerReq.end(JSON.stringify(routerBody));

      // Handle client disconnect
      req.on("close", () => {
        routerReq.destroy();
      });
    } catch (err) {
      if (!res.headersSent) json(res, { error: "Invalid request: " + err.message }, 400);
    }
    return;
  }

  // ── GET /api/claude-tool/status — active Claude CLI sessions ──
  if (url.pathname === "/api/claude-tool/status" && req.method === "GET") {
    try {
      const routerUrl = serviceUrl("shre-router");
      const upstream = await fetch(`${routerUrl}/v1/execute/claude/status`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err) {
      json(res, { error: "shre-router unreachable" }, 502);
    }
    return;
  }

  // ── CLI Mode: spawn `claude` CLI and stream response via SSE ────

  if (url.pathname === "/api/cli/chat" && req.method === "POST") {
    let body;
    try { body = await collectBody(req, 5 * 1024 * 1024); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { message, continueConversation, agentId, autoMode } = JSON.parse(body);
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
        // Auto mode: skip all permission prompts — Claude executes autonomously
        if (autoMode) {
          args.push("--dangerously-skip-permissions");
          log.info("[cli] Auto mode: --dangerously-skip-permissions enabled");
        }

        const cliEnv = { ...process.env, NO_COLOR: "1" };
        delete cliEnv.CLAUDECODE;
        delete cliEnv.CLAUDE_CODE_SESSION;
        delete cliEnv.CLAUDE_CODE_CONVERSATION_ID;

        const proc = spawn("claude", args, {
          env: cliEnv,
          cwd: process.env.SHRE_DIR || join(process.env.HOME || "~", "Documents", "Projects", "shreai"),
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
                const initData = { type: "status", event: "init", model: evt.model };
                if (autoMode) initData.autoMode = true;
                res.write(`data: ${JSON.stringify(initData)}\n\n`);
              } else if (evt.type === "assistant") {
                // Extract text from content blocks
                const content = evt.message?.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === "text" && block.text) {
                      fullResponseText += block.text;
                      res.write(`data: ${JSON.stringify({ type: "delta", text: block.text })}\n\n`);
                    } else if (block.type === "tool_use") {
                      // Rich tool events: name, input preview, ID
                      const toolEvt = {
                        type: "tool_start",
                        tool: block.name,
                        toolId: block.id,
                        input: typeof block.input === "string"
                          ? block.input.slice(0, 500)
                          : JSON.stringify(block.input || {}).slice(0, 500),
                      };
                      res.write(`data: ${JSON.stringify(toolEvt)}\n\n`);
                    } else if (block.type === "tool_result") {
                      res.write(`data: ${JSON.stringify({
                        type: "tool_result",
                        toolId: block.tool_use_id,
                        output: typeof block.content === "string"
                          ? block.content.slice(0, 2000)
                          : JSON.stringify(block.content || "").slice(0, 2000),
                        isError: block.is_error || false,
                      })}\n\n`);
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
            const cliTenantId = authClaims?.activeWorkspaceId || "default";
            logConversationToCortex(agent, message, fullResponseText, "openclaw-cli", "claude-cli", cliTenantId).catch(() => {});

            // Emit task.complete → shre-scorer evaluates, feeds muscle memory + skills + training data
            emitConversationComplete(agent, message, fullResponseText, "openclaw-cli", "claude-cli").catch(() => {});

            // RAG conversation learner — extract insights into CortexDB vectors for semantic recall
            conversationLearner.learn(message, fullResponseText, cliTenantId, agent).catch(() => {});

            // Feedback pipeline — report conversation to MIB + Shre + Ellie
            feedbackPipeline.reportKnowledgeLearned("conversation", fullResponseText.slice(0, 200), `chat:${agent}`).catch(() => {});
          }

          releaseSlot();
          res.write(`data: ${JSON.stringify({ type: "end", code })}\n\n`);
          res.end();
        });

        proc.on("error", (err) => {
          releaseSlot();
          log.error("[run] Process error", { error: err.message });
          res.write(`data: ${JSON.stringify({ type: "error", error: "Command execution failed" })}\n\n`);
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

  // ── POST /api/feedback — user thumbs up/down on assistant messages ──
  if (url.pathname === "/api/feedback" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { messageId, workspaceId, rating, agentId, userInput, assistantText } = JSON.parse(body);
      if (!messageId || !rating) return json(res, { error: "messageId and rating required" }, 400);

      // 1. Audit log — persist feedback for analytics
      try {
        const userId = authClaims?.sub || 'system';
        chatDb.prepare(
          `INSERT INTO chat_audit_log (id, session_id, trace_id, event_type, agent_id, model, user_id, user_message, assistant_response, created_at)
           VALUES (?, ?, ?, 'user_feedback', ?, ?, ?, ?, ?, ?)`
        ).run(randomUUID(), workspaceId || "unknown", messageId, agentId || "shre", rating,
          userId, (userInput || "").slice(0, 2000), (assistantText || "").slice(0, 2000), Date.now());
      } catch (auditErr) { log.warn("Feedback audit log failed", {}, auditErr); }

      // 2. Forward to shre-router routing feedback (improves agent/model selection)
      try {
        const routerUrl = serviceUrl("shre-router");
        fetch(`${routerUrl}/v1/routing/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: workspaceId || "unknown",
            satisfaction: rating === "positive" ? 5 : 1,
          }),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } catch {}

      // 3. Feedback pipeline — report to upstream agents
      feedbackPipeline.reportKnowledgeLearned(
        "user-feedback",
        `User ${rating} feedback on ${agentId || "shre"}: ${(userInput || "").slice(0, 100)}`,
        `feedback:${workspaceId || "unknown"}`,
      ).catch(() => {});

      // 4. Training data — record feedback for fine-tuning (uses top-level import)
      if (userInput && assistantText) {
        try {
          writeConversation({
            agentId: agentId || "shre",
            userMessage: userInput,
            assistantResponse: assistantText,
            quality: rating === "positive" ? 5 : 1,
            source: "user-feedback",
            model: "unknown",
          }).catch(() => {});
        } catch {}
      }

      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
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
      const wsTenantId = authClaims?.activeWorkspaceId || "default";
      logConversationToCortex(agentId || "shre", userMessage, assistantResponse, "openclaw-ws", model || "unknown", wsTenantId).catch(() => {});
      const conversationForSkills = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
      extractAndLogSkills(agentId || "shre", conversationForSkills).catch(() => {});

      // Emit task.complete → shre-scorer evaluates, feeds muscle memory + skills + training data
      emitConversationComplete(agentId || "shre", userMessage, assistantResponse, "openclaw-ws", model || "unknown").catch(() => {});

      // RAG conversation learner — extract insights into CortexDB vectors for semantic recall
      conversationLearner.learn(userMessage, assistantResponse, wsTenantId, agentId || "shre").catch(() => {});

      // Feedback pipeline — report conversation to MIB + Shre + Ellie
      feedbackPipeline.reportKnowledgeLearned("conversation", assistantResponse.slice(0, 200), `ws:${agentId || "shre"}`).catch(() => {});

      // Post-conversation quality evaluation — scores response, flags issues, writes training data
      conversationEvaluator.evaluate(sessionId, userMessage, assistantResponse, agentId || "shre", model || "unknown").catch(() => {});

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
      delete routerHeaders["x-channel"];
      if (authClaims?.activeWorkspaceId) {
        routerHeaders["x-tenant-id"] = authClaims.activeWorkspaceId;
        routerHeaders["x-user-id"] = authClaims.sub;
      }
      routerHeaders["x-channel"] = "shre-chat";
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
          let ended = false;

          // Guard: if client disconnects early, stop forwarding
          res.on("close", () => { ended = true; });

          routerRes.on("data", (chunk) => {
            if (ended) return; // client gone or stream ended — discard
            try { res.write(chunk); } catch { ended = true; /* client disconnected */ }
            if (totalLen < MAX_CAPTURE) {
              chunks.push(chunk);
              totalLen += chunk.length;
            }
          });
          routerRes.on("end", () => {
            // Debug: log.info("[router-proxy] stream ended", { totalLen });
            ended = true;
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
                const proxyTenantId = authClaims?.activeWorkspaceId || parsed.tenantId || "default";
                logConversationToCortex(agentId, userMessage, assistantResponse, "router-proxy", model, proxyTenantId).catch(() => {});
                emitConversationComplete(agentId, userMessage, assistantResponse, "router-proxy", model).catch(() => {});
                conversationLearner.learn(userMessage, assistantResponse, proxyTenantId, agentId).catch(() => {});
                extractAndLogSkills(agentId, `User: ${userMessage}\n\nAssistant: ${assistantResponse}`).catch(() => {});
                // Post-conversation quality evaluation — auto-scores, flags issues, writes training data
                conversationEvaluator.evaluate(sessionId, userMessage, assistantResponse, agentId, model).catch(() => {});
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
        if (!res.headersSent) {
          // Emergency fallback: search local message history for similar Q&A
          try {
            const parsed = JSON.parse(reqBody || "{}");
            const lastUserMsg = [...(parsed.messages || [])].reverse().find(m => m.role === "user")?.content || "";
            const cached = emergencyResponseLookup(lastUserMsg);
            if (cached) {
              log.info("[router-proxy] Serving cached response (router unavailable)");
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                content: cached.content,
                model: "cached-local",
                agent: cached.agent_id,
                _cached: true,
                _notice: "AI router is temporarily unavailable. This is a cached response from a similar previous conversation.",
              }));
              return;
            }
          } catch { /* fallback lookup failed */ }
          res.writeHead(502);
          res.end(JSON.stringify({ error: "shre-router unreachable", _notice: "AI is temporarily unavailable. Please try again in a moment." }));
        }
      });
      // Buffer request body for memory injection
      const reqChunks = [];
      req.on("data", (chunk) => { reqChunks.push(chunk); reqBody += chunk; });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(reqBody || "{}");
          const agentId = parsed.agentId || "shre";
          const lastUserMsg = [...(parsed.messages || [])].reverse().find(m => m.role === "user")?.content || "";
          const tenantId = authClaims?.activeWorkspaceId || parsed.tenantId || "default";

          // ── Context + Memory injection (parallel) ──
          const [contextBlock, memoryBlock] = await Promise.all([
            fetchContextInjection(agentId, lastUserMsg, tenantId).catch(() => null),
            buildAgentMemory(agentId).catch(() => null),
          ]);

          // Assemble: context first (soul/platform/RAG/data), then agent memories
          const injections = [contextBlock, memoryBlock].filter(Boolean);
          if (injections.length > 0) {
            const combined = injections.join("\n\n---\n\n");
            parsed.systemPrompt = combined + "\n\n" + (parsed.systemPrompt || "");
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

  // ── Employee Activity API (CortexDB — async via cortexPool) ──
  if (url.pathname === "/api/employee-activity" && req.method === "GET") {
    try {
      const schema = url.searchParams?.get("schema") || "party_liquor";
      const period = url.searchParams?.get("period") || "today";
      const { from, to } = getDateRange(period);
      const { rows } = await cortexPool.query(
        `SELECT cashier_name as name, COUNT(*) as transactions,
                ROUND(SUM(bill_amount)::numeric, 2) as sales,
                ROUND(AVG(bill_amount)::numeric, 2) as avg_ticket,
                SUM(CASE WHEN is_void THEN 1 ELSE 0 END) as voids,
                SUM(CASE WHEN bill_amount = 0 AND NOT is_void THEN 1 ELSE 0 END) as no_sales,
                SUM(CASE WHEN bill_amount < 0 THEN 1 ELSE 0 END) as refunds,
                ROUND(SUM(CASE WHEN is_void THEN bill_amount ELSE 0 END)::numeric, 2) as void_amount
         FROM ${pgIdent(schema)}.invoices
         WHERE invoice_date >= $1 AND invoice_date <= $2
         GROUP BY cashier_name ORDER BY sales DESC`,
        [from, to + "T23:59:59"]
      );
      const employees = [];
      let totalSales = 0, totalTransactions = 0, totalVoids = 0, totalNoSales = 0, totalRefunds = 0, totalVoidAmount = 0;
      for (const r of rows) {
        const emp = {
          name: r.name || "Unknown",
          transactions: parseInt(r.transactions) || 0,
          sales: parseFloat(r.sales) || 0,
          avgTicket: parseFloat(r.avg_ticket) || 0,
          voids: parseInt(r.voids) || 0,
          noSales: parseInt(r.no_sales) || 0,
          refunds: parseInt(r.refunds) || 0,
          voidAmount: parseFloat(r.void_amount) || 0,
        };
        employees.push(emp);
        totalSales += emp.sales;
        totalTransactions += emp.transactions;
        totalVoids += emp.voids;
        totalNoSales += emp.noSales;
        totalRefunds += emp.refunds;
        totalVoidAmount += emp.voidAmount;
      }
      json(res, {
        period,
        summary: {
          totalSales: Math.round(totalSales * 100) / 100,
          totalTransactions,
          totalVoids,
          totalNoSales,
          totalRefunds,
          totalVoidAmount: Math.round(totalVoidAmount * 100) / 100,
        },
        employees,
      });
    } catch (err) {
      log.warn("[employee-activity] Query failed", { error: err.message });
      json(res, { error: "Employee activity query failed", detail: err.message }, 500);
    }
    return;
  }

  if (url.pathname === "/api/employee-activity/alerts" && req.method === "GET") {
    try {
      const schema = url.searchParams?.get("schema") || "party_liquor";
      const since = url.searchParams?.get("since");
      const limitVal = parseInt(url.searchParams?.get("limit")) || 50;
      const sinceDate = since ? new Date(parseInt(since)).toISOString() : new Date(Date.now() - 86400000).toISOString();
      const { rows } = await cortexPool.query(
        `SELECT invoice_no, invoice_date, cashier_name, bill_amount, is_void, discount_amount
         FROM ${pgIdent(schema)}.invoices
         WHERE (is_void = true OR bill_amount = 0 OR bill_amount < 0)
           AND invoice_date >= $1
         ORDER BY invoice_date DESC LIMIT $2`,
        [sinceDate, limitVal]
      );
      const alerts = rows.map((r) => {
        let type = "no_sale";
        if (r.is_void) type = "void";
        else if (parseFloat(r.bill_amount) < 0) type = "refund";
        return {
          id: `alert-${r.invoice_no}-${r.invoice_date}`,
          timestamp: r.invoice_date,
          type,
          employee: r.cashier_name || "Unknown",
          invoiceNo: r.invoice_no,
          amount: parseFloat(r.bill_amount) || 0,
        };
      });
      json(res, alerts);
    } catch (err) {
      log.warn("[employee-activity] Alerts query failed", { error: err.message });
      json(res, { error: "Employee activity alerts query failed", detail: err.message }, 500);
    }
    return;
  }

  // ── POST /api/notifications — accept notifications from internal services (Ellie escalation, etc.) ──
  if (url.pathname === "/api/notifications" && req.method === "POST") {
    try {
      let rawBody;
      try { rawBody = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      const parsed = JSON.parse(rawBody);
      const { type = "ellie.escalation", title = "Notification", body: notifBody = "", source = "system", severity = "info", sessionId } = parsed;
      const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Persist to DB
      chatDb.prepare(
        "INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
      ).run(notifId, type, title, notifBody, source, Date.now());

      // Broadcast to all connected WS clients
      broadcastNotification(type, { id: notifId, title, body: notifBody, source, severity, sessionId });

      log.info("[notifications] Notification created", { id: notifId, type, title: title.slice(0, 60), source });
      json(res, { ok: true, id: notifId });
    } catch (err) {
      log.warn("[notifications] Failed to create notification", { error: err.message });
      json(res, { error: "Failed to create notification", detail: err.message }, 500);
    }
    return;
  }

  // ── POST /api/messages/append — internal loopback: post a message into an existing chat session ──
  // Used by ellie-escalation to post resolution messages back into the originating chat session.
  if (url.pathname === "/api/messages/append" && req.method === "POST") {
    try {
      let rawBody;
      try { rawBody = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
      const parsed = JSON.parse(rawBody);
      const { sessionId, role = "assistant", content, source, metadata } = parsed;

      if (!sessionId || !content) {
        return json(res, { error: "sessionId and content are required" }, 400);
      }

      // Verify session exists
      const session = chatDb.prepare("SELECT id, user_id FROM chat_sessions WHERE id = ?").get(sessionId);
      if (!session) {
        return json(res, { error: "Session not found" }, 404);
      }

      // Insert message into chat_messages table
      const msgId = `msg-${Date.now()}-${source || "svc"}-${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      stmtInsertMessage.run(
        msgId,
        sessionId,
        role,
        content.slice(0, 50000),
        null,               // model
        source || "system",  // agent_id
        session.user_id || "system",
        JSON.stringify(metadata || {}),
        now
      );

      // Update session's updated_at so it surfaces in recents
      chatDb.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);

      // Broadcast via WebSocket so the user sees the message in real-time
      broadcastNotification("chat.message", {
        id: msgId,
        sessionId,
        role,
        content,
        source: source || "system",
        metadata: metadata || {},
      });

      log.info("[messages/append] Message appended to session", { msgId, sessionId, role, source });
      json(res, { ok: true, id: msgId });
    } catch (err) {
      log.warn("[messages/append] Failed to append message", { error: err.message });
      json(res, { error: "Failed to append message", detail: err.message }, 500);
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

    // 4. Reminders (user-scoped)
    try {
      const { userId: rUserId, tenantId: rTenantId } = getUserContext(req);
      const reminders = loadReminders(rUserId, rTenantId);
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
  // ── Voice quality stats — monitor failure rates ──
  if (url.pathname === "/api/voice-quality" && req.method === "GET") {
    const window = parseInt(url.searchParams?.get("window") || "3600000") || 3600000;
    return json(res, getVoiceQualityStats(window));
  }

  if (url.pathname === "/api/status-bar" && req.method === "GET") {
    const { userId: sbUserId, tenantId: sbTenantId } = getUserContext(req);
    const reminders = loadReminders(sbUserId, sbTenantId);
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

  // GET /api/reminders — list reminders for the logged-in user
  if (url.pathname === "/api/reminders" && req.method === "GET") {
    const { userId, tenantId } = getUserContext(req);
    return json(res, { reminders: loadReminders(userId, tenantId) });
  }

  // POST /api/reminders — create a reminder scoped to the logged-in user
  if (url.pathname === "/api/reminders" && req.method === "POST") {
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const { text, due, recurring, contact_email } = JSON.parse(body);
      if (!text || !due) return json(res, { error: "text and due required" }, 400);
      const cleanText = String(text).replace(/<[^>]*>/g, "").slice(0, 500).trim();
      if (!cleanText) return json(res, { error: "text cannot be empty after sanitization" }, 400);
      if (isNaN(new Date(due).getTime())) return json(res, { error: "invalid due date" }, 400);
      if (recurring && !["daily", "weekly", "monthly"].includes(recurring)) return json(res, { error: "recurring must be daily, weekly, or monthly" }, 400);
      const { userId, tenantId } = getUserContext(req);
      const reminder = {
        id: randomUUID().slice(0, 12),
        text: cleanText,
        due,
        recurring: recurring || null,
        completed: false,
        snoozed: null,
        createdAt: new Date().toISOString(),
        source: "manual",
        contact_email: contact_email || null,
        user_id: userId,
        tenant_id: tenantId,
      };
      saveReminder(reminder);
      return json(res, { ok: true, reminder });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // GET /api/reminders/due — check for due reminders for the logged-in user
  if (url.pathname === "/api/reminders/due" && req.method === "GET") {
    const { userId, tenantId } = getUserContext(req);
    const reminders = loadReminders(userId, tenantId);
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed) return false;
      if (r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    if (due.length > 0) {
      for (const d of due) {
        d.notified = true;
        saveReminder(d);
      }
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

  // PUT /api/reminders/:id — update a reminder (user-scoped)
  const reminderUpdateMatch = url.pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderUpdateMatch && req.method === "PUT") {
    const id = reminderUpdateMatch[1];
    let body;
    try { body = await collectBody(req); } catch { return json(res, { error: "Body too large" }, 413); }
    try {
      const updates = JSON.parse(body);
      const { userId, tenantId } = getUserContext(req);
      const reminders = loadReminders(userId, tenantId);
      const idx = reminders.findIndex(r => r.id === id);
      if (idx < 0) return json(res, { error: "Not found" }, 404);

      if (updates.completed !== undefined) {
        reminders[idx].completed = updates.completed;
        // If completing a recurring reminder, create the next one
        if (updates.completed && reminders[idx].recurring) {
          const next = { ...reminders[idx], id: randomUUID().slice(0, 12), completed: false, notified: false, snoozed: null, createdAt: new Date().toISOString(), user_id: userId, tenant_id: tenantId };
          const due = new Date(next.due);
          if (next.recurring === "daily") due.setDate(due.getDate() + 1);
          else if (next.recurring === "weekly") due.setDate(due.getDate() + 7);
          else if (next.recurring === "monthly") due.setMonth(due.getMonth() + 1);
          next.due = due.toISOString();
          saveReminder(next);
        }
      }
      if (updates.snoozed !== undefined) {
        reminders[idx].snoozed = updates.snoozed;
        reminders[idx].notified = false;
      }
      if (updates.text !== undefined) reminders[idx].text = updates.text;
      if (updates.due !== undefined) reminders[idx].due = updates.due;
      if (updates.contact_email !== undefined) reminders[idx].contact_email = updates.contact_email;

      saveReminder(reminders[idx]);
      return json(res, { ok: true, reminder: reminders[idx] });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // DELETE /api/reminders/:id — delete a reminder (user-scoped)
  if (reminderUpdateMatch && req.method === "DELETE") {
    const id = reminderUpdateMatch[1];
    const { userId, tenantId } = getUserContext(req);
    const result = stmtDeleteReminderScoped.run(id, userId, tenantId);
    if (result.changes === 0) return json(res, { error: "Not found" }, 404);
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

    // Include active reminders summary (briefing is user-scoped)
    const { userId: bUserId, tenantId: bTenantId } = getUserContext(req);
    const reminders = loadReminders(bUserId, bTenantId);
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

  // GET /v1/reminders — list active reminders (user-scoped)
  if (url.pathname === "/v1/reminders" && req.method === "GET") {
    const { userId: v1UserId, tenantId: v1TenantId } = getUserContext(req);
    return json(res, { reminders: loadReminders(v1UserId, v1TenantId) });
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
      // Cap total active reminders at 200 per user
      const { userId: v1cUserId, tenantId: v1cTenantId } = getUserContext(req);
      const existing = loadReminders(v1cUserId, v1cTenantId).filter(r => !r.completed);
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
        user_id: v1cUserId,
        tenant_id: v1cTenantId,
      };
      saveReminder(reminder);
      return json(res, { ok: true, reminder });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // DELETE /v1/reminders/:id — cancel a reminder
  const v1ReminderMatch = url.pathname.match(/^\/v1\/reminders\/([^/]+)$/);
  if (v1ReminderMatch && req.method === "DELETE") {
    const id = v1ReminderMatch[1];
    const { userId: v1dUserId, tenantId: v1dTenantId } = getUserContext(req);
    const result = stmtDeleteReminderScoped.run(id, v1dUserId, v1dTenantId);
    if (result.changes === 0) return json(res, { error: "Not found" }, 404);
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

  // ── Embedded app proxies (iframe embed for remote access) ──────
  // Each prefix strips its path and forwards to the upstream service.
  // X-Frame-Options and CSP are removed so iframe embedding works.
  const EMBEDDED_PROXIES = [
    { prefix: "/openclaw", host: OPENCLAW_HOST, port: OPENCLAW_PORT, proto: "http", label: "OpenClaw Gateway" },
    { prefix: "/shre-dashboard", host: "127.0.0.1", port: 5500, proto: "https", label: "Shre AI Dashboard" },
    { prefix: "/cortexdb-ui", host: "127.0.0.1", port: 3400, proto: "http", label: "CortexDB Dashboard" },
    { prefix: "/storepulse", host: "127.0.0.1", port: 8899, proto: "http", label: "StorePulse" },
    { prefix: "/app-marketplace", host: "127.0.0.1", port: 5458, proto: "http", label: "Marketplace" },
  ];
  for (const ep of EMBEDDED_PROXIES) {
    if (url.pathname.startsWith(ep.prefix + "/") || url.pathname === ep.prefix) {
      const upPath = url.pathname.replace(new RegExp(`^${ep.prefix}`), "") || "/";
      const upUrl = `${ep.proto}://${ep.host}:${ep.port}${upPath}${url.search}`;
      try {
        const upHeaders = { ...req.headers, host: `${ep.host}:${ep.port}` };
        delete upHeaders["accept-encoding"];
        const reqFn = ep.proto === "https" ? httpsRequest : httpRequest;
        const upReq = reqFn(upUrl, { method: req.method, headers: upHeaders, rejectUnauthorized: false }, (upRes) => {
          const rHeaders = { ...upRes.headers };
          delete rHeaders["x-frame-options"];
          delete rHeaders["content-security-policy"];
          res.writeHead(upRes.statusCode ?? 502, rHeaders);
          upRes.pipe(res);
        });
        upReq.on("error", (err) => {
          log.warn(`[${ep.prefix}-proxy] upstream error`, { error: err.message });
          if (!res.headersSent) {
            res.writeHead(502, { "content-type": "text/html" });
            res.end(`<div style="padding:2rem;font-family:monospace;color:#f59e0b;background:#1a1a2e;height:100vh;display:flex;align-items:center;justify-content:center"><div><h2>${ep.label} Offline</h2><p>Port ${ep.port} is not responding.</p></div></div>`);
          }
        });
        req.pipe(upReq);
      } catch (err) {
        log.error(`[${ep.prefix}-proxy] error`, { error: err.message });
        return json(res, { error: `${ep.label} proxy failed` }, 502);
      }
      return;
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

// ── Panel push — notify connected clients when task/agent/service events fire ──
// Debounced: at most one push per type per 5 seconds
const _panelPushTimers = {};
function panelPush(category) {
  if (_panelPushTimers[category]) return; // already scheduled
  _panelPushTimers[category] = setTimeout(() => {
    delete _panelPushTimers[category];
    if (notifyClients.size === 0) return;
    broadcastNotification("panel.refresh", { category });
  }, 2000);
}

// Subscribe to task events → push panel.refresh for tasks tab
for (const evt of ["task.started", "task.assigned", "task.completed", "task.failed", "task.unblocked", "task.updated"]) {
  eventBus.subscribe(evt, () => panelPush("tasks"));
}
// Subscribe to fleet/agent events → push for agents tab
for (const evt of ["fleet.agent_status", "agent.quality_alert"]) {
  eventBus.subscribe(evt, () => panelPush("agents"));
}
// Subscribe to service events → push for services tab
for (const evt of ["service.unhealthy", "service.started"]) {
  eventBus.subscribe(evt, () => panelPush("services"));
}

// ── Voice Quality Monitor — auto-escalates voice hickups to Ellie ──
initVoiceQualityMonitor({ chatDb, log, broadcastNotification, eventBus });

// Check for due reminders every 30s and push via WebSocket (all users)
setInterval(() => {
  try {
    if (notifyClients.size === 0) return;
    const reminders = loadAllReminders();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const due = reminders.filter(r => {
      if (r.completed || r.notified) return false;
      const dueTime = new Date(r.snoozed || r.due);
      return dueTime <= now && dueTime >= fiveMinAgo;
    });
    if (due.length > 0) {
      for (const d of due) {
        d.notified = true;
        saveReminder(d);
      }
      broadcastNotification("reminders_due", { reminders: due });
    }
  } catch { /* best effort */ }
}, 30_000).unref();

// Broadcast status updates periodically (every 60s)
setInterval(() => {
  if (notifyClients.size === 0) return;
  try {
    const reminders = loadAllReminders();
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
// PTY sessions persist across WebSocket disconnects (screen change, tab switch,
// fold/unfold on foldable phones). The PTY stays alive for PTY_IDLE_TIMEOUT_MS
// after the last client disconnects; reconnecting clients get scrollback replay.

const termWss = new WebSocketServer({ noServer: true });

// Active PTY reference — shared so agents can send commands via REST API
let activePty = null;
let activePtyOutput = ""; // Rolling output buffer for exec capture
let execResolvers = []; // Pending exec result callbacks

// Persistent PTY session pool (keyed by session ID)
const PTY_IDLE_TIMEOUT_MS = 5 * 60_000; // Kill orphaned PTY after 5 min with no clients
const SCROLLBACK_MAX = 50_000; // Max chars to replay on reconnect
const ptySessions = new Map(); // sessionId → { proc, scrollback, clients, idleTimer, shellHandle }

function getOrCreatePtySession(sessionId) {
  if (ptySessions.has(sessionId)) {
    const session = ptySessions.get(sessionId);
    // Cancel idle kill timer — client is back
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    return session;
  }

  const cwd = process.env.HOME || "/Users/aibot";

  // Strip Claude Code env vars so `claude` CLI works inside the terminal
  const termEnv = { ...process.env, TERM: "xterm-256color", SHELL: "/bin/zsh" };
  delete termEnv.CLAUDECODE;
  delete termEnv.CLAUDE_CODE_SESSION;
  delete termEnv.CLAUDE_CODE_CONVERSATION_ID;

  // Python PTY with resize support via SIGUSR1 + shared state file
  const resizeFile = `/tmp/shre-pty-resize-${sessionId}.json`;
  const ptyScript = `
import pty, os, sys, select, signal, struct, fcntl, termios, json

cols, rows = 80, 24
resize_file = ${JSON.stringify(resizeFile)}

pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(cwd)})
    os.execv("/bin/zsh", ["/bin/zsh", "-l"])
else:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def handle_resize(sig, frame):
        try:
            with open(resize_file) as f:
                d = json.load(f)
            c, r = d.get("cols", cols), d.get("rows", rows)
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
            os.kill(pid, signal.SIGWINCH)
        except: pass
    signal.signal(signal.SIGUSR1, handle_resize)

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
        try: os.unlink(resize_file)
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
    return null;
  }

  const session = {
    id: sessionId,
    proc,
    scrollback: "",
    clients: new Set(),
    idleTimer: null,
    resizeFile,
    shellHandle: {
      write(data) { try { proc.stdin.write(data); } catch {} },
      kill() { proc.kill(); },
      resize(cols, rows) {
        // Write resize dimensions to file, then signal Python to read them
        try {
          const { writeFileSync } = require("node:fs");
          writeFileSync(resizeFile, JSON.stringify({ cols, rows }));
          proc.kill("SIGUSR1");
        } catch {}
      },
    },
  };

  proc.stdout.on("data", (data) => {
    const str = data.toString();
    // Append to scrollback ring buffer
    session.scrollback += str;
    if (session.scrollback.length > SCROLLBACK_MAX) {
      session.scrollback = session.scrollback.slice(-SCROLLBACK_MAX);
    }
    // Broadcast to all connected clients
    for (const client of session.clients) {
      try { client.send(str); } catch {}
    }
    if (execResolvers.length > 0) activePtyOutput += str;
  });

  proc.stderr.on("data", (data) => {
    const str = data.toString();
    for (const client of session.clients) {
      try { client.send(str); } catch {}
    }
  });

  proc.on("exit", (code) => {
    log.info("[terminal] PTY exited:", code);
    for (const client of session.clients) {
      try { client.send("\r\n[Process exited]\r\n"); } catch {}
      try { client.close(); } catch {}
    }
    if (activePty === session.shellHandle) activePty = null;
    ptySessions.delete(sessionId);
    try { require("node:fs").unlinkSync(resizeFile); } catch {}
  });

  ptySessions.set(sessionId, session);
  activePty = session.shellHandle;
  log.info("[terminal] New PTY session created", { sessionId });
  return session;
}

// Ping/pong keepalive — prevent browser/proxy idle-timeout disconnects
const TERM_PING_INTERVAL = 15_000; // 15s
const termPingTimer = setInterval(() => {
  termWss.clients.forEach((ws) => {
    if (ws._shreAlive === false) {
      log.warn("[terminal] Ping timeout — closing stale connection");
      return ws.terminate();
    }
    ws._shreAlive = false;
    try { ws.ping(); } catch {}
  });
}, TERM_PING_INTERVAL);
termWss.on("close", () => clearInterval(termPingTimer));

termWss.on("connection", (ws, req) => {
  ws._shreAlive = true;
  ws.on("pong", () => { ws._shreAlive = true; });

  // Parse session ID from query string (allows reconnecting to same PTY)
  const url = new URL(req.url, `${SCHEME}://${req.headers.host}`);
  const sessionId = url.searchParams.get("session") || "default";

  const session = getOrCreatePtySession(sessionId);
  if (!session) {
    try { ws.send(`\r\n\x1b[31m[Terminal error: failed to create PTY]\x1b[0m\r\n`); } catch {}
    try { ws.close(); } catch {}
    return;
  }

  // Add this client to the session
  session.clients.add(ws);
  log.info("[terminal] Client connected", { sessionId, clients: session.clients.size });

  // Replay scrollback so reconnecting clients see previous output
  if (session.scrollback.length > 0) {
    try {
      ws.send("\x1b[2J\x1b[H"); // Clear screen first
      ws.send(session.scrollback);
    } catch {}
  }

  ws.on("message", (msg) => {
    const str = msg.toString();
    if (str.startsWith("{")) {
      try {
        const cmd = JSON.parse(str);
        if (cmd.type === "resize" && cmd.cols && cmd.rows) {
          session.shellHandle.resize(cmd.cols, cmd.rows);
          return;
        }
      } catch {}
    }
    // Real PTY — send raw input (including \r for Enter)
    session.shellHandle.write(str);
  });

  ws.on("close", () => {
    session.clients.delete(ws);
    log.info("[terminal] Client disconnected", { sessionId, remaining: session.clients.size });

    // If no clients left, start idle kill timer (don't kill PTY immediately)
    if (session.clients.size === 0) {
      session.idleTimer = setTimeout(() => {
        log.info("[terminal] PTY idle timeout — killing", { sessionId });
        session.proc.kill();
        ptySessions.delete(sessionId);
        if (activePty === session.shellHandle) activePty = null;
      }, PTY_IDLE_TIMEOUT_MS);
    }
  });
});

// Route WebSocket upgrades
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
  } else if (pathname === "/" || pathname.startsWith("/openclaw")) {
    // OpenClaw Control UI WebSocket — proxy to gateway
    log.info("[ws] Proxying OpenClaw WebSocket upgrade", { pathname });
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
    heartbeat.start();
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
    heartbeat.start();
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

// ─── Subscribe to browser approval events ────────────────────────────────────
eventBus.subscribe("approval.requested", async (event) => {
  const data = event?.data || {};
  broadcastNotification("approval.requested", {
    approvalId: data.approvalId || data.id || "",
    action: data.action || "browser action",
    target: data.target || "",
    agentId: data.agentId || "",
    reason: data.reason || "",
    risk: data.risk || "medium",
  });
  log.debug("[approval] Browser approval request forwarded to chat clients", { approvalId: data.approvalId || data.id });
}).catch((err) => {
  log.warn("[approval] Failed to subscribe to approval.requested events", {}, err);
});

eventBus.subscribe("approval.approved", async (event) => {
  const data = event?.data || {};
  broadcastNotification("approval.resolved", {
    approvalId: data.id || "",
    status: "approved",
    action: data.action || "browser action",
    target: data.target || "",
    agentId: data.agentId || "",
    resolvedBy: data.resolvedBy || "user",
  });
  log.debug("[approval] Browser action approved, forwarded to chat clients", { approvalId: data.id });
}).catch((err) => {
  log.warn("[approval] Failed to subscribe to approval.approved events", {}, err);
});

eventBus.subscribe("approval.denied", async (event) => {
  const data = event?.data || {};
  broadcastNotification("approval.resolved", {
    approvalId: data.id || "",
    status: "denied",
    action: data.action || "browser action",
    target: data.target || "",
    agentId: data.agentId || "",
    resolvedBy: data.resolvedBy || "user",
  });
  log.debug("[approval] Browser action denied, forwarded to chat clients", { approvalId: data.id });
}).catch((err) => {
  log.warn("[approval] Failed to subscribe to approval.denied events", {}, err);
});

// ─── Subscribe to project progress events (fleet task lifecycle) ─────────────
const PROGRESS_EVENT_TYPES = ["task.assigned", "task.completed", "task.failed", "project.created", "project.decomposed", "project.completed", "project.quality_gate_failed", "project.pending_approval", "fleet.merge.pr_created", "budget.threshold"];

// Live file diff events from claude_exec sessions
eventBus.subscribe("diff.file_changed", async (event) => {
  const data = event?.data || {};
  const diff = data.diff || {};
  broadcastNotification("file_diff", {
    path: diff.path || "",
    subtype: diff.action || "edit",
    tool: diff.tool || "",
    linesChanged: diff.linesChanged || 0,
    preview: (diff.preview || "").slice(0, 500),
    agentId: data.agentId || "",
    taskId: data.taskId || "",
    projectId: data.projectId || "",
    sessionId: data.sessionId || "",
  });
}).catch((err) => {
  log.warn("[file-diff] Failed to subscribe to diff.file_changed", {}, err);
});
for (const eventType of PROGRESS_EVENT_TYPES) {
  eventBus.subscribe(eventType, async (event) => {
    const data = event?.data || {};

    // Budget events get translated to budget_blocked / budget_warning types
    if (eventType === "budget.threshold") {
      const budgetType = data.action === "block" ? "budget_blocked" : "budget_warning";
      broadcastNotification(budgetType, {
        subtype: "budget_threshold",
        agentId: data.agentId || "",
        action: data.action || "",
        spent: data.spent || 0,
        limit: data.limit || 0,
        reason: data.reason || data.message || "",
      });
      log.debug(`[project-progress] budget.threshold forwarded as ${budgetType}`, { action: data.action });
      return;
    }

    const subtype = eventType.replace(".", "_");
    broadcastNotification("project_progress", {
      subtype,
      taskTitle: data.title || data.taskTitle || data.name || "Task",
      agent: data.agent || data.agentId || "",
      quality: data.quality || data.qualityScore || data.quality_score || null,
      progress: data.progress || "",
      projectId: data.projectId || data.project_id || "",
      reason: data.reason || data.error || "",
    });
    log.debug(`[project-progress] ${eventType} forwarded to chat clients`, { subtype });
  }).catch((err) => {
    log.warn(`[project-progress] Failed to subscribe to ${eventType}`, {}, err);
  });
}

// ── StorePulse: discover active store schemas + resolve display names ────────
async function getStoreSchemas() {
  const { rows } = await cortexPool.query(
    "SELECT schemaname FROM pg_catalog.pg_tables WHERE tablename = 'invoices' GROUP BY schemaname"
  );
  return rows.map((r) => r.schemaname);
}

// Resolve schema → display name from rapidrms.store, disambiguate duplicates
async function resolveStoreNames(schemas) {
  const nameMap = new Map(); // schema → display name
  try {
    const { rows } = await cortexPool.query(
      "SELECT store_name, db_name FROM rapidrms.store WHERE store_name IS NOT NULL AND store_name != ''"
    );
    // Build lookup: normalized db_name → store_name AND normalized store_name → store_name
    const lookup = new Map();
    for (const r of rows) {
      if (r.db_name) lookup.set(r.db_name.toLowerCase().replace(/[^a-z0-9]/g, "_"), r.store_name);
      lookup.set(r.store_name.toLowerCase().replace(/[^a-z0-9]/g, "_"), r.store_name);
    }
    for (const schema of schemas) {
      nameMap.set(schema, lookup.get(schema) || null);
    }
  } catch { /* rapidrms.store not available — fall back to schema-derived names */ }

  // Count occurrences of each resolved name to detect duplicates
  const nameCounts = new Map();
  for (const [schema, name] of nameMap) {
    const display = name || schema.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    nameCounts.set(display, (nameCounts.get(display) || 0) + 1);
  }

  // Build final map — append schema suffix if name appears more than once
  const result = new Map();
  for (const schema of schemas) {
    const raw = nameMap.get(schema);
    let display = raw || schema.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (nameCounts.get(display) > 1) {
      display = `${display} (${schema})`;
    }
    result.set(schema, display);
  }
  return result;
}

// Quote a PG identifier (schema names from pg_catalog are trusted, this is defense-in-depth)
function pgIdent(name) { return '"' + name.replace(/"/g, '""') + '"'; }

// Track last txn count per schema — skip notification if nothing changed
const _lastPerfTxns = new Map();

// ── StorePulse 30-min performance reporter (per-store, async via cortexPool) ─
setInterval(async () => {
  try {
    const schemas = await getStoreSchemas();
    if (!schemas.length) return;
    const storeNames = await resolveStoreNames(schemas);

    for (const schema of schemas) {
      const storeName = storeNames.get(schema);

      // Try today first (Eastern time)
      const todayRes = await cortexPool.query(
        `SELECT COUNT(*) as txns, ROUND(SUM(bill_amount)::numeric, 2) as sales,
                ROUND(AVG(bill_amount)::numeric, 2) as avg_ticket,
                SUM(CASE WHEN is_void THEN 1 ELSE 0 END) as voids,
                SUM(CASE WHEN bill_amount = 0 AND NOT is_void THEN 1 ELSE 0 END) as no_sales
         FROM ${pgIdent(schema)}.invoices
         WHERE invoice_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date
           AND (is_void IS NULL OR is_void = false)`
      );
      let { txns, sales, avg_ticket: avgTicket, voids, no_sales: noSales } = todayRes.rows[0] || {};
      let dateLabel = "Today";

      // No data today — fall back to most recent day
      if (!txns || txns === "0") {
        const fbRes = await cortexPool.query(
          `WITH latest AS (SELECT MAX(invoice_date::date) as d FROM ${pgIdent(schema)}.invoices)
           SELECT COUNT(*) as txns, ROUND(SUM(i.bill_amount)::numeric, 2) as sales,
                  ROUND(AVG(i.bill_amount)::numeric, 2) as avg_ticket,
                  SUM(CASE WHEN i.is_void THEN 1 ELSE 0 END) as voids,
                  SUM(CASE WHEN i.bill_amount = 0 AND NOT i.is_void THEN 1 ELSE 0 END) as no_sales,
                  l.d::text as report_date
           FROM ${pgIdent(schema)}.invoices i, latest l
           WHERE i.invoice_date::date = l.d AND (i.is_void IS NULL OR i.is_void = false)
           GROUP BY l.d`
        );
        const row = fbRes.rows[0] || {};
        txns = row.txns; sales = row.sales; avgTicket = row.avg_ticket; voids = row.voids; noSales = row.no_sales;
        if (row.report_date) {
          const d = new Date(row.report_date + "T00:00:00");
          dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }
      }

      if (!txns || txns === "0") continue;

      // Skip if txn count unchanged since last report (no new activity)
      const txnNum = parseInt(txns);
      if (_lastPerfTxns.get(schema) === txnNum) {
        log.debug("[storepulse] Skipping — no new transactions", { schema, txns });
        continue;
      }
      _lastPerfTxns.set(schema, txnNum);

      const title = `${storeName} Performance Update`;
      const body = `${dateLabel} — Sales: $${sales || "0"} | Txns: ${txns || "0"} | Avg: $${avgTicket || "0"} | Voids: ${voids || "0"} | No-Sales: ${noSales || "0"}`;
      const notifId = `perf-${schema}-${Date.now()}`;

      chatDb.prepare("INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(notifId, "storepulse.performance", title, body, "storepulse", Date.now());
      broadcastNotification("storepulse.performance", { id: notifId, title, body, source: "storepulse" });
      log.info("[storepulse] Performance report sent", { schema, storeName, txns, sales, voids, noSales });
    }
  } catch (err) {
    log.warn("[storepulse] Performance report failed", { error: err.message });
  }
}, 1800000); // 30 minutes

// ── StorePulse instant alert watcher (per-store, async via cortexPool) ───────
let lastAlertCheck = Date.now();
setInterval(async () => {
  try {
    const schemas = await getStoreSchemas();
    if (!schemas.length) { lastAlertCheck = Date.now(); return; }
    const storeNames = await resolveStoreNames(schemas);

    const sinceDate = new Date(lastAlertCheck - 120000).toISOString();

    for (const schema of schemas) {
      const storeName = storeNames.get(schema);
      const { rows } = await cortexPool.query(
        `SELECT invoice_no, invoice_date, cashier_name, bill_amount, is_void
         FROM ${pgIdent(schema)}.invoices
         WHERE (is_void = true OR bill_amount = 0 OR bill_amount < 0)
           AND invoice_date >= $1 AND invoice_date >= CURRENT_DATE
         ORDER BY invoice_date DESC LIMIT 10`,
        [sinceDate]
      );

      for (const row of rows) {
        const alertId = `alert-${schema}-${row.invoice_no}-${row.invoice_date}`;
        const existing = chatDb.prepare("SELECT id FROM notifications WHERE id = ?").get(alertId);
        if (existing) continue;

        const type = row.is_void ? "VOID" : parseFloat(row.bill_amount) === 0 ? "NO-SALE" : "REFUND";
        const severity = type === "VOID" ? "warning" : "info";
        const title = `${type}: ${row.cashier_name || "Unknown"} — Invoice #${row.invoice_no} (${storeName})`;
        const body = `Amount: $${Math.abs(parseFloat(row.bill_amount) || 0).toFixed(2)} at ${new Date(row.invoice_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}`;

        chatDb.prepare("INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(alertId, `storepulse.alert.${type.toLowerCase()}`, title, body, "storepulse", Date.now());
        broadcastNotification(`storepulse.alert.${type.toLowerCase()}`, { id: alertId, title, body, source: "storepulse", severity });
      }
    }

    lastAlertCheck = Date.now();
  } catch (err) {
    log.warn("[storepulse] Alert watcher failed", { error: err.message });
  }
}, 60000); // check every 60 seconds

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
  cortexPool.end().catch(() => {});
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
  // Stream race conditions are non-fatal — log and continue
  if (err.code === "ERR_STREAM_WRITE_AFTER_END" || err.code === "ERR_STREAM_DESTROYED") {
    log.warn("[shre-chat] Non-fatal stream error (suppressed)", { code: err.code });
    return; // do NOT shutdown — these are benign SSE proxy races
  }
  log.error("[shre-chat] Uncaught exception", {}, err);
  // Graceful shutdown — flush sessions before exiting
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  log.error("[shre-chat] Unhandled rejection", { reason: String(reason) });
  // Don't exit on unhandled rejections — log and continue
});

