import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import ChartRenderer, { type ChartData } from './components/ChartRenderer';
import { DateRangeSelector } from './components/DateRangeSelector';
import { ExportButton } from './components/ExportButton';

interface CostSummary {
  totalCostUsd: number;
  totalSavingsUsd: number;
  localPercent: number;
  totalRequests: number;
  avgCostPerRequest: number;
  totalTokens: number;
  periodFrom: string;
  periodTo: string;
}

interface CostByModel {
  model: string;
  provider: string;
  requests: number;
  costUsd: number;
  pct: number;
}
interface CostByAgent {
  agent: string;
  agentId?: string;
  requests: number;
  costUsd: number;
  savingsUsd: number;
}
interface TimelinePoint {
  bucket: string;
  costUsd: number;
  requests: number;
}
interface BudgetInfo {
  agentId: string;
  dailyLimitUsd: number;
  weeklyLimitUsd: number;
  spentTodayUsd: number;
  spentWeekUsd: number;
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n === 0) return '$0.00';
  return `$${n.toFixed(4)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
        style={{ color: 'var(--c-text-5)' }}
      >
        {label}
      </div>
      <div className="text-lg font-bold" style={{ color: accent || 'var(--c-text-1)' }}>
        {value}
      </div>
    </div>
  );
}

export function CostDashboardView() {
  const [range, setRange] = useState({ from: daysAgo(30), to: today() });
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [byModel, setByModel] = useState<CostByModel[]>([]);
  const [byAgent, setByAgent] = useState<CostByAgent[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [budgets, setBudgets] = useState<BudgetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = `from=${range.from}&to=${range.to}`;
      const [s, m, a, t, b] = await Promise.all([
        fetchApi<CostSummary>(`/api/costs/summary?${qs}`),
        fetchApi<CostByModel[]>(`/api/costs/by-model?${qs}`),
        fetchApi<any[]>(`/api/costs/by-agent?${qs}`),
        fetchApi<TimelinePoint[]>(`/api/costs/timeline?${qs}&granularity=day`),
        fetchApi<BudgetInfo[]>(`/api/budgets/tenants`),
      ]);
      if (cancelled) return;
      if (!s && !m && !a) setError('Could not reach cost APIs. Is shre-meter running?');
      setSummary(s);
      setByModel(m ?? []);
      // Normalize: shre-meter returns agentId, UI expects agent
      setByAgent((a ?? []).map((x: any) => ({
        agent: x.agent || x.agentId || 'unknown',
        requests: x.requests || 0,
        costUsd: x.costUsd || 0,
        savingsUsd: x.savingsUsd || 0,
      })));
      setTimeline(t ?? []);
      setBudgets(b ?? []);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [range]);

  const timelineChart: ChartData | null = timeline.length
    ? {
        type: 'line',
        labels: timeline.map((t) => t.bucket.slice(5, 10)),
        datasets: [{ label: 'Cost ($)', data: timeline.map((t) => t.costUsd), color: '#60a5fa' }],
        options: { showLegend: true, currency: true },
      }
    : null;

  const modelChart: ChartData | null = byModel.length
    ? {
        type: 'pie',
        labels: byModel.map((m) => m.model),
        datasets: [{ label: 'Cost', data: byModel.map((m) => m.costUsd) }],
        options: { showLegend: true, currency: true },
      }
    : null;

  const agentChart: ChartData | null = byAgent.length
    ? {
        type: 'bar',
        labels: byAgent.map((a) => a.agent),
        datasets: [{ label: 'Cost ($)', data: byAgent.map((a) => a.costUsd), color: '#f59e0b' }],
        options: { showValues: true, currency: true },
      }
    : null;

  const exportData = byAgent.map((a) => ({
    agent: a.agent,
    requests: a.requests,
    costUsd: a.costUsd,
    savingsUsd: a.savingsUsd,
  }));

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 justify-between"
        style={{ borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4"
            style={{ color: 'var(--c-text-3)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Cost Dashboard
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-5)' }}>
            via shre-meter
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} />
          <ExportButton data={exportData} filename="cost-report" />
        </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <StatCard label="Total Spend" value={fmtUsd(summary.totalCostUsd)} />
              <StatCard
                label="Savings (Local)"
                value={fmtUsd(summary.totalSavingsUsd)}
                accent="#4ade80"
              />
              <StatCard label="Requests" value={fmtNum(summary.totalRequests)} />
              <StatCard label="Avg / Request" value={fmtUsd(summary.avgCostPerRequest)} />
              <StatCard label="Local %" value={`${summary.localPercent}%`} accent="#4ade80" />
              <StatCard label="Tokens" value={fmtNum(summary.totalTokens)} />
            </div>

            {timelineChart && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Spend Timeline
                </h3>
                <div
                  className="rounded-lg p-3"
                  style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                >
                  <ChartRenderer data={timelineChart} height={180} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modelChart && (
                <div>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--c-text-5)' }}
                  >
                    By Model
                  </h3>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                  >
                    <ChartRenderer data={modelChart} height={200} />
                  </div>
                </div>
              )}
              {agentChart && (
                <div>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--c-text-5)' }}
                  >
                    By Agent
                  </h3>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                  >
                    <ChartRenderer data={agentChart} height={200} />
                  </div>
                </div>
              )}
            </div>

            {budgets.length > 0 && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Budget Status
                </h3>
                <div className="space-y-1.5">
                  {budgets.map((b) => {
                    const dailyPct =
                      b.dailyLimitUsd > 0
                        ? Math.min(100, (b.spentTodayUsd / b.dailyLimitUsd) * 100)
                        : 0;
                    const weeklyPct =
                      b.weeklyLimitUsd > 0
                        ? Math.min(100, (b.spentWeekUsd / b.weeklyLimitUsd) * 100)
                        : 0;
                    return (
                      <div
                        key={b.agentId}
                        className="rounded-lg px-3 py-2"
                        style={{
                          background: 'var(--c-bg-2)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--c-text-2)' }}
                          >
                            {b.agentId}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                            {fmtUsd(b.spentTodayUsd)} / {fmtUsd(b.dailyLimitUsd)} daily
                          </span>
                        </div>
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--c-bg-1)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${dailyPct}%`,
                              background:
                                dailyPct > 90 ? '#f87171' : dailyPct > 70 ? '#f59e0b' : '#4ade80',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
