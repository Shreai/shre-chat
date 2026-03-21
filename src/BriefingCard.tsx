import { useState, useEffect, useCallback } from "react";

interface BriefingSummary {
  greeting: string;
  timestamp: string;
  warnings?: string[];
  sections: {
    tasks?: { total: number; overdue: number; due_today: number };
    agents?: { active: number; total: number };
    budget?: { remaining?: number; total?: number; used?: number; status?: string };
    reminders?: { upcoming: number };
  };
  config?: { time: string; enabled: boolean };
}

/**
 * BriefingCard — compact summary card for morning briefing.
 * Shows task count, agent status, budget, and reminder count at a glance.
 * Designed to embed in the sidebar or chat header area.
 */
export function BriefingCard({ onExpand }: { onExpand?: () => void }) {
  const [data, setData] = useState<BriefingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      const res = await fetch("/v1/briefing", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch {
      // Silently fail — card just won't show
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  if (loading) {
    return (
      <div className="px-3 py-3 rounded-xl animate-pulse" style={{ background: "var(--c-bg-2)" }}>
        <div className="h-4 rounded" style={{ background: "var(--c-bg-hover)", width: "60%" }} />
        <div className="h-3 rounded mt-2" style={{ background: "var(--c-bg-hover)", width: "80%" }} />
      </div>
    );
  }

  if (!data) return null;

  const { sections } = data;
  const hasOverdue = (sections.tasks?.overdue ?? 0) > 0;

  return (
    <div
      className="px-3 py-3 rounded-xl cursor-pointer transition-colors space-y-2"
      style={{ background: "var(--c-bg-2)" }}
      onClick={onExpand}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--c-bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--c-bg-2)"; }}
      title="Click to view full briefing"
    >
      {/* Greeting */}
      <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
        {data.greeting}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tasks */}
        {sections.tasks && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" style={{ color: hasOverdue ? "rgb(239,68,68)" : "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span className="text-xs" style={{ color: hasOverdue ? "rgb(239,68,68)" : "var(--c-text-3)" }}>
              {sections.tasks.due_today} due{sections.tasks.overdue > 0 && `, ${sections.tasks.overdue} overdue`}
            </span>
          </div>
        )}

        {/* Agents */}
        {sections.agents && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            </svg>
            <span className="text-xs" style={{ color: "var(--c-text-3)" }}>
              {sections.agents.active}/{sections.agents.total} agents
            </span>
          </div>
        )}

        {/* Budget */}
        {sections.budget && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" style={{ color: sections.budget.status === "over" ? "rgb(239,68,68)" : "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span className="text-xs" style={{ color: sections.budget.status === "over" ? "rgb(239,68,68)" : "var(--c-text-3)" }}>
              {sections.budget.status === "over" ? "Over budget" : sections.budget.remaining !== undefined ? `$${sections.budget.remaining} left` : "OK"}
            </span>
          </div>
        )}

        {/* Reminders */}
        {sections.reminders && sections.reminders.upcoming > 0 && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-xs" style={{ color: "var(--c-text-3)" }}>
              {sections.reminders.upcoming} reminder{sections.reminders.upcoming !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <p className="text-[11px]" style={{ color: "rgb(202,138,4)" }}>
          Partial: {data.warnings.join(", ")}
        </p>
      )}
    </div>
  );
}
