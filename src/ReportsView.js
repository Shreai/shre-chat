import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { SBadge } from '@shre/ui-kit';
async function fetchApi(path, opts) {
    try {
        const r = await fetch(path, opts);
        if (!r.ok)
            return null;
        return r.json();
    }
    catch {
        return null;
    }
}
const SCHEDULE_OPTIONS = [
    { value: 'daily_8', label: 'Daily at 8 AM' },
    { value: 'daily_18', label: 'Daily at 6 PM' },
    { value: 'weekly_monday', label: 'Weekly Monday' },
    { value: 'weekly_friday', label: 'Weekly Friday' },
    { value: 'monthly_1', label: 'Monthly 1st' },
    { value: 'monthly_15', label: 'Monthly 15th' },
];
export function ReportsView() {
    const [reports, setReports] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newQuery, setNewQuery] = useState('');
    const [newSchedule, setNewSchedule] = useState('daily_8');
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const [r, h] = await Promise.all([
            fetchApi('/api/reports'),
            fetchApi('/api/reports/history'),
        ]);
        if (!r && !h)
            setError('Could not load reports');
        setReports(r ?? []);
        setHistory(h ?? []);
        setLoading(false);
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    async function createReport() {
        if (!newName.trim() || !newQuery.trim())
            return;
        await fetchApi('/api/reports/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName, query: newQuery, schedule: newSchedule }),
        });
        setShowCreate(false);
        setNewName('');
        setNewQuery('');
        load();
    }
    async function deleteReport(id) {
        await fetch(`/api/reports/${id}`, { method: 'DELETE' });
        load();
    }
    async function runNow(id) {
        await fetch(`/api/reports/${id}/run`, { method: 'POST' });
        setTimeout(load, 2000);
    }
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2 justify-between", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Scheduled Reports" })] }), _jsx("button", { onClick: () => setShowCreate(!showCreate), className: "px-3 py-1 rounded text-[11px] font-semibold", style: { background: 'var(--c-accent, #6366f1)', color: '#fff' }, children: "+ New Report" })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), showCreate && (_jsxs("div", { className: "rounded-lg p-4 space-y-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("input", { value: newName, onChange: (e) => setNewName(e.target.value), placeholder: "Report name", className: "w-full px-3 py-2 rounded-lg text-[12px]", style: {
                                    background: 'var(--c-bg-1)',
                                    color: 'var(--c-text-1)',
                                    border: '1px solid var(--c-border-2)',
                                } }), _jsx("textarea", { value: newQuery, onChange: (e) => setNewQuery(e.target.value), placeholder: "Report query (e.g. 'daily cost summary for all agents')", rows: 3, className: "w-full px-3 py-2 rounded-lg text-[12px] resize-none", style: {
                                    background: 'var(--c-bg-1)',
                                    color: 'var(--c-text-1)',
                                    border: '1px solid var(--c-border-2)',
                                } }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("select", { value: newSchedule, onChange: (e) => setNewSchedule(e.target.value), className: "text-[11px] px-2 py-1.5 rounded-lg", style: {
                                            background: 'var(--c-bg-1)',
                                            color: 'var(--c-text-2)',
                                            border: '1px solid var(--c-border-2)',
                                        }, children: SCHEDULE_OPTIONS.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) }), _jsxs("div", { className: "ml-auto flex gap-2", children: [_jsx("button", { onClick: () => setShowCreate(false), className: "px-3 py-1.5 rounded text-[11px]", style: { color: 'var(--c-text-3)' }, children: "Cancel" }), _jsx("button", { onClick: createReport, className: "px-3 py-1.5 rounded text-[11px] font-semibold", style: { background: 'var(--c-accent, #6366f1)', color: '#fff' }, children: "Create" })] })] })] })), !loading && reports.length > 0 && (_jsxs("div", { children: [_jsxs("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: ["Active Schedules (", reports.length, ")"] }), _jsx("div", { className: "space-y-1.5", children: reports.map((r) => (_jsxs("div", { className: "rounded-lg px-3 py-2 flex items-center justify-between", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { children: [_jsx("div", { className: "text-[12px] font-medium", style: { color: 'var(--c-text-1)' }, children: r.name }), _jsxs("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: [r.schedule, " \u00B7 Next:", ' ', r.next_run ? new Date(r.next_run).toLocaleString() : '—'] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => runNow(r.id), className: "px-2 py-1 rounded text-[10px] transition-colors", style: {
                                                        background: 'var(--c-bg-1)',
                                                        color: 'var(--c-text-3)',
                                                        border: '1px solid var(--c-border-2)',
                                                    }, onMouseEnter: (e) => {
                                                        e.currentTarget.style.borderColor = 'var(--c-accent)';
                                                    }, onMouseLeave: (e) => {
                                                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                                                    }, children: "Run Now" }), _jsx("button", { onClick: () => deleteReport(r.id), className: "px-2 py-1 rounded text-[10px] transition-colors", style: { color: '#f87171' }, onMouseEnter: (e) => {
                                                        e.currentTarget.style.background = 'rgba(248,113,113,0.1)';
                                                    }, onMouseLeave: (e) => {
                                                        e.currentTarget.style.background = 'transparent';
                                                    }, children: "Delete" })] })] }, r.id))) })] })), !loading && reports.length === 0 && !error && !showCreate && (_jsx("p", { className: "text-center text-[12px] py-12", style: { color: 'var(--c-text-4)' }, children: "No scheduled reports. Click \"+ New Report\" to create one." })), history.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Recent Runs" }), _jsx("div", { className: "space-y-1", children: history.slice(0, 10).map((h) => (_jsxs("div", { className: "rounded-lg px-3 py-1.5 flex items-center justify-between", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[11px]", style: { color: 'var(--c-text-3)' }, children: h.created_at?.slice(0, 16).replace('T', ' ') }), _jsx("span", { className: "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", style: {
                                                background: h.status === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                                                color: h.status === 'success' ? '#4ade80' : '#f87171',
                                            }, children: h.status })] }, h.id))) })] }))] })] }));
}
