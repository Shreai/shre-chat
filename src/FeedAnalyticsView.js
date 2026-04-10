import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useApp } from './store';
import { SBadge } from '@shre/ui-kit';
import ChartRenderer from './components/ChartRenderer';
import { DateRangeSelector } from './components/DateRangeSelector';
import { ExportButton } from './components/ExportButton';
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
const SEVERITY_COLORS = {
    critical: '#f87171',
    warning: '#f59e0b',
    info: '#60a5fa',
    success: '#4ade80',
};
export function FeedAnalyticsView() {
    const { actions } = useApp();
    const [range, setRange] = useState({ from: daysAgo(7), to: today() });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [severityFilter, setSeverityFilter] = useState(new Set(['critical', 'warning', 'info']));
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            const result = await fetchApi(`/api/feed/analytics?since=${range.from}&until=${range.to}`);
            if (cancelled)
                return;
            if (!result)
                setError('Could not reach feed analytics. Is shre-feed running?');
            setData(result);
            setLoading(false);
        }
        load();
        const iv = setInterval(load, 60_000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [range]);
    const timelineChart = data?.timeline.length
        ? {
            type: 'line',
            labels: data.timeline.map((t) => t.day.slice(5)),
            datasets: [{ label: 'Events', data: data.timeline.map((t) => t.count), color: '#60a5fa' }],
            options: { showLegend: true },
        }
        : null;
    const categoryChart = data?.byCategory.length
        ? {
            type: 'pie',
            labels: data.byCategory.map((c) => c.category),
            datasets: [{ label: 'Events', data: data.byCategory.map((c) => c.count) }],
            options: { showLegend: true },
        }
        : null;
    const agentChart = data?.byAgent.length
        ? {
            type: 'bar',
            labels: data.byAgent.slice(0, 10).map((a) => a.agent),
            datasets: [
                {
                    label: 'Events',
                    data: data.byAgent.slice(0, 10).map((a) => a.count),
                    color: '#a78bfa',
                },
            ],
            options: { showValues: true },
        }
        : null;
    const exportData = data?.byAgent.map((a) => ({ agent: a.agent, events: a.count })) ?? [];
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2 justify-between", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "20", x2: "18", y2: "10" }), _jsx("line", { x1: "12", y1: "20", x2: "12", y2: "4" }), _jsx("line", { x1: "6", y1: "20", x2: "6", y2: "14" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Feed Analytics" }), _jsx("span", { className: "text-[10px] font-mono", style: { color: 'var(--c-text-5)' }, children: "via shre-feed" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(DateRangeSelector, { value: range, onChange: setRange }), _jsx(ExportButton, { data: exportData, filename: "feed-analytics" })] })] }), _jsxs("div", { className: "px-4 py-2 flex items-center gap-2", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "Severity:" }), ['critical', 'warning', 'info'].map((s) => (_jsxs("button", { onClick: () => {
                            const next = new Set(severityFilter);
                            next.has(s) ? next.delete(s) : next.add(s);
                            setSeverityFilter(next);
                        }, className: "px-2 py-0.5 rounded text-[10px] font-medium capitalize", style: {
                            background: severityFilter.has(s)
                                ? (SEVERITY_COLORS[s] || '#60a5fa') + '22'
                                : 'var(--c-bg-2)',
                            color: severityFilter.has(s) ? SEVERITY_COLORS[s] || '#60a5fa' : 'var(--c-text-4)',
                            border: `1px solid ${severityFilter.has(s) ? (SEVERITY_COLORS[s] || '#60a5fa') + '44' : 'var(--c-border-2)'}`,
                        }, children: [s, " ", data?.bySeverity.find((x) => x.severity === s)?.count ?? 0] }, s))), data && (_jsxs("span", { className: "ml-auto text-[11px] font-bold", style: { color: 'var(--c-text-2)' }, children: [data.total.toLocaleString(), " total events"] }))] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), !loading && data && (_jsxs(_Fragment, { children: [timelineChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Event Volume" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: timelineChart, height: 180 }) })] })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [categoryChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "By Category" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: categoryChart, height: 200 }) })] })), agentChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Top Agents" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: agentChart, height: 200 }) })] }))] }), data.byAgent.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Agent Breakdown" }), _jsx("div", { className: "space-y-1", children: data.byAgent.slice(0, 15).map((a) => (_jsxs("button", { onClick: () => actions.setView('feed'), className: "w-full flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-border-2)';
                                            }, children: [_jsx("span", { className: "text-[11px]", style: { color: 'var(--c-text-2)' }, children: a.agent }), _jsx("span", { className: "text-[11px] font-bold", style: { color: 'var(--c-text-3)' }, children: a.count })] }, a.agent))) })] }))] }))] })] }));
}
