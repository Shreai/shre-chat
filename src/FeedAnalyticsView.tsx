import { useState, useEffect, useMemo } from 'react';
import { useApp } from './store';
import { SBadge } from '@shre/ui-kit';
import ChartRenderer, { type ChartData } from './components/ChartRenderer';
import { DateRangeSelector } from './components/DateRangeSelector';
import { ExportButton } from './components/ExportButton';

interface FeedAnalytics {
  total: number;
  timeline: { day: string; count: number }[];
  byAgent: { agent: string; count: number }[];
  byCategory: { category: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
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

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f87171',
  warning: '#f59e0b',
  info: '#60a5fa',
  success: '#4ade80',
};

export function FeedAnalyticsView() {
  const { actions } = useApp();
  const [range, setRange] = useState({ from: daysAgo(7), to: today() });
  const [data, setData] = useState<FeedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    new Set(['critical', 'warning', 'info']),
  );
  const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
  const byCategory = Array.isArray(data?.byCategory) ? data.byCategory : [];
  const byAgent = Array.isArray(data?.byAgent) ? data.byAgent : [];
  const bySeverity = Array.isArray(data?.bySeverity) ? data.bySeverity : [];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchApi<FeedAnalytics>(
        `/api/feed/analytics?since=${range.from}&until=${range.to}`,
      );
      if (cancelled) return;
      if (!result) setError('Could not reach feed analytics. Is shre-feed running?');
      setData(result);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [range]);

  const timelineChart: ChartData | null = timeline.length
    ? {
        type: 'line',
        labels: timeline.map((t) => t.day.slice(5)),
        datasets: [{ label: 'Events', data: timeline.map((t) => t.count), color: '#60a5fa' }],
        options: { showLegend: true },
      }
    : null;

  const categoryChart: ChartData | null = byCategory.length
    ? {
        type: 'pie',
        labels: byCategory.map((c) => c.category),
        datasets: [{ label: 'Events', data: byCategory.map((c) => c.count) }],
        options: { showLegend: true },
      }
    : null;

  const agentChart: ChartData | null = byAgent.length
    ? {
        type: 'bar',
        labels: byAgent.slice(0, 10).map((a) => a.agent),
        datasets: [
          {
            label: 'Events',
            data: byAgent.slice(0, 10).map((a) => a.count),
            color: '#a78bfa',
          },
        ],
        options: { showValues: true },
      }
    : null;

  const exportData = byAgent.map((a) => ({ agent: a.agent, events: a.count }));

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
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Feed Analytics
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-5)' }}>
            via shre-feed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} />
          <ExportButton data={exportData} filename="feed-analytics" />
        </div>
      </div>

      {/* Severity toggles */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
          Severity:
        </span>
        {['critical', 'warning', 'info'].map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = new Set(severityFilter);
              next.has(s) ? next.delete(s) : next.add(s);
              setSeverityFilter(next);
            }}
            className="px-2 py-0.5 rounded text-[10px] font-medium capitalize"
            style={{
              background: severityFilter.has(s)
                ? (SEVERITY_COLORS[s] || '#60a5fa') + '22'
                : 'var(--c-bg-2)',
              color: severityFilter.has(s) ? SEVERITY_COLORS[s] || '#60a5fa' : 'var(--c-text-4)',
              border: `1px solid ${severityFilter.has(s) ? (SEVERITY_COLORS[s] || '#60a5fa') + '44' : 'var(--c-border-2)'}`,
            }}
          >
            {s} {bySeverity.find((x) => x.severity === s)?.count ?? 0}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-[11px] font-bold" style={{ color: 'var(--c-text-2)' }}>
            {data.total.toLocaleString()} total events
          </span>
        )}
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

        {!loading && data && (
          <>
            {timelineChart && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Event Volume
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
              {categoryChart && (
                <div>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--c-text-5)' }}
                  >
                    By Category
                  </h3>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                  >
                    <ChartRenderer data={categoryChart} height={200} />
                  </div>
                </div>
              )}
              {agentChart && (
                <div>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--c-text-5)' }}
                  >
                    Top Agents
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

            {/* Drill-through: click to switch to FeedView with filter */}
            {data.byAgent.length > 0 && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Agent Breakdown
                </h3>
                <div className="space-y-1">
                  {data.byAgent.slice(0, 15).map((a) => (
                    <button
                      key={a.agent}
                      onClick={() => actions.setView('feed')}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors"
                      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                      }}
                    >
                      <span className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>
                        {a.agent}
                      </span>
                      <span className="text-[11px] font-bold" style={{ color: 'var(--c-text-3)' }}>
                        {a.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
