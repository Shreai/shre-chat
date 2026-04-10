import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
export function MessageExportMenu({ content, title }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(null);
    const menuRef = useRef(null);
    // Close on outside click
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);
    const handleExport = async (format) => {
        setLoading(format);
        try {
            const utils = await import('../lib/export-utils');
            if (format === 'pdf') {
                // Check if content has a markdown table — export as table PDF
                const table = utils.parseMarkdownTable(content);
                if (table && table.rows.length > 2) {
                    await utils.exportTableToPDF(table.headers, table.rows, title);
                }
                else {
                    await utils.exportProseToPDF(content, title);
                }
            }
            else if (format === 'excel') {
                const table = utils.parseMarkdownTable(content);
                if (table) {
                    await utils.exportToExcel(table.headers, table.rows, title);
                }
            }
            else if (format === 'csv') {
                const table = utils.parseMarkdownTable(content);
                if (table) {
                    utils.exportToCSV(table.headers, table.rows, title);
                }
            }
            else if (format === 'word') {
                utils.exportToWord(content, title);
            }
            else if (format === 'text') {
                utils.exportToText(content, title);
            }
        }
        catch (err) {
            console.error('[export]', err);
        }
        finally {
            setLoading(null);
            setOpen(false);
        }
    };
    const hasTable = /\|.*\|.*\|/.test(content) && content.includes('---');
    return (_jsxs("div", { ref: menuRef, className: "relative", children: [_jsx("button", { onClick: () => setOpen((v) => !v), className: "p-1 rounded transition-colors", style: { color: 'var(--c-text-4)' }, title: "Export", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), _jsx("polyline", { points: "7 10 12 15 17 10" }), _jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] }) }), open && (_jsxs("div", { className: "absolute bottom-full right-0 mb-1 rounded-lg shadow-lg py-1 z-50", style: {
                    background: 'var(--c-bg-2)',
                    border: '1px solid var(--c-border-1)',
                    minWidth: 140,
                }, children: [_jsx("div", { className: "px-2 py-1 text-[9px] uppercase font-semibold", style: { color: 'var(--c-text-5)' }, children: "Export" }), _jsx(MenuItem, { label: "PDF", icon: "\uD83D\uDCC4", loading: loading === 'pdf', onClick: () => handleExport('pdf') }), hasTable && (_jsxs(_Fragment, { children: [_jsx(MenuItem, { label: "Excel", icon: "\uD83D\uDCCA", loading: loading === 'excel', onClick: () => handleExport('excel') }), _jsx(MenuItem, { label: "CSV", icon: "\uD83D\uDCCB", loading: loading === 'csv', onClick: () => handleExport('csv') })] })), _jsx(MenuItem, { label: "Word", icon: "\uD83D\uDCDD", loading: loading === 'word', onClick: () => handleExport('word') }), _jsx(MenuItem, { label: "Text", icon: "\uD83D\uDCC3", loading: loading === 'text', onClick: () => handleExport('text') })] }))] }));
}
function MenuItem({ label, icon, loading, onClick, }) {
    return (_jsxs("button", { onClick: onClick, disabled: loading, className: "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-80 transition-opacity disabled:opacity-50", style: { color: 'var(--c-text-2)' }, children: [_jsx("span", { className: "text-[11px]", children: icon }), _jsx("span", { children: label }), loading && (_jsx("span", { className: "ml-auto text-[10px]", style: { color: 'var(--c-text-5)' }, children: "..." }))] }));
}
