import React, { useState, memo } from 'react';
import type { ChatMessage } from '../router-client';
import { classifySystemEvent, formatTime } from '../chat-utils';

export interface ProgressStep {
  id: string;
  icon: string;
  label: string;
  color: string;
  detail?: string;
  timestamp?: number;
  status: 'running' | 'success' | 'error' | 'info';
}

function stepFromToolExec(msg: ChatMessage): ProgressStep {
  const m = msg.meta || {};
  const tool = (m.tool || 'unknown').replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
  const status = m.status === 'error' ? 'error' : m.status === 'running' ? 'running' : 'success';
  const duration = m.duration ? parseInt(m.duration, 10) : undefined;
  const durationStr = duration
    ? duration < 1000
      ? `${duration}ms`
      : `${(duration / 1000).toFixed(1)}s`
    : '';

  const icons = { running: '⚡', success: '✓', error: '✕' };
  const colors = {
    running: 'var(--c-info-soft, #60a5fa)',
    success: 'var(--c-success, #34d399)',
    error: 'var(--c-danger-soft, #f87171)',
  };
  const labels = {
    running: `Running ${tool}`,
    success: `${tool} complete${durationStr ? ` (${durationStr})` : ''}`,
    error: `${tool} failed`,
  };

  let detail = '';
  const input = m.inputJson
    ? (() => {
        try {
          return JSON.parse(m.inputJson);
        } catch {
          return null;
        }
      })()
    : null;
  if (input) {
    if (input.command) detail = String(input.command).slice(0, 80);
    else if (input.path || input.file_path)
      detail = String(input.path || input.file_path).slice(0, 80);
    else if (input.query) detail = String(input.query).slice(0, 80);
  }
  if (status === 'error' && m.error) detail = m.error.slice(0, 80);
  if (status === 'success' && m.outputPreview) detail = m.outputPreview.slice(0, 80);

  return {
    id: `tool-${msg.timestamp}-${m.tool}`,
    icon: icons[status],
    label: labels[status],
    color: colors[status],
    detail,
    timestamp: msg.timestamp,
    status,
  };
}

function stepFromSystemEvent(msg: ChatMessage): ProgressStep {
  const content = msg.content.trim().replace(/^\[system\]\s*/i, '');
  const classified = classifySystemEvent(content);

  return {
    id: `sys-${msg.timestamp}`,
    icon: classified.icon,
    label: classified.label,
    color: classified.color,
    detail: content.length > 120 ? content.slice(0, 120) + '…' : content,
    timestamp: msg.timestamp,
    status: 'info',
  };
}

export function messageToStep(msg: ChatMessage): ProgressStep {
  if (msg.meta?.type === 'tool_exec') return stepFromToolExec(msg);
  return stepFromSystemEvent(msg);
}

const StatusIcon = memo(function StatusIcon({ step }: { step: ProgressStep }) {
  const size = 16;
  if (step.status === 'running') {
    return (
      <div
        className="flex items-center justify-center rounded-full animate-pulse"
        style={{
          width: size,
          height: size,
          background: `${step.color}22`,
          border: `1.5px solid ${step.color}`,
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke={step.color}
          strokeWidth="3"
        >
          <polyline points="4 17 10 11 4 5" />
        </svg>
      </div>
    );
  }
  if (step.status === 'success') {
    return (
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `${step.color}22`,
          border: `1.5px solid ${step.color}`,
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke={step.color}
          strokeWidth="3"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (step.status === 'error') {
    return (
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `${step.color}22`,
          border: `1.5px solid ${step.color}`,
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke={step.color}
          strokeWidth="3"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `${step.color}22`,
        border: `1.5px solid ${step.color}`,
      }}
    >
      <span style={{ fontSize: 8, lineHeight: 1 }}>{step.icon}</span>
    </div>
  );
});

export const MessageProgressTrail = memo(function MessageProgressTrail({
  steps,
  defaultExpanded = false,
}: {
  steps: ProgressStep[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasRunning = steps.some((s) => s.status === 'running');
  const errorCount = steps.filter((s) => s.status === 'error').length;
  const completedCount = steps.filter((s) => s.status === 'success' || s.status === 'info').length;

  if (steps.length === 0) return null;

  const lastStep = steps[steps.length - 1];
  const visibleSteps = expanded ? steps : [lastStep];

  return (
    <div className="max-w-3xl mx-auto mt-1 mb-1">
      <div
        className="ml-6 sm:ml-10 rounded-lg overflow-hidden transition-all"
        style={{
          background: 'var(--c-bg-2)',
          border: '1px solid var(--c-border-1)',
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:brightness-110"
          style={{ background: 'transparent' }}
        >
          {hasRunning ? (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--c-info-soft, #60a5fa)' }}
            />
          ) : errorCount > 0 ? (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--c-danger-soft, #f87171)' }}
            />
          ) : (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--c-success, #34d399)' }}
            />
          )}
          <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--c-text-3)' }}>
            {hasRunning
              ? `Processing… ${lastStep.label}`
              : `${completedCount} step${completedCount !== 1 ? 's' : ''} completed${errorCount > 0 ? `, ${errorCount} failed` : ''}`}
          </span>
          <span
            className="text-[9px]"
            style={{
              color: 'var(--c-text-5)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </button>

        {expanded && (
          <div className="px-3 pb-2 pt-0.5">
            {visibleSteps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-2 relative">
                <div className="flex flex-col items-center" style={{ width: 16 }}>
                  <StatusIcon step={step} />
                  {idx < visibleSteps.length - 1 && (
                    <div
                      className="flex-1"
                      style={{
                        width: 1.5,
                        minHeight: 12,
                        background: 'var(--c-border-2)',
                        margin: '2px 0',
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-medium truncate"
                      style={{ color: step.color }}
                    >
                      {step.label}
                    </span>
                    {step.timestamp && (
                      <span className="text-[9px] shrink-0" style={{ color: 'var(--c-text-5)' }}>
                        {formatTime(step.timestamp)}
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <div
                      className="text-[9px] truncate mt-0.5"
                      style={{ color: 'var(--c-text-4)', maxWidth: '100%' }}
                    >
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
