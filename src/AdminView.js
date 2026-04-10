import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import { mib007Link } from './chat-utils';
function fmtUsd(n) {
    if (n >= 1)
        return `$${n.toFixed(2)}`;
    if (n === 0)
        return '$0.00';
    return `$${n.toFixed(4)}`;
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
export function AdminView() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const data = await fetchApi('/api/marketplace/agents');
            if (cancelled)
                return;
            if (!data)
                setError('Could not load admin data. Is shre-hr running?');
            setAgents(data ?? []);
            setLoading(false);
        }
        load();
        const iv = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, []);
    const totalSpend = agents.reduce((s, a) => s + (a.costs?.totalCostUsd ?? 0), 0);
    const totalTasks = agents.reduce((s, a) => s + (a.stats?.totalTasks ?? 0), 0);
    const avgQuality = agents.length
        ? agents.reduce((s, a) => s + (a.stats?.successRate ?? 0), 0) / agents.length
        : 0;
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-2 justify-between", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Admin Overview" })] }), _jsx("button", { onClick: () => window.open(mib007Link('admin'), '_blank'), className: "px-2 py-1 rounded text-[11px] font-medium transition-colors", style: {
                            background: 'var(--c-bg-2)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                        }, children: "Full Admin \u2192" })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-center rounded-lg px-4 py-3 text-sm", children: error })), !loading && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: [_jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: "Active Agents" }), _jsx("div", { className: "text-lg font-bold", style: { color: 'var(--c-text-1)' }, children: agents.length })] }), _jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: "Total Spend" }), _jsx("div", { className: "text-lg font-bold", style: { color: 'var(--c-text-1)' }, children: fmtUsd(totalSpend) })] }), _jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: "Total Tasks" }), _jsx("div", { className: "text-lg font-bold", style: { color: 'var(--c-text-1)' }, children: totalTasks })] }), _jsxs("div", { className: "rounded-lg px-3 py-2.5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: "Avg Quality" }), _jsxs("div", { className: "text-lg font-bold", style: { color: avgQuality > 80 ? '#4ade80' : '#f59e0b' }, children: [avgQuality.toFixed(0), "%"] })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-wider mb-2", style: { color: 'var(--c-text-5)' }, children: "Agent Roster" }), _jsx("div", { className: "rounded-lg overflow-hidden", style: { border: '1px solid var(--c-border-2)' }, children: _jsxs("table", { className: "w-full text-[11px]", children: [_jsx("thead", { children: _jsxs("tr", { style: { background: 'var(--c-bg-2)' }, children: [_jsx("th", { className: "text-left px-3 py-2 font-semibold", style: { color: 'var(--c-text-4)' }, children: "Agent" }), _jsx("th", { className: "text-right px-3 py-2 font-semibold", style: { color: 'var(--c-text-4)' }, children: "Tasks" }), _jsx("th", { className: "text-right px-3 py-2 font-semibold", style: { color: 'var(--c-text-4)' }, children: "Quality" }), _jsx("th", { className: "text-right px-3 py-2 font-semibold", style: { color: 'var(--c-text-4)' }, children: "Cost" }), _jsx("th", { className: "text-center px-3 py-2 font-semibold", style: { color: 'var(--c-text-4)' }, children: "Status" })] }) }), _jsx("tbody", { children: agents.map((a, i) => (_jsxs("tr", { style: { background: i % 2 === 0 ? 'var(--c-bg-1)' : 'var(--c-bg-2)' }, children: [_jsxs("td", { className: "px-3 py-2 flex items-center gap-1.5", children: [_jsx("span", { children: a.identity?.emoji || '🤖' }), _jsx("span", { style: { color: 'var(--c-text-2)' }, children: a.name })] }), _jsx("td", { className: "text-right px-3 py-2", style: { color: 'var(--c-text-3)' }, children: a.stats?.totalTasks ?? 0 }), _jsxs("td", { className: "text-right px-3 py-2", style: {
                                                                    color: (a.stats?.successRate ?? 0) > 80 ? '#4ade80' : '#f59e0b',
                                                                }, children: [(a.stats?.successRate ?? 0).toFixed(0), "%"] }), _jsx("td", { className: "text-right px-3 py-2", style: { color: 'var(--c-text-3)' }, children: fmtUsd(a.costs?.totalCostUsd ?? 0) }), _jsx("td", { className: "text-center px-3 py-2", children: _jsx("span", { className: "inline-block w-2 h-2 rounded-full", style: { background: a.status === 'active' ? '#4ade80' : '#a1a1aa' } }) })] }, a.name))) })] }) })] })] }))] })] }));
}
