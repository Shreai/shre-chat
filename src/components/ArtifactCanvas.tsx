/**
 * ArtifactCanvas — side panel for generated artifacts (code, HTML, diagrams, tables).
 * Replaces basic PreviewPanel with full canvas capabilities:
 * - Code with syntax highlighting + copy/download
 * - Live HTML preview in sandboxed iframe
 * - Mermaid diagram rendering
 * - SVG display
 * - Table with CSV export
 * - JSON tree viewer
 */
import { useState, useMemo, useCallback, lazy, Suspense, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { copyToClipboard } from '../chat-utils';
import { ViewErrorBoundary } from '../ViewErrorBoundary';

const JsonViewer = lazy(() => import('./JsonViewer'));

export type ArtifactType =
  | 'code'
  | 'html'
  | 'svg'
  | 'mermaid'
  | 'json'
  | 'table'
  | 'chart'
  | 'text';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  messageIndex?: number;
}

interface Props {
  artifact: Artifact | null;
  onClose: () => void;
}

// Detect artifact type from code fence language
export function detectArtifactType(lang: string, content: string): ArtifactType {
  const l = lang.toLowerCase();
  if (l === 'html' || l === 'htm') return 'html';
  if (l === 'svg') return 'svg';
  if (l === 'mermaid') return 'mermaid';
  if (l === 'json') return 'json';
  if (l === 'csv' || l === 'tsv') return 'table';
  if (content.trim().startsWith('<svg')) return 'svg';
  if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) return 'html';
  return 'code';
}

// Extract artifacts from message content (code fences)
export function extractArtifacts(content: string, messageIndex: number): Artifact[] {
  const artifacts: Artifact[] = [];
  const fenceRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  let idx = 0;

  while ((match = fenceRegex.exec(content)) !== null) {
    const lang = match[1] ?? 'text';
    const code = match[2].trim();
    if (code.length < 20) continue; // skip tiny snippets

    const type = detectArtifactType(lang, code);
    artifacts.push({
      id: `artifact-${messageIndex}-${idx++}`,
      type,
      title: `${lang.toUpperCase()} ${type === 'code' ? 'Code' : type === 'html' ? 'Preview' : type === 'mermaid' ? 'Diagram' : 'Content'}`,
      content: code,
      language: lang,
      messageIndex,
    });
  }

  return artifacts;
}

export function ArtifactCanvas({ artifact, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    await copyToClipboard(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact]);

  const handleDownload = useCallback(() => {
    if (!artifact) return;
    const ext =
      artifact.language ??
      (artifact.type === 'html' ? 'html' : artifact.type === 'svg' ? 'svg' : 'txt');
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  if (!artifact) return null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-bg-1, #0a0a0a)',
        borderLeft: '1px solid var(--c-border, #1f2937)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--c-border, #1f2937)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TypeIcon type={artifact.type} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1, #f9fafb)' }}>
            {artifact.title}
          </span>
          {artifact.language && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                fontWeight: 600,
              }}
            >
              {artifact.language}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconButton
            icon="copy"
            title={copied ? 'Copied!' : 'Copy'}
            onClick={handleCopy}
            active={copied}
          />
          <IconButton icon="download" title="Download" onClick={handleDownload} />
          <IconButton icon="close" title="Close" onClick={onClose} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
        <ViewErrorBoundary viewName="Artifact">
          <Suspense fallback={<LoadingFallback />}>
            <ArtifactRenderer artifact={artifact} />
          </Suspense>
        </ViewErrorBoundary>
      </div>
    </div>
  );
}

function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case 'html':
      return <HtmlPreview content={artifact.content} />;
    case 'svg':
      return (
        <div
          style={{
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
          }}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(artifact.content, {
              USE_PROFILES: { svg: true, svgFilters: true },
            }),
          }}
        />
      );
    case 'mermaid':
      return <MermaidPreview content={artifact.content} />;
    case 'json':
      return (
        <div style={{ padding: 16 }}>
          <JsonViewer data={JSON.parse(artifact.content)} />
        </div>
      );
    case 'table':
      return <CsvTable content={artifact.content} />;
    case 'code':
    default:
      return <CodePreview content={artifact.content} language={artifact.language} />;
  }
}

