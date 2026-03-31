import React, { useState, useRef, useEffect } from 'react';
import {
  DEMO_CONVERSATIONS,
  DEMO_SUGGESTIONS,
  DEMO_MAX_MESSAGES,
  type DemoConversation,
  type DemoMessage,
} from './demo-data';

// ── Markdown-lite renderer (tables + bold + lists) ───────────────────
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  function flushTable() {
    if (tableRows.length < 2) return;
    const headers = tableRows[0];
    const rows = tableRows.slice(1).filter((r) => !r.every((c) => /^[-|: ]+$/.test(c)));
    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-2">
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontWeight: 600,
                    borderBottom: '1px solid var(--c-border-2)',
                    color: 'var(--c-text-2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatInline(h.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '5px 10px',
                      borderBottom: '1px solid var(--c-border-2)',
                      color: 'var(--c-text-3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1, -1);
      if (cells.length > 0) {
        inTable = true;
        tableRows.push(cells);
        continue;
      }
    }
    if (inTable) {
      flushTable();
      inTable = false;
    }
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} style={{ height: 8 }} />);
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <p
          key={i}
          style={{
            fontWeight: 700,
            color: 'var(--c-text-1)',
            margin: '6px 0 2px',
            fontSize: '12px',
          }}
        >
          {formatInline(line)}
        </p>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <p
          key={i}
          style={{ paddingLeft: 12, color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0' }}
        >
          {formatInline(line)}
        </p>,
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <p
          key={i}
          style={{ paddingLeft: 12, color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0' }}
        >
          {formatInline(line)}
        </p>,
      );
    } else {
      elements.push(
        <p
          key={i}
          style={{ color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0', lineHeight: 1.6 }}
        >
          {formatInline(line)}
        </p>,
      );
    }
  }
  if (inTable) flushTable();
  return elements;
}

function formatInline(text: string) {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: 'var(--c-text-1)', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Demo Message Bubble ──────────────────────────────────────────────
function DemoBubble({
  msg,
  agentName,
  agentEmoji,
}: {
  msg: DemoMessage;
  agentName: string;
  agentEmoji: string;
}) {
  const isUser = msg.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--c-bg-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          {agentEmoji}
        </div>
      )}
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: 12,
          background: isUser ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
          color: isUser ? '#fff' : 'var(--c-text-2)',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {!isUser && (
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--c-text-4)', marginBottom: 4 }}>
            {agentName}
          </div>
        )}
        {isUser ? msg.content : renderMarkdown(msg.content)}
      </div>
    </div>
  );
}

