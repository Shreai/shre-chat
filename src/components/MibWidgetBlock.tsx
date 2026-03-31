/**
 * Renders mib-widget JSON content blocks inline in shre-chat.
 * Supports: chart, table, todo, metric, link-card, image-gallery, data-grid, iframe, weather.
 * Uses CSS variables from shre-chat theme — no external dependencies.
 */
import React, { useState } from 'react';

interface Block {
  type: string;
  [key: string]: unknown;
}

const PALETTE = [
  '#60a5fa',
  '#4ade80',
  '#f59e0b',
  '#f87171',
  '#a78bfa',
  '#fb923c',
  '#22d3ee',
  '#e879f9',
];

/** Reject javascript:, data:, vbscript: and other dangerous URL protocols */
function isSafeUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return /^https?:\/\//i.test(url);
  }
}

// ── Chart ──────────────────────────────────────────────────────

function BarChart({ block }: { block: Block }) {
  const labels = (block.labels as string[]) ?? [];
  const datasets = (block.datasets as Array<{ data: number[]; label?: string }>) ?? [];
  const values = (datasets[0]?.data ?? []).map((v) =>
    typeof v === 'number' && isFinite(v) ? v : 0,
  );
  const max = Math.max(...values, 1);
  const barW = Math.min(28, Math.floor(260 / Math.max(labels.length, 1)));
  const h = 100;

  return (
    <svg
      width="100%"
      height={h + 20}
      viewBox={`0 0 ${labels.length * (barW + 8) + 16} ${h + 20}`}
      style={{ display: 'block' }}
    >
      {values.map((v, i) => {
        const barH = (v / max) * h;
        const x = 8 + i * (barW + 8);
        return (
          <g key={i}>
            <rect
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              rx={3}
              fill={PALETTE[i % PALETTE.length]}
              opacity={0.85}
            >
              <title>
                {labels[i]}: {values[i]}
              </title>
            </rect>
            <text
              x={x + barW / 2}
              y={h + 14}
              fill="var(--c-text-4)"
              fontSize={9}
              textAnchor="middle"
            >
              {(labels[i] ?? '').slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ block }: { block: Block }) {
  const labels = (block.labels as string[]) ?? [];
  const datasets = (block.datasets as Array<{ data: number[] }>) ?? [];
  const values = (datasets[0]?.data ?? []).map((v) =>
    typeof v === 'number' && isFinite(v) ? v : 0,
  );
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 280,
    h = 100;
  const points = values.map((v, i) => ({
    x: 8 + (i / Math.max(values.length - 1, 1)) * (w - 16),
    y: h - (v / max) * (h - 16) - 8,
  }));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={PALETTE[0]} strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={PALETTE[0]}>
          <title>
            {labels[i]}: {values[i]}
          </title>
        </circle>
      ))}
    </svg>
  );
}

function PieChart({ block }: { block: Block }) {
  const labels = (block.labels as string[]) ?? [];
  const datasets = (block.datasets as Array<{ data: number[] }>) ?? [];
  const rawValues = (datasets[0]?.data ?? []).map((v) =>
    typeof v === 'number' && isFinite(v) ? Math.max(v, 0) : 0,
  );
  const entries = rawValues.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
  if (entries.length === 0)
    return <div style={{ fontSize: 12, color: 'var(--c-text-4)', padding: 8 }}>No data</div>;
  const total = entries.reduce((s, { v }) => s + v, 0) || 1;
  const cx = 60,
    cy = 60,
    r = 50;
  let angle = 0;

  return (
    <svg
      width={120}
      height={120}
      viewBox="0 0 120 120"
      style={{ display: 'block', margin: '0 auto' }}
    >
      {entries.map(({ v, i: origIdx }, sliceIdx) => {
        const start = angle;
        const sweep = (v / total) * 360;
        angle += sweep;
        const rad1 = ((start - 90) * Math.PI) / 180;
        const rad2 = ((start + sweep - 90) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(rad1),
          y1 = cy + r * Math.sin(rad1);
        const x2 = cx + r * Math.cos(rad2),
          y2 = cy + r * Math.sin(rad2);
        const large = sweep > 180 ? 1 : 0;
        const pathD =
          sweep >= 359.9
            ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`
            : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        return (
          <path key={sliceIdx} d={pathD} fill={PALETTE[sliceIdx % PALETTE.length]} opacity={0.85}>
            <title>
              {labels[origIdx]}: {v} ({((v / total) * 100).toFixed(1)}%)
            </title>
          </path>
        );
      })}
    </svg>
  );
}

function ChartWidget({ block }: { block: Block }) {
  const t = (block.chartType as string) ?? 'bar';
  if (t === 'pie') return <PieChart block={block} />;
  if (t === 'line' || t === 'area') return <LineChart block={block} />;
  return <BarChart block={block} />;
}

// ── Table ──────────────────────────────────────────────────────

function TableWidget({ block }: { block: Block }) {
  const headers = (block.headers as string[]) ?? [];
  const rows = (block.rows as string[][]) ?? [];
  const visible = rows.slice(0, 20);
  return (
    <div style={{ overflowX: 'auto', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '5px 8px',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--c-border-2)',
                  whiteSpace: 'nowrap',
                  color: 'var(--c-text-4)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i}>
              {headers.map((_, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid var(--c-border-1)',
                    whiteSpace: 'nowrap',
                    color: 'var(--c-text-2)',
                  }}
                >
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <div
          style={{
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--c-text-4)',
            fontStyle: 'italic',
          }}
        >
          +{rows.length - 20} more rows
        </div>
      )}
    </div>
  );
}

// ── Todo ───────────────────────────────────────────────────────

function TodoWidget({ block }: { block: Block }) {
  const editable = block.editable !== false;
  const [items, setItems] = useState<Array<{ id: string; text: string; done: boolean }>>(
    (block.items as Array<{ id: string; text: string; done: boolean }>) ?? [],
  );
  const done = items.filter((i) => i.done).length;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--c-text-4)', marginBottom: 4 }}>
        {done}/{items.length} complete
      </div>
      {items.map((item, i) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 0',
            cursor: editable ? 'pointer' : 'default',
          }}
          onClick={() =>
            editable &&
            setItems((prev) => prev.map((it, j) => (j === i ? { ...it, done: !it.done } : it)))
          }
        >
          <span style={{ fontSize: 14 }}>{item.done ? '\u2705' : '\u2B1C'}</span>
          <span
            style={{
              textDecoration: item.done ? 'line-through' : 'none',
              opacity: item.done ? 0.5 : 1,
              fontSize: 13,
              color: 'var(--c-text-2)',
            }}
          >
            {item.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Metric ─────────────────────────────────────────────────────

function MetricWidget({ block }: { block: Block }) {
  const value = block.value as string | number;
  const unit = block.unit as string | undefined;
  const change = block.change as number | undefined;
  const changeLabel = block.changeLabel as string | undefined;
  const up = (change ?? 0) >= 0;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text-1)' }}>
        {value}
        {unit && (
          <span style={{ fontSize: 14, color: 'var(--c-text-4)', marginLeft: 2 }}>{unit}</span>
        )}
      </span>
      {change !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 600, color: up ? '#4ade80' : '#f87171' }}>
          {up ? '\u25B2' : '\u25BC'} {Math.abs(change)}%
          {changeLabel && <span style={{ opacity: 0.6, marginLeft: 4 }}>{changeLabel}</span>}
        </span>
      )}
    </div>
  );
}

// ── Link Card ──────────────────────────────────────────────────

function LinkCardWidget({ block }: { block: Block }) {
  const url = block.url as string;
  const title = block.title as string;
  const description = block.description as string | undefined;
  const image = block.image as string | undefined;
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  return (
    <a
      href={isSafeUrl(url) ? url : '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        gap: 10,
        padding: 8,
        borderRadius: 8,
        border: '1px solid var(--c-border-2)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {image && isSafeUrl(image) && (
        <img
          src={image}
          alt=""
          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--c-text-1)' }}>
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--c-text-4)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {description}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--c-text-5)', marginTop: 2 }}>{hostname}</div>
      </div>
    </a>
  );
}

// ── Image Gallery ──────────────────────────────────────────────

function ImageGalleryWidget({ block }: { block: Block }) {
  const images = (block.images as Array<{ src: string; alt?: string; caption?: string }>) ?? [];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, 1fr)`,
        gap: 4,
      }}
    >
      {images.slice(0, 9).map((img, i) => (
        <img
          key={i}
          src={img.src}
          alt={img.alt ?? ''}
          style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }}
        />
      ))}
    </div>
  );
}

// ── Data Grid ──────────────────────────────────────────────────

function DataGridWidget({ block }: { block: Block }) {
  const columns = (block.columns as Array<{ key: string; label: string }>) ?? [];
  const rows = (block.rows as Record<string, unknown>[]) ?? [];
  const visible = rows.slice(0, 20);
  return (
    <div style={{ overflowX: 'auto', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: 'left',
                  padding: '5px 8px',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--c-border-2)',
                  whiteSpace: 'nowrap',
                  color: 'var(--c-text-4)',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid var(--c-border-1)',
                    whiteSpace: 'nowrap',
                    color: 'var(--c-text-2)',
                  }}
                >
                  {String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Weather ────────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  sunny: '\u2600\uFE0F',
  clear: '\u2600\uFE0F',
  'partly-cloudy': '\u26C5',
  cloudy: '\u2601\uFE0F',
  rain: '\uD83C\uDF27\uFE0F',
  thunderstorm: '\u26C8\uFE0F',
  snow: '\uD83C\uDF28\uFE0F',
  fog: '\uD83C\uDF2B\uFE0F',
  windy: '\uD83D\uDCA8',
};

function WeatherWidget({ block }: { block: Block }) {
  const location = block.location as string;
  const current = block.current as { temp: number; condition: string } | undefined;
  const forecast =
    (block.forecast as Array<{ day: string; high: number; low: number; condition: string }>) ?? [];

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)', marginBottom: 4 }}>
        {location}
      </div>
      {current && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--c-text-1)' }}>
            {current.temp}°
          </span>
          <span style={{ fontSize: 20 }}>
            {WEATHER_ICONS[current.condition.toLowerCase()] ?? '\u2600\uFE0F'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--c-text-4)', textTransform: 'capitalize' }}>
            {current.condition}
          </span>
        </div>
      )}
      {forecast.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {forecast.slice(0, 7).map((day, i) => (
            <div
              key={i}
              style={{
                textAlign: 'center',
                padding: '4px 6px',
                borderRadius: 6,
                background: 'var(--c-bg-3)',
                fontSize: 10,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--c-text-3)' }}>{day.day}</div>
              <div style={{ fontSize: 16 }}>
                {WEATHER_ICONS[day.condition.toLowerCase()] ?? '\u2600\uFE0F'}
              </div>
              <div style={{ color: 'var(--c-text-2)' }}>{day.high}°</div>
              <div style={{ color: 'var(--c-text-4)' }}>{day.low}°</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Renderer ──────────────────────────────────────────────

export default function MibWidgetBlock({ block }: { block: Block }) {
  const title = block.title as string | undefined;

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg-2)',
        overflow: 'hidden',
        marginTop: 4,
        marginBottom: 4,
      }}
    >
      {title && (
        <div
          style={{
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 600,
            borderBottom: '1px solid var(--c-border-1)',
            background: 'rgba(0,0,0,0.15)',
            color: 'var(--c-text-4)',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: 10 }}>
        {block.type === 'chart' && <ChartWidget block={block} />}
        {block.type === 'table' && <TableWidget block={block} />}
        {block.type === 'todo' && <TodoWidget block={block} />}
        {block.type === 'metric' && <MetricWidget block={block} />}
        {block.type === 'link-card' && <LinkCardWidget block={block} />}
        {block.type === 'image-gallery' && <ImageGalleryWidget block={block} />}
        {block.type === 'data-grid' && <DataGridWidget block={block} />}
        {block.type === 'iframe' && isSafeUrl(block.src as string) && (
          <iframe
            src={block.src as string}
            title={title ?? 'Embedded content'}
            style={{
              width: '100%',
              height: (block.height as number) ?? 300,
              border: 'none',
              borderRadius: 6,
            }}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        )}
        {block.type === 'weather' && <WeatherWidget block={block} />}
      </div>
    </div>
  );
}
