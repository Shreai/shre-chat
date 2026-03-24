import { useState, useEffect, useCallback } from "react";
import { mib007Link } from "./chat-utils";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  agent?: string;
  agent_id?: string;
  project_id?: string;
  parent_id?: string;
  quality_score?: number;
  completion_ratio?: number;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  due_at?: number;
  source?: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "created", label: "Created" },
  { value: "todo", label: "To-Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending_review", label: "Pending Review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  created: "#6b7280",
  todo: "#3b82f6",
  in_progress: "#8b5cf6",
  pending_review: "#f59e0b",
  blocked: "#ef4444",
  done: "#22c55e",
  cancelled: "#9ca3af",
};

function getToken() {
  return sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token") || "";
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function relativeTime(ts: string | number): string {
  const d = new Date(typeof ts === "number" ? ts : ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("created,todo,in_progress,pending_review,blocked");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = statusFilter ? `?status=${statusFilter}&limit=200` : "?limit=200";
      const data = await apiFetch(`/api/tasks${qs}`);
      const list = Array.isArray(data) ? data : data.tasks || data || [];
      setTasks(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30s
  useEffect(() => {
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const updateTask = async (id: string, patch: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      load();
    } catch {}
  };

  const filtered = tasks.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.agent?.toLowerCase().includes(q) || t.id.includes(q);
  });

  const grouped = {
    critical: filtered.filter((t) => t.priority === "critical"),
    high: filtered.filter((t) => t.priority === "high"),
    medium: filtered.filter((t) => t.priority === "medium"),
    low: filtered.filter((t) => t.priority === "low" || !t.priority),
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: "var(--c-bg-1)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Tasks</h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", color: "#a78bfa" }}>
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={mib007Link("tasks")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "var(--c-text-3)" }}
          >
            Open in MIB007
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <button onClick={load} className="text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/5" style={{ color: "var(--c-text-3)" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="flex-1 min-w-[140px] max-w-[260px] bg-transparent text-[13px] px-2 py-1 rounded-lg outline-none"
          style={{ color: "var(--c-text-1)", border: "1px solid var(--c-border-2)" }}
        />
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStatusFilter("created,todo,in_progress,pending_review,blocked")}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
              background: statusFilter.includes("created") && !statusFilter.includes("done") ? "var(--c-accent)" : "transparent",
              color: statusFilter.includes("created") && !statusFilter.includes("done") ? "#fff" : "var(--c-text-3)",
            }}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter("done")}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
              background: statusFilter === "done" ? "var(--c-accent)" : "transparent",
              color: statusFilter === "done" ? "#fff" : "var(--c-text-3)",
            }}
          >
            Done
          </button>
          <button
            onClick={() => setStatusFilter("")}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
              background: !statusFilter ? "var(--c-accent)" : "transparent",
              color: !statusFilter ? "#fff" : "var(--c-text-3)",
            }}
          >
            All
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && tasks.length === 0 && (
          <div className="flex items-center justify-center py-12" style={{ color: "var(--c-text-4)" }}>Loading tasks...</div>
        )}
        {error && (
          <div className="text-[13px] text-center py-8" style={{ color: "var(--c-error, #ef4444)" }}>
            {error === "502" ? "Could not reach task service. Is shre-tasks running?" : `Error: ${error}`}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--c-text-4)" }}>
            <div className="text-lg mb-2">No tasks found</div>
            <div className="text-[13px]">Tasks created by agents or from chat will appear here.</div>
          </div>
        )}

        {(["critical", "high", "medium", "low"] as const).map((priority) => {
          const items = grouped[priority];
          if (items.length === 0) return null;
          return (
            <div key={priority} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PRIORITY_COLORS[priority] }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>
                  {priority} ({items.length})
                </span>
              </div>
              <div className="space-y-1">
                {items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    onUpdate={updateTask}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  expanded,
  onToggle,
  onUpdate,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const isDone = task.status === "done" || task.status === "cancelled";
  return (
    <div
      className="rounded-lg transition-colors"
      style={{ background: expanded ? "var(--c-bg-2)" : "transparent", border: expanded ? "1px solid var(--c-border-2)" : "1px solid transparent" }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-center gap-2.5"
        style={{ color: "var(--c-text-1)" }}
      >
        {/* Status dot */}
        <span
          className="shrink-0 h-2.5 w-2.5 rounded-full"
          style={{ background: STATUS_COLORS[task.status] || "#6b7280" }}
          title={task.status}
        />

        {/* Title */}
        <span
          className="flex-1 text-[13px] truncate"
          style={{ textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.5 : 1 }}
        >
          {task.title}
        </span>

        {/* Agent badge */}
        {(task.agent || task.agent_id) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa" }}>
            {task.agent || task.agent_id}
          </span>
        )}

        {/* Time */}
        <span className="text-[10px] shrink-0" style={{ color: "var(--c-text-4)" }}>
          {relativeTime(task.updated_at || task.created_at)}
        </span>

        {/* Chevron */}
        <svg
          className="h-3 w-3 shrink-0 transition-transform"
          style={{ color: "var(--c-text-4)", transform: expanded ? "rotate(180deg)" : "none" }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {task.description && (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--c-text-3)" }}>
              {task.description.slice(0, 500)}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ color: "var(--c-text-4)" }}>
            <span>ID: {task.id.slice(0, 12)}</span>
            {task.source && <span>Source: {task.source}</span>}
            {task.project_id && <span>Project: {task.project_id.slice(0, 12)}</span>}
            {task.quality_score != null && <span>Quality: {(task.quality_score * 100).toFixed(0)}%</span>}
            {task.completion_ratio != null && <span>Progress: {(task.completion_ratio * 100).toFixed(0)}%</span>}
            {task.due_at && <span>Due: {new Date(task.due_at).toLocaleDateString()}</span>}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 pt-1">
            {task.status === "created" && (
              <QuickAction label="Start" color="#8b5cf6" onClick={() => onUpdate(task.id, { status: "in_progress" })} />
            )}
            {task.status === "todo" && (
              <QuickAction label="Start" color="#8b5cf6" onClick={() => onUpdate(task.id, { status: "in_progress" })} />
            )}
            {task.status === "in_progress" && (
              <QuickAction label="Complete" color="#22c55e" onClick={() => onUpdate(task.id, { status: "done" })} />
            )}
            {task.status === "pending_review" && (
              <>
                <QuickAction label="Approve" color="#22c55e" onClick={() => onUpdate(task.id, { status: "todo" })} />
                <QuickAction label="Reject" color="#ef4444" onClick={() => onUpdate(task.id, { status: "cancelled" })} />
              </>
            )}
            {task.status === "blocked" && (
              <QuickAction label="Unblock" color="#3b82f6" onClick={() => onUpdate(task.id, { status: "in_progress" })} />
            )}
            <a
              href={mib007Link(`tasks`)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-2 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: "var(--c-text-4)" }}
            >
              View in MIB007
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-[11px] px-2 py-1 rounded transition-colors hover:opacity-80"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </button>
  );
}
