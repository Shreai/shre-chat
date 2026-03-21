/**
 * Task & Issue Creation Detector
 *
 * Detects "remind me to..." and similar patterns for task creation,
 * and "create an issue", "file a bug", etc. for issue creation.
 * Tasks proxy to shre-tasks, issues proxy to MIB007.
 */

// ── Pattern Detection ────────────────────────────────────────────────

/** Patterns that indicate task creation intent (must be at start of sentence or message) */
const TASK_PATTERNS: Array<{ regex: RegExp; extractor: (match: RegExpMatchArray) => string }> = [
  // "remind me to ..."
  {
    regex: /^(?:please\s+)?remind\s+me\s+to\s+(.+)/i,
    extractor: (m) => m[1],
  },
  // "don't let me forget to ..."
  {
    regex: /^(?:please\s+)?(?:don'?t\s+let\s+me\s+forget\s+to)\s+(.+)/i,
    extractor: (m) => m[1],
  },
  // "create a task: ..." / "create a task called ..."
  {
    regex: /^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:task|to-?do|reminder)\s*(?::|called|named|titled|for)\s+(.+)/i,
    extractor: (m) => m[1],
  },
  // "create X as a task" / "add X as a to-do" (natural speech order)
  {
    regex: /^(?:please\s+)?(?:create|add|make)\s+(.+?)\s+as\s+(?:a\s+)?(?:task|to-?do|reminder)\s*$/i,
    extractor: (m) => m[1],
  },
  // "set a reminder to/for ..."
  {
    regex: /^(?:please\s+)?set\s+(?:a\s+)?reminder\s+(?:to|for)\s+(.+)/i,
    extractor: (m) => m[1],
  },
  // "todo: ..."
  {
    regex: /^todo[:\s]+(.+)/i,
    extractor: (m) => m[1],
  },
  // "task: ..."
  {
    regex: /^task[:\s]+(.+)/i,
    extractor: (m) => m[1],
  },
  // "I need to ..." (only when followed by actionable text, not a question)
  {
    regex: /^i\s+need\s+to\s+(?!know|understand|ask|find out)(.+)/i,
    extractor: (m) => m[1],
  },
];

/** Negation patterns that should NOT trigger task creation */
const NEGATION_PATTERNS = [
  /^(?:don'?t|do not)\s+remind/i,
  /^(?:stop|cancel|remove)\s+(?:the\s+)?remind/i,
  /^(?:no|nah|nope),?\s+(?:don'?t|do not)\s+/i,
];

export interface DetectedTask {
  title: string;
  /** The original user message */
  originalMessage: string;
  /** The pattern that matched */
  pattern: string;
}

/**
 * Detect if a user message contains a task creation intent.
 * Returns the extracted task info, or null if no task pattern detected.
 */
export function detectTaskIntent(message: string): DetectedTask | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 5) return null;

  // Check negation patterns first — "don't remind me to..." should not create a task
  for (const negation of NEGATION_PATTERNS) {
    if (negation.test(trimmed)) return null;
  }

  // Try each task pattern
  for (const pattern of TASK_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const rawTitle = pattern.extractor(match).trim();
      // Must have at least one word of actual content
      if (!rawTitle || rawTitle.split(/\s+/).length < 1) continue;
      // Remove trailing punctuation
      const cleanTitle = rawTitle.replace(/[.!?]+$/, "").trim();
      if (!cleanTitle) continue;
      // Truncate to 500 chars (matching shre-tasks schema limit)
      const title = cleanTitle.length > 500 ? cleanTitle.slice(0, 497) + "..." : cleanTitle;
      return {
        title,
        originalMessage: trimmed,
        pattern: pattern.regex.source,
      };
    }
  }

  return null;
}

// ── Issue Detection ─────────────────────────────────────────────────

