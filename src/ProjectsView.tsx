import { useState, useEffect, useCallback } from "react";
import { mib007Link } from "./chat-utils";

interface Project {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  status: string;
  approval_mode?: string;
  source?: string;
  company_id?: string;
  created_at: string | number;
  updated_at?: string | number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  agent?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  archived: "#6b7280",
};

function getToken() {
  return sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token") || "";
}

async function apiFetch(path: string) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
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

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<Record<string, Task[]>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const data = await apiFetch(`/api/projects${qs}`);
      const list = Array.isArray(data) ? data : data.projects || data || [];
      setProjects(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const loadProjectTasks = useCallback(async (projectId: string) => {
    if (projectTasks[projectId]) return;
    try {
      const data = await apiFetch(`/api/tasks?project_id=${projectId}&limit=20`);
      const list = Array.isArray(data) ? data : data.tasks || data || [];
      setProjectTasks((prev) => ({ ...prev, [projectId]: list }));
    } catch {}
  }, [projectTasks]);

  const toggleProject = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadProjectTasks(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: "var(--c-bg-1)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Projects</h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}>
            {projects.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={mib007Link("projects")}
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
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        {["active", "paused", "archived", ""].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
              background: statusFilter === s ? "var(--c-accent)" : "transparent",
              color: statusFilter === s ? "#fff" : "var(--c-text-3)",
            }}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && projects.length === 0 && (
          <div className="flex items-center justify-center py-12" style={{ color: "var(--c-text-4)" }}>Loading projects...</div>
        )}
        {error && (
          <div className="text-[13px] text-center py-8" style={{ color: "var(--c-error, #ef4444)" }}>
            {error === "502" ? "Could not reach task service. Is shre-tasks running?" : `Error: ${error}`}
          </div>
        )}
        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--c-text-4)" }}>
            <div className="text-lg mb-2">No projects found</div>
            <div className="text-[13px]">Projects created from tasks or MIB007 will appear here.</div>
          </div>
        )}

        {projects.map((project) => (
          <div
            key={project.id}
            className="rounded-lg transition-colors"
            style={{ background: expandedId === project.id ? "var(--c-bg-2)" : "transparent", border: "1px solid var(--c-border-2)" }}
          >
            <button
              onClick={() => toggleProject(project.id)}
              className="w-full text-left px-4 py-3 flex items-center gap-3"
            >
              <span className="shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[project.status] || "#6b7280" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: "var(--c-text-1)" }}>{project.name}</div>
                {project.description && (
                  <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--c-text-4)" }}>
                    {project.description.slice(0, 120)}
                  </div>
                )}
              </div>
              <span className="text-[10px] shrink-0" style={{ color: "var(--c-text-4)" }}>
                {relativeTime(project.updated_at || project.created_at)}
              </span>
              <svg
                className="h-3 w-3 shrink-0 transition-transform"
                style={{ color: "var(--c-text-4)", transform: expandedId === project.id ? "rotate(180deg)" : "none" }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {expandedId === project.id && (
              <div className="px-4 pb-3 space-y-2" style={{ borderTop: "1px solid var(--c-border-2)" }}>
                <div className="flex items-center gap-3 pt-2 text-[11px]" style={{ color: "var(--c-text-4)" }}>
                  <span>ID: {project.id.slice(0, 12)}</span>
                  {project.slug && <span>Slug: {project.slug}</span>}
                  {project.approval_mode && <span>Approval: {project.approval_mode}</span>}
                  {project.source && <span>Source: {project.source}</span>}
                </div>

                {/* Project tasks */}
                <div className="mt-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--c-text-4)" }}>
                    Tasks
                  </div>
                  {!projectTasks[project.id] ? (
                    <div className="text-[12px]" style={{ color: "var(--c-text-4)" }}>Loading...</div>
                  ) : projectTasks[project.id].length === 0 ? (
                    <div className="text-[12px]" style={{ color: "var(--c-text-4)" }}>No tasks in this project.</div>
                  ) : (
                    <div className="space-y-1">
                      {projectTasks[project.id].map((t) => (
                        <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px]" style={{ background: "var(--c-bg-1)" }}>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: t.status === "done" ? "#22c55e" : t.status === "in_progress" ? "#8b5cf6" : "#6b7280" }} />
                          <span className="flex-1 truncate" style={{ color: "var(--c-text-2)" }}>{t.title}</span>
                          {t.agent && <span className="text-[10px] px-1 rounded" style={{ color: "#60a5fa" }}>{t.agent}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-1">
                  <a
                    href={mib007Link(`projects/${project.id}`)}
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
        ))}
      </div>
    </div>
  );
}
