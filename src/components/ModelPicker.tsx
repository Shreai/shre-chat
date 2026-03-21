import React, { useEffect, useRef } from "react";
import { SBadge } from "@shre/ui-kit";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

interface ModelPickerProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  selectedModel: string | null;
  onSelectModel: (modelId: string | null) => void;
  models: ModelInfo[];
  agentName: string;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}

export function ModelPicker({
  open,
  onToggle,
  onClose,
  selectedModel,
  onSelectModel,
  models,
  agentName,
  pickerRef,
}: ModelPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, pickerRef]);

  return (
    <div ref={pickerRef}>
      <button
        onClick={onToggle}
        className="h-7 rounded-lg flex items-center gap-1 px-2 text-[11px] transition-all"
        style={{
          color: selectedModel ? "var(--c-accent)" : "var(--c-text-3)",
          background: open ? "var(--c-bg-active)" : "transparent",
          border: selectedModel ? "1px solid var(--c-accent-soft)" : "1px solid transparent",
        }}
        title="Switch AI model"
        aria-label="Switch AI model"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        <span className="hidden sm:inline max-w-[80px] truncate">
          {selectedModel
            ? models.find(m => m.id === selectedModel)?.name || selectedModel.split("/")[1]
            : "Model"}
        </span>
      </button>

      {open && (
        <>
        <div
          className="fixed inset-0 z-[70]"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
        />

        <div
          ref={panelRef}
          className="fixed top-0 left-0 h-full z-[71] flex flex-col"
          style={{
            width: 280,
            background: "var(--c-bg-2)",
            borderRight: "1px solid var(--c-border-2)",
            boxShadow: "4px 0 24px rgba(0,0,0,0.3)",
            animation: "slide-in-left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
          }}
        >
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Select Model</span>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: "var(--c-text-3)" }}
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-3 py-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>
          For {agentName}
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => { onSelectModel(null); onClose(); }}
            className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
            style={{
              color: !selectedModel ? "var(--c-accent)" : "var(--c-text-2)",
              background: !selectedModel ? "var(--c-accent-soft)" : "transparent",
            }}
            onMouseEnter={(e) => { if (selectedModel) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
            onMouseLeave={(e) => { if (selectedModel) e.currentTarget.style.background = "transparent"; }}
          >
            <span className="text-base">&#x26A1;</span>
            <div>
              <div className="text-sm font-medium">Default (Auto)</div>
              <div className="text-[11px]" style={{ color: "var(--c-text-4)" }}>Agent's configured model</div>
            </div>
            {!selectedModel && (
              <svg className="h-4 w-4 ml-auto shrink-0" style={{ color: "var(--c-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </button>

          {[...new Set(models.map(m => m.provider))].map(provider => {
            const providerModels = models.filter(m => m.provider === provider);
            if (!providerModels.length) return null;
            return (
              <div key={provider}>
                <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)", background: "var(--c-bg-3)" }}>
                  {provider}
                </div>
                {providerModels.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { if (m.connected === false) return; onSelectModel(m.id); onClose(); }}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{
                      color: selectedModel === m.id ? "var(--c-accent)" : m.connected === false ? "var(--c-text-4)" : "var(--c-text-2)",
                      background: selectedModel === m.id ? "var(--c-accent-soft)" : "transparent",
                      opacity: m.connected === false ? 0.5 : 1,
                      cursor: m.connected === false ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (selectedModel !== m.id && m.connected !== false) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                    onMouseLeave={(e) => { if (selectedModel !== m.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span className="text-base">{m.icon}</span>
                    <span className="text-sm flex-1">{m.name}</span>
                    {m.connected === false && <SBadge variant="destructive" className="text-[9px] py-0 h-4">offline</SBadge>}
                    {selectedModel === m.id && (
                      <svg className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
