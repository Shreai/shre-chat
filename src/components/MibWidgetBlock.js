import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Renders mib-widget JSON content blocks inline in shre-chat.
 * Supports: chart, table, todo, metric, link-card, image-gallery, data-grid, iframe, weather.
 * Uses CSS variables from shre-chat theme — no external dependencies.
 */
import { useState } from 'react';
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
function isSafeUrl(url) {
    if (typeof url !== 'string' || !url)
        return false;
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    }
    catch {
        return /^https?:\/\//i.test(url);
    }
}
// ── Chart ──────────────────────────────────────────────────────
function BarChart({ block }) {
    const labels = block.labels ?? [];
    const datasets = block.datasets ?? [];
    const values = (datasets[0]?.data ?? []).map((v) => typeof v === 'number' && isFinite(v) ? v : 0);
    const max = Math.max(...values, 1);
    const barW = Math.min(28, Math.floor(260 / Math.max(labels.length, 1)));
    const h = 100;
    return (_jsx("svg", { width: "100%", height: h + 20, viewBox: `0 0 ${labels.length * (barW + 8) + 16} ${h + 20}`, style: { display: 'block' }, children: values.map((v, i) => {
            const barH = (v / max) * h;
            const x = 8 + i * (barW + 8);
            return (_jsxs("g", { children: [_jsx("rect", { x: x, y: h - barH, width: barW, height: barH, rx: 3, fill: PALETTE[i % PALETTE.length], opacity: 0.85, children: _jsxs("title", { children: [labels[i], ": ", values[i]] }) }), _jsx("text", { x: x + barW / 2, y: h + 14, fill: "var(--c-text-4)", fontSize: 9, textAnchor: "middle", children: (labels[i] ?? '').slice(0, 6) })] }, i));
        }) }));
}
function LineChart({ block }) {
    const labels = block.labels ?? [];
    const datasets = block.datasets ?? [];
    const values = (datasets[0]?.data ?? []).map((v) => typeof v === 'number' && isFinite(v) ? v : 0);
    if (values.length === 0)
        return null;
    const max = Math.max(...values, 1);
    const w = 280, h = 100;
    const points = values.map((v, i) => ({
        x: 8 + (i / Math.max(values.length - 1, 1)) * (w - 16),
        y: h - (v / max) * (h - 16) - 8,
    }));
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return (_jsxs("svg", { width: "100%", height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' }, children: [_jsx("path", { d: d, fill: "none", stroke: PALETTE[0], strokeWidth: 2 }), points.map((p, i) => (_jsx("circle", { cx: p.x, cy: p.y, r: 3, fill: PALETTE[0], children: _jsxs("title", { children: [labels[i], ": ", values[i]] }) }, i)))] }));
}
function PieChart({ block }) {
    const labels = block.labels ?? [];
    const datasets = block.datasets ?? [];
    const rawValues = (datasets[0]?.data ?? []).map((v) => typeof v === 'number' && isFinite(v) ? Math.max(v, 0) : 0);
    const entries = rawValues.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
    if (entries.length === 0)
        return _jsx("div", { style: { fontSize: 12, color: 'var(--c-text-4)', padding: 8 }, children: "No data" });
    const total = entries.reduce((s, { v }) => s + v, 0) || 1;
    const cx = 60, cy = 60, r = 50;
    let angle = 0;
    return (_jsx("svg", { width: 120, height: 120, viewBox: "0 0 120 120", style: { display: 'block', margin: '0 auto' }, children: entries.map(({ v, i: origIdx }, sliceIdx) => {
            const start = angle;
            const sweep = (v / total) * 360;
            angle += sweep;
            const rad1 = ((start - 90) * Math.PI) / 180;
            const rad2 = ((start + sweep - 90) * Math.PI) / 180;
            const x1 = cx + r * Math.cos(rad1), y1 = cy + r * Math.sin(rad1);
            const x2 = cx + r * Math.cos(rad2), y2 = cy + r * Math.sin(rad2);
            const large = sweep > 180 ? 1 : 0;
            const pathD = sweep >= 359.9
                ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`
                : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
            return (_jsx("path", { d: pathD, fill: PALETTE[sliceIdx % PALETTE.length], opacity: 0.85, children: _jsxs("title", { children: [labels[origIdx], ": ", v, " (", ((v / total) * 100).toFixed(1), "%)"] }) }, sliceIdx));
        }) }));
}
function ChartWidget({ block }) {
    const t = block.chartType ?? 'bar';
    if (t === 'pie')
        return _jsx(PieChart, { block: block });
    if (t === 'line' || t === 'area')
        return _jsx(LineChart, { block: block });
    return _jsx(BarChart, { block: block });
}
// ── Table ──────────────────────────────────────────────────────
function TableWidget({ block }) {
    const headers = block.headers ?? [];
    const rows = block.rows ?? [];
    const visible = rows.slice(0, 20);
    return (_jsxs("div", { style: { overflowX: 'auto', fontSize: 12 }, children: [_jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: headers.map((h) => (_jsx("th", { style: {
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    fontWeight: 600,
                                    borderBottom: '1px solid var(--c-border-2)',
                                    whiteSpace: 'nowrap',
                                    color: 'var(--c-text-4)',
                                }, children: h }, h))) }) }), _jsx("tbody", { children: visible.map((row, i) => (_jsx("tr", { children: headers.map((_, ci) => (_jsx("td", { style: {
                                    padding: '4px 8px',
                                    borderBottom: '1px solid var(--c-border-1)',
                                    whiteSpace: 'nowrap',
                                    color: 'var(--c-text-2)',
                                }, children: row[ci] ?? '' }, ci))) }, i))) })] }), rows.length > 20 && (_jsxs("div", { style: {
                    padding: '4px 8px',
                    fontSize: 11,
                    color: 'var(--c-text-4)',
                    fontStyle: 'italic',
                }, children: ["+", rows.length - 20, " more rows"] }))] }));
}
// ── Todo ───────────────────────────────────────────────────────
function TodoWidget({ block }) {
    const editable = block.editable !== false;
    const [items, setItems] = useState(block.items ?? []);
    const done = items.filter((i) => i.done).length;
    return (_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 10, color: 'var(--c-text-4)', marginBottom: 4 }, children: [done, "/", items.length, " complete"] }), items.map((item, i) => (_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 0',
                    cursor: editable ? 'pointer' : 'default',
                }, onClick: () => editable &&
                    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, done: !it.done } : it))), children: [_jsx("span", { style: { fontSize: 14 }, children: item.done ? '\u2705' : '\u2B1C' }), _jsx("span", { style: {
                            textDecoration: item.done ? 'line-through' : 'none',
                            opacity: item.done ? 0.5 : 1,
                            fontSize: 13,
                            color: 'var(--c-text-2)',
                        }, children: item.text })] }, item.id)))] }));
}
// ── Metric ─────────────────────────────────────────────────────
function MetricWidget({ block }) {
    const value = block.value;
    const unit = block.unit;
    const change = block.change;
    const changeLabel = block.changeLabel;
    const up = (change ?? 0) >= 0;
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }, children: [_jsxs("span", { style: { fontSize: 24, fontWeight: 700, color: 'var(--c-text-1)' }, children: [value, unit && (_jsx("span", { style: { fontSize: 14, color: 'var(--c-text-4)', marginLeft: 2 }, children: unit }))] }), change !== undefined && (_jsxs("span", { style: { fontSize: 12, fontWeight: 600, color: up ? '#4ade80' : '#f87171' }, children: [up ? '\u25B2' : '\u25BC', " ", Math.abs(change), "%", changeLabel && _jsx("span", { style: { opacity: 0.6, marginLeft: 4 }, children: changeLabel })] }))] }));
}
// ── Link Card ──────────────────────────────────────────────────
function LinkCardWidget({ block }) {
    const url = block.url;
    const title = block.title;
    const description = block.description;
    const image = block.image;
    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    }
    catch {
        /* ignore */
    }
    return (_jsxs("a", { href: isSafeUrl(url) ? url : '#', target: "_blank", rel: "noopener noreferrer", style: {
            display: 'flex',
            gap: 10,
            padding: 8,
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            textDecoration: 'none',
            color: 'inherit',
        }, children: [image && isSafeUrl(image) && (_jsx("img", { src: image, alt: "", style: { width: 60, height: 60, objectFit: 'cover', borderRadius: 6 } })), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--c-text-1)' }, children: title }), description && (_jsx("div", { style: {
                            fontSize: 11,
                            color: 'var(--c-text-4)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: description })), _jsx("div", { style: { fontSize: 10, color: 'var(--c-text-5)', marginTop: 2 }, children: hostname })] })] }));
}
// ── Image Gallery ──────────────────────────────────────────────
function ImageGalleryWidget({ block }) {
    const images = block.images ?? [];
    return (_jsx("div", { style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, 1fr)`,
            gap: 4,
        }, children: images.slice(0, 9).map((img, i) => (_jsx("img", { src: img.src, alt: img.alt ?? '', style: { width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 } }, i))) }));
}
// ── Data Grid ──────────────────────────────────────────────────
function DataGridWidget({ block }) {
    const columns = block.columns ?? [];
    const rows = block.rows ?? [];
    const visible = rows.slice(0, 20);
    return (_jsx("div", { style: { overflowX: 'auto', fontSize: 12 }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((col) => (_jsx("th", { style: {
                                textAlign: 'left',
                                padding: '5px 8px',
                                fontWeight: 600,
                                borderBottom: '1px solid var(--c-border-2)',
                                whiteSpace: 'nowrap',
                                color: 'var(--c-text-4)',
                            }, children: col.label }, col.key))) }) }), _jsx("tbody", { children: visible.map((row, i) => (_jsx("tr", { children: columns.map((col) => (_jsx("td", { style: {
                                padding: '4px 8px',
                                borderBottom: '1px solid var(--c-border-1)',
                                whiteSpace: 'nowrap',
                                color: 'var(--c-text-2)',
                            }, children: String(row[col.key] ?? '') }, col.key))) }, i))) })] }) }));
}
// ── Weather ────────────────────────────────────────────────────
const WEATHER_ICONS = {
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
function WeatherWidget({ block }) {
    const location = block.location;
    const current = block.current;
    const forecast = block.forecast ?? [];
    return (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)', marginBottom: 4 }, children: location }), current && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsxs("span", { style: { fontSize: 28, fontWeight: 700, color: 'var(--c-text-1)' }, children: [current.temp, "\u00B0"] }), _jsx("span", { style: { fontSize: 20 }, children: WEATHER_ICONS[current.condition.toLowerCase()] ?? '\u2600\uFE0F' }), _jsx("span", { style: { fontSize: 12, color: 'var(--c-text-4)', textTransform: 'capitalize' }, children: current.condition })] })), forecast.length > 0 && (_jsx("div", { style: { display: 'flex', gap: 6 }, children: forecast.slice(0, 7).map((day, i) => (_jsxs("div", { style: {
                        textAlign: 'center',
                        padding: '4px 6px',
                        borderRadius: 6,
                        background: 'var(--c-bg-3)',
                        fontSize: 10,
                    }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--c-text-3)' }, children: day.day }), _jsx("div", { style: { fontSize: 16 }, children: WEATHER_ICONS[day.condition.toLowerCase()] ?? '\u2600\uFE0F' }), _jsxs("div", { style: { color: 'var(--c-text-2)' }, children: [day.high, "\u00B0"] }), _jsxs("div", { style: { color: 'var(--c-text-4)' }, children: [day.low, "\u00B0"] })] }, i))) }))] }));
}
// ── Main Renderer ──────────────────────────────────────────────
export default function MibWidgetBlock({ block }) {
    const title = block.title;
    return (_jsxs("div", { style: {
            borderRadius: 10,
            border: '1px solid var(--c-border-2)',
            background: 'var(--c-bg-2)',
            overflow: 'hidden',
            marginTop: 4,
            marginBottom: 4,
        }, children: [title && (_jsx("div", { style: {
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderBottom: '1px solid var(--c-border-1)',
                    background: 'rgba(0,0,0,0.15)',
                    color: 'var(--c-text-4)',
                }, children: title })), _jsxs("div", { style: { padding: 10 }, children: [block.type === 'chart' && _jsx(ChartWidget, { block: block }), block.type === 'table' && _jsx(TableWidget, { block: block }), block.type === 'todo' && _jsx(TodoWidget, { block: block }), block.type === 'metric' && _jsx(MetricWidget, { block: block }), block.type === 'link-card' && _jsx(LinkCardWidget, { block: block }), block.type === 'image-gallery' && _jsx(ImageGalleryWidget, { block: block }), block.type === 'data-grid' && _jsx(DataGridWidget, { block: block }), block.type === 'iframe' && isSafeUrl(block.src) && (_jsx("iframe", { src: block.src, title: title ?? 'Embedded content', style: {
                            width: '100%',
                            height: block.height ?? 300,
                            border: 'none',
                            borderRadius: 6,
                        }, sandbox: "allow-scripts allow-forms allow-popups" })), block.type === 'weather' && _jsx(WeatherWidget, { block: block })] })] }));
}
