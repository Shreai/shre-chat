import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, memo } from 'react';
/** Format a tool name for display: strip prefixes, replace underscores */
function formatToolName(name) {
    return name.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
}
/** Format a short input summary for display */
function formatInput(tool, input) {
    if (!input)
        return '';
    if (typeof input === 'string')
        return input.slice(0, 80);
    // shell_exec: show command
    if (input.command)
        return `\`${String(input.command).slice(0, 80)}\``;
    // file tools: show path
    if (input.path)
        return String(input.path).slice(0, 80);
    if (input.file_path)
        return String(input.file_path).slice(0, 80);
    // query tools: show query
    if (input.query)
        return String(input.query).slice(0, 80);
    if (input.sql)
        return `\`${String(input.sql).slice(0, 80)}\``;
    // browser tools: show url
    if (input.url)
        return String(input.url).slice(0, 80);
    // fallback: first key=value
    const keys = Object.keys(input);
    if (keys.length > 0) {
        const v = String(input[keys[0]]).slice(0, 60);
        return `${keys[0]}: ${v}`;
    }
    return '';
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
/** Inline tool execution chip — collapsible, shows in the chat message stream */
export const ToolExecutionChip = memo(function ToolExecutionChip({ step }) {
    const [expanded, setExpanded] = useState(false);
    const toolLabel = formatToolName(step.tool);
    const inputSummary = formatInput(step.tool, step.input);
    const durationStr = step.latencyMs ? ` (${formatDuration(step.latencyMs)})` : '';
    const config = {
        running: {
            icon: '\u{1F527}',
            color: 'var(--c-terminal-accent, #6cb4ee)',
            bgColor: 'rgba(108,180,238,0.08)',
            borderColor: 'rgba(108,180,238,0.2)',
            label: `Running ${toolLabel}`,
        },
        success: {
            icon: '\u2705',
            color: 'var(--c-success, #34d399)',
            bgColor: 'rgba(52,211,153,0.08)',
            borderColor: 'rgba(52,211,153,0.2)',
            label: `${toolLabel} completed${durationStr}`,
        },
        error: {
            icon: '\u274C',
            color: 'var(--c-danger-soft, #f87171)',
            bgColor: 'rgba(248,113,113,0.08)',
            borderColor: 'rgba(248,113,113,0.2)',
            label: `${toolLabel} failed`,
        },
    }[step.status];
    return (_jsxs("div", { className: "max-w-3xl mx-auto my-0.5 tool-chip-stable", children: [_jsxs("div", { className: "flex items-center gap-1.5 py-0.5 px-2", children: [_jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } }), _jsxs("button", { onClick: () => setExpanded(!expanded), className: "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] transition-all hover:opacity-80", style: {
                            background: config.bgColor,
                            color: config.color,
                            border: `1px solid ${config.borderColor}`,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            maxWidth: '85%',
                        }, title: expanded ? 'Click to collapse' : 'Click to expand', children: [_jsx("span", { style: { fontSize: '11px' }, children: config.icon }), _jsx("span", { className: "truncate", style: { maxWidth: 300 }, children: config.label }), inputSummary && step.status === 'running' && (_jsx("span", { className: "truncate", style: { opacity: 0.7, maxWidth: 200 }, children: inputSummary })), step.status === 'running' && (_jsx("span", { className: "animate-pulse", style: { fontSize: '8px' }, children: "\u25CF" })), _jsx("span", { style: {
                                    fontSize: '8px',
                                    opacity: 0.5,
                                    transform: expanded ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.15s',
                                }, children: "\u25BC" })] }), _jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } })] }), expanded && (_jsxs("div", { className: "mx-8 mb-1 rounded-lg overflow-hidden text-[11px] leading-relaxed chip-expand-enter", style: {
                    background: 'var(--c-bg-3)',
                    border: `1px solid ${config.borderColor}`,
                    maxHeight: 180,
                    overflowY: 'auto',
                }, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-1", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("span", { className: "font-medium", style: { color: config.color }, children: [config.icon, " ", step.tool] }), step.latencyMs != null && (_jsx("span", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: formatDuration(step.latencyMs) }))] }), inputSummary && (_jsxs("div", { className: "px-3 py-1", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("span", { className: "text-[9px] font-medium", style: { color: 'var(--c-text-4)' }, children: ["Input:", ' '] }), _jsx("code", { className: "text-[10px]", style: { color: 'var(--c-text-3)', wordBreak: 'break-all' }, children: inputSummary })] })), step.status === 'success' && step.outputPreview && (_jsx("pre", { className: "px-3 py-1.5 whitespace-pre-wrap break-words", style: {
                            color: 'var(--c-text-4)',
                            fontFamily: 'inherit',
                            margin: 0,
                            fontSize: '10px',
                        }, children: step.outputPreview.length > 300
                            ? step.outputPreview.slice(0, 300) + '...'
                            : step.outputPreview })), step.status === 'error' && step.error && (_jsx("pre", { className: "px-3 py-1.5 whitespace-pre-wrap break-words", style: {
                            color: 'var(--c-danger-soft, #f87171)',
                            fontFamily: 'inherit',
                            margin: 0,
                            fontSize: '10px',
                        }, children: step.error.slice(0, 300) }))] }))] }));
});
/** Container for multiple tool execution chips within a single assistant response */
export const ToolExecutionGroup = memo(function ToolExecutionGroup({ steps, }) {
    if (steps.length === 0)
        return null;
    return (_jsx("div", { className: "tool-execution-group", style: { margin: '4px 0' }, children: steps.map((step) => (_jsx(ToolExecutionChip, { step: step }, step.id))) }));
});
