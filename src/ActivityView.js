import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useApp, getAgent } from './store';
const STATUS_ICONS = {
    connecting: '🔗',
    thinking: '🧠',
    planning: '📋',
    writing: '✍️',
    researching: '⊕',
    executing: '▶',
    tool_call: '⚡',
    done: '✅',
    attention: '⚠️',
    warning: '⚠️',
    error: '❌',
};
const STATUS_COLORS = {
    connecting: 'text-yellow-400',
    thinking: 'text-amber-400',
    planning: 'text-violet-400',
    writing: 'text-blue-400',
    researching: 'text-cyan-400',
    executing: 'text-orange-400',
    tool_call: 'text-amber-400',
    done: 'text-emerald-400',
    attention: 'text-yellow-400',
    warning: 'text-orange-400',
    error: 'text-red-400',
};
export function ActivityView() {
    const { state, actions } = useApp();
    const { activity, activeAgentId } = state;
    const currentAgent = getAgent(activeAgentId);
    const filtered = activity.filter((a) => (a.agentId || 'main') === activeAgentId);
    const grouped = new Map();
    for (const evt of [...filtered].reverse()) {
        if (!grouped.has(evt.sessionId)) {
            grouped.set(evt.sessionId, { title: evt.sessionTitle, events: [] });
        }
        grouped.get(evt.sessionId).events.push(evt);
    }
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0", children: [_jsxs("header", { className: "flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm", style: { background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => actions.setSidebarOpen(!state.sidebarOpen), style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "21", y2: "18" })] }) }), _jsxs("h1", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: [currentAgent.emoji, " ", currentAgent.name, " Activity"] }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [filtered.length, " events"] })] }), activity.length > 0 && (_jsx("button", { onClick: () => {
                            localStorage.removeItem('shre-activity');
                            window.location.reload();
                        }, className: "text-[10px] px-2 py-1 rounded transition-colors", style: { color: 'var(--c-text-4)' }, children: "Clear" }))] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-4", children: [grouped.size === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-center gap-3 pb-20", children: [_jsx("svg", { className: "h-10 w-10", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }) }), _jsx("p", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: "No activity yet" })] })), _jsx("div", { className: "space-y-6 max-w-2xl mx-auto", children: Array.from(grouped.entries()).map(([sessionId, group]) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-text-2)' }, children: group.title }), _jsx("button", { onClick: () => {
                                                actions.switchSession(sessionId);
                                                actions.setView('chat');
                                            }, className: "text-[10px] text-shre-400/70 hover:text-shre-400", children: "Open \u2192" })] }), _jsxs("div", { className: "space-y-1 pl-3", style: { borderLeft: '1px solid var(--c-border-2)' }, children: [group.events.slice(0, 8).map((evt) => (_jsxs("div", { className: "flex items-center gap-2 py-0.5", children: [_jsx("span", { className: `text-xs ${STATUS_COLORS[evt.status]}`, children: STATUS_ICONS[evt.status] }), _jsx("span", { className: "text-[11px] flex-1", style: { color: 'var(--c-text-3)' }, children: evt.summary }), _jsx("span", { className: "text-[9px] shrink-0", style: { color: 'var(--c-text-5)' }, children: formatTime(evt.timestamp) })] }, evt.id))), group.events.length > 8 && (_jsxs("span", { className: "text-[10px] pl-5", style: { color: 'var(--c-text-5)' }, children: ["+", group.events.length - 8, " more"] }))] })] }, sessionId))) })] })] }));
}
function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return (d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}
