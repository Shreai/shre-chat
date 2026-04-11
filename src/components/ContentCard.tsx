import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { copyToClipboard } from '../chat-utils';

const JsonViewer = lazy(() => import('./JsonViewer'));
const ChartRenderer = lazy(() => import('./ChartRenderer'));

// ── Types ───────────────────────────────────────────────────────────

interface ContentCardProps {
  type: string;
  content: string;
  title?: string;
  chartType?: string;
  onExpand?: (content: string, type: string, title?: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  html: '</>',
  json: '{}',
  chart: '\u{1F4CA}',
  table: '\u{1F4CB}',
  pdf: '\u{1F4C4}',
};

const TYPE_LABELS: Record<string, string> = {
  html: 'HTML',
  json: 'JSON',
  chart: 'Chart',
  table: 'Table',
  pdf: 'PDF',
};

const INLINE_MAX_ROWS = 20;
const IFRAME_MAX_H = 280;
const CARD_MAX_H = 300;

// ── Sub-renderers ───────────────────────────────────────────────────

function HtmlPreview({ content }: { content: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
    const handler = (e: MessageEvent) => {
      if (
        e.origin === window.location.origin &&
        e.data?.type === 'iframe-height' &&
        typeof e.data.height === 'number'
      ) {
        setHeight(Math.min(e.data.height + 4, IFRAME_MAX_H));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-same-origin"
      style={{ border: 'none', width: '100%', height, display: 'block', borderRadius: 6 }}
      title="HTML preview"
    />
  );
}

function TablePreview({ content }: { content: string }) {
  let rows: Record<string, unknown>[] = [];
  let parseError = false;

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) rows = parsed;
    else parseError = true;
  } catch {
    // Try CSV fallback — handles quoted fields with commas
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length >= 2) {
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
      rows = lines.slice(1).map((line) => {
        const vals = parseCSVLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => (obj[h] = vals[i] ?? ''));
        return obj;
      });
    } else {
      parseError = true;
    }
  }

  if (parseError || rows.length === 0 || !rows[0]) {
    return (
      <pre style={{ color: 'var(--c-text-3)', fontSize: 12, padding: 8 }}>
        Unable to parse table data
      </pre>
    );
  }

  const headers = Object.keys(rows[0]);
  const truncated = rows.length > INLINE_MAX_ROWS;
  const visible = truncated ? rows.slice(0, INLINE_MAX_ROWS) : rows;

  const isNumeric = (v: unknown) =>
    typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));

  return (
    <div style={{ overflowX: 'auto', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: headers.length * 100 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  position: 'sticky',
                  top: 0,
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'var(--c-text-2)',
                  borderBottom: '1px solid var(--c-border-2)',
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
          {visible.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
            >
              {headers.map((h) => (
                <td
                  key={h}
                  style={{
                    padding: '5px 10px',
                    borderBottom: '1px solid var(--c-border-2)',
                    textAlign: isNumeric(row[h]) ? 'right' : 'left',
                    color: 'var(--c-text-2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {String(row[h] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div
          style={{
            padding: '8px 10px',
            color: 'var(--c-text-3)',
            fontSize: 11,
            fontStyle: 'italic',
          }}
        >
          {rows.length - INLINE_MAX_ROWS} more rows...
        </div>
      )}
    </div>
  );
}

function JsonPreview({ content }: { content: string }) {
  let parsed: unknown;
  let error = false;
  try {
    parsed = JSON.parse(content);
  } catch {
    error = true;
  }

  if (error) {
    return (
      <div style={{ padding: 8 }}>
        <div style={{ color: '#f85149', fontSize: 11, marginBottom: 4 }}>JSON parse error</div>
        <pre
          style={{
            color: 'var(--c-text-3)',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {content}
        </pre>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div style={{ padding: 12, color: 'var(--c-text-3)', fontSize: 12 }}>Loading...</div>
      }
    >
      <JsonViewer data={parsed} />
    </Suspense>
  );
}

function ChartPreview({ content, chartType }: { content: string; chartType?: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return <pre style={{ color: '#f85149', fontSize: 12, padding: 8 }}>Invalid chart data</pre>;
  }

  // Normalize simplified format: { labels, values, title } → ChartData { type, labels, datasets, title }
  const raw = parsed as Record<string, unknown>;
  const chartData: import('./ChartRenderer').ChartData = {
    type:
      (raw.type as 'bar' | 'line' | 'pie' | 'area') ||
      (chartType as 'bar' | 'line' | 'pie' | 'area') ||
      'bar',
    title: raw.title as string | undefined,
    labels: (raw.labels as string[]) || [],
    datasets: Array.isArray(raw.datasets)
      ? raw.datasets
      : Array.isArray(raw.values)
        ? [{ data: raw.values as number[], label: raw.label as string | undefined }]
        : [{ data: [] }],
    options: {
      showValues: true,
      currency: ((raw.labels as string[]) || []).some(
        () =>
          Array.isArray(raw.values) &&
          (raw.values as number[]).some((v) => typeof v === 'number' && v > 100),
      ),
      ...(typeof raw.options === 'object' && raw.options
        ? (raw.options as Record<string, unknown>)
        : {}),
    },
  };

  return (
    <Suspense
      fallback={
        <div style={{ padding: 12, color: 'var(--c-text-3)', fontSize: 12 }}>Loading chart...</div>
      }
    >
      <ChartRenderer data={chartData} />
    </Suspense>
  );
}

function PdfPreview({ content }: { content: string }) {
  // content can be a base64 data URL or a URL to a PDF
  const src = content.trim().startsWith('data:') ? content.trim() : content.trim();
  const isDataUrl = src.startsWith('data:');
  const isUrl = src.startsWith('http://') || src.startsWith('https://') || isDataUrl;

  if (!isUrl) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-text-4)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u{1F4C4}'}</div>
        <div style={{ fontSize: 12, marginBottom: 8 }}>PDF content detected</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-5)' }}>
          Use the Preview tab for full viewing
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title="PDF preview"
      style={{
        width: '100%',
        height: 280,
        border: 'none',
        borderRadius: 6,
        background: '#525659',
      }}
    />
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function ContentCard({
  type,
  content,
  title,
  chartType,
  onExpand,
}: ContentCardProps) {
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

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        border: `1px solid ${hovered ? 'var(--c-border-1, rgba(255,255,255,0.15))' : 'var(--c-border-2)'}`,
        background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
        marginTop: 8,
        marginBottom: 4,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--c-border-2)',
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        <span style={{ fontSize: 13, opacity: 0.6, fontFamily: 'monospace', lineHeight: 1 }}>
          {TYPE_ICONS[type]}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--c-text-2)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayTitle}
        </span>
        {onExpand && (
          <button
            onClick={handleExpand}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--c-text-3)',
              cursor: 'pointer',
              fontSize: 14,
              padding: '2px 4px',
              lineHeight: 1,
            }}
            title="Open in new tab"
            aria-label="Expand content"
          >
            &#x2922;
          </button>
        )}
      </div>

      {/* Content preview */}
      <div style={{ maxHeight: CARD_MAX_H, overflow: 'hidden', position: 'relative' }}>
        <div style={{ padding: type === 'html' ? 0 : 4 }}>
          {type === 'html' && <HtmlPreview content={content} />}
          {type === 'json' && <JsonPreview content={content} />}
          {type === 'chart' && <ChartPreview content={content} chartType={chartType} />}
          {type === 'table' && <TablePreview content={content} />}
          {type === 'pdf' && <PdfPreview content={content} />}
        </div>
        {/* Fade gradient at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: 'linear-gradient(transparent, var(--c-bg-card, rgba(13,17,23,0.95)))',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Action bar — visible on hover */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '6px 12px',
          borderTop: '1px solid var(--c-border-2)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          background: 'rgba(0,0,0,0.1)',
        }}
      >
        <button
          onClick={handleCopy}
          style={{
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
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        {onExpand && (
          <button
            onClick={handleExpand}
            style={{
              background: 'var(--c-bg-hover, rgba(255,255,255,0.06))',
              color: 'var(--c-text-3)',
              border: '1px solid var(--c-border-2)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Expand &#x2922;
          </button>
        )}
      </div>
    </div>
  );
}
