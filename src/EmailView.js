import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// ── Helpers ──────────────────────────────────────────────────────────
function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)
        return 'now';
    if (diff < 3600_000)
        return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000)
        return `${Math.floor(diff / 3600_000)}h`;
    if (diff < 604800_000)
        return `${Math.floor(diff / 86400_000)}d`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}b`;
    if (bytes < 1048576)
        return `${(bytes / 1024).toFixed(0)}kb`;
    return `${(bytes / 1048576).toFixed(1)}mb`;
}
function initials(name) {
    return (name
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?');
}
const COLORS = [
    '#6366f1',
    '#ec4899',
    '#14b8a6',
    '#f59e0b',
    '#8b5cf6',
    '#ef4444',
    '#06b6d4',
    '#84cc16',
];
function colorForEmail(email) {
    let hash = 0;
    for (let i = 0; i < email.length; i++)
        hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
}
// ── EmailView ────────────────────────────────────────────────────────
export function EmailView() {
    const [threads, setThreads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeThread, setActiveThread] = useState(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replyText, setReplyText] = useState('');
    const [replyMode, setReplyMode] = useState('all');
    const [replyTo, setReplyTo] = useState(null);
    const [sending, setSending] = useState(false);
    const [showCc, setShowCc] = useState(false);
    const [addRecipient, setAddRecipient] = useState('');
    const [extraRecipients, setExtraRecipients] = useState([]);
    const [myEmail, setMyEmail] = useState('');
    const messagesEndRef = useRef(null);
    const replyRef = useRef(null);
    // ── Fetch threads ──
    const fetchThreads = useCallback(async (query) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (query)
                params.set('q', query);
            params.set('max', '30');
            const res = await fetch(`/api/email/threads?${params}`);
            if (!res.ok)
                throw new Error('Failed to load inbox');
            const data = await res.json();
            setThreads(data.threads || []);
            if (data.myEmail)
                setMyEmail(data.myEmail);
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);
    // ── Open thread ──
    const openThread = useCallback(async (threadId) => {
        setThreadLoading(true);
        setReplyText('');
        setReplyMode('all');
        setReplyTo(null);
        setExtraRecipients([]);
        try {
            const res = await fetch(`/api/email/thread/${threadId}`);
            if (!res.ok)
                throw new Error('Failed to load thread');
            const data = await res.json();
            setActiveThread(data);
            if (data.myEmail)
                setMyEmail(data.myEmail);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setThreadLoading(false);
        }
    }, []);
    // ── Send reply ──
    const handleSendReply = useCallback(async () => {
        if (!replyText.trim() || !activeThread)
            return;
        setSending(true);
        // Parse /name commands for directing to specific person
        let effectiveText = replyText;
        let effectiveTo = replyTo;
        let effectiveReplyAll = replyMode === 'all';
        const slashMatch = replyText.match(/^\/(\w+)\s+/);
        if (slashMatch) {
            const name = slashMatch[1].toLowerCase();
            const participant = activeThread.participants.find((p) => p.name.toLowerCase().startsWith(name) || p.email.split('@')[0].toLowerCase() === name);
            if (participant) {
                effectiveTo = participant.email;
                effectiveReplyAll = false;
                effectiveText = replyText.replace(/^\/\w+\s+/, '');
            }
        }
        // Parse @mentions and bold them in the email
        effectiveText = effectiveText.replace(/@(\w+)/g, (match, name) => {
            const p = activeThread.participants.find((pp) => pp.name.toLowerCase().startsWith(name.toLowerCase()));
            return p ? `@${p.name}` : match;
        });
        try {
            const body = {
                threadId: activeThread.id,
                body: effectiveText,
                replyAll: effectiveReplyAll,
            };
            if (effectiveTo) {
                body.to = effectiveTo;
                body.subject = `Re: ${activeThread.subject}`;
            }
            if (extraRecipients.length > 0) {
                body.add = extraRecipients.join(',');
            }
            const res = await fetch('/api/email/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error('Failed to send reply');
            setReplyText('');
            setExtraRecipients([]);
            // Refresh thread to show sent message
            await openThread(activeThread.id);
        }
        catch (err) {
            alert(`Send failed: ${err.message}`);
        }
        finally {
            setSending(false);
        }
    }, [replyText, activeThread, replyMode, replyTo, extraRecipients, openThread]);
    // ── Add recipient via /add @person ──
    const handleReplyKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Check for /add command
            const addMatch = replyText.match(/^\/add\s+@?(.+)$/i);
            if (addMatch && activeThread) {
                const search = addMatch[1].toLowerCase().trim();
                const p = activeThread.participants.find((pp) => pp.name.toLowerCase().includes(search) || pp.email.toLowerCase().includes(search));
                if (p && !extraRecipients.includes(p.email)) {
                    setExtraRecipients((prev) => [...prev, p.email]);
                    setReplyText('');
                    return;
                }
                // If not found in participants, treat as email
                if (search.includes('@')) {
                    setExtraRecipients((prev) => [...prev, search]);
                    setReplyText('');
                    return;
                }
            }
            handleSendReply();
        }
    };
    // ── Participant autocomplete in reply ──
    const replyHint = useMemo(() => {
        if (!activeThread)
            return null;
        const match = replyText.match(/\/(\w*)$/);
        if (!match)
            return null;
        const query = match[1].toLowerCase();
        return activeThread.participants
            .filter((p) => p.email !== myEmail)
            .filter((p) => p.name.toLowerCase().startsWith(query) ||
            p.email.split('@')[0].toLowerCase().startsWith(query))
            .slice(0, 5);
    }, [replyText, activeThread, myEmail]);
    // ── Search ──
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchQuery.length > 2)
                fetchThreads(searchQuery);
            else if (searchQuery.length === 0)
                fetchThreads();
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchQuery, fetchThreads]);
    // ── Render ─────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "flex flex-1 min-h-0", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "flex flex-col border-r shrink-0", style: {
                    width: activeThread ? '320px' : '100%',
                    maxWidth: activeThread ? '320px' : '600px',
                    margin: activeThread ? '0' : '0 auto',
                    borderColor: 'var(--c-border-1)',
                }, children: [_jsx("div", { className: "p-3 border-b", style: { borderColor: 'var(--c-border-1)' }, children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg", style: { background: 'var(--c-bg-3)' }, children: [_jsxs("svg", { className: "h-3.5 w-3.5 shrink-0", style: { color: 'var(--c-text-4)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("path", { d: "M21 21l-4.35-4.35" })] }), _jsx("input", { type: "text", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Search emails...", className: "flex-1 bg-transparent text-sm outline-none", style: { color: 'var(--c-text-1)' } })] }), _jsx("button", { onClick: () => fetchThreads(), className: "p-1.5 rounded-lg transition-colors hover:brightness-125", style: { color: 'var(--c-text-3)' }, title: "Refresh", children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M1 4v6h6" }), _jsx("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" })] }) })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto", children: [loading && (_jsxs("div", { className: "flex items-center justify-center py-12", style: { color: 'var(--c-text-4)' }, children: [_jsxs("svg", { className: "h-5 w-5 animate-spin mr-2", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10", opacity: "0.3" }), _jsx("path", { d: "M12 2a10 10 0 0 1 10 10", strokeLinecap: "round" })] }), "Loading inbox..."] })), error && (_jsxs("div", { className: "p-4 text-center text-sm", style: { color: 'var(--c-error, #ef4444)' }, children: [error, _jsx("button", { onClick: () => fetchThreads(), className: "block mx-auto mt-2 text-xs underline", style: { color: 'var(--c-accent)' }, children: "Retry" })] })), !loading && !error && threads.length === 0 && (_jsx("div", { className: "p-8 text-center text-sm", style: { color: 'var(--c-text-4)' }, children: "No emails found" })), threads.map((t) => (_jsx("button", { onClick: () => openThread(t.id), className: "w-full text-left px-3 py-2.5 border-b transition-colors", style: {
                                    borderColor: 'var(--c-border-1)',
                                    background: activeThread?.id === t.id ? 'var(--c-bg-hover)' : 'transparent',
                                }, children: _jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx("div", { className: "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5", style: { background: colorForEmail(t.lastFrom.email) }, children: initials(t.lastFrom.name || t.lastFrom.email) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: `text-sm truncate ${t.unread ? 'font-semibold' : ''}`, style: { color: 'var(--c-text-1)' }, children: [t.lastFrom.name || t.lastFrom.email.split('@')[0], t.participants.length > 2 && (_jsxs("span", { className: "text-[10px] ml-1 opacity-50", children: ["+", t.participants.length - 1] }))] }), _jsx("span", { className: "text-[10px] shrink-0", style: { color: 'var(--c-text-5)' }, children: timeAgo(t.timestamp) })] }), _jsx("div", { className: `text-xs truncate ${t.unread ? 'font-medium' : ''}`, style: { color: t.unread ? 'var(--c-text-2)' : 'var(--c-text-3)' }, children: t.subject || '(no subject)' }), _jsx("div", { className: "text-[11px] truncate mt-0.5", style: { color: 'var(--c-text-5)' }, children: t.snippet }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [t.messageCount > 1 && (_jsx("span", { className: "text-[9px] px-1 rounded", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: t.messageCount })), t.hasAttachments && (_jsx("svg", { className: "h-3 w-3", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" }) }))] })] })] }) }, t.id)))] })] }), activeThread && (_jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsxs("div", { className: "px-4 py-3 border-b flex items-center gap-3", style: { borderColor: 'var(--c-border-1)' }, children: [_jsx("button", { onClick: () => setActiveThread(null), className: "p-1 rounded transition-colors hover:brightness-125 shrink-0", style: { color: 'var(--c-text-3)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M19 12H5" }), _jsx("path", { d: "M12 19l-7-7 7-7" })] }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium truncate", style: { color: 'var(--c-text-1)' }, children: activeThread.subject || '(no subject)' }), _jsxs("div", { className: "flex items-center gap-1 mt-0.5", children: [activeThread.participants.slice(0, 5).map((p, i) => (_jsx("div", { className: "w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold", style: {
                                                    background: colorForEmail(p.email),
                                                    marginLeft: i > 0 ? '-4px' : '0',
                                                    border: '1.5px solid var(--c-bg-1)',
                                                    zIndex: 5 - i,
                                                }, title: `${p.name} <${p.email}>`, children: initials(p.name || p.email) }, p.email))), activeThread.participants.length > 5 && (_jsxs("span", { className: "text-[10px] ml-1", style: { color: 'var(--c-text-4)' }, children: ["+", activeThread.participants.length - 5] })), _jsx("button", { onClick: () => setShowCc(!showCc), className: "ml-1 p-0.5 rounded transition-colors hover:brightness-125", style: { color: 'var(--c-text-4)' }, title: "Show all participants", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }) })] })] })] }), showCc && (_jsx("div", { className: "px-4 py-2 border-b flex flex-wrap gap-1.5", style: { borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }, children: activeThread.participants.map((p) => (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-2)' }, children: [_jsx("span", { className: "w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold", style: { background: colorForEmail(p.email) }, children: initials(p.name || p.email) }), p.name || p.email.split('@')[0], _jsx("span", { style: { color: 'var(--c-text-5)' }, children: p.email })] }, p.email))) })), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-4 space-y-3", children: [threadLoading && (_jsx("div", { className: "flex justify-center py-8", children: _jsxs("svg", { className: "h-5 w-5 animate-spin", style: { color: 'var(--c-text-4)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10", opacity: "0.3" }), _jsx("path", { d: "M12 2a10 10 0 0 1 10 10", strokeLinecap: "round" })] }) })), activeThread.messages.map((msg, i) => {
                                const prevMsg = activeThread.messages[i - 1];
                                const showDateSep = !prevMsg ||
                                    new Date(msg.date).toDateString() !== new Date(prevMsg.date).toDateString();
                                return (_jsxs("div", { children: [showDateSep && (_jsxs("div", { className: "flex items-center gap-3 my-4", children: [_jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-1)' } }), _jsx("span", { className: "text-[10px] font-medium", style: { color: 'var(--c-text-5)' }, children: new Date(msg.date).toLocaleDateString(undefined, {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    }) }), _jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-1)' } })] })), _jsxs("div", { className: `flex gap-2.5 ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`, children: [!msg.isMe && (_jsx("div", { className: "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1", style: { background: colorForEmail(msg.from.email) }, title: `${msg.from.name} <${msg.from.email}>`, children: initials(msg.from.name || msg.from.email) })), _jsxs("div", { className: `max-w-[75%] min-w-[200px] ${msg.isMe ? 'ml-auto' : ''}`, children: [_jsxs("div", { className: `flex items-center gap-2 mb-1 ${msg.isMe ? 'justify-end' : ''}`, children: [_jsx("span", { className: "text-xs font-medium", style: { color: 'var(--c-text-2)' }, children: msg.isMe ? 'You' : msg.from.name || msg.from.email.split('@')[0] }), _jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: msg.from.email }), _jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: formatDate(msg.date) })] }), msg.cc.length > 0 && (_jsxs("div", { className: "flex items-center gap-1 mb-1 text-[10px]", style: { color: 'var(--c-text-5)' }, children: [_jsx("span", { children: "cc:" }), msg.cc.slice(0, 3).map((c) => (_jsx("span", { children: c.name || c.email.split('@')[0] }, c.email))), msg.cc.length > 3 && _jsxs("span", { children: ["+", msg.cc.length - 3] })] })), _jsx("div", { className: "rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap", style: {
                                                                background: msg.isMe
                                                                    ? 'var(--c-accent)'
                                                                    : 'var(--c-bg-card, var(--c-bg-3))',
                                                                color: msg.isMe ? 'var(--c-on-accent, #fff)' : 'var(--c-text-1)',
                                                                borderTopRightRadius: msg.isMe ? '4px' : '12px',
                                                                borderTopLeftRadius: msg.isMe ? '12px' : '4px',
                                                            }, children: msg.body.length > 2000 ? msg.body.slice(0, 2000) + '\n\n...' : msg.body }), msg.attachments.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1.5 mt-1.5", children: msg.attachments.map((a) => (_jsxs("a", { href: `/api/email/attachment/${a.messageId}/${a.id}`, target: "_blank", rel: "noreferrer", className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors hover:brightness-110", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-2)' }, children: [_jsxs("svg", { className: "h-3 w-3 shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] }), _jsx("span", { className: "truncate max-w-[120px]", children: a.filename }), _jsxs("span", { style: { color: 'var(--c-text-5)' }, children: ["(", formatSize(a.size), ")"] })] }, a.id))) })), _jsxs("div", { className: `flex items-center gap-1 mt-1 ${msg.isMe ? 'justify-end' : ''}`, children: [_jsx("button", { onClick: () => {
                                                                        setReplyTo(msg.from.email);
                                                                        setReplyMode('direct');
                                                                        replyRef.current?.focus();
                                                                    }, className: "p-1 rounded transition-colors hover:brightness-125", style: { color: 'var(--c-text-5)' }, title: `Reply to ${msg.from.name}`, children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "9 17 4 12 9 7" }), _jsx("path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" })] }) }), _jsx("button", { onClick: () => {
                                                                        setReplyMode('all');
                                                                        setReplyTo(null);
                                                                        replyRef.current?.focus();
                                                                    }, className: "p-1 rounded transition-colors hover:brightness-125", style: { color: 'var(--c-text-5)' }, title: "Reply all", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "9 17 4 12 9 7" }), _jsx("polyline", { points: "13 17 8 12 13 7" }), _jsx("path", { d: "M20 18v-2a4 4 0 0 0-4-4H8" })] }) }), _jsx("button", { className: "p-1 rounded transition-colors hover:brightness-125", style: { color: 'var(--c-text-5)' }, title: "Forward", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "15 17 20 12 15 7" }), _jsx("path", { d: "M4 18v-2a4 4 0 0 1 4-4h12" })] }) })] })] })] })] }, msg.id));
                            }), _jsx("div", { ref: messagesEndRef })] }), _jsxs("div", { className: "border-t px-4 py-3", style: { borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }, children: [_jsxs("div", { className: "flex items-center gap-2 mb-2 text-[11px]", style: { color: 'var(--c-text-4)' }, children: [_jsx("span", { children: replyMode === 'all'
                                            ? `Replying to all (${activeThread.participants.length})`
                                            : `Replying to ${replyTo || '...'}` }), _jsx("button", { onClick: () => {
                                            setReplyMode(replyMode === 'all' ? 'direct' : 'all');
                                            if (replyMode === 'direct')
                                                setReplyTo(null);
                                        }, className: "px-1.5 py-0.5 rounded text-[10px] transition-colors hover:brightness-125", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }, children: replyMode === 'all' ? 'Reply to one' : 'Reply all' }), extraRecipients.map((r) => (_jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }, children: ["+", r.split('@')[0], _jsx("button", { onClick: () => setExtraRecipients((prev) => prev.filter((e) => e !== r)), className: "text-red-400 hover:text-red-300", children: "\u00D7" })] }, r)))] }), replyHint && replyHint.length > 0 && (_jsx("div", { className: "mb-1 flex flex-wrap gap-1", children: replyHint.map((p) => (_jsx("button", { onClick: () => {
                                        setReplyText(replyText.replace(/\/\w*$/, `/${p.name.split(' ')[0].toLowerCase()} `));
                                        replyRef.current?.focus();
                                    }, className: "px-2 py-0.5 rounded text-[10px] transition-colors hover:brightness-110", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-2)' }, children: p.name || p.email }, p.email))) })), _jsxs("div", { className: "flex items-end gap-2", children: [_jsx("textarea", { ref: replyRef, value: replyText, onChange: (e) => setReplyText(e.target.value), onKeyDown: handleReplyKeyDown, placeholder: replyMode === 'all'
                                            ? 'Reply to all... (/name to reply to one, /add @name to add)'
                                            : `Reply to ${replyTo || ''}...`, rows: 2, className: "flex-1 px-3 py-2 rounded-lg text-sm resize-none outline-none max-h-32 overflow-y-auto", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-1)' } }), _jsx("button", { onClick: handleSendReply, disabled: !replyText.trim() || sending, className: "h-9 w-9 rounded-lg flex items-center justify-center transition-all", style: {
                                            background: replyText.trim() ? 'var(--c-accent)' : 'var(--c-bg-3)',
                                            color: replyText.trim() ? 'var(--c-on-accent, #fff)' : 'var(--c-text-4)',
                                        }, children: sending ? (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10", opacity: "0.3" }), _jsx("path", { d: "M12 2a10 10 0 0 1 10 10", strokeLinecap: "round" })] })) : (_jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "22", y1: "2", x2: "11", y2: "13" }), _jsx("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })] })) })] }), _jsxs("div", { className: "flex items-center gap-2 mt-1.5 text-[10px]", style: { color: 'var(--c-text-5)' }, children: [_jsx("span", { children: "Enter to send" }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: "/name to reply to specific person" }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: "@name to mention" }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: "/add @email to add recipient" })] })] })] })), !activeThread && !loading && threads.length > 0 && (_jsx("div", { className: "flex-1 hidden md:flex items-center justify-center", style: { color: 'var(--c-text-4)' }, children: _jsxs("div", { className: "text-center", children: [_jsxs("svg", { className: "h-12 w-12 mx-auto mb-3 opacity-30", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" }), _jsx("polyline", { points: "22,6 12,13 2,6" })] }), _jsx("p", { className: "text-sm", children: "Select a conversation" })] }) }))] }));
}
