import React from 'react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['Cmd+K', 'New chat'],
  ['Cmd+/', 'Toggle model picker'],
  ['Cmd+F', 'Search in conversation'],
  ['Cmd+Shift+F', 'Search across all sessions'],
  ['Cmd+?', 'Show this overlay'],
  ['Escape', 'Cancel streaming / close panels'],
  ['/', 'Command menu'],
  ['\u2191 / \u2193', 'Navigate messages (when not typing)'],
  ['j / k', 'Navigate messages (vim-style)'],
  ['e', 'Edit selected user message'],
  ['r', 'Regenerate last response'],
  ['Enter / Space', 'Focus text input'],
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
        style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--c-text-4)' }}>
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
        <div className="space-y-1 text-xs">
          {SHORTCUTS.map(([key, desc]) => (
            <div
              key={key}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg"
              style={{ background: 'var(--c-bg-3)' }}
            >
              <span style={{ color: 'var(--c-text-3)' }}>{desc}</span>
              <kbd
                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium"
                style={{
                  background: 'var(--c-bg-1)',
                  color: 'var(--c-accent)',
                  border: '1px solid var(--c-border-2)',
                }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
