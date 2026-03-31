import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  getBookmarks,
  removeBookmark,
  updateBookmarkNote,
  getAgent,
  type Bookmark,
} from '../store';

const PAGE_SIZE = 50;

/** Fuzzy match: all words in query must appear somewhere in text (order-independent) */
function fuzzyMatch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  return words.every((w) => lower.includes(w));
}

interface BookmarkPanelProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (sessionId: string, messageIndex: number) => void;
}

export function BookmarkPanel({ open, onClose, onNavigate }: BookmarkPanelProps) {
  const [search, setSearch] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => getBookmarks());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Refresh bookmarks when panel opens, reset pagination
  const refresh = useCallback(() => {
    setBookmarks(getBookmarks());
    setLimit(PAGE_SIZE);
  }, []);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Focus search input on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  // Escape key closes panel; focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus trap: Tab within panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!search) return bookmarks;
    return bookmarks.filter((b) => {
      const haystack = `${b.preview} ${b.note || ''} ${getAgent(b.agentId).name}`;
      return fuzzyMatch(haystack, search);
    });
  }, [bookmarks, search]);

  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  const handleDelete = useCallback((id: string) => {
    setDeletingId(id);
    setTimeout(() => {
      removeBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      setDeletingId(null);
    }, 200);
  }, []);

  const handleSaveNote = useCallback((id: string, note: string) => {
    updateBookmarkNote(id, note.trim());
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, note: note.trim() || undefined } : b)),
    );
    setEditingId(null);
  }, []);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(bookmarks, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shre-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [bookmarks]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Bookmarks panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 95,
          width: 340,
          maxWidth: '90vw',
          background: 'var(--c-bg-2, #0f0f1a)',
          borderLeft: '1px solid var(--c-border-1, #333)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
          animation: 'bmSlideIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid var(--c-border-2, #2a2a3d)',
          }}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--c-accent, #6366f1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--c-text-1, #eee)' }}>
            Bookmarks ({bookmarks.length})
          </span>
          {bookmarks.length > 0 && (
            <button
              onClick={handleExport}
              aria-label="Export bookmarks as JSON"
              title="Export bookmarks"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--c-text-4, #888)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
              }}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close bookmarks panel"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--c-text-4, #888)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
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

        {/* Search */}
        <div style={{ padding: '8px 12px' }}>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookmarks..."
            aria-label="Search bookmarks"
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 13,
              background: 'var(--c-bg-card, var(--c-bg-3, #1a1a2e))',
              color: 'var(--c-text-2, #ccc)',
              border: '1px solid var(--c-border-1, #333)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Bookmark list */}
        <div role="list" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {filtered.length === 0 ? (
            <div
              style={{ textAlign: 'center', padding: '40px 12px', color: 'var(--c-text-4, #888)' }}
            >
              <svg
                aria-hidden="true"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.4, margin: '0 auto 8px' }}
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                {search ? 'No matches found' : 'No bookmarks yet'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-5, #666)' }}>
                {search ? `No bookmarks match "${search}"` : 'Long-press a message to bookmark it'}
              </div>
            </div>
          ) : (
            <>
              {visible.map((bm) => {
                const agent = getAgent(bm.agentId);
                const isDeleting = deletingId === bm.id;
                const isEditing = editingId === bm.id;
                return (
                  <div
                    key={bm.id}
                    role="listitem"
                    onClick={() => {
                      if (!isEditing) {
                        onNavigate(bm.sessionId, bm.messageIndex);
                        onClose();
                      }
                    }}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 4,
                      borderRadius: 8,
                      cursor: isEditing ? 'default' : 'pointer',
                      background: 'var(--c-bg-3, rgba(255,255,255,0.04))',
                      border: '1px solid var(--c-border-2, #2a2a3d)',
                      transition:
                        'background 0.15s, border-color 0.15s, opacity 0.2s, transform 0.2s',
                      opacity: isDeleting ? 0 : 1,
                      transform: isDeleting ? 'translateX(20px)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isDeleting) {
                        e.currentTarget.style.background =
                          'var(--c-bg-hover, rgba(255,255,255,0.08))';
                        e.currentTarget.style.borderColor = 'var(--c-border-1, #333)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--c-bg-3, rgba(255,255,255,0.04))';
                      e.currentTarget.style.borderColor = 'var(--c-border-2, #2a2a3d)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{agent.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--c-text-1, #eee)',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {bm.preview}
                        </div>
                        {/* Inline note editing */}
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            onBlur={() => handleSaveNote(bm.id, editNote)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveNote(bm.id, editNote);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Add a note..."
                            aria-label="Edit bookmark note"
                            style={{
                              width: '100%',
                              marginTop: 4,
                              padding: '3px 6px',
                              fontSize: 11,
                              color: 'var(--c-accent, #6366f1)',
                              background: 'var(--c-bg-2, #0f0f1a)',
                              border: '1px solid var(--c-accent, #6366f1)',
                              borderRadius: 4,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(bm.id);
                              setEditNote(bm.note || '');
                            }}
                            title="Click to edit note"
                            style={{
                              fontSize: 11,
                              marginTop: 3,
                              cursor: 'text',
                              minHeight: 16,
                              color: bm.note ? 'var(--c-accent, #6366f1)' : 'var(--c-text-5, #666)',
                              borderLeft: bm.note
                                ? '2px solid var(--c-accent, #6366f1)'
                                : '2px solid transparent',
                              paddingLeft: 6,
                              fontStyle: bm.note ? 'normal' : 'italic',
                            }}
                          >
                            {bm.note || 'Add note...'}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--c-text-5, #666)',
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span>{agent.name}</span>
                          <span>&middot;</span>
                          <span>
                            {new Date(bm.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(bm.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--c-text-5, #666)',
                          cursor: 'pointer',
                          padding: 2,
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                        aria-label={`Remove bookmark for: ${bm.preview.slice(0, 40)}`}
                      >
                        <svg
                          aria-hidden="true"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: 4,
                    marginBottom: 8,
                    fontSize: 12,
                    color: 'var(--c-accent, #6366f1)',
                    fontWeight: 500,
                    background: 'none',
                    border: '1px solid var(--c-border-2, #2a2a3d)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Show more ({filtered.length - limit} remaining)
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bmSlideIn {
          from { transform: translateX(100%); opacity: 0.8; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
