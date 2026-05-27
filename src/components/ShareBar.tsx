import React from 'react';
import type { ShareHistoryEntry } from '../hooks/useHeaderActions';

export interface ShareBarProps {
  shareId?: string | null;
  shareUrl: string;
  shareExpiresAt?: string | null;
  shareHistory?: ShareHistoryEntry[];
  shareCopied: boolean;
  onCopy: () => void;
  onRevoke?: () => void;
  onRevokeEntry?: (id: string) => void;
  onClose: () => void;
}

export function ShareBar({
  shareId,
  shareUrl,
  shareExpiresAt,
  shareHistory = [],
  shareCopied,
  onCopy,
  onRevoke,
  onRevokeEntry,
  onClose,
}: ShareBarProps) {
  const [showHistory, setShowHistory] = React.useState(false);
  return (
    <div
      className="shrink-0 px-4 py-2"
      style={{ background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-2)' }}
    >
      <div className="flex items-center gap-2">
      {shareExpiresAt && (
        <span className="text-[10px] shrink-0" style={{ color: 'var(--c-text-4)' }}>
          Expires {new Date(shareExpiresAt).toLocaleString()}
        </span>
      )}
      <input
        type="text"
        readOnly
        value={shareUrl}
        className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none truncate"
        style={{ background: 'var(--c-bg-input)', color: 'var(--c-text-2)' }}
        onFocus={(e) => e.target.select()}
      />
      <button
        onClick={onCopy}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
        style={{
          background: shareCopied ? 'var(--c-success-bg)' : 'var(--c-accent)',
          color: shareCopied ? 'var(--c-success)' : 'var(--c-on-accent)',
        }}
      >
        {shareCopied ? 'Copied' : 'Copy'}
      </button>
      {shareId && onRevoke && (
        <button
          onClick={onRevoke}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
          style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger)' }}
        >
          Revoke
        </button>
      )}
      {shareHistory.length > 0 && (
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0"
          style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-2)' }}
        >
          {showHistory ? 'Hide history' : `History (${shareHistory.length})`}
        </button>
      )}
      <button
        onClick={onClose}
        className="p-1 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: 'var(--c-text-3)' }}
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
      {showHistory && shareHistory.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--c-border-2)] p-2 space-y-1">
          {shareHistory.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded px-2 py-1"
              style={{ background: 'var(--c-bg-3)' }}
            >
              <span
                className="text-[10px] flex-1 truncate"
                style={{ color: entry.revoked ? 'var(--c-text-5)' : 'var(--c-text-3)' }}
                title={entry.url}
              >
                {entry.id} · {entry.revoked ? 'revoked' : 'active'}
                {entry.expiresAt ? ` · exp ${new Date(entry.expiresAt).toLocaleDateString()}` : ''}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(entry.url).catch(() => {})}
                className="text-[10px] px-2 py-1 rounded"
                style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}
              >
                Copy
              </button>
              {!entry.revoked && onRevokeEntry && (
                <button
                  onClick={() => onRevokeEntry(entry.id)}
                  className="text-[10px] px-2 py-1 rounded"
                  style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger)' }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
