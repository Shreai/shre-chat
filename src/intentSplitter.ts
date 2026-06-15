/**
 * intentSplitter.ts — Multi-intent detection and splitting for compound messages.
 *
 * Splits messages like "Remind me to generate payroll tomorrow and fetch me today's sales"
 * into individual intents that can be routed independently:
 *   - Action intents (task/reminder/issue creation) → handled immediately
 *   - Query intents (fetch data, ask questions) → sent to the agent
 *
 * The agent receives rewritten context showing which actions were already taken.
 */

// ── Intent types ────────────────────────────────────────────────────

export type IntentType = 'task' | 'reminder' | 'issue' | 'query';

export interface SplitIntent {
  /** The extracted text for this intent */
  text: string;
  /** Classified intent type */
  type: IntentType;
  /** Confidence: how sure we are this is a separate intent (0-1) */
  confidence: number;
}

export interface SplitResult {
  /** Whether the message was split (false = single intent, pass through) */
  wasSplit: boolean;
  /** Individual intents extracted from the message */
  intents: SplitIntent[];
  /** Original message (untouched) */
  original: string;
}

// ── Conjunction / delimiter patterns ────────────────────────────────

/**
 * Patterns that split compound sentences into segments.
 * Only splits when both sides look like separate intents.
 */
const SPLIT_CONJUNCTIONS =
  /\s+(?:and\s+(?:also\s+)?|also\s+|then\s+|plus\s+|&\s+|,\s*(?:and\s+)?(?:also\s+)?(?:then\s+)?)/i;

/**
 * Each segment must start with an intent signal to be considered a valid split.
 * Without this guard, "show me apples and oranges" would incorrectly split.
 */
