import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense } from 'react';
import { ViewErrorBoundary } from '../ViewErrorBoundary';
const ContentCard = lazy(() => import('./ContentCard'));
export function PreviewPanel({ content, onClose }) {
    return (_jsxs("div", { className: "flex-1 min-h-0 flex flex-col", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm", children: content.type === 'chart'
                                    ? '\u{1F4CA}'
                                    : content.type === 'json'
                                        ? '{}'
                                        : content.type === 'table'
                                            ? '\u{1F4CB}'
                                            : '</>' }), _jsx("span", { className: "text-xs font-medium", style: { color: 'var(--c-text-1)' }, children: content.title || `${content.type.toUpperCase()} Preview` })] }), _jsx("button", { onClick: onClose, className: "h-7 w-7 rounded-full flex items-center justify-center", style: { background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-4)' }, "aria-label": "Close preview", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), _jsx("div", { className: "flex-1 overflow-auto p-4", children: _jsx(ViewErrorBoundary, { viewName: "Content Preview", children: _jsx(Suspense, { fallback: _jsx("div", { className: "flex items-center justify-center h-full", style: { color: 'var(--c-text-4)' }, children: "Loading..." }), children: _jsx(ContentCard, { type: content.type, content: content.content, title: content.title }) }) }) })] }));
}
