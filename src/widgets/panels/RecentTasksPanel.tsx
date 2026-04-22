import { useState, useEffect } from 'react';
import type { ChatWidgetProps } from '../types';

interface TaskEntry {
  id: string;
  title: string;
  status: string;
  agent: string | null;
}

const STATUS_DOT: Record<string, string> = {
  done: 'bg-emerald-400',
  completed: 'bg-emerald-400',
  in_progress: 'bg-blue-400',
  running: 'bg-blue-400',
  failed: 'bg-red-400',
  pending: 'bg-zinc-500',
  todo: 'bg-zinc-500',
};

export default function RecentTasksPanel({ size }: ChatWidgetProps) {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tasks/recent');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const list = (Array.isArray(data) ? data : (data.tasks ?? []))
          .slice(0, 5)
          .map((t: any) => ({
            id: t.id,
            title: t.title ?? t.description ?? 'Untitled',
            status: t.status ?? 'pending',
            agent: t.agent ?? t.assigned_to ?? null,
          }));
        setTasks(list);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const limit = size === 'compact' ? 3 : 5;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--c-text-1)]">Recent Tasks</span>
        <span className="text-[11px] font-medium text-[var(--c-text-3)]">
          {loading ? '...' : `${tasks.length} tasks`}
        </span>
      </div>
      {!loading && (
        <ul className="space-y-1.5">
          {tasks.slice(0, limit).map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-zinc-500'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-normal text-[var(--c-text-2)] truncate">{t.title}</p>
                {t.agent && (
                  <p className="text-[11px] font-medium text-[var(--c-text-3)]">{t.agent}</p>
                )}
              </div>
              <span className="text-[11px] font-medium text-[var(--c-text-4)] shrink-0">
                {t.status.replace(/_/g, ' ')}
              </span>
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="text-[13px] text-[var(--c-text-3)]">No recent tasks</li>
          )}
        </ul>
      )}
    </div>
  );
}
