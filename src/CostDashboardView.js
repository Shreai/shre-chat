import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import ChartRenderer from './components/ChartRenderer';
import { DateRangeSelector } from './components/DateRangeSelector';
import { ExportButton } from './components/ExportButton';
function fmtUsd(n) {
    if (n >= 1)
        return `$${n.toFixed(2)}`;
    if (n >= 0.01)
        return `$${n.toFixed(3)}`;
    if (n === 0)
        return '$0.00';
    return `$${n.toFixed(4)}`;
}
function fmtNum(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
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
function StatCard({ label, value, accent }) {
    return (_jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: label }), _jsx("div", { className: "text-lg font-bold", style: { color: accent || 'var(--c-text-1)' }, children: value })] }));
}
export function CostDashboardView() {
    const [range, setRange] = useState({ from: daysAgo(30), to: today() });
    const [summary, setSummary] = useState(null);
    const [byModel, setByModel] = useState([]);
    const [byAgent, setByAgent] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            const qs = `from=${range.from}&to=${range.to}`;
            const [s, m, a, t, b] = await Promise.all([
                fetchApi(`/api/costs/summary?${qs}`),
                fetchApi(`/api/costs/by-model?${qs}`),
                fetchApi(`/api/costs/by-agent?${qs}`),
                fetchApi(`/api/costs/timeline?${qs}&granularity=day`),
                fetchApi(`/api/budgets/tenants`),
            ]);
            if (cancelled)
                return;
            if (!s && !m && !a)
                setError('Could not reach cost APIs. Is shre-meter running?');
            setSummary(s);
            setByModel(m ?? []);
            // Normalize: shre-meter returns agentId, UI expects agent
            setByAgent((a ?? []).map((x) => ({
                agent: x.agent || x.agentId || 'unknown',
                requests: x.requests || 0,
                costUsd: x.costUsd || 0,
                savingsUsd: x.savingsUsd || 0,
            })));
            setTimeline(t ?? []);
            setBudgets(b ?? []);
            setLoading(false);
        }
        load();
        const iv = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [range]);
    const timelineChart = timeline.length
        ? {
            type: 'line',
            labels: timeline.map((t) => t.bucket.slice(5, 10)),
            datasets: [{ label: 'Cost ($)', data: timeline.map((t) => t.costUsd), color: '#60a5fa' }],
            options: { showLegend: true, currency: true },
        }
        : null;
    const modelChart = byModel.length
        ? {
            type: 'pie',
            labels: byModel.map((m) => m.model),
            datasets: [{ label: 'Cost', data: byModel.map((m) => m.costUsd) }],
            options: { showLegend: true, currency: true },
        }
        : null;
    const agentChart = byAgent.length
        ? {
            type: 'bar',
            labels: byAgent.map((a) => a.agent),
            datasets: [{ label: 'Cost ($)', data: byAgent.map((a) => a.costUsd), color: '#f59e0b' }],
            options: { showValues: true, currency: true },
        }
        : null;
    const exportData = byAgent.map((a) => ({
        agent: a.agent,
        requests: a.requests,
        costUsd: a.costUsd,
        savingsUsd: a.savingsUsd,
    }));
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2 justify-between", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "2", y: "5", width: "20", height: "14", rx: "2" }), _jsx("line", { x1: "2", y1: "10", x2: "22", y2: "10" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Cost Dashboard" }), _jsx("span", { className: "text-[10px] font-mono", style: { color: 'var(--c-text-5)' }, children: "via shre-meter" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(DateRangeSelector, { value: range, onChange: setRange }), _jsx(ExportButton, { data: exportData, filename: "cost-report" })] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), !loading && summary && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2", children: [_jsx(StatCard, { label: "Total Spend", value: fmtUsd(summary.totalCostUsd) }), _jsx(StatCard, { label: "Savings (Local)", value: fmtUsd(summary.totalSavingsUsd), accent: "#4ade80" }), _jsx(StatCard, { label: "Requests", value: fmtNum(summary.totalRequests) }), _jsx(StatCard, { label: "Avg / Request", value: fmtUsd(summary.avgCostPerRequest) }), _jsx(StatCard, { label: "Local %", value: `${summary.localPercent}%`, accent: "#4ade80" }), _jsx(StatCard, { label: "Tokens", value: fmtNum(summary.totalTokens) })] }), timelineChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Spend Timeline" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: timelineChart, height: 180 }) })] })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [modelChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "By Model" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: modelChart, height: 200 }) })] })), agentChart && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "By Agent" }), _jsx("div", { className: "rounded-lg p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: _jsx(ChartRenderer, { data: agentChart, height: 200 }) })] }))] }), budgets.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Budget Status" }), _jsx("div", { className: "space-y-1.5", children: budgets.map((b) => {
                                            const dailyPct = b.dailyLimitUsd > 0
                                                ? Math.min(100, (b.spentTodayUsd / b.dailyLimitUsd) * 100)
                                                : 0;
                                            const weeklyPct = b.weeklyLimitUsd > 0
                                                ? Math.min(100, (b.spentWeekUsd / b.weeklyLimitUsd) * 100)
                                                : 0;
                                            return (_jsxs("div", { className: "rounded-lg px-3 py-2", style: {
                                                    background: 'var(--c-bg-2)',
                                                    border: '1px solid var(--c-border-2)',
                                                }, children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: "text-[11px] font-medium", style: { color: 'var(--c-text-2)' }, children: b.agentId }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: [fmtUsd(b.spentTodayUsd), " / ", fmtUsd(b.dailyLimitUsd), " daily"] })] }), _jsx("div", { className: "h-1.5 rounded-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: _jsx("div", { className: "h-full rounded-full transition-all", style: {
                                                                width: `${dailyPct}%`,
                                                                background: dailyPct > 90 ? '#f87171' : dailyPct > 70 ? '#f59e0b' : '#4ade80',
                                                            } }) })] }, b.agentId));
                                        }) })] }))] }))] })] }));
}
