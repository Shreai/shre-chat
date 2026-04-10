import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from './store';
export function BriefingView() {
    const ctx = useContext(AppContext);
    const actions = ctx?.actions;
    const [briefing, setBriefing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(0);
    const [autoDisabled, setAutoDisabled] = useState(() => localStorage.getItem('shre-briefing-disabled') === '1');
    const fetchBriefing = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const res = await fetch('/api/briefing', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                throw new Error(`${res.status}`);
            const data = await res.json();
            setBriefing(data);
            setLastRefresh(Date.now());
            // Mark briefing as shown today (so auto-show doesn't repeat)
            localStorage.setItem('shre-last-briefing-date', new Date().toDateString());
        }
        catch (e) {
            setError(e.message || 'Failed to load briefing');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchBriefing();
    }, [fetchBriefing]);
    if (loading)
        return (_jsx("div", { className: "flex-1 flex items-center justify-center", style: { background: 'var(--c-bg)' }, children: _jsx("div", { className: "animate-pulse text-sm", style: { color: 'var(--c-text-3)' }, children: "Loading your briefing..." }) }));
    if (error)
        return (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center gap-3", style: { background: 'var(--c-bg)' }, children: [_jsx("p", { className: "text-sm", style: { color: 'var(--c-text-3)' }, children: "Could not load briefing" }), _jsx("button", { onClick: fetchBriefing, className: "px-3 py-1.5 rounded-lg text-xs font-medium", style: { background: 'var(--c-accent)', color: 'var(--c-on-accent)' }, children: "Retry" })] }));
    if (!briefing)
        return null;
    const sections = briefing.sections ?? {};
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0", children: [_jsxs("header", { className: "flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm", style: { background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => actions?.setSidebarOpen(!ctx?.state.sidebarOpen), style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "21", y2: "18" })] }) }), _jsx("h1", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Daily Briefing" }), _jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: new Date().toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                }) })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: fetchBriefing, className: "text-[10px] px-2 py-1 rounded transition-colors", style: { color: 'var(--c-text-4)' }, title: "Refresh", children: "Refresh" }), _jsx("button", { onClick: () => actions?.setView('chat'), className: "text-[10px] px-2 py-1 rounded transition-colors", style: { color: 'var(--c-accent)' }, children: "Go to Chat \u2192" })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto", style: { background: 'var(--c-bg)' }, children: _jsxs("div", { className: "max-w-2xl mx-auto px-4 py-6 space-y-6", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("h2", { className: "text-xl font-bold", style: { color: 'var(--c-text-1)' }, children: briefing.greeting }), lastRefresh > 0 && (_jsxs("p", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: ["Updated", ' ', new Date(lastRefresh).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })] }))] }), briefing.warnings && briefing.warnings.length > 0 && (_jsxs("div", { className: "flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm", style: {
                                background: 'rgba(234,179,8,0.12)',
                                border: '1px solid rgba(234,179,8,0.3)',
                                color: 'rgb(202,138,4)',
                            }, children: [_jsxs("svg", { className: "h-4 w-4 flex-shrink-0 mt-0.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" }), _jsx("line", { x1: "12", y1: "9", x2: "12", y2: "13" }), _jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })] }), _jsxs("div", { children: [_jsx("span", { className: "font-medium", children: "Some data unavailable: " }), briefing.warnings.join(', ')] })] })), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-5 gap-3", children: [_jsx(StatCard, { label: "Tasks Due", value: sections.tasks?.due_today ?? 0, accent: sections.tasks?.overdue ? true : false, sub: sections.tasks?.overdue ? `${sections.tasks.overdue} overdue` : undefined }), _jsx(StatCard, { label: "Meetings", value: sections.calendar?.upcoming ?? 0, accent: sections.calendar?.items?.some((c) => c.minutesAway < 15) ?? false, sub: sections.calendar?.items?.[0]
                                        ? `Next: ${sections.calendar.items[0].time}`
                                        : undefined }), _jsx(StatCard, { label: "Active Agents", value: sections.agents?.active ?? 0, sub: `of ${sections.agents?.total ?? 0}` }), _jsx(StatCard, { label: "Chats Today", value: sections.conversations?.today ?? 0 }), _jsx(StatCard, { label: "Reminders", value: sections.reminders?.upcoming ?? 0, accent: sections.reminders?.items?.some((r) => r.overdue) ?? false })] }), sections.tasks && sections.tasks.items.length > 0 && (_jsx(BriefingSection, { title: "Tasks", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M9 11l3 3L22 4" }), _jsx("path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" })] }), children: _jsx("div", { className: "space-y-2", children: sections.tasks.items.map((t, i) => (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors", style: { background: 'var(--c-bg-2)' }, title: "Click to get help with this task", onClick: () => {
                                        window.dispatchEvent(new CustomEvent('shre-prefill', {
                                            detail: { text: 'Help me with: ' + t.title },
                                        }));
                                        actions?.setView('chat');
                                    }, onMouseEnter: (e) => {
                                        e.currentTarget.style.background = 'var(--c-bg-hover)';
                                    }, onMouseLeave: (e) => {
                                        e.currentTarget.style.background = 'var(--c-bg-2)';
                                    }, children: [_jsx("span", { className: `w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'}` }), _jsx("span", { className: "flex-1 text-sm truncate", style: { color: 'var(--c-text-1)' }, children: t.title }), _jsx("span", { className: "text-[11px] flex-shrink-0", style: { color: 'var(--c-text-4)' }, children: t.status }), t.due && (_jsx("span", { className: "text-[11px] flex-shrink-0", style: { color: 'var(--c-text-4)' }, children: t.due }))] }, i))) }) })), sections.calendar && sections.calendar.items.length > 0 && (_jsx(BriefingSection, { title: "Calendar", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }), _jsx("path", { d: "M16 2v4M8 2v4M3 10h18" })] }), children: _jsx("div", { className: "space-y-2", children: sections.calendar.items.map((m, i) => (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg", style: { background: 'var(--c-bg-2)' }, children: [_jsx("span", { className: `w-2 h-2 rounded-full flex-shrink-0 ${m.minutesAway < 15 ? 'bg-red-500 animate-pulse' : m.minutesAway < 60 ? 'bg-orange-500' : 'bg-blue-500'}` }), _jsx("span", { className: "flex-1 text-sm truncate", style: { color: 'var(--c-text-1)' }, children: m.title }), _jsx("span", { className: "text-[11px] flex-shrink-0", style: { color: 'var(--c-text-4)' }, children: m.time }), m.minutesAway > 0 && (_jsxs("span", { className: "text-[11px] flex-shrink-0 font-medium", style: { color: m.minutesAway < 15 ? 'rgb(239,68,68)' : 'var(--c-text-4)' }, children: ["in ", m.minutesAway, "m"] })), m.meetingUrl && (_jsx("a", { href: m.meetingUrl, target: "_blank", rel: "noopener noreferrer", className: "text-[11px] px-2 py-0.5 rounded font-medium", style: { background: 'var(--c-accent)', color: 'var(--c-on-accent)' }, children: "Join" }))] }, i))) }) })), sections.reminders && sections.reminders.items.length > 0 && (_jsx(BriefingSection, { title: "Upcoming Reminders", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" }), _jsx("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" })] }), children: _jsx("div", { className: "space-y-2", children: sections.reminders.items.map((r) => (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors", style: { background: r.overdue ? 'rgba(239,68,68,0.1)' : 'var(--c-bg-2)' }, title: "View reminders", onClick: () => {
                                        actions?.setView('reminders');
                                    }, onMouseEnter: (e) => {
                                        if (!r.overdue)
                                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                                    }, onMouseLeave: (e) => {
                                        e.currentTarget.style.background = r.overdue
                                            ? 'rgba(239,68,68,0.1)'
                                            : 'var(--c-bg-2)';
                                    }, children: [_jsx("span", { className: `w-2 h-2 rounded-full flex-shrink-0 ${r.overdue ? 'bg-red-500' : 'bg-green-500'}` }), _jsx("span", { className: "flex-1 text-sm", style: { color: 'var(--c-text-1)' }, children: r.text }), _jsx("span", { className: "text-[11px] flex-shrink-0", style: { color: r.overdue ? 'rgb(239,68,68)' : 'var(--c-text-4)' }, children: r.due })] }, r.id))) }) })), sections.agents && sections.agents.recent.length > 0 && (_jsx(BriefingSection, { title: "Agent Activity", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }), children: _jsx("div", { className: "space-y-2", children: sections.agents.recent.map((a) => (_jsxs("div", { className: "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors", style: { background: 'var(--c-bg-2)' }, title: `Switch to ${a.name}`, onClick: () => {
                                        window.dispatchEvent(new CustomEvent('shre-switch-agent', { detail: { agentId: a.id } }));
                                        actions?.setView('chat');
                                    }, onMouseEnter: (e) => {
                                        e.currentTarget.style.background = 'var(--c-bg-hover)';
                                    }, onMouseLeave: (e) => {
                                        e.currentTarget.style.background = 'var(--c-bg-2)';
                                    }, children: [_jsx("span", { className: "text-sm font-medium flex-1", style: { color: 'var(--c-text-1)' }, children: a.name }), _jsxs("span", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: [a.messageCount, " msgs"] }), _jsx("span", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: a.lastActivity })] }, a.id))) }) })), sections.conversations && sections.conversations.recent.length > 0 && (_jsx(BriefingSection, { title: "Recent Conversations", icon: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }), children: _jsx("div", { className: "space-y-2", children: sections.conversations.recent.map((c, i) => (_jsxs("div", { className: "px-3 py-2 rounded-lg", style: { background: 'var(--c-bg-2)' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-0.5", children: [_jsx("span", { className: "text-xs font-medium", style: { color: 'var(--c-accent)' }, children: c.agent }), _jsx("span", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: c.time })] }), _jsx("p", { className: "text-sm truncate", style: { color: 'var(--c-text-2)' }, children: c.preview })] }, i))) }) })), sections.tip && (_jsxs("div", { className: "px-4 py-3 rounded-xl", style: { background: 'var(--c-bg-2)', borderLeft: '3px solid var(--c-accent)' }, children: [_jsx("p", { className: "text-xs font-medium mb-1", style: { color: 'var(--c-accent)' }, children: "Tip" }), _jsx("p", { className: "text-sm", style: { color: 'var(--c-text-2)' }, children: sections.tip })] })), _jsx("div", { className: "flex items-center justify-center pt-2 pb-4", children: _jsx("button", { className: "text-[11px] transition-colors", style: {
                                    color: 'var(--c-text-4)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '2px',
                                }, onClick: () => {
                                    const next = !autoDisabled;
                                    setAutoDisabled(next);
                                    if (next) {
                                        localStorage.setItem('shre-briefing-disabled', '1');
                                    }
                                    else {
                                        localStorage.removeItem('shre-briefing-disabled');
                                    }
                                }, children: autoDisabled
                                    ? 'Show briefing automatically on login'
                                    : 'Don\u2019t show automatically' }) })] }) })] }));
}
function StatCard({ label, value, accent, sub, }) {
    return (_jsxs("div", { className: "px-3 py-3 rounded-xl", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("p", { className: "text-[11px] font-medium mb-1", style: { color: 'var(--c-text-4)' }, children: label }), _jsx("p", { className: `text-2xl font-bold ${accent ? 'text-red-500' : ''}`, style: accent ? {} : { color: 'var(--c-text-1)' }, children: value }), sub && (_jsx("p", { className: "text-[11px] mt-0.5", style: { color: accent ? 'rgb(239,68,68)' : 'var(--c-text-4)' }, children: sub }))] }));
}
function BriefingSection({ title, icon, children, }) {
    return (_jsxs("div", { className: "rounded-xl overflow-hidden", style: { border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2.5", style: { background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("span", { style: { color: 'var(--c-accent)' }, children: icon }), _jsx("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: title })] }), _jsx("div", { className: "px-1 py-1", style: { background: 'var(--c-bg-1)' }, children: children })] }));
}
