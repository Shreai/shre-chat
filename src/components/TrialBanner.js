import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Trial status banner — shows trial countdown and upgrade prompt.
 * Fetches from shre-stripe via /api/trial-status proxy.
 */
import { useState, useEffect } from 'react';
const PLANS = [
    { id: 'starter', name: 'Starter', price: '$29/mo', desc: '3 agents, 10k requests' },
    { id: 'pro', name: 'Pro', price: '$99/mo', desc: '10 agents, 100k requests' },
    { id: 'business', name: 'Business', price: '$299/mo', desc: 'Unlimited agents' },
];
export function TrialBanner() {
    const [trial, setTrial] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [upgrading, setUpgrading] = useState(false);
    const [showPlans, setShowPlans] = useState(false);
    const [error, setError] = useState(null);
    const workspaceId = sessionStorage.getItem('shre-workspace-id');
    useEffect(() => {
        if (!workspaceId)
            return;
        fetch(`/api/trial-status?workspaceId=${encodeURIComponent(workspaceId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
            if (data)
                setTrial(data);
        })
            .catch(() => { });
    }, [workspaceId]);
    if (!trial || dismissed)
        return null;
    // Don't show banner for paid plans
    if (!trial.active && !trial.expired)
        return null;
    async function handleUpgrade(planId) {
        setUpgrading(true);
        setError(null);
        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId, planId }),
            });
            if (!res.ok)
                throw new Error('Checkout failed');
            const data = await res.json();
            if (data.url)
                window.location.href = data.url;
        }
        catch {
            setError('Failed to start checkout. Please try again.');
        }
        finally {
            setUpgrading(false);
        }
    }
    const isExpired = trial.expired;
    const isUrgent = trial.daysRemaining <= 3;
    return (_jsxs("div", { className: "relative px-4 py-2.5 text-sm flex items-center justify-between gap-3", style: {
            background: isExpired
                ? 'rgba(239,68,68,0.12)'
                : isUrgent
                    ? 'rgba(249,115,22,0.12)'
                    : 'rgba(99,102,241,0.08)',
            borderBottom: `1px solid ${isExpired ? 'rgba(239,68,68,0.25)' : isUrgent ? 'rgba(249,115,22,0.25)' : 'var(--c-border-2)'}`,
            color: isExpired ? '#f87171' : isUrgent ? '#fb923c' : 'var(--c-text-2)',
        }, children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx("span", { className: "text-base flex-shrink-0", children: isExpired ? '!' : 'i' }), _jsx("span", { className: "truncate", children: isExpired
                            ? 'Your trial has ended. Upgrade to continue using Shre AI.'
                            : `${trial.daysRemaining} day${trial.daysRemaining !== 1 ? 's' : ''} left in your free trial` })] }), _jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [_jsx("button", { onClick: () => setShowPlans(!showPlans), disabled: upgrading, className: "px-3 py-1 rounded-md text-xs font-medium transition-colors", style: {
                            background: isExpired ? '#ef4444' : 'var(--c-accent)',
                            color: '#fff',
                            opacity: upgrading ? 0.6 : 1,
                        }, children: upgrading ? 'Loading...' : 'Upgrade' }), !isExpired && (_jsx("button", { onClick: () => setDismissed(true), className: "p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity", style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) }))] }), showPlans && (_jsxs("div", { className: "absolute top-full right-4 mt-1 rounded-lg shadow-xl z-50 overflow-hidden", style: {
                    background: 'var(--c-bg-2)',
                    border: '1px solid var(--c-border-1)',
                    minWidth: 260,
                }, children: [PLANS.map((plan) => (_jsxs("button", { onClick: () => handleUpgrade(plan.id), className: "w-full px-4 py-3 text-left hover:opacity-80 transition-opacity flex items-center justify-between", style: { borderBottom: '1px solid var(--c-border-2)', color: 'var(--c-text-1)' }, children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: plan.name }), _jsx("div", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: plan.desc })] }), _jsx("span", { className: "text-xs font-medium", style: { color: 'var(--c-accent)' }, children: plan.price })] }, plan.id))), error && (_jsx("div", { className: "px-4 py-2 text-xs", style: { color: '#f87171' }, children: error }))] }))] }));
}
