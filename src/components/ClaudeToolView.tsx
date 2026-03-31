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

// ── Types ────────────────────────────────────────────────────────────────

export interface ClaudeToolEvent {
  type:
    | 'delta'
    | 'tool_start'
    | 'tool_result'
    | 'claude_result'
    | 'session_start'
    | 'session_end'
    | 'status'
    | 'error';
  text?: string;
  tools?: Array<{ name: string; input?: Record<string, unknown> }>;
  tool?: string;
  result?: string;
  isError?: boolean;
  costUsd?: number;
  durationMs?: number;
  sessionId?: string;
  model?: string;
}

interface ClaudeToolViewProps {
  toolCall: {
    name: string;
    input?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    toolEvents?: ClaudeToolEvent[];
    costUsd?: number;
    durationMs?: number;
    sessionId?: string;
  };
  isStreaming?: boolean;
}

// ── Sub-components ───────────────────────────────────────────────────────

function ToolUsageCard({
  tool,
  expanded: initExpanded,
}: {
  tool: { name: string; input?: Record<string, unknown>; result?: string; isError?: boolean };
  expanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initExpanded ?? false);

  const iconMap: Record<string, string> = {
    Read: '📖',
    Write: '✏️',
    Edit: '🔧',
    Execute: '⚡',
    Bash: '💻',
    Search: '🔍',
    List: '📂',
  };

  const icon =
    Object.entries(iconMap).find(([k]) => tool.name.toLowerCase().includes(k.toLowerCase()))?.[1] ||
    '🔧';

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        border: `1px solid ${tool.isError ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
        background: 'rgba(255,255,255,0.015)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-[12px]">{icon}</span>
        <span
          className="text-[11px] font-mono flex-1 truncate"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          {tool.name}
        </span>
        {tool.isError && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
            }}
          >
            error
          </span>
        )}
        <span
          className="text-[9px] transition-transform"
          style={{
            color: 'rgba(255,255,255,0.2)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>
      {expanded && (
        <div className="px-2.5 py-2 space-y-1.5">
          {tool.input && (
            <pre
              className="text-[10px] p-1.5 rounded overflow-x-auto"
              style={{
                background: 'rgba(0,0,0,0.2)',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'SF Mono', Menlo, monospace",
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          )}
          {tool.result && (
            <pre
              className="text-[10px] p-1.5 rounded overflow-x-auto whitespace-pre-wrap"
              style={{
                background: tool.isError ? 'rgba(239,68,68,0.04)' : 'rgba(0,0,0,0.15)',
                color: tool.isError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.45)',
                fontFamily: "'SF Mono', Menlo, monospace",
                maxHeight: 200,
                overflowY: 'auto',
                wordBreak: 'break-word',
              }}
            >
              {tool.result.length > 2000
                ? tool.result.slice(0, 2000) + '\n... (truncated)'
                : tool.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function PulsingDot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background: '#22c55e',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function ClaudeToolView({ toolCall, isStreaming }: ClaudeToolViewProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const [expanded, setExpanded] = useState(true);

  // Parse events into structured data
  const { textOutput, toolUsages, meta } = useMemo(() => {
    const events = toolCall.toolEvents || [];
    let text = '';
    const tools: Array<{
      name: string;
      input?: Record<string, unknown>;
      result?: string;
      isError?: boolean;
    }> = [];
    let currentTool: (typeof tools)[0] | null = null;
    let cost: number | undefined = toolCall.costUsd;
    let duration: number | undefined = toolCall.durationMs;
    let model: string | undefined;
    let sessionId: string | undefined = toolCall.sessionId;

    for (const evt of events) {
      switch (evt.type) {
        case 'delta':
          if (evt.text) text += evt.text;
          break;
        case 'tool_start':
          if (evt.tools) {
            for (const t of evt.tools) {
              currentTool = { name: t.name, input: t.input };
              tools.push(currentTool);
            }
          }
          if (evt.model) model = evt.model;
          break;
        case 'tool_result':
          if (currentTool && evt.tool === currentTool.name) {
            currentTool.result = evt.result;
            currentTool.isError = evt.isError;
          } else {
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
          if (evt.costUsd != null) cost = evt.costUsd;
          if (evt.durationMs != null) duration = evt.durationMs;
          break;
        case 'session_start':
          if (evt.sessionId) sessionId = evt.sessionId;
          break;
        case 'session_end':
          if (evt.costUsd != null) cost = evt.costUsd;
          if (evt.durationMs != null) duration = evt.durationMs;
          break;
      }
    }

    // If no events, use the result text directly
    if (!text && toolCall.result) text = toolCall.result;

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
  const prompt = (toolCall.input?.prompt as string) || '';

  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{
        border: `1px solid ${
          isError
            ? 'rgba(239,68,68,0.3)'
            : isStreaming
              ? 'rgba(34,197,94,0.3)'
              : 'rgba(96,165,250,0.2)'
        }`,
        background: 'rgba(10,22,40,0.6)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="text-[14px]">🤖</span>
        <span className="text-[12px] font-medium flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Claude Code CLI
        </span>

        {isStreaming && (
          <span className="flex items-center gap-1.5">
            <PulsingDot />
            <span className="text-[10px]" style={{ color: 'rgba(34,197,94,0.8)' }}>
              executing…
            </span>
          </span>
        )}

        {isComplete && meta.duration != null && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {(meta.duration / 1000).toFixed(1)}s
          </span>
        )}

        {isComplete && meta.cost != null && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(59,130,246,0.1)',
              color: 'rgba(96,165,250,0.8)',
            }}
          >
            ${meta.cost.toFixed(4)}
          </span>
        )}

        {isComplete && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: isError ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
              color: isError ? '#ef4444' : '#22c55e',
            }}
          >
            {isError ? 'failed' : 'done'}
          </span>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] ml-1"
          style={{
            color: 'rgba(255,255,255,0.3)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▾
        </button>
      </div>

      {expanded && (
        <div className="space-y-0">
          {/* Prompt preview */}
          {prompt && (
            <div
              className="px-3 py-1.5 text-[11px]"
              style={{
                color: 'rgba(255,255,255,0.35)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontStyle: 'italic',
              }}
            >
              {prompt.length > 150 ? prompt.slice(0, 150) + '…' : prompt}
            </div>
          )}

          {/* Tool usage cards */}
          {toolUsages.length > 0 && (
            <div
              className="px-3 py-2 space-y-1.5"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                TOOLS USED ({toolUsages.length})
              </div>
              {toolUsages.map((t, i) => (
                <ToolUsageCard key={i} tool={t} />
              ))}
            </div>
          )}

          {/* Terminal output */}
          {textOutput && (
            <pre
              ref={outputRef}
              className="px-3 py-2 text-[11px] overflow-auto"
              style={{
                fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                color: 'rgba(200,214,229,0.85)',
                background: 'rgba(0,0,0,0.15)',
                maxHeight: 400,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.5,
              }}
            >
              {textOutput}
              {isStreaming && (
                <span
                  className="inline-block w-[6px] h-[14px] ml-0.5"
                  style={{
                    background: '#6cb4ee',
                    animation: 'blink 1s step-end infinite',
                  }}
                />
              )}
            </pre>
          )}

          {/* Session info footer */}
          {meta.sessionId && isComplete && (
            <div
              className="px-3 py-1.5 flex items-center gap-3"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                session: {meta.sessionId.slice(0, 16)}
              </span>
              {meta.model && (
                <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  model: {meta.model}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
