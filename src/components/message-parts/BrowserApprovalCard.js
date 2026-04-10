import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * BrowserApprovalCard — Interactive approval card for browser actions.
 *
 * Rendered when an agent requests human approval for sensitive browser operations
 * (login, download from untrusted domain, etc.). Provides Approve/Deny buttons
 * and a deep link to the full details page in MIB007.
 */
import { useState, useCallback } from 'react';
export function BrowserApprovalCard({ message, timestamp }) {
    const content = message.content || '';
    const [resolving, setResolving] = useState(false);
    const [resolved, setResolved] = useState(null);
    // Parse structured fields from message content
    const approvalId = content.match(/Approval ID:\s*(\S+)/)?.[1] || '';
    const action = content.match(/Action:\s*([^\n]+)/)?.[1] || 'browser action';
    const target = content.match(/Target:\s*(\S+)/)?.[1] || '';
    const agent = content.match(/Agent:\s*(\S+)/)?.[1] || '';
    const reason = content.match(/Reason:\s*([^\n]+)/)?.[1] || '';
    const risk = content.match(/Risk:\s*(\w+)/)?.[1] || 'medium';
    const handleResolve = useCallback(async (status) => {
        if (!approvalId || resolving)
            return;
        setResolving(true);
        try {
            const res = await fetch('/api/browser/approvals/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvalId, status, resolvedBy: 'user' }),
            });
            if (res.ok)
                setResolved(status);
        }
        catch {
            /* silent */
        }
        finally {
            setResolving(false);
        }
    }, [approvalId, resolving]);
    const RISK_COLOR = {
        low: 'var(--c-success, #34d399)',
        medium: 'var(--c-warning, #fbbf24)',
        high: 'var(--c-danger-soft, #f87171)',
        critical: 'var(--c-error, #ef4444)',
    };
    const ACTION_ICON = {
        browser_login: '\uD83D\uDD12',
        browser_download: '\u2B07\uFE0F',
        browser_browse: '\uD83C\uDF10',
        browser_click: '\uD83D\uDC46',
    };
    return (_jsxs("div", { className: "max-w-3xl mx-auto", children: [_jsxs("div", { className: "flex items-center gap-1.5 py-1 px-2", children: [_jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } }), _jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px]", style: {
                            background: 'var(--c-bg-3)',
                            color: resolved === 'approved'
                                ? 'var(--c-success, #34d399)'
                                : resolved === 'denied'
                                    ? 'var(--c-danger-soft, #f87171)'
                                    : 'var(--c-warning, #fbbf24)',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsx("span", { children: resolved === 'approved' ? '\u2713' : resolved === 'denied' ? '\u2717' : '\uD83D\uDD10' }), _jsx("span", { children: resolved === 'approved'
                                    ? 'Approved'
                                    : resolved === 'denied'
                                        ? 'Denied'
                                        : 'Approval needed' })] }), timestamp && (_jsx("span", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: timestamp })), _jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } })] }), _jsxs("div", { className: "mx-4 mb-2 rounded-lg overflow-hidden", style: { background: 'var(--c-bg-3)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-1.5", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("span", { className: "font-medium text-[11px]", style: { color: 'var(--c-text-3)' }, children: [ACTION_ICON[action] || '\uD83C\uDF10', ' ', action.replace('browser_', '').replace('_', ' ')] }), _jsxs("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full", style: { background: RISK_COLOR[risk] + '22', color: RISK_COLOR[risk] }, children: [risk, " risk"] })] }), _jsxs("div", { className: "px-3 py-2 space-y-1", children: [agent && (_jsxs("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: ["Agent: ", _jsx("span", { style: { color: 'var(--c-text-3)' }, children: agent })] })), target && (_jsx("div", { className: "text-[10px] px-2 py-1 rounded", style: { background: 'var(--c-bg-2)', color: 'var(--c-text-3)' }, children: target.length > 60 ? target.slice(0, 60) + '...' : target })), reason && (_jsx("div", { className: "text-[11px]", style: { color: 'var(--c-text-2)' }, children: reason }))] }), !resolved && (_jsxs("div", { className: "px-3 py-2 flex gap-2", style: { borderTop: '1px solid var(--c-border-2)' }, children: [_jsx("button", { onClick: () => handleResolve('approved'), disabled: resolving, className: "px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90", style: {
                                    background: 'var(--c-success, #34d399)',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: resolving ? 'not-allowed' : 'pointer',
                                    opacity: resolving ? 0.6 : 1,
                                }, children: resolving ? '...' : 'Approve' }), _jsx("button", { onClick: () => handleResolve('denied'), disabled: resolving, className: "px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90", style: {
                                    background: 'var(--c-danger-soft, #f87171)',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: resolving ? 'not-allowed' : 'pointer',
                                    opacity: resolving ? 0.6 : 1,
                                }, children: resolving ? '...' : 'Deny' }), approvalId && (_jsx("a", { href: `/security/approvals/${approvalId}`, target: "_blank", rel: "noopener noreferrer", className: "px-3 py-1 rounded-md text-[11px] transition-all hover:opacity-90", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-4)',
                                    border: '1px solid var(--c-border-2)',
                                    textDecoration: 'none',
                                }, children: "Details" }))] })), resolved && (_jsx("div", { className: "px-3 py-1.5 text-[10px] font-medium", style: {
                            color: resolved === 'approved'
                                ? 'var(--c-success, #34d399)'
                                : 'var(--c-danger-soft, #f87171)',
                            borderTop: '1px solid var(--c-border-2)',
                        }, children: resolved === 'approved'
                            ? 'Browser action approved — executing'
                            : 'Browser action denied — cancelled' }))] })] }));
}
