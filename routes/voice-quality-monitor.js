/**
 * Voice Quality Monitor — detects voice conversation hickups and auto-creates
 * tasks for Ellie to investigate and fix. Includes a feedback loop so Ellie
 * gets notified when issues are resolved.
 *
 * Failure types tracked:
 *   - stt_timeout:     Whisper transcription timed out or returned empty
 *   - stt_error:       Whisper returned a non-200 or parse error
 *   - tts_error:       TTS endpoint failed (non-streaming)
 *   - tts_stream_error: Streaming TTS failed
 *   - ai_timeout:      AI chat response timed out
 *   - ai_empty:        AI returned no usable text
 *   - ai_error:        AI proxy returned 5xx
 *   - voice_cmd_error: Voice command processing failed
 *
 * Escalation thresholds (per rolling 10-minute window):
 *   - 3+ failures of ANY type  → create task for Ellie
 *   - 1  critical failure      → immediate escalation (e.g., all TTS tiers fail)
 *
 * Deduplication: Only one Ellie task per failure type per 30-minute window.
 */

import { randomUUID } from "node:crypto";
import { serviceUrl } from "shre-sdk";

// ── Failure Event Ring Buffer ──────────────────────────────────

const WINDOW_MS = 10 * 60 * 1000;       // 10-minute rolling window
const ESCALATION_THRESHOLD = 3;          // failures in window → escalate
const DEDUPE_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between tasks per type

/** @type {{ type: string, ts: number, detail?: string, sessionId?: string }[]} */
const failureRing = [];

/** @type {Map<string, number>} failure_type → last escalation timestamp */
const lastEscalatedAt = new Map();

/** @type {import("better-sqlite3").Database | null} */
let db = null;

/** @type {ReturnType<typeof import("shre-sdk").createLogger> | null} */
let log = null;

/** @type {((type: string, data: object) => void) | null} */
let broadcastFn = null;

/** @type {ReturnType<typeof import("shre-sdk").createEventBus> | null} */
let eventBus = null;

// ── Schema ─────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS voice_quality_events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    detail      TEXT,
    session_id  TEXT,
    escalated   INTEGER DEFAULT 0,
    task_id     TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vqe_type ON voice_quality_events(type);
  CREATE INDEX IF NOT EXISTS idx_vqe_created ON voice_quality_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_vqe_escalated ON voice_quality_events(escalated);
`;

// ── Init ───────────────────────────────────────────────────────

/**
 * @param {{ chatDb: import("better-sqlite3").Database, log: any, broadcastNotification?: Function, eventBus?: any }} opts
 */
export function initVoiceQualityMonitor(opts) {
  db = opts.chatDb;
  log = opts.log;
  broadcastFn = opts.broadcastNotification || null;
  eventBus = opts.eventBus || null;

  // Create table
  try { db.exec(SCHEMA); } catch {}

  // Prepared statements
  stmtInsert = db.prepare(
    `INSERT INTO voice_quality_events (id, type, detail, session_id, escalated, task_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmtRecentByType = db.prepare(
    `SELECT COUNT(*) as cnt FROM voice_quality_events
     WHERE type = ? AND created_at > ? AND escalated = 0`
  );
  stmtMarkEscalated = db.prepare(
    `UPDATE voice_quality_events SET escalated = 1, task_id = ?
     WHERE type = ? AND created_at > ? AND escalated = 0`
  );
  stmtStats = db.prepare(
    `SELECT type, COUNT(*) as cnt, MAX(created_at) as last_at
     FROM voice_quality_events
     WHERE created_at > ?
     GROUP BY type ORDER BY cnt DESC`
  );

  // Listen for task completion events (feedback loop)
  if (eventBus) {
    try {
      eventBus.subscribe("task.completed", handleTaskCompleted);
      log.info("[voice-quality] Subscribed to task.completed events for feedback loop");
    } catch {
      log.warn("[voice-quality] Could not subscribe to task.completed — feedback loop disabled");
    }
  }

  log.info("[voice-quality] Voice quality monitor initialized");
}

let stmtInsert, stmtRecentByType, stmtMarkEscalated, stmtStats;

// ── Record a failure ───────────────────────────────────────────

/**
 * Record a voice quality failure event. Automatically escalates to Ellie
 * when threshold is reached.
 *
 * @param {"stt_timeout"|"stt_error"|"tts_error"|"tts_stream_error"|"ai_timeout"|"ai_empty"|"ai_error"|"voice_cmd_error"} type
 * @param {{ detail?: string, sessionId?: string, critical?: boolean }} opts
 */
