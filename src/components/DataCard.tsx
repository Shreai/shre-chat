import React, { useState, useMemo, lazy, Suspense } from 'react';

const ChartRenderer = lazy(() => import('./ChartRenderer'));

// ── Types ───────────────────────────────────────────────────────────
interface KPI {
  label: string;
  value: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'neutral';
}
interface Comparison {
  labelA: string;
  valueA: string;
  labelB: string;
  valueB: string;
  winner?: 'a' | 'b' | null;
}
interface TrendItem {
  direction: 'up' | 'down';
  amount: string;
  context: string;
}
interface ParsedData {
  kpis: KPI[];
  comparisons: Comparison[];
  trends: TrendItem[];
  hasMarkdownTable: boolean;
}

interface RapidRmsContract {
  ok?: boolean;
  summary?: string;
  metadata?: {
    source?: string;
    endpoint?: string;
    method?: string;
    store?: string;
    generatedAt?: string;
    parsedAs?: string;
    recordCount?: number;
    contentType?: string;
    columns?: string[];
  };
  table?: {
    columns?: string[];
    rows?: string[][];
    rowCount?: number;
  };
  chart?: {
    type?: 'bar' | 'line' | 'pie';
    title?: string;
    labels?: string[];
    values?: number[];
  };
  raw?: {
    preview?: string;
    truncated?: boolean;
  };
}

// ── Detection regexes ───────────────────────────────────────────────
// KPI: named groups for label + value. Supports -$1,234  $1.2M  $3.4B  85%  1,234 units
const KPI_RE =
  /(?<label>total|revenue|sales|profit|margin|count|orders?|average|avg|gross|net|cost|budget|spend|income|earnings|growth|rate|volume|units?)[\s:]+(?<value>-?\$?[\d,]+(?:\.\d{1,2})?[MBKmb%]?)\s*(?:\((?<delta>[+-]?\d+(?:\.\d+)?%?)\))?/gi;
const COMP_RE =
  /(\$?[\d,]+(?:\.\d{1,2})?)\s+(?:vs\.?|compared to|versus)\s+(\$?[\d,]+(?:\.\d{1,2})?)/gi;
const TREND_RE =
  /(?:(?:up|increased|grew|risen|rose|gained)\s+(?:by\s+)?(\d+(?:\.\d+)?%?))|(?:(?:down|decreased|declined|dropped|fell|lost)\s+(?:by\s+)?(\d+(?:\.\d+)?%?))/gi;
const MD_TABLE_RE = /^\|.+\|$/m;

// ── Helpers ─────────────────────────────────────────────────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtVal(v: string): string {
  if (/[MBKmbk%]$/.test(v))
    return v.startsWith('$') || v.startsWith('-$') || v.includes('%') ? v : '$' + v;
  const n = parseFloat(v.replace(/[$,]/g, ''));
  if (isNaN(n)) return v;
  const has$ = v.includes('$');
  const neg = v.startsWith('-') ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000 && has$)
    return (
      neg + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: v.includes('.') ? 2 : 0 })
    );
  return has$ ? neg + '$' + abs : v;
}

function extractLabel(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length
    ? w
        .slice(-2)
        .join(' ')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
    : '';
}

/** Grid columns: 1=full, 2=two, 3+=three */
const gridCols = (n: number) => (n <= 1 ? '1fr' : n === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)');

function parseRapidRmsContract(text: string): RapidRmsContract | null {
  const candidates = [text];
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.unshift(fenceMatch[1]);

  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(text.slice(braceStart, braceEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as RapidRmsContract;
      if (parsed?.metadata?.source === 'RapidRMS') return parsed;
    } catch {
      // keep trying other shapes
    }
  }

  return null;
}

function isNumericCell(value: string): boolean {
  return value !== '' && !Number.isNaN(Number(value));
}

