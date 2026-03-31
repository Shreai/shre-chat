/**
 * ChatMessageTools — Renders tool calls within chat messages.
 *
 * Detects `claude_cli` tool calls and renders them using ClaudeToolView.
 * Other tool calls get a generic collapsible card renderer.
 */
import { useState } from 'react';
import { ClaudeToolView, type ClaudeToolEvent } from './ClaudeToolView';

export interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  toolEvents?: ClaudeToolEvent[];
  costUsd?: number;
  durationMs?: number;
  sessionId?: string;
}

interface ChatMessageToolsProps {
  tools: ToolCall[];
  /** Whether the tool is still executing (streaming) */
  isStreaming?: boolean;
}

/** Generic tool call card for non-Claude tools */
function GenericToolCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{
        border: `1px solid ${tool.isError ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <span
          className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
          style={{
            background: tool.isError ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
            color: tool.isError ? '#ef4444' : '#60a5fa',
          }}
        >
          {tool.isError ? '✕' : '⚡'}
        </span>
        <span
          className="text-[12px] font-mono font-medium flex-1"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          {tool.name}
        </span>
        {tool.durationMs != null && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {(tool.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <span
          className="text-[10px] transition-transform"
          style={{
            color: 'rgba(255,255,255,0.3)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <div
                className="text-[10px] font-medium mb-1"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                INPUT
              </div>
              <pre
                className="text-[11px] p-2 rounded overflow-x-auto"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <div
                className="text-[10px] font-medium mb-1"
                style={{
                  color: tool.isError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.4)',
                }}
              >
                {tool.isError ? 'ERROR' : 'RESULT'}
              </div>
              <pre
                className="text-[11px] p-2 rounded overflow-x-auto"
                style={{
                  background: tool.isError ? 'rgba(239,68,68,0.05)' : 'rgba(0,0,0,0.2)',
                  color: tool.isError ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.6)',
                  fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                  maxHeight: 400,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessageTools({ tools, isStreaming }: ChatMessageToolsProps) {
  if (!tools || tools.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {tools.map((tool, idx) => {
        // Claude CLI tool gets the rich terminal-like view
        if (tool.name === 'claude_cli' || tool.name === 'claude_exec') {
          return (
            <ClaudeToolView
              key={`${tool.name}-${idx}`}
              toolCall={tool}
              isStreaming={isStreaming && idx === tools.length - 1}
            />
          );
        }

        // Everything else gets the generic card
        return <GenericToolCard key={`${tool.name}-${idx}`} tool={tool} />;
      })}
    </div>
  );
}
