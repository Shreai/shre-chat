import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ShareBar({ shareUrl, shareCopied, onCopy, onClose }) {
    return (_jsxs("div", { className: "shrink-0 flex items-center gap-2 px-4 py-2", style: { background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("input", { type: "text", readOnly: true, value: shareUrl, className: "flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none truncate", style: { background: 'var(--c-bg-input)', color: 'var(--c-text-2)' }, onFocus: (e) => e.target.select() }), _jsx("button", { onClick: onCopy, className: "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all shrink-0", style: {
                    background: shareCopied ? 'var(--c-success-bg)' : 'var(--c-accent)',
                    color: shareCopied ? 'var(--c-success)' : 'var(--c-on-accent)',
                }, children: shareCopied ? 'Copied' : 'Copy' }), _jsx("button", { onClick: onClose, className: "p-1 rounded-lg transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }));
}
