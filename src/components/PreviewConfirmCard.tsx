/**
 * PreviewConfirmCard — shre-router HTTP 409 preview-gate renderer.
 *
 * Rendered when shre-router blocks a destructive-write request (`preview_required: true`).
 * Presents the gate payload as an actionable card: object list, destructive writes
 * highlighted in red, suggested playbook chip, expiry countdown, Confirm/Cancel buttons.
 *
 * On Confirm, dispatches a `shre-preview-confirm` window event. `useMessageHandlers`
 * listens for it and re-submits the original prompt with `previewConfirmed=<preview_id>`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { ChatMessage, PreviewGatePayload } from '../router-client';
import { ProposalFiledCard } from './ProposalFiledCard';

interface Props {
  message: ChatMessage;
  timestamp?: string;
}

function parsePayload(meta: Record<string, string> | undefined): PreviewGatePayload | null {
  const raw = meta?.previewPayload;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PreviewGatePayload;
    if (!parsed || !parsed.preview_required || !parsed.preview_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expired';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

export function PreviewConfirmCard({ message, timestamp }: Props) {
  const payload = useMemo(() => parsePayload(message.meta), [message.meta]);
  const originalMessage = message.meta?.originalMessage ?? '';
  const [resolved, setResolved] = useState<'confirmed' | 'cancelled' | null>(null);

  const expiresAt = useMemo(() => {
    if (!payload?.expires_at) return 0;
    const t = Date.parse(payload.expires_at);
    return Number.isFinite(t) ? t : 0;
  }, [payload?.expires_at]);

  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (!payload) {
    // Malformed payload — fall back to a compact warning chip
    return (
      <div className="max-w-3xl mx-auto px-4 py-2 text-[11px]" style={{ color: 'var(--c-text-4)' }}>
        [system] preview gate payload missing
      </div>
    );
  }

  const expired = remainingMs <= 0;
  const destructive = payload.destructive_writes || [];
  const reads = (payload.objects || []).filter(
    (o) => !destructive.some((d) => d.object === o.object),
  );

  const handleConfirm = () => {
    if (resolved || expired || !originalMessage) return;
    setResolved('confirmed');
    window.dispatchEvent(
      new CustomEvent('shre-preview-confirm', {
        detail: { previewId: payload.preview_id, originalMessage },
      }),
    );
  };

  const handleCancel = () => {
    if (resolved) return;
    setResolved('cancelled');
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header chip */}
      <div className="flex items-center gap-1.5 py-1 px-2">
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px]"
          style={{
            background: 'var(--c-bg-3)',
            color:
              resolved === 'confirmed'
                ? 'var(--c-success, #34d399)'
                : resolved === 'cancelled'
                  ? 'var(--c-danger-soft, #f87171)'
                  : 'var(--c-warning, #fbbf24)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          <span>
            {resolved === 'confirmed'
              ? '\u2713'
              : resolved === 'cancelled'
                ? '\u2717'
                : '\u26A0\uFE0F'}
          </span>
          <span>
            {resolved === 'confirmed'
              ? 'Confirmed'
              : resolved === 'cancelled'
                ? 'Cancelled'
                : expired
                  ? 'Token expired'
                  : 'Confirmation required'}
          </span>
        </span>
        {timestamp && (
          <span className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
            {timestamp}
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
      </div>

      {/* Card */}
      <div
        data-testid="preview-confirm-card"
        className="mx-4 mb-2 rounded-lg overflow-hidden"
        style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-2)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--c-border-2)' }}
        >
          <span className="font-medium text-[11px]" style={{ color: 'var(--c-text-3)' }}>
            {'\uD83D\uDEE1\uFE0F'} Preview gate
            {payload.domain ? (
              <span className="ml-2" style={{ color: 'var(--c-text-5)' }}>
                {payload.domain}
              </span>
            ) : null}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{
              background: expired ? 'rgba(248, 113, 113, 0.18)' : 'rgba(251, 191, 36, 0.18)',
              color: expired ? 'var(--c-danger-soft, #f87171)' : 'var(--c-warning, #fbbf24)',
            }}
          >
            {expired ? 'expired' : `expires in ${formatCountdown(remainingMs)}`}
          </span>
        </div>

        {/* Message */}
        <div className="px-3 py-2 space-y-2">
          <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>
            {payload.message}
          </div>

          {/* Destructive writes — red badges */}
          {destructive.length > 0 && (
            <div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--c-text-4)' }}>
                Destructive writes
              </div>
              <div className="flex flex-wrap gap-1">
                {destructive.map((d, i) => (
                  <span
                    key={`dw-${i}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: 'var(--c-error, #ef4444)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                    }}
                  >
                    <span>{'\u26A0\uFE0F'}</span>
                    <span>
                      {d.object}
                      {d.access ? ` · ${d.access}` : ''}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reads — neutral badges */}
          {reads.length > 0 && (
            <div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--c-text-4)' }}>
                Reads
              </div>
              <div className="flex flex-wrap gap-1">
                {reads.map((o, i) => (
                  <span
                    key={`rd-${i}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]"
                    style={{
                      background: 'var(--c-bg-2)',
                      color: 'var(--c-text-3)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    {o.object}
                    {o.access ? (
                      <span style={{ color: 'var(--c-text-5)' }}>{`· ${o.access}`}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Picked agent + playbook */}
          <div className="flex flex-wrap gap-2 items-center text-[10px]">
            {payload.picked_agent && (
              <span style={{ color: 'var(--c-text-4)' }}>
                Agent: <span style={{ color: 'var(--c-text-3)' }}>{payload.picked_agent}</span>
              </span>
            )}
            {payload.suggested_playbook && (
              <span
                className="px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-3)',
                }}
              >
                {'\uD83D\uDCD6'} {payload.suggested_playbook}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!resolved && !expired && (
          <div
            className="px-3 py-2 flex gap-2"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            <button
              onClick={handleConfirm}
              disabled={!originalMessage}
              className="px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: 'var(--c-success, #34d399)',
                color: '#fff',
                border: 'none',
                cursor: originalMessage ? 'pointer' : 'not-allowed',
                opacity: originalMessage ? 1 : 0.6,
              }}
            >
              Confirm &amp; execute
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: 'var(--c-bg-2)',
                color: 'var(--c-text-3)',
                border: '1px solid var(--c-border-2)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {resolved === 'confirmed' && (
          <div
            className="px-3 py-1.5 text-[10px] font-medium"
            style={{
              color: 'var(--c-success, #34d399)',
              borderTop: '1px solid var(--c-border-2)',
            }}
          >
            Confirmed — resubmitting with preview token
          </div>
        )}
        {resolved === 'cancelled' && (
          <div
            className="px-3 py-1.5 text-[10px] font-medium"
            style={{
              color: 'var(--c-danger-soft, #f87171)',
              borderTop: '1px solid var(--c-border-2)',
            }}
          >
            Cancelled — no writes were performed
          </div>
        )}
        {!resolved && expired && (
          <div
            className="px-3 py-1.5 text-[10px] font-medium"
            style={{
              color: 'var(--c-danger-soft, #f87171)',
              borderTop: '1px solid var(--c-border-2)',
            }}
          >
            Preview token expired — submit the request again to get a fresh one
          </div>
        )}
      </div>

      {/* If shadow-workspace also filed a task, render the linked proposal card */}
      {payload.proposal_id ? (
        <ProposalFiledCard proposalId={payload.proposal_id} rawMessage={payload.message} />
      ) : null}
    </div>
  );
}
