/**
 * Memory Command Detector — Phase 1B
 *
 * Detects "remember that...", "forget that...", "what do you remember?"
 * patterns in user messages. Modeled on taskDetector.ts.
 */

// ── Pattern Detection ────────────────────────────────────────────────

export type MemoryAction = 'capture' | 'forget' | 'list';

export interface DetectedMemory {
  action: MemoryAction;
  /** The extracted fact/query text (null for list action) */
  text: string | null;
  /** The original user message */
  originalMessage: string;
  /** The pattern that matched */
  pattern: string;
}

/** Patterns for "remember that..." → capture */
const CAPTURE_PATTERNS: Array<{ regex: RegExp; extractor: (m: RegExpMatchArray) => string }> = [
  {
    regex: /^(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex: /^(?:please\s+)?(?:keep\s+in\s+mind|note)\s+(?:that\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex: /^(?:please\s+)?(?:don'?t\s+forget)\s+(?:that\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex: /^(?:please\s+)?(?:save|store)\s+(?:this|the\s+fact\s+that|that)\s*[:\s]+(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex: /^(?:fyi|for\s+(?:your|future)\s+reference)[,:\s]+(.+)/i,
    extractor: (m) => m[1],
  },
];

/** Patterns for "forget that..." → forget */
const FORGET_PATTERNS: Array<{ regex: RegExp; extractor: (m: RegExpMatchArray) => string }> = [
  {
    regex: /^(?:please\s+)?forget\s+(?:that\s+|about\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex:
      /^(?:please\s+)?(?:delete|remove|erase)\s+(?:the\s+(?:fact|memory)\s+(?:that|about)\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
  {
    regex: /^(?:please\s+)?(?:stop\s+remembering)\s+(?:that\s+)?(.+)/i,
    extractor: (m) => m[1],
  },
];

/** Patterns for "what do you remember?" → list */
const LIST_PATTERNS: RegExp[] = [
  /^(?:what\s+do\s+you\s+(?:remember|know)\s+(?:about\s+me|about\s+this)?)\s*\??$/i,
  /^(?:show|list|display)\s+(?:my\s+)?(?:memories|facts|what\s+you\s+(?:know|remember))/i,
  /^(?:what(?:'s| is)\s+in\s+(?:your\s+)?memory)\s*\??$/i,
  /^(?:what\s+have\s+you\s+(?:remembered|stored|saved))\s*\??$/i,
  /^(?:memory\s+(?:list|dump|check))\s*$/i,
];

/**
 * Detect if a user message contains a memory command intent.
 * Returns the detected memory action, or null if no pattern matched.
 */
export function detectMemoryIntent(message: string): DetectedMemory | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 5) return null;

  // Check list patterns first (most specific)
  for (const regex of LIST_PATTERNS) {
    if (regex.test(trimmed)) {
      return {
        action: 'list',
        text: null,
        originalMessage: trimmed,
        pattern: regex.source,
      };
    }
  }

  // Check forget patterns (before capture — "forget" takes priority over "remember")
  for (const pattern of FORGET_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const rawText = pattern.extractor(match).trim();
      if (!rawText || rawText.length < 3) continue;
      const cleanText = rawText.replace(/[.!?]+$/, '').trim();
      if (!cleanText) continue;
      return {
        action: 'forget',
        text: cleanText,
        originalMessage: trimmed,
        pattern: pattern.regex.source,
      };
    }
  }

  // Check capture patterns
  for (const pattern of CAPTURE_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const rawText = pattern.extractor(match).trim();
      if (!rawText || rawText.length < 3) continue;
      const cleanText = rawText.replace(/[.!?]+$/, '').trim();
      if (!cleanText) continue;
      return {
        action: 'capture',
        text: cleanText,
        originalMessage: trimmed,
        pattern: pattern.regex.source,
      };
    }
  }

  return null;
}

// ── Memory API Calls ─────────────────────────────────────────────────

export interface MemoryResult {
  ok: boolean;
  message?: string;
  facts?: Array<{ fact: string; category: string; confidence: number; createdAt: string }>;
  error?: string;
}

let lastMemoryActionAt = 0;
const MEMORY_COOLDOWN_MS = 1000;

export async function captureMemory(fact: string): Promise<MemoryResult> {
  const now = Date.now();
  if (now - lastMemoryActionAt < MEMORY_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait before another memory action' };
  }

  try {
    const res = await fetch('/api/memory/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    lastMemoryActionAt = Date.now();
    return { ok: true, message: `Remembered: ${fact}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save memory' };
  }
}

export async function forgetMemory(query: string): Promise<MemoryResult> {
  const now = Date.now();
  if (now - lastMemoryActionAt < MEMORY_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait before another memory action' };
  }

  try {
    const res = await fetch('/api/memory/forget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    lastMemoryActionAt = Date.now();
    return { ok: true, message: `Forgot: ${query} (${data.deleted || 0} facts removed)` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to forget' };
  }
}

export async function listMemories(): Promise<MemoryResult> {
  try {
    const res = await fetch('/api/memory/list', {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      ok: true,
      facts: data.facts || [],
      message: data.facts?.length
        ? `I remember ${data.facts.length} facts about our conversations.`
        : "I don't have any stored memories yet.",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to list memories' };
  }
}
