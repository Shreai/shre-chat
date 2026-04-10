import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function ExportButton({ data, filename = 'export' }) {
    const [open, setOpen] = useState(false);
    function downloadBlob(content, ext, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setOpen(false);
    }
    function exportCSV() {
        if (!data.length)
            return;
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers
            .map((h) => {
            const v = String(row[h] ?? '');
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        })
            .join(','));
        downloadBlob([headers.join(','), ...rows].join('\n'), 'csv', 'text/csv');
    }
    function exportJSON() {
        downloadBlob(JSON.stringify(data, null, 2), 'json', 'application/json');
    }
    if (!data.length)
        return null;
    return (_jsxs("div", { style: { position: 'relative' }, children: [_jsxs("button", { onClick: () => setOpen(!open), className: "px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors", style: {
                    background: 'var(--c-bg-2)',
                    color: 'var(--c-text-3)',
                    border: '1px solid var(--c-border-2)',
                }, children: [_jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), _jsx("polyline", { points: "7 10 12 15 17 10" }), _jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] }), "Export"] }), open && (_jsxs("div", { className: "absolute right-0 top-full mt-1 rounded-lg shadow-lg z-50 py-1", style: {
                    background: 'var(--c-bg-2)',
                    border: '1px solid var(--c-border-1)',
                    minWidth: 100,
                }, children: [_jsx("button", { onClick: exportCSV, className: "w-full text-left px-3 py-1.5 text-[11px] transition-colors", style: { color: 'var(--c-text-2)' }, onMouseEnter: (e) => {
                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.background = 'transparent';
                        }, children: "CSV" }), _jsx("button", { onClick: exportJSON, className: "w-full text-left px-3 py-1.5 text-[11px] transition-colors", style: { color: 'var(--c-text-2)' }, onMouseEnter: (e) => {
                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.background = 'transparent';
                        }, children: "JSON" })] }))] }));
}
