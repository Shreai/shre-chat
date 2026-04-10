import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
const RING_SIZE = 36;
const STROKE_WIDTH = 3;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_SECONDS = 90;
export default function StreamTimeoutIndicator({ stallCountdown }) {
    const dashOffset = useMemo(() => {
        const fraction = Math.max(0, Math.min(1, stallCountdown / MAX_SECONDS));
        return CIRCUMFERENCE * (1 - fraction);
    }, [stallCountdown]);
    return (_jsxs("div", { className: "flex items-center gap-2.5 px-3 py-1.5 mb-1 rounded-lg text-[11px] select-none stream-timeout-indicator", style: {
            background: 'rgba(234, 179, 8, 0.08)',
            color: 'var(--c-warning)',
        }, children: [_jsxs("div", { className: "relative flex-shrink-0", style: { width: RING_SIZE, height: RING_SIZE }, children: [_jsxs("svg", { width: RING_SIZE, height: RING_SIZE, viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`, className: "stream-timeout-ring", children: [_jsx("circle", { cx: RING_SIZE / 2, cy: RING_SIZE / 2, r: RADIUS, fill: "none", stroke: "var(--c-border-2)", strokeWidth: STROKE_WIDTH }), _jsx("circle", { cx: RING_SIZE / 2, cy: RING_SIZE / 2, r: RADIUS, fill: "none", stroke: "var(--c-warning)", strokeWidth: STROKE_WIDTH, strokeLinecap: "round", strokeDasharray: CIRCUMFERENCE, strokeDashoffset: dashOffset, transform: `rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`, style: { transition: 'stroke-dashoffset 1s linear' } })] }), _jsx("span", { className: "absolute inset-0 flex items-center justify-center font-medium", style: { fontSize: 11, color: 'var(--c-warning)', lineHeight: 1 }, children: stallCountdown })] }), _jsx("span", { children: "Still working\u2026" })] }));
}
