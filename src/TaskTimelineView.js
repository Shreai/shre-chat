import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '@shre/ui-kit';
import { GanttChart } from './components/GanttChart';
import { DateRangeSelector } from './components/DateRangeSelector';
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
async function fetchApi(path) {
    try {
        const r = await fetch(path);
        if (!r.ok)
            return null;
        return r.json();
    }
    catch {
        return null;
    }
}
export function TaskTimelineView() {
    const [range, setRange] = useState({ from: daysAgo(14), to: today() });
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [agentFilter, setAgentFilter] = useState('all');
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            const qs = new URLSearchParams({ limit: '200' });
            if (statusFilter !== 'all')
                qs.set('status', statusFilter);
            if (agentFilter !== 'all')
                qs.set('agent', agentFilter);
            const result = await fetchApi(`/api/task-timeline?${qs}`);
            if (cancelled)
                return;
            if (!result) {
                setError('Could not load tasks. Is shre-tasks running?');
                setLoading(false);
                return;
            }
            const list = Array.isArray(result) ? result : result.tasks || [];
            setTasks(list);
            setLoading(false);
        }
        load();
        const iv = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [range, statusFilter, agentFilter]);
    const ganttTasks = useMemo(() => tasks
        .filter((t) => t.created_at >= range.from && t.created_at <= range.to + 'T23:59:59Z')
        .map((t) => ({
        id: t.id,
        title: t.title || t.id.slice(0, 8),
        start: t.created_at,
        end: t.completed_at || t.updated_at || t.created_at,
        status: t.status,
        agent: t.agent_id,
        parentId: t.parent_id,
        qualityScore: t.quality_score,
    })), [tasks, range]);
    const agents = useMemo(() => Array.from(new Set(tasks.map((t) => t.agent_id).filter(Boolean))), [tasks]);
    const statuses = ['all', 'todo', 'in_progress', 'done', 'blocked', 'failed'];
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2 justify-between", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }), _jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Task Timeline" }), _jsx("span", { className: "text-[10px] font-mono", style: { color: 'var(--c-text-5)' }, children: "via shre-tasks" })] }), _jsx(DateRangeSelector, { value: range, onChange: setRange })] }), _jsxs("div", { className: "px-4 py-2 flex items-center gap-3 flex-wrap", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "Status:" }), statuses.map((s) => (_jsx("button", { onClick: () => setStatusFilter(s), className: "px-1.5 py-0.5 rounded text-[10px] font-medium capitalize", style: {
                                    background: statusFilter === s ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                                    color: statusFilter === s ? '#fff' : 'var(--c-text-4)',
                                    border: `1px solid ${statusFilter === s ? 'transparent' : 'var(--c-border-2)'}`,
                                }, children: s }, s)))] }), agents.length > 0 && (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "Agent:" }), _jsxs("select", { value: agentFilter, onChange: (e) => setAgentFilter(e.target.value), className: "text-[10px] px-1.5 py-0.5 rounded", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-2)',
                                    border: '1px solid var(--c-border-2)',
                                }, children: [_jsx("option", { value: "all", children: "All" }), agents.map((a) => (_jsx("option", { value: a, children: a }, a)))] })] })), _jsxs("span", { className: "ml-auto text-[11px]", style: { color: 'var(--c-text-4)' }, children: [ganttTasks.length, " tasks"] })] }), _jsxs("div", { className: "flex-1 overflow-auto p-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), !loading && ganttTasks.length > 0 && (_jsx("div", { className: "rounded-lg p-3 overflow-x-auto", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(GanttChart, { tasks: ganttTasks, height: Math.max(300, ganttTasks.length * 28 + 40) }) })), !loading && ganttTasks.length === 0 && !error && (_jsx("p", { className: "text-center text-[12px] py-12", style: { color: 'var(--c-text-4)' }, children: "No tasks in selected range" }))] })] }));
}