export function recordVoiceFailure(type, opts = {}) {
  if (!db || !log) return;

  const now = Date.now();
  const id = `vqe-${now}-${randomUUID().slice(0, 8)}`;

  // Persist to DB
  try {
    stmtInsert.run(id, type, opts.detail || null, opts.sessionId || null, 0, null, now);
  } catch (err) {
    log.warn("[voice-quality] Failed to persist event", { error: err.message });
  }

  // Add to ring buffer (trim old entries)
  failureRing.push({ type, ts: now, detail: opts.detail, sessionId: opts.sessionId });
  while (failureRing.length > 0 && failureRing[0].ts < now - WINDOW_MS) {
    failureRing.shift();
  }

  log.warn("[voice-quality] Failure recorded", { type, detail: (opts.detail || "").slice(0, 100), sessionId: opts.sessionId });

  // Check escalation threshold (ring is already trimmed — use directly)
  const typeCount = failureRing.filter(f => f.type === type).length;
  const totalCount = failureRing.length;

  const shouldEscalate = opts.critical || typeCount >= ESCALATION_THRESHOLD || totalCount >= ESCALATION_THRESHOLD * 2;

  if (shouldEscalate) {
    // Dedupe check — prevent concurrent + time-windowed duplicates
    const lastEsc = lastEscalatedAt.get(type) || 0;
    if (Math.abs(now - lastEsc) < DEDUPE_COOLDOWN_MS) {
      log.info("[voice-quality] Skipping escalation (cooldown)", { type, minutesRemaining: ((DEDUPE_COOLDOWN_MS - Math.abs(now - lastEsc)) / 60000).toFixed(1) });
      return;
    }
    // Set cooldown BEFORE async call to prevent concurrent duplicates
    lastEscalatedAt.set(type, now);
    escalateToEllie(type, [...failureRing], opts).catch((err) => {
      log.error("[voice-quality] Escalation failed", { error: err.message, type });
      // Reset cooldown on failure so next failure can retry
      lastEscalatedAt.delete(type);
    });
  }
}

// ── Escalate to Ellie ──────────────────────────────────────────

const FAILURE_DESCRIPTIONS = {
  stt_timeout: "Speech-to-text (Whisper) timed out — user's voice input was lost",
  stt_error: "Speech-to-text returned an error — transcription pipeline is broken",
  tts_error: "Text-to-speech failed — user can't hear responses",
  tts_stream_error: "Streaming TTS failed — audio playback is broken",
  ai_timeout: "AI response timed out — voice assistant can't answer",
  ai_empty: "AI returned empty response — user gets silence",
  ai_error: "AI proxy returned server error — voice chat is broken",
  voice_cmd_error: "Voice command processing failed — task/action commands don't work",
};

