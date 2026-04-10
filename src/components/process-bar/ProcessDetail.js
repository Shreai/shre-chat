import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const ICONS = {
    thinking: '🧠',
    planning: '📋',
    tool_use: '⚡',
    tool_result: '📦',
    generating: '✎',
    compacting: '⟳',
    done: '✅',
    attention: '⚠️',
    approval: '🔐',
    error: '❌',
};
const COLORS = {
    thinking: '#fbbf24',
    planning: '#a78bfa',
    tool_use: '#60a5fa',
    tool_result: '#22d3ee',
    generating: '#4ade80',
    compacting: '#fb923c',
    done: '#34d399',
    attention: '#facc15',
    approval: '#f59e0b',
    error: '#f87171',
};
function TimelineStep({ step, highlight }) {
    const duration = step.completedAt
        ? ((step.completedAt - step.startedAt) / 1000).toFixed(1) + 's'
        : '...';
    return (_jsxs("div", { style: {
            display: 'flex',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: highlight ? 'var(--c-bg-active)' : 'transparent',
            transition: 'background 0.15s',
        }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }, children: [_jsx("span", { style: { fontSize: '14px', color: COLORS[step.kind] }, children: ICONS[step.kind] }), _jsx("div", { style: { width: '1px', flex: 1, background: 'var(--c-border-2)', marginTop: '4px' } })] }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { fontSize: '11px', fontWeight: 500, color: 'var(--c-text-2)' }, children: step.label }), _jsx("span", { style: { fontSize: '9px', color: 'var(--c-text-5)' }, children: duration })] }), step.toolName && (_jsxs("div", { style: {
                            marginTop: '4px',
                            fontSize: '10px',
                            color: 'var(--c-text-4)',
                            fontFamily: 'monospace',
                        }, children: [step.toolName, step.toolArgs != null && (_jsx("pre", { style: {
                                    marginTop: '2px',
                                    padding: '4px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--c-bg-card)',
                                    fontSize: '9px',
                                    overflowX: 'auto',
                                    maxHeight: '80px',
                                }, children: typeof step.toolArgs === 'string'
                                    ? step.toolArgs
                                    : JSON.stringify(step.toolArgs, null, 2) }))] })), step.toolOutput && (_jsx("pre", { style: {
                            marginTop: '4px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            background: 'var(--c-bg-card)',
                            fontSize: '9px',
                            color: 'var(--c-text-4)',
                            overflowX: 'auto',
                            maxHeight: '100px',
                            whiteSpace: 'pre-wrap',
                        }, children: step.toolOutput.length > 500 ? step.toolOutput.slice(0, 500) + '...' : step.toolOutput })), step.kind === 'thinking' && step.detail && (_jsx("p", { style: {
                            marginTop: '4px',
                            fontSize: '10px',
                            color: 'var(--c-text-5)',
                            fontStyle: 'italic',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '100px',
                            overflowY: 'auto',
                        }, children: step.detail }))] })] }));
}
export function ProcessDetail({ run, highlightStepId, onClose }) {
    if (!run)
        return null;
    const totalDuration = run.durationMs
        ? (run.durationMs / 1000).toFixed(1) + 's'
        : run.completedAt
            ? ((run.completedAt - run.startedAt) / 1000).toFixed(1) + 's'
            : 'in progress';
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--c-bg-main)',
            color: 'var(--c-text-1)',
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--c-border-2)',
                }, children: [_jsxs("div", { children: [_jsx("h3", { style: { fontSize: '13px', fontWeight: 600, color: 'var(--c-text-1)' }, children: "Process Detail" }), _jsxs("p", { style: { fontSize: '10px', color: 'var(--c-text-5)', marginTop: '2px' }, children: [run.steps.length, " steps \u2014 ", totalDuration] })] }), onClose && (_jsx("button", { onClick: onClose, style: {
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: 'var(--c-text-4)',
                            fontSize: '16px',
                            padding: '4px',
                        }, children: "\u2715" }))] }), _jsx("div", { style: { flex: 1, overflowY: 'auto', padding: '8px' }, children: run.steps.map((step) => (_jsx(TimelineStep, { step: step, highlight: step.id === highlightStepId }, step.id))) }), run.completedAt && (_jsxs("div", { style: {
                    padding: '8px 14px',
                    borderTop: '1px solid var(--c-border-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '10px',
                    color: 'var(--c-text-5)',
                }, children: [run.model && _jsx("span", { children: run.model.split('/').pop() }), run.tokenUsage && (_jsxs("span", { children: [run.tokenUsage.input, "in / ", run.tokenUsage.output, "out"] })), _jsx("span", { children: totalDuration })] }))] }));
}
