import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

interface CompareStream {
  text: string;
  done: boolean;
  error?: string;
}

interface CompareViewProps {
  compareStreams: Record<string, CompareStream>;
  compareWinner: string | null;
  availableModels: ModelInfo[];
  activeSessionId: string | null;
  onPickWinner: (modelId: string, text: string) => void;
  onDismiss: () => void;
}

export function CompareView({
  compareStreams,
  compareWinner,
  availableModels,
  activeSessionId,
  onPickWinner,
  onDismiss,
}: CompareViewProps) {
  if (Object.keys(compareStreams).length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto mt-4 mb-4">
      <div className="flex items-center gap-2 mb-3 px-1">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="var(--c-warning)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        <span className="text-xs font-semibold" style={{ color: "var(--c-warning)" }}>Model Comparison</span>
        {Object.values(compareStreams).every(s => s.done) && !compareWinner && (
          <span className="text-[10px] ml-2" style={{ color: "var(--c-text-4)" }}>Pick a winner to save as the response</span>
        )}
        {compareWinner && (
          <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "var(--c-success)" }}>
            Winner: {availableModels.find(m => m.id === compareWinner)?.name || compareWinner.split("/")[1]}
          </span>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Object.keys(compareStreams).length}, 1fr)` }}>
        {Object.entries(compareStreams).map(([modelId, stream]) => {
          const modelInfo = availableModels.find(m => m.id === modelId);
          const isWinner = compareWinner === modelId;
          return (
            <div
              key={modelId}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{
                background: "var(--c-bg-card)",
                border: isWinner ? "2px solid var(--c-success)" : "1px solid var(--c-border-2)",
                minHeight: "120px",
              }}
            >
              {/* Model header */}
              <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)", background: isWinner ? "rgba(34,197,94,0.08)" : "var(--c-bg-2)" }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{modelInfo?.icon || "?"}</span>
                  <span className="text-[11px] font-semibold" style={{ color: isWinner ? "var(--c-success)" : "var(--c-text-2)" }}>
                    {modelInfo?.name || modelId.split("/")[1]}
                  </span>
                  {isWinner && <span className="text-[10px]">&#x1F3C6;</span>}
                </div>
                <div className="flex items-center gap-1">
                  {stream.done ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: stream.error ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: stream.error ? "var(--c-danger)" : "var(--c-success)" }}>
                      {stream.error ? "Error" : `${stream.text.length} chars`}
                    </span>
                  ) : (
                    <span className="flex gap-0.5 items-center">
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--c-warning)", animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--c-warning)", animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "var(--c-warning)", animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
              {/* Response content */}
              <div className="flex-1 px-3 py-2 overflow-y-auto text-sm leading-relaxed" style={{ color: "var(--c-text-1)", maxHeight: "400px" }}>
                <Markdown remarkPlugins={[remarkGfm]}>{stream.text || "Waiting..."}</Markdown>
                {!stream.done && <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse rounded-sm" />}
              </div>
              {/* Pick winner button */}
              {stream.done && !stream.error && !compareWinner && (
                <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid var(--c-border-2)" }}>
                  <button
                    onClick={() => onPickWinner(modelId, stream.text)}
                    className="w-full text-center text-[11px] py-1.5 rounded-lg transition-all hover:scale-[1.02]"
                    style={{ background: "rgba(34,197,94,0.15)", color: "var(--c-success)", border: "1px solid rgba(34,197,94,0.3)" }}
                  >
                    Pick as winner
                  </button>
                </div>
              )}
              {isWinner && (
                <div className="px-3 py-1.5 text-center shrink-0" style={{ borderTop: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--c-success)" }}>Saved as response</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Dismiss compare results */}
      {compareWinner && (
        <div className="flex justify-center mt-3">
          <button
            onClick={onDismiss}
            className="text-[11px] px-3 py-1 rounded-lg transition-colors"
            style={{ color: "var(--c-text-4)", background: "var(--c-bg-active)" }}
          >
            Dismiss comparison
          </button>
        </div>
      )}
    </div>
  );
}
