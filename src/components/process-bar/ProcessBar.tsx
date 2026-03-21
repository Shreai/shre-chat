import type { ProcessRun, ProcessStep, ProcessStepKind } from "./types";

// ---------------------------------------------------------------------------
// SVG icons (inline — no lucide dependency in shre-chat)
// ---------------------------------------------------------------------------

const ICONS: Record<ProcessStepKind, string> = {
  thinking:   "🧠",
  planning:   "📋",
  tool_use:   "⚡",
  generating: "✎",
  compacting: "⟳",
  done:       "✅",
  attention:  "⚠️",
  approval:   "🔐",
  error:      "❌",
};

const COLORS: Record<ProcessStepKind, { active: string; muted: string }> = {
  thinking:   { active: "var(--c-amber, #fbbf24)",  muted: "rgba(251,191,36,0.4)" },
  planning:   { active: "var(--c-violet, #a78bfa)", muted: "rgba(167,139,250,0.4)" },
  tool_use:   { active: "var(--c-blue, #60a5fa)",   muted: "rgba(96,165,250,0.4)" },
  generating: { active: "var(--c-green, #4ade80)",   muted: "rgba(74,222,128,0.4)" },
  compacting: { active: "var(--c-orange, #fb923c)",  muted: "rgba(251,146,60,0.4)" },
  done:       { active: "var(--c-emerald, #34d399)", muted: "rgba(52,211,153,0.4)" },
  attention:  { active: "var(--c-yellow, #facc15)",  muted: "rgba(250,204,21,0.4)" },
  approval:   { active: "var(--c-amber, #f59e0b)",   muted: "rgba(245,158,11,0.4)" },
  error:      { active: "var(--c-red, #f87171)",     muted: "rgba(248,113,113,0.4)" },
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
  const isActive = step.status === "active";
  const color = isActive ? COLORS[step.kind].active : COLORS[step.kind].muted;

  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        borderRadius: "9999px",
        padding: "2px 6px",
        fontSize: "10px",
        background: isActive ? "var(--c-bg-active, rgba(255,255,255,0.06))" : "transparent",
        border: "none",
        cursor: "pointer",
        color,
        transition: "all 0.15s",
        flexShrink: 0,
        animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
      }}
      title={step.label}
    >
      <span style={{ fontSize: "11px" }}>{ICONS[step.kind]}</span>
      {!compact && (
        <span style={{
          maxWidth: "100px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: isActive ? "var(--c-text-2)" : "var(--c-text-4)",
        }}>
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
  const displayRun = activeRun ?? runs[runs.length - 1];
  if (!displayRun || displayRun.steps.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 12px",
        borderTop: "1px solid var(--c-border-2, rgba(255,255,255,0.08))",
        background: "var(--c-bg-active, rgba(255,255,255,0.03))",
        flexShrink: 0,
        overflowX: "auto",
      }}
    >
      {displayRun.steps.map((step) => (
        <StepPill
          key={step.id}
          step={step}
          compact={compact}
          onClick={() => onStepClick?.(displayRun.id, step.id)}
        />
      ))}

      {!compact && displayRun.completedAt && (
        <div style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "9px",
          color: "var(--c-text-5, rgba(255,255,255,0.3))",
          flexShrink: 0,
        }}>
          {displayRun.model && <span>{displayRun.model.split("/").pop()}</span>}
          {displayRun.tokenUsage && <span>{displayRun.tokenUsage.input}in/{displayRun.tokenUsage.output}out</span>}
          {displayRun.durationMs && <span>{(displayRun.durationMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
}