async function escalateToEllie(failureType, recentFailures, opts) {
  const now = Date.now();

  const typeFailures = recentFailures.filter(f => f.type === failureType);
  const description = FAILURE_DESCRIPTIONS[failureType] || `Voice failure: ${failureType}`;

  // Build diagnostic context
  const diagnostics = [
    `## Voice Quality Issue: ${description}`,
    "",
    `**Failure type:** \`${failureType}\``,
    `**Occurrences in last 10 min:** ${typeFailures.length}`,
    `**Total voice failures in window:** ${recentFailures.length}`,
    opts.critical ? "**Severity:** CRITICAL (immediate escalation)" : "",
    "",
    "### Recent failures:",
    ...typeFailures.slice(-5).map((f, i) => {
      const ago = ((now - f.ts) / 1000).toFixed(0);
      return `${i + 1}. ${ago}s ago — ${f.detail || "no detail"}${f.sessionId ? ` (session: ${f.sessionId})` : ""}`;
    }),
    "",
    "### Diagnostic steps:",
    ...getDiagnosticSteps(failureType),
  ].filter(Boolean).join("\n");

  log.info("[voice-quality] Escalating to Ellie", {
    failureType,
    failureCount: typeFailures.length,
    critical: !!opts.critical,
  });

  const tasksUrl = serviceUrl("shre-tasks");

  // Create parent task — must succeed for sub-tasks to be useful
  const parentRes = await fetch(`${tasksUrl}/v1/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `[Voice Quality] ${description.slice(0, 80)}`,
      description: `<!--voice-quality:${failureType}:${now}-->\n${diagnostics}`,
      agent: "ellie",
      priority: opts.critical ? "critical" : "high",
      status: "created",
      source: "voice-quality-monitor",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!parentRes.ok) {
    const errText = await parentRes.text().catch(() => "");
    throw new Error(`Parent task creation failed: HTTP ${parentRes.status} — ${errText.slice(0, 200)}`);
  }

  const parent = await parentRes.json();
  const parentId = parent.id;
  if (!parentId) {
    throw new Error("Parent task created but no ID returned");
  }

  // Create sub-tasks — best-effort, log failures but don't abort
  const subTasks = [
    {
      title: `Investigate and fix: ${failureType}`,
      description: [
        `Investigate the root cause of ${failureType} failures in voice conversations.`,
        "",
        ...getDiagnosticSteps(failureType),
        "",
        "After fixing, verify the fix by testing the voice flow end-to-end.",
      ].join("\n"),
      priority: opts.critical ? "critical" : "high",
    },
    {
      title: `Verify fix: test voice ${failureType.replace(/_/g, " ")} flow`,
      description: [
        `After the fix is applied, verify that ${failureType} no longer occurs:`,
        "",
        `1. Open shre-chat voice assistant`,
        `2. Perform a voice conversation that exercises the ${getComponentName(failureType)} path`,
        `3. Confirm no errors in /tmp/shre-chat.log`,
        `4. Check voice_quality_events table for new failures of type "${failureType}"`,
        `5. Mark this task done only when verified`,
      ].join("\n"),
      priority: "medium",
    },
  ];

  for (const sub of subTasks) {
    try {
      await fetch(`${tasksUrl}/v1/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sub,
          agent: "ellie",
          status: "created",
          source: "voice-quality-monitor",
          parent_id: parentId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      log.warn("[voice-quality] Sub-task creation failed", { title: sub.title, error: err.message });
    }
  }

  // Mark DB events as escalated
  try {
    stmtMarkEscalated.run(parentId, failureType, now - WINDOW_MS);
  } catch {}

  // Publish event
  if (eventBus) {
    eventBus.publish("voice.quality.escalation", "warning", {
      failureType,
      failureCount: typeFailures.length,
      parentTaskId: parentId,
      critical: !!opts.critical,
      source: "voice-quality-monitor",
    }).catch(() => {});
  }

  // Notify user via shre-chat notifications
  if (broadcastFn && db) {
    const notifId = `vq-${now}-${randomUUID().slice(0, 6)}`;
    try {
      db.prepare(
        "INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
      ).run(notifId, "voice.quality.issue", `Voice issue detected: ${failureType.replace(/_/g, " ")}`,
        `Ellie has been assigned to investigate and fix this. Task: ${parentId}`,
        "voice-quality-monitor", now);
      broadcastFn("voice.quality.issue", {
        id: notifId,
        title: `Voice issue detected: ${failureType.replace(/_/g, " ")}`,
        body: `Ellie is investigating. ${typeFailures.length} failures in the last 10 minutes.`,
        source: "voice-quality-monitor",
        severity: opts.critical ? "error" : "warning",
      });
    } catch {}
  }

  log.info("[voice-quality] Ellie tasks created", { parentId, failureType });
}

// ── Feedback Loop: task.completed listener ─────────────────────

/**
 * When Ellie completes a voice-quality task, notify the user and log resolution.
 */
