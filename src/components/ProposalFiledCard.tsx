/**
 * ProposalFiledCard — companion card for shadow-workspace preview gates.
 *
 * Rendered alongside PreviewConfirmCard when the 409 payload includes
 * `proposal_id`. Informs the owner that a task has been filed in shre-tasks
 * for review and links to the MIB007 task detail page.
 */
import React from 'react';

interface Props {
  proposalId: string;
  /** Raw message from the gate payload — may mention the twin workspace name. */
  rawMessage?: string;
}

/** Extract twin workspace hint from the gate message. */
function extractTwin(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/promote via\s+([A-Za-z0-9._-]+)/i);
  return m ? m[1] : null;
}

/** Derive the mib007 task URL. Defaults to same-origin + /tasks/:id so it works
 *  when shre-chat is embedded alongside mib007, falling back gracefully when not. */
function buildTaskHref(proposalId: string): string {
  const envUrl =
    typeof import.meta !== 'undefined' ? (import.meta as ImportMeta).env?.VITE_MIB007_URL : null;
  const isLegacyHost =
    typeof envUrl === 'string' &&
    /(?:mib007\.nirtek\.net|mib\.nirtek\.net|app\.nirtek\.net|chat\.nirtek\.net|app\.shre\.ai|chat\.shre\.ai)/.test(
      envUrl,
    );
  if (envUrl && typeof envUrl === 'string' && !isLegacyHost)
    return `${envUrl.replace(/\/$/, '')}/tasks/${proposalId}`;
  // Same-origin fallback (works when shre-chat is served behind the public host)
  return typeof window !== 'undefined'
    ? `${window.location.origin}/tasks/${proposalId}`
    : `/tasks/${proposalId}`;
}

export function ProposalFiledCard({ proposalId, rawMessage }: Props) {
  const twin = extractTwin(rawMessage);
  const href = buildTaskHref(proposalId);

  return (
    <div className="max-w-3xl mx-auto px-4 mb-2">
      <div
        data-testid="proposal-filed-card"
        className="rounded-lg overflow-hidden"
        style={{
          background: 'var(--c-bg-2)',
          border: '1px solid var(--c-border-2)',
        }}
      >
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--c-border-2)' }}
        >
          <span className="font-medium text-[11px]" style={{ color: 'var(--c-text-3)' }}>
            {'\uD83D\uDCC4'} Proposal filed
          </span>
          <span className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
            shadow workspace
          </span>
        </div>
        <div className="px-3 py-2 space-y-1">
          <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>
            A proposal task{' '}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline"
              style={{ color: 'var(--c-accent, #60a5fa)' }}
            >
              {proposalId}
            </a>{' '}
            has been filed for owner review.
          </div>
          <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
            Promote via{' '}
            <span style={{ color: 'var(--c-text-3)' }}>{twin || 'the execute twin workspace'}</span>{' '}
            after approval.
          </div>
        </div>
      </div>
    </div>
  );
}
