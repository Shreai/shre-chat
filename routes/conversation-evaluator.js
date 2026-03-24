/**
 * conversation-evaluator.js
 *
 * Post-response conversation quality evaluator. Runs fire-and-forget after
 * every assistant response — never blocks the user. Detects heuristic quality
 * issues (garbled output, think leaks, false refusals, etc.), persists
 * evaluations to SQLite, and feeds critical failures into the training
 * pipeline + remediation task queue.
 *
 * Usage:
 *   import { createConversationEvaluator } from "./routes/conversation-evaluator.js";
 *   const evaluator = createConversationEvaluator({ log, chatDb });
 *   evaluator.evaluate(sessionId, userMessage, assistantResponse, agentId, model).catch(() => {});
 */

import { randomUUID } from "node:crypto";
import { serviceUrl } from "shre-sdk";
import { writeConversation } from "shre-sdk/training";

// ── Scoring constants (exported for tuning) ─────────────────────────────────

export const SEVERITY_WEIGHTS = {
  critical: 0.6,
  high: 0.4,
  medium: 0.2,
  low: 0.1,
};

export const QUALITY_PATTERNS = {
  refusalWithTools: {
    severity: "high",
    patterns: [
      /I don'?t have access/i,
      /I can'?t retrieve/i,
      /not available through (?:the )?provided tools/i,
      /I'?m unable to (?:access|retrieve|fetch)/i,
      /I don'?t have the ability to/i,
    ],
  },
  garbledOutput: {
    severity: "critical",
    patterns: [
      /[\u4e00-\u9fff]{5,}/,           // CJK runs (5+ chars)
      /[\u0400-\u04ff]{10,}/,          // Cyrillic runs (10+ chars)
      /[\u2800-\u28ff]{3,}/,           // Braille patterns
      /[\ufffd]{3,}/,                  // Unicode replacement chars
      /[^\x00-\x7f\u00a0-\u024f]{20,}/, // long non-Latin runs
    ],
  },
  thinkLeak: {
    severity: "critical",
    patterns: [
      /<think>[\s\S]{10,}<\/think>/i,
      /\[internal(?: reasoning| thought)\]/i,
      /\*\*(?:thinking|reasoning|internal)\*\*:/i,
      /<(?:reasoning|scratchpad|internal)>/i,
    ],
  },
  dataPromiseFail: {
    severity: "high",
    patterns: [
      /(?:I'll|Let me|I will) (?:fetch|get|retrieve|pull|look up).*(?:\.|!)\s*$/i,
      /(?:I'll|Let me) (?:check|query) (?:that|this) for you\.?\s*$/i,
    ],
  },
  timezoneFailure: {
    severity: "medium",
    patterns: [
      /\bUTC\b(?!.*(?:local|EST|CST|MST|PST|ET|CT|MT|PT))/i,
    ],
  },
  contextAmnesia: {
    severity: "medium",
    patterns: [
      /I don'?t have (?:access to |any )?previous conversation/i,
      /I don'?t have (?:the )?context (?:of|from) (?:our |your )?(?:previous|earlier|prior)/i,
      /I can'?t see (?:our |any )?(?:previous|earlier|prior) (?:conversation|chat|messages)/i,
    ],
  },
  excessiveApology: {
    severity: "low",
    // Not a regex array — checked via count logic in evaluateResponse()
    patterns: [
      /\b(?:sorry|apologize|my apologies|apologies)\b/gi,
    ],
  },
};

const CORTEX_BRIDGE_PORT = 5450;

// ── Evaluator factory ────────────────────────────────────────────────────────

export function createConversationEvaluator(deps) {
  const { log, chatDb } = deps;

  // Ensure evaluation table exists
  try {
    chatDb.exec(`
      CREATE TABLE IF NOT EXISTS chat_evaluations (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_message TEXT,
        assistant_response TEXT,
        agent_id TEXT,
        model TEXT,
        score REAL,
        issues TEXT,
        created_at INTEGER
      )
    `);
  } catch (err) {
    log.warn("Failed to create chat_evaluations table", {}, err);
  }

  /**
   * Evaluate a completed conversation exchange for quality issues.
   * Fire-and-forget — never throws.
   */
  async function evaluate(sessionId, userMessage, assistantResponse, agentId, model) {
    try {
      const { score, issues } = evaluateResponse(assistantResponse);

      // ── Persist evaluation to SQLite ──
      try {
        chatDb.prepare(
          `INSERT INTO chat_evaluations (id, session_id, user_message, assistant_response, agent_id, model, score, issues, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          randomUUID(),
          sessionId || "unknown",
          (userMessage || "").slice(0, 5000),
          (assistantResponse || "").slice(0, 10000),
          agentId || "unknown",
          model || "unknown",
          score,
          JSON.stringify(issues),
          Date.now()
        );
      } catch (dbErr) {
        log.warn("Failed to persist chat evaluation", { sessionId }, dbErr);
      }

      // ── Write negative training example for critical failures ──
      if (score < 0.5 && issues.length > 0) {
        try {
          writeConversation({
            source: "conversation-evaluator",
            agentId: agentId || "unknown",
            messages: [
              { role: "user", content: userMessage },
              { role: "assistant", content: assistantResponse },
            ],
            quality: Math.round(score * 5) || 1, // convert 0-1 to 1-5, floor to 1
            model: model || "unknown",
            tenantId: "platform",
            meta: { evaluationIssues: issues, autoEvaluated: true },
          });
        } catch (trainErr) {
          log.warn("Failed to write training example from evaluation", { sessionId }, trainErr);
        }
      }

      // ── Create remediation task for severe failures ──
      if (score < 0.3 && issues.length > 0) {
        try {
          const tasksUrl = serviceUrl("shre-tasks");
          await fetch(`${tasksUrl}/v1/intake`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `Chat quality issue: ${issues[0]?.pattern || "unknown"}`,
              description: `Agent ${agentId || "unknown"} produced a ${issues[0]?.severity || "unknown"} quality response.\n\nUser: ${(userMessage || "").slice(0, 200)}\nIssue: ${issues.map(i => i.detail).join("; ")}`,
              priority: issues[0]?.severity === "critical" ? "critical" : "high",
              source: "conversation-evaluator",
              tags: ["chat-quality", "auto-evaluated", agentId || "unknown"],
              skip_decompose: true,
            }),
            signal: AbortSignal.timeout(5000),
          });
        } catch (taskErr) {
          log.warn("Failed to create remediation task", { sessionId, score }, taskErr);
        }
      }

      // ── Emit evaluation event to CortexDB ──
      try {
        await fetch(`http://localhost:${CORTEX_BRIDGE_PORT}/v1/write`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data_type: "chat_evaluation",
            payload: {
              sessionId: sessionId || "unknown",
              agentId: agentId || "unknown",
              score,
              issues,
              model: model || "unknown",
              timestamp: new Date().toISOString(),
            },
            actor: "conversation-evaluator",
          }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (eventErr) {
        log.warn("Failed to emit evaluation event", { sessionId }, eventErr);
      }

      return { score, issues };
    } catch (err) {
      log.warn("Conversation evaluation failed", { sessionId }, err);
      return { score: 1.0, issues: [] };
    }
  }

  return { evaluate };
}

// ── Heuristic scoring engine ─────────────────────────────────────────────────

function evaluateResponse(response) {
  if (!response || typeof response !== "string") {
    return { score: 1.0, issues: [] };
  }

  const issues = [];

  // Check each pattern category (except excessiveApology, handled separately)
  for (const [patternName, config] of Object.entries(QUALITY_PATTERNS)) {
    if (patternName === "excessiveApology") continue;

    for (const regex of config.patterns) {
      const match = response.match(regex);
      if (match) {
        issues.push({
          pattern: patternName,
          severity: config.severity,
          detail: `Matched: "${match[0].slice(0, 80)}"`,
        });
        break; // one match per category is enough
      }
    }
  }

  // Excessive apology: count occurrences
  const apologyRegex = QUALITY_PATTERNS.excessiveApology.patterns[0];
  const apologyMatches = response.match(apologyRegex);
  if (apologyMatches && apologyMatches.length >= 3) {
    issues.push({
      pattern: "excessiveApology",
      severity: QUALITY_PATTERNS.excessiveApology.severity,
      detail: `Found ${apologyMatches.length} apology phrases`,
    });
  }

  // Calculate score: start at 1.0, subtract severity weights per issue
  let score = 1.0;
  for (const issue of issues) {
    score -= SEVERITY_WEIGHTS[issue.severity] || 0;
  }
  score = Math.max(0, Math.min(1, score));

  return { score, issues };
}
