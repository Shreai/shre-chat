import type { ProcessRun, ProcessStep, ProcessStepKind } from "./types";

const ICONS: Record<ProcessStepKind, string> = {
  thinking: "🧠", planning: "📋", tool_use: "⚡", tool_result: "📦", generating: "✎",
  compacting: "⟳", done: "✅", attention: "⚠️", approval: "🔐", error: "❌",
};

const COLORS: Record<ProcessStepKind, string> = {
  thinking: "#fbbf24", planning: "#a78bfa", tool_use: "#60a5fa", tool_result: "#22d3ee", generating: "#4ade80",
  compacting: "#fb923c", done: "#34d399", attention: "#facc15", approval: "#f59e0b", error: "#f87171",
};

function TimelineStep({ step, highlight }: { step: ProcessStep; highlight?: boolean }) {
  const duration = step.completedAt
    ? ((step.completedAt - step.startedAt) / 1000).toFixed(1) + "s"
    : "...";

  return (
    <div style={{
      display: "flex",
      gap: "10px",
      padding: "8px 10px",
      borderRadius: "8px",
      background: highlight ? "var(--c-bg-active)" : "transparent",
      transition: "background 0.15s",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: "14px", color: COLORS[step.kind] }}>{ICONS[step.kind]}</span>
        <div style={{ width: "1px", flex: 1, background: "var(--c-border-2)", marginTop: "4px" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-2)" }}>{step.label}</span>
          <span style={{ fontSize: "9px", color: "var(--c-text-5)" }}>{duration}</span>
        </div>
        {step.toolName && (
          <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--c-text-4)", fontFamily: "monospace" }}>
            {step.toolName}
            {step.toolArgs != null && (
              <pre style={{ marginTop: "2px", padding: "4px 6px", borderRadius: "4px", background: "var(--c-bg-card)", fontSize: "9px", overflowX: "auto", maxHeight: "80px" }}>
                {typeof step.toolArgs === "string" ? step.toolArgs : JSON.stringify(step.toolArgs, null, 2) as string}
              </pre>
            )}
          </div>
        )}
        {step.toolOutput && (
          <pre style={{ marginTop: "4px", padding: "4px 6px", borderRadius: "4px", background: "var(--c-bg-card)", fontSize: "9px", color: "var(--c-text-4)", overflowX: "auto", maxHeight: "100px", whiteSpace: "pre-wrap" }}>
            {step.toolOutput.length > 500 ? step.toolOutput.slice(0, 500) + "..." : step.toolOutput}
          </pre>
        )}
        {step.kind === "thinking" && step.detail && (
          <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--c-text-5)", fontStyle: "italic", whiteSpace: "pre-wrap", maxHeight: "100px", overflowY: "auto" }}>
            {step.detail}
          </p>
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
    ? (run.durationMs / 1000).toFixed(1) + "s"
    : run.completedAt
      ? ((run.completedAt - run.startedAt) / 1000).toFixed(1) + "s"
      : "in progress";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--c-bg-main)", color: "var(--c-text-1)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--c-border-2)" }}>
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--c-text-1)" }}>Process Detail</h3>
          <p style={{ fontSize: "10px", color: "var(--c-text-5)", marginTop: "2px" }}>
            {run.steps.length} steps — {totalDuration}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--c-text-4)", fontSize: "16px", padding: "4px" }}>✕</button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {run.steps.map((step) => (
          <TimelineStep key={step.id} step={step} highlight={step.id === highlightStepId} />
        ))}
      </div>

      {/* Footer metadata */}
      {run.completedAt && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--c-border-2)", display: "flex", alignItems: "center", gap: "12px", fontSize: "10px", color: "var(--c-text-5)" }}>
          {run.model && <span>{run.model.split("/").pop()}</span>}
          {run.tokenUsage && <span>{run.tokenUsage.input}in / {run.tokenUsage.output}out</span>}
          <span>{totalDuration}</span>
        </div>
      )}
    </div>
  );
}
