import React from 'react';
import type { ChatMessage } from '../router-client';
import { estimateTokens, formatTokenCount, formatTime } from '../chat-utils';

interface SessionAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
}

export function SessionAnalyticsModal({ isOpen, onClose, messages }: SessionAnalyticsModalProps) {
  if (!isOpen || messages.length === 0) return null;

  const userMsgs = messages.filter((m) => m.role === 'user');
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const userTokens = userMsgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const assistantTokens = assistantMsgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const avgAssistantLen =
    assistantMsgs.length > 0
      ? Math.round(
          assistantMsgs.reduce((sum, m) => sum + m.content.length, 0) / assistantMsgs.length,
        )
      : 0;
  const timestamps = messages.map((m) => m.timestamp).filter(Boolean) as number[];
  const firstTs = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const lastTs = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const durationMs = lastTs - firstTs;
  const durationStr =
    durationMs > 0
      ? durationMs >= 3600000
        ? `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`
        : durationMs >= 60000
          ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
          : `${Math.floor(durationMs / 1000)}s`
      : 'N/A';
  const barMessages = messages.slice(-20);
  const maxLen = Math.max(...barMessages.map((m) => m.content.length), 1);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
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
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Session Analytics
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

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border-2)',
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--c-text-5)', marginBottom: '4px' }}
              >
                Messages
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>
                {messages.length}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)', marginTop: '2px' }}>
                <span style={{ color: 'var(--c-accent)' }}>{userMsgs.length}</span> user /{' '}
                <span style={{ color: 'var(--c-emerald)' }}>{assistantMsgs.length}</span> assistant
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border-2)',
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--c-text-5)', marginBottom: '4px' }}
              >
                Est. Tokens
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>
                {formatTokenCount(totalTokens)}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)', marginTop: '2px' }}>
                <span style={{ color: 'var(--c-accent)' }}>{formatTokenCount(userTokens)}</span> in
                /{' '}
                <span style={{ color: 'var(--c-emerald)' }}>
                  {formatTokenCount(assistantTokens)}
                </span>{' '}
                out
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border-2)',
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--c-text-5)', marginBottom: '4px' }}
              >
                Avg Response
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>
                {avgAssistantLen.toLocaleString()}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)', marginTop: '2px' }}>
                characters
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border-2)',
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--c-text-5)', marginBottom: '4px' }}
              >
                Duration
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>
                {durationStr}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)', marginTop: '2px' }}>
                {firstTs ? formatTime(firstTs) : ''}
                {firstTs && lastTs ? ' \u2192 ' : ''}
                {lastTs ? formatTime(lastTs) : ''}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--c-text-5)', marginBottom: '10px' }}
            >
              Message Length (last {barMessages.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {barMessages.map((m, i) => {
                const pct = Math.max((m.content.length / maxLen) * 100, 2);
                const isUser = m.role === 'user';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: 'var(--c-text-5)', width: '14px', textAlign: 'right' }}
                    >
                      {isUser ? 'U' : 'A'}
                    </span>
                    <div style={{ flex: 1, position: 'relative', height: '14px' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: '3px',
                          background: isUser ? 'var(--c-accent, #3b82f6)' : 'var(--c-emerald)',
                          opacity: 0.7,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: 'var(--c-text-5)', width: '42px', textAlign: 'right' }}
                    >
                      {m.content.length >= 1000
                        ? `${(m.content.length / 1000).toFixed(1)}k`
                        : m.content.length}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3" style={{ justifyContent: 'center' }}>
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: 'var(--c-accent, #3b82f6)',
                    opacity: 0.7,
                  }}
                />
                <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                  User
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: 'var(--c-emerald)',
                    opacity: 0.7,
                  }}
                />
                <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                  Assistant
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end px-5 py-3"
          style={{ borderTop: '1px solid var(--c-border-1)' }}
        >
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
