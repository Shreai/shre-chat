import React from 'react';
import { getAgent } from '../store';
import { SDialog, SDialogContent, SInput, SBadge } from '@shre/ui-kit';

interface SearchResult {
  agentId?: string;
  sessionId?: string;
  matches: number;
  preview: string;
  type?: string;
  createdAt?: number | string;
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
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
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
  agentFilter,
  setAgentFilter,
  typeFilter,
  setTypeFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: GlobalSearchModalProps) {
  const filtered = results.filter((r) => {
    if (agentFilter && (r.agentId || '').toLowerCase() !== agentFilter.toLowerCase()) return false;
    if (typeFilter && (r.type || '').toLowerCase() !== typeFilter.toLowerCase()) return false;
    const ts =
      typeof r.createdAt === 'string'
        ? Date.parse(r.createdAt)
        : typeof r.createdAt === 'number'
          ? r.createdAt
          : 0;
    if (dateFrom) {
      const fromTs = Date.parse(`${dateFrom}T00:00:00`);
      if (Number.isFinite(fromTs) && ts && ts < fromTs) return false;
    }
    if (dateTo) {
      const toTs = Date.parse(`${dateTo}T23:59:59`);
      if (Number.isFinite(toTs) && ts && ts > toTs) return false;
    }
    return true;
  });
  return (
    <SDialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <SDialogContent className="max-w-lg p-4 gap-3" style={{ marginTop: '15vh' }}>
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--color-text-muted, var(--c-text-4))' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
                return;
              }
              if (e.key === 'Enter' && query.trim().length >= 2) {
                onSearch();
              }
            }}
            placeholder="Search across all sessions... (Enter to search)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text, var(--c-text-1))' }}
            autoFocus
          />
          {searching && (
            <span
              className="text-[10px] animate-pulse"
              style={{ color: 'var(--color-primary, var(--c-accent))' }}
            >
              Searching...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter agent"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none rounded px-2 py-1"
            style={{
              color: 'var(--color-text-secondary, var(--c-text-2))',
              border: '1px solid var(--c-border-2)',
            }}
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs rounded px-2 py-1"
            style={{
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border-2)',
            }}
          >
            <option value="">All types</option>
            <option value="session">Session</option>
            <option value="chat_exchange">Chat</option>
            <option value="voice_turn">Voice</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs rounded px-2 py-1"
            style={{
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border-2)',
            }}
            aria-label="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs rounded px-2 py-1"
            style={{
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border-2)',
            }}
            aria-label="To date"
          />
        </div>
        <div className="overflow-y-auto flex-1 max-h-[45vh] space-y-1">
          {filtered.length === 0 && !searching && query.trim().length >= 2 && (
            <div
              className="text-xs text-center py-4"
              style={{ color: 'var(--color-text-muted, var(--c-text-5))' }}
            >
              No results found
            </div>
          )}
          {filtered.map((r, i) => (
            <button
              key={`${r.agentId || 'unknown'}-${r.sessionId || 'unknown'}-${i}`}
              className="w-full text-left rounded-lg px-3 py-2 text-xs transition-colors hover:brightness-110"
              style={{
                background: 'var(--color-surface-raised, var(--c-bg-3))',
                color: 'var(--color-text-secondary, var(--c-text-2))',
              }}
              onClick={() => onResultClick(r)}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-primary, var(--c-accent))' }}
                >
                  {r.agentId || 'unknown'}
                </span>
                <SBadge variant="outline" className="text-[9px] py-0 h-4">
                  {r.matches} match{r.matches !== 1 ? 'es' : ''}
                </SBadge>
                {r.type && (
                  <SBadge variant="outline" className="text-[9px] py-0 h-4">
                    {r.type}
                  </SBadge>
                )}
              </div>
              <div
                className="truncate"
                style={{ color: 'var(--color-text-muted, var(--c-text-4))' }}
              >
                {r.preview}
              </div>
            </button>
          ))}
        </div>
      </SDialogContent>
    </SDialog>
  );
}
