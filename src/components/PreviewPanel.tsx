import React from 'react';
import { ViewErrorBoundary } from '../ViewErrorBoundary';
import ContentCard from './ContentCard';

interface PreviewPanelProps {
  content: { content: string; type: string; title?: string };
  onClose: () => void;
}

export function PreviewPanel({ content, onClose }: PreviewPanelProps) {
  const openInNewTab = () => {
    if (!content?.content) return;
    const type = content.type || 'html';
    if (type === 'html' || type === 'markdown') {
      const w = window.open('', '_blank');
      if (w) {
        const html =
          type === 'markdown'
            ? `<!DOCTYPE html><html><body>${content.content}</body></html>`
            : content.content;
        w.document.write(html);
        w.document.close();
      }
      return;
    }

    const blob = new Blob([content.content], {
      type: type === 'json' ? 'application/json' : type === 'csv' ? 'text/csv' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const downloadFile = () => {
    if (!content?.content) return;
    const type = content.type || 'txt';
    const extMap: Record<string, string> = {
      html: 'html',
      markdown: 'md',
      csv: 'csv',
      json: 'json',
      txt: 'txt',
      chart: 'json',
      table: 'csv',
      pdf: 'pdf',
    };
    const blob = new Blob([content.content], {
      type:
        type === 'html'
          ? 'text/html'
          : type === 'markdown'
            ? 'text/markdown'
            : type === 'csv'
              ? 'text/csv'
              : type === 'json'
                ? 'application/json'
                : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${content.title || 'preview'}.${extMap[type] || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg-1)' }}>
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {content.type === 'chart'
              ? '\u{1F4CA}'
              : content.type === 'json'
                ? '{}'
                : content.type === 'table'
                  ? '\u{1F4CB}'
                  : '</>'}
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--c-text-1)' }}>
            {content.title || `${content.type.toUpperCase()} Preview`}
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-4)' }}
          aria-label="Close preview"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <ViewErrorBoundary viewName="Content Preview">
          <ContentCard type={content.type} content={content.content} title={content.title} />
        </ViewErrorBoundary>
      </div>
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderTop: '1px solid var(--c-border-2)' }}
      >
        <button
          onClick={openInNewTab}
          className="px-2 py-1 rounded text-xs hover:opacity-80"
          style={{
            background: 'var(--c-bg-2)',
            color: 'var(--c-text-2)',
            border: '1px solid var(--c-border-2)',
          }}
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
        >
          Download
        </button>
        <button onClick={onClose} className="px-2 py-1 rounded text-xs" style={{ color: 'var(--c-text-4)' }}>
          Clear
        </button>
      </div>
    </div>
  );
}
