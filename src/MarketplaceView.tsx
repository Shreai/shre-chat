import { useState, useEffect, useMemo } from "react";
import { SBadge } from "@shre/ui-kit";
import { mib007Link } from "./chat-utils";

interface Agent {
  name: string;
  department?: string;
  tier?: string;
  skills?: string[];
  stats?: { totalTasks: number; successRate: number; avgCompletionTimeSec: number };
  costs?: { totalCostUsd: number };
  identity?: { emoji?: string; title?: string };
}

type Category = "all" | "c-suite" | "specialist" | "council" | "business";
type SortKey = "quality" | "tasks" | "cost";

async function fetchApi<T>(path: string): Promise<T | null> {
  try { const r = await fetch(path); if (!r.ok) return null; return r.json(); } catch { return null; }
}

function tierColor(tier?: string): string {
  if (tier === "c-suite") return "#f59e0b";
  if (tier === "specialist") return "#a78bfa";
  if (tier === "council") return "#60a5fa";
  return "#4ade80";
}

export function MarketplaceView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [sortBy, setSortBy] = useState<SortKey>("quality");
  const [selected, setSelected] = useState<Agent | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await fetchApi<Agent[]>("/api/marketplace/agents");
      if (cancelled) return;
      if (!data) setError("Could not load agent catalog. Is shre-hr running?");
      setAgents(data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = agents;
    if (category !== "all") list = list.filter(a => (a.tier || a.department || "").toLowerCase().includes(category));
    return list.sort((a, b) => {
      if (sortBy === "quality") return (b.stats?.successRate ?? 0) - (a.stats?.successRate ?? 0);
      if (sortBy === "tasks") return (b.stats?.totalTasks ?? 0) - (a.stats?.totalTasks ?? 0);
      return (a.costs?.totalCostUsd ?? 0) - (b.costs?.totalCostUsd ?? 0);
    });
  }, [agents, category, sortBy]);

  const categories: Category[] = ["all", "c-suite", "specialist", "council", "business"];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "var(--c-bg-1)" }}>
      <div className="px-4 py-3 flex items-center gap-2 justify-between" style={{ borderBottom: "1px solid var(--c-border-1)" }}>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" style={{ color: "var(--c-text-3)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z"/><line x1="3" y1="7" x2="21" y2="7"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Agent Marketplace</span>
        </div>
        <button
          onClick={() => window.open(mib007Link("marketplace"), "_blank")}
          className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{ background: "var(--c-bg-2)", color: "var(--c-text-3)", border: "1px solid var(--c-border-2)" }}
        >
          Full Marketplace →
        </button>
      </div>

      <div className="px-4 py-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="px-2 py-0.5 rounded text-[11px] font-medium capitalize"
            style={{
              background: category === c ? "var(--c-accent, #6366f1)" : "var(--c-bg-2)",
              color: category === c ? "#fff" : "var(--c-text-3)",
              border: `1px solid ${category === c ? "transparent" : "var(--c-border-2)"}`,
            }}
          >
            {c}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Sort:</span>
          {(["quality", "tasks", "cost"] as SortKey[]).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
              style={{
                background: sortBy === s ? "var(--c-bg-3, var(--c-bg-2))" : "transparent",
                color: sortBy === s ? "var(--c-text-1)" : "var(--c-text-4)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" style={{ color: "var(--c-text-5)" }} />
          </div>
        )}
        {error && <SBadge variant="destructive" className="w-full justify-center rounded-lg px-4 py-3 text-sm">{error}</SBadge>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(agent => (
            <button
              key={agent.name}
              onClick={() => setSelected(agent)}
              className="text-left rounded-lg p-3 transition-colors"
              style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-2)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--c-accent, #6366f1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--c-border-2)"; }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{agent.identity?.emoji || "🤖"}</span>
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--c-text-1)" }}>{agent.name}</div>
                  {agent.tier && (
                    <span className="text-[9px] font-bold uppercase px-1 rounded" style={{ background: tierColor(agent.tier) + "22", color: tierColor(agent.tier) }}>
                      {agent.tier}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Tasks</div>
                  <div className="text-[12px] font-bold" style={{ color: "var(--c-text-2)" }}>{agent.stats?.totalTasks ?? 0}</div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Quality</div>
                  <div className="text-[12px] font-bold" style={{ color: (agent.stats?.successRate ?? 0) > 80 ? "#4ade80" : "#f59e0b" }}>
                    {(agent.stats?.successRate ?? 0).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Skills</div>
                  <div className="text-[12px] font-bold" style={{ color: "var(--c-text-2)" }}>{agent.skills?.length ?? 0}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Agent Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setSelected(null)}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            style={{ background: "var(--c-bg-1)", border: "1px solid var(--c-border-1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{selected.identity?.emoji || "🤖"}</span>
              <div>
                <h2 className="text-base font-bold" style={{ color: "var(--c-text-1)" }}>{selected.name}</h2>
                <p className="text-[11px]" style={{ color: "var(--c-text-4)" }}>{selected.identity?.title || selected.department || ""}</p>
              </div>
            </div>
            {selected.skills && selected.skills.length > 0 && (
              <div className="mb-3">
                <h3 className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--c-text-5)" }}>Skills</h3>
                <div className="flex flex-wrap gap-1">
                  {selected.skills.map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "var(--c-bg-2)", color: "var(--c-text-3)" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-lg p-2 text-center" style={{ background: "var(--c-bg-2)" }}>
                <div className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Total Tasks</div>
                <div className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>{selected.stats?.totalTasks ?? 0}</div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "var(--c-bg-2)" }}>
                <div className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Success Rate</div>
                <div className="text-lg font-bold" style={{ color: "#4ade80" }}>{(selected.stats?.successRate ?? 0).toFixed(1)}%</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(mib007Link(`agents/${selected.name}`), "_blank")}
                className="flex-1 py-2 rounded-lg text-[12px] font-semibold text-center"
                style={{ background: "var(--c-accent, #6366f1)", color: "#fff" }}
              >
                View in MIB007
              </button>
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg text-[12px]"
                style={{ background: "var(--c-bg-2)", color: "var(--c-text-3)", border: "1px solid var(--c-border-2)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
