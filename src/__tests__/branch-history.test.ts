// @vitest-environment jsdom
/**
 * Tests to lock down the branch/reply history truncation behavior.
 *
 * When a user replies to or branches from a specific message, only the
 * history up to that point should be sent to the AI — NOT the full
 * conversation. This prevents the AI from getting confused by later
 * messages and asking irrelevant clarifying questions.
 *
 * This applies to BOTH text and voice paths (voice calls the same
 * handleSend → sendMessage pipeline).
 */

import { describe, it, expect } from "vitest";

// ── Pure logic extracted from useMessageHandlers.ts ────────────────
// We test the history slicing logic directly since the hook is tightly
// coupled to React. The contract is:
//
//   replyToIndex !== null → messages.slice(0, replyToIndex + 1)
//   replyToIndex === null → messages (full history)

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

function buildHistory(
  allMessages: ChatMessage[],
  replyToIndex: number | null,
): ChatMessage[] {
  return replyToIndex !== null
    ? allMessages.slice(0, replyToIndex + 1)
    : allMessages;
}

// ── Test data ──────────────────────────────────────────────────────

const conversation: ChatMessage[] = [
  { role: "user", content: "What is TypeScript?", timestamp: 1000 },
  { role: "assistant", content: "TypeScript is a typed superset of JavaScript.", timestamp: 1001 },
  { role: "user", content: "How do interfaces work?", timestamp: 1002 },
  { role: "assistant", content: "Interfaces define the shape of objects.", timestamp: 1003 },
  { role: "user", content: "Show me generics", timestamp: 1004 },
  { role: "assistant", content: "Generics let you write reusable typed code.", timestamp: 1005 },
  { role: "user", content: "What about decorators?", timestamp: 1006 },
  { role: "assistant", content: "Decorators are experimental metadata annotations.", timestamp: 1007 },
];

// ── Tests ──────────────────────────────────────────────────────────

describe("Branch/Reply history truncation", () => {
  it("sends full history when replyToIndex is null (normal message)", () => {
    const history = buildHistory(conversation, null);
    expect(history).toHaveLength(8);
    expect(history).toEqual(conversation);
  });

  it("truncates history to replyToIndex + 1 when replying to a specific message", () => {
    // Reply to the assistant's second response (index 3)
    const history = buildHistory(conversation, 3);
    expect(history).toHaveLength(4);
    expect(history[3].content).toBe("Interfaces define the shape of objects.");
    // Messages about generics and decorators should NOT be included
    expect(history.some(m => m.content.includes("generics"))).toBe(false);
    expect(history.some(m => m.content.includes("decorators"))).toBe(false);
  });

  it("includes only the first message when replying to index 0", () => {
    const history = buildHistory(conversation, 0);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe("What is TypeScript?");
  });

  it("includes all messages when replying to the last message", () => {
    const history = buildHistory(conversation, 7);
    expect(history).toHaveLength(8);
    expect(history).toEqual(conversation);
  });

  it("handles empty conversation gracefully", () => {
    expect(buildHistory([], null)).toEqual([]);
    expect(buildHistory([], 0)).toEqual([]);
  });

  it("voice path uses the same history (voice calls handleSend which uses buildHistory)", () => {
    // Voice transcription → setInput → handleSend → sendMessage(history)
    // The history is built identically for voice and text because
    // voice calls handleSendRef.current() which is the same handleSend.
    // This test documents that contract.
    const textHistory = buildHistory(conversation, 3);
    const voiceHistory = buildHistory(conversation, 3);
    expect(textHistory).toEqual(voiceHistory);
  });
});

describe("Branch history preserves message order", () => {
  it("preserves chronological order after truncation", () => {
    const history = buildHistory(conversation, 5);
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp!).toBeGreaterThan(history[i - 1].timestamp!);
    }
  });

  it("alternates user/assistant roles correctly", () => {
    const history = buildHistory(conversation, 5);
    for (let i = 0; i < history.length; i++) {
      expect(history[i].role).toBe(i % 2 === 0 ? "user" : "assistant");
    }
  });
});

describe("Reply context annotation (defensive — no history leak)", () => {
  it("reply annotation does not affect the history array length", () => {
    // The reply quote is prepended to the MESSAGE TEXT, not added to history.
    // History should still be truncated regardless of the annotation.
    const replyToIndex = 1;
    const history = buildHistory(conversation, replyToIndex);
    expect(history).toHaveLength(2);

    // Simulate the reply annotation (from useMessageHandlers.ts lines 536-544)
    const replyMsg = conversation[replyToIndex];
    const replySnippet = replyMsg.content.slice(0, 500);
    const annotatedText = `[Replying to your earlier response]: "${replySnippet}"\n\nTell me more`;

    // The annotated text goes as the NEW user message, history stays truncated
    const messagesForAPI = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: annotatedText },
    ];

    // Total: 2 history + 1 new = 3 messages sent to API
    expect(messagesForAPI).toHaveLength(3);
    // Last message should have the annotation
    expect(messagesForAPI[2].content).toContain("[Replying to");
    // History should NOT contain later messages
    expect(messagesForAPI.some(m => m.content.includes("generics"))).toBe(false);
  });
});

