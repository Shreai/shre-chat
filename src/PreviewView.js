import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useApp } from './store';
// ── Preview data bridge ─────────────────────────────────────────────
// sessionStorage is the data bus — no events, no race conditions.
// MessageBubble writes here before switching to "preview" view.
const PREVIEW_KEY = 'shre-preview-html';
const LIBRARY_KEY = 'shre-preview-library';
const MAX_LIBRARY = 20;
function loadLibrary() {
    try {
        return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    }
    catch (_) {
        void _;
        return [];
    }
}
function saveLibrary(entries) {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, MAX_LIBRARY)));
    }
    catch (_) {
        void _;
    }
}
function deriveTitle(html) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return (m?.[1]?.trim() ||
        `Preview ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}
function detectType(content, title) {
    const ext = title?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf')
        return 'pdf';
    if (ext === 'csv')
        return 'csv';
    if (ext === 'json')
        return 'json';
    if (ext === 'txt' || ext === 'log')
        return 'txt';
    if (ext === 'md' || ext === 'markdown')
        return 'markdown';
    // Sniff content
    if (content.trimStart().startsWith('<!DOCTYPE') ||
        content.trimStart().startsWith('<html') ||
        content.includes('</div>') ||
        content.includes('</table>'))
        return 'html';
    try {
        JSON.parse(content);
        return 'json';
    }
    catch {
        /* not json */
    }
    if (content.includes(',') && content.split('\n').length > 1) {
        const lines = content.trim().split('\n');
        const firstCommas = (lines[0].match(/,/g) || []).length;
        if (firstCommas > 0 && lines.length > 2)
            return 'csv';
    }
    return 'txt';
}
/** Called from MessageBubble — stores HTML and returns the entry */
export function queuePreview(html, title, type) {
    const entry = {
        id: `prev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: title || deriveTitle(html),
        html,
        savedAt: Date.now(),
        type: type || detectType(html, title),
    };
    // Write to sessionStorage for immediate pickup
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(entry));
    // Also persist to library
    const lib = loadLibrary().filter((e) => e.html !== html);
    saveLibrary([entry, ...lib]);
    return entry;
}
// ── Type-specific renderers ─────────────────────────────────────────
function HtmlRenderer({ content }) {
    return (_jsx("iframe", { srcDoc: content, sandbox: "allow-scripts allow-same-origin allow-forms allow-popups", className: "w-full h-full border-0", style: { background: 'white' }, title: "HTML Preview" }));
}
function TxtRenderer({ content }) {
    return (_jsx("div", { className: "w-full h-full overflow-auto", style: { background: '#0d1117', padding: 24 }, children: _jsx("pre", { style: {
                color: '#e6edf3',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }, children: content }) }));
}
function CsvRenderer({ content }) {
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length < 2)
        return _jsx(TxtRenderer, { content: content });
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
    const rows = lines.slice(1).map((line) => parseCSVLine(line));
    const isNum = (v) => v !== '' && !isNaN(Number(v));
    return (_jsxs("div", { className: "w-full h-full overflow-auto", style: { background: '#0d1117' }, children: [_jsxs("table", { style: {
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: {
                                        position: 'sticky',
                                        top: 0,
                                        padding: '8px 12px',
                                        background: '#161b22',
                                        color: '#58a6ff',
                                        borderBottom: '2px solid #30363d',
                                        textAlign: 'left',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                    }, children: "#" }), headers.map((h, i) => (_jsx("th", { style: {
                                        position: 'sticky',
                                        top: 0,
                                        padding: '8px 12px',
                                        background: '#161b22',
                                        color: '#e6edf3',
                                        borderBottom: '2px solid #30363d',
                                        textAlign: 'left',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                    }, children: h }, i)))] }) }), _jsx("tbody", { children: rows.map((row, i) => (_jsxs("tr", { style: { background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }, children: [_jsx("td", { style: {
                                        padding: '6px 12px',
                                        borderBottom: '1px solid #21262d',
                                        color: '#484f58',
                                        textAlign: 'right',
                                    }, children: i + 1 }), headers.map((_, j) => (_jsx("td", { style: {
                                        padding: '6px 12px',
                                        borderBottom: '1px solid #21262d',
                                        color: '#e6edf3',
                                        textAlign: isNum(row[j] || '') ? 'right' : 'left',
                                        whiteSpace: 'nowrap',
                                    }, children: row[j] ?? '' }, j)))] }, i))) })] }), _jsxs("div", { style: { padding: '8px 12px', color: '#484f58', fontSize: 11 }, children: [rows.length, " rows \u00D7 ", headers.length, " columns"] })] }));
}
function JsonRenderer({ content }) {
    let formatted;
    try {
        formatted = JSON.stringify(JSON.parse(content), null, 2);
    }
    catch {
        formatted = content;
    }
    return (_jsx("div", { className: "w-full h-full overflow-auto", style: { background: '#0d1117', padding: 24 }, children: _jsx("pre", { style: {
                color: '#e6edf3',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }, children: formatted }) }));
}
function MarkdownRenderer({ content }) {
    // Render markdown as simple styled HTML in an iframe
    const htmlContent = markdownToSimpleHtml(content);
    const doc = `<!DOCTYPE html>
<html><head><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:white;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:15px;padding:32px;line-height:1.7;max-width:800px;margin:0 auto}
  h1{font-size:28px;font-weight:800;margin:24px 0 12px;color:#0f172a}
  h2{font-size:22px;font-weight:700;margin:20px 0 10px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
  h3{font-size:18px;font-weight:600;margin:16px 0 8px;color:#1e293b}
  p{margin:8px 0}
  ul,ol{margin:8px 0;padding-left:24px}
  li{margin:4px 0}
  code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;font-family:'JetBrains Mono',monospace}
  pre{background:#0d1117;color:#e6edf3;padding:16px;border-radius:8px;overflow-x:auto;margin:12px 0;font-size:13px}
  pre code{background:none;padding:0;color:inherit}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th,td{padding:8px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px}
  th{background:#f8fafc;font-weight:600}
  blockquote{border-left:3px solid #2563eb;padding:8px 16px;margin:12px 0;color:#475569;background:#f8fafc;border-radius:0 4px 4px 0}
  strong{font-weight:600}
  a{color:#2563eb}
  hr{border:none;border-top:1px solid #e2e8f0;margin:20px 0}
</style></head><body>${htmlContent}</body></html>`;
    return (_jsx("iframe", { srcDoc: doc, sandbox: "allow-same-origin", className: "w-full h-full border-0", style: { background: 'white' }, title: "Markdown Preview" }));
}
/** Simple markdown → HTML (no dependencies) */
function markdownToSimpleHtml(md) {
    let html = md
        // Code blocks (fenced)
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${escHtml(code.trim())}</code></pre>`)
        // Horizontal rules
        .replace(/^---+$/gm, '<hr>')
        // Headers
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Bold + italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Blockquotes
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // Unordered lists
        .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
        // Paragraphs (lines that aren't already tags)
        .replace(/^(?!<[a-z])([\w].+)$/gm, '<p>$1</p>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
    return html;
}
function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Type badge colors
const TYPE_COLORS = {
    html: { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
    pdf: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    txt: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
    csv: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
    json: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    markdown: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
};
const TYPE_LABELS = {
    html: 'HTML',
    pdf: 'PDF',
    txt: 'TXT',
    csv: 'CSV',
    json: 'JSON',
    markdown: 'MD',
};
// ── PreviewView ─────────────────────────────────────────────────────
export function PreviewView() {
    const { state, actions } = useApp();
    const iframeRef = useRef(null);
    const [library, setLibrary] = useState(loadLibrary);
    const [active, setActive] = useState(null);
    // On mount: check sessionStorage for queued preview
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(PREVIEW_KEY);
            if (raw) {
                const entry = JSON.parse(raw);
                if (!entry.type)
                    entry.type = detectType(entry.html, entry.title);
                setActive(entry);
                setLibrary(loadLibrary());
                sessionStorage.removeItem(PREVIEW_KEY);
            }
        }
        catch (_) {
            void _;
        }
    }, []);
    const selectEntry = (entry) => {
        if (!entry.type)
            entry.type = detectType(entry.html, entry.title);
        setActive(entry);
    };
    const deleteEntry = (id, e) => {
        e.stopPropagation();
        const updated = library.filter((en) => en.id !== id);
        saveLibrary(updated);
        setLibrary(updated);
        if (active?.id === id) {
            setActive(null);
        }
    };
    const openInNewTab = () => {
        if (!active?.html)
            return;
        const type = active.type || 'html';
        if (type === 'html' || type === 'markdown') {
            const w = window.open('', '_blank');
            if (w) {
                w.document.write(type === 'markdown'
                    ? `<!DOCTYPE html><html><body>${markdownToSimpleHtml(active.html)}</body></html>`
                    : active.html);
                w.document.close();
            }
        }
        else {
            // For text-based: open as text blob
            const blob = new Blob([active.html], {
                type: type === 'json' ? 'application/json' : type === 'csv' ? 'text/csv' : 'text/plain',
            });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
    };
    const downloadFile = () => {
        if (!active?.html)
            return;
        const type = active.type || 'txt';
        const mimeMap = {
            html: 'text/html',
            csv: 'text/csv',
            json: 'application/json',
            txt: 'text/plain',
            markdown: 'text/markdown',
            pdf: 'application/pdf',
        };
        const extMap = {
            html: 'html',
            csv: 'csv',
            json: 'json',
            txt: 'txt',
            markdown: 'md',
            pdf: 'pdf',
        };
        const blob = new Blob([active.html], { type: mimeMap[type] || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${active.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extMap[type] || 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const activeType = active?.type || 'html';
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2 shrink-0", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsx("button", { onClick: () => actions.setSidebarOpen(!state.sidebarOpen), style: { color: 'var(--c-text-4)' }, className: "md:hidden p-1 rounded", title: "Menu", children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M3 12h18M3 6h18M3 18h18" }) }) }), _jsxs("button", { onClick: () => actions.switchView('chat'), className: "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:opacity-80", style: { color: 'var(--c-accent)', background: 'var(--c-bg-2)' }, title: "Back to Chat", children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }), "Chat"] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-2)' }, children: "Preview" }), active && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded font-semibold", style: {
                            background: TYPE_COLORS[activeType]?.bg,
                            color: TYPE_COLORS[activeType]?.color,
                        }, children: TYPE_LABELS[activeType] || activeType.toUpperCase() })), _jsx("div", { className: "flex-1" }), active && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs truncate max-w-[200px]", style: { color: 'var(--c-text-3)' }, children: active.title }), _jsx("button", { onClick: openInNewTab, className: "px-2 py-1 rounded text-xs hover:opacity-80", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-2)',
                                    border: '1px solid var(--c-border-2)',
                                }, title: "Open in new browser tab", children: "Open in Tab" }), _jsx("button", { onClick: downloadFile, className: "px-2 py-1 rounded text-xs hover:opacity-80", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-2)',
                                    border: '1px solid var(--c-border-2)',
                                }, title: "Download file", children: "Download" }), _jsx("button", { onClick: () => setActive(null), className: "px-2 py-1 rounded text-xs", style: { color: 'var(--c-text-4)' }, children: "Clear" })] }))] }), _jsxs("div", { className: "flex flex-1 min-h-0", children: [_jsxs("div", { className: "flex flex-col shrink-0 overflow-hidden", style: {
                            width: 200,
                            borderRight: '1px solid var(--c-border-1)',
                            background: 'var(--c-bg-2)',
                        }, children: [_jsxs("div", { className: "px-2 py-2 text-xs font-semibold shrink-0", style: { color: 'var(--c-text-3)', borderBottom: '1px solid var(--c-border-1)' }, children: ["Library", ' ', library.length > 0 && (_jsxs("span", { style: { color: 'var(--c-text-5)' }, children: ["(", library.length, ")"] }))] }), _jsx("div", { className: "flex-1 overflow-y-auto", children: library.length === 0 ? (_jsx("div", { className: "px-3 py-4 text-[11px] text-center", style: { color: 'var(--c-text-5)' }, children: "No previews yet. Ask an agent to generate HTML, then click Preview." })) : (_jsx("ul", { className: "py-1", children: library.map((entry) => {
                                        const entryType = entry.type || detectType(entry.html, entry.title);
                                        return (_jsx("li", { children: _jsxs("button", { onClick: () => selectEntry(entry), className: "group/entry w-full flex items-start gap-1.5 px-2 py-2 text-left hover:opacity-90 transition-colors", style: {
                                                    background: active?.id === entry.id ? 'var(--c-bg-hover)' : 'transparent',
                                                    borderLeft: active?.id === entry.id
                                                        ? '2px solid var(--c-accent)'
                                                        : '2px solid transparent',
                                                }, children: [_jsxs("span", { className: "flex-1 min-w-0", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-[9px] px-1 py-0.5 rounded font-semibold shrink-0", style: {
                                                                            background: TYPE_COLORS[entryType]?.bg,
                                                                            color: TYPE_COLORS[entryType]?.color,
                                                                        }, children: TYPE_LABELS[entryType] || 'TXT' }), _jsx("span", { className: "block text-[11px] font-medium truncate leading-snug", style: {
                                                                            color: active?.id === entry.id ? 'var(--c-text-1)' : 'var(--c-text-2)',
                                                                        }, children: entry.title })] }), _jsx("span", { className: "block text-[9px] mt-0.5", style: { color: 'var(--c-text-5)' }, children: new Date(entry.savedAt).toLocaleTimeString([], {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                }) })] }), _jsx("button", { onClick: (e) => deleteEntry(entry.id, e), className: "opacity-0 group-hover/entry:opacity-100 shrink-0 p-0.5 rounded hover:text-red-400 transition-all", style: { color: 'var(--c-text-5)' }, title: "Delete", children: _jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) })] }) }, entry.id));
                                    }) })) })] }), _jsx("div", { className: "flex-1 relative min-w-0", children: active ? (_jsxs(_Fragment, { children: [activeType === 'html' && _jsx(HtmlRenderer, { content: active.html }), activeType === 'csv' && _jsx(CsvRenderer, { content: active.html }), activeType === 'json' && _jsx(JsonRenderer, { content: active.html }), activeType === 'txt' && _jsx(TxtRenderer, { content: active.html }), activeType === 'markdown' && _jsx(MarkdownRenderer, { content: active.html }), activeType === 'pdf' && (_jsx("div", { className: "flex items-center justify-center h-full", style: { color: 'var(--c-text-4)' }, children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-4", children: "\uD83D\uDCC4" }), _jsx("div", { className: "text-sm mb-2", children: "PDF Preview" }), _jsx("div", { className: "text-xs mb-4", style: { color: 'var(--c-text-5)' }, children: "PDF files open best in a dedicated viewer." }), _jsx("button", { onClick: openInNewTab, className: "px-4 py-2 rounded-lg text-sm", style: { background: 'var(--c-accent)', color: 'white' }, children: "Open PDF" })] }) }))] })) : (_jsx("div", { className: "flex items-center justify-center h-full", style: { color: 'var(--c-text-4)' }, children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-4", children: "\uD83D\uDC41" }), _jsx("div", { className: "text-sm mb-2", children: "Preview" }), _jsx("div", { className: "text-xs", style: { color: 'var(--c-text-5)', maxWidth: 280, lineHeight: 1.6 }, children: library.length > 0 ? ('Select a preview from the library.') : (_jsxs(_Fragment, { children: ["Supports ", _jsx("strong", { children: "HTML" }), ", ", _jsx("strong", { children: "CSV" }), ", ", _jsx("strong", { children: "JSON" }), ",", ' ', _jsx("strong", { children: "TXT" }), ", and ", _jsx("strong", { children: "Markdown" }), ".", _jsx("br", {}), "Ask an agent to generate content, then click the Preview button on the code block."] })) })] }) })) })] })] }));
}
