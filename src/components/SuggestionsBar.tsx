import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────

interface SuggestionsBarProps {
  lastAssistantMessage: string;
  streaming: boolean;
  onSelect: (suggestion: string) => void;
  suggestions?: string[];
  messageCount?: number;
}

// ── Contextual suggestion patterns ──────────────────────────────────

interface SuggestionPattern {
  /** Regex to match against the assistant's last message */
  match: RegExp;
  /** Suggestions to show when the pattern matches */
  suggestions: string[];
  /** Priority — higher = checked first */
  priority: number;
}

const CONTEXTUAL_PATTERNS: SuggestionPattern[] = [
  // Sales / revenue data mentioned
  {
    match: /(?:total\s+)?(?:sales|revenue|profit|income|earnings|gross|margin)[\s:]+\$?[\d,]+/i,
    suggestions: ["Compare with last week", "Create a report task", "Show breakdown by category", "Export this"],
    priority: 10,
  },
  // Data / numbers / tables present
  {
    match: /(?:\$[\d,]+(?:\.\d{2})?|\d{1,3}(?:,\d{3})+|^\|.+\|$)/m,
    suggestions: ["Export this", "Show chart", "Compare with last period", "Tell me more"],
    priority: 8,
  },
  // Task mentioned (created, assigned, completed)
  {
    match: /(?:task|ticket|issue|bug|to-?do)\s+(?:is\s+)?(?:created?|assigned?|complete|done|finished|completed|resolved|closed|open|pending)/i,
    suggestions: ["Mark as done", "Assign to agent", "Show all tasks", "Create follow-up"],
    priority: 9,
  },
  // Error / failure patterns
  {
    match: /(?:error|failed|failure|issue|problem|bug|exception|crash|timeout|500|404|503)/i,
    suggestions: ["Retry", "File a bug in MIB007", "Show error details", "How do I fix this?"],
    priority: 9,
  },
  // Direct question asked by assistant
  {
    match: /(?:do you want|would you like|should I|shall I|can I|want me to)\s*\??\s*$/im,
    suggestions: ["Yes", "No", "Tell me more"],
    priority: 11,
  },
  // Yes/no question pattern
  {
    match: /\?(?:\s*$)/m,
    suggestions: ["Yes", "No", "Tell me more", "Not sure"],
    priority: 5,
  },
  // Deployment / release patterns
  {
    match: /(?:deploy|release|shipped|published|live|production)/i,
    suggestions: ["Check deployment status", "Run health check", "Show release notes"],
    priority: 7,
  },
  // Status report patterns
  {
    match: /(?:status|report|summary|overview|briefing|dashboard)/i,
    suggestions: ["Expand on this", "Show detailed metrics", "What needs attention?"],
    priority: 6,
  },
  // List / enumeration patterns
  {
    match: /(?:here (?:are|is)|the following|these are|list of|\n\s*[-*]\s)/i,
    suggestions: ["Tell me more about the first one", "Which is most important?", "Summarize the key points"],
    priority: 5,
  },
  // Greeting / introduction patterns
  {
    match: /(?:hello|hi there|good morning|good afternoon|how can I help|what can I do)/i,
    suggestions: ["Show my tasks for today", "Any pending reminders?", "What's the system status?"],
    priority: 3,
  },
  // Code / technical patterns
  {
    match: /(?:```|function\s|class\s|module|component|API\s|endpoint)/i,
    suggestions: ["Explain this code", "Can you improve it?", "Write tests for this"],
    priority: 6,
  },
  // Task / reminder creation confirmation
  {
    match: /(?:created|added|scheduled|reminder set|task created|saved)/i,
    suggestions: ["Show all my reminders", "Set another reminder", "What's next on my list?"],
    priority: 7,
  },
  // Comparison results
  {
    match: /(?:vs\.?|compared to|versus|comparison|difference)/i,
    suggestions: ["Show previous period", "Why the change?", "Export comparison"],
    priority: 8,
  },
];

// Sort by priority descending
const SORTED_PATTERNS = [...CONTEXTUAL_PATTERNS].sort((a, b) => b.priority - a.priority);

// Default suggestions when no pattern matches
const DEFAULT_SUGGESTIONS = [
  "Tell me more",
  "What else can you help with?",
  "Summarize this conversation",
];

const STARTER_SUGGESTIONS = [
  "What can you help me with?",
  "Show my tasks for today",
  "Write an email",
  "Summarize a document",
  "Debug my code",
  "Create a report",
];

const FADE_TIMEOUT_MS = 30_000; // 30 seconds auto-fade
const MAX_VISIBLE = 4;

/**
 * Generate contextual suggestions based on the last assistant message.
 * Tries pattern matching first (by priority), falls back to defaults.
 * Can match multiple patterns and combine unique suggestions.
 */
function generateLocalSuggestions(message: string): string[] {
  if (!message || message.length < 10) return [];

  const truncated = message.slice(0, 800);
  const results: string[] = [];
  const seen = new Set<string>();

  for (const pattern of SORTED_PATTERNS) {
    if (pattern.match.test(truncated)) {
      for (const s of pattern.suggestions) {
        if (!seen.has(s) && results.length < MAX_VISIBLE) {
          seen.add(s);
          results.push(s);
        }
      }
      // Stop once we have enough
      if (results.length >= MAX_VISIBLE) break;
    }
  }

  if (results.length === 0) return DEFAULT_SUGGESTIONS.slice(0, MAX_VISIBLE);
  return results;
}

// ── Component ────────────────────────────────────────────────────────

export function SuggestionsBar({ lastAssistantMessage, streaming, onSelect, suggestions: externalSuggestions, messageCount = 0 }: SuggestionsBarProps) {
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const prevMessageRef = useRef("");
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEmptyChat = messageCount === 0;

  useEffect(() => {
    if (streaming) { setVisible(false); return; }

    if (isEmptyChat) {
      setLocalSuggestions(STARTER_SUGGESTIONS);
      setVisible(true);
      return;
    }

    if (!lastAssistantMessage) { setVisible(false); return; }
    if (lastAssistantMessage === prevMessageRef.current) return;
    prevMessageRef.current = lastAssistantMessage;

    if (externalSuggestions && externalSuggestions.length > 0) {
      setLocalSuggestions(externalSuggestions);
    } else {
      const generated = generateLocalSuggestions(lastAssistantMessage);
      setLocalSuggestions(generated);
    }

    const timer = setTimeout(() => setVisible(true), 300);

    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => setVisible(false), FADE_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [lastAssistantMessage, streaming, externalSuggestions, isEmptyChat]);

  useEffect(() => {
    if (streaming) setVisible(false);
  }, [streaming]);

  const displaySuggestions = isEmptyChat
    ? STARTER_SUGGESTIONS
    : (externalSuggestions && externalSuggestions.length > 0 ? externalSuggestions : localSuggestions);

  if (displaySuggestions.length === 0 || streaming || !visible) return null;

  return (
    <div
      className="suggestions-bar scrollbar-none"
      style={{
        display: "flex",
        overflowX: "auto",
        gap: 8,
        padding: "6px 16px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        maskImage: "linear-gradient(to right, transparent 0, black 16px, black calc(100% - 24px), transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0, black 16px, black calc(100% - 24px), transparent 100%)",
      }}
    >
      {displaySuggestions.slice(0, MAX_VISIBLE).map((suggestion, i) => (
        <button
          key={`${suggestion}-${i}`}
          className="suggestion-chip"
          style={{
            background: "var(--c-bg-input)",
            color: "var(--c-text-2)",
            border: "1px solid var(--c-border-2)",
            borderRadius: 9999,
            padding: "7px 14px",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            cursor: "pointer",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--c-accent-soft)";
            e.currentTarget.style.borderColor = "var(--c-accent)";
            e.currentTarget.style.color = "var(--c-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--c-bg-input)";
            e.currentTarget.style.borderColor = "var(--c-border-2)";
            e.currentTarget.style.color = "var(--c-text-2)";
          }}
          onClick={() => {
            setVisible(false);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            onSelect(suggestion);
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
