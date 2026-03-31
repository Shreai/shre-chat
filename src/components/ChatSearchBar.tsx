import React from 'react';

export interface ChatSearchBarProps {
  chatSearchRef: React.RefObject<HTMLInputElement | null>;
  chatSearch: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
  chatSearchResults: number[];
  chatSearchIndex: number;
}

export function ChatSearchBar({
  chatSearchRef,
  chatSearch,
  onSearchChange,
  onClose,
  onNavigate,
  chatSearchResults,
  chatSearchIndex,
}: ChatSearchBarProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 shrink-0"
      style={{
        background: 'var(--c-bg-glass)',
        borderBottom: '1px solid var(--c-border-1)',
        backdropFilter: 'blur(12px)',
        zIndex: 25,
      }}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: 'var(--c-text-4)' }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={chatSearchRef}
        type="text"
        value={chatSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            onNavigate(-1);
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onNavigate(1);
          }
        }}
        placeholder="Search in conversation..."
        aria-label="Search in conversation"
        className="flex-1 bg-transparent text-xs outline-none"
        style={{ color: 'var(--c-text-1)' }}
        autoFocus
      />
      {chatSearch.trim() && (
        <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--c-text-4)' }}>
          {chatSearchResults.length > 0
            ? `${chatSearchIndex + 1} of ${chatSearchResults.length}`
            : 'No results'}
        </span>
      )}
      <button
        onClick={() => onNavigate(-1)}
        disabled={chatSearchResults.length === 0}
        className="p-0.5 rounded transition-colors disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        style={{ color: 'var(--c-text-3)' }}
        title="Previous match (Shift+Enter)"
        aria-label="Previous search match"
      >
        <svg
          className="h-3.5 w-3.5"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        onClick={() => onNavigate(1)}
        disabled={chatSearchResults.length === 0}
        className="p-0.5 rounded transition-colors disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        style={{ color: 'var(--c-text-3)' }}
        title="Next match (Enter)"
        aria-label="Next search match"
      >
        <svg
          className="h-3.5 w-3.5"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        style={{ color: 'var(--c-text-4)' }}
        title="Close search (Escape)"
        aria-label="Close search"
      >
        <svg
          className="h-3.5 w-3.5"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
