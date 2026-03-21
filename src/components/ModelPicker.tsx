import React from "react";
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
  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={onToggle}
        className="h-7 rounded-lg flex items-center gap-1 px-2 text-[10px] transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        style={{
          color: selectedModel ? "var(--c-accent)" : "var(--c-text-4)",
          background: open ? "var(--c-bg-active)" : "transparent",
          border: selectedModel ? "1px solid var(--c-accent-soft)" : "1px solid transparent",
        }}
        title="Switch AI model"
        aria-label="Switch AI model"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        <span className="hidden sm:inline max-w-[80px] truncate">
          {selectedModel
            ? models.find(m => m.id === selectedModel)?.name || selectedModel.split("/")[1]
            : "Model"}
        </span>
      </button>
      {open && (
        <>
        {/* Mobile backdrop */}
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
        <div
          className="fixed md:absolute inset-x-0 bottom-0 md:inset-x-auto md:bottom-auto md:right-0 md:top-9 z-50 md:w-64 rounded-t-2xl md:rounded-xl overflow-hidden shadow-xl"
          style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)", backdropFilter: "none", isolation: "isolate", maxHeight: "60vh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Mobile drag handle */}
          <div className="flex justify-center py-2 md:hidden">
            <div className="w-10 h-1 rounded-full" style={{ background: "var(--c-text-5)" }} />
          </div>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--c-text-5)", borderBottom: "1px solid var(--c-border-1)" }}>
            <span>AI Model for {agentName}</span>
            <button className="md:hidden text-xs" style={{ color: "var(--c-text-3)" }} onClick={onClose}>Done</button>
          </div>
          {/* Default (agent's configured model) */}
          <button
            onClick={() => { onSelectModel(null); onClose(); }}
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:brightness-110"
            style={{
              color: !selectedModel ? "var(--c-accent)" : "var(--c-text-2)",
              background: !selectedModel ? "var(--c-accent-soft)" : "var(--c-bg-2)",
            }}
          >
            <span>&#x26A1;</span>
            <div>
              <div className="font-medium">Default (Auto)</div>
              <div className="text-[10px]" style={{ color: "var(--c-text-4)" }}>Uses agent's configured model</div>
            </div>
          </button>
          <div className="max-h-64 overflow-y-auto">
            {[...new Set(models.map(m => m.provider))].map(provider => {
              const providerModels = models.filter(m => m.provider === provider);
              if (!providerModels.length) return null;
              return (
                <div key={provider}>
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider" style={{ color: "var(--c-text-5)", background: "var(--c-bg-1)" }}>
                    {provider}
                  </div>
                  {providerModels.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { if (m.connected === false) return; onSelectModel(m.id); onClose(); }}
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:brightness-110"
                      style={{
                        color: selectedModel === m.id ? "var(--c-accent)" : m.connected === false ? "var(--c-text-5)" : "var(--c-text-2)",
                        background: selectedModel === m.id ? "var(--c-accent-soft)" : "var(--c-bg-2)",
                        opacity: m.connected === false ? 0.5 : 1,
                        cursor: m.connected === false ? "not-allowed" : "pointer",
                      }}
                    >
                      <span>{m.icon}</span>
                      <span>{m.name}</span>
                      {m.connected === false && <SBadge variant="destructive" className="ml-auto text-[8px] py-0 h-4">offline</SBadge>}
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
