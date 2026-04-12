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
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

              {/* Agent/model info */}
              {trace.request && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 9,
                    color: 'var(--c-text-5)',
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  {trace.request.agentId && <span>Agent: {trace.request.agentId}</span>}
                  {trace.request.model && <span>Model: {trace.request.model}</span>}
                  {trace.request.promptLen && <span>Prompt: {trace.request.promptLen} chars</span>}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--c-text-4)', padding: 4 }}>
              Trace ID: <span style={{ fontFamily: 'monospace' }}>{traceId}</span>
              <br />
              <span style={{ opacity: 0.7 }}>Full trace data not available — enable trace mode before sending the message.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