// ── Main Demo View ───────────────────────────────────────────────────
export function DemoView() {
  const [activeConvo, setActiveConvo] = useState<DemoConversation>(DEMO_CONVERSATIONS[0]);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [demoResponses, setDemoResponses] = useState<DemoMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const limitReached = userMessageCount >= DEMO_MAX_MESSAGES;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConvo, demoResponses]);

  function switchConversation(convo: DemoConversation) {
    setActiveConvo(convo);
    setDemoResponses([]);
  }

  function handleDemoSend() {
    if (!inputText.trim() || userMessageCount >= DEMO_MAX_MESSAGES || typing) return;
    const userMsg: DemoMessage = { role: 'user', content: inputText.trim(), timestamp: Date.now() };
    const newCount = userMessageCount + 1;
    setDemoResponses((prev) => [...prev, userMsg]);
    setInputText('');
    setUserMessageCount(newCount);

    // Simulate a response after a short delay
    setTyping(true);
    setTimeout(
      () => {
        const response: DemoMessage = {
          role: 'assistant',
          content: getDemoResponse(userMsg.content),
          timestamp: Date.now(),
        };
        setDemoResponses((prev) => [...prev, response]);
        setTyping(false);
      },
      800 + Math.random() * 1200,
    );
  }

  function handleSuggestionClick(suggestion: string) {
    if (limitReached || typing) return;
    setInputText(suggestion);
    // Find a matching demo conversation
    const match = DEMO_CONVERSATIONS.find(
      (c) => c.messages[0]?.content.toLowerCase() === suggestion.toLowerCase(),
    );
    if (match && match.id !== activeConvo.id) {
      switchConversation(match);
      setUserMessageCount((c) => c + 1);
    } else {
      setInputText(suggestion);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const allMessages = [...activeConvo.messages, ...demoResponses];

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-bg-1, #0a0a0f)',
        color: 'var(--c-text-1, #e8e8f0)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}
    >
      {/* Demo Banner */}
      <div
        style={{
          padding: '10px 16px',
          textAlign: 'center',
          flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1))',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--c-text-2, #a0a0b8)' }}>
          Demo Mode — {DEMO_MAX_MESSAGES - userMessageCount} messages remaining
        </span>
        <a
          href="/"
          style={{
            padding: '5px 14px',
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--c-accent, #6366f1)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Sign up for full access
        </a>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Sidebar — sample conversations */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid var(--c-border-1, #222233)',
            background: 'var(--c-bg-2, #111118)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 12px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--c-text-4, #6a6a82)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Sample Conversations
          </div>
          {DEMO_CONVERSATIONS.map((convo) => (
            <button
              key={convo.id}
              onClick={() => switchConversation(convo)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                border: 'none',
                cursor: 'pointer',
                background: activeConvo.id === convo.id ? 'var(--c-bg-3, #1c1c28)' : 'transparent',
                color: activeConvo.id === convo.id ? 'var(--c-text-1)' : 'var(--c-text-3, #a0a0b8)',
                fontSize: 12,
                textAlign: 'left',
                width: '100%',
                borderLeft:
                  activeConvo.id === convo.id
                    ? '2px solid var(--c-accent, #6366f1)'
                    : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{convo.agentEmoji}</span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {convo.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-text-5, #555570)' }}>
                  {convo.agentName}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Main Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid var(--c-border-1, #222233)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>{activeConvo.agentEmoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>
                {activeConvo.agentName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>AI Retail Assistant</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4ade80',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>Online</span>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
            {allMessages.map((msg, i) => (
              <DemoBubble
                key={`${activeConvo.id}-${i}`}
                msg={msg}
                agentName={activeConvo.agentName}
                agentEmoji={activeConvo.agentEmoji}
              />
            ))}
            {typing && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: 'var(--c-bg-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                  }}
                >
                  {activeConvo.agentEmoji}
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: 'var(--c-bg-2)',
                    fontSize: 12,
                    color: 'var(--c-text-4)',
                  }}
                >
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {!limitReached && demoResponses.length === 0 && (
            <div
              style={{
                padding: '8px 16px',
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                borderTop: '1px solid var(--c-border-2, #1a1a2a)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--c-text-5)',
                  alignSelf: 'center',
                  marginRight: 4,
                }}
              >
                Try asking:
              </span>
              {DEMO_SUGGESTIONS.slice(0, 4).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    border: '1px solid var(--c-border-2, #2a2a3a)',
                    background: 'var(--c-bg-2)',
                    color: 'var(--c-text-3)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = 'var(--c-accent, #6366f1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor =
                      'var(--c-border-2, #2a2a3a)';
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Limit Reached CTA */}
          {limitReached && (
            <div
              style={{
                padding: '20px 16px',
                textAlign: 'center',
                background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.05))',
                borderTop: '1px solid var(--c-border-1)',
              }}
            >
              <p
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-1)', marginBottom: 6 }}
              >
                You've used all {DEMO_MAX_MESSAGES} demo messages
              </p>
              <p style={{ fontSize: 12, color: 'var(--c-text-4)', marginBottom: 12 }}>
                Sign up to get unlimited access to all AI agents, analytics, and tools.
              </p>
              <a
                href="/"
                style={{
                  display: 'inline-block',
                  padding: '10px 28px',
                  borderRadius: 12,
                  background: 'var(--c-accent, #6366f1)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Get Started — Free
              </a>
            </div>
          )}

          {/* Input */}
          {!limitReached && (
            <div
              style={{
                padding: '8px 12px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                borderTop: '1px solid var(--c-border-1, #222233)',
                background: 'var(--c-bg-2, #111118)',
              }}
            >
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleDemoSend();
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid var(--c-border-2, #2a2a3a)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  fontSize: 13,
                  background: 'var(--c-bg-1)',
                  color: 'var(--c-text-1)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleDemoSend}
                disabled={!inputText.trim() || typing}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: 'none',
                  background: inputText.trim() ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-3)',
                  color: '#fff',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Canned demo responses for free-form input ────────────────────────
function getDemoResponse(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes('customer') || lower.includes('top')) {
    return `Here are your **Top 5 customers** this week:

| Customer | Visits | Spend | Avg Ticket |
|----------|--------|-------|------------|
| Regular #1042 | 7 | $312.40 | $44.63 |
| Regular #0887 | 5 | $278.90 | $55.78 |
| Regular #1203 | 6 | $245.20 | $40.87 |
| Regular #0654 | 4 | $198.70 | $49.68 |
| Regular #0921 | 5 | $187.30 | $37.46 |

Loyalty program members spend **42% more** than non-members on average.`;
  }

  if (lower.includes('traffic') || lower.includes('hour') || lower.includes('busy')) {
    return `**Hourly Traffic Pattern** (today):

| Hour | Transactions | Revenue |
|------|-------------|---------|
| 6-8 AM | 28 | $1,120 |
| 8-10 AM | 42 | $2,380 |
| 10 AM-12 PM | 38 | $2,650 |
| **12-2 PM** | **52** | **$3,890** |
| 2-4 PM | 31 | $1,940 |
| 4-6 PM | 45 | $3,210 |
| 6-8 PM | 35 | $2,450 |

**Peak hours:** 12-2 PM (lunch rush) and 4-6 PM (after-work)
**Recommendation:** Staff 2 registers during peak, 1 register off-peak.`;
  }

  if (lower.includes('margin') || lower.includes('profit')) {
    return `**Gross Margin by Category:**

| Category | Revenue | COGS | Margin | Margin % |
|----------|---------|------|--------|----------|
| Tobacco | $15,890 | $13,510 | $2,380 | 15.0% |
| Beverages | $8,420 | $4,630 | $3,790 | **45.0%** |
| Snacks | $7,280 | $4,005 | $3,275 | **45.0%** |
| Grocery | $6,520 | $4,890 | $1,630 | 25.0% |
| Lottery | $3,450 | $3,105 | $345 | 10.0% |

**Best margin:** Beverages and Snacks at 45%
**Highest revenue:** Tobacco at $15,890 (but lowest margin)

Consider expanding your beverage selection — high margin + growing sales.`;
  }

  return `I can help with that! In the full version of Shre AI, I would analyze your real POS data to answer this question.

**What I can do:**
- Real-time sales and inventory analytics
- Predictive demand forecasting
- Employee scheduling optimization
- Vendor performance tracking
- Customer segmentation and loyalty analysis

Sign up to connect your POS system and get AI-powered insights tailored to your business.`;
}
