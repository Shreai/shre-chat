import type { ProcessRun, ProcessStep, ProcessStepKind } from './types';

// ---------------------------------------------------------------------------
// SVG icons (inline — no lucide dependency in shre-chat)
// ---------------------------------------------------------------------------

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

const COLORS: Record<ProcessStepKind, { active: string; muted: string }> = {
  thinking: { active: 'var(--c-amber, #fbbf24)', muted: 'rgba(251,191,36,0.3)' },
  planning: { active: 'var(--c-violet, #a78bfa)', muted: 'rgba(167,139,250,0.3)' },
  model_call: { active: 'var(--c-indigo, #818cf8)', muted: 'rgba(129,140,248,0.3)' },
  tool_use: { active: 'var(--c-blue, #60a5fa)', muted: 'rgba(96,165,250,0.3)' },
  tool_result: { active: 'var(--c-cyan, #22d3ee)', muted: 'rgba(34,211,238,0.3)' },
  handoff: { active: 'var(--c-fuchsia, #e879f9)', muted: 'rgba(232,121,249,0.3)' },
  generating: { active: 'var(--c-green, #4ade80)', muted: 'rgba(74,222,128,0.3)' },
  compacting: { active: 'var(--c-orange, #fb923c)', muted: 'rgba(251,146,60,0.3)' },
  done: { active: 'var(--c-emerald, #34d399)', muted: 'rgba(52,211,153,0.3)' },
  attention: { active: 'var(--c-yellow, #facc15)', muted: 'rgba(250,204,21,0.3)' },
  approval: { active: 'var(--c-amber, #f59e0b)', muted: 'rgba(245,158,11,0.3)' },
  error: { active: 'var(--c-red, #f87171)', muted: 'rgba(248,113,113,0.3)' },
};

function StepPill({
  step,
  compact,
  onClick,
}: {
  step: ProcessStep;
  compact?: boolean;
  onClick?: () => void;
}) {
  const isActive = step.status === 'active';
  const colorEntry = COLORS[step.kind] ?? { active: 'var(--c-text-3)', muted: 'var(--c-text-5)' };
  const color = isActive ? colorEntry.active : colorEntry.muted;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '9999px',
        padding: '3px 8px',
        fontSize: '10px',
        background: isActive ? 'var(--c-bg-active, rgba(255,255,255,0.06))' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isActive ? color : 'transparent'}`,
        cursor: 'pointer',
        color,
        transition: 'all 0.2s',
        flexShrink: 0,
        boxShadow: isActive ? `0 0 8px ${color}33` : 'none',
        animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
      }}
      title={`${step.label} — click for details`}
    >
      <span style={{ fontSize: '12px' }}>{ICONS[step.kind]}</span>
      {!compact && (
        <span
          style={{
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--c-text-1)' : 'var(--c-text-4)',
          }}
        >
          {step.toolName || step.label}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProcessBar
// ---------------------------------------------------------------------------

interface ProcessBarProps {
  runs: ProcessRun[];
  activeRun: ProcessRun | null;
  onStepClick?: (runId: string, stepId: string) => void;
  compact?: boolean;
  className?: string;
}

export function ProcessBar({ runs, activeRun, onStepClick, compact, className }: ProcessBarProps) {
  const displayRun = activeRun ?? (runs.length > 0 ? runs[runs.length - 1] : null);
  if (!displayRun || displayRun.steps.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 16px',
        borderTop: '1px solid var(--c-border-2, rgba(255,255,255,0.08))',
        background: 'var(--c-bg-3, rgba(20,20,20,0.4))',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.98); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      
      {displayRun.steps.map((step) => (
        <StepPill
          key={step.id}
          step={step}
          compact={compact}
          onClick={() => onStepClick?.(displayRun.id, step.id)}
        />
      ))}

      {!compact && displayRun.completedAt && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '10px',
            color: 'var(--c-text-5, rgba(255,255,255,0.3))',
            flexShrink: 0,
            paddingLeft: '12px',
            borderLeft: '1px solid var(--c-border-2)',
          }}
        >
          {displayRun.model && (
            <span title={displayRun.model} style={{ color: 'var(--c-accent-soft)' }}>
              {displayRun.model.split('/').pop()}
            </span>
          )}
          {displayRun.tokenUsage && (
            <span title="Tokens used">
              {displayRun.tokenUsage.input} + {displayRun.tokenUsage.output}
            </span>
          )}
          {displayRun.durationMs && (
            <span style={{ fontWeight: 500 }}>
              {(displayRun.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
