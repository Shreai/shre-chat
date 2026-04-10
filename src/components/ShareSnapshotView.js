import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function ShareSnapshotView({ snapshot, loading, error }) {
    if (!snapshot && !loading && !error)
        return null;
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0 relative", children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-3 shrink-0", style: { background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-1)' }, children: [_jsx("a", { href: "/", className: "text-[11px] px-2 py-1 rounded-lg transition-colors", style: { color: 'var(--c-text-3)', border: '1px solid var(--c-border-1)' }, children: "\u2190 Back to Shre Chat" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-xs font-medium truncate", style: { color: 'var(--c-text-1)' }, children: snapshot?.title || 'Shared Conversation' }), snapshot?.createdAt && (_jsxs("div", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: ["Shared ", new Date(snapshot.createdAt).toLocaleDateString(), " \u00B7", ' ', snapshot.messages.length, " messages", snapshot.model ? ` \u00b7 ${snapshot.model}` : ''] }))] }), _jsx("div", { className: "text-[9px] px-2 py-1 rounded-full", style: {
                            background: 'rgba(59,130,246,0.1)',
                            color: 'var(--c-info-soft)',
                            border: '1px solid rgba(59,130,246,0.2)',
                        }, children: "Read-only" })] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-6", children: [loading && (_jsxs("div", { className: "text-center py-20", style: { color: 'var(--c-text-4)' }, children: [_jsx("span", { className: "inline-block h-5 w-5 rounded-full border-2 border-t-transparent animate-spin mb-2", style: { borderColor: 'var(--c-accent)', borderTopColor: 'transparent' } }), _jsx("div", { className: "text-sm", children: "Loading shared conversation..." })] })), error && (_jsxs("div", { className: "text-center py-20", style: { color: 'var(--c-text-4)' }, children: [_jsx("div", { className: "text-2xl mb-2", children: "\uD83D\uDD17" }), _jsx("div", { className: "text-sm", children: error })] })), snapshot && (_jsx("div", { className: "max-w-3xl mx-auto space-y-4", children: snapshot.messages.map((msg, i) => (_jsx("div", { className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: "max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap", style: {
                                    background: msg.role === 'user' ? 'var(--c-accent)' : 'var(--c-bg-card)',
                                    color: msg.role === 'user' ? 'var(--c-on-accent)' : 'var(--c-text-1)',
                                    border: msg.role === 'user' ? 'none' : '1px solid var(--c-border-2)',
                                }, children: msg.role !== 'user' ? (_jsx(Markdown, { remarkPlugins: [remarkGfm], children: msg.content.replace(/<think>[\s\S]*?<\/think>\s*/g, '') })) : (msg.content) }) }, i))) }))] })] }));
}
