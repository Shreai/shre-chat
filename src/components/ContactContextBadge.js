import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ContactContextBadge({ contacts }) {
    if (!contacts?.length)
        return null;
    return (_jsxs("div", { className: "flex items-center gap-1 mt-1 flex-wrap", children: [_jsxs("svg", { className: "h-3 w-3", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "12", cy: "7", r: "4" })] }), contacts.map((c) => (_jsx("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-medium", style: {
                    background: 'rgba(96,165,250,0.12)',
                    color: '#60a5fa',
                    border: '1px solid rgba(96,165,250,0.2)',
                }, children: c }, c)))] }));
}
