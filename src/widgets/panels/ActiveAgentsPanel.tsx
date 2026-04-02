import { useState, useEffect } from 'react';
import type { ChatWidgetProps } from '../types';

interface AgentStatus {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'offline';
}

export default function ActiveAgentsPanel({ size }: ChatWidgetProps) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/status-bar');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const list: AgentStatus[] = (data.agents ?? []).map((a: any) => ({
          id: a.id ?? a.name,
          name: a.name ?? a.id ?? 'Unknown',
          status: a.status === 'active' ? 'active' : a.status === 'idle' ? 'idle' : 'offline',
        }));
        setAgents(list);
      } catch {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeCount = agents.filter((a) => a.status === 'active').length;
  const dotColor: Record<string, string> = {
    active: 'bg-emerald-400',
    idle: 'bg-amber-400',
    offline: 'bg-zinc-500',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--c-text-1)]">Active Agents</span>
        <span className="text-[22px] font-medium tabular-nums text-[var(--c-accent)]">
          {loading ? '--' : activeCount}
        </span>
      </div>
      {size === 'expanded' && !loading && (
        <ul className="space-y-1">
          {agents.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor[a.status]}`} />
              <span className="text-[13px] font-normal text-[var(--c-text-2)] truncate">
                {a.name}
              </span>
              <span className="text-[11px] font-medium text-[var(--c-text-3)] ml-auto">
                {a.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
