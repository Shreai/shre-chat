import React, { useMemo } from "react";

interface ChartDataset {
  label?: string;
  data: number[];
  color?: string;
}

export interface ChartData {
  type: "bar" | "line" | "pie" | "area";
  title?: string;
  labels: string[];
  datasets: ChartDataset[];
  options?: {
    showLegend?: boolean;
    showValues?: boolean;
    stacked?: boolean;
    currency?: boolean;
  };
}

const PALETTE = ["#60a5fa","#4ade80","#f59e0b","#f87171","#a78bfa","#fb923c","#22d3ee","#e879f9"];
const TEXT_COLOR = "rgba(255,255,255,0.7)";
const GRID_COLOR = "rgba(255,255,255,0.08)";
const FONT = "10px sans-serif";

// --- helpers ---

function niceScale(min: number, max: number, ticks: number) {
  if (min === max) { max = min + 1; }
  const range = max - min;
  const rough = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag >= 5 ? 10 * mag : rough / mag >= 2 ? 5 * mag : rough / mag >= 1 ? 2 * mag : mag;
  const lo = Math.floor(min / nice) * nice;
  const hi = Math.ceil(max / nice) * nice;
  const steps: number[] = [];
  for (let v = lo; v <= hi + nice * 0.01; v += nice) steps.push(parseFloat(v.toPrecision(12)));
  return { min: lo, max: hi, step: nice, steps };
}

function formatValue(v: number, currency?: boolean): string {
  if (currency) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v % 1 === 0 ? v.toString() : v.toFixed(1);
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const diff = endAngle - startAngle;
  if (diff >= 359.999) {
    const m = polarToCartesian(cx, cy, r, 0);
    const b = polarToCartesian(cx, cy, r, 180);
    return `M ${m.x} ${m.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y} A ${r} ${r} 0 1 1 ${m.x} ${m.y} Z`;
  }
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const large = diff > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function dsColor(ds: ChartDataset, i: number) {
  return ds.color || PALETTE[i % PALETTE.length];
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const mx = (prev.x + cur.x) / 2;
    d += ` Q ${prev.x} ${cur.y < prev.y ? prev.y : prev.y}, ${mx} ${(prev.y + cur.y) / 2}`;
    d += ` Q ${cur.x} ${cur.y < prev.y ? cur.y : cur.y}, ${cur.x} ${cur.y}`;
  }
  return d;
}

// --- sub-renderers ---

function BarChart({ data, w, h, pad }: { data: ChartData; w: number; h: number; pad: { t: number; r: number; b: number; l: number } }) {
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const allVals = data.datasets.flatMap((d) => d.data);
  const scale = niceScale(Math.min(0, ...allVals), Math.max(...allVals), 5);
  const n = data.labels.length;
  const dsCount = data.datasets.length;
  const groupW = cw / n;
  const barW = Math.max(4, (groupW * 0.7) / dsCount);
  const yRange = scale.max - scale.min || 1;
  const toY = (v: number) => pad.t + ch - ((v - scale.min) / yRange) * ch;

  return (
    <g>
      {scale.steps.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={toY(v)} y2={toY(v)} stroke={GRID_COLOR} />
          <text x={pad.l - 4} y={toY(v) + 3} fill={TEXT_COLOR} fontSize={10} textAnchor="end">{formatValue(v, data.options?.currency)}</text>
        </g>
      ))}
      {data.labels.map((label, li) => {
        const gx = pad.l + li * groupW + groupW / 2;
        const rot = n > 6;
        return (
          <g key={li}>
            {data.datasets.map((ds, di) => {
              const x = gx - (dsCount * barW) / 2 + di * barW;
              const val = ds.data[li] ?? 0;
              const barH = ((val - scale.min) / yRange) * ch;
              return (
                <g key={di}>
                  <rect x={x} y={toY(val)} width={barW} height={barH} rx={3} fill={dsColor(ds, di)} opacity={0.85} style={{ cursor: "pointer" }}>
                    <title>{ds.label ? `${ds.label}: ` : ""}{formatValue(val, data.options?.currency)}</title>
                  </rect>
                  {data.options?.showValues && (
                    <text x={x + barW / 2} y={toY(val) - 4} fill={TEXT_COLOR} fontSize={9} textAnchor="middle">{formatValue(val, data.options?.currency)}</text>
                  )}
                </g>
              );
            })}
            <text x={gx} y={h - pad.b + 14} fill={TEXT_COLOR} fontSize={10} textAnchor={rot ? "end" : "middle"} transform={rot ? `rotate(-45, ${gx}, ${h - pad.b + 14})` : undefined}>{label}</text>
          </g>
        );
      })}
    </g>
  );
}

