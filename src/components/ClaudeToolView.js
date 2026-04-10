import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ClaudeToolView — Rich terminal-like renderer for Claude CLI tool execution.
 *
 * Displays:
 *   - Streaming output in a terminal-like view
 *   - Tool usage (file edits, shell commands) as collapsible cards
 *   - Progress indicator during execution
 *   - Cost / duration display when complete
 *   - Session ID for reference
 */
import { useState, useRef, useEffect, useMemo } from 'react';
// ── Sub-components ───────────────────────────────────────────────────────
function ToolUsageCard({ tool, expanded: initExpanded, }) {
    const [expanded, setExpanded] = useState(initExpanded ?? false);
    const iconMap = {
        Read: '📖',
        Write: '✏️',
        Edit: '🔧',
        Execute: '⚡',
        Bash: '💻',
        Search: '🔍',
        List: '📂',
    };
    const icon = Object.entries(iconMap).find(([k]) => tool.name.toLowerCase().includes(k.toLowerCase()))?.[1] ||
        '🔧';
    return (_jsxs("div", { className: "rounded-md overflow-hidden", style: {
            border: `1px solid ${tool.isError ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
            background: 'rgba(255,255,255,0.015)',
        }, children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "w-full flex items-center gap-2 px-2.5 py-1.5 text-left", children: [_jsx("span", { className: "text-[12px]", children: icon }), _jsx("span", { className: "text-[11px] font-mono flex-1 truncate", style: { color: 'rgba(255,255,255,0.6)' }, children: tool.name }), tool.isError && (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full", style: {
                            background: 'rgba(239,68,68,0.15)',
                            color: '#ef4444',
                        }, children: "error" })), _jsx("span", { className: "text-[9px] transition-transform", style: {
                            color: 'rgba(255,255,255,0.2)',
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }, children: "\u25BE" })] }), expanded && (_jsxs("div", { className: "px-2.5 py-2 space-y-1.5", children: [tool.input && (_jsx("pre", { className: "text-[10px] p-1.5 rounded overflow-x-auto", style: {
                            background: 'rgba(0,0,0,0.2)',
                            color: 'rgba(255,255,255,0.5)',
                            fontFamily: "'SF Mono', Menlo, monospace",
                            maxHeight: 120,
                            overflowY: 'auto',
                        }, children: JSON.stringify(tool.input, null, 2) })), tool.result && (_jsx("pre", { className: "text-[10px] p-1.5 rounded overflow-x-auto whitespace-pre-wrap", style: {
                            background: tool.isError ? 'rgba(239,68,68,0.04)' : 'rgba(0,0,0,0.15)',
                            color: tool.isError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.45)',
                            fontFamily: "'SF Mono', Menlo, monospace",
                            maxHeight: 200,
                            overflowY: 'auto',
                            wordBreak: 'break-word',
                        }, children: tool.result.length > 2000
                            ? tool.result.slice(0, 2000) + '\n... (truncated)'
                            : tool.result }))] }))] }));
}
function PulsingDot() {
    return (_jsx("span", { className: "inline-block w-2 h-2 rounded-full", style: {
            background: '#22c55e',
            animation: 'pulse 1.5s ease-in-out infinite',
        } }));
}
// ── Main Component ───────────────────────────────────────────────────────
export function ClaudeToolView({ toolCall, isStreaming }) {
    const outputRef = useRef(null);
    const [expanded, setExpanded] = useState(true);
    // Parse events into structured data
    const { textOutput, toolUsages, meta } = useMemo(() => {
        const events = toolCall.toolEvents || [];
        let text = '';
        const tools = [];
        let currentTool = null;
        let cost = toolCall.costUsd;
        let duration = toolCall.durationMs;
        let model;
        let sessionId = toolCall.sessionId;
        for (const evt of events) {
            switch (evt.type) {
                case 'delta':
                    if (evt.text)
                        text += evt.text;
                    break;
                case 'tool_start':
                    if (evt.tools) {
                        for (const t of evt.tools) {
                            currentTool = { name: t.name, input: t.input };
                            tools.push(currentTool);
                        }
                    }
                    if (evt.model)
                        model = evt.model;
                    break;
                case 'tool_result':
                    if (currentTool && evt.tool === currentTool.name) {
                        currentTool.result = evt.result;
                        currentTool.isError = evt.isError;
                    }
                    else {
                        // Tool result without matching tool_start
                        tools.push({
                            name: evt.tool || 'unknown',
                            result: evt.result,
                            isError: evt.isError,
                        });
                    }
                    currentTool = null;
                    break;
                case 'claude_result':
                    if (evt.costUsd != null)
                        cost = evt.costUsd;
                    if (evt.durationMs != null)
                        duration = evt.durationMs;
                    break;
                case 'session_start':
                    if (evt.sessionId)
                        sessionId = evt.sessionId;
                    break;
                case 'session_end':
                    if (evt.costUsd != null)
                        cost = evt.costUsd;
                    if (evt.durationMs != null)
                        duration = evt.durationMs;
                    break;
            }
        }
        // If no events, use the result text directly
        if (!text && toolCall.result)
            text = toolCall.result;
        return {
            textOutput: text,
            toolUsages: tools,
            meta: { cost, duration, model, sessionId },
        };
    }, [toolCall]);
    // Auto-scroll to bottom during streaming
    useEffect(() => {
        if (isStreaming && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [textOutput, isStreaming]);
    const isComplete = !isStreaming;
    const isError = toolCall.isError;
    const prompt = toolCall.input?.prompt || '';
    return (_jsxs("div", { className: "rounded-lg overflow-hidden my-2", style: {
            border: `1px solid ${isError
                ? 'rgba(239,68,68,0.3)'
                : isStreaming
                    ? 'rgba(34,197,94,0.3)'
                    : 'rgba(96,165,250,0.2)'}`,
            background: 'rgba(10,22,40,0.6)',
        }, children: [_jsxs("div", { className: "flex items-center gap-2 px-3 py-2", style: {
                    background: 'rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }, children: [_jsx("span", { className: "text-[14px]", children: "\uD83E\uDD16" }), _jsx("span", { className: "text-[12px] font-medium flex-1", style: { color: 'rgba(255,255,255,0.7)' }, children: "Claude Code CLI" }), isStreaming && (_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx(PulsingDot, {}), _jsx("span", { className: "text-[10px]", style: { color: 'rgba(34,197,94,0.8)' }, children: "executing\u2026" })] })), isComplete && meta.duration != null && (_jsxs("span", { className: "text-[10px]", style: { color: 'rgba(255,255,255,0.3)' }, children: [(meta.duration / 1000).toFixed(1), "s"] })), isComplete && meta.cost != null && (_jsxs("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: {
                            background: 'rgba(59,130,246,0.1)',
                            color: 'rgba(96,165,250,0.8)',
                        }, children: ["$", meta.cost.toFixed(4)] })), isComplete && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: {
                            background: isError ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
                            color: isError ? '#ef4444' : '#22c55e',
                        }, children: isError ? 'failed' : 'done' })), _jsx("button", { onClick: () => setExpanded(!expanded), className: "text-[10px] ml-1", style: {
                            color: 'rgba(255,255,255,0.3)',
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                        }, children: "\u25BE" })] }), expanded && (_jsxs("div", { className: "space-y-0", children: [prompt && (_jsx("div", { className: "px-3 py-1.5 text-[11px]", style: {
                            color: 'rgba(255,255,255,0.35)',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            fontStyle: 'italic',
                        }, children: prompt.length > 150 ? prompt.slice(0, 150) + '…' : prompt })), toolUsages.length > 0 && (_jsxs("div", { className: "px-3 py-2 space-y-1.5", style: {
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }, children: [_jsxs("div", { className: "text-[10px] font-medium", style: { color: 'rgba(255,255,255,0.35)' }, children: ["TOOLS USED (", toolUsages.length, ")"] }), toolUsages.map((t, i) => (_jsx(ToolUsageCard, { tool: t }, i)))] })), textOutput && (_jsxs("pre", { ref: outputRef, className: "px-3 py-2 text-[11px] overflow-auto", style: {
                            fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                            color: 'rgba(200,214,229,0.85)',
                            background: 'rgba(0,0,0,0.15)',
                            maxHeight: 400,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.5,
                        }, children: [textOutput, isStreaming && (_jsx("span", { className: "inline-block w-[6px] h-[14px] ml-0.5", style: {
                                    background: '#6cb4ee',
                                    animation: 'blink 1s step-end infinite',
                                } }))] })), meta.sessionId && isComplete && (_jsxs("div", { className: "px-3 py-1.5 flex items-center gap-3", style: {
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                        }, children: [_jsxs("span", { className: "text-[9px] font-mono", style: { color: 'rgba(255,255,255,0.2)' }, children: ["session: ", meta.sessionId.slice(0, 16)] }), meta.model && (_jsxs("span", { className: "text-[9px] font-mono", style: { color: 'rgba(255,255,255,0.2)' }, children: ["model: ", meta.model] }))] }))] })), _jsx("style", { children: `
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      ` })] }));
}