function HtmlPreview({ content }: { content: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-height') setHeight(Math.min(e.data.height + 20, 800));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
  });
  const srcdoc = `<!DOCTYPE html>
<html><head><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;padding:16px;overflow:auto}
a{color:#58a6ff}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border:1px solid #30363d}
</style></head><body>${sanitizedContent}<script>
const h=()=>parent.postMessage({type:'iframe-height',height:document.body.scrollHeight},'*');
h();new MutationObserver(h).observe(document.body,{childList:true,subtree:true});
</script></body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height, border: 'none', background: '#0d1117' }}
    />
  );
}

function MermaidPreview({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Use Mermaid CDN via iframe for isolation
    const html = `<!DOCTYPE html>
<html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>body{background:#0d1117;padding:16px;display:flex;justify-content:center}</style>
</head><body>
<pre class="mermaid">${content.replace(/</g, '&lt;')}</pre>
<script>
mermaid.initialize({theme:'dark',startOnLoad:true});
mermaid.run().then(()=>{
  parent.postMessage({type:'mermaid-svg',svg:document.querySelector('.mermaid').innerHTML},'*');
}).catch(e=>parent.postMessage({type:'mermaid-error',error:e.message},'*'));
<\/script></body></html>`;

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'mermaid-svg') setSvg(e.data.svg);
      if (e.data?.type === 'mermaid-error') setError(e.data.error);
    };
    window.addEventListener('message', handler);

    if (containerRef.current) {
      const iframe = document.createElement('iframe');
      iframe.sandbox.add('allow-scripts');
      iframe.style.cssText = 'width:100%;min-height:300px;border:none;background:#0d1117';
      iframe.srcdoc = html;
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(iframe);
    }

    return () => window.removeEventListener('message', handler);
  }, [content]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Mermaid error: {error}</div>
    );
  }

  return <div ref={containerRef} style={{ padding: 16 }} />;
}

function CodePreview({ content, language }: { content: string; language?: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 16,
        fontSize: 13,
        lineHeight: 1.6,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        color: '#e6edf3',
        overflow: 'auto',
        whiteSpace: 'pre',
        tabSize: 2,
      }}
    >
      <code>{content}</code>
    </pre>
  );
}

function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => {
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(',').map((c) => c.trim()));
  }, [content]);

  if (rows.length === 0) return null;
  const headers = rows[0];
  const data = rows.slice(1);

  const handleExport = () => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleExport}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            background: 'rgba(99,102,241,0.15)',
            color: '#818cf8',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Export CSV
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: '6px 10px',
                  borderBottom: '2px solid #30363d',
                  textAlign: 'left',
                  color: '#9ca3af',
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '5px 10px', color: '#e6edf3' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeIcon({ type }: { type: ArtifactType }) {
  const icons: Record<string, string> = {
    code: '</>',
    html: '</>',
    svg: 'SVG',
    mermaid: 'MMD',
    json: '{}',
    table: 'CSV',
    chart: 'CH',
    text: 'TXT',
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 5px',
        borderRadius: 3,
        background: 'rgba(99,102,241,0.15)',
        color: '#818cf8',
      }}
    >
      {icons[type] ?? type}
    </span>
  );
}

function IconButton({
  icon,
  title,
  onClick,
  active,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  const paths: Record<string, string> = {
    copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    close: 'M18 6L6 18M6 6l12 12',
  };
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
        color: active ? '#22c55e' : 'var(--c-text-3)',
        transition: 'all 0.15s',
      }}
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
        <path d={paths[icon]} />
      </svg>
    </button>
  );
}

function LoadingFallback() {
  return (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-text-3)' }}>Loading...</div>
  );
}
