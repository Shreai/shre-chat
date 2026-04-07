import React, { useState, memo } from 'react';

export interface ToolExecStep {
  id: string;
  tool: string;
  status: 'running' | 'success' | 'error';
  input?: any;
  outputPreview?: string;
  error?: string;
  latencyMs?: number;
  iteration: number;
  timestamp: number;
}

/** Format a tool name for display: strip prefixes, replace underscores */
function formatToolName(name: string): string {
  return name.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
}

/** Format a short input summary for display */
function formatInput(tool: string, input: any): string {
  if (!input) return '';
  if (typeof input === 'string') return input.slice(0, 80);
  // shell_exec: show command
  if (input.command) return `\`${String(input.command).slice(0, 80)}\``;
  // file tools: show path
  if (input.path) return String(input.path).slice(0, 80);
  if (input.file_path) return String(input.file_path).slice(0, 80);
  // query tools: show query
  if (input.query) return String(input.query).slice(0, 80);
  if (input.sql) return `\`${String(input.sql).slice(0, 80)}\``;
  // browser tools: show url
  if (input.url) return String(input.url).slice(0, 80);
  // fallback: first key=value
  const keys = Object.keys(input);
  if (keys.length > 0) {
    const v = String(input[keys[0]]).slice(0, 60);
    return `${keys[0]}: ${v}`;
  }
  return '';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Inline tool execution chip — collapsible, shows in the chat message stream */
export const ToolExecutionChip = memo(function ToolExecutionChip({ step }: { step: ToolExecStep }) {
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

  return (
    <div className="max-w-3xl mx-auto my-0.5 tool-chip-stable">
      <div className="flex items-center gap-1.5 py-0.5 px-2">
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] transition-all hover:opacity-80"
          style={{
            background: config.bgColor,
            color: config.color,
            border: `1px solid ${config.borderColor}`,
            cursor: 'pointer',
            fontFamily: 'inherit',
            maxWidth: '85%',
          }}
          title={expanded ? 'Click to collapse' : 'Click to expand'}
        >
          <span style={{ fontSize: '11px' }}>{config.icon}</span>
          <span className="truncate" style={{ maxWidth: 300 }}>
            {config.label}
          </span>
          {inputSummary && step.status === 'running' && (
            <span className="truncate" style={{ opacity: 0.7, maxWidth: 200 }}>
              {inputSummary}
            </span>
          )}
          {step.status === 'running' && (
            <span className="animate-pulse" style={{ fontSize: '8px' }}>
              ●
            </span>
          )}
          <span
            style={{
              fontSize: '8px',
              opacity: 0.5,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          >
            ▼
          </span>
        </button>
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
      </div>

      {expanded && (
        <div
          className="mx-8 mb-1 rounded-lg overflow-hidden text-[11px] leading-relaxed chip-expand-enter"
          style={{
            background: 'var(--c-bg-3)',
            border: `1px solid ${config.borderColor}`,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-1"
            style={{ borderBottom: '1px solid var(--c-border-2)' }}
          >
            <span className="font-medium" style={{ color: config.color }}>
              {config.icon} {step.tool}
            </span>
            {step.latencyMs != null && (
              <span className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                {formatDuration(step.latencyMs)}
              </span>
            )}
          </div>
          {inputSummary && (
            <div className="px-3 py-1" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
              <span className="text-[9px] font-medium" style={{ color: 'var(--c-text-4)' }}>
                Input:{' '}
              </span>
              <code
                className="text-[10px]"
                style={{ color: 'var(--c-text-3)', wordBreak: 'break-all' }}
              >
                {inputSummary}
              </code>
            </div>
          )}
          {step.status === 'success' && step.outputPreview && (
            <pre
              className="px-3 py-1.5 whitespace-pre-wrap break-words"
              style={{
                color: 'var(--c-text-4)',
                fontFamily: 'inherit',
                margin: 0,
                fontSize: '10px',
              }}
            >
              {step.outputPreview.length > 300
                ? step.outputPreview.slice(0, 300) + '...'
                : step.outputPreview}
            </pre>
          )}
          {step.status === 'error' && step.error && (
            <pre
              className="px-3 py-1.5 whitespace-pre-wrap break-words"
              style={{
                color: 'var(--c-danger-soft, #f87171)',
                fontFamily: 'inherit',
                margin: 0,
                fontSize: '10px',
              }}
            >
              {step.error.slice(0, 300)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

/** Container for multiple tool execution chips within a single assistant response */
export const ToolExecutionGroup = memo(function ToolExecutionGroup({
  steps,
}: {
  steps: ToolExecStep[];
}) {
  if (steps.length === 0) return null;
  return (
    <div className="tool-execution-group" style={{ margin: '4px 0' }}>
      {steps.map((step) => (
        <ToolExecutionChip key={step.id} step={step} />
      ))}
    </div>
  );
});