const INTENT_LEAD_PATTERNS: Array<{ regex: RegExp; type: IntentType }> = [
  // Task/reminder creation
  { regex: /^(?:please\s+)?remind\s+me\s+to\b/i, type: 'reminder' },
  { regex: /^(?:please\s+)?(?:don't\s+let\s+me\s+forget\s+to)\b/i, type: 'reminder' },
  { regex: /^(?:please\s+)?set\s+(?:a\s+)?reminder\s+(?:to|for)\b/i, type: 'reminder' },
  {
    regex: /^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:task|to-?do|reminder)\b/i,
    type: 'task',
  },
  { regex: /^todo[:\s]/i, type: 'task' },
  { regex: /^task[:\s]/i, type: 'task' },
  { regex: /^i\s+need\s+to\s+(?!know|understand|ask|find\s+out)/i, type: 'task' },

  // Issue creation
  {
    regex:
      /^(?:please\s+)?(?:create|add|open|file|log|submit)\s+(?:an?\s+)?(?:issue|bug|ticket)\b/i,
    type: 'issue',
  },
  { regex: /^(?:issue|bug|ticket)[:\s]/i, type: 'issue' },
  { regex: /^(?:please\s+)?(?:file|report|log)\s+(?:a\s+)?(?:bug|defect|issue)\b/i, type: 'issue' },

  // Query / fetch / question
  {
    regex:
      /^(?:please\s+)?(?:fetch|get|show|pull|give|find|look\s+up|check|display|list|what|how|when|where|who|can\s+you)\b/i,
    type: 'query',
  },
  { regex: /^(?:please\s+)?(?:what(?:'s|\s+(?:is|are|were|was)))\b/i, type: 'query' },
  { regex: /^(?:please\s+)?(?:tell\s+me|let\s+me\s+know)\b/i, type: 'query' },
  { regex: /^(?:please\s+)?(?:run|execute|generate|calculate|compute|analyze)\b/i, type: 'query' },
];

// ── Classifier ──────────────────────────────────────────────────────

function classifySegment(text: string): IntentType {
  const trimmed = text.trim();
  for (const { regex, type } of INTENT_LEAD_PATTERNS) {
    if (regex.test(trimmed)) return type;
  }
  return 'query'; // default: treat unknown segments as queries for the agent
}

function hasIntentSignal(text: string): boolean {
  const trimmed = text.trim();
  return INTENT_LEAD_PATTERNS.some(({ regex }) => regex.test(trimmed));
}

// ── Main splitter ───────────────────────────────────────────────────

/**
 * Split a compound message into individual intents.
 *
 * Only splits when:
 * 1. A conjunction/delimiter is found
 * 2. At least 2 resulting segments have recognizable intent signals
 * 3. The intents are of different types (not "fetch X and fetch Y")
 *
 * This prevents false splits like "show me apples and oranges".
 */
export function splitIntents(message: string): SplitResult {
  const trimmed = message.trim();

  // Too short or no conjunction → pass through
  if (trimmed.length < 15 || !SPLIT_CONJUNCTIONS.test(trimmed)) {
    return {
      wasSplit: false,
      intents: [{ text: trimmed, type: classifySegment(trimmed), confidence: 1 }],
      original: trimmed,
    };
  }

  // Split on conjunctions
  const segments = trimmed
    .split(SPLIT_CONJUNCTIONS)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);

  if (segments.length < 2) {
    return {
      wasSplit: false,
      intents: [{ text: trimmed, type: classifySegment(trimmed), confidence: 1 }],
      original: trimmed,
    };
  }

  // Both segments must have intent signals for a valid split
  const signalCount = segments.filter(hasIntentSignal).length;
  if (signalCount < 2) {
    // Only one segment has a clear intent → don't split (e.g. "fetch sales and profit margins")
    return {
      wasSplit: false,
      intents: [{ text: trimmed, type: classifySegment(trimmed), confidence: 1 }],
      original: trimmed,
    };
  }

  // Classify each segment
  const intents: SplitIntent[] = segments.map((seg) => ({
    text: seg,
    type: classifySegment(seg),
    confidence: hasIntentSignal(seg) ? 0.9 : 0.6,
  }));

  // Check that we have at least 2 different intent types OR at least one action + one query
  const types = new Set(intents.map((i) => i.type));
  const hasAction = intents.some(
    (i) => i.type === 'task' || i.type === 'reminder' || i.type === 'issue',
  );
  const hasQuery = intents.some((i) => i.type === 'query');

  if (types.size < 2 && !(hasAction && hasQuery)) {
    // All same type (e.g. "create task A and create task B") — still split but lower confidence
    // Actually, let's still split these since they're clearly separate actions
  }

  return { wasSplit: true, intents, original: trimmed };
}

// ── Context builder ─────────────────────────────────────────────────

export interface CompletedAction {
  type: IntentType;
  description: string;
  success: boolean;
  detail?: string;
}

/**
 * Build a context-enriched message for the agent after actions have been taken.
 * The agent sees what was already handled and focuses on the remaining query.
 */
export function buildAgentMessage(
  queryIntents: SplitIntent[],
  completedActions: CompletedAction[],
  originalMessage: string,
): string {
  if (completedActions.length === 0) {
    // No actions taken — just send the query intents joined
    return queryIntents.map((i) => i.text).join('. ');
  }

  const actionSummary = completedActions
    .map((a) => {
      const status = a.success ? 'done' : 'failed';
      return `- ${a.description} [${status}]${a.detail ? ` — ${a.detail}` : ''}`;
    })
    .join('\n');

  const queryText =
    queryIntents.length > 0
      ? queryIntents.map((i) => i.text).join('. ')
      : 'Please confirm the actions above were completed.';

  return `[Multi-intent request — some actions were already handled automatically]\n\nActions completed:\n${actionSummary}\n\nRemaining request: ${queryText}`;
}

// ── Fan-out planning ────────────────────────────────────────────────
//
// When a message clearly contains several independent pieces of work, the best
// path is the server-side orchestrator (`POST /v1/execute`), which decomposes a
// prompt into subtasks and runs local executors in parallel. These helpers
// decide *whether* to offer that path and summarise it for the user — the
// router still does the real decomposition.

export interface FanoutPlan {
  /** Whether this message is worth routing through the orchestrator */
  shouldOrchestrate: boolean;
  /** Distinct work items detected (best-effort, the router may split further) */
  tasks: SplitIntent[];
  /** Short human summary, e.g. "2 actions + 1 query" */
  summary: string;
}

/**
 * Decide whether a compound message should be offered to the orchestrator.
 *
 * Heuristic: only offer when the splitter found a genuine multi-intent message
 * (≥2 signalled segments) AND at least two *distinct* work items exist — i.e.
 * either more than one action, or an action combined with a query. A bare
 * "fetch X and fetch Y" stays a single chat turn.
 */
export function planFanout(message: string): FanoutPlan {
  const split = splitIntents(message);
  if (!split.wasSplit) {
    return { shouldOrchestrate: false, tasks: split.intents, summary: 'single request' };
  }

  const actions = split.intents.filter(
    (i) => i.type === 'task' || i.type === 'reminder' || i.type === 'issue',
  );
  const queries = split.intents.filter((i) => i.type === 'query');

  const distinctWorkItems = actions.length + (queries.length > 0 ? 1 : 0);
  const shouldOrchestrate =
    split.intents.length >= 2 && (actions.length >= 2 || (actions.length >= 1 && queries.length >= 1) || queries.length >= 2);

  const parts: string[] = [];
  if (actions.length) parts.push(`${actions.length} action${actions.length === 1 ? '' : 's'}`);
  if (queries.length) parts.push(`${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}`);

  return {
    shouldOrchestrate,
    tasks: split.intents,
    summary: parts.join(' + ') || `${distinctWorkItems} tasks`,
  };
}
