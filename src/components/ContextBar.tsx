import React from "react";
import type { ChatMessage, RouterModel } from "../openclaw";
import { estimateTokens, formatTokenCount, getContextColor, DEFAULT_CONTEXT_LIMIT } from "../chat-utils";

export interface ContextBarProps {
  messages: ChatMessage[];
  selectedModel: string | null;
  modelContextLimits: Record<string, number>;
  dynamicModelsCount: number;
}

export function ContextBar({ messages, selectedModel, modelContextLimits, dynamicModelsCount }: ContextBarProps) {
  if (messages.length === 0) return null;

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const modelId = selectedModel || "openai/gpt-4o";
  const knownLimit = modelContextLimits[modelId];
  if (!knownLimit && dynamicModelsCount > 0) return null;
  const contextLimit = knownLimit || DEFAULT_CONTEXT_LIMIT;
  const usagePct = Math.min((totalTokens / contextLimit) * 100, 100);
  const color = getContextColor(usagePct);

  return (
    <div className="shrink-0 relative" style={{ height: "3px", background: "var(--c-border-1)" }}
      title={`Context usage: ~${formatTokenCount(totalTokens)} / ${(contextLimit / 1000).toFixed(0)}k limit (${usagePct.toFixed(1)}%)`}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${usagePct}%`,
        background: color,
        transition: "width 0.3s ease, background 0.3s ease",
      }} />
      {usagePct > 80 && (
        <div className="absolute right-1 flex items-center gap-1" style={{ top: "4px" }}>
          <span className="text-[9px] font-medium px-1 py-0.5 rounded"
            style={{ color: "var(--c-on-accent)", background: color, lineHeight: 1, opacity: 0.9 }}>
            {usagePct.toFixed(0)}% context
          </span>
        </div>
      )}
    </div>
  );
}