/** Patterns that indicate issue creation intent */
const ISSUE_PATTERNS: Array<{ regex: RegExp; extractor: (match: RegExpMatchArray) => { title: string; priority?: string } }> = [
  // "create an issue: ..." / "create an issue called ..." / "create issue for ..."
  {
    regex: /^(?:please\s+)?(?:create|add|open|file|log|submit)\s+(?:an?\s+)?(?:issue|bug|ticket|defect|feature request|enhancement)\s*(?::|called|named|titled|for|about)\s+(.+)/i,
    extractor: (m) => ({ title: m[1] }),
  },
  // "issue: ..." / "bug: ..." / "ticket: ..."
  {
    regex: /^(?:issue|bug|ticket|defect)[:\s]+(.+)/i,
    extractor: (m) => ({ title: m[1] }),
  },
  // "file a bug for ..." / "report a bug: ..."
  {
    regex: /^(?:please\s+)?(?:file|report|log|submit)\s+(?:a\s+)?(?:bug|defect|issue)\s+(?:for|about|regarding|on)\s+(.+)/i,
    extractor: (m) => ({ title: m[1] }),
  },
  // "there's a bug with ..." / "there is an issue with ..."
  {
    regex: /^there(?:'s|\s+is)\s+(?:a|an)\s+(?:bug|issue|problem|defect)\s+(?:with|in|on|regarding)\s+(.+)/i,
    extractor: (m) => ({ title: m[1] }),
  },
  // "feature request: ..." / "enhancement: ..."
  {
    regex: /^(?:feature\s+request|enhancement|improvement)[:\s]+(.+)/i,
    extractor: (m) => ({ title: m[1] }),
  },
  // "we need to fix ..."  (urgent phrasing)
  {
    regex: /^(?:we\s+)?need\s+to\s+fix\s+(.+)/i,
    extractor: (m) => ({ title: `Fix ${m[1]}`, priority: "high" }),
  },
];

export interface DetectedIssue {
  title: string;
  priority?: string;
  originalMessage: string;
  pattern: string;
}

/**
 * Detect if a user message contains an issue creation intent.
 */
export function detectIssueIntent(message: string): DetectedIssue | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 5) return null;

  for (const pattern of ISSUE_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const { title: rawTitle, priority } = pattern.extractor(match);
      const cleanTitle = rawTitle.replace(/[.!?]+$/, "").trim();
      if (!cleanTitle) continue;
      const title = cleanTitle.length > 500 ? cleanTitle.slice(0, 497) + "..." : cleanTitle;
      return { title, priority, originalMessage: trimmed, pattern: pattern.regex.source };
    }
  }

  return null;
}

// ── Issue Creation ──────────────────────────────────────────────────

export interface IssueCreateResult {
  ok: boolean;
  issueId?: string;
  identifier?: string;
  title?: string;
  error?: string;
}

let lastIssueCreatedAt = 0;
const ISSUE_COOLDOWN_MS = 2000;

/**
 * Create an issue via the serve.js proxy endpoint to MIB007.
 */
export async function createIssueFromChat(
  title: string,
  description?: string,
  priority?: string,
): Promise<IssueCreateResult> {
  const now = Date.now();
  if (now - lastIssueCreatedAt < ISSUE_COOLDOWN_MS) {
    return { ok: false, error: "Please wait before creating another issue" };
  }

  try {
    const res = await fetch("/api/issues/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority: priority || "medium",
        source: "shre-chat",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    lastIssueCreatedAt = Date.now();
    return {
      ok: true,
      issueId: data.issue?.id,
      identifier: data.issue?.identifier,
      title,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create issue",
    };
  }
}

// ── Task Creation ────────────────────────────────────────────────────

/** Cooldown to prevent duplicate task creation (2 seconds) */
let lastTaskCreatedAt = 0;
const TASK_COOLDOWN_MS = 2000;

export interface TaskCreateResult {
  ok: boolean;
  taskId?: string;
  title?: string;
  error?: string;
}

/**
 * Create a task via the serve.js proxy endpoint.
 * Includes cooldown debounce to prevent duplicates.
 */
export async function createTaskFromChat(
  title: string,
  description?: string,
): Promise<TaskCreateResult> {
  // Cooldown check
  const now = Date.now();
  if (now - lastTaskCreatedAt < TASK_COOLDOWN_MS) {
    return { ok: false, error: "Please wait before creating another task" };
  }

  try {
    const res = await fetch("/api/tasks/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority: "medium",
        source: "shre-chat",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    lastTaskCreatedAt = Date.now();
    return {
      ok: true,
      taskId: data.task?.id,
      title,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create task",
    };
  }
}
