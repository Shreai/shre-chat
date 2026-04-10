import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import ports from '../../ports.json';
const ROUTER_BASE = `https://localhost:${ports.services['shre-router'].port}`;
async function fetchJson(path) {
    try {
        const r = await fetch(`${ROUTER_BASE}${path}`);
        if (!r.ok)
            return null;
        return r.json();
    }
    catch {
        return null;
    }
}
function fmtUsd(n) {
    if (n >= 1)
        return `$${n.toFixed(2)}`;
    if (n >= 0.01)
        return `$${n.toFixed(3)}`;
    if (n === 0)
        return '$0.00';
    return `$${n.toFixed(4)}`;
}
function fmtTokens(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
function fmtMs(n) {
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}s`;
    return `${Math.round(n)}ms`;
}
export function SpendView() {
    const [summary, setSummary] = useState(null);
    const [byModel, setByModel] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            const [s, m, p] = await Promise.all([
                fetchJson('/v1/costs/summary'),
                fetchJson('/v1/costs/by-model'),
                fetchJson('/v1/provider-status'),
            ]);
            if (cancelled)
                return;
            if (!s && !m && !p) {
                setError('Could not reach shre-router. Is it running?');
            }
            setSummary(s);
            setByModel(m ?? []);
            setProviders(p ?? []);
            setLoading(false);
        }
        load();
        const interval = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "12", y1: "1", x2: "12", y2: "23" }), _jsx("path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Provider Spend" }), _jsx("span", { className: "text-[10px] font-mono", style: { color: 'var(--c-text-5)' }, children: "via shre-router" })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), !loading && summary && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(SummaryCard, { label: "Total Spend", value: fmtUsd(summary.totalCostUsd) }), _jsx(SummaryCard, { label: "Savings (Local)", value: fmtUsd(summary.totalSavingsUsd), accent: "#4ade80" }), _jsx(SummaryCard, { label: "Requests", value: String(summary.totalRequests) }), _jsx(SummaryCard, { label: "Avg / Request", value: fmtUsd(summary.avgCostPerRequest) }), _jsx(SummaryCard, { label: "Local %", value: `${summary.localPercent}%`, accent: "#4ade80" }), _jsx(SummaryCard, { label: "Tokens", value: fmtTokens(summary.totalTokens) })] }), providers.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Providers" }), _jsx("div", { className: "space-y-1.5", children: providers.map((p) => (_jsxs("div", { className: "rounded-lg px-3 py-2.5 flex items-center justify-between", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx(SBadge, { variant: p.status === 'active'
                                                                ? 'success'
                                                                : p.status === 'degraded'
                                                                    ? 'warning'
                                                                    : p.status === 'down'
                                                                        ? 'destructive'
                                                                        : 'secondary', className: "h-2 w-2 p-0 shrink-0" }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-xs font-medium capitalize", style: { color: 'var(--c-text-1)' }, children: p.provider }), _jsxs("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: [p.keys.healthy, "/", p.keys.total, " keys healthy", p.keys.inCooldown > 0 && ` · ${p.keys.inCooldown} cooling`] })] })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsx("div", { className: "text-xs font-mono font-medium", style: { color: 'var(--c-text-1)' }, children: fmtUsd(p.spendUsd) }), _jsx(SBadge, { variant: p.status === 'active'
                                                                ? 'success'
                                                                : p.status === 'degraded'
                                                                    ? 'warning'
                                                                    : p.status === 'down'
                                                                        ? 'destructive'
                                                                        : 'secondary', className: "text-[9px] px-1.5 py-0 h-4", children: p.status })] })] }, p.provider))) })] })), byModel.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "By Model" }), _jsx("div", { className: "space-y-1", children: byModel.map((m) => (_jsxs("div", { className: "rounded-lg px-3 py-2 flex items-center justify-between", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[11px] font-medium truncate", style: { color: 'var(--c-text-1)' }, children: m.model }), _jsxs("div", { className: "text-[10px] flex gap-2", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { children: [m.requests, " req"] }), _jsxs("span", { children: [fmtTokens(m.totalTokens), " tok"] }), _jsx("span", { children: fmtMs(m.avgLatencyMs) }), m.local && _jsx("span", { style: { color: 'var(--c-success-soft)' }, children: "local" })] })] }), _jsxs("div", { className: "text-right shrink-0 ml-2", children: [_jsx("div", { className: "text-xs font-mono font-medium", style: { color: 'var(--c-text-1)' }, children: fmtUsd(m.costUsd) }), _jsxs("div", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: [m.pct, "%"] })] })] }, m.model))) })] })), _jsxs("div", { className: "text-[10px] pt-2", style: { color: 'var(--c-text-5)' }, children: ["Top model: ", summary.topModel, " \u00B7 Auto-refreshes every 30s"] })] }))] })] }));
}
function SummaryCard({ label, value, accent }) {
    return (_jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] mb-0.5", style: { color: 'var(--c-text-5)' }, children: label }), _jsx("div", { className: "text-base font-semibold font-mono", style: { color: accent || 'var(--c-text-1)' }, children: value })] }));
}
