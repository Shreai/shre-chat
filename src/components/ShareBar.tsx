import React from "react";

export interface ShareBarProps {
  shareUrl: string;
  shareCopied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export function ShareBar({ shareUrl, shareCopied, onCopy, onClose }: ShareBarProps) {
  return (
    <div
      className="shrink-0 flex items-center gap-2 px-4 py-2"
      style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-2)" }}
    >
      <input
        type="text"
        readOnly
        value={shareUrl}
        className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none truncate"
        style={{ background: "var(--c-bg-input)", color: "var(--c-text-2)" }}
        onFocus={(e) => e.target.select()}
      />
      <button
        onClick={onCopy}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
        style={{
          background: shareCopied ? "var(--c-success-bg)" : "var(--c-accent)",
          color: shareCopied ? "var(--c-success)" : "var(--c-on-accent)",
        }}
      >
        {shareCopied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: "var(--c-text-3)" }}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}