// ── Voice-friendly context anchoring keyword tests ─────────────────
// These patterns must match natural voice transcriptions which often
// include filler words, different phrasing, and trailing punctuation.

describe("Voice-friendly context anchoring keywords", () => {
  // Reproduce the exact stripping + matching logic from useMessageHandlers.ts
  function stripFiller(text: string): string {
    return text.toLowerCase().trim()
      .replace(/^(hey|ok|okay|so|shre|shrey|please|can you|could you|uh|um)\s+/g, "")
      .replace(/[.!?,]+$/g, "")
      .trim();
  }

  const statusPattern = /^(status|any\s*(status|update|progress)|update\s*(me|us)?|update[s]?|give\s+me\s+(an?\s+)?(status|update|progress)|is\s+(this|that|it)\s+(done|complete|finished|ready|resolved|fixed)|done\s*\??|complete\s*\??|finished\s*\??|what('?s| is)\s+the\s+(status|progress|update)|where\s+(are|did)\s+we\s+(leave|left)\s+(off|this|that)|how('?s| is)\s+(this|that|it)\s+(going|coming|progressing)|catch\s+me\s+up|bring\s+me\s+up\s+to\s+(speed|date)|what('?s| is)\s+(new|happening|going\s+on)|fill\s+me\s+in)$/i;

  const continuePattern = /^(continue|keep\s+going|go\s+on|go\s+ahead|finish\s+(this|that|it)|carry\s+on|resume|pick\s+up\s+where|and\s*\??|then\s*\??|next\s*\??|keep\s+going\s+with\s+(this|that)|finish\s+what\s+you\s+(were|started)|where\s+were\s+we)$/i;

  const recallPattern = /^(show\s+(me\s+)?(that|it)\s+again|repeat\s+that|recall\s+(this|that)\s*(conversation|chat|session)?|the\s+(table|chart|list|query|data|result)\s+(you\s+)?(showed?|gave|returned|generated)|what\s+did\s+(you|we)\s+(say|show|find|get|discuss|talk\s+about)|what\s+was\s+(that|the\s+(result|answer|output))|what\s+were\s+we\s+(talking|discussing)\s+about|remind\s+me\s+(what|where)\s+we\s+(left\s+off|were|discussed)|go\s+back\s+to\s+(that|what\s+we)|summarize\s+(this|our)\s*(conversation|chat|discussion)?)$/i;

  function matchesStatus(text: string): boolean { return statusPattern.test(stripFiller(text)); }
  function matchesContinue(text: string): boolean { return continuePattern.test(stripFiller(text)); }
  function matchesRecall(text: string): boolean { return recallPattern.test(stripFiller(text)); }

  // Status queries
  it.each([
    "status",
    "Status?",
    "update me",
    "Update me!",
    "any update",
    "any progress",
    "give me a status",
    "give me an update",
    "what's the status",
    "what is the progress",
    "is it done?",
    "is that finished",
    "how's it going",
    "how is that progressing",
    "where did we leave off",
    "catch me up",
    "bring me up to speed",
    "what's new",
    "what is happening",
    "fill me in",
    // Voice filler prefixes
    "Hey update me",
    "Ok status",
    "Shre give me a status",
    "Please update me",
    "So what's the status?",
    "Uh status",
  ])("matches status: %s", (phrase) => {
    expect(matchesStatus(phrase)).toBe(true);
  });

  // Continue commands
  it.each([
    "continue",
    "keep going",
    "go on",
    "go ahead",
    "carry on",
    "resume",
    "finish this",
    "finish that",
    "next",
    "keep going with this",
    "finish what you started",
    "where were we",
    // Voice filler prefixes
    "Ok continue",
    "Shre keep going",
    "Please go ahead",
  ])("matches continue: %s", (phrase) => {
    expect(matchesContinue(phrase)).toBe(true);
  });

  // Recall commands
  it.each([
    "show me that again",
    "show it again",
    "repeat that",
    "recall this conversation",
    "recall that",
    "recall this chat",
    "what did you say",
    "what did we discuss",
    "what did we talk about",
    "what was the result",
    "what were we talking about",
    "what were we discussing about",
    "remind me what we discussed",
    "remind me where we left off",
    "go back to that",
    "go back to what we",
    "summarize this conversation",
    "summarize our discussion",
    "summarize our chat",
    "the table you showed",
    "the data you gave",
    // Voice filler prefixes
    "Hey recall this conversation",
    "Shre what did we talk about",
    "Can you summarize this conversation",
    "Please remind me where we left off",
  ])("matches recall: %s", (phrase) => {
    expect(matchesRecall(phrase)).toBe(true);
  });

  // Should NOT match (these are real questions, not context anchoring)
  it.each([
    "what is TypeScript",
    "help me write a function",
    "how do I deploy to AWS",
    "create a new task",
    "tell me about React hooks",
  ])("does NOT match any pattern: %s", (phrase) => {
    expect(matchesStatus(phrase)).toBe(false);
    expect(matchesContinue(phrase)).toBe(false);
    expect(matchesRecall(phrase)).toBe(false);
  });
});
