import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { copyToClipboard, REACTION_EMOJIS, TAG_STYLES } from '../../chat-utils';
import { usePreferences } from '../../preferences-store';
import { pickBrowserVoice, prepareSpeechText } from '../../voice/voice-utils';

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

  const closeMenu = () => {
    setMenuOpen(false);
    setReactionOpen(false);
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
  onOpenThread,
}: {
  content: string;
  feedback?: 'like' | 'dislike' | null;
  onFeedback: (fb: 'like' | 'dislike') => void;
  onRegenerate?: () => void;
  onBranch?: () => void;
  onReaction?: (emoji: string) => void;
  onOpenThread?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !reactionOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
        setReactionOpen(false);
        return;
      }
      if (reactionRef.current && !reactionRef.current.contains(target)) {
        setReactionOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, reactionOpen]);

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
      const plainText = prepareSpeechText(content);
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
          const utter = new SpeechSynthesisUtterance(prepareSpeechText(content).slice(0, 1000));
          utter.rate = 0.95;
          utter.pitch = 1.0;
          utter.lang = 'en-US';
          const browserVoice = pickBrowserVoice();
          if (browserVoice) utter.voice = browserVoice;
          utter.onend = () => setSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        }
      }
      setSpeaking(false);
    }
  };

  return (
    <div ref={menuRef} className="relative mt-1 px-0.5 flex items-center justify-end">
      <button
        onClick={() => {
          setMenuOpen((open) => !open);
          setReactionOpen(false);
        }}
        className="inline-flex items-center justify-center rounded-full p-0.5 transition-all opacity-0 group-hover/msg:opacity-80 focus-visible:opacity-100 hover:bg-white/0"
        style={{ color: menuOpen ? 'var(--c-accent)' : 'var(--c-text-4)' }}
        title="More actions"
        aria-label="More actions"
        aria-expanded={menuOpen}
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute bottom-full right-0 mb-1.5 rounded-xl shadow-xl py-1.5 z-50"
          style={{
            background: 'var(--c-bg-2)',
            border: '1px solid var(--c-border-1)',
            minWidth: 172,
            boxShadow: '0 16px 36px rgba(0,0,0,0.22)',
          }}
        >
          <MenuAction
            label={copied ? 'Copied' : 'Copy message'}
            icon={
              copied ? (
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
              )
            }
            tone={copied ? 'var(--c-emerald)' : 'var(--c-text-2)'}
            onClick={async () => {
              await handleCopy();
              closeMenu();
            }}
          />
          <MenuAction
            label={speaking ? 'Stop speaking' : 'Read aloud'}
            icon={
              speaking ? (
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
              )
            }
            tone={speaking ? 'var(--c-accent)' : 'var(--c-text-2)'}
            onClick={async () => {
              await handleSpeak();
              closeMenu();
            }}
          />
          {onOpenThread && (
            <MenuAction
              label="Open thread"
              icon={
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 8h10" />
                  <path d="M7 12h6" />
                  <path d="M7 16h8" />
                  <path d="M21 15a2 2 0 0 1-2 2H9l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
                </svg>
              }
              tone="var(--c-text-2)"
              onClick={() => {
                onOpenThread();
                closeMenu();
              }}
            />
          )}
          <MenuAction
            label={feedback === 'like' ? 'Marked helpful' : 'Helpful'}
            icon={
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill={feedback === 'like' ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            }
            tone={feedback === 'like' ? 'var(--c-emerald)' : 'var(--c-text-2)'}
            onClick={() => {
              onFeedback('like');
              closeMenu();
            }}
          />
          <MenuAction
            label={feedback === 'dislike' ? 'Marked not helpful' : 'Not helpful'}
            icon={
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill={feedback === 'dislike' ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            }
            tone={feedback === 'dislike' ? 'var(--c-danger-soft)' : 'var(--c-text-2)'}
            onClick={() => {
              onFeedback('dislike');
              closeMenu();
            }}
          />
          {onReaction && (
            <div ref={reactionRef} className="relative">
              <MenuAction
                label="Add reaction"
                icon={
                  <svg
                    className="h-3.5 w-3.5"
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
                }
                tone={reactionOpen ? 'var(--c-accent)' : 'var(--c-text-2)'}
                onClick={() => setReactionOpen((open) => !open)}
              />
              {reactionOpen && (
                <div
                  className="absolute right-full top-0 mr-2 rounded-xl border z-50 px-2 py-1.5"
                  style={{
                    background: 'var(--c-bg-2)',
                    borderColor: 'var(--c-border-1)',
                    boxShadow: '0 14px 30px rgba(0,0,0,0.2)',
                  }}
                >
                  <div className="flex items-center gap-1">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onReaction(emoji);
                          setReactionOpen(false);
                          setMenuOpen(false);
                        }}
                        className="rounded-md px-1.5 py-0.5 text-[15px] transition-transform hover:scale-125"
                        style={{ background: 'transparent', border: 'none' }}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {onRegenerate && (
            <MenuAction
              label="Regenerate response"
              onClick={() => {
                onRegenerate();
                closeMenu();
              }}
            />
          )}
          {onBranch && (
            <MenuAction
              label="Branch conversation here"
              onClick={() => {
                onBranch();
                closeMenu();
              }}
            />
          )}
          {content.length > 80 && (
            <div className="px-2 pt-1 mt-1" style={{ borderTop: '1px solid var(--c-border-2)' }}>
              <div
                className="px-1 pb-1 text-[9px] uppercase font-semibold tracking-[0.16em]"
                style={{ color: 'var(--c-text-5)' }}
              >
                Export
              </div>
              <Suspense fallback={null}>
                <MessageExportMenu content={content} />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuAction({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-white/5"
      style={{ color: tone || 'var(--c-text-2)' }}
    >
      {icon && <span className="flex h-5 w-5 items-center justify-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
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
