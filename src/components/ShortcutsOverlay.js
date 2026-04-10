import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const SHORTCUTS = [
    ['Cmd+K', 'New chat'],
    ['Cmd+/', 'Toggle model picker'],
    ['Cmd+F', 'Search in conversation'],
    ['Cmd+Shift+F', 'Search across all sessions'],
    ['Cmd+?', 'Show this overlay'],
    ['Escape', 'Cancel streaming / close panels'],
    ['/', 'Command menu'],
    ['\u2191 / \u2193', 'Navigate messages (when not typing)'],
    ['j / k', 'Navigate messages (vim-style)'],
    ['e', 'Edit selected user message'],
    ['r', 'Regenerate last response'],
    ['Enter / Space', 'Focus text input'],
];
export function ShortcutsOverlay({ open, onClose }) {
    if (!open)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-[100] flex items-center justify-center", onClick: onClose, children: [_jsx("div", { className: "absolute inset-0 bg-black/60 backdrop-blur-sm" }), _jsxs("div", { className: "relative rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Keyboard Shortcuts" }), _jsx("button", { onClick: onClose, className: "p-1 rounded-lg", style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), _jsx("div", { className: "space-y-1 text-xs", children: SHORTCUTS.map(([key, desc]) => (_jsxs("div", { className: "flex items-center justify-between py-1.5 px-2 rounded-lg", style: { background: 'var(--c-bg-3)' }, children: [_jsx("span", { style: { color: 'var(--c-text-3)' }, children: desc }), _jsx("kbd", { className: "px-2 py-0.5 rounded text-[10px] font-mono font-medium", style: {
                                        background: 'var(--c-bg-1)',
                                        color: 'var(--c-accent)',
                                        border: '1px solid var(--c-border-2)',
                                    }, children: key })] }, key))) })] })] }));
}
