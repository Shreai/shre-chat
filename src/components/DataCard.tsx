import React, { useState, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────────
interface KPI { label: string; value: string; delta?: string; deltaDir?: "up" | "down" | "neutral"; }
interface Comparison { labelA: string; valueA: string; labelB: string; valueB: string; winner?: "a" | "b" | null; }
interface TrendItem { direction: "up" | "down"; amount: string; context: string; }
interface ParsedData { kpis: KPI[]; comparisons: Comparison[]; trends: TrendItem[]; hasMarkdownTable: boolean; }

// ── Detection regexes ───────────────────────────────────────────────
// KPI: named groups for label + value. Supports -$1,234  $1.2M  $3.4B  85%  1,234 units
const KPI_RE = /(?<label>total|revenue|sales|profit|margin|count|orders?|average|avg|gross|net|cost|budget|spend|income|earnings|growth|rate|volume|units?)[\s:]+(?<value>-?\$?[\d,]+(?:\.\d{1,2})?[MBKmb%]?)\s*(?:\((?<delta>[+-]?\d+(?:\.\d+)?%?)\))?/gi;
const COMP_RE = /(\$?[\d,]+(?:\.\d{1,2})?)\s+(?:vs\.?|compared to|versus)\s+(\$?[\d,]+(?:\.\d{1,2})?)/gi;
const TREND_RE = /(?:(?:up|increased|grew|risen|rose|gained)\s+(?:by\s+)?(\d+(?:\.\d+)?%?))|(?:(?:down|decreased|declined|dropped|fell|lost)\s+(?:by\s+)?(\d+(?:\.\d+)?%?))/gi;
const MD_TABLE_RE = /^\|.+\|$/m;

// ── Helpers ─────────────────────────────────────────────────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtVal(v: string): string {
  if (/[MBKmbk%]$/.test(v)) return v.startsWith("$") || v.startsWith("-$") || v.includes("%") ? v : "$" + v;
  const n = parseFloat(v.replace(/[$,]/g, ""));
  if (isNaN(n)) return v;
  const has$ = v.includes("$");
  const neg = v.startsWith("-") ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000 && has$) return neg + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: v.includes(".") ? 2 : 0 });
  return has$ ? neg + "$" + abs : v;
}

function extractLabel(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length ? w.slice(-2).join(" ").replace(/[^a-zA-Z0-9\s]/g, "").trim() : "";
}

/** Grid columns: 1=full, 2=two, 3+=three */
const gridCols = (n: number) => n <= 1 ? "1fr" : n === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)";

