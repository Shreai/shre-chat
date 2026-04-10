import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { DEMO_CONVERSATIONS, DEMO_SUGGESTIONS, DEMO_MAX_MESSAGES, } from './demo-data';
// ── Markdown-lite renderer (tables + bold + lists) ───────────────────
function renderMarkdown(text) {
    const lines = text.split('\n');
    const elements = [];
    let tableRows = [];
    let inTable = false;
    function flushTable() {
        if (tableRows.length < 2)
            return;
        const headers = tableRows[0];
        const rows = tableRows.slice(1).filter((r) => !r.every((c) => /^[-|: ]+$/.test(c)));
        elements.push(_jsx("div", { className: "overflow-x-auto my-2", children: _jsxs("table", { style: { borderCollapse: 'collapse', width: '100%', fontSize: '12px' }, children: [_jsx("thead", { children: _jsx("tr", { children: headers.map((h, i) => (_jsx("th", { style: {
                                    padding: '6px 10px',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    borderBottom: '1px solid var(--c-border-2)',
                                    color: 'var(--c-text-2)',
                                    whiteSpace: 'nowrap',
                                }, children: formatInline(h.trim()) }, i))) }) }), _jsx("tbody", { children: rows.map((row, ri) => (_jsx("tr", { children: row.map((cell, ci) => (_jsx("td", { style: {
                                    padding: '5px 10px',
                                    borderBottom: '1px solid var(--c-border-2)',
                                    color: 'var(--c-text-3)',
                                    whiteSpace: 'nowrap',
                                }, children: formatInline(cell.trim()) }, ci))) }, ri))) })] }) }, `table-${elements.length}`));
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
            elements.push(_jsx("div", { style: { height: 8 } }, `br-${i}`));
        }
        else if (line.startsWith('**') && line.endsWith('**')) {
            elements.push(_jsx("p", { style: {
                    fontWeight: 700,
                    color: 'var(--c-text-1)',
                    margin: '6px 0 2px',
                    fontSize: '12px',
                }, children: formatInline(line) }, i));
        }
        else if (/^\d+\.\s/.test(line)) {
            elements.push(_jsx("p", { style: { paddingLeft: 12, color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0' }, children: formatInline(line) }, i));
        }
        else if (line.startsWith('- ')) {
            elements.push(_jsx("p", { style: { paddingLeft: 12, color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0' }, children: formatInline(line) }, i));
        }
        else {
            elements.push(_jsx("p", { style: { color: 'var(--c-text-3)', fontSize: '12px', margin: '2px 0', lineHeight: 1.6 }, children: formatInline(line) }, i));
        }
    }
    if (inTable)
        flushTable();
    return elements;
}
function formatInline(text) {
    // Bold
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (_jsx("strong", { style: { color: 'var(--c-text-1)', fontWeight: 600 }, children: part.slice(2, -2) }, i));
        }
        return _jsx("span", { children: part }, i);
    });
}
// ── Demo Message Bubble ──────────────────────────────────────────────
function DemoBubble({ msg, agentName, agentEmoji, }) {
    const isUser = msg.role === 'user';
    return (_jsxs("div", { style: {
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            justifyContent: isUser ? 'flex-end' : 'flex-start',
        }, children: [!isUser && (_jsx("div", { style: {
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: 'var(--c-bg-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                }, children: agentEmoji })), _jsxs("div", { style: {
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: isUser ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                    color: isUser ? '#fff' : 'var(--c-text-2)',
                    fontSize: 12,
                    lineHeight: 1.5,
                }, children: [!isUser && (_jsx("div", { style: { fontSize: 10, fontWeight: 600, color: 'var(--c-text-4)', marginBottom: 4 }, children: agentName })), isUser ? msg.content : renderMarkdown(msg.content)] })] }));
}
// ── Main Demo View ───────────────────────────────────────────────────
export function DemoView() {
    const [activeConvo, setActiveConvo] = useState(DEMO_CONVERSATIONS[0]);
    const [userMessageCount, setUserMessageCount] = useState(0);
    const [inputText, setInputText] = useState('');
    const [demoResponses, setDemoResponses] = useState([]);
    const [typing, setTyping] = useState(false);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const limitReached = userMessageCount >= DEMO_MAX_MESSAGES;
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeConvo, demoResponses]);
    function switchConversation(convo) {
        setActiveConvo(convo);
        setDemoResponses([]);
    }
    function handleDemoSend() {
        if (!inputText.trim() || userMessageCount >= DEMO_MAX_MESSAGES || typing)
            return;
        const userMsg = { role: 'user', content: inputText.trim(), timestamp: Date.now() };
        const newCount = userMessageCount + 1;
        setDemoResponses((prev) => [...prev, userMsg]);
        setInputText('');
        setUserMessageCount(newCount);
        // Simulate a response after a short delay
        setTyping(true);
        setTimeout(() => {
            const response = {
                role: 'assistant',
                content: getDemoResponse(userMsg.content),
                timestamp: Date.now(),
            };
            setDemoResponses((prev) => [...prev, response]);
            setTyping(false);
        }, 800 + Math.random() * 1200);
    }
    function handleSuggestionClick(suggestion) {
        if (limitReached || typing)
            return;
        setInputText(suggestion);
        // Find a matching demo conversation
        const match = DEMO_CONVERSATIONS.find((c) => c.messages[0]?.content.toLowerCase() === suggestion.toLowerCase());
        if (match && match.id !== activeConvo.id) {
            switchConversation(match);
            setUserMessageCount((c) => c + 1);
        }
        else {
            setInputText(suggestion);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }
    const allMessages = [...activeConvo.messages, ...demoResponses];
    return (_jsxs("div", { style: {
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--c-bg-1, #0a0a0f)',
            color: 'var(--c-text-1, #e8e8f0)',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        }, children: [_jsxs("div", { style: {
                    padding: '10px 16px',
                    textAlign: 'center',
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1))',
                    borderBottom: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                }, children: [_jsxs("span", { style: { fontSize: 13, color: 'var(--c-text-2, #a0a0b8)' }, children: ["Demo Mode \u2014 ", DEMO_MAX_MESSAGES - userMessageCount, " messages remaining"] }), _jsx("a", { href: "/", style: {
                            padding: '5px 14px',
                            borderRadius: 16,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--c-accent, #6366f1)',
                            color: '#fff',
                            textDecoration: 'none',
                        }, children: "Sign up for full access" })] }), _jsxs("div", { style: { flex: 1, display: 'flex', minHeight: 0 }, children: [_jsxs("div", { style: {
                            width: 240,
                            flexShrink: 0,
                            borderRight: '1px solid var(--c-border-1, #222233)',
                            background: 'var(--c-bg-2, #111118)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }, children: [_jsx("div", { style: {
                                    padding: '14px 12px 8px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: 'var(--c-text-4, #6a6a82)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }, children: "Sample Conversations" }), DEMO_CONVERSATIONS.map((convo) => (_jsxs("button", { onClick: () => switchConversation(convo), style: {
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
                                    borderLeft: activeConvo.id === convo.id
                                        ? '2px solid var(--c-accent, #6366f1)'
                                        : '2px solid transparent',
                                    transition: 'all 0.15s',
                                }, children: [_jsx("span", { style: { fontSize: 16 }, children: convo.agentEmoji }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                                    fontWeight: 500,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }, children: convo.title }), _jsx("div", { style: { fontSize: 10, color: 'var(--c-text-5, #555570)' }, children: convo.agentName })] })] }, convo.id)))] }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }, children: [_jsxs("div", { style: {
                                    padding: '10px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    borderBottom: '1px solid var(--c-border-1, #222233)',
                                    flexShrink: 0,
                                }, children: [_jsx("span", { style: { fontSize: 18 }, children: activeConvo.agentEmoji }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }, children: activeConvo.agentName }), _jsx("div", { style: { fontSize: 10, color: 'var(--c-text-4)' }, children: "AI Retail Assistant" })] }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: {
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: '50%',
                                                    background: '#4ade80',
                                                    display: 'inline-block',
                                                } }), _jsx("span", { style: { fontSize: 10, color: 'var(--c-text-4)' }, children: "Online" })] })] }), _jsxs("div", { ref: scrollRef, style: { flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }, children: [allMessages.map((msg, i) => (_jsx(DemoBubble, { msg: msg, agentName: activeConvo.agentName, agentEmoji: activeConvo.agentEmoji }, `${activeConvo.id}-${i}`))), typing && (_jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 12 }, children: [_jsx("div", { style: {
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    flexShrink: 0,
                                                    background: 'var(--c-bg-3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 14,
                                                }, children: activeConvo.agentEmoji }), _jsx("div", { style: {
                                                    padding: '8px 12px',
                                                    borderRadius: 12,
                                                    background: 'var(--c-bg-2)',
                                                    fontSize: 12,
                                                    color: 'var(--c-text-4)',
                                                }, children: _jsx("span", { className: "animate-pulse", children: "Thinking..." }) })] }))] }), !limitReached && demoResponses.length === 0 && (_jsxs("div", { style: {
                                    padding: '8px 16px',
                                    display: 'flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    borderTop: '1px solid var(--c-border-2, #1a1a2a)',
                                }, children: [_jsx("span", { style: {
                                            fontSize: 10,
                                            color: 'var(--c-text-5)',
                                            alignSelf: 'center',
                                            marginRight: 4,
                                        }, children: "Try asking:" }), DEMO_SUGGESTIONS.slice(0, 4).map((s) => (_jsx("button", { onClick: () => handleSuggestionClick(s), style: {
                                            padding: '4px 10px',
                                            borderRadius: 12,
                                            border: '1px solid var(--c-border-2, #2a2a3a)',
                                            background: 'var(--c-bg-2)',
                                            color: 'var(--c-text-3)',
                                            fontSize: 11,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }, onMouseEnter: (e) => {
                                            e.target.style.borderColor = 'var(--c-accent, #6366f1)';
                                        }, onMouseLeave: (e) => {
                                            e.target.style.borderColor =
                                                'var(--c-border-2, #2a2a3a)';
                                        }, children: s }, s)))] })), limitReached && (_jsxs("div", { style: {
                                    padding: '20px 16px',
                                    textAlign: 'center',
                                    background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.05))',
                                    borderTop: '1px solid var(--c-border-1)',
                                }, children: [_jsxs("p", { style: { fontSize: 14, fontWeight: 600, color: 'var(--c-text-1)', marginBottom: 6 }, children: ["You've used all ", DEMO_MAX_MESSAGES, " demo messages"] }), _jsx("p", { style: { fontSize: 12, color: 'var(--c-text-4)', marginBottom: 12 }, children: "Sign up to get unlimited access to all AI agents, analytics, and tools." }), _jsx("a", { href: "/", style: {
                                            display: 'inline-block',
                                            padding: '10px 28px',
                                            borderRadius: 12,
                                            background: 'var(--c-accent, #6366f1)',
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                        }, children: "Get Started \u2014 Free" })] })), !limitReached && (_jsxs("div", { style: {
                                    padding: '8px 12px',
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'flex-end',
                                    borderTop: '1px solid var(--c-border-1, #222233)',
                                    background: 'var(--c-bg-2, #111118)',
                                }, children: [_jsx("textarea", { ref: inputRef, value: inputText, onChange: (e) => setInputText(e.target.value), onKeyDown: (e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleDemoSend();
                                            }
                                        }, placeholder: "Type a message...", rows: 1, style: {
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
                                        } }), _jsx("button", { onClick: handleDemoSend, disabled: !inputText.trim() || typing, style: {
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
                                        }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "22", y1: "2", x2: "11", y2: "13" }), _jsx("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })] }) })] }))] })] })] }));
}
// ── Canned demo responses for free-form input ────────────────────────
function getDemoResponse(input) {
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