function LineAreaChart({ data, w, h, pad, filled }: { data: ChartData; w: number; h: number; pad: { t: number; r: number; b: number; l: number }; filled: boolean }) {
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const allVals = data.datasets.flatMap((d) => d.data);
  const scale = niceScale(Math.min(0, ...allVals), Math.max(...allVals), 5);
  const n = data.labels.length;
  const yRange = scale.max - scale.min || 1;
  const toY = (v: number) => pad.t + ch - ((v - scale.min) / yRange) * ch;
  const toX = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * cw : cw / 2);
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <g>
      {scale.steps.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={toY(v)} y2={toY(v)} stroke={GRID_COLOR} />
          <text x={pad.l - 4} y={toY(v) + 3} fill={TEXT_COLOR} fontSize={10} textAnchor="end">{formatValue(v, data.options?.currency)}</text>
        </g>
      ))}
      {data.labels.map((label, li) => {
        const x = toX(li);
        const rot = n > 6;
        return <text key={li} x={x} y={h - pad.b + 14} fill={TEXT_COLOR} fontSize={10} textAnchor={rot ? "end" : "middle"} transform={rot ? `rotate(-45, ${x}, ${h - pad.b + 14})` : undefined}>{label}</text>;
      })}
      {data.datasets.map((ds, di) => {
        const color = dsColor(ds, di);
        const points = ds.data.map((v, i) => ({ x: toX(i), y: toY(v) }));
        const path = smoothPath(points);
        const gradId = `grad_${uid}_${di}`;
        return (
          <g key={di}>
            {filled && (
              <>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <path d={`${path} L ${points[points.length - 1].x} ${toY(scale.min)} L ${points[0].x} ${toY(scale.min)} Z`} fill={`url(#${gradId})`} />
              </>
            )}
            <path d={path} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p, pi) => (
              <circle key={pi} cx={p.x} cy={p.y} r={3} fill={color}>
                <title>{ds.label ? `${ds.label}: ` : ""}{formatValue(ds.data[pi], data.options?.currency)}</title>
              </circle>
            ))}
            {data.options?.showValues && points.map((p, pi) => (
              <text key={pi} x={p.x} y={p.y - 8} fill={TEXT_COLOR} fontSize={9} textAnchor="middle">{formatValue(ds.data[pi], data.options?.currency)}</text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function PieChart({ data, w, h, pad }: { data: ChartData; w: number; h: number; pad: { t: number; r: number; b: number; l: number } }) {
  const cx = (w - pad.l - pad.r) / 2 + pad.l;
  const cy = (h - pad.t - pad.b) / 2 + pad.t;
  const r = Math.min(w - pad.l - pad.r, h - pad.t - pad.b) / 2 - 10;
  const rawValues = data.datasets[0]?.data ?? [];
  // Keep original indices so labels stay aligned
  const entries = rawValues.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
  if (entries.length === 0) {
    return <text x={cx} y={cy} fill={TEXT_COLOR} fontSize={11} textAnchor="middle">No data</text>;
  }
  const total = entries.reduce((s, { v }) => s + v, 0) || 1;
  let angle = 0;

  return (
    <g>
      {entries.map(({ v, i: origIdx }, sliceIdx) => {
        const start = angle;
        const sweep = (v / total) * 360;
        angle += sweep;
        const color = data.datasets[0]?.color ? undefined : PALETTE[sliceIdx % PALETTE.length];
        const mid = polarToCartesian(cx, cy, r * 0.65, start + sweep / 2);
        const labelPt = polarToCartesian(cx, cy, r + 14, start + sweep / 2);
        const pct = ((v / total) * 100).toFixed(1) + "%";
        return (
          <g key={origIdx}>
            <path d={describeArc(cx, cy, r, start, start + sweep - 0.3)} fill={color || dsColor(data.datasets[0], sliceIdx)} opacity={0.85}>
              <title>{data.labels[origIdx]}: {formatValue(v, data.options?.currency)} ({pct})</title>
            </path>
            {sweep > 18 && <text x={mid.x} y={mid.y + 3} fill="rgba(255,255,255,0.9)" fontSize={10} textAnchor="middle" fontWeight="bold">{pct}</text>}
            {sweep > 12 && <text x={labelPt.x} y={labelPt.y + 3} fill={TEXT_COLOR} fontSize={9} textAnchor={labelPt.x > cx ? "start" : "end"}>{data.labels[origIdx]}</text>}
          </g>
        );
      })}
    </g>
  );
}

// --- main component ---

export default function ChartRenderer({ data, width, height }: { data: ChartData; width?: number | string; height?: number }) {
  const h = height || 200;
  const numW = typeof width === "number" ? width : 400;
  const showLegend = data.options?.showLegend || data.datasets.length > 1;
  const legendH = showLegend ? 24 : 0;
  const totalH = h + legendH + (data.title ? 20 : 0);
  const titleOffset = data.title ? 20 : 0;
  const pad = data.type === "pie"
    ? { t: 10 + titleOffset, r: 10, b: 10 + legendH, l: 10 }
    : { t: 10 + titleOffset, r: 14, b: (data.labels.length > 6 ? 40 : 22) + legendH, l: 44 };

  return (
    <svg
      width={width || "100%"}
      height={totalH}
      viewBox={`0 0 ${numW} ${totalH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ opacity: 1, animation: "chartFadeIn 0.4s ease-in", fontFamily: "sans-serif" }}
    >
      <style>{`@keyframes chartFadeIn { from { opacity: 0 } to { opacity: 1 } } svg rect:hover, svg path:hover { filter: brightness(1.2); }`}</style>

      {data.title && (
        <text x={numW / 2} y={16} fill={TEXT_COLOR} fontSize={12} textAnchor="middle" fontWeight="600">{data.title}</text>
      )}

      {data.type === "bar" && <BarChart data={data} w={numW} h={h + titleOffset} pad={pad} />}
      {data.type === "line" && <LineAreaChart data={data} w={numW} h={h + titleOffset} pad={pad} filled={false} />}
      {data.type === "area" && <LineAreaChart data={data} w={numW} h={h + titleOffset} pad={pad} filled />}
      {data.type === "pie" && <PieChart data={data} w={numW} h={h + titleOffset} pad={pad} />}

      {showLegend && (
        <g transform={`translate(${numW / 2}, ${totalH - 10})`}>
          {data.datasets.length > 1
            ? data.datasets.map((ds, i) => {
                const offset = (i - (data.datasets.length - 1) / 2) * 90;
                return (
                  <g key={i} transform={`translate(${offset}, 0)`}>
                    <circle cx={-8} cy={-3} r={4} fill={dsColor(ds, i)} />
                    <text x={0} y={0} fill={TEXT_COLOR} fontSize={10}>{ds.label || `Series ${i + 1}`}</text>
                  </g>
                );
              })
            : data.type === "pie" && data.labels.slice(0, 12).map((label, i) => {
                const cols = Math.min(data.labels.length, 4);
                const col = i % cols;
                const row = Math.floor(i / cols);
                const offset = (col - (cols - 1) / 2) * 90;
                return (
                  <g key={i} transform={`translate(${offset}, ${row * 14})`}>
                    <circle cx={-8} cy={-3} r={4} fill={PALETTE[i % PALETTE.length]} />
                    <text x={0} y={0} fill={TEXT_COLOR} fontSize={10}>{label}</text>
                  </g>
                );
              })}
        </g>
      )}
    </svg>
  );
}