// ── Parser ──────────────────────────────────────────────────────────
function parse(text: string): ParsedData {
  try {
    const kpis: KPI[] = [], comps: Comparison[] = [], trends: TrendItem[] = [], seen = new Set<string>();
    let m: RegExpExecArray | null;
    const kR = new RegExp(KPI_RE.source, KPI_RE.flags);
    while ((m = kR.exec(text)) !== null) {
      const label = m.groups?.label ?? "", value = m.groups?.value ?? "", delta = m.groups?.delta || undefined;
      if (!label || !value) continue;
      const key = `${label.toLowerCase()}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const deltaDir: KPI["deltaDir"] = delta ? (delta.startsWith("-") ? "down" : delta.startsWith("+") ? "up" : "neutral") : undefined;
      kpis.push({ label: cap(label), value: fmtVal(value), delta, deltaDir });
    }
    const cR = new RegExp(COMP_RE.source, COMP_RE.flags);
    while ((m = cR.exec(text)) !== null) {
      const [, vA, vB] = m;
      const nA = parseFloat(vA.replace(/[$,]/g, "")), nB = parseFloat(vB.replace(/[$,]/g, ""));
      const winner = nA > nB ? "a" as const : nB > nA ? "b" as const : null;
      const labelA = extractLabel(text.slice(Math.max(0, m.index - 60), m.index)) || "Current";
      comps.push({ labelA, valueA: vA, labelB: "Previous", valueB: vB, winner });
    }
    const tR = new RegExp(TREND_RE.source, TREND_RE.flags);
    while ((m = tR.exec(text)) !== null) {
      const dir = m[1] ? "up" as const : "down" as const;
      const amount = m[1] || m[2];
      const ctx = text.slice(Math.max(0, m.index - 30), m.index).trim().split(/[.!?\n]/).pop()?.trim() || "";
      trends.push({ direction: dir, amount, context: ctx });
    }
    // Cap KPIs at 6, comparisons at 3 to prevent visual overload in card layout
    return { kpis: kpis.slice(0, 6), comparisons: comps.slice(0, 3), trends: trends.slice(0, 4), hasMarkdownTable: MD_TABLE_RE.test(text) };
  } catch (err) {
    console.warn("[DataCard] parse failed:", err);
    return { kpis: [], comparisons: [], trends: [], hasMarkdownTable: false };
  }
}

// ── Shared styles ───────────────────────────────────────────────────
const mono = "'SF Mono', 'Cascadia Code', 'Fira Code', monospace";
const cardBg: React.CSSProperties = { background: "var(--c-bg-card, rgba(255,255,255,0.04))", border: "1px solid var(--c-border-2, #2a2a3d)", borderRadius: 10, padding: "10px 14px" };
const emerald = "var(--c-emerald, #34d399)", danger = "var(--c-danger-soft, #f87171)", muted = "var(--c-text-4, #888)";
const ArrowSvg = ({ up }: { up: boolean }) => (
  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={up ? "M2 7L5 3L8 7" : "M2 3L5 7L8 3"} /></svg>
);

// ── Sub-components ──────────────────────────────────────────────────
function KPICard({ kpi }: { kpi: KPI }) {
  const deltaLabel = kpi.delta ? `${kpi.deltaDir === "up" ? "increased" : kpi.deltaDir === "down" ? "decreased" : "changed"} by ${kpi.delta}` : undefined;
  return (
    <div style={{ ...cardBg, minWidth: 120, flex: "1 1 0" }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{kpi.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: "var(--c-text-1, #eee)", lineHeight: 1.2 }}>{kpi.value}</span>
        {kpi.delta && (
          <span aria-label={deltaLabel} style={{ fontSize: 11, fontWeight: 600, color: kpi.deltaDir === "up" ? emerald : kpi.deltaDir === "down" ? danger : muted, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {kpi.deltaDir && kpi.deltaDir !== "neutral" && <ArrowSvg up={kpi.deltaDir === "up"} />}
            {kpi.delta}
          </span>
        )}
      </div>
    </div>
  );
}

function CompSide({ label, value, isWinner }: { label: string; value: string; isWinner: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: muted, marginBottom: 2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: isWinner ? emerald : "var(--c-text-1, #eee)" }}>{value}</div>
      {isWinner && <div style={{ fontSize: 9, color: emerald, marginTop: 2, fontWeight: 600 }}>HIGHER</div>}
    </div>
  );
}

function ComparisonCard({ comp }: { comp: Comparison }) {
  return (
    <div style={{ ...cardBg, display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
      <CompSide label={comp.labelA} value={comp.valueA} isWinner={comp.winner === "a"} />
      <div style={{ fontSize: 11, color: "var(--c-text-5, #666)", fontWeight: 500 }}>vs</div>
      <CompSide label={comp.labelB} value={comp.valueB} isWinner={comp.winner === "b"} />
    </div>
  );
}

function TrendBadge({ trend }: { trend: TrendItem }) {
  const isUp = trend.direction === "up";
  const dir = isUp ? "Up" : "Down";
  return (
    <span aria-label={`Trend ${dir.toLowerCase()} ${trend.amount}`} style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 9999,
      background: isUp ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
      color: isUp ? emerald : danger, border: `1px solid ${isUp ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
    }}>
      <ArrowSvg up={isUp} />{dir} {trend.amount}
      {trend.context && <span style={{ color: muted, fontWeight: 400, marginLeft: 2 }}>{trend.context.slice(-20)}</span>}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────
interface DataCardProps { content?: string | null; }

export function DataCard({ content }: DataCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const parsed = useMemo(() => parse(content ?? ""), [content]);
  const hasData = parsed.kpis.length > 0 || parsed.comparisons.length > 0 || parsed.trends.length > 0;
  if (!hasData) return null; // Empty content → render nothing, not an empty card

  const toggle = () => setCollapsed(p => !p);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };

  if (collapsed) {
    return (
      <div role="button" tabIndex={0} aria-expanded={false} aria-label="Show data cards" onClick={toggle} onKeyDown={onKey}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: muted, background: "none", border: "none", cursor: "pointer", padding: "2px 0", marginBottom: 4 }}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2L7 5L3 8" /></svg>
        Show data cards
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <div role="button" tabIndex={0} aria-expanded={true} aria-label="Collapse data cards" onClick={toggle} onKeyDown={onKey}
          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--c-text-5, #666)", background: "none", border: "none", cursor: "pointer", padding: "1px 4px", borderRadius: 4, transition: "color 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--c-text-3)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--c-text-5)"; }}>
          Show raw
          <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 3L4 6L7 3" /></svg>
        </div>
      </div>
      {parsed.kpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: gridCols(parsed.kpis.length), gap: 8, marginBottom: parsed.comparisons.length > 0 || parsed.trends.length > 0 ? 8 : 0 }}>
          {parsed.kpis.map((kpi, i) => <KPICard key={`kpi-${i}`} kpi={kpi} />)}
        </div>
      )}
      {parsed.comparisons.map((c, i) => (
        <div key={`comp-${i}`} style={{ marginBottom: parsed.trends.length > 0 ? 8 : 0 }}><ComparisonCard comp={c} /></div>
      ))}
      {parsed.trends.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {parsed.trends.map((t, i) => <TrendBadge key={`trend-${i}`} trend={t} />)}
        </div>
      )}
    </div>
  );
}

/** Check if content has data patterns without rendering */
export function hasDataPatterns(content: string): boolean {
  // Reset lastIndex — these are global regexes, .test() advances it
  KPI_RE.lastIndex = COMP_RE.lastIndex = TREND_RE.lastIndex = 0;
  const r = KPI_RE.test(content) || COMP_RE.test(content) || TREND_RE.test(content);
  KPI_RE.lastIndex = COMP_RE.lastIndex = TREND_RE.lastIndex = 0;
  return r;
}

export default DataCard;
