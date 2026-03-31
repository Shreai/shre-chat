import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import { mib007Link } from './chat-utils';

interface AgentSummary {
  name: string;
  identity?: { emoji?: string };
  stats?: { totalTasks: number; successRate: number; currentTask?: string };
  costs?: { totalCostUsd: number };
  status?: string;
}

interface TenantOverview {
  activeAgents: number;
  totalSpendUsd: number;
  budgetUsedPct: number;
  pendingTasks: number;
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return '$0.00';
  return `$${n.toFixed(4)}`;
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

export function AdminView() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await fetchApi<AgentSummary[]>('/api/marketplace/agents');
      if (cancelled) return;
      if (!data) setError('Could not load admin data. Is shre-hr running?');
      setAgents(data ?? []);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const totalSpend = agents.reduce((s, a) => s + (a.costs?.totalCostUsd ?? 0), 0);
  const totalTasks = agents.reduce((s, a) => s + (a.stats?.totalTasks ?? 0), 0);
  const avgQuality = agents.length
    ? agents.reduce((s, a) => s + (a.stats?.successRate ?? 0), 0) / agents.length
    : 0;

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
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Admin Overview
          </span>
        </div>
        <button
          onClick={() => window.open(mib007Link('admin'), '_blank')}
          className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--c-bg-2)',
            color: 'var(--c-text-3)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          Full Admin →
        </button>
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

        {!loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Active Agents
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {agents.length}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Total Spend
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {fmtUsd(totalSpend)}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Total Tasks
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {totalTasks}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Avg Quality
                </div>
                <div
                  className="text-lg font-bold"
                  style={{ color: avgQuality > 80 ? '#4ade80' : '#f59e0b' }}
                >
                  {avgQuality.toFixed(0)}%
                </div>
              </div>
            </div>

            <div>
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--c-text-5)' }}
              >
                Agent Roster
              </h3>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--c-border-2)' }}
              >
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: 'var(--c-bg-2)' }}>
                      <th
                        className="text-left px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Agent
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Tasks
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Quality
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Cost
                      </th>
                      <th
                        className="text-center px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a, i) => (
                      <tr
                        key={a.name}
                        style={{ background: i % 2 === 0 ? 'var(--c-bg-1)' : 'var(--c-bg-2)' }}
                      >
                        <td className="px-3 py-2 flex items-center gap-1.5">
                          <span>{a.identity?.emoji || '🤖'}</span>
                          <span style={{ color: 'var(--c-text-2)' }}>{a.name}</span>
                        </td>
                        <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                          {a.stats?.totalTasks ?? 0}
                        </td>
                        <td
                          className="text-right px-3 py-2"
                          style={{
                            color: (a.stats?.successRate ?? 0) > 80 ? '#4ade80' : '#f59e0b',
                          }}
                        >
                          {(a.stats?.successRate ?? 0).toFixed(0)}%
                        </td>
                        <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                          {fmtUsd(a.costs?.totalCostUsd ?? 0)}
                        </td>
                        <td className="text-center px-3 py-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: a.status === 'active' ? '#4ade80' : '#a1a1aa' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
