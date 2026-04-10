import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useApp, getAgent } from './store';
export function FilesView() {
    const { state, actions } = useApp();
    const { files, activeAgentId } = state;
    const currentAgent = getAgent(activeAgentId);
    const filtered = files.filter((f) => (f.agentId || 'main') === activeAgentId);
    const grouped = new Map();
    for (const f of [...filtered].reverse()) {
        if (!grouped.has(f.sessionId)) {
            grouped.set(f.sessionId, { title: f.sessionTitle, items: [] });
        }
        grouped.get(f.sessionId).items.push(f);
    }
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0", children: [_jsx("header", { className: "flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm", style: { background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }, children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => actions.setSidebarOpen(!state.sidebarOpen), style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "21", y2: "18" })] }) }), _jsxs("h1", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: [currentAgent.emoji, " ", currentAgent.name, " Files"] }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [filtered.length, " files"] })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-4", children: [files.length === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-center gap-3 pb-20", children: [_jsxs("svg", { className: "h-10 w-10", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] }), _jsx("p", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: "No files uploaded yet" }), _jsx("p", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "Attach files to your messages using the clip icon" })] })), _jsx("div", { className: "space-y-6 max-w-2xl mx-auto", children: Array.from(grouped.entries()).map(([sessionId, group]) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-text-2)' }, children: group.title }), _jsx("button", { onClick: () => {
                                                actions.switchSession(sessionId);
                                                actions.setView('chat');
                                            }, className: "text-[10px] text-shre-400/70 hover:text-shre-400", children: "Open \u2192" })] }), _jsx("div", { className: "space-y-1", children: group.items.map((f) => (_jsxs("div", { className: "flex items-center gap-3 px-3 py-2 rounded-lg group transition-colors", style: { background: 'transparent' }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--c-bg-hover)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsx(FileIcon, { type: f.type }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs", style: { color: 'var(--c-text-2)' }, children: f.name }), _jsxs("p", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: [formatSize(f.size), " \u00B7 ", formatDate(f.uploadedAt)] })] }), _jsx("button", { onClick: () => actions.removeFile(f.id), className: "hidden group-hover:block text-red-400/40 hover:text-red-400 text-xs", children: "\u00D7" })] }, f.id))) })] }, sessionId))) })] })] }));
}
function FileIcon({ type }) {
    const isImage = type.startsWith('image/');
    const isPdf = type === 'application/pdf';
    const isCode = type.includes('javascript') ||
        type.includes('typescript') ||
        type.includes('json') ||
        type.includes('text/');
    const color = isImage
        ? 'text-pink-400'
        : isPdf
            ? 'text-red-400'
            : isCode
                ? 'text-cyan-400'
                : 'text-shre-400';
    return (_jsx("div", { className: `h-8 w-8 rounded-lg flex items-center justify-center ${color} shrink-0`, style: { background: 'var(--c-bg-card)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] }) }));
}
function formatSize(bytes) {
    if (bytes < 1024)
        return bytes + 'b';
    if (bytes < 1024 * 1024)
        return (bytes / 1024).toFixed(0) + 'kb';
    return (bytes / (1024 * 1024)).toFixed(1) + 'mb';
}
function formatDate(ts) {
    return new Date(ts).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
