import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
const PRESETS = [
    { label: 'Today', days: 0 },
    { label: '7d', days: 7 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
];
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
export function DateRangeSelector({ value, onChange }) {
    const [custom, setCustom] = useState(false);
    return (_jsxs("div", { className: "flex items-center gap-1.5 flex-wrap", children: [PRESETS.map((p) => {
                const from = p.days === 0 ? today() : daysAgo(p.days);
                const to = today();
                const active = value.from === from && value.to === to;
                return (_jsx("button", { onClick: () => {
                        setCustom(false);
                        onChange({ from, to });
                    }, className: "px-2 py-0.5 rounded text-[11px] font-medium transition-colors", style: {
                        background: active ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                        color: active ? '#fff' : 'var(--c-text-3)',
                        border: `1px solid ${active ? 'transparent' : 'var(--c-border-2)'}`,
                    }, children: p.label }, p.label));
            }), _jsx("button", { onClick: () => setCustom(!custom), className: "px-2 py-0.5 rounded text-[11px] font-medium transition-colors", style: {
                    background: custom ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                    color: custom ? '#fff' : 'var(--c-text-3)',
                    border: `1px solid ${custom ? 'transparent' : 'var(--c-border-2)'}`,
                }, children: "Custom" }), custom && (_jsxs("div", { className: "flex items-center gap-1 ml-1", children: [_jsx("input", { type: "date", value: value.from, onChange: (e) => onChange({ ...value, from: e.target.value }), className: "text-[11px] px-1.5 py-0.5 rounded", style: {
                            background: 'var(--c-bg-2)',
                            color: 'var(--c-text-2)',
                            border: '1px solid var(--c-border-2)',
                        } }), _jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "\u2192" }), _jsx("input", { type: "date", value: value.to, onChange: (e) => onChange({ ...value, to: e.target.value }), className: "text-[11px] px-1.5 py-0.5 rounded", style: {
                            background: 'var(--c-bg-2)',
                            color: 'var(--c-text-2)',
                            border: '1px solid var(--c-border-2)',
                        } })] }))] }));
}
