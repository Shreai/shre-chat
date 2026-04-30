import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import ports from '../../ports.json';

const ROUTER_BASE = import.meta.env.VITE_ROUTER_URL ?? `${window.location.origin}/api/router`;

interface CostSummary {
  totalCostUsd: number;
  totalSavingsUsd: number;
  localPercent: number;
  cloudPercent: number;
  totalRequests: number;
  avgCostPerRequest: number;
  topModel: string;
  periodFrom: string;
  periodTo: string;
  totalTokens: number;
}

interface CostByModel {
  model: string;
  provider: string;
  local: boolean;
  requests: number;
  costUsd: number;
  savingsUsd: number;
  avgLatencyMs: number;
  pct: number;
  totalTokens: number;
}

interface ProviderStatus {
  provider: string;
  status: 'active' | 'degraded' | 'down' | 'no_keys';
  keys: { total: number; healthy: number; inCooldown: number };
  lastUsed: string | null;
  lastError: string | null;
  spendUsd: number;
  balance: {
    available: boolean;
    remainingUsd: number | null;
    limitUsd: number | null;
    source: string;
  };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${ROUTER_BASE}${path}`);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n === 0) return '$0.00';
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

export function SpendView() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [byModel, setByModel] = useState<CostByModel[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [s, m, p] = await Promise.all([
        fetchJson<CostSummary>('/v1/costs/summary'),
        fetchJson<CostByModel[]>('/v1/costs/by-model'),
        fetchJson<ProviderStatus[]>('/v1/provider-status'),
      ]);

      if (cancelled) return;

      if (!s && !m && !p) {
        setError('Could not reach the gateway service. Is it running?');
      }
      setSummary(s);
      setByModel(m ?? []);
      setProviders(p ?? []);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--c-bg-1)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--c-border-1)' }}
      >
        <svg
          className="h-4 w-4"
          style={{ color: 'var(--c-text-3)' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Provider Spend
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-5)' }}>
          via gateway service
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"
              style={{ color: 'var(--c-text-5)' }}
            />
          </div>
        )}

        {error && (
          <SBadge
            variant="destructive"
            className="w-full justify-center rounded-lg px-4 py-3 text-sm"
          >
            {error}
          </SBadge>
        )}

        {!loading && summary && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Total Spend" value={fmtUsd(summary.totalCostUsd)} />
              <SummaryCard
                label="Savings (Local)"
                value={fmtUsd(summary.totalSavingsUsd)}
                accent="#4ade80"
              />
              <SummaryCard label="Requests" value={String(summary.totalRequests)} />
              <SummaryCard label="Avg / Request" value={fmtUsd(summary.avgCostPerRequest)} />
              <SummaryCard label="Local %" value={`${summary.localPercent}%`} accent="#4ade80" />
              <SummaryCard label="Tokens" value={fmtTokens(summary.totalTokens)} />
            </div>

            {/* Provider Status */}
            {providers.length > 0 && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Providers
                </h3>
                <div className="space-y-1.5">
                  {providers.map((p) => (
                    <div
                      key={p.provider}
                      className="rounded-lg px-3 py-2.5 flex items-center justify-between"
                      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SBadge
                          variant={
                            p.status === 'active'
                              ? 'success'
                              : p.status === 'degraded'
                                ? 'warning'
                                : p.status === 'down'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                          className="h-2 w-2 p-0 shrink-0"
                        />
                        <div className="min-w-0">
                          <div
                            className="text-xs font-medium capitalize"
                            style={{ color: 'var(--c-text-1)' }}
                          >
                            {p.provider}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                            {p.keys.healthy}/{p.keys.total} keys healthy
                            {p.keys.inCooldown > 0 && ` · ${p.keys.inCooldown} cooling`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-xs font-mono font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {fmtUsd(p.spendUsd)}
                        </div>
                        <SBadge
                          variant={
                            p.status === 'active'
                              ? 'success'
                              : p.status === 'degraded'
                                ? 'warning'
                                : p.status === 'down'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                          className="text-[9px] px-1.5 py-0 h-4"
                        >
                          {p.status}
                        </SBadge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By Model */}
            {byModel.length > 0 && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  By Model
                </h3>
                <div className="space-y-1">
                  {byModel.map((m) => (
                    <div
                      key={m.model}
                      className="rounded-lg px-3 py-2 flex items-center justify-between"
                      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                    >
                      <div className="min-w-0">
                        <div
                          className="text-[11px] font-medium truncate"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {m.model}
                        </div>
                        <div
                          className="text-[10px] flex gap-2"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          <span>{m.requests} req</span>
                          <span>{fmtTokens(m.totalTokens)} tok</span>
                          <span>{fmtMs(m.avgLatencyMs)}</span>
                          {m.local && <span style={{ color: 'var(--c-success-soft)' }}>local</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div
                          className="text-xs font-mono font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {fmtUsd(m.costUsd)}
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                          {m.pct}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top model & period */}
            <div className="text-[10px] pt-2" style={{ color: 'var(--c-text-5)' }}>
              Top model: {summary.topModel} · Auto-refreshes every 30s
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
    >
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--c-text-5)' }}>
        {label}
      </div>
      <div
        className="text-base font-semibold font-mono"
        style={{ color: accent || 'var(--c-text-1)' }}
      >
        {value}
      </div>
    </div>
  );
}
