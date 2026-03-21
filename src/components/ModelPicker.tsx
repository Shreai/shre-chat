import React, { useEffect, useRef, useState } from "react";
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
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const filtered = search.trim()
    ? models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))
    : models;

  const providers = [...new Set(filtered.map(m => m.provider))];

  return (
    <div ref={pickerRef} style={{ position: "relative" }}>
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
        <span className="hidden sm:inline max-w-[100px] truncate">
          {selectedModel
            ? models.find(m => m.id === selectedModel)?.name || selectedModel.split("/")[1]
            : "Model"}
        </span>
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />

          <div
            ref={panelRef}
            className="absolute right-0 top-9 z-50 flex flex-col rounded-xl overflow-hidden shadow-2xl model-picker-dropdown"
            style={{
              width: 300,
              maxHeight: "min(520px, calc(100dvh - 80px))",
              background: "var(--c-bg-2)",
              border: "1px solid var(--c-border-1)",
              animation: "picker-fade-in 150ms ease-out forwards",
            }}
          >
            <div className="px-3 pt-3 pb-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--c-text-1)" }}>Select Model</span>
                <span className="text-[10px]" style={{ color: "var(--c-text-4)" }}>for {agentName}</span>
              </div>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg text-[12px] outline-none transition-colors"
                  style={{
                    background: "var(--c-bg-3)",
                    color: "var(--c-text-1)",
                    border: "1px solid var(--c-border-2)",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--c-accent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--c-border-2)"; }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <button
                onClick={() => { onSelectModel(null); onClose(); }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                style={{
                  color: !selectedModel ? "var(--c-accent)" : "var(--c-text-2)",
                  background: !selectedModel ? "var(--c-accent-soft)" : "transparent",
                }}
                onMouseEnter={(e) => { if (selectedModel) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                onMouseLeave={(e) => { if (selectedModel) e.currentTarget.style.background = "transparent"; }}
              >
                <span className="text-sm">&#x26A1;</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">Default (Auto)</div>
                  <div className="text-[10px]" style={{ color: "var(--c-text-4)" }}>Agent's configured model</div>
                </div>
                {!selectedModel && (
                  <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>

              {providers.map(provider => {
                const providerModels = filtered.filter(m => m.provider === provider);
                if (!providerModels.length) return null;
                return (
                  <div key={provider}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)", background: "var(--c-bg-3)" }}>
                      {provider}
                    </div>
                    {providerModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { if (m.connected === false) return; onSelectModel(m.id); onClose(); }}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors"
                        style={{
                          color: selectedModel === m.id ? "var(--c-accent)" : m.connected === false ? "var(--c-text-4)" : "var(--c-text-2)",
                          background: selectedModel === m.id ? "var(--c-accent-soft)" : "transparent",
                          opacity: m.connected === false ? 0.5 : 1,
                          cursor: m.connected === false ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => { if (selectedModel !== m.id && m.connected !== false) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                        onMouseLeave={(e) => { if (selectedModel !== m.id) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span className="text-sm">{m.icon}</span>
                        <span className="text-[13px] flex-1 truncate">{m.name}</span>
                        {m.connected === false && <SBadge variant="destructive" className="text-[9px] py-0 h-4">offline</SBadge>}
                        {selectedModel === m.id && (
                          <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}

              {filtered.length === 0 && search && (
                <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--c-text-4)" }}>
                  No models match "{search}"
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes picker-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          .model-picker-dropdown {
            position: fixed !important;
            left: 8px !important;
            right: 8px !important;
            top: auto !important;
            bottom: 60px !important;
            width: auto !important;
            max-height: min(400px, calc(100dvh - 120px)) !important;
          }
        }
      `}</style>
    </div>
  );
}
