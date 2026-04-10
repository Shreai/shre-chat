import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState, useEffect } from 'react';
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
function isDarkTheme() {
    const el = document.documentElement;
    if (el.getAttribute('data-theme') === 'dark')
        return true;
    if (el.classList.contains('dark'))
        return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function useThemeColors() {
    const [dark, setDark] = useState(() => isDarkTheme());
    useEffect(() => {
        const observer = new MutationObserver(() => setDark(isDarkTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onMq = () => setDark(isDarkTheme());
        mq.addEventListener('change', onMq);
        return () => { observer.disconnect(); mq.removeEventListener('change', onMq); };
    }, []);
    return {
        textColor: dark ? 'rgba(255,255,255,0.75)' : 'rgba(30,30,30,0.85)',
        gridColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        pieInnerColor: dark ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,20,0.9)',
    };
}
// --- helpers ---
function niceScale(min, max, ticks) {
    if (min === max) {
        max = min + 1;
    }
    const range = max - min;
    const rough = range / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const nice = rough / mag >= 5 ? 10 * mag : rough / mag >= 2 ? 5 * mag : rough / mag >= 1 ? 2 * mag : mag;
    const lo = Math.floor(min / nice) * nice;
    const hi = Math.ceil(max / nice) * nice;
    const steps = [];
    for (let v = lo; v <= hi + nice * 0.01; v += nice)
        steps.push(parseFloat(v.toPrecision(12)));
    return { min: lo, max: hi, step: nice, steps };
}
function formatValue(v, currency) {
    if (currency)
        return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (Math.abs(v) >= 1_000_000)
        return (v / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(v) >= 1_000)
        return (v / 1_000).toFixed(1) + 'K';
    return v % 1 === 0 ? v.toString() : v.toFixed(1);
}
function polarToCartesian(cx, cy, r, angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx, cy, r, startAngle, endAngle) {
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
function dsColor(ds, i) {
    return ds.color || PALETTE[i % PALETTE.length];
}
function smoothPath(points) {
    if (points.length < 2)
        return '';
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
function BarChart({ data, w, h, pad, textColor, gridColor, }) {
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const allVals = data.datasets.flatMap((d) => d.data);
    const scale = niceScale(Math.min(0, ...allVals), Math.max(...allVals), 5);
    const n = data.labels.length;
    const dsCount = data.datasets.length;
    const groupW = cw / n;
    const barW = Math.max(4, (groupW * 0.7) / dsCount);
    const yRange = scale.max - scale.min || 1;
    const toY = (v) => pad.t + ch - ((v - scale.min) / yRange) * ch;
    return (_jsxs("g", { children: [scale.steps.map((v, i) => (_jsxs("g", { children: [_jsx("line", { x1: pad.l, x2: w - pad.r, y1: toY(v), y2: toY(v), stroke: gridColor }), _jsx("text", { x: pad.l - 4, y: toY(v) + 3, fill: textColor, fontSize: 10, textAnchor: "end", children: formatValue(v, data.options?.currency) })] }, i))), data.labels.map((label, li) => {
                const gx = pad.l + li * groupW + groupW / 2;
                const rot = n > 6;
                return (_jsxs("g", { children: [data.datasets.map((ds, di) => {
                            const x = gx - (dsCount * barW) / 2 + di * barW;
                            const val = ds.data[li] ?? 0;
                            const barH = ((val - scale.min) / yRange) * ch;
                            return (_jsxs("g", { children: [_jsx("rect", { x: x, y: toY(val), width: barW, height: barH, rx: 3, fill: dsColor(ds, di), opacity: 0.85, style: { cursor: 'pointer' }, children: _jsxs("title", { children: [ds.label ? `${ds.label}: ` : '', formatValue(val, data.options?.currency)] }) }), data.options?.showValues && (_jsx("text", { x: x + barW / 2, y: toY(val) - 4, fill: textColor, fontSize: 9, textAnchor: "middle", children: formatValue(val, data.options?.currency) }))] }, di));
                        }), _jsx("text", { x: gx, y: h - pad.b + 14, fill: textColor, fontSize: 10, textAnchor: rot ? 'end' : 'middle', transform: rot ? `rotate(-45, ${gx}, ${h - pad.b + 14})` : undefined, children: label })] }, li));
            })] }));
}
function LineAreaChart({ data, w, h, pad, filled, textColor, gridColor, }) {
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const allVals = data.datasets.flatMap((d) => d.data);
    const scale = niceScale(Math.min(0, ...allVals), Math.max(...allVals), 5);
    const n = data.labels.length;
    const yRange = scale.max - scale.min || 1;
    const toY = (v) => pad.t + ch - ((v - scale.min) / yRange) * ch;
    const toX = (i) => pad.l + (n > 1 ? (i / (n - 1)) * cw : cw / 2);
    const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
    return (_jsxs("g", { children: [scale.steps.map((v, i) => (_jsxs("g", { children: [_jsx("line", { x1: pad.l, x2: w - pad.r, y1: toY(v), y2: toY(v), stroke: gridColor }), _jsx("text", { x: pad.l - 4, y: toY(v) + 3, fill: textColor, fontSize: 10, textAnchor: "end", children: formatValue(v, data.options?.currency) })] }, i))), data.labels.map((label, li) => {
                const x = toX(li);
                const rot = n > 6;
                return (_jsx("text", { x: x, y: h - pad.b + 14, fill: textColor, fontSize: 10, textAnchor: rot ? 'end' : 'middle', transform: rot ? `rotate(-45, ${x}, ${h - pad.b + 14})` : undefined, children: label }, li));
            }), data.datasets.map((ds, di) => {
                const color = dsColor(ds, di);
                const points = ds.data.map((v, i) => ({ x: toX(i), y: toY(v) }));
                const path = smoothPath(points);
                const gradId = `grad_${uid}_${di}`;
                return (_jsxs("g", { children: [filled && (_jsxs(_Fragment, { children: [_jsx("defs", { children: _jsxs("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: color, stopOpacity: 0.4 }), _jsx("stop", { offset: "100%", stopColor: color, stopOpacity: 0.02 })] }) }), _jsx("path", { d: `${path} L ${points[points.length - 1].x} ${toY(scale.min)} L ${points[0].x} ${toY(scale.min)} Z`, fill: `url(#${gradId})` })] })), _jsx("path", { d: path, fill: "none", stroke: color, strokeWidth: 2 }), points.map((p, pi) => (_jsx("circle", { cx: p.x, cy: p.y, r: 3, fill: color, children: _jsxs("title", { children: [ds.label ? `${ds.label}: ` : '', formatValue(ds.data[pi], data.options?.currency)] }) }, pi))), data.options?.showValues &&
                            points.map((p, pi) => (_jsx("text", { x: p.x, y: p.y - 8, fill: textColor, fontSize: 9, textAnchor: "middle", children: formatValue(ds.data[pi], data.options?.currency) }, pi)))] }, di));
            })] }));
}
function PieChart({ data, w, h, pad, textColor, pieInnerColor, }) {
    const cx = (w - pad.l - pad.r) / 2 + pad.l;
    const cy = (h - pad.t - pad.b) / 2 + pad.t;
    const r = Math.min(w - pad.l - pad.r, h - pad.t - pad.b) / 2 - 10;
    const rawValues = data.datasets[0]?.data ?? [];
    // Keep original indices so labels stay aligned
    const entries = rawValues.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
    if (entries.length === 0) {
        return (_jsx("text", { x: cx, y: cy, fill: textColor, fontSize: 11, textAnchor: "middle", children: "No data" }));
    }
    const total = entries.reduce((s, { v }) => s + v, 0) || 1;
    let angle = 0;
    return (_jsx("g", { children: entries.map(({ v, i: origIdx }, sliceIdx) => {
            const start = angle;
            const sweep = (v / total) * 360;
            angle += sweep;
            const color = data.datasets[0]?.color ? undefined : PALETTE[sliceIdx % PALETTE.length];
            const mid = polarToCartesian(cx, cy, r * 0.65, start + sweep / 2);
            const labelPt = polarToCartesian(cx, cy, r + 14, start + sweep / 2);
            const pct = ((v / total) * 100).toFixed(1) + '%';
            return (_jsxs("g", { children: [_jsx("path", { d: describeArc(cx, cy, r, start, start + sweep - 0.3), fill: color || dsColor(data.datasets[0], sliceIdx), opacity: 0.85, children: _jsxs("title", { children: [data.labels[origIdx], ": ", formatValue(v, data.options?.currency), " (", pct, ")"] }) }), sweep > 18 && (_jsx("text", { x: mid.x, y: mid.y + 3, fill: pieInnerColor, fontSize: 10, textAnchor: "middle", fontWeight: "bold", children: pct })), sweep > 12 && (_jsx("text", { x: labelPt.x, y: labelPt.y + 3, fill: textColor, fontSize: 9, textAnchor: labelPt.x > cx ? 'start' : 'end', children: data.labels[origIdx] }))] }, origIdx));
        }) }));
}
// --- main component ---
export default function ChartRenderer({ data, width, height, }) {
    const { textColor, gridColor, pieInnerColor } = useThemeColors();
    const h = height || 200;
    const numW = typeof width === 'number' ? width : 400;
    const showLegend = data.options?.showLegend || data.datasets.length > 1;
    const legendH = showLegend ? 24 : 0;
    const totalH = h + legendH + (data.title ? 20 : 0);
    const titleOffset = data.title ? 20 : 0;
    const pad = data.type === 'pie'
        ? { t: 10 + titleOffset, r: 10, b: 10 + legendH, l: 10 }
        : { t: 10 + titleOffset, r: 14, b: (data.labels.length > 6 ? 40 : 22) + legendH, l: 44 };
    return (_jsxs("svg", { width: width || '100%', height: totalH, viewBox: `0 0 ${numW} ${totalH}`, preserveAspectRatio: "xMidYMid meet", style: { opacity: 1, animation: 'chartFadeIn 0.4s ease-in', fontFamily: 'sans-serif' }, children: [_jsx("style", { children: `@keyframes chartFadeIn { from { opacity: 0 } to { opacity: 1 } } svg rect:hover, svg path:hover { filter: brightness(1.2); }` }), data.title && (_jsx("text", { x: numW / 2, y: 16, fill: textColor, fontSize: 12, textAnchor: "middle", fontWeight: "600", children: data.title })), data.type === 'bar' && _jsx(BarChart, { data: data, w: numW, h: h + titleOffset, pad: pad, textColor: textColor, gridColor: gridColor }), data.type === 'line' && (_jsx(LineAreaChart, { data: data, w: numW, h: h + titleOffset, pad: pad, filled: false, textColor: textColor, gridColor: gridColor })), data.type === 'area' && (_jsx(LineAreaChart, { data: data, w: numW, h: h + titleOffset, pad: pad, filled: true, textColor: textColor, gridColor: gridColor })), data.type === 'pie' && _jsx(PieChart, { data: data, w: numW, h: h + titleOffset, pad: pad, textColor: textColor, pieInnerColor: pieInnerColor }), showLegend && (_jsx("g", { transform: `translate(${numW / 2}, ${totalH - 10})`, children: data.datasets.length > 1
                    ? data.datasets.map((ds, i) => {
                        const offset = (i - (data.datasets.length - 1) / 2) * 90;
                        return (_jsxs("g", { transform: `translate(${offset}, 0)`, children: [_jsx("circle", { cx: -8, cy: -3, r: 4, fill: dsColor(ds, i) }), _jsx("text", { x: 0, y: 0, fill: textColor, fontSize: 10, children: ds.label || `Series ${i + 1}` })] }, i));
                    })
                    : data.type === 'pie' &&
                        data.labels.slice(0, 12).map((label, i) => {
                            const cols = Math.min(data.labels.length, 4);
                            const col = i % cols;
                            const row = Math.floor(i / cols);
                            const offset = (col - (cols - 1) / 2) * 90;
                            return (_jsxs("g", { transform: `translate(${offset}, ${row * 14})`, children: [_jsx("circle", { cx: -8, cy: -3, r: 4, fill: PALETTE[i % PALETTE.length] }), _jsx("text", { x: 0, y: 0, fill: textColor, fontSize: 10, children: label })] }, i));
                        }) }))] }));
}