async function handleTaskCompleted(event) {
  try {
    const data = event.data || {};
    const taskId = data.task_id;
    if (!taskId) return;

    // Fetch the task
    const tasksUrl = serviceUrl("shre-tasks");
    const res = await fetch(`${tasksUrl}/v1/tasks/${taskId}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return;

    const task = await res.json();

    // Only handle voice-quality-monitor tasks (parent only)
    if (task.source !== "voice-quality-monitor") return;
    if (task.parent_id) return; // skip sub-tasks

    const title = (task.title || "").replace(/^\[Voice Quality\]\s*/, "");
    const outcome = task.result_summary || task.outcome || "Issue resolved by Ellie.";

    // Extract failure type from marker
    const metaMatch = (task.description || "").match(/<!--voice-quality:([^:]+):/);
    const failureType = metaMatch?.[1] || "unknown";

    log.info("[voice-quality] Ellie completed voice quality fix", {
      taskId, failureType, title: title.slice(0, 80),
    });

    // Clear the escalation cooldown so new failures are caught immediately
    lastEscalatedAt.delete(failureType);

    // Notify user that it's fixed
    if (broadcastFn) {
      const notifId = `vq-fix-${Date.now()}-${randomUUID().slice(0, 6)}`;
      try {
        db.prepare(
          "INSERT OR IGNORE INTO notifications (id, type, title, body, source, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
        ).run(notifId, "voice.quality.resolved", `Voice fix applied: ${title.slice(0, 60)}`,
          outcome.slice(0, 500), "ellie", Date.now());
        broadcastFn("voice.quality.resolved", {
          id: notifId,
          title: `Voice fix applied: ${title.slice(0, 60)}`,
          body: outcome.slice(0, 500),
          source: "ellie",
          severity: "info",
          taskId,
          failureType,
        });
      } catch {}
    }

    // Publish resolution event
    if (eventBus) {
      eventBus.publish("voice.quality.resolved", "info", {
        failureType,
        taskId,
        outcome: outcome.slice(0, 200),
        source: "voice-quality-monitor",
      }).catch(() => {});
    }
  } catch (err) {
    if (log) log.warn("[voice-quality] Feedback loop handler error", { error: err.message });
  }
}

// ── Diagnostic Steps by Failure Type ───────────────────────────

function getDiagnosticSteps(type) {
  switch (type) {
    case "stt_timeout":
    case "stt_error":
      return [
        "1. Check shre-router Whisper endpoint: `curl -sk https://127.0.0.1:5497/v1/audio/transcriptions -F file=@test.wav`",
        "2. Verify OpenAI Whisper API key is valid and not rate-limited",
        "3. Check /tmp/shre-router.log for Whisper-related errors",
        "4. Test audio recording in browser console — is MediaRecorder producing valid blobs?",
        "5. Check if audio format (webm/wav) is supported by Whisper model",
      ];
    case "tts_error":
    case "tts_stream_error":
      return [
        "1. Check shre-router TTS endpoint: `curl -sk https://127.0.0.1:5497/v1/audio/speech -X POST -H 'Content-Type: application/json' -d '{\"input\":\"test\",\"voice\":\"nova\"}'`",
        "2. Verify TTS provider API key (OpenAI or ElevenLabs)",
        "3. Check /tmp/shre-router.log for TTS errors",
        "4. Test streaming TTS: `curl -sk https://127.0.0.1:5497/v1/audio/speech/stream -X POST -H 'Content-Type: application/json' -d '{\"input\":\"test\",\"voice\":\"nova\"}'`",
        "5. If both cloud TTS fail, browser SpeechSynthesis should be last resort — check browser support",
      ];
    case "ai_timeout":
    case "ai_empty":
    case "ai_error":
      return [
        "1. Check shre-router health: `curl -sk https://127.0.0.1:5497/health`",
        "2. Check model connectivity: `curl -sk https://127.0.0.1:5497/v1/models`",
        "3. Review /tmp/shre-router.log for routing/proxy errors",
        "4. Check if Ollama (Shadow PC) is reachable: `curl http://100.86.194.36:11434/api/tags`",
        "5. Check Anthropic/OpenAI API key health via /v1/keys/stats",
        "6. If empty response: check system prompt — voice mode may need different instructions",
      ];
    case "voice_cmd_error":
      return [
        "1. Check shre-tasks health: `curl http://127.0.0.1:5460/health`",
        "2. Review voice intent classification in routes/voice.js",
        "3. Check voice_intents table for corrupted learned patterns",
        "4. Test task creation: `curl http://127.0.0.1:5460/v1/intake -X POST -H 'Content-Type: application/json' -d '{\"title\":\"test\",\"source\":\"test\"}'`",
      ];
    default:
      return [
        "1. Check /tmp/shre-chat.log for errors",
        "2. Check shre-router health",
        "3. Review voice_quality_events table for pattern",
      ];
  }
}

function getComponentName(type) {
  if (type.startsWith("stt")) return "speech-to-text (Whisper)";
  if (type.startsWith("tts")) return "text-to-speech";
  if (type.startsWith("ai")) return "AI chat response";
  if (type.startsWith("voice_cmd")) return "voice command";
  return "voice";
}

// ── Stats API ──────────────────────────────────────────────────

/**
 * Get voice quality stats for the given time window.
 * @param {number} windowMs
 */
export function getVoiceQualityStats(windowMs = 3600000) {
  if (!db || !stmtStats) return { failures: [], total: 0, window: windowMs };
  const since = Date.now() - windowMs;
  const rows = stmtStats.all(since);
  const total = rows.reduce((s, r) => s + r.cnt, 0);
  return { failures: rows, total, window: windowMs, ringSize: failureRing.length };
}
