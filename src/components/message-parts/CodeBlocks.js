import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { copyToClipboard } from '../../chat-utils';
// ── CodeCopyButton ──
export function CodeCopyButton({ code }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await copyToClipboard(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (_jsx("button", { onClick: handleCopy, className: "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", style: {
            background: copied ? 'rgba(52,211,153,0.2)' : 'var(--c-bg-hover)',
            color: copied ? 'var(--c-emerald)' : 'var(--c-text-3)',
            border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'var(--c-border-2)'}`,
        }, title: copied ? 'Copied!' : 'Copy code', "aria-label": copied ? 'Copied to clipboard' : 'Copy code block', children: copied ? (_jsxs(_Fragment, { children: [_jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }), "Copied!"] })) : (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }), _jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })] }), "Copy"] })) }));
}
// ── Previewable langs ──
const PREVIEW_LANGS = new Set(['html', 'csv', 'json', 'txt', 'text', 'log', 'markdown', 'md']);
function langToPreviewType(lang) {
    const map = {
        html: 'html',
        csv: 'csv',
        json: 'json',
        txt: 'txt',
        text: 'txt',
        log: 'txt',
        md: 'markdown',
        markdown: 'markdown',
    };
    return map[lang] || 'txt';
}
// ── HtmlCodeBlock — code block with always-visible Preview button ──
export function HtmlCodeBlock({ lang, className, highlightedHtml, codeText, isShell, onRunCommand, props, children, }) {
    const canPreview = PREVIEW_LANGS.has(lang);
    const openPreview = () => {
        const type = langToPreviewType(lang);
        const title = (lang === 'html' ? codeText.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() : null) ||
            `Preview.${type === 'markdown' ? 'md' : type}`;
        const entry = { id: `prev_${Date.now()}`, title, html: codeText, savedAt: Date.now(), type };
        sessionStorage.setItem('shre-preview-html', JSON.stringify(entry));
        try {
            const lib = JSON.parse(localStorage.getItem('shre-preview-library') || '[]');
            const deduped = lib.filter((e) => e.html !== codeText);
            deduped.unshift(entry);
            localStorage.setItem('shre-preview-library', JSON.stringify(deduped.slice(0, 20)));
        }
        catch (err) {
            console.debug('save preview to localStorage', err);
        }
        window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: 'preview' }));
    };
    return (_jsxs("div", { className: "relative group", children: [lang && _jsx("div", { className: "hljs-lang-badge", children: lang }), _jsx("pre", { children: highlightedHtml ? (_jsx("code", { className: `hljs ${className || ''}`, dangerouslySetInnerHTML: { __html: highlightedHtml } })) : (_jsx("code", { className: className, ...props, children: children })) }), _jsxs("div", { className: `absolute top-1 right-1 flex gap-0.5 transition-opacity ${canPreview || isShell ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`, children: [_jsx(CodeCopyButton, { code: codeText }), canPreview && (_jsx("button", { onClick: openPreview, className: "text-[10px] px-2 py-0.5 rounded", style: {
                            background: 'rgba(52,211,153,0.2)',
                            color: 'var(--c-emerald, #34d399)',
                            border: '1px solid rgba(52,211,153,0.3)',
                        }, title: "Open in Preview tab", children: "Preview" })), isShell && onRunCommand && (_jsx("button", { onClick: () => onRunCommand(codeText), className: "text-[10px] px-2 py-0.5 rounded", style: {
                            background: 'rgba(107,180,238,0.2)',
                            color: 'var(--c-terminal-accent)',
                            border: '1px solid rgba(107,180,238,0.3)',
                        }, title: "Run in terminal", children: "\u25B6 Run" }))] })] }));
}
// ── TableWithExport — wraps markdown tables with export buttons ──
export function TableWithExport({ children, ...props }) {
    const tableRef = useRef(null);
    const handleExport = async (format) => {
        const table = tableRef.current;
        if (!table)
            return;
        const utils = await import('../../lib/export-utils');
        const { headers, rows } = utils.parseHtmlTable(table);
        if (headers.length === 0)
            return;
        if (format === 'excel')
            await utils.exportToExcel(headers, rows);
        else if (format === 'csv')
            utils.exportToCSV(headers, rows);
        else if (format === 'pdf')
            await utils.exportTableToPDF(headers, rows);
    };
    return (_jsxs("div", { className: "relative group/table", children: [_jsx("div", { style: { overflowX: 'auto' }, children: _jsx("table", { ref: tableRef, ...props, children: children }) }), _jsxs("div", { className: "absolute top-0 right-0 flex gap-0.5 opacity-0 group-hover/table:opacity-100 transition-opacity", style: { transform: 'translateY(-100%)', padding: '2px 0' }, children: [_jsx("button", { onClick: () => handleExport('excel'), className: "text-[9px] px-1.5 py-0.5 rounded", style: {
                            background: 'rgba(52,211,153,0.2)',
                            color: 'var(--c-emerald)',
                            border: '1px solid rgba(52,211,153,0.3)',
                        }, title: "Export to Excel", children: "Excel" }), _jsx("button", { onClick: () => handleExport('csv'), className: "text-[9px] px-1.5 py-0.5 rounded", style: {
                            background: 'var(--c-bg-hover)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                        }, title: "Export to CSV", children: "CSV" }), _jsx("button", { onClick: () => handleExport('pdf'), className: "text-[9px] px-1.5 py-0.5 rounded", style: {
                            background: 'rgba(96,165,250,0.2)',
                            color: 'var(--c-info-soft)',
                            border: '1px solid rgba(96,165,250,0.3)',
                        }, title: "Export to PDF", children: "PDF" })] })] }));
}
