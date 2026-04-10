import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
const STATUS_COLORS = {
    done: '#4ade80',
    completed: '#4ade80',
    in_progress: '#60a5fa',
    running: '#60a5fa',
    blocked: '#f87171',
    todo: '#a1a1aa',
    backlog: '#a1a1aa',
    failed: '#f87171',
    cancelled: '#6b7280',
};
function statusColor(status) {
    return STATUS_COLORS[status] || '#a78bfa';
}
export function GanttChart({ tasks, height = 300 }) {
    const [hoveredId, setHoveredId] = useState(null);
    const { minTime, maxTime, rows } = useMemo(() => {
        if (!tasks.length)
            return { minTime: 0, maxTime: 1, rows: [] };
        const times = tasks.flatMap((t) => [
            new Date(t.start).getTime(),
            new Date(t.end || t.start).getTime(),
        ]);
        const min = Math.min(...times);
        const max = Math.max(...times);
        const span = max - min || 86400000; // at least 1 day
        return {
            minTime: min,
            maxTime: max,
            rows: tasks.map((t) => ({
                ...t,
                x: (new Date(t.start).getTime() - min) / span,
                w: Math.max(0.01, (new Date(t.end || t.start).getTime() - new Date(t.start).getTime()) / span),
            })),
        };
    }, [tasks]);
    if (!tasks.length)
        return null;
    const ROW_H = 28;
    const MARGIN_LEFT = 120;
    const CHART_W = 600;
    const svgH = Math.max(height, rows.length * ROW_H + 40);
    const svgW = MARGIN_LEFT + CHART_W + 20;
    // Time axis labels
    const daySpan = (maxTime - minTime) / 86400000;
    const tickCount = Math.min(10, Math.max(2, Math.ceil(daySpan)));
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
        const t = minTime + (maxTime - minTime) * (i / tickCount);
        return {
            x: MARGIN_LEFT + (i / tickCount) * CHART_W,
            label: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
    });
    // Dependency arrows
    const parentMap = new Map(rows.map((r, i) => [r.id, i]));
    return (_jsxs("svg", { width: "100%", viewBox: `0 0 ${svgW} ${svgH}`, style: { fontFamily: 'sans-serif' }, children: [ticks.map((t, i) => (_jsxs("g", { children: [_jsx("line", { x1: t.x, y1: 20, x2: t.x, y2: svgH - 5, stroke: "rgba(255,255,255,0.06)", strokeWidth: "1" }), _jsx("text", { x: t.x, y: 14, textAnchor: "middle", fill: "rgba(255,255,255,0.4)", fontSize: "9", children: t.label })] }, i))), rows.map((task, i) => {
                const y = 24 + i * ROW_H;
                const barX = MARGIN_LEFT + task.x * CHART_W;
                const barW = Math.max(4, task.w * CHART_W);
                const isHovered = hoveredId === task.id;
                return (_jsxs("g", { onMouseEnter: () => setHoveredId(task.id), onMouseLeave: () => setHoveredId(null), children: [_jsx("text", { x: MARGIN_LEFT - 6, y: y + ROW_H / 2 + 3, textAnchor: "end", fill: "rgba(255,255,255,0.6)", fontSize: "10", children: task.title.length > 16 ? task.title.slice(0, 16) + '\u2026' : task.title }), _jsx("rect", { x: barX, y: y + 4, width: barW, height: ROW_H - 8, rx: 3, fill: statusColor(task.status), opacity: isHovered ? 1 : 0.75, stroke: isHovered ? '#fff' : 'none', strokeWidth: isHovered ? 1 : 0 }), barW > 40 && (_jsx("text", { x: barX + 4, y: y + ROW_H / 2 + 3, fill: "#000", fontSize: "8", fontWeight: "600", children: task.status })), task.parentId &&
                            parentMap.has(task.parentId) &&
                            (() => {
                                const pIdx = parentMap.get(task.parentId);
                                const parent = rows[pIdx];
                                const px = MARGIN_LEFT + (parent.x + parent.w) * CHART_W;
                                const py = 24 + pIdx * ROW_H + ROW_H / 2;
                                const cx = barX;
                                const cy = y + ROW_H / 2;
                                return (_jsx("path", { d: `M ${px} ${py} C ${px + 15} ${py}, ${cx - 15} ${cy}, ${cx} ${cy}`, fill: "none", stroke: "rgba(255,255,255,0.2)", strokeWidth: "1", strokeDasharray: "3,3", markerEnd: "url(#arrowhead)" }));
                            })(), isHovered && (_jsxs("g", { children: [_jsx("rect", { x: barX + barW + 4, y: y, width: 160, height: 48, rx: 4, fill: "rgba(0,0,0,0.85)" }), _jsx("text", { x: barX + barW + 10, y: y + 14, fill: "#fff", fontSize: "10", fontWeight: "600", children: task.title }), _jsxs("text", { x: barX + barW + 10, y: y + 26, fill: "rgba(255,255,255,0.6)", fontSize: "9", children: [task.agent || 'unassigned', " \u00B7 ", task.status] }), _jsxs("text", { x: barX + barW + 10, y: y + 38, fill: "rgba(255,255,255,0.6)", fontSize: "9", children: [task.qualityScore != null ? `Quality: ${task.qualityScore}` : '', task.start.slice(0, 10), " \u2192 ", (task.end || task.start).slice(0, 10)] })] }))] }, task.id));
            }), _jsx("defs", { children: _jsx("marker", { id: "arrowhead", markerWidth: "6", markerHeight: "4", refX: "6", refY: "2", orient: "auto", children: _jsx("polygon", { points: "0 0, 6 2, 0 4", fill: "rgba(255,255,255,0.3)" }) }) })] }));
}
