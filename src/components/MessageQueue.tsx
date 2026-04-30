import React from 'react';

interface QueueItem {
  id: string;
  text: string;
}

interface MessageQueueProps {
  queue: QueueItem[];
  editingQueueId: string | null;
  onReorder: (fromIndex: number, direction: 'up' | 'down') => void;
  onEdit: (item: QueueItem) => void;
  onRemove: (id: string) => void;
}

export function MessageQueue({
  queue,
  editingQueueId,
  onReorder,
  onEdit,
  onRemove,
}: MessageQueueProps) {
  if (queue.length === 0) return null;

  return (
    <div className="px-4 py-2 shrink-0" style={{ borderTop: '1px solid var(--c-border-2)' }}>
      <div className="w-full">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--c-text-5)' }}
          >
            Queue
          </span>
          <span
            className="text-[9px] px-1.5 rounded-full"
            style={{ background: 'var(--c-bg-badge)', color: 'var(--c-text-2)' }}
          >
            {queue.length}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {queue.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 group"
              style={{ background: 'var(--c-bg-card)', border: '1px solid var(--c-border-2)' }}
            >
              {/* Priority number */}
              <span
                className="text-[10px] font-mono shrink-0 w-4 text-center"
                style={{ color: 'var(--c-text-5)' }}
              >
                {idx + 1}
              </span>
              {/* Text */}
              <span
                className="flex-1 text-xs truncate"
                style={{
                  color: editingQueueId === item.id ? 'var(--c-accent)' : 'var(--c-text-2)',
                }}
              >
                {item.text}
              </span>
              {/* Actions (visible on hover) */}
              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                {/* Move up */}
                {idx > 0 && (
                  <button
                    onClick={() => onReorder(idx, 'up')}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: 'var(--c-text-4)' }}
                    title="Move up"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                )}
                {/* Move down */}
                {idx < queue.length - 1 && (
                  <button
                    onClick={() => onReorder(idx, 'down')}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: 'var(--c-text-4)' }}
                    title="Move down"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                {/* Edit */}
                <button
                  onClick={() => onEdit(item)}
                  className="p-0.5 rounded transition-colors"
                  style={{
                    color: editingQueueId === item.id ? 'var(--c-accent)' : 'var(--c-text-4)',
                  }}
                  title="Edit"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {/* Remove */}
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-0.5 rounded transition-colors text-red-400/50 hover:text-red-400"
                  title="Remove"
                >
                  <svg
                    className="h-3 w-3"
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
