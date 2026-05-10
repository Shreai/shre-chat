/**
 * CINotificationToast — bottom-right toast stack for GitHub CI/CD events.
 *
 * Shows on: AI gate verdict, promotion PR created, deployment success/failure.
 * Auto-dismisses after 8s. Up to 4 toasts stack vertically.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useGitHubPulse } from '../hooks/useGitHubPulse';
import type { GitHubNotification } from '../hooks/useGitHubPulse';

interface Toast {
  id: string;
  notification: GitHubNotification;
  exiting: boolean;
}

const MAX_TOASTS = 4;
const AUTO_DISMISS_MS = 8000;

function toastAccent(status: GitHubNotification['status']): string {
  switch (status) {
    case 'success': return '#2eb886';
    case 'failure': return '#e01e5a';
    case 'warning': return '#ecb22e';
    default:        return '#4a90e2';
  }
}

function toastIcon(n: GitHubNotification): string {
  if (n.status === 'failure') return '🚫';
  if (n.status === 'warning') return '⚠️';
  if (n.status === 'success') return '✅';
  if (n.event === 'promote') return '🚀';
  return '💬';
}

function eventLabel(n: GitHubNotification): string {
  switch (n.event) {
    case 'ai_review': return 'AI Review';
    case 'promote':   return 'Promotion';
    case 'deploy':    return n.env ? `Deploy → ${n.env}` : 'Deploy';
    default:          return 'CI/CD';
  }
}

interface SingleToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function SingleToast({ toast, onDismiss }: SingleToastProps) {
  const { notification: n, id, exiting } = toast;
  const accent = toastAccent(n.status);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--c-bg-card, #1a1a1a)',
        border: '1px solid var(--c-border, #333)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: '10px 12px',
        minWidth: 280,
        maxWidth: 360,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        animation: exiting
          ? 'ci-toast-out 0.25s ease-in forwards'
          : 'ci-toast-in 0.25s ease-out',
        cursor: 'default',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{toastIcon(n)}</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flex: 1,
        }}>
          {eventLabel(n)}
        </span>
        <button
          onClick={() => onDismiss(id)}
          title="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--c-text-3, #666)',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--c-text-1, #eee)',
        lineHeight: 1.3,
      }}>
        {n.title}
      </div>

      {/* Body (optional) */}
      {n.body && (
        <div style={{
          fontSize: 12,
          color: 'var(--c-text-2, #999)',
          lineHeight: 1.4,
        }}>
          {n.body}
        </div>
      )}

      {/* Footer: env / branch / link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {n.env && (
          <span style={{
            fontSize: 10,
            background: 'var(--c-bg-2, #222)',
            color: 'var(--c-text-3, #666)',
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            {n.env}
          </span>
        )}
        {n.verdict && (
          <span style={{
            fontSize: 10,
            color: accent,
            fontWeight: 600,
          }}>
            {n.verdict}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {n.url && (
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: 'var(--c-accent, #4a90e2)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Open →
          </a>
        )}
      </div>
    </div>
  );
}

export function CINotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      if (timersRef.current.has(id)) {
        clearTimeout(timersRef.current.get(id)!);
        timersRef.current.delete(id);
      }
    }, 260);
  }, []);

  const onNotification = useCallback((n: GitHubNotification) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [{ id, notification: n, exiting: false }, ...prev].slice(0, MAX_TOASTS));

    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  useGitHubPulse(onNotification);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes ci-toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes ci-toast-out {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(16px); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          right: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto',
        }}
      >
        {toasts.map((t) => (
          <SingleToast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
