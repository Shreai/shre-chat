import { useState, useEffect, useCallback } from "react";

interface Reminder {
  id: string;
  text: string;
  due: string;
  recurring?: "daily" | "weekly" | "monthly" | null;
  completed: boolean;
  snoozed?: string | null;
}

function getToken() {
  return sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token") || "";
}

/**
 * RemindersList — lightweight list component showing active reminders with delete.
 * Designed to embed in the sidebar or dashboard. For the full reminders management
 * UI (create, snooze, NL parsing), use RemindersView instead.
 */
export function RemindersList({ onViewAll }: { onViewAll?: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/v1/reminders", {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setReminders((data.reminders || []).filter((r: Reminder) => !r.completed));
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    try {
      await fetch(`/v1/reminders/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="px-3 py-3 rounded-xl animate-pulse" style={{ background: "var(--c-bg-2)" }}>
        <div className="h-3 rounded" style={{ background: "var(--c-bg-hover)", width: "50%" }} />
        <div className="h-3 rounded mt-2" style={{ background: "var(--c-bg-hover)", width: "70%" }} />
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <div className="px-3 py-3 rounded-xl" style={{ background: "var(--c-bg-2)" }}>
        <p className="text-xs" style={{ color: "var(--c-text-4)" }}>No active reminders</p>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs mt-1 underline" style={{ color: "var(--c-text-3)", background: "none", border: "none", cursor: "pointer" }}>
            Manage reminders
          </button>
        )}
      </div>
    );
  }

  const now = new Date();
  const sorted = [...reminders].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium" style={{ color: "var(--c-text-3)" }}>
          Reminders ({reminders.length})
        </span>
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] underline" style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", textUnderlineOffset: "2px" }}>
            View all
          </button>
        )}
      </div>

      {/* List */}
      {sorted.slice(0, 5).map(r => {
        const isOverdue = new Date(r.snoozed || r.due) < now;
        const dueDate = new Date(r.due);
        const isToday = dueDate.toDateString() === now.toDateString();
        const timeStr = dueDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const dateStr = dueDate.toLocaleDateString([], { month: "short", day: "numeric" });

        return (
          <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg group" style={{ background: isOverdue ? "rgba(239,68,68,0.08)" : "var(--c-bg-2)" }}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-500" : "bg-green-500"}`} />
            <span className="flex-1 text-xs truncate" style={{ color: "var(--c-text-1)" }}>{r.text}</span>
            <span className="text-[10px] flex-shrink-0" style={{ color: isOverdue ? "rgb(239,68,68)" : "var(--c-text-4)" }}>
              {isToday ? timeStr : `${dateStr} ${timeStr}`}
            </span>
            {r.recurring && (
              <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ background: "var(--c-bg)", color: "var(--c-text-4)" }}>
                {r.recurring}
              </span>
            )}
            <button
              onClick={() => handleDelete(r.id)}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
              style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer" }}
              title="Delete reminder"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}

      {reminders.length > 5 && (
        <p className="text-[11px] px-2" style={{ color: "var(--c-text-4)" }}>
          +{reminders.length - 5} more
        </p>
      )}
    </div>
  );
}
