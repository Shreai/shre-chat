import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import ChartRenderer, { type ChartData } from './components/ChartRenderer';

interface PipelineStatus {
  latestRun: {
    id: string;
    startedAt: string;
    completedAt?: string;
    status: string;
    trainingPairs: number;
    outcome?: string;
    durationMs?: number;
  } | null;
  totalRuns: number;
  trainingPairsAvailable: number;
}

interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  trainingPairs: number;
  outcome?: string;
  durationMs?: number;
}

interface SkillData {
  skills?: Array<{ name: string; level: number; agent?: string }>;
}

function fmtDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(1)}s`;
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

export function FinetuneView() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [history, setHistory] = useState<PipelineRun[]>([]);
  const [skills, setSkills] = useState<SkillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [s, h, sk] = await Promise.all([
        fetchApi<PipelineStatus>('/api/finetune/status'),
        fetchApi<{ runs: PipelineRun[] }>('/api/finetune/history'),
        fetchApi<SkillData>('/api/finetune/skills'),
      ]);
      if (cancelled) return;
      if (!s) setError('Could not reach fine-tuning API. Is shre-finetune running?');
      setStatus(s);
      setHistory(h?.runs ?? []);
      setSkills(sk);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  async function triggerRun() {
    setTriggering(true);
    try {
      const r = await fetch('/api/finetune/trigger', { method: 'POST' });
      if (!r.ok) throw new Error('Failed');
    } catch {
      /* will show on next refresh */
    }
    setTriggering(false);
  }

  const skillChart: ChartData | null = skills?.skills?.length
    ? {
        type: 'bar',
        labels: skills.skills.slice(0, 15).map((s) => s.name),
        datasets: [
          {
            label: 'Level',
            data: skills.skills.slice(0, 15).map((s) => s.level),
            color: '#a78bfa',
          },
        ],
        options: { showValues: true },
      }
    : null;

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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Fine-Tuning Pipeline
          </span>
        </div>
        <button
          onClick={triggerRun}
          disabled={triggering}
          className="px-3 py-1 rounded text-[11px] font-semibold transition-colors"
          style={{
            background: triggering ? 'var(--c-bg-2)' : 'var(--c-accent, #6366f1)',
            color: triggering ? 'var(--c-text-4)' : '#fff',
            opacity: triggering ? 0.6 : 1,
          }}
        >
          {triggering ? 'Starting...' : 'Trigger Training'}
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

        {!loading && status && (
          <>
            {/* Status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Last Run
                </div>
                <div
                  className="text-[12px] font-bold"
                  style={{
                    color:
                      status.latestRun?.status === 'completed'
                        ? '#4ade80'
                        : status.latestRun?.status === 'failed'
                          ? '#f87171'
                          : 'var(--c-text-1)',
                  }}
                >
                  {status.latestRun?.status || 'Never'}
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
                  Training Pairs
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {status.latestRun?.trainingPairs ?? 0}
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
                  Total Runs
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {status.totalRuns}
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
                  Data Available
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {status.trainingPairsAvailable}
                </div>
              </div>
            </div>

            {/* Skill Coverage Chart */}
            {skillChart && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Skill Coverage
                </h3>
                <div
                  className="rounded-lg p-3"
                  style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                >
                  <ChartRenderer data={skillChart} height={200} />
                </div>
              </div>
            )}

            {/* Run History */}
            {history.length > 0 && (
              <div>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Run History
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
                          Date
                        </th>
                        <th
                          className="text-center px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Status
                        </th>
                        <th
                          className="text-right px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Pairs
                        </th>
                        <th
                          className="text-right px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 20).map((run, i) => (
                        <tr
                          key={run.id}
                          style={{ background: i % 2 === 0 ? 'var(--c-bg-1)' : 'var(--c-bg-2)' }}
                        >
                          <td className="px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                            {run.startedAt?.slice(0, 16).replace('T', ' ')}
                          </td>
                          <td className="text-center px-3 py-2">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                              style={{
                                background:
                                  run.status === 'completed'
                                    ? 'rgba(74,222,128,0.15)'
                                    : run.status === 'failed'
                                      ? 'rgba(248,113,113,0.15)'
                                      : 'rgba(96,165,250,0.15)',
                                color:
                                  run.status === 'completed'
                                    ? '#4ade80'
                                    : run.status === 'failed'
                                      ? '#f87171'
                                      : '#60a5fa',
                              }}
                            >
                              {run.status}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                            {run.trainingPairs}
                          </td>
                          <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                            {run.durationMs ? fmtDuration(run.durationMs) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
