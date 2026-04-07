import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../router-client';

interface ShareSnapshotViewProps {
  snapshot: {
    title: string;
    messages: ChatMessage[];
    model: string | null;
    createdAt: string;
  } | null;
  loading: boolean;
  error: string | null;
}

export function ShareSnapshotView({ snapshot, loading, error }: ShareSnapshotViewProps) {
  if (!snapshot && !loading && !error) return null;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative">
      {/* Shared view header */}
      <div
        className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-1)' }}
      >
        <a
          href="/"
          className="text-[11px] px-2 py-1 rounded-lg transition-colors"
          style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border-1)' }}
        >
          &larr; Back to Shre Chat
        </a>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: 'var(--c-text-1)' }}>
            {snapshot?.title || 'Shared Conversation'}
          </div>
          {snapshot?.createdAt && (
            <div className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
              Shared {new Date(snapshot.createdAt).toLocaleDateString()} &middot;{' '}
              {snapshot.messages.length} messages
              {snapshot.model ? ` \u00b7 ${snapshot.model}` : ''}
            </div>
          )}
        </div>
        <div
          className="text-[9px] px-2 py-1 rounded-full"
          style={{
            background: 'rgba(59,130,246,0.1)',
            color: 'var(--c-info-soft)',
            border: '1px solid rgba(59,130,246,0.2)',
          }}
        >
          Read-only
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {loading && (
          <div className="text-center py-20" style={{ color: 'var(--c-text-4)' }}>
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-t-transparent animate-spin mb-2"
              style={{ borderColor: 'var(--c-accent)', borderTopColor: 'transparent' }}
            />
            <div className="text-sm">Loading shared conversation...</div>
          </div>
        )}
        {error && (
          <div className="text-center py-20" style={{ color: 'var(--c-text-4)' }}>
            <div className="text-2xl mb-2">&#x1F517;</div>
            <div className="text-sm">{error}</div>
          </div>
        )}
        {snapshot && (
          <div className="max-w-3xl mx-auto space-y-4">
            {snapshot.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap"
                  style={{
                    background: msg.role === 'user' ? 'var(--c-accent)' : 'var(--c-bg-card)',
                    color: msg.role === 'user' ? 'var(--c-on-accent)' : 'var(--c-text-1)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--c-border-2)',
                  }}
                >
                  {msg.role !== 'user' ? (
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {msg.content.replace(/<think>[\s\S]*?<\/think>\s*/g, '')}
                    </Markdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
