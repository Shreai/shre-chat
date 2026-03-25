import React, { lazy, Suspense } from "react";
import { ViewErrorBoundary } from "../ViewErrorBoundary";

const ContentCard = lazy(() => import("./ContentCard"));

interface PreviewPanelProps {
  content: { content: string; type: string; title?: string };
  onClose: () => void;
}

export function PreviewPanel({ content, onClose }: PreviewPanelProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: "var(--c-bg-1)" }}>
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{content.type === "chart" ? "\u{1F4CA}" : content.type === "json" ? "{}" : content.type === "table" ? "\u{1F4CB}" : "</>"}</span>
          <span className="text-xs font-medium" style={{ color: "var(--c-text-1)" }}>{content.title || `${content.type.toUpperCase()} Preview`}</span>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--c-text-4)" }}
          aria-label="Close preview"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <ViewErrorBoundary viewName="Content Preview">
          <Suspense fallback={<div className="flex items-center justify-center h-full" style={{ color: "var(--c-text-4)" }}>Loading...</div>}>
            <ContentCard type={content.type} content={content.content} title={content.title} />
          </Suspense>
        </ViewErrorBoundary>
      </div>
    </div>
  );
}
