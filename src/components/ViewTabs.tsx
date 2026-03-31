import React from 'react';

interface ViewTabsProps {
  activeView: string;
  setActiveView: (view: string) => void;
  setTermViewMode: (mode: 'split' | 'tabs') => void;
  previewContent: { content: string; type: string; title?: string } | null;
}

export function ViewTabs({
  activeView,
  setActiveView,
  setTermViewMode,
  previewContent,
}: ViewTabsProps) {
  return (
    <nav
      className="flex items-center shrink-0 px-2 gap-0.5"
      role="tablist"
      aria-label="View switcher"
      style={{ background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }}
    >
      <button
        onClick={() => setActiveView('chat')}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
        style={{
          color: activeView === 'chat' ? 'var(--c-text-1)' : 'var(--c-text-4)',
          borderBottom:
            activeView === 'chat' ? '2px solid var(--c-accent)' : '2px solid transparent',
        }}
        aria-label="Chat view"
        aria-selected={activeView === 'chat'}
        role="tab"
      >
        <svg
          className="h-3 w-3"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat
      </button>
      <button
        onClick={() => setActiveView('terminal')}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
        style={{
          color: activeView === 'terminal' ? 'var(--c-text-1)' : 'var(--c-text-4)',
          borderBottom:
            activeView === 'terminal'
              ? '2px solid var(--c-terminal-accent)'
              : '2px solid transparent',
        }}
        aria-label="Terminal view"
        aria-selected={activeView === 'terminal'}
        role="tab"
      >
        <svg
          className="h-3 w-3"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        Terminal
      </button>
      {previewContent && (
        <button
          onClick={() => setActiveView('preview')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
          style={{
            color: activeView === 'preview' ? 'var(--c-text-1)' : 'var(--c-text-4)',
            borderBottom:
              activeView === 'preview'
                ? '2px solid var(--c-emerald, #34d399)'
                : '2px solid transparent',
          }}
          aria-label="Preview view"
          aria-selected={activeView === 'preview'}
          role="tab"
        >
          <svg
            className="h-3 w-3"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Preview
        </button>
      )}
      {/* View mode toggle -- switch back to split */}
      <button
        onClick={() => {
          setTermViewMode('split');
          if (activeView === 'preview') setActiveView('chat');
        }}
        className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors hover:brightness-125"
        style={{ color: 'var(--c-text-4)' }}
        title="Switch to split view"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </button>
    </nav>
  );
}
