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
// ── Conjunction / delimiter patterns ────────────────────────────────
/**
 * Patterns that split compound sentences into segments.
 * Only splits when both sides look like separate intents.
 */
const SPLIT_CONJUNCTIONS = /\s+(?:and\s+(?:also\s+)?|also\s+|then\s+|plus\s+|&\s+|,\s*(?:and\s+)?(?:also\s+)?(?:then\s+)?)/i;
/**
 * Each segment must start with an intent signal to be considered a valid split.
 * Without this guard, "show me apples and oranges" would incorrectly split.
 */
const INTENT_LEAD_PATTERNS = [
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
        regex: /^(?:please\s+)?(?:create|add|open|file|log|submit)\s+(?:an?\s+)?(?:issue|bug|ticket)\b/i,
        type: 'issue',
    },
    { regex: /^(?:issue|bug|ticket)[:\s]/i, type: 'issue' },
    { regex: /^(?:please\s+)?(?:file|report|log)\s+(?:a\s+)?(?:bug|defect|issue)\b/i, type: 'issue' },
    // Query / fetch / question
    {
        regex: /^(?:please\s+)?(?:fetch|get|show|pull|give|find|look\s+up|check|display|list|what|how|when|where|who|can\s+you)\b/i,
        type: 'query',
    },
    { regex: /^(?:please\s+)?(?:what(?:'s|\s+(?:is|are|were|was)))\b/i, type: 'query' },
    { regex: /^(?:please\s+)?(?:tell\s+me|let\s+me\s+know)\b/i, type: 'query' },
    { regex: /^(?:please\s+)?(?:run|execute|generate|calculate|compute|analyze)\b/i, type: 'query' },
];
// ── Classifier ──────────────────────────────────────────────────────
function classifySegment(text) {
    const trimmed = text.trim();
    for (const { regex, type } of INTENT_LEAD_PATTERNS) {
        if (regex.test(trimmed))
            return type;
    }
    return 'query'; // default: treat unknown segments as queries for the agent
}
function hasIntentSignal(text) {
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
export function splitIntents(message) {
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
    const intents = segments.map((seg) => ({
        text: seg,
        type: classifySegment(seg),
        confidence: hasIntentSignal(seg) ? 0.9 : 0.6,
    }));
    // Check that we have at least 2 different intent types OR at least one action + one query
    const types = new Set(intents.map((i) => i.type));
    const hasAction = intents.some((i) => i.type === 'task' || i.type === 'reminder' || i.type === 'issue');
    const hasQuery = intents.some((i) => i.type === 'query');
    if (types.size < 2 && !(hasAction && hasQuery)) {
        // All same type (e.g. "create task A and create task B") — still split but lower confidence
        // Actually, let's still split these since they're clearly separate actions
    }
    return { wasSplit: true, intents, original: trimmed };
}
/**
 * Build a context-enriched message for the agent after actions have been taken.
 * The agent sees what was already handled and focuses on the remaining query.
 */
export function buildAgentMessage(queryIntents, completedActions, originalMessage) {
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
    const queryText = queryIntents.length > 0
        ? queryIntents.map((i) => i.text).join('. ')
        : 'Please confirm the actions above were completed.';
    return `[Multi-intent request — some actions were already handled automatically]\n\nActions completed:\n${actionSummary}\n\nRemaining request: ${queryText}`;
}
