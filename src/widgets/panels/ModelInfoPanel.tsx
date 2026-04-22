import { useMemo } from 'react';
import type { ChatWidgetProps } from '../types';

/**
 * Reads model, cost, and token info from sessionStorage.
 * shre-chat's router-client.ts stores routing metadata per message;
 * this panel aggregates the current session totals.
 */
function getSessionStats() {
  try {
    const raw = sessionStorage.getItem('shre-chat.session-stats');
    if (raw) {
      const d = JSON.parse(raw);
      return {
        model: d.model ?? 'auto',
        cost: typeof d.cost === 'number' ? d.cost : 0,
        tokens: typeof d.tokens === 'number' ? d.tokens : 0,
        messages: typeof d.messages === 'number' ? d.messages : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return { model: 'auto', cost: 0, tokens: 0, messages: 0 };
}

function formatCost(cents: number): string {
  if (cents === 0) return '$0.00';
  return `$${(cents / 100).toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ModelInfoPanel({ size }: ChatWidgetProps) {
  const stats = useMemo(getSessionStats, []);

  return (
    <div className="space-y-2">
      <span className="text-[13px] font-semibold text-[var(--c-text-1)]">Model & Cost</span>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-medium text-[var(--c-text-3)]">Model</p>
          <p className="text-[13px] font-medium text-[var(--c-text-1)] truncate">{stats.model}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[var(--c-text-3)]">Session Cost</p>
          <p className="text-[22px] font-medium tabular-nums text-[var(--c-accent)]">
            {formatCost(stats.cost)}
          </p>
        </div>
        {size === 'expanded' && (
          <>
            <div>
              <p className="text-[11px] font-medium text-[var(--c-text-3)]">Tokens</p>
              <p className="text-[17px] font-medium tabular-nums text-[var(--c-text-1)]">
                {formatTokens(stats.tokens)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--c-text-3)]">Messages</p>
              <p className="text-[17px] font-medium tabular-nums text-[var(--c-text-1)]">
                {stats.messages}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
