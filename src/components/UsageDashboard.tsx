/**
 * UsageDashboard — customer-facing usage analytics.
 * Fetches from shre-meter via /api/usage-summary proxy.
 * Renders: total spend, requests, tokens, per-model & per-agent breakdowns, budget status.
 */
import { useState, useEffect } from "react";

interface UsageSummary {
  totalCostUsd: number;
  totalRequests: number;
  totalTokens: number;
  periodFrom: string;
  periodTo: string;
  avgCostPerRequest: number;
  localPercent: number;
  cloudPercent: number;
  topModel: string;
}

interface ModelBreakdown {
  model: string;
  provider: string;
  local: boolean;
  requests: number;
  costUsd: number;
  totalTokens: number;
  pct: number;
}

interface AgentBreakdown {
  agentId: string;
  agentName: string;
  requests: number;
  costUsd: number;
  tokens: number;
  pct: number;
}

interface BudgetStatus {
  limitUsd: number;
  usedUsd: number;
  remainingUsd: number;
  pctUsed: number;
  period: string;
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const BAR_COLORS = [
  "#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#f87171",
  "#a78bfa", "#fb923c", "#38bdf8", "#4ade80", "#e879f9",
];

export function UsageDashboard({ standalone }: { standalone?: boolean } = {}) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [models, setModels] = useState<ModelBreakdown[]>([]);
  const [agents, setAgents] = useState<AgentBreakdown[]>([]);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryRes, modelsRes, agentsRes, budgetRes] = await Promise.allSettled([
          fetch(`/api/usage-summary?days=${days}`).then((r) => r.ok ? r.json() : null),
          fetch(`/api/costs/by-model?days=${days}`).then((r) => r.ok ? r.json() : null),
          fetch(`/api/costs/by-agent?days=${days}`).then((r) => r.ok ? r.json() : null),
          fetch("/api/costs/budget").then((r) => r.ok ? r.json() : null),
        ]);
        if (summaryRes.status === "fulfilled" && summaryRes.value) setSummary(summaryRes.value);
        if (modelsRes.status === "fulfilled" && modelsRes.value && typeof modelsRes.value === "object") {
          const raw = modelsRes.value;
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw.models) ? raw.models : [];
          setModels(arr.filter((m: any) => m && typeof m.model === "string"));
        }
        if (agentsRes.status === "fulfilled" && agentsRes.value && typeof agentsRes.value === "object") {
          const raw = agentsRes.value;
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw.agents) ? raw.agents : [];
          setAgents(arr.filter((a: any) => a && typeof a.agentId === "string"));
        }
        if (budgetRes.status === "fulfilled" && budgetRes.value) setBudget(budgetRes.value);
      } catch {
        // silent — individual sections just won't render
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [days]);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center" style={{ color: "var(--c-text-4)" }}>
        <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={standalone ? "flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6" : "space-y-5"}>
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: "var(--c-text-2)" }}>Usage Breakdown</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{
                background: days === d ? "var(--c-accent)" : "var(--c-bg-3)",
                color: days === d ? "#fff" : "var(--c-text-3)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary row (only in standalone mode — BillingView shows its own) */}
      {standalone && summary && (
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Total Spend" value={fmtUsd(summary.totalCostUsd)} />
          <MiniStat label="Requests" value={fmtNumber(summary.totalRequests)} />
          <MiniStat label="Tokens" value={fmtNumber(summary.totalTokens)} />
        </div>
      )}

      {/* Budget status */}
      {budget && budget.limitUsd > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--c-text-3)" }}>Budget</span>
            <span className="text-xs" style={{ color: budget.pctUsed > 90 ? "#f87171" : budget.pctUsed > 70 ? "#fb923c" : "var(--c-text-4)" }}>
              {fmtUsd(budget.usedUsd)} / {fmtUsd(budget.limitUsd)}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--c-bg-3)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, budget.pctUsed)}%`,
                background: budget.pctUsed > 90 ? "#ef4444" : budget.pctUsed > 70 ? "#f59e0b" : "var(--c-accent)",
              }}
            />
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--c-text-5)" }}>
            {fmtUsd(budget.remainingUsd)} remaining ({budget.period})
          </p>
        </div>
      )}

      {/* Per-model breakdown */}
      {models.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
          <h4 className="text-xs font-medium mb-3" style={{ color: "var(--c-text-3)" }}>By Model</h4>
          <div className="space-y-2.5">
            {models.slice(0, 8).map((m, i) => {
              const maxPct = Math.max(...models.map((x) => x.pct || 0), 1);
              const barWidth = ((m.pct || 0) / maxPct) * 100;
              return (
                <div key={m.model} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                      />
                      <span className="truncate" style={{ color: "var(--c-text-2)" }}>{m.model}</span>
                      {m.local && (
                        <span className="px-1 py-px rounded text-[9px]" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                          local
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0" style={{ color: "var(--c-text-4)" }}>
                      <span>{fmtNumber(m.requests)} req</span>
                      <span className="font-medium" style={{ color: "var(--c-text-2)" }}>{fmtUsd(m.costUsd)}</span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--c-bg-3)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-agent breakdown */}
      {agents.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
          <h4 className="text-xs font-medium mb-3" style={{ color: "var(--c-text-3)" }}>By Agent</h4>
          <div className="space-y-2.5">
            {agents.slice(0, 8).map((a, i) => {
              const maxPct = Math.max(...agents.map((x) => x.pct || 0), 1);
              const barWidth = ((a.pct || 0) / maxPct) * 100;
              return (
                <div key={a.agentId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: BAR_COLORS[(i + 3) % BAR_COLORS.length] }}
                      />
                      <span className="truncate" style={{ color: "var(--c-text-2)" }}>
                        {a.agentName || a.agentId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0" style={{ color: "var(--c-text-4)" }}>
                      <span>{fmtNumber(a.requests)} req</span>
                      <span className="font-medium" style={{ color: "var(--c-text-2)" }}>{fmtUsd(a.costUsd)}</span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--c-bg-3)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth}%`, background: BAR_COLORS[(i + 3) % BAR_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Local vs Cloud split */}
      {summary && (summary.localPercent > 0 || summary.cloudPercent > 0) && (
        <div className="rounded-xl p-4" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
          <h4 className="text-xs font-medium mb-2" style={{ color: "var(--c-text-3)" }}>Local vs Cloud</h4>
          <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "var(--c-bg-3)" }}>
            {summary.localPercent > 0 && (
              <div
                className="h-full"
                style={{ width: `${summary.localPercent}%`, background: "#34d399" }}
                title={`Local: ${summary.localPercent.toFixed(1)}%`}
              />
            )}
            {summary.cloudPercent > 0 && (
              <div
                className="h-full"
                style={{ width: `${summary.cloudPercent}%`, background: "#818cf8" }}
                title={`Cloud: ${summary.cloudPercent.toFixed(1)}%`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px]" style={{ color: "var(--c-text-4)" }}>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: "#34d399" }} />
              Local {summary.localPercent.toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: "#818cf8" }} />
              Cloud {summary.cloudPercent.toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!summary && models.length === 0 && agents.length === 0 && (
        <div className="py-12 text-center" style={{ color: "var(--c-text-4)" }}>
          <p className="text-sm">No usage data available for this period</p>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)" }}>
      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>{label}</p>
      <p className="text-base font-semibold mt-0.5" style={{ color: "var(--c-text-1)" }}>{value}</p>
    </div>
  );
}
