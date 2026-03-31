import React from 'react';

interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}

export function SystemPromptEditor({
  isOpen,
  onClose,
  draft,
  onDraftChange,
  onSave,
  onClear,
}: SystemPromptEditorProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="System Prompt"
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--c-border-1)' }}
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4"
              style={{ color: 'var(--c-accent)' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              System Prompt
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--c-text-4)' }}
            aria-label="Close"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] mb-3" style={{ color: 'var(--c-text-4)' }}>
            Set a custom system prompt for this session. Leave empty to use the agent&apos;s default
            behavior.
          </p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="e.g., You are a helpful coding assistant focused on TypeScript..."
            rows={8}
            aria-label="System prompt"
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-y"
            style={{
              background: 'var(--c-bg-1)',
              color: 'var(--c-text-1)',
              border: '1px solid var(--c-border-1)',
              minHeight: '120px',
              maxHeight: '300px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={onClear}
              className="text-[11px] px-2 py-1 rounded transition-colors"
              style={{ color: 'var(--c-text-4)' }}
            >
              Clear
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--c-text-3)', background: 'var(--c-bg-active)' }}
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
