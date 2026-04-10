import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ---------------------------------------------------------------------------
// SVG icons (inline — no lucide dependency in shre-chat)
// ---------------------------------------------------------------------------
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
    thinking: { active: 'var(--c-amber, #fbbf24)', muted: 'rgba(251,191,36,0.4)' },
    planning: { active: 'var(--c-violet, #a78bfa)', muted: 'rgba(167,139,250,0.4)' },
    tool_use: { active: 'var(--c-blue, #60a5fa)', muted: 'rgba(96,165,250,0.4)' },
    tool_result: { active: 'var(--c-cyan, #22d3ee)', muted: 'rgba(34,211,238,0.4)' },
    generating: { active: 'var(--c-green, #4ade80)', muted: 'rgba(74,222,128,0.4)' },
    compacting: { active: 'var(--c-orange, #fb923c)', muted: 'rgba(251,146,60,0.4)' },
    done: { active: 'var(--c-emerald, #34d399)', muted: 'rgba(52,211,153,0.4)' },
    attention: { active: 'var(--c-yellow, #facc15)', muted: 'rgba(250,204,21,0.4)' },
    approval: { active: 'var(--c-amber, #f59e0b)', muted: 'rgba(245,158,11,0.4)' },
    error: { active: 'var(--c-red, #f87171)', muted: 'rgba(248,113,113,0.4)' },
};
function StepPill({ step, compact, onClick, }) {
    const isActive = step.status === 'active';
    const colorEntry = COLORS[step.kind] ?? { active: 'var(--c-text-3)', muted: 'var(--c-text-5)' };
    const color = isActive ? colorEntry.active : colorEntry.muted;
    return (_jsxs("button", { onClick: onClick, style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            borderRadius: '9999px',
            padding: '2px 6px',
            fontSize: '10px',
            background: isActive ? 'var(--c-bg-active, rgba(255,255,255,0.06))' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            color,
            transition: 'all 0.15s',
            flexShrink: 0,
            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
        }, title: step.label, children: [_jsx("span", { style: { fontSize: '11px' }, children: ICONS[step.kind] }), !compact && (_jsx("span", { style: {
                    maxWidth: '100px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: isActive ? 'var(--c-text-2)' : 'var(--c-text-4)',
                }, children: step.toolName || step.label }))] }));
}
export function ProcessBar({ runs, activeRun, onStepClick, compact, className }) {
    const displayRun = activeRun ?? runs[runs.length - 1];
    if (!displayRun || displayRun.steps.length === 0)
        return null;
    return (_jsxs("div", { className: className, style: {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            borderTop: '1px solid var(--c-border-2, rgba(255,255,255,0.08))',
            background: 'var(--c-bg-active, rgba(255,255,255,0.03))',
            flexShrink: 0,
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'auto',
        }, children: [displayRun.steps.map((step) => (_jsx(StepPill, { step: step, compact: compact, onClick: () => onStepClick?.(displayRun.id, step.id) }, step.id))), !compact && displayRun.completedAt && (_jsxs("div", { style: {
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '9px',
                    color: 'var(--c-text-5, rgba(255,255,255,0.3))',
                    flexShrink: 0,
                }, children: [displayRun.model && _jsx("span", { children: displayRun.model.split('/').pop() }), displayRun.tokenUsage && (_jsxs("span", { children: [displayRun.tokenUsage.input, "in/", displayRun.tokenUsage.output, "out"] })), displayRun.durationMs && _jsxs("span", { children: [(displayRun.durationMs / 1000).toFixed(1), "s"] })] }))] }));
}
