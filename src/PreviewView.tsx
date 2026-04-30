import { useState, useEffect } from 'react';
import { useApp } from './store';

// ── Preview data bridge ─────────────────────────────────────────────
// sessionStorage is the data bus — no events, no race conditions.
// MessageBubble writes here before switching to "preview" view.

const PREVIEW_KEY = 'shre-preview-html';
const LIBRARY_KEY = 'shre-preview-library';
const MAX_LIBRARY = 20;

export type PreviewType = 'html' | 'pdf' | 'txt' | 'csv' | 'json' | 'markdown';

export interface PreviewEntry {
  id: string;
  title: string;
  html: string; // for html type, raw content; for others, raw text/data
  savedAt: number;
  type?: PreviewType;
}

function loadLibrary(): PreviewEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
  } catch (_) {
    void _;
    return [];
  }
}

function saveLibrary(entries: PreviewEntry[]) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, MAX_LIBRARY)));
  } catch (_) {
    void _;
  }
}

function readQueuedPreview(): PreviewEntry | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PreviewEntry;
    if (!entry.type) entry.type = detectType(entry.html, entry.title);
    return entry;
  } catch (_) {
    void _;
    return null;
  }
}

function deriveTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (
    m?.[1]?.trim() ||
    `Preview ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  );
}

function detectType(content: string, title?: string): PreviewType {
  const ext = title?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'txt' || ext === 'log') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  // Sniff content
  if (
    content.trimStart().startsWith('<!DOCTYPE') ||
    content.trimStart().startsWith('<html') ||
    content.includes('</div>') ||
    content.includes('</table>')
  )
    return 'html';
  try {
    JSON.parse(content);
    return 'json';
  } catch {
    /* not json */
  }
  if (content.includes(',') && content.split('\n').length > 1) {
    const lines = content.trim().split('\n');
    const firstCommas = (lines[0].match(/,/g) || []).length;
    if (firstCommas > 0 && lines.length > 2) return 'csv';
  }
  return 'txt';
}

/** Called from MessageBubble — stores HTML and returns the entry */
export function queuePreview(html: string, title?: string, type?: PreviewType): PreviewEntry {
  const entry: PreviewEntry = {
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

function HtmlRenderer({
  content,
  frameKey,
  onLoad,
}: {
  content: string;
  frameKey: string;
  onLoad: () => void;
}) {
  return (
    <iframe
      key={frameKey}
      srcDoc={content}
      onLoad={onLoad}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      className="w-full h-full border-0"
      style={{ background: 'white' }}
      title="HTML Preview"
    />
  );
}

function TxtRenderer({ content }: { content: string }) {
  return (
    <div className="w-full h-full overflow-auto" style={{ background: '#0d1117', padding: 24 }}>
      <pre
        style={{
          color: '#e6edf3',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </pre>
    </div>
  );
}

function CsvRenderer({ content }: { content: string }) {
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return <TxtRenderer content={content} />;

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
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
  const isNum = (v: string) => v !== '' && !isNaN(Number(v));

  return (
    <div className="w-full h-full overflow-auto" style={{ background: '#0d1117' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                top: 0,
                padding: '8px 12px',
                background: '#161b22',
                color: '#58a6ff',
                borderBottom: '2px solid #30363d',
                textAlign: 'left',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              #
            </th>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  position: 'sticky',
                  top: 0,
                  padding: '8px 12px',
                  background: '#161b22',
                  color: '#e6edf3',
                  borderBottom: '2px solid #30363d',
                  textAlign: 'left',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
            >
              <td
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid #21262d',
                  color: '#484f58',
                  textAlign: 'right',
                }}
              >
                {i + 1}
              </td>
              {headers.map((_, j) => (
                <td
                  key={j}
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid #21262d',
                    color: '#e6edf3',
                    textAlign: isNum(row[j] || '') ? 'right' : 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '8px 12px', color: '#484f58', fontSize: 11 }}>
        {rows.length} rows × {headers.length} columns
      </div>
    </div>
  );
}

function JsonRenderer({ content }: { content: string }) {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    formatted = content;
  }
  return (
    <div className="w-full h-full overflow-auto" style={{ background: '#0d1117', padding: 24 }}>
      <pre
        style={{
          color: '#e6edf3',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {formatted}
      </pre>
    </div>
  );
}

function MarkdownRenderer({
  content,
  frameKey,
  onLoad,
}: {
  content: string;
  frameKey: string;
  onLoad: () => void;
}) {
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
  return (
    <iframe
      key={frameKey}
      srcDoc={doc}
      onLoad={onLoad}
      sandbox="allow-same-origin"
      className="w-full h-full border-0"
      style={{ background: 'white' }}
      title="Markdown Preview"
    />
  );
}

/** Simple markdown → HTML (no dependencies) */
function markdownToSimpleHtml(md: string): string {
  let html = md
    // Code blocks (fenced)
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, _lang, code) => `<pre><code>${escHtml(code.trim())}</code></pre>`,
    )
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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Type badge colors
const TYPE_COLORS: Record<PreviewType, { bg: string; color: string }> = {
  html: { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
  pdf: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  txt: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  csv: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  json: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  markdown: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
};

const TYPE_LABELS: Record<PreviewType, string> = {
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

  const [library, setLibrary] = useState<PreviewEntry[]>(() => loadLibrary());
  const [active, setActive] = useState<PreviewEntry | null>(() => readQueuedPreview());
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (active) {
      sessionStorage.removeItem(PREVIEW_KEY);
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setPreviewReady(false);
      return;
    }

    const type = active.type || detectType(active.html, active.title);
    if (type === 'html' || type === 'markdown') {
      setPreviewReady(false);
      return;
    }

    setPreviewReady(true);
  }, [active]);

  const selectEntry = (entry: PreviewEntry) => {
    if (!entry.type) entry.type = detectType(entry.html, entry.title);
    setActive(entry);
  };

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = library.filter((en) => en.id !== id);
    saveLibrary(updated);
    setLibrary(updated);
    if (active?.id === id) {
      setActive(null);
    }
  };

  const openInNewTab = () => {
    if (!active?.html) return;
    const type = active.type || 'html';
    if (type === 'html' || type === 'markdown') {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(
          type === 'markdown'
            ? `<!DOCTYPE html><html><body>${markdownToSimpleHtml(active.html)}</body></html>`
            : active.html,
        );
        w.document.close();
      }
    } else {
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
    if (!active?.html) return;
    const type = active.type || 'txt';
    const mimeMap: Record<string, string> = {
      html: 'text/html',
      csv: 'text/csv',
      json: 'application/json',
      txt: 'text/plain',
      markdown: 'text/markdown',
      pdf: 'application/pdf',
    };
    const extMap: Record<string, string> = {
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
  const frameKey = active?.id || active?.savedAt?.toString() || 'preview-empty';

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: 'var(--c-bg-1)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--c-border-1)' }}
      >
        <button
          onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
          style={{ color: 'var(--c-text-4)' }}
          className="md:hidden p-1 rounded"
          title="Menu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <button
          onClick={() => actions.switchView('chat')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:opacity-80"
          style={{ color: 'var(--c-accent)', background: 'var(--c-bg-2)' }}
          title="Back to Chat"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Chat
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text-2)' }}>
          Preview
        </span>
        {active && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
            style={{
              background: TYPE_COLORS[activeType]?.bg,
              color: TYPE_COLORS[activeType]?.color,
            }}
          >
            {TYPE_LABELS[activeType] || activeType.toUpperCase()}
          </span>
        )}
        <div className="flex-1" />
        {active && (
          <div className="flex items-center gap-2">
            <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--c-text-3)' }}>
              {active.title}
            </span>
            <button
              onClick={openInNewTab}
              className="px-2 py-1 rounded text-xs hover:opacity-80"
              style={{
                background: 'var(--c-bg-2)',
                color: 'var(--c-text-2)',
                border: '1px solid var(--c-border-2)',
              }}
              title="Open in new browser tab"
            >
              Open in Tab
            </button>
            <button
              onClick={downloadFile}
              className="px-2 py-1 rounded text-xs hover:opacity-80"
              style={{
                background: 'var(--c-bg-2)',
                color: 'var(--c-text-2)',
                border: '1px solid var(--c-border-2)',
              }}
              title="Download file"
            >
              Download
            </button>
            <button
              onClick={() => setActive(null)}
              className="px-2 py-1 rounded text-xs"
              style={{ color: 'var(--c-text-4)' }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Library sidebar */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 200,
            borderRight: '1px solid var(--c-border-1)',
            background: 'var(--c-bg-2)',
          }}
        >
          <div
            className="px-2 py-2 text-xs font-semibold shrink-0"
            style={{ color: 'var(--c-text-3)', borderBottom: '1px solid var(--c-border-1)' }}
          >
            Library{' '}
            {library.length > 0 && (
              <span style={{ color: 'var(--c-text-5)' }}>({library.length})</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {library.length === 0 ? (
              <div
                className="px-3 py-4 text-[11px] text-center"
                style={{ color: 'var(--c-text-5)' }}
              >
                No previews yet. Ask an agent to generate HTML, then click Preview.
              </div>
            ) : (
              <ul className="py-1">
                {library.map((entry) => {
                  const entryType = entry.type || detectType(entry.html, entry.title);
                  return (
                    <li key={entry.id}>
                      <button
                        onClick={() => selectEntry(entry)}
                        className="group/entry w-full flex items-start gap-1.5 px-2 py-2 text-left hover:opacity-90 transition-colors"
                        style={{
                          background: active?.id === entry.id ? 'var(--c-bg-hover)' : 'transparent',
                          borderLeft:
                            active?.id === entry.id
                              ? '2px solid var(--c-accent)'
                              : '2px solid transparent',
                        }}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1">
                            <span
                              className="text-[9px] px-1 py-0.5 rounded font-semibold shrink-0"
                              style={{
                                background: TYPE_COLORS[entryType]?.bg,
                                color: TYPE_COLORS[entryType]?.color,
                              }}
                            >
                              {TYPE_LABELS[entryType] || 'TXT'}
                            </span>
                            <span
                              className="block text-[11px] font-medium truncate leading-snug"
                              style={{
                                color:
                                  active?.id === entry.id ? 'var(--c-text-1)' : 'var(--c-text-2)',
                              }}
                            >
                              {entry.title}
                            </span>
                          </span>
                          <span
                            className="block text-[9px] mt-0.5"
                            style={{ color: 'var(--c-text-5)' }}
                          >
                            {new Date(entry.savedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                        <button
                          onClick={(e) => deleteEntry(entry.id, e)}
                          className="opacity-0 group-hover/entry:opacity-100 shrink-0 p-0.5 rounded hover:text-red-400 transition-all"
                          style={{ color: 'var(--c-text-5)' }}
                          title="Delete"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Content area */}
        <div
          className="flex-1 relative min-w-0"
          data-preview-ready={active ? String(previewReady) : 'false'}
          data-preview-type={activeType}
          data-preview-id={active?.id || ''}
        >
          {active ? (
            <>
              {activeType === 'html' && (
                <HtmlRenderer
                  key={frameKey}
                  content={active.html}
                  frameKey={frameKey}
                  onLoad={() => setPreviewReady(true)}
                />
              )}
              {activeType === 'csv' && <CsvRenderer key={active.id} content={active.html} />}
              {activeType === 'json' && <JsonRenderer key={active.id} content={active.html} />}
              {activeType === 'txt' && <TxtRenderer key={active.id} content={active.html} />}
              {activeType === 'markdown' && (
                <MarkdownRenderer
                  key={frameKey}
                  content={active.html}
                  frameKey={frameKey}
                  onLoad={() => setPreviewReady(true)}
                />
              )}
              {activeType === 'pdf' && (
                <div
                  key={active.id}
                  className="flex items-center justify-center h-full"
                  style={{ color: 'var(--c-text-4)' }}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-4">&#128196;</div>
                    <div className="text-sm mb-2">PDF Preview</div>
                    <div className="text-xs mb-4" style={{ color: 'var(--c-text-5)' }}>
                      PDF files open best in a dedicated viewer.
                    </div>
                    <button
                      onClick={openInNewTab}
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--c-accent)', color: 'white' }}
                    >
                      Open PDF
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: 'var(--c-text-4)' }}
            >
              <div className="text-center">
                <div className="text-4xl mb-4">&#128065;</div>
                <div className="text-sm mb-2">Preview</div>
                <div
                  className="text-xs"
                  style={{ color: 'var(--c-text-5)', maxWidth: 280, lineHeight: 1.6 }}
                >
                  {library.length > 0 ? (
                    'Select a preview from the library.'
                  ) : (
                    <>
                      Supports <strong>HTML</strong>, <strong>CSV</strong>, <strong>JSON</strong>,{' '}
                      <strong>TXT</strong>, and <strong>Markdown</strong>.<br />
                      Ask an agent to generate content, then click the Preview button on the code
                      block.
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
