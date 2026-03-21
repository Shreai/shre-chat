import React from "react";
import { getAgent } from "../store";
import {
  SDialog,
  SDialogContent,
  SInput,
  SBadge,
} from "@shre/ui-kit";

interface SearchResult {
  agentId: string;
  sessionId: string;
  matches: number;
  preview: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  results: SearchResult[];
  searching: boolean;
  onSearch: () => void;
  onResultClick: (result: SearchResult) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  results,
  searching,
  onSearch,
  onResultClick,
  inputRef,
}: GlobalSearchModalProps) {
  return (
    <SDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SDialogContent className="max-w-lg p-4 gap-3" style={{ marginTop: "15vh" }}>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted, var(--c-text-4))" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { onClose(); return; }
              if (e.key === "Enter" && query.trim().length >= 2) {
                onSearch();
              }
            }}
            placeholder="Search across all sessions... (Enter to search)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text, var(--c-text-1))" }}
            autoFocus
          />
          {searching && <span className="text-[10px] animate-pulse" style={{ color: "var(--color-primary, var(--c-accent))" }}>Searching...</span>}
        </div>
        <div className="overflow-y-auto flex-1 max-h-[45vh] space-y-1">
          {results.length === 0 && !searching && query.trim().length >= 2 && (
            <div className="text-xs text-center py-4" style={{ color: "var(--color-text-muted, var(--c-text-5))" }}>No results found</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.agentId}-${r.sessionId}-${i}`}
              className="w-full text-left rounded-lg px-3 py-2 text-xs transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface-raised, var(--c-bg-3))", color: "var(--color-text-secondary, var(--c-text-2))" }}
              onClick={() => onResultClick(r)}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium" style={{ color: "var(--color-primary, var(--c-accent))" }}>{r.agentId}</span>
                <SBadge variant="outline" className="text-[9px] py-0 h-4">{r.matches} match{r.matches !== 1 ? "es" : ""}</SBadge>
              </div>
              <div className="truncate" style={{ color: "var(--color-text-muted, var(--c-text-4))" }}>{r.preview}</div>
            </button>
          ))}
        </div>
      </SDialogContent>
    </SDialog>
  );
}
