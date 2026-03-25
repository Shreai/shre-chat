import React from "react";

export function DragOverlay() {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex flex-col items-center gap-3 px-12 py-10 rounded-2xl"
        style={{
          border: "2px dashed var(--c-accent, #3b82f6)",
          background: "rgba(59, 130, 246, 0.08)",
        }}
      >
        <svg className="h-10 w-10" style={{ color: "var(--c-accent, #3b82f6)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-sm font-medium" style={{ color: "var(--c-text-1, #fff)" }}>Drop files here</span>
        <span className="text-[11px]" style={{ color: "var(--c-text-4, #888)" }}>Max 5MB per file</span>
      </div>
    </div>
  );
}
