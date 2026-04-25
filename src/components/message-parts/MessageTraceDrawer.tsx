import { useState, useMemo } from 'react';

interface TraceSpan {
  name: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  status: 'ok' | 'error' | 'skipped';
  data?: Record<string, unknown>;
  error?: { message: string; code?: string };
}

interface TraceRecord {
  traceId: string;
  service: string;
  totalMs?: number;
  status: 'ok' | 'error' | 'partial';
  spans: TraceSpan[];
  executionPlan?: Array<{
    stepId: string;
    order: number;
    type: string;
    title: string;
    status: string;
    taskId?: string;
    error?: string;
    queryText?: string;
  }>;
  request?: {
    agentId?: string;
    model?: string;
    promptLen?: number;
  };
}

const SPAN_COLORS: Record<string, string> = {
  ok: '#22c55e',
  error: '#ef4444',
  skipped: '#6b7280',
};

const SPAN_ICONS: Record<string, string> = {
  ok: '\u2713',
  error: '\u2717',
  skipped: '\u2014',
};

const STEP_COLORS: Record<string, string> = {
  done: '#22c55e',
  failed: '#ef4444',
  delegated: '#3b82f6',
  skipped: '#6b7280',
  running: '#f59e0b',
  pending: '#a855f7',
  in_progress: '#f59e0b',
};

const STEP_ICONS: Record<string, string> = {
  done: '\u2713',
  failed: '\u2717',
  delegated: '\u2197',
  skipped: '\u2014',
  running: '\u25cf',
  pending: '\u2022',
  in_progress: '\u25cf',
};

function formatMs(ms?: number): string {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function SpanNode({ span, isLast }: { span: TraceSpan; isLast: boolean }) {
  const color = SPAN_COLORS[span.status] || '#6b7280';
  const icon = SPAN_ICONS[span.status] || '?';
  const label = span.name
    .replace(/-/g, ' ')
    .replace(/^(pre route|provider)/, (m) => m.charAt(0).toUpperCase() + m.slice(1));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
      {/* Node */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: color,
            border: `2px solid ${color}`,
            boxShadow: span.status === 'error' ? `0 0 6px ${color}44` : 'none',
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: 'var(--c-text-3)',
            textAlign: 'center',
            marginTop: 3,
            maxWidth: 64,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={span.name}
        >
          {label}
        </div>
        {span.durationMs != null && span.durationMs > 0 && (
          <div style={{ fontSize: 8, color: 'var(--c-text-4)', marginTop: 1 }}>
            {formatMs(span.durationMs)}
          </div>
        )}
        {span.status === 'error' && span.error?.message && (
          <div
            style={{
              fontSize: 8,
              color: '#ef4444',
              marginTop: 1,
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={span.error.message}
          >
            {span.error.message.slice(0, 30)}
          </div>
        )}
      </div>
      {/* Connector */}
      {!isLast && (
        <div
          style={{
            width: 20,
            height: 2,
            background: color,
            opacity: 0.5,
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}

function humanizeStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function ExecutionPlanRow({ step }: { step: NonNullable<TraceRecord['executionPlan']>[number] }) {
  const color = STEP_COLORS[step.status] || '#6b7280';
  const icon = STEP_ICONS[step.status] || '?';
  const isError = step.status === 'failed';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${color}22`,
        background: `${color}08`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: color,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)' }}>
          {step.order}. {step.title}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 999,
            background: `${color}20`,
            color,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {humanizeStatus(step.status)}
        </span>
        <span style={{ fontSize: 9, color: 'var(--c-text-4)' }}>{step.type}</span>
        {step.taskId && (
          <span style={{ fontSize: 9, color: 'var(--c-text-4)', fontFamily: 'monospace' }}>
            task {step.taskId.slice(0, 8)}
          </span>
        )}
      </div>
      {step.queryText && (
        <div style={{ fontSize: 10, color: 'var(--c-text-4)', lineHeight: 1.35 }}>
          {step.queryText}
        </div>
      )}
      {isError && step.error && (
        <div style={{ fontSize: 10, color: '#ef4444', lineHeight: 1.35 }}>{step.error}</div>
      )}
    </div>
  );
}

export function MessageTraceDrawer({
  traceId,
  traceRecord,
  model,
  totalMs,
}: {
  traceId: string;
  traceRecord?: string;
  model?: string;
  totalMs?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const trace = useMemo<TraceRecord | null>(() => {
    if (!traceRecord) return null;
    try {
      return JSON.parse(traceRecord) as TraceRecord;
    } catch {
      return null;
    }
  }, [traceRecord]);

  const statusColor = trace
    ? trace.status === 'ok'
      ? '#22c55e'
      : trace.status === 'error'
        ? '#ef4444'
        : '#f59e0b'
    : '#6b7280';
  const executionPlan = trace?.executionPlan || [];

  return (
    <div style={{ marginTop: 4 }}>
      {/* Collapsed pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 12,
          border: `1px solid ${statusColor}33`,
          background: `${statusColor}11`,
          color: statusColor,
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        Trace
        {totalMs && <span style={{ opacity: 0.7 }}>{formatMs(Number(totalMs))}</span>}
        {model && <span style={{ opacity: 0.6, fontWeight: 400 }}>{model}</span>}
        <svg
          width="8"
          height="8"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {/* Expanded trace pipeline */}
      {expanded && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            background: 'var(--c-bg-card, rgba(0,0,0,0.2))',
            overflowX: 'auto',
          }}
        >
          {trace && trace.spans.length > 0 ? (
            <>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  fontSize: 10,
                  color: 'var(--c-text-4)',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{trace.traceId}</span>
                <span>{trace.service}</span>
                {trace.totalMs != null && <span>{formatMs(trace.totalMs)}</span>}
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: `${statusColor}22`,
                    color: statusColor,
                    fontWeight: 600,
                    fontSize: 9,
                  }}
                >
                  {trace.status}
                </span>
              </div>

              {/* Pipeline visualization */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0,
                  overflowX: 'auto',
                  paddingBottom: 4,
                }}
              >
                {trace.spans.map((span, i) => (
                  <SpanNode key={span.name} span={span} isLast={i === trace.spans.length - 1} />
                ))}
              </div>

              {executionPlan.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 10,
                      color: 'var(--c-text-4)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Execution plan</span>
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: `${statusColor}18`,
                        color: statusColor,
                        fontSize: 9,
                      }}
                    >
                      {executionPlan.length} step{executionPlan.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {executionPlan
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((step) => (
                        <ExecutionPlanRow key={step.stepId} step={step} />
                      ))}
                  </div>
                </div>
              )}

              {/* Agent/model info */}
              {trace.request && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 9,
                    color: 'var(--c-text-5)',
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  {trace.request.agentId && <span>Agent: {trace.request.agentId}</span>}
                  {trace.request.model && (
                    <>
                      <span>Model: {trace.request.model}</span>
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'rgba(34,197,94,0.12)',
                          color: '#16a34a',
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                        }}
                        title="This model is backed by a rotating provider key pool"
                      >
                        rotating keys
                      </span>
                    </>
                  )}
                  {trace.request.promptLen && <span>Prompt: {trace.request.promptLen} chars</span>}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--c-text-4)', padding: 4 }}>
              Trace ID: <span style={{ fontFamily: 'monospace' }}>{traceId}</span>
              <br />
              <span style={{ opacity: 0.7 }}>
                Full trace data not available — enable trace mode before sending the message.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
