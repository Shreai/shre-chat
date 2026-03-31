import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '@shre/ui-kit';
import { GanttChart, type GanttTask } from './components/GanttChart';
import { DateRangeSelector } from './components/DateRangeSelector';

interface TaskRaw {
  id: string;
  title: string;
  status: string;
  agent_id?: string;
  parent_id?: string;
  quality_score?: number;
  created_at: string;
  completed_at?: string;
  updated_at?: string;
  project_id?: string;
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

export function TaskTimelineView() {
  const [range, setRange] = useState({ from: daysAgo(14), to: today() });
  const [tasks, setTasks] = useState<TaskRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (agentFilter !== 'all') qs.set('agent', agentFilter);
      const result = await fetchApi<{ tasks: TaskRaw[] } | TaskRaw[]>(`/api/task-timeline?${qs}`);
      if (cancelled) return;
      if (!result) {
        setError('Could not load tasks. Is shre-tasks running?');
        setLoading(false);
        return;
      }
      const list = Array.isArray(result) ? result : result.tasks || [];
      setTasks(list);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [range, statusFilter, agentFilter]);

  const ganttTasks: GanttTask[] = useMemo(
    () =>
      tasks
        .filter((t) => t.created_at >= range.from && t.created_at <= range.to + 'T23:59:59Z')
        .map((t) => ({
          id: t.id,
          title: t.title || t.id.slice(0, 8),
          start: t.created_at,
          end: t.completed_at || t.updated_at || t.created_at,
          status: t.status,
          agent: t.agent_id,
          parentId: t.parent_id,
          qualityScore: t.quality_score,
        })),
    [tasks, range],
  );

  const agents = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.agent_id).filter(Boolean) as string[])),
    [tasks],
  );
  const statuses = ['all', 'todo', 'in_progress', 'done', 'blocked', 'failed'];

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
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Task Timeline
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--c-text-5)' }}>
            via shre-tasks
          </span>
        </div>
        <DateRangeSelector value={range} onChange={setRange} />
      </div>

      {/* Filters */}
      <div
        className="px-4 py-2 flex items-center gap-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
            Status:
          </span>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
              style={{
                background: statusFilter === s ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                color: statusFilter === s ? '#fff' : 'var(--c-text-4)',
                border: `1px solid ${statusFilter === s ? 'transparent' : 'var(--c-border-2)'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
              Agent:
            </span>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--c-bg-2)',
                color: 'var(--c-text-2)',
                border: '1px solid var(--c-border-2)',
              }}
            >
              <option value="all">All</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="ml-auto text-[11px]" style={{ color: 'var(--c-text-4)' }}>
          {ganttTasks.length} tasks
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
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

        {!loading && ganttTasks.length > 0 && (
          <div
            className="rounded-lg p-3 overflow-x-auto"
            style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
          >
            <GanttChart tasks={ganttTasks} height={Math.max(300, ganttTasks.length * 28 + 40)} />
          </div>
        )}

        {!loading && ganttTasks.length === 0 && !error && (
          <p className="text-center text-[12px] py-12" style={{ color: 'var(--c-text-4)' }}>
            No tasks in selected range
          </p>
        )}
      </div>
    </div>
  );
}
