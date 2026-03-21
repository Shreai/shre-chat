import { useState, useEffect, useCallback } from "react";
import { SBadge } from "@shre/ui-kit";

interface ScheduledReport {
  id: string;
  name: string;
  query: string;
  schedule: string;
  last_run?: string;
  next_run?: string;
  created_at: string;
}

interface ReportHistory {
  id: string;
  report_id: string;
  status: string;
  result_preview?: string;
  created_at: string;
}

async function fetchApi<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try { const r = await fetch(path, opts); if (!r.ok) return null; return r.json(); } catch { return null; }
}

const SCHEDULE_OPTIONS = [
  { value: "daily_8", label: "Daily at 8 AM" },
  { value: "daily_18", label: "Daily at 6 PM" },
  { value: "weekly_monday", label: "Weekly Monday" },
  { value: "weekly_friday", label: "Weekly Friday" },
  { value: "monthly_1", label: "Monthly 1st" },
  { value: "monthly_15", label: "Monthly 15th" },
];

export function ReportsView() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newSchedule, setNewSchedule] = useState("daily_8");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [r, h] = await Promise.all([
      fetchApi<ScheduledReport[]>("/api/reports"),
      fetchApi<ReportHistory[]>("/api/reports/history"),
    ]);
    if (!r && !h) setError("Could not load reports");
    setReports(r ?? []);
    setHistory(h ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createReport() {
    if (!newName.trim() || !newQuery.trim()) return;
    await fetchApi("/api/reports/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, query: newQuery, schedule: newSchedule }),
    });
    setShowCreate(false);
    setNewName("");
    setNewQuery("");
    load();
  }

  async function deleteReport(id: string) {
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    load();
  }

  async function runNow(id: string) {
    await fetch(`/api/reports/${id}/run`, { method: "POST" });
    setTimeout(load, 2000);
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "var(--c-bg-1)" }}>
      <div className="px-4 py-3 flex items-center gap-2 justify-between" style={{ borderBottom: "1px solid var(--c-border-1)" }}>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" style={{ color: "var(--c-text-3)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Scheduled Reports</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1 rounded text-[11px] font-semibold"
          style={{ background: "var(--c-accent, #6366f1)", color: "#fff" }}
        >
          + New Report
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" style={{ color: "var(--c-text-5)" }} />
          </div>
        )}
        {error && <SBadge variant="destructive" className="w-full justify-center rounded-lg px-4 py-3 text-sm">{error}</SBadge>}

        {/* Create form */}
        {showCreate && (
          <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Report name"
              className="w-full px-3 py-2 rounded-lg text-[12px]"
              style={{ background: "var(--c-bg-1)", color: "var(--c-text-1)", border: "1px solid var(--c-border-2)" }}
            />
            <textarea
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="Report query (e.g. 'daily cost summary for all agents')"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
              style={{ background: "var(--c-bg-1)", color: "var(--c-text-1)", border: "1px solid var(--c-border-2)" }}
            />
            <div className="flex items-center gap-2">
              <select
                value={newSchedule}
                onChange={(e) => setNewSchedule(e.target.value)}
                className="text-[11px] px-2 py-1.5 rounded-lg"
                style={{ background: "var(--c-bg-1)", color: "var(--c-text-2)", border: "1px solid var(--c-border-2)" }}
              >
                {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-1.5 rounded text-[11px]"
                  style={{ color: "var(--c-text-3)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={createReport}
                  className="px-3 py-1.5 rounded text-[11px] font-semibold"
                  style={{ background: "var(--c-accent, #6366f1)", color: "#fff" }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Report list */}
        {!loading && reports.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--c-text-5)" }}>
              Active Schedules ({reports.length})
            </h3>
            <div className="space-y-1.5">
              {reports.map(r => (
                <div key={r.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-2)" }}>
                  <div>
                    <div className="text-[12px] font-medium" style={{ color: "var(--c-text-1)" }}>{r.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--c-text-4)" }}>
                      {r.schedule} · Next: {r.next_run ? new Date(r.next_run).toLocaleString() : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => runNow(r.id)}
                      className="px-2 py-1 rounded text-[10px] transition-colors"
                      style={{ background: "var(--c-bg-1)", color: "var(--c-text-3)", border: "1px solid var(--c-border-2)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--c-accent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--c-border-2)"; }}
                    >
                      Run Now
                    </button>
                    <button
                      onClick={() => deleteReport(r.id)}
                      className="px-2 py-1 rounded text-[10px] transition-colors"
                      style={{ color: "#f87171" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && reports.length === 0 && !error && !showCreate && (
          <p className="text-center text-[12px] py-12" style={{ color: "var(--c-text-4)" }}>
            No scheduled reports. Click "+ New Report" to create one.
          </p>
        )}

        {/* Recent history */}
        {history.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--c-text-5)" }}>Recent Runs</h3>
            <div className="space-y-1">
              {history.slice(0, 10).map(h => (
                <div key={h.id} className="rounded-lg px-3 py-1.5 flex items-center justify-between" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-2)" }}>
                  <div className="text-[11px]" style={{ color: "var(--c-text-3)" }}>
                    {h.created_at?.slice(0, 16).replace("T", " ")}
                  </div>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
                    background: h.status === "success" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                    color: h.status === "success" ? "#4ade80" : "#f87171",
                  }}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
