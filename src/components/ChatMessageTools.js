import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ChatMessageTools — Renders tool calls within chat messages.
 *
 * Detects `claude_cli` tool calls and renders them using ClaudeToolView.
 * Other tool calls get a generic collapsible card renderer.
 */
import { useState } from 'react';
import { ClaudeToolView } from './ClaudeToolView';
/** Generic tool call card for non-Claude tools */
function GenericToolCard({ tool }) {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { className: "rounded-lg overflow-hidden my-2", style: {
            border: `1px solid ${tool.isError ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
            background: 'rgba(255,255,255,0.02)',
        }, children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "w-full flex items-center gap-2 px-3 py-2 text-left", style: { background: 'rgba(255,255,255,0.03)' }, children: [_jsx("span", { className: "w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0", style: {
                            background: tool.isError ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                            color: tool.isError ? '#ef4444' : '#60a5fa',
                        }, children: tool.isError ? '✕' : '⚡' }), _jsx("span", { className: "text-[12px] font-mono font-medium flex-1", style: { color: 'rgba(255,255,255,0.7)' }, children: tool.name }), tool.durationMs != null && (_jsxs("span", { className: "text-[10px]", style: { color: 'rgba(255,255,255,0.3)' }, children: [(tool.durationMs / 1000).toFixed(1), "s"] })), _jsx("span", { className: "text-[10px] transition-transform", style: {
                            color: 'rgba(255,255,255,0.3)',
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }, children: "\u25BE" })] }), expanded && (_jsxs("div", { className: "px-3 py-2 space-y-2", children: [tool.input && Object.keys(tool.input).length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-medium mb-1", style: { color: 'rgba(255,255,255,0.4)' }, children: "INPUT" }), _jsx("pre", { className: "text-[11px] p-2 rounded overflow-x-auto", style: {
                                    background: 'rgba(0,0,0,0.2)',
                                    color: 'rgba(255,255,255,0.6)',
                                    fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                }, children: JSON.stringify(tool.input, null, 2) })] })), tool.result && (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-medium mb-1", style: {
                                    color: tool.isError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.4)',
                                }, children: tool.isError ? 'ERROR' : 'RESULT' }), _jsx("pre", { className: "text-[11px] p-2 rounded overflow-x-auto", style: {
                                    background: tool.isError ? 'rgba(239,68,68,0.05)' : 'rgba(0,0,0,0.2)',
                                    color: tool.isError ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.6)',
                                    fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                                    maxHeight: 400,
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }, children: tool.result })] }))] }))] }));
}
export function ChatMessageTools({ tools, isStreaming }) {
    if (!tools || tools.length === 0)
        return null;
    return (_jsx("div", { className: "space-y-2 mt-2", children: tools.map((tool, idx) => {
            // Claude CLI tool gets the rich terminal-like view
            if (tool.name === 'claude_cli' || tool.name === 'claude_exec') {
                return (_jsx(ClaudeToolView, { toolCall: tool, isStreaming: isStreaming && idx === tools.length - 1 }, `${tool.name}-${idx}`));
            }
            // Everything else gets the generic card
            return _jsx(GenericToolCard, { tool: tool }, `${tool.name}-${idx}`);
        }) }));
}
