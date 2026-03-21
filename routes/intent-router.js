// @ts-check
// Voice Intent Router — learned pattern matching + intent classification
// Checks learned DB first (sub-1ms), falls back to AI classification when no match.

import { randomUUID } from "node:crypto";

/** Filler words to strip during normalization */
const FILLER_WORDS = new Set([
  "please", "can", "you", "could", "would", "just", "um", "uh", "like",
  "actually", "basically", "so", "well", "hey", "hi", "ok", "okay",
  "the", "a", "an", "to", "for", "me", "my", "i", "is", "are", "was",
  "do", "does", "did", "will", "shall", "should", "it", "its", "that",
  "this", "of", "in", "on", "at", "by", "with", "from",
]);

/**
 * Normalize text for matching — lowercase, strip filler, collapse spaces.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER_WORDS.has(w))
    .join(" ")
    .trim();
}

/**
 * Extract keywords from normalized text for fuzzy LIKE matching.
 * @param {string} normalized
 * @returns {string[]}
 */
function extractKeywords(normalized) {
  return normalized.split(/\s+/).filter((w) => w.length >= 3).slice(0, 5);
}

/** Intent → target app mapping */
const INTENT_TARGET_MAP = /** @type {const} */ ({
  data_query: "shre-router",
  task_create: "shre-tasks",
  task_list: "shre-tasks",
  project: "mib007",
  issue: "mib007",
  agent_switch: "internal",
  digest: "shre-tasks",
  status: "shre-tasks",
  chat: "shre-router",
  clarify: "internal",
  none: "shre-router",
});

/**
 * Get the target service for a given intent.
 * @param {string} intent
 * @returns {string}
 */
export function getTargetForIntent(intent) {
  return INTENT_TARGET_MAP[intent] || "shre-router";
}

/**
 * Classify intent from learned patterns DB.
 * Returns the matching intent row (with hit_count incremented) or null.
 *
 * @param {string} text - raw user text
 * @param {import('better-sqlite3').Database} chatDb
 * @returns {{ id: string, pattern: string, normalized: string, intent: string, target_app: string, params: any, confidence: number, hit_count: number } | null}
 */
export function classifyIntent(text, chatDb) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  // 1. Exact normalized match
  const exact = chatDb.prepare(
    `SELECT * FROM voice_intents WHERE normalized = ? ORDER BY hit_count DESC, confidence DESC LIMIT 1`
  ).get(normalized);

  if (exact && exact.confidence >= 0.7 && exact.hit_count >= 2) {
    // Increment hit_count + update last_used
    chatDb.prepare(
      `UPDATE voice_intents SET hit_count = hit_count + 1, last_used = ? WHERE id = ?`
    ).run(Date.now(), exact.id);
    return {
      ...exact,
      hit_count: exact.hit_count + 1,
      params: exact.params ? tryParseJSON(exact.params) : null,
    };
  }

  // 2. Fuzzy keyword match — requires at least 2 keywords matching
  const keywords = extractKeywords(normalized);
  if (keywords.length >= 2) {
    // Build LIKE conditions for top keywords
    const likeConditions = keywords.map(() => `normalized LIKE ?`).join(" AND ");
    const likeParams = keywords.map((k) => `%${k}%`);

    const fuzzy = chatDb.prepare(
      `SELECT * FROM voice_intents WHERE ${likeConditions} AND confidence >= 0.7 AND hit_count >= 2 ORDER BY hit_count DESC, confidence DESC LIMIT 1`
    ).get(...likeParams);

    if (fuzzy) {
      chatDb.prepare(
        `UPDATE voice_intents SET hit_count = hit_count + 1, last_used = ? WHERE id = ?`
      ).run(Date.now(), fuzzy.id);
      return {
        ...fuzzy,
        hit_count: fuzzy.hit_count + 1,
        params: fuzzy.params ? tryParseJSON(fuzzy.params) : null,
      };
    }
  }

  return null;
}

/**
 * Learn a resolved intent for future instant matching.
 *
 * @param {string} text - raw user text
 * @param {string} intent - classified intent type
 * @param {string} targetApp - target service
 * @param {object|null} params - extra params (title, etc.)
 * @param {import('better-sqlite3').Database} chatDb
 */
export function learnIntent(text, intent, targetApp, params, chatDb) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 3) return;

  const now = Date.now();
  const paramsStr = params ? JSON.stringify(params) : null;

  // INSERT or update hit_count on conflict (same normalized pattern + intent)
  const existing = chatDb.prepare(
    `SELECT id, hit_count FROM voice_intents WHERE normalized = ? AND intent = ? LIMIT 1`
  ).get(normalized, intent);

  if (existing) {
    chatDb.prepare(
      `UPDATE voice_intents SET hit_count = hit_count + 1, last_used = ?, params = COALESCE(?, params), confidence = MIN(1.0, confidence + 0.05) WHERE id = ?`
    ).run(now, paramsStr, existing.id);
  } else {
    chatDb.prepare(
      `INSERT INTO voice_intents (id, pattern, normalized, intent, target_app, params, confidence, hit_count, last_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0.8, 1, ?, ?)`
    ).run(randomUUID(), text.trim().slice(0, 500), normalized, intent, targetApp, paramsStr, now, now);
  }
}

/**
 * Register intent router — called from serve.js, provides chatDb to voice routes.
 * @param {{ log: import('shre-sdk').Logger, chatDb: import('better-sqlite3').Database }} deps
 */
export function registerIntentRouter({ log, chatDb }) {
  log.info("Voice intent router initialized");
  return { classifyIntent, learnIntent, getTargetForIntent, chatDb };
}

/**
 * Get top voice shortcuts (most-used commands).
 * @param {import('better-sqlite3').Database} chatDb
 * @returns {{ id: string, pattern: string, intent: string, hit_count: number, lastUsed: number }[]}
 */
export function getTopShortcuts(chatDb) {
  try {
    const rows = chatDb.prepare(
      `SELECT id, pattern, intent, hit_count, last_used FROM voice_intents
       WHERE hit_count >= 2 AND confidence >= 0.7
       ORDER BY hit_count DESC, last_used DESC LIMIT 6`
    ).all();
    return rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      intent: r.intent,
      hit_count: r.hit_count,
      lastUsed: r.last_used,
    }));
  } catch {
    return [];
  }
}

/** @param {string} s */
function tryParseJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}
