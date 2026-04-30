import React, { useEffect, useMemo, useState } from 'react';
import type { ConversationModeId } from '../preferences-store';

export type EscalationDestination = 'chat' | 'slack' | 'email';

export interface EscalationFormValues {
  destinations: EscalationDestination[];
  note: string;
  subject: string;
  emailTo: string;
}

interface EscalationDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EscalationFormValues) => Promise<void>;
  sessionTitle: string;
  agentName: string;
  conversationMode: ConversationModeId;
  activeAppLabel?: string | null;
  pendingApproval?: {
    tool: string;
    reason: string;
    input?: Record<string, unknown>;
  } | null;
  statusLine?: string | null;
  initialNote?: string;
  initialSubject?: string;
}

function formatApprovalContext(
  pendingApproval: EscalationDrawerProps['pendingApproval'],
  statusLine?: string | null,
) {
  if (pendingApproval) {
    const lines = [
      `Tool: ${pendingApproval.tool}`,
      `Reason: ${pendingApproval.reason}`,
    ];
    const input = pendingApproval.input || {};
    if (typeof input.command === 'string' && input.command.trim()) {
      lines.push(`Command: ${input.command.trim()}`);
    }
    if (typeof input.path === 'string' && input.path.trim()) {
      lines.push(`Path: ${input.path.trim()}`);
    }
    const extra = Object.entries(input)
      .filter(([key]) => key !== 'command' && key !== 'path')
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    return [...lines, ...extra].join('\n');
  }
  if (statusLine?.trim()) {
    return `Current status: ${statusLine.trim()}`;
  }
  return 'Need approval or a manual handoff for the current task.';
}

export function EscalationDrawer({
  open,
  onClose,
  onSubmit,
  sessionTitle,
  agentName,
  conversationMode,
  activeAppLabel,
  pendingApproval,
  statusLine,
  initialNote,
  initialSubject,
}: EscalationDrawerProps) {
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [destinations, setDestinations] = useState<Record<EscalationDestination, boolean>>({
    chat: true,
    slack: false,
    email: false,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const modeLabel = useMemo(() => {
    if (conversationMode === 'code') return 'Code mode';
    if (conversationMode === 'apps') return activeAppLabel ? `Apps mode · ${activeAppLabel}` : 'Apps mode';
    return 'General mode';
  }, [conversationMode, activeAppLabel]);

  useEffect(() => {
    if (!open) return;
    setNote(initialNote?.trim() || formatApprovalContext(pendingApproval, statusLine));
    setSubject(
      initialSubject?.trim() ||
        (pendingApproval
          ? `Approval needed: ${pendingApproval.tool}`
          : `Blocked on ${sessionTitle || agentName}`),
    );
    setEmailTo('');
    setDestinations({ chat: true, slack: false, email: false });
    setError(null);
    setSuccess(null);

    const loadDeliveryConfig = async () => {
      try {
        const res = await fetch('/api/notification-delivery/config');
        if (!res.ok) return;
        const data = await res.json();
        const configuredEmail = data?.config?.emailTo || data?.raw?.emailTo || '';
        if (configuredEmail) {
          setEmailTo((current) => current || String(configuredEmail));
        }
      } catch {
        // Prefer the drawer to stay usable even if config lookup fails.
      }
    };

    loadDeliveryConfig();
  }, [open, pendingApproval, sessionTitle, agentName, statusLine, initialNote, initialSubject]);

  if (!open) return null;

  const selectedDestinations = (Object.entries(destinations) as Array<
    [EscalationDestination, boolean]
  >)
    .filter(([, enabled]) => enabled)
    .map(([destination]) => destination);

  const toggleDestination = (destination: EscalationDestination) => {
    setDestinations((current) => ({ ...current, [destination]: !current[destination] }));
  };

  const handleSubmit = async () => {
    if (sending) return;
    if (selectedDestinations.length === 0) {
      setError('Pick at least one destination.');
      return;
    }
    if (selectedDestinations.includes('email') && !emailTo.trim()) {
      setError('Add an email recipient before sending email.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSubmit({
        destinations: selectedDestinations,
        note: note.trim(),
        subject: subject.trim(),
        emailTo: emailTo.trim(),
      });
      setSuccess('Escalation sent.');
      window.setTimeout(() => {
        onClose();
      }, 350);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send escalation.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[180] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Escalation drawer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <aside
        className="relative z-[190] h-full w-[min(100vw,460px)] overflow-y-auto shadow-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(12,17,27,0.98) 0%, rgba(8,12,18,0.98) 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4 backdrop-blur-xl"
          style={{
            background: 'rgba(10,15,25,0.8)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--c-text-5)' }}>
              Escalation
            </div>
            <div className="mt-1 truncate text-[16px] font-semibold tracking-[-0.03em]" style={{ color: 'var(--c-text-1)' }}>
              Handoff without losing context
            </div>
            <div className="mt-1 truncate text-[12px]" style={{ color: 'var(--c-text-3)' }}>
              {modeLabel} · {agentName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-text-3)' }}
            aria-label="Close escalation drawer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <section
            className="rounded-2xl p-4"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-5)' }}>
              Target
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ['chat', 'Chat', 'Keep it in shre-chat.'],
                  ['slack', 'Slack', 'Post to the configured Slack webhook.'],
                  ['email', 'Email', 'Send a direct email update.'],
                ] as const
              ).map(([key, label, description]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDestination(key)}
                  className="rounded-2xl border px-3 py-3 text-left transition-colors"
                  style={{
                    borderColor: destinations[key] ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.08)',
                    background: destinations[key] ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="text-[12px] font-medium" style={{ color: 'var(--c-text-1)' }}>
                    {label}
                  </div>
                  <div className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--c-text-4)' }}>
                    {description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {pendingApproval && (
            <section
              className="rounded-2xl p-4"
              style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#fbbf24' }}>
                Pending approval
              </div>
              <div className="mt-2 text-[13px] font-medium" style={{ color: 'var(--c-text-1)' }}>
                {pendingApproval.tool}
              </div>
              <div className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                {pendingApproval.reason}
              </div>
            </section>
          )}

          <section
            className="rounded-2xl p-4 space-y-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-5)' }}>
                Subject
              </div>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-2xl px-3.5 py-2.5 text-[13px] outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--c-text-1)',
                }}
                placeholder="Approval needed: ... "
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-5)' }}>
                Message
              </div>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={10}
                className="w-full rounded-2xl px-3.5 py-3 text-[13px] outline-none resize-y"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--c-text-1)',
                }}
                placeholder="Explain what is blocked, what you need, and who should act next."
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-5)' }}>
                Email recipient
              </div>
              <input
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                className="w-full rounded-2xl px-3.5 py-2.5 text-[13px] outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--c-text-1)',
                }}
                placeholder="alerts@company.com"
              />
            </label>
          </section>

          <div className="flex items-center justify-between gap-3">
            <div className="min-h-[20px] text-[12px]" style={{ color: error ? '#fca5a5' : 'var(--c-text-4)' }}>
              {error || success || 'Use chat for a persistent note, Slack for broadcast, or email for direct approval.'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[12px] font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending}
                className="rounded-full px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-60"
                style={{ background: 'var(--c-accent)', color: 'var(--c-on-accent)' }}
              >
                {sending ? 'Sending...' : 'Send escalation'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
