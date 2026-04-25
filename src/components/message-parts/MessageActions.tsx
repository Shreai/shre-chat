import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { copyToClipboard, REACTION_EMOJIS, TAG_STYLES } from '../../chat-utils';
import { usePreferences } from '../../preferences-store';

const MessageExportMenu = lazy(() =>
  import('../MessageExportMenu').then((m) => ({ default: m.MessageExportMenu })),
);

// ── CopyButton ──
export function CopyButton({ content, inline }: { content: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const btn = (
    <button
      onClick={handleCopy}
      className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
      style={{ color: copied ? 'var(--c-emerald)' : 'var(--c-text-5)' }}
      title={copied ? 'Copied!' : 'Copy message'}
      aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
    >
      {copied ? (
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
  if (inline) return btn;
  return <div className="flex items-center justify-end gap-0.5 mt-1 px-1">{btn}</div>;
}

// ── MessageActions ──
export function MessageActions({
  content,
  feedback,
  onFeedback,
  onRegenerate,
  onBranch,
  onReaction,
}: {
  content: string;
  feedback?: 'like' | 'dislike' | null;
  onFeedback: (fb: 'like' | 'dislike') => void;
  onRegenerate?: () => void;
  onBranch?: () => void;
  onReaction?: (emoji: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactionOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setReactionOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionOpen]);

  const handleCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = async () => {
    if (speaking) {
      speakAbortRef.current?.abort();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const abort = new AbortController();
    speakAbortRef.current = abort;
    try {
      const plainText = content
        .replace(/```[\s\S]*?```/g, ' code block omitted ')
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/#{1,6}\s+/g, '')
        .replace(/[*_~]{1,3}/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ' ')
        .trim()
        .slice(0, 4096);
      if (!plainText) {
        setSpeaking(false);
        return;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: plainText,
          voice: usePreferences.getState().ttsVoice,
          provider: usePreferences.getState().ttsProvider || 'auto',
        }),
        signal: abort.signal,
      });
      if (!res.ok) {
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(plainText);
          utter.rate = 1.0;
          utter.onend = () => setSpeaking(false);
          utter.onerror = () => setSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        }
        setSpeaking(false);
        return;
      }
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      abort.signal.addEventListener('abort', () => {
        audio.pause();
        audio.currentTime = 0;
        URL.revokeObjectURL(audioUrl);
      });
      await audio.play();
    } catch (err: unknown) {
      if ((err as { name?: string } | null)?.name !== 'AbortError') {
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(content.slice(0, 1000));
          utter.rate = 1.0;
          utter.onend = () => setSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        }
      }
      setSpeaking(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5 mt-1 px-1">
      <button
        onClick={handleCopy}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: copied ? 'var(--c-emerald)' : 'var(--c-text-2)' }}
        title={copied ? 'Copied!' : 'Copy message'}
      >
        {copied ? (
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <button
        onClick={handleSpeak}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{
          color: speaking ? 'var(--c-accent)' : 'var(--c-text-2)',
          animation: speaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
        title={speaking ? 'Stop speaking' : 'Read aloud'}
      >
        {speaking ? (
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>
      <button
        onClick={() => onFeedback('like')}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: feedback === 'like' ? 'var(--c-emerald)' : 'var(--c-text-2)' }}
        title="Helpful"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill={feedback === 'like' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>
      <button
        onClick={() => onFeedback('dislike')}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: feedback === 'dislike' ? 'var(--c-danger-soft)' : 'var(--c-text-2)' }}
        title="Not helpful"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill={feedback === 'dislike' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
      </button>
      {onReaction && (
        <div ref={reactionRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            onClick={() => setReactionOpen((o) => !o)}
            className="p-1 rounded transition-colors hover:bg-white/5"
            style={{ color: reactionOpen ? 'var(--c-accent)' : 'var(--c-text-2)' }}
            title="Add reaction"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {reactionOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--c-bg-2)',
                border: '1px solid var(--c-border-1)',
                borderRadius: '12px',
                padding: '4px 6px',
                display: 'flex',
                gap: '2px',
                zIndex: 50,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                whiteSpace: 'nowrap',
              }}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReaction(emoji);
                    setReactionOpen(false);
                  }}
                  className="rounded transition-transform hover:scale-125"
                  style={{
                    padding: '2px 4px',
                    fontSize: '16px',
                    lineHeight: 1,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1 rounded transition-colors flex items-center gap-1 hover:bg-white/5"
          style={{ color: 'var(--c-text-2)' }}
          title="Regenerate response"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span className="text-[10px]">Regenerate</span>
        </button>
      )}
      {onBranch && (
        <button
          onClick={onBranch}
          className="p-1 rounded transition-colors flex items-center gap-1 hover:bg-white/5"
          style={{ color: 'var(--c-text-2)' }}
          title="Branch conversation here"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M6 9v3c0 2 2 3 6 3h3" />
            <line x1="6" y1="9" x2="6" y2="9" />
          </svg>
          <span className="text-[10px]">Branch</span>
        </button>
      )}
      {content.length > 80 && (
        <Suspense fallback={null}>
          <MessageExportMenu content={content} />
        </Suspense>
      )}
    </div>
  );
}

// ── ActionTagChips ──
export function ActionTagChips({ tags }: { tags: import('../../chat-utils').ActionTag[] }) {
  if (tags.length === 0) return null;
  // TAG_STYLES imported at top level
  return (
    <div
      className="flex flex-wrap gap-1.5 mt-2 pt-2"
      style={{ borderTop: '1px solid var(--c-border-2)' }}
    >
      {tags.map((tag: import('../../chat-utils').ActionTag, i: number) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{
            color: tag.color,
            background: tag.bgColor,
            border: `1px solid ${tag.color}22`,
          }}
        >
          <span>{tag.icon}</span>
          <span>{TAG_STYLES[tag.type]?.label || tag.type}</span>
        </span>
      ))}
    </div>
  );
}
