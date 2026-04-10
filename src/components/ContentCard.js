import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { copyToClipboard } from '../chat-utils';
const JsonViewer = lazy(() => import('./JsonViewer'));
const ChartRenderer = lazy(() => import('./ChartRenderer'));
const TYPE_ICONS = {
    html: '</>',
    json: '{}',
    chart: '\u{1F4CA}',
    table: '\u{1F4CB}',
};
const TYPE_LABELS = {
    html: 'HTML',
    json: 'JSON',
    chart: 'Chart',
    table: 'Table',
};
const INLINE_MAX_ROWS = 20;
const IFRAME_MAX_H = 280;
const CARD_MAX_H = 300;
// ── Sub-renderers ───────────────────────────────────────────────────
function HtmlPreview({ content }) {
    const iframeRef = useRef(null);
    const [height, setHeight] = useState(120);
    const srcdoc = `<!DOCTYPE html>
<html><head><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;padding:12px;overflow:auto}
  a{color:#58a6ff}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border:1px solid #30363d}
</style></head><body>${content}<script>
  const h=()=>parent.postMessage({type:'iframe-height',height:document.body.scrollHeight},'*');
  h();new MutationObserver(h).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',h);
</script></body></html>`;
    useEffect(() => {
        const handler = (e) => {
            if (e.origin === window.location.origin &&
                e.data?.type === 'iframe-height' &&
                typeof e.data.height === 'number') {
                setHeight(Math.min(e.data.height + 4, IFRAME_MAX_H));
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);
    return (_jsx("iframe", { ref: iframeRef, srcDoc: srcdoc, sandbox: "allow-scripts allow-same-origin", style: { border: 'none', width: '100%', height, display: 'block', borderRadius: 6 }, title: "HTML preview" }));
}
function TablePreview({ content }) {
    let rows = [];
    let parseError = false;
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0)
            rows = parsed;
        else
            parseError = true;
    }
    catch {
        // Try CSV fallback — handles quoted fields with commas
        const lines = content.trim().split('\n').filter(Boolean);
        if (lines.length >= 2) {
            const parseCSVLine = (line) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        inQuotes = !inQuotes;
                        continue;
                    }
                    if (ch === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                        continue;
                    }
                    current += ch;
                }
                result.push(current.trim());
                return result;
            };
            const headers = parseCSVLine(lines[0]);
            rows = lines.slice(1).map((line) => {
                const vals = parseCSVLine(line);
                const obj = {};
                headers.forEach((h, i) => (obj[h] = vals[i] ?? ''));
                return obj;
            });
        }
        else {
            parseError = true;
        }
    }
    if (parseError || rows.length === 0 || !rows[0]) {
        return (_jsx("pre", { style: { color: 'var(--c-text-3)', fontSize: 12, padding: 8 }, children: "Unable to parse table data" }));
    }
    const headers = Object.keys(rows[0]);
    const truncated = rows.length > INLINE_MAX_ROWS;
    const visible = truncated ? rows.slice(0, INLINE_MAX_ROWS) : rows;
    const isNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));
    return (_jsxs("div", { style: { overflowX: 'auto', fontSize: 12 }, children: [_jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', minWidth: headers.length * 100 }, children: [_jsx("thead", { children: _jsx("tr", { children: headers.map((h) => (_jsx("th", { style: {
                                    position: 'sticky',
                                    top: 0,
                                    padding: '6px 10px',
                                    background: 'rgba(0,0,0,0.4)',
                                    color: 'var(--c-text-2)',
                                    borderBottom: '1px solid var(--c-border-2)',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                }, children: h }, h))) }) }), _jsx("tbody", { children: visible.map((row, i) => (_jsx("tr", { style: { background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }, children: headers.map((h) => (_jsx("td", { style: {
                                    padding: '5px 10px',
                                    borderBottom: '1px solid var(--c-border-2)',
                                    textAlign: isNumeric(row[h]) ? 'right' : 'left',
                                    color: 'var(--c-text-2)',
                                    whiteSpace: 'nowrap',
                                }, children: String(row[h] ?? '') }, h))) }, i))) })] }), truncated && (_jsxs("div", { style: {
                    padding: '8px 10px',
                    color: 'var(--c-text-3)',
                    fontSize: 11,
                    fontStyle: 'italic',
                }, children: [rows.length - INLINE_MAX_ROWS, " more rows..."] }))] }));
}
function JsonPreview({ content }) {
    let parsed;
    let error = false;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        error = true;
    }
    if (error) {
        return (_jsxs("div", { style: { padding: 8 }, children: [_jsx("div", { style: { color: '#f85149', fontSize: 11, marginBottom: 4 }, children: "JSON parse error" }), _jsx("pre", { style: {
                        color: 'var(--c-text-3)',
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                    }, children: content })] }));
    }
    return (_jsx(Suspense, { fallback: _jsx("div", { style: { padding: 12, color: 'var(--c-text-3)', fontSize: 12 }, children: "Loading..." }), children: _jsx(JsonViewer, { data: parsed }) }));
}
function ChartPreview({ content, chartType }) {
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        return _jsx("pre", { style: { color: '#f85149', fontSize: 12, padding: 8 }, children: "Invalid chart data" });
    }
    // Normalize simplified format: { labels, values, title } → ChartData { type, labels, datasets, title }
    const raw = parsed;
    const chartData = {
        type: raw.type ||
            chartType ||
            'bar',
        title: raw.title,
        labels: raw.labels || [],
        datasets: Array.isArray(raw.datasets)
            ? raw.datasets
            : Array.isArray(raw.values)
                ? [{ data: raw.values, label: raw.label }]
                : [{ data: [] }],
        options: {
            showValues: true,
            currency: (raw.labels || []).some(() => Array.isArray(raw.values) &&
                raw.values.some((v) => typeof v === 'number' && v > 100)),
            ...(typeof raw.options === 'object' && raw.options
                ? raw.options
                : {}),
        },
    };
    return (_jsx(Suspense, { fallback: _jsx("div", { style: { padding: 12, color: 'var(--c-text-3)', fontSize: 12 }, children: "Loading chart..." }), children: _jsx(ChartRenderer, { data: chartData }) }));
}
// ── Main component ──────────────────────────────────────────────────
export default function ContentCard({ type, content, title, chartType, onExpand, }) {
    const [hovered, setHovered] = useState(false);
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(async () => {
        await copyToClipboard(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [content]);
    const handleExpand = useCallback(() => {
        onExpand?.(content, type, title);
    }, [content, type, title, onExpand]);
    const displayTitle = title || TYPE_LABELS[type];
    return (_jsxs("div", { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), style: {
            borderRadius: 12,
            border: `1px solid ${hovered ? 'var(--c-border-1, rgba(255,255,255,0.15))' : 'var(--c-border-2)'}`,
            background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
            overflow: 'hidden',
            transition: 'border-color 0.15s ease',
            marginTop: 8,
            marginBottom: 4,
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--c-border-2)',
                    background: 'rgba(0,0,0,0.15)',
                }, children: [_jsx("span", { style: { fontSize: 13, opacity: 0.6, fontFamily: 'monospace', lineHeight: 1 }, children: TYPE_ICONS[type] }), _jsx("span", { style: {
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--c-text-2)',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: displayTitle }), onExpand && (_jsx("button", { onClick: handleExpand, style: {
                            background: 'none',
                            border: 'none',
                            color: 'var(--c-text-3)',
                            cursor: 'pointer',
                            fontSize: 14,
                            padding: '2px 4px',
                            lineHeight: 1,
                        }, title: "Open in new tab", "aria-label": "Expand content", children: "\u2922" }))] }), _jsxs("div", { style: { maxHeight: CARD_MAX_H, overflow: 'hidden', position: 'relative' }, children: [_jsxs("div", { style: { padding: type === 'html' ? 0 : 4 }, children: [type === 'html' && _jsx(HtmlPreview, { content: content }), type === 'json' && _jsx(JsonPreview, { content: content }), type === 'chart' && _jsx(ChartPreview, { content: content, chartType: chartType }), type === 'table' && _jsx(TablePreview, { content: content })] }), _jsx("div", { style: {
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 40,
                            background: 'linear-gradient(transparent, var(--c-bg-card, rgba(13,17,23,0.95)))',
                            pointerEvents: 'none',
                        } })] }), _jsxs("div", { style: {
                    display: 'flex',
                    gap: 6,
                    padding: '6px 12px',
                    borderTop: '1px solid var(--c-border-2)',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    background: 'rgba(0,0,0,0.1)',
                }, children: [_jsx("button", { onClick: handleCopy, style: {
                            background: copied
                                ? 'rgba(52,211,153,0.15)'
                                : 'var(--c-bg-hover, rgba(255,255,255,0.06))',
                            color: copied ? 'var(--c-emerald, #34d399)' : 'var(--c-text-3)',
                            border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'var(--c-border-2)'}`,
                            borderRadius: 6,
                            padding: '3px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }, children: copied ? 'Copied!' : 'Copy' }), onExpand && (_jsx("button", { onClick: handleExpand, style: {
                            background: 'var(--c-bg-hover, rgba(255,255,255,0.06))',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                            borderRadius: 6,
                            padding: '3px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }, children: "Expand \u2922" }))] })] }));
}
