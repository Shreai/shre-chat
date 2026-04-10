import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * UsageDashboard — customer-facing usage analytics.
 * Fetches from shre-meter via /api/usage-summary proxy.
 * Renders: total spend, requests, tokens, per-model & per-agent breakdowns, budget status.
 */
import { useState, useEffect } from 'react';
function fmtUsd(n) {
    if (n >= 1)
        return `$${n.toFixed(2)}`;
    if (n >= 0.01)
        return `$${n.toFixed(3)}`;
    return `$${n.toFixed(4)}`;
}
function fmtNumber(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
const BAR_COLORS = [
    '#818cf8',
    '#60a5fa',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#a78bfa',
    '#fb923c',
    '#38bdf8',
    '#4ade80',
    '#e879f9',
];
export function UsageDashboard({ standalone } = {}) {
    const [summary, setSummary] = useState(null);
    const [models, setModels] = useState([]);
    const [agents, setAgents] = useState([]);
    const [budget, setBudget] = useState(null);
    const [tokenAccuracy, setTokenAccuracy] = useState([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(1);
    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const [summaryRes, modelsRes, agentsRes, budgetRes, accuracyRes] = await Promise.allSettled([
                    fetch(`/api/usage-summary?days=${days}`).then((r) => (r.ok ? r.json() : null)),
                    fetch(`/api/costs/by-model?days=${days}`).then((r) => (r.ok ? r.json() : null)),
                    fetch(`/api/costs/by-agent?days=${days}`).then((r) => (r.ok ? r.json() : null)),
                    fetch('/api/costs/budget').then((r) => (r.ok ? r.json() : null)),
                    fetch(`/api/costs/token-accuracy?days=${days}`).then((r) => (r.ok ? r.json() : null)),
                ]);
                if (summaryRes.status === 'fulfilled' && summaryRes.value)
                    setSummary(summaryRes.value);
                if (modelsRes.status === 'fulfilled' &&
                    modelsRes.value &&
                    typeof modelsRes.value === 'object') {
                    const raw = modelsRes.value;
                    const arr = Array.isArray(raw) ? raw : Array.isArray(raw.models) ? raw.models : [];
                    setModels(arr.filter((m) => m && typeof m.model === 'string').map((m) => ({
                        ...m,
                        local: m.local ?? (m.provider === 'ollama' || m.provider === 'ollama-local'),
                    })));
                }
                if (agentsRes.status === 'fulfilled' &&
                    agentsRes.value &&
                    typeof agentsRes.value === 'object') {
                    const raw = agentsRes.value;
                    const arr = Array.isArray(raw) ? raw : Array.isArray(raw.agents) ? raw.agents : [];
                    const filtered = arr.filter((a) => a && typeof a.agentId === 'string');
                    // Compute pct client-side if shre-meter doesn't provide it
                    const totalCost = filtered.reduce((s, a) => s + (a.costUsd || 0), 0);
                    setAgents(filtered.map((a) => ({
                        ...a,
                        agentName: a.agentName || a.agentId,
                        tokens: a.tokens || a.totalTokens || 0,
                        pct: totalCost > 0 ? ((a.costUsd || 0) / totalCost) * 100 : 0,
                    })));
                }
                if (budgetRes.status === 'fulfilled' && budgetRes.value)
                    setBudget(budgetRes.value);
                if (accuracyRes.status === 'fulfilled' && accuracyRes.value?.breakdown) {
                    setTokenAccuracy(accuracyRes.value.breakdown);
                }
            }
            catch {
                // silent — individual sections just won't render
            }
            finally {
                setLoading(false);
            }
        }
        load();
    }, [days]);
    if (loading) {
        return (_jsx("div", { className: "py-8 flex items-center justify-center", style: { color: 'var(--c-text-4)' }, children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" }) }));
    }
    return (_jsxs("div", { className: standalone ? 'flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6' : 'space-y-5', children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-medium", style: { color: 'var(--c-text-2)' }, children: "Usage Breakdown" }), _jsx("div", { className: "flex gap-1", children: [1, 7, 30, 90].map((d) => (_jsx("button", { onClick: () => setDays(d), className: "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors", style: {
                                background: days === d ? 'var(--c-accent)' : 'var(--c-bg-3)',
                                color: days === d ? '#fff' : 'var(--c-text-3)',
                            }, children: d === 1 ? 'Today' : `${d}d` }, d))) })] }), standalone && summary && (_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(MiniStat, { label: "Total Spend", value: fmtUsd(summary.totalCostUsd) }), _jsx(MiniStat, { label: "Requests", value: fmtNumber(summary.totalRequests) }), _jsx(MiniStat, { label: "Tokens", value: fmtNumber(summary.totalTokens) })] })), budget && budget.limitUsd > 0 && (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-xs font-medium", style: { color: 'var(--c-text-3)' }, children: "Budget" }), _jsxs("span", { className: "text-xs", style: {
                                    color: budget.pctUsed > 90
                                        ? '#f87171'
                                        : budget.pctUsed > 70
                                            ? '#fb923c'
                                            : 'var(--c-text-4)',
                                }, children: [fmtUsd(budget.usedUsd), " / ", fmtUsd(budget.limitUsd)] })] }), _jsx("div", { className: "h-2 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3)' }, children: _jsx("div", { className: "h-full rounded-full transition-all", style: {
                                width: `${Math.min(100, budget.pctUsed)}%`,
                                background: budget.pctUsed > 90
                                    ? '#ef4444'
                                    : budget.pctUsed > 70
                                        ? '#f59e0b'
                                        : 'var(--c-accent)',
                            } }) }), _jsxs("p", { className: "text-[10px] mt-1.5", style: { color: 'var(--c-text-5)' }, children: [fmtUsd(budget.remainingUsd), " remaining (", budget.period, ")"] })] })), models.length > 0 && (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("h4", { className: "text-xs font-medium mb-3", style: { color: 'var(--c-text-3)' }, children: "By Model" }), _jsx("div", { className: "space-y-2.5", children: models.slice(0, 8).map((m, i) => {
                            const maxPct = Math.max(...models.map((x) => x.pct || 0), 1);
                            const barWidth = ((m.pct || 0) / maxPct) * 100;
                            return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-[11px]", children: [_jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [_jsx("span", { className: "w-2 h-2 rounded-full flex-shrink-0", style: { background: BAR_COLORS[i % BAR_COLORS.length] } }), _jsx("span", { className: "truncate", style: { color: 'var(--c-text-2)' }, children: m.model }), m.local && (_jsx("span", { className: "px-1 py-px rounded text-[9px]", style: { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }, children: "local" }))] }), _jsxs("div", { className: "flex items-center gap-3 flex-shrink-0", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { children: [fmtNumber(m.requests), " req"] }), _jsx("span", { className: "font-medium", style: { color: 'var(--c-text-2)' }, children: fmtUsd(m.costUsd) })] })] }), _jsx("div", { className: "h-1 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3)' }, children: _jsx("div", { className: "h-full rounded-full", style: {
                                                width: `${barWidth}%`,
                                                background: BAR_COLORS[i % BAR_COLORS.length],
                                            } }) })] }, m.model));
                        }) })] })), agents.length > 0 && (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("h4", { className: "text-xs font-medium mb-3", style: { color: 'var(--c-text-3)' }, children: "By Agent" }), _jsx("div", { className: "space-y-2.5", children: agents.slice(0, 8).map((a, i) => {
                            const maxPct = Math.max(...agents.map((x) => x.pct || 0), 1);
                            const barWidth = ((a.pct || 0) / maxPct) * 100;
                            return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-[11px]", children: [_jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [_jsx("span", { className: "w-2 h-2 rounded-full flex-shrink-0", style: { background: BAR_COLORS[(i + 3) % BAR_COLORS.length] } }), _jsx("span", { className: "truncate", style: { color: 'var(--c-text-2)' }, children: a.agentName || a.agentId })] }), _jsxs("div", { className: "flex items-center gap-3 flex-shrink-0", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { children: [fmtNumber(a.requests), " req"] }), _jsx("span", { className: "font-medium", style: { color: 'var(--c-text-2)' }, children: fmtUsd(a.costUsd) })] })] }), _jsx("div", { className: "h-1 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3)' }, children: _jsx("div", { className: "h-full rounded-full", style: {
                                                width: `${barWidth}%`,
                                                background: BAR_COLORS[(i + 3) % BAR_COLORS.length],
                                            } }) })] }, a.agentId));
                        }) })] })), summary && (summary.localPercent > 0 || summary.cloudPercent > 0) && (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("h4", { className: "text-xs font-medium mb-2", style: { color: 'var(--c-text-3)' }, children: "Local vs Cloud" }), _jsxs("div", { className: "h-3 rounded-full overflow-hidden flex", style: { background: 'var(--c-bg-3)' }, children: [summary.localPercent > 0 && (_jsx("div", { className: "h-full", style: { width: `${summary.localPercent}%`, background: '#34d399' }, title: `Local: ${summary.localPercent.toFixed(1)}%` })), summary.cloudPercent > 0 && (_jsx("div", { className: "h-full", style: { width: `${summary.cloudPercent}%`, background: '#818cf8' }, title: `Cloud: ${summary.cloudPercent.toFixed(1)}%` }))] }), _jsxs("div", { className: "flex items-center gap-4 mt-2 text-[10px]", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "w-2 h-2 rounded-full", style: { background: '#34d399' } }), "Local ", summary.localPercent.toFixed(0), "%"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "w-2 h-2 rounded-full", style: { background: '#818cf8' } }), "Cloud ", summary.cloudPercent.toFixed(0), "%"] })] })] })), tokenAccuracy.length > 0 && (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("h4", { className: "text-xs font-medium mb-3", style: { color: 'var(--c-text-3)' }, children: "Token Tracking" }), _jsx("div", { className: "space-y-2", children: tokenAccuracy.map((row) => {
                            const totalReqs = tokenAccuracy.reduce((s, r) => s + r.requests, 0);
                            const pct = totalReqs > 0 ? (row.requests / totalReqs) * 100 : 0;
                            const label = row.token_source === 'actual'
                                ? 'Provider'
                                : row.token_source === 'metered'
                                    ? 'Metered'
                                    : 'Estimated';
                            const color = row.token_source === 'actual'
                                ? '#34d399'
                                : row.token_source === 'metered'
                                    ? '#818cf8'
                                    : '#fb923c';
                            return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-[11px]", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "w-2 h-2 rounded-full flex-shrink-0", style: { background: color } }), _jsx("span", { style: { color: 'var(--c-text-2)' }, children: label })] }), _jsxs("div", { className: "flex items-center gap-3", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { children: [fmtNumber(row.requests), " req"] }), _jsxs("span", { children: [fmtNumber(row.total_tokens), " tok"] }), _jsx("span", { className: "font-medium", style: { color: 'var(--c-text-2)' }, children: fmtUsd(row.cost_usd) })] })] }), _jsx("div", { className: "h-1 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3)' }, children: _jsx("div", { className: "h-full rounded-full", style: { width: `${pct}%`, background: color } }) })] }, row.token_source));
                        }) }), _jsx("p", { className: "text-[9px] mt-2", style: { color: 'var(--c-text-5)' }, children: "Provider = API-reported | Metered = boundary tokenizer | Estimated = char/4 fallback" })] })), !summary && models.length === 0 && agents.length === 0 && (_jsx("div", { className: "py-12 text-center", style: { color: 'var(--c-text-4)' }, children: _jsx("p", { className: "text-sm", children: "No usage data available for this period" }) }))] }));
}
function MiniStat({ label, value }) {
    return (_jsxs("div", { className: "rounded-xl p-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider", style: { color: 'var(--c-text-4)' }, children: label }), _jsx("p", { className: "text-base font-semibold mt-0.5", style: { color: 'var(--c-text-1)' }, children: value })] }));
}
