import type { ProcessRun, ProcessStep, ProcessStepKind } from './types';

const ICONS: Record<ProcessStepKind, string> = {
  thinking: '🧠',
  planning: '📋',
  model_call: '🤖',
  tool_use: '⚡',
  tool_result: '📦',
  handoff: '🤝',
  generating: '✎',
  compacting: '⟳',
  done: '✅',
  attention: '⚠️',
  approval: '🔐',
  error: '❌',
};

const COLORS: Record<ProcessStepKind, string> = {
  thinking: '#fbbf24',
  planning: '#a78bfa',
  model_call: '#818cf8',
  tool_use: '#60a5fa',
  tool_result: '#22d3ee',
  handoff: '#e879f9',
  generating: '#4ade80',
  compacting: '#fb923c',
  done: '#34d399',
  attention: '#facc15',
  approval: '#f59e0b',
  error: '#f87171',
};

function TimelineStep({ step, highlight }: { step: ProcessStep; highlight?: boolean }) {
  const duration = step.completedAt
    ? ((step.completedAt - step.startedAt) / 1000).toFixed(1) + 's'
    : '...';

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '10px 14px',
        borderRadius: '10px',
        background: highlight ? 'var(--c-bg-active, rgba(255,255,255,0.05))' : 'transparent',
        transition: 'background 0.2s',
        marginBottom: '4px',
      }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}
      >
        <div 
          style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            background: `${COLORS[step.kind]}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${COLORS[step.kind]}33`
          }}
        >
          <span style={{ fontSize: '15px' }}>{ICONS[step.kind]}</span>
        </div>
        <div style={{ width: '1.5px', flex: 1, background: 'var(--c-border-2, rgba(255,255,255,0.1))', marginTop: '6px' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-text-2)' }}>
            {step.label}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--c-text-5)', opacity: 0.7 }}>{duration}</span>
          <span 
            style={{ 
              fontSize: '9px', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px', 
              color: COLORS[step.kind],
              fontWeight: 700,
              opacity: 0.8
            }}
          >
            {step.kind.replace('_', ' ')}
          </span>
        </div>
        
        {step.detail && (
          <p
            style={{
              marginTop: '4px',
              fontSize: '11px',
              color: 'var(--c-text-4)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {step.detail}
          </p>
        )}

        {step.toolName && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '11px',
              background: 'var(--c-bg-card, rgba(0,0,0,0.1))',
              borderRadius: '6px',
              border: '1px solid var(--c-border-2)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '4px 8px', background: 'var(--c-bg-3)', borderBottom: '1px solid var(--c-border-2)', fontSize: '10px', fontWeight: 600, color: 'var(--c-accent-soft)' }}>
              TOOL: {step.toolName}
            </div>
            {step.toolArgs != null && (
              <pre
                style={{
                  padding: '8px',
                  fontSize: '10px',
                  color: 'var(--c-text-3)',
                  overflowX: 'auto',
                  maxHeight: '120px',
                  margin: 0,
                  fontFamily: 'ui-monospace, monospace'
                }}
              >
                {typeof step.toolArgs === 'string'
                  ? step.toolArgs
                  : JSON.stringify(step.toolArgs, null, 2)}
              </pre>
            )}
            {step.toolOutput && (
              <div style={{ borderTop: '1px solid var(--c-border-2)' }}>
                <div style={{ padding: '4px 8px', background: 'var(--c-bg-3)', borderBottom: '1px solid var(--c-border-2)', fontSize: '10px', fontWeight: 600, color: 'var(--c-success)' }}>
                  OUTPUT
                </div>
                <pre
                  style={{
                    padding: '8px',
                    fontSize: '10px',
                    color: 'var(--c-text-4)',
                    overflowX: 'auto',
                    maxHeight: '150px',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, monospace'
                  }}
                >
                  {step.toolOutput.length > 1000 ? step.toolOutput.slice(0, 1000) + '\n\n[... truncated ...]' : step.toolOutput}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProcessDetailProps {
  run: ProcessRun | null;
  highlightStepId?: string;
  onClose?: () => void;
}

export function ProcessDetail({ run, highlightStepId, onClose }: ProcessDetailProps) {
  if (!run) return null;

  const totalDuration = run.durationMs
    ? (run.durationMs / 1000).toFixed(1) + 's'
    : run.completedAt
      ? ((run.completedAt - run.startedAt) / 1000).toFixed(1) + 's'
      : 'running';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--c-bg-main)',
        color: 'var(--c-text-1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--c-border-2)',
          background: 'var(--c-bg-2)',
        }}
      >
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-text-1)', margin: 0 }}>
            Agent Thought Process
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--c-text-5)', marginTop: '2px', margin: 0 }}>
            {run.steps.length} activities • {totalDuration} elapsed
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              border: '1px solid var(--c-border-2)',
              background: 'var(--c-bg-3)',
              cursor: 'pointer',
              color: 'var(--c-text-4)',
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s'
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {run.steps.map((step) => (
          <TimelineStep key={step.id} step={step} highlight={step.id === highlightStepId} />
        ))}
      </div>

      {/* Footer metadata */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--c-border-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: 'var(--c-text-5)',
          background: 'var(--c-bg-2)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          {run.model && (
            <span style={{ color: 'var(--c-accent-soft)' }}>
              <b>MODEL:</b> {run.model.split('/').pop()}
            </span>
          )}
          {run.tokenUsage && (
            <span>
              <b>TOKENS:</b> {run.tokenUsage.input} in / {run.tokenUsage.output} out
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600 }}>
          {totalDuration} TOTAL
        </div>
      </div>
    </div>
  );
}
