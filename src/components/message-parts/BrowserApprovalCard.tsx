/**
 * BrowserApprovalCard — Interactive approval card for browser actions.
 *
 * Rendered when an agent requests human approval for sensitive browser operations
 * (login, download from untrusted domain, etc.). Provides Approve/Deny buttons
 * and a deep link to the full details page in MIB007.
 */
import React, { useState, useCallback } from 'react';
import type { ChatMessage } from '../../router-client';

interface Props {
  message: ChatMessage;
  timestamp?: string;
}

export function BrowserApprovalCard({ message, timestamp }: Props) {
  const content = message.content || '';
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(null);

  // Parse structured fields from message content
  const approvalId = content.match(/Approval ID:\s*(\S+)/)?.[1] || '';
  const action = content.match(/Action:\s*([^\n]+)/)?.[1] || 'browser action';
  const target = content.match(/Target:\s*(\S+)/)?.[1] || '';
  const agent = content.match(/Agent:\s*(\S+)/)?.[1] || '';
  const reason = content.match(/Reason:\s*([^\n]+)/)?.[1] || '';
  const risk = content.match(/Risk:\s*(\w+)/)?.[1] || 'medium';

  const handleResolve = useCallback(
    async (status: 'approved' | 'denied') => {
      if (!approvalId || resolving) return;
      setResolving(true);
      try {
        const res = await fetch('/api/browser/approvals/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId, status, resolvedBy: 'user' }),
        });
        if (res.ok) setResolved(status);
      } catch {
        /* silent */
      } finally {
        setResolving(false);
      }
    },
    [approvalId, resolving],
  );

  const RISK_COLOR: Record<string, string> = {
    low: 'var(--c-success, #34d399)',
    medium: 'var(--c-warning, #fbbf24)',
    high: 'var(--c-danger-soft, #f87171)',
    critical: 'var(--c-error, #ef4444)',
  };

  const ACTION_ICON: Record<string, string> = {
    browser_login: '\uD83D\uDD12',
    browser_download: '\u2B07\uFE0F',
    browser_browse: '\uD83C\uDF10',
    browser_click: '\uD83D\uDC46',
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
              resolved === 'approved'
                ? 'var(--c-success, #34d399)'
                : resolved === 'denied'
                  ? 'var(--c-danger-soft, #f87171)'
                  : 'var(--c-warning, #fbbf24)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          <span>
            {resolved === 'approved' ? '\u2713' : resolved === 'denied' ? '\u2717' : '\uD83D\uDD10'}
          </span>
          <span>
            {resolved === 'approved'
              ? 'Approved'
              : resolved === 'denied'
                ? 'Denied'
                : 'Approval needed'}
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
        className="mx-4 mb-2 rounded-lg overflow-hidden"
        style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-2)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--c-border-2)' }}
        >
          <span className="font-medium text-[11px]" style={{ color: 'var(--c-text-3)' }}>
            {ACTION_ICON[action] || '\uD83C\uDF10'}{' '}
            {action.replace('browser_', '').replace('_', ' ')}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: RISK_COLOR[risk] + '22', color: RISK_COLOR[risk] }}
          >
            {risk} risk
          </span>
        </div>

        {/* Details */}
        <div className="px-3 py-2 space-y-1">
          {agent && (
            <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
              Agent: <span style={{ color: 'var(--c-text-3)' }}>{agent}</span>
            </div>
          )}
          {target && (
            <div
              className="text-[10px] px-2 py-1 rounded"
              style={{ background: 'var(--c-bg-2)', color: 'var(--c-text-3)' }}
            >
              {target.length > 60 ? target.slice(0, 60) + '...' : target}
            </div>
          )}
          {reason && (
            <div className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>
              {reason}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!resolved && (
          <div
            className="px-3 py-2 flex gap-2"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            <button
              onClick={() => handleResolve('approved')}
              disabled={resolving}
              className="px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: 'var(--c-success, #34d399)',
                color: '#fff',
                border: 'none',
                cursor: resolving ? 'not-allowed' : 'pointer',
                opacity: resolving ? 0.6 : 1,
              }}
            >
              {resolving ? '...' : 'Approve'}
            </button>
            <button
              onClick={() => handleResolve('denied')}
              disabled={resolving}
              className="px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: 'var(--c-danger-soft, #f87171)',
                color: '#fff',
                border: 'none',
                cursor: resolving ? 'not-allowed' : 'pointer',
                opacity: resolving ? 0.6 : 1,
              }}
            >
              {resolving ? '...' : 'Deny'}
            </button>
            {approvalId && (
              <a
                href={`/security/approvals/${approvalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-md text-[11px] transition-all hover:opacity-90"
                style={{
                  background: 'var(--c-bg-2)',
                  color: 'var(--c-text-4)',
                  border: '1px solid var(--c-border-2)',
                  textDecoration: 'none',
                }}
              >
                Details
              </a>
            )}
          </div>
        )}

        {/* Resolved status */}
        {resolved && (
          <div
            className="px-3 py-1.5 text-[10px] font-medium"
            style={{
              color:
                resolved === 'approved'
                  ? 'var(--c-success, #34d399)'
                  : 'var(--c-danger-soft, #f87171)',
              borderTop: '1px solid var(--c-border-2)',
            }}
          >
            {resolved === 'approved'
              ? 'Browser action approved — executing'
              : 'Browser action denied — cancelled'}
          </div>
        )}
      </div>
    </div>
  );
}
