import React, { useEffect, useRef, useState } from 'react';
import type { ToolOption } from '../hooks/useToolList';

/**
 * ToolPicker — browsable list of available system and app tools.
 *
 * Read-only for now (shows what's available). Could later support
 * enabling/disabling tools per conversation.
 */

interface ToolPickerProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  tools: ToolOption[];
  systemCount: number;
  appCount: number;
  selectedTools: string[];
  onToggleTool: (toolName: string) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}

type TabFilter = 'all' | 'system' | 'app';

export function ToolPicker({
  open,
  onToggle,
  onClose,
  tools,
  systemCount,
  appCount,
  selectedTools,
  onToggleTool,
  pickerRef,
}: ToolPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFilter('all');
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, pickerRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = tools.filter((t) => {
    if (filter !== 'all' && t.category !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        className="h-7 rounded-lg flex items-center gap-1 px-2 text-[11px] transition-all"
        style={{
          color: open ? 'var(--c-accent)' : 'var(--c-text-3)',
          background: open ? 'var(--c-bg-active)' : 'transparent',
          border: '1px solid transparent',
        }}
        title={`Tools (${tools.length})`}
        aria-label="Browse available tools"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="hidden sm:inline">
          Tools
          {tools.length > 0 && (
            <span style={{ opacity: 0.5, marginLeft: '2px' }}>{tools.length}</span>
          )}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />

          <div
            ref={panelRef}
            className="absolute right-0 z-50 flex flex-col rounded-xl overflow-hidden shadow-2xl tool-picker-dropdown"
            style={{
              width: 320,
              top: '100%',
              marginTop: 4,
              maxHeight: 'min(480px, calc(var(--vv-height, 100dvh) - 100px))',
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-1)',
              animation: 'tool-picker-fade-in 150ms ease-out forwards',
            }}
          >
            {/* Header */}
            <div
              className="px-3 pt-3 pb-2 shrink-0"
              style={{ borderBottom: '1px solid var(--c-border-2)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text-1)' }}>
                  Available Tools
                </span>
                <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                  {systemCount} system + {appCount} app
                </span>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search tools..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md px-2 py-1 text-[11px] outline-none"
                style={{
                  background: 'var(--c-bg-3)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                autoFocus
              />

              {/* Tabs */}
              <div className="flex gap-1 mt-2">
                {(['all', 'system', 'app'] as const).map((tab) => {
                  const count =
                    tab === 'all' ? tools.length : tab === 'system' ? systemCount : appCount;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilter(tab)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      style={{
                        background: filter === tab ? 'var(--c-accent-soft)' : 'transparent',
                        color: filter === tab ? 'var(--c-accent)' : 'var(--c-text-3)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {tab === 'all' ? 'All' : tab === 'system' ? 'System' : 'App'} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tool list */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1">
              {filtered.length === 0 && (
                <div
                  className="px-3 py-6 text-center text-[11px]"
                  style={{ color: 'var(--c-text-4)' }}
                >
                  {tools.length === 0 ? 'Loading tools...' : 'No matching tools'}
                </div>
              )}
              {filtered.map((tool) => (
                <div
                  key={tool.name}
                  className="px-3 py-2 flex items-start gap-2"
                  style={{ borderBottom: '1px solid var(--c-border-2)' }}
                >
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 font-medium"
                    style={{
                      background:
                        tool.category === 'system' ? 'var(--c-accent-soft)' : 'var(--c-bg-3)',
                      color: tool.category === 'system' ? 'var(--c-accent)' : 'var(--c-text-3)',
                    }}
                  >
                    {tool.category === 'system' ? 'SYS' : 'APP'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium" style={{ color: 'var(--c-text-1)' }}>
                      {tool.name}
                    </div>
                    <div className="text-[10px] leading-snug" style={{ color: 'var(--c-text-3)' }}>
                      {tool.description}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedTools.includes(tool.name)}
                    onChange={() => onToggleTool(tool.name)}
                    aria-label={`Enable ${tool.name}`}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-3 py-2 shrink-0"
              style={{ borderTop: '1px solid var(--c-border-2)' }}
            >
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                Tools available to the active agent. Grants managed in MIB007.
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes tool-picker-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          .tool-picker-dropdown {
            position: fixed !important;
            left: 8px !important;
            right: 8px !important;
            top: 48px !important;
            bottom: auto !important;
            width: auto !important;
            max-height: calc(var(--vv-height, 100dvh) - 120px) !important;
          }
        }
      `}</style>
    </div>
  );
}
