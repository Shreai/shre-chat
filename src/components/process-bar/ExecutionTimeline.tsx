import type { ProcessRun, ProcessStep, ProcessStepKind } from './types';

// ---------------------------------------------------------------------------
// Stage config — icons, labels, colors for each execution phase
// ---------------------------------------------------------------------------

interface StageConfig {
  icon: string;
  label: string;
  color: string;
  glow: string;
}

const STAGES: Record<ProcessStepKind, StageConfig> = {
  thinking: {
    icon: '🧠',
    label: 'Thinking',
    color: 'var(--c-warning-soft, #fbbf24)',
    glow: 'rgba(251,191,36,0.3)',
  },
  planning: {
    icon: '📋',
    label: 'Planning',
    color: 'var(--c-purple, #a78bfa)',
    glow: 'rgba(167,139,250,0.3)',
  },
  tool_use: {
    icon: '⚡',
    label: 'Tool',
    color: 'var(--c-info-soft, #60a5fa)',
    glow: 'rgba(96,165,250,0.3)',
  },
  tool_result: {
    icon: '📦',
    label: 'Result',
    color: 'var(--c-cyan, #22d3ee)',
    glow: 'rgba(34,211,238,0.3)',
  },
  generating: {
    icon: '✍️',
    label: 'Writing',
    color: 'var(--c-success-soft, #4ade80)',
    glow: 'rgba(74,222,128,0.3)',
  },
  compacting: {
    icon: '📦',
    label: 'Compacting',
    color: 'var(--c-orange, #fb923c)',
    glow: 'rgba(251,146,60,0.3)',
  },
  done: {
    icon: '✅',
    label: 'Done',
    color: 'var(--c-emerald, #34d399)',
    glow: 'rgba(52,211,153,0.3)',
  },
  attention: {
    icon: '⚠️',
    label: 'Attention',
    color: 'var(--c-yellow, #facc15)',
    glow: 'rgba(250,204,21,0.3)',
  },
  approval: {
    icon: '🔐',
    label: 'Approval',
    color: 'var(--c-amber, #f59e0b)',
    glow: 'rgba(245,158,11,0.3)',
  },
  error: {
    icon: '❌',
    label: 'Error',
    color: 'var(--c-danger-soft, #f87171)',
    glow: 'rgba(248,113,113,0.3)',
  },
};

// ---------------------------------------------------------------------------
// Connector line between stages
// ---------------------------------------------------------------------------

function Connector({ completed }: { completed: boolean }) {
  return (
    <div
      style={{
        width: '20px',
        height: '2px',
        background: completed
          ? 'linear-gradient(90deg, var(--c-accent, #4ade80), var(--c-accent, #4ade80))'
          : 'linear-gradient(90deg, var(--c-border-2, rgba(255,255,255,0.1)), var(--c-border-2, rgba(255,255,255,0.1)))',
        flexShrink: 0,
        borderRadius: '1px',
        transition: 'background 0.4s ease',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Individual stage node
// ---------------------------------------------------------------------------

function StageNode({ step, isLast }: { step: ProcessStep; isLast: boolean }) {
  const config = STAGES[step.kind] ?? {
    icon: '?',
    label: step.kind,
    color: 'var(--c-text-4)',
    glow: 'rgba(255,255,255,0.1)',
  };
  const isActive = step.status === 'active';
  const isCompleted = step.status === 'completed';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          position: 'relative',
        }}
      >
        {/* Icon circle */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            background: isActive
              ? config.glow
              : isCompleted
                ? `${config.color}22`
                : 'var(--c-bg-card, rgba(255,255,255,0.04))',
            border: `1.5px solid ${isActive ? config.color : isCompleted ? `${config.color}66` : 'var(--c-border-2, rgba(255,255,255,0.08))'}`,
            boxShadow: isActive ? `0 0 8px ${config.glow}, 0 0 16px ${config.glow}` : 'none',
            transition: 'all 0.3s ease',
            animation: isActive ? 'execution-pulse 1.5s ease-in-out infinite' : 'none',
          }}
        >
          {config.icon}
        </div>

        {/* Label */}
        <span
          style={{
            fontSize: '9px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? config.color : isCompleted ? 'var(--c-text-3)' : 'var(--c-text-5)',
            whiteSpace: 'nowrap',
            transition: 'all 0.3s ease',
            maxWidth: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'center',
          }}
        >
          {step.toolName || config.label}
        </span>

        {/* Duration badge */}
        {step.completedAt && (
          <span
            style={{
              fontSize: '8px',
              color: 'var(--c-text-5)',
              lineHeight: 1,
            }}
          >
            {((step.completedAt - step.startedAt) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Connector to next stage */}
      {!isLast && <Connector completed={isCompleted} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExecutionTimeline — inline pipeline view
// ---------------------------------------------------------------------------

interface ExecutionTimelineProps {
  run: ProcessRun | null;
  className?: string;
  onExpand?: () => void;
}

export function ExecutionTimeline({ run, className, onExpand }: ExecutionTimelineProps) {
  if (!run || run.steps.length === 0) return null;

  const isComplete = !!run.completedAt;
  const elapsed = isComplete
    ? run.durationMs || run.completedAt! - run.startedAt
    : Date.now() - run.startedAt;

  return (
    <div
      className={className}
      onClick={onExpand}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '12px',
        background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
        border: '1px solid var(--c-border-2, rgba(255,255,255,0.06))',
        cursor: onExpand ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        minWidth: 0,
        overflow: 'hidden',
        marginBottom: '4px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--c-border-2, rgba(255,255,255,0.06))',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: isComplete ? 'var(--c-text-4)' : 'var(--c-text-2)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {isComplete ? 'Execution Complete' : 'Executing...'}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {run.model && (
            <span style={{ fontSize: '9px', color: 'var(--c-text-5)', fontFamily: 'monospace' }}>
              {run.model.split('/').pop()}
            </span>
          )}
          <span
            style={{
              fontSize: '9px',
              color: 'var(--c-text-5)',
              fontFamily: 'monospace',
            }}
          >
            {(elapsed / 1000).toFixed(1)}s
          </span>
          {onExpand && <span style={{ fontSize: '10px', color: 'var(--c-text-5)' }}>▸</span>}
        </div>
      </div>

      {/* Stage pipeline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '4px',
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {run.steps.map((step, i) => (
          <StageNode key={step.id} step={step} isLast={i === run.steps.length - 1} />
        ))}
      </div>
    </div>
  );
}
