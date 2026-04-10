import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * BillingView — self-serve billing management panel.
 * Shows current plan, usage summary, billing portal link, and transaction history.
 */
import { useState, useEffect } from 'react';
import { useApp } from './store';
import { UsageDashboard } from './components/UsageDashboard';
const PLAN_DISPLAY = {
    free: { name: 'Free', color: '#94a3b8', icon: 'F' },
    starter: { name: 'Starter', color: '#60a5fa', icon: 'S' },
    pro: { name: 'Pro', color: '#a78bfa', icon: 'P' },
    business: { name: 'Business', color: '#f59e0b', icon: 'B' },
    enterprise: { name: 'Enterprise', color: '#10b981', icon: 'E' },
};
function fmtUsd(n) {
    if (n >= 1)
        return `$${n.toFixed(2)}`;
    if (n >= 0.01)
        return `$${n.toFixed(3)}`;
    return `$${n.toFixed(4)}`;
}
function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
    catch {
        return iso;
    }
}
function fmtNumber(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
export function BillingView() {
    const { actions } = useApp();
    const [billing, setBilling] = useState(null);
    const [usage, setUsage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState(null);
    const workspaceId = sessionStorage.getItem('shre-workspace-id');
    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const [billingRes, usageRes] = await Promise.allSettled([
                    fetch(`/api/trial-status?workspaceId=${encodeURIComponent(workspaceId || '')}`).then((r) => (r.ok ? r.json() : null)),
                    fetch('/api/usage-summary?days=30').then((r) => (r.ok ? r.json() : null)),
                ]);
                if (billingRes.status === 'fulfilled' && billingRes.value) {
                    setBilling({
                        plan: billingRes.value.plan || 'free',
                        status: billingRes.value.expired
                            ? 'expired'
                            : billingRes.value.active
                                ? 'trialing'
                                : 'active',
                        currentPeriodEnd: billingRes.value.trialEnd || '',
                        cancelAtPeriodEnd: false,
                    });
                }
                if (usageRes.status === 'fulfilled' && usageRes.value) {
                    setUsage(usageRes.value);
                }
            }
            catch {
                setError('Failed to load billing information');
            }
            finally {
                setLoading(false);
            }
        }
        load();
    }, [workspaceId]);
    async function openBillingPortal() {
        setPortalLoading(true);
        try {
            const res = await fetch('/api/billing-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId }),
            });
            if (!res.ok)
                throw new Error('Portal failed');
            const data = await res.json();
            if (data.url)
                window.location.href = data.url;
        }
        catch {
            setError('Failed to open billing portal');
        }
        finally {
            setPortalLoading(false);
        }
    }
    const planMeta = PLAN_DISPLAY[billing?.plan || 'free'] || PLAN_DISPLAY.free;
    if (loading) {
        return (_jsx("div", { className: "flex-1 flex items-center justify-center", style: { color: 'var(--c-text-4)' }, children: _jsxs("div", { className: "text-center space-y-2", children: [_jsx("div", { className: "animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full mx-auto" }), _jsx("p", { className: "text-sm", children: "Loading billing..." })] }) }));
    }
    return (_jsxs("div", { className: "flex-1 overflow-y-auto", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-6 pt-6 pb-4 flex items-center justify-between", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => actions.setView('chat'), className: "p-1.5 rounded-lg transition-colors", style: { color: 'var(--c-text-3)' }, children: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "15 18 9 12 15 6" }) }) }), _jsx("h1", { className: "text-lg font-semibold", style: { color: 'var(--c-text-1)' }, children: "Billing" })] }), _jsx("button", { onClick: openBillingPortal, disabled: portalLoading, className: "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", style: { background: 'var(--c-accent)', color: '#fff', opacity: portalLoading ? 0.6 : 1 }, children: portalLoading ? 'Opening...' : 'Manage Billing' })] }), _jsxs("div", { className: "p-6 space-y-6 max-w-4xl mx-auto", children: [error && (_jsx("div", { className: "px-4 py-2.5 rounded-lg text-sm", style: {
                            background: 'rgba(239,68,68,0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.25)',
                        }, children: error })), _jsx("div", { className: "rounded-xl p-5", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold", style: { background: `${planMeta.color}20`, color: planMeta.color }, children: planMeta.icon }), _jsxs("div", { children: [_jsxs("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: [planMeta.name, " Plan"] }), _jsx("p", { className: "text-xs mt-0.5", style: { color: 'var(--c-text-4)' }, children: billing?.status === 'trialing' && billing.currentPeriodEnd
                                                        ? `Trial ends ${fmtDate(billing.currentPeriodEnd)}`
                                                        : billing?.status === 'expired'
                                                            ? 'Trial expired'
                                                            : billing?.currentPeriodEnd
                                                                ? `Renews ${fmtDate(billing.currentPeriodEnd)}`
                                                                : 'Active' })] })] }), billing?.status === 'trialing' || billing?.status === 'expired' ? (_jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-medium", style: {
                                        background: billing.status === 'expired' ? 'rgba(239,68,68,0.12)' : 'rgba(249,115,22,0.12)',
                                        color: billing.status === 'expired' ? '#f87171' : '#fb923c',
                                    }, children: billing.status === 'expired' ? 'Expired' : 'Trial' })) : (_jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-medium", style: { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }, children: "Active" }))] }) }), usage && (_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(StatCard, { label: "Total Spend", value: fmtUsd(usage.totalCostUsd), sub: `${fmtDate(usage.periodFrom)} - ${fmtDate(usage.periodTo)}` }), _jsx(StatCard, { label: "Requests", value: fmtNumber(usage.totalRequests), sub: "Last 30 days" }), _jsx(StatCard, { label: "Tokens Used", value: fmtNumber(usage.totalTokens), sub: "Last 30 days" })] })), _jsx(UsageDashboard, {})] })] }));
}
function StatCard({ label, value, sub }) {
    return (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [_jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider", style: { color: 'var(--c-text-4)' }, children: label }), _jsx("p", { className: "text-lg font-semibold mt-1", style: { color: 'var(--c-text-1)' }, children: value }), _jsx("p", { className: "text-[10px] mt-1", style: { color: 'var(--c-text-5)' }, children: sub })] }));
}