// ── Parser ──────────────────────────────────────────────────────────
function parse(text: string): ParsedData {
  try {
    const kpis: KPI[] = [],
      comps: Comparison[] = [],
      trends: TrendItem[] = [],
      seen = new Set<string>();
    let m: RegExpExecArray | null;
    const kR = new RegExp(KPI_RE.source, KPI_RE.flags);
    while ((m = kR.exec(text)) !== null) {
      const label = m.groups?.label ?? '',
        value = m.groups?.value ?? '',
        delta = m.groups?.delta || undefined;
      if (!label || !value) continue;
      const key = `${label.toLowerCase()}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const deltaDir: KPI['deltaDir'] = delta
        ? delta.startsWith('-')
          ? 'down'
          : delta.startsWith('+')
            ? 'up'
            : 'neutral'
        : undefined;
      kpis.push({ label: cap(label), value: fmtVal(value), delta, deltaDir });
    }
    const cR = new RegExp(COMP_RE.source, COMP_RE.flags);
    while ((m = cR.exec(text)) !== null) {
      const [, vA, vB] = m;
      const nA = parseFloat(vA.replace(/[$,]/g, '')),
        nB = parseFloat(vB.replace(/[$,]/g, ''));
      const winner = nA > nB ? ('a' as const) : nB > nA ? ('b' as const) : null;
      const labelA = extractLabel(text.slice(Math.max(0, m.index - 60), m.index)) || 'Current';
      comps.push({ labelA, valueA: vA, labelB: 'Previous', valueB: vB, winner });
    }
    const tR = new RegExp(TREND_RE.source, TREND_RE.flags);
    while ((m = tR.exec(text)) !== null) {
      const dir = m[1] ? ('up' as const) : ('down' as const);
      const amount = m[1] || m[2];
      const ctx =
        text
          .slice(Math.max(0, m.index - 30), m.index)
          .trim()
          .split(/[.!?\n]/)
          .pop()
          ?.trim() || '';
      trends.push({ direction: dir, amount, context: ctx });
    }
    // Cap KPIs at 6, comparisons at 3 to prevent visual overload in card layout
    return {
      kpis: kpis.slice(0, 6),
      comparisons: comps.slice(0, 3),
      trends: trends.slice(0, 4),
      hasMarkdownTable: MD_TABLE_RE.test(text),
    };
  } catch (err) {
    console.warn('[DataCard] parse failed:', err);
    return { kpis: [], comparisons: [], trends: [], hasMarkdownTable: false };
  }
}

// ── Shared styles ───────────────────────────────────────────────────
const mono = "'SF Mono', 'Cascadia Code', 'Fira Code', monospace";
const cardBg: React.CSSProperties = {
  background: 'var(--c-bg-card, rgba(255,255,255,0.04))',
  border: '1px solid var(--c-border-2, #2a2a3d)',
  borderRadius: 10,
  padding: '10px 14px',
};
const emerald = 'var(--c-emerald, #34d399)',
  danger = 'var(--c-danger-soft, #f87171)',
  muted = 'var(--c-text-4, #888)';
const ArrowSvg = ({ up }: { up: boolean }) => (
  <svg
    aria-hidden="true"
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d={up ? 'M2 7L5 3L8 7' : 'M2 3L5 7L8 3'} />
  </svg>
);

// ── Sub-components ──────────────────────────────────────────────────
function KPICard({ kpi }: { kpi: KPI }) {
  const deltaLabel = kpi.delta
    ? `${kpi.deltaDir === 'up' ? 'increased' : kpi.deltaDir === 'down' ? 'decreased' : 'changed'} by ${kpi.delta}`
    : undefined;
  return (
    <div style={{ ...cardBg, minWidth: 120, flex: '1 1 0' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: muted,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {kpi.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: mono,
            color: 'var(--c-text-1, #eee)',
            lineHeight: 1.2,
          }}
        >
          {kpi.value}
        </span>
        {kpi.delta && (
          <span
            aria-label={deltaLabel}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: kpi.deltaDir === 'up' ? emerald : kpi.deltaDir === 'down' ? danger : muted,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {kpi.deltaDir && kpi.deltaDir !== 'neutral' && <ArrowSvg up={kpi.deltaDir === 'up'} />}
            {kpi.delta}
          </span>
        )}
      </div>
    </div>
  );
}

function CompSide({ label, value, isWinner }: { label: string; value: string; isWinner: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: muted, marginBottom: 2, fontWeight: 500 }}>{label}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: mono,
          color: isWinner ? emerald : 'var(--c-text-1, #eee)',
        }}
      >
        {value}
      </div>
      {isWinner && (
        <div style={{ fontSize: 9, color: emerald, marginTop: 2, fontWeight: 600 }}>HIGHER</div>
      )}
    </div>
  );
}

function ComparisonCard({ comp }: { comp: Comparison }) {
  return (
    <div
      style={{
        ...cardBg,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <CompSide label={comp.labelA} value={comp.valueA} isWinner={comp.winner === 'a'} />
      <div style={{ fontSize: 11, color: 'var(--c-text-5, #666)', fontWeight: 500 }}>vs</div>
      <CompSide label={comp.labelB} value={comp.valueB} isWinner={comp.winner === 'b'} />
    </div>
  );
}

function TrendBadge({ trend }: { trend: TrendItem }) {
  const isUp = trend.direction === 'up';
  const dir = isUp ? 'Up' : 'Down';
  return (
    <span
      aria-label={`Trend ${dir.toLowerCase()} ${trend.amount}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 9999,
        background: isUp ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
        color: isUp ? emerald : danger,
        border: `1px solid ${isUp ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
      }}
    >
      <ArrowSvg up={isUp} />
      {dir} {trend.amount}
      {trend.context && (
        <span style={{ color: muted, fontWeight: 400, marginLeft: 2 }}>
          {trend.context.slice(-20)}
        </span>
      )}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────
interface DataCardProps {
  content?: string | null;
}

export function DataCard({ content }: DataCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rapidrms = useMemo(() => parseRapidRmsContract(content ?? ''), [content]);
  const parsed = useMemo(() => parse(content ?? ''), [content]);
  if (rapidrms) {
    const columns = rapidrms.table?.columns ?? [];
    const rows = rapidrms.table?.rows ?? [];
    const chart =
      rapidrms.chart && rapidrms.chart.labels && rapidrms.chart.values
        ? {
            type: rapidrms.chart.type || 'bar',
            title: rapidrms.chart.title,
            labels: rapidrms.chart.labels,
            datasets: [{ data: rapidrms.chart.values, label: rapidrms.chart.title || 'Value' }],
            options: { showValues: true, currency: false },
          }
        : null;

    return (
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            ...cardBg,
            padding: 0,
            overflow: 'hidden',
            borderColor: 'rgba(34,211,238,0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(59,130,246,0.04))',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(96,165,250,0.95)' }}>
                RAPIDRMS
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-1, #eee)' }}>
                {rapidrms.summary || 'RapidRMS response'}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--c-text-4, #888)' }}>
              <div>{rapidrms.metadata?.endpoint}</div>
              <div>
                {rapidrms.metadata?.method}
                {rapidrms.metadata?.store ? ` · ${rapidrms.metadata.store}` : ''}
              </div>
            </div>
          </div>

          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 8,
              }}
            >
              {[
                ['Source', rapidrms.metadata?.source || 'RapidRMS'],
                ['Records', String(rapidrms.metadata?.recordCount ?? rows.length ?? 0)],
                ['Format', rapidrms.metadata?.contentType || 'json'],
                ['Parsed', rapidrms.metadata?.parsedAs || 'json'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--c-text-4, #888)' }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-1, #eee)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {columns.length > 0 && rows.length > 0 && (
              <div
                style={{
                  overflowX: 'auto',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                    minWidth: Math.max(columns.length * 120, 360),
                  }}
                >
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column}
                          style={{
                            textAlign: 'left',
                            padding: '8px 10px',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--c-text-2)',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        style={{
                          background:
                            rowIndex % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        }}
                      >
                        {columns.map((column, colIndex) => (
                          <td
                            key={column}
                            style={{
                              padding: '8px 10px',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              color: 'var(--c-text-2)',
                              textAlign: isNumericCell(row[colIndex] ?? '') ? 'right' : 'left',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {row[colIndex] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {chart && (
              <div style={{ borderRadius: 8, overflow: 'hidden' }}>
                <Suspense
                  fallback={
                    <div style={{ padding: 12, color: 'var(--c-text-4)', fontSize: 12 }}>
                      Loading chart...
                    </div>
                  }
                >
                  <ChartRenderer data={chart} height={220} />
                </Suspense>
              </div>
            )}

            {rapidrms.raw?.preview && (
              <details>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'var(--c-text-4, #888)',
                    marginBottom: 6,
                  }}
                >
                  Raw preview
                </summary>
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.2)',
                    color: 'var(--c-text-3)',
                    fontSize: 11,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 220,
                    overflow: 'auto',
                  }}
                >
                  {rapidrms.raw.preview}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }

  const hasData =
    parsed.kpis.length > 0 || parsed.comparisons.length > 0 || parsed.trends.length > 0;
  if (!hasData) return null; // Empty content → render nothing, not an empty card

  const toggle = () => setCollapsed((p) => !p);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  if (collapsed) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label="Show data cards"
        onClick={toggle}
        onKeyDown={onKey}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          color: muted,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 0',
          marginBottom: 4,
        }}
      >
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 2L7 5L3 8" />
        </svg>
        Show data cards
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={true}
          aria-label="Collapse data cards"
          onClick={toggle}
          onKeyDown={onKey}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            color: 'var(--c-text-5, #666)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '1px 4px',
            borderRadius: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--c-text-3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--c-text-5)';
          }}
        >
          Show raw
          <svg
            aria-hidden="true"
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 3L4 6L7 3" />
          </svg>
        </div>
      </div>
      {parsed.kpis.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols(parsed.kpis.length),
            gap: 8,
            marginBottom: parsed.comparisons.length > 0 || parsed.trends.length > 0 ? 8 : 0,
          }}
        >
          {parsed.kpis.map((kpi, i) => (
            <KPICard key={`kpi-${i}`} kpi={kpi} />
          ))}
        </div>
      )}
      {parsed.comparisons.map((c, i) => (
        <div key={`comp-${i}`} style={{ marginBottom: parsed.trends.length > 0 ? 8 : 0 }}>
          <ComparisonCard comp={c} />
        </div>
      ))}
      {parsed.trends.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {parsed.trends.map((t, i) => (
            <TrendBadge key={`trend-${i}`} trend={t} />
          ))}
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
