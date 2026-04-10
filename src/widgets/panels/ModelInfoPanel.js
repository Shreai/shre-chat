import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from 'react';
/**
 * Reads model, cost, and token info from sessionStorage.
 * shre-chat's router-client.ts stores routing metadata per message;
 * this panel aggregates the current session totals.
 */
function getSessionStats() {
    try {
        const raw = sessionStorage.getItem('shre-chat.session-stats');
        if (raw) {
            const d = JSON.parse(raw);
            return {
                model: d.model ?? 'auto',
                cost: typeof d.cost === 'number' ? d.cost : 0,
                tokens: typeof d.tokens === 'number' ? d.tokens : 0,
                messages: typeof d.messages === 'number' ? d.messages : 0,
            };
        }
    }
    catch { /* ignore */ }
    return { model: 'auto', cost: 0, tokens: 0, messages: 0 };
}
function formatCost(cents) {
    if (cents === 0)
        return '$0.00';
    return `$${(cents / 100).toFixed(4)}`;
}
function formatTokens(n) {
    if (n === 0)
        return '0';
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}
export default function ModelInfoPanel({ size }) {
    const stats = useMemo(getSessionStats, []);
    return (_jsxs("div", { className: "space-y-2", children: [_jsx("span", { className: "text-[13px] font-semibold text-[var(--c-text-1)]", children: "Model & Cost" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: "Model" }), _jsx("p", { className: "text-[13px] font-medium text-[var(--c-text-1)] truncate", children: stats.model })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: "Session Cost" }), _jsx("p", { className: "text-[22px] font-medium tabular-nums text-[var(--c-accent)]", children: formatCost(stats.cost) })] }), size === 'expanded' && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: "Tokens" }), _jsx("p", { className: "text-[17px] font-medium tabular-nums text-[var(--c-text-1)]", children: formatTokens(stats.tokens) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: "Messages" }), _jsx("p", { className: "text-[17px] font-medium tabular-nums text-[var(--c-text-1)]", children: stats.messages })] })] }))] })] }));
}
