import React, { useState, useCallback, useMemo } from 'react';
import type { MessageAttachment } from '../../router-client';

// ── Helpers ────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function parseCSVLine(line: string): string[] {
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
}

const MAX_INLINE_ROWS = 15;

// ── CSV Table ──────────────────────────────────────────────────────

function CsvTable({ content }: { content: string }) {
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length < 2) {
    return (
      <pre style={{ color: 'var(--c-text-3)', fontSize: 12, padding: 8, margin: 0 }}>{content}</pre>
    );
  }

  const headers = parseCSVLine(lines[0]);
  const allRows = lines.slice(1).map((l) => parseCSVLine(l));
  const truncated = allRows.length > MAX_INLINE_ROWS;
  const visible = truncated ? allRows.slice(0, MAX_INLINE_ROWS) : allRows;
  const isNum = (v: string) => v !== '' && !isNaN(Number(v));

  return (
    <div style={{ overflowX: 'auto', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: headers.length * 90 }}>
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                top: 0,
                padding: '5px 8px',
                background: 'rgba(0,0,0,0.4)',
                color: 'var(--c-info-soft, #60a5fa)',
                borderBottom: '1px solid var(--c-border-2)',
                textAlign: 'right',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                width: 32,
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
                  padding: '5px 8px',
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
              <td
                style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-5)',
                  textAlign: 'right',
                  fontSize: 10,
                }}
              >
                {i + 1}
              </td>
              {headers.map((_, j) => (
                <td
                  key={j}
                  style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid var(--c-border-2)',
                    textAlign: isNum(row[j] || '') ? 'right' : 'left',
                    color: 'var(--c-text-2)',
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
      <div style={{ padding: '6px 8px', color: 'var(--c-text-4)', fontSize: 11 }}>
        {allRows.length} rows x {headers.length} columns
        {truncated && (
          <span style={{ fontStyle: 'italic', marginLeft: 8 }}>
            ({allRows.length - MAX_INLINE_ROWS} more rows)
          </span>
        )}
      </div>
    </div>
  );
}

// ── PDF Embed ──────────────────────────────────────────────────────

function PdfEmbed({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [showEmbed, setShowEmbed] = useState(true);

  if (!showEmbed) {
    return (
      <div style={{ textAlign: 'center', padding: 12 }}>
        <button
          onClick={() => setShowEmbed(true)}
          style={{
            background: 'rgba(239,68,68,0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Show PDF
        </button>
      </div>
    );
  }

  return (
    <iframe
      src={dataUrl}
      title={name}
      style={{
        width: '100%',
        height: 400,
        border: 'none',
        borderRadius: 6,
        background: '#525659',
      }}
    />
  );
}

// ── Single Attachment Card ─────────────────────────────────────────

function AttachmentCard({
  attachment,
  onImageClick,
}: {
  attachment: MessageAttachment;
  onImageClick?: (src: string) => void;
}) {
  const ext = getFileExt(attachment.name);
  const isPdf = attachment.type === 'application/pdf' || ext === 'pdf';
  const isCsv = attachment.type === 'text/csv' || ext === 'csv';
  const isImage = attachment.type.startsWith('image/');
  const isVideo = attachment.type.startsWith('video/');
  const isDocx =
    attachment.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx';
  const isXlsx =
    attachment.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ext === 'xlsx' ||
    ext === 'xls';
  const isPptx =
    attachment.type ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === 'pptx';
  const isOfficeDoc = isDocx || isXlsx || isPptx;
  const [expanded, setExpanded] = useState(isPdf || isCsv);

  // Decode base64 text content for CSV
  const textContent = useMemo(() => {
    if (!isCsv) return '';
    try {
      const base64 = attachment.dataUrl.split(',')[1];
      if (!base64) return '';
      return atob(base64);
    } catch {
      return '';
    }
  }, [attachment.dataUrl, isCsv]);

  const handleDownload = useCallback(() => {
    const a = document.createElement('a');
    a.href = attachment.dataUrl;
    a.download = attachment.name;
    a.click();
  }, [attachment]);

  // Icon + color per file type
  const typeConfig = isPdf
    ? { icon: '\u{1F4C4}', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'PDF' }
    : isCsv
      ? { icon: '\u{1F4CB}', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'CSV' }
      : isImage
        ? { icon: '\u{1F5BC}', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', label: 'IMG' }
        : isVideo
          ? { icon: '\u{1F3AC}', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'VIDEO' }
          : isDocx
            ? { icon: '\u{1F4DD}', color: '#2563eb', bg: 'rgba(37,99,235,0.12)', label: 'DOCX' }
            : isXlsx
              ? { icon: '\u{1F4CA}', color: '#16a34a', bg: 'rgba(22,163,74,0.12)', label: 'XLSX' }
              : isPptx
                ? { icon: '\u{1F4FD}', color: '#ea580c', bg: 'rgba(234,88,12,0.12)', label: 'PPTX' }
                : {
                    icon: '\u{1F4CE}',
                    color: 'var(--c-text-3)',
                    bg: 'var(--c-bg-3)',
                    label: ext.toUpperCase() || 'FILE',
                  };

  // Video: inline player
  if (isVideo) {
    return (
      <div
        style={{
          borderRadius: 10,
          border: '1px solid var(--c-border-2)',
          background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: typeConfig.bg,
            borderBottom: '1px solid var(--c-border-2)',
          }}
        >
          <span style={{ fontSize: 14 }}>{typeConfig.icon}</span>
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
            {attachment.name}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(245,158,11,0.2)',
              color: '#f59e0b',
            }}
          >
            Gemini Vision
          </span>
          {attachment.size && (
            <span style={{ fontSize: 10, color: 'var(--c-text-5)' }}>
              {formatFileSize(attachment.size)}
            </span>
          )}
          <button
            onClick={handleDownload}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--c-text-4)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '2px 4px',
            }}
            title="Download"
          >
            &#8681;
          </button>
        </div>
        <video
          src={attachment.dataUrl}
          controls
          style={{ maxWidth: 320, width: '100%', display: 'block' }}
        />
      </div>
    );
  }

  // Images render as thumbnails with vision indicator
  if (isImage) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          onClick={() => onImageClick?.(attachment.dataUrl)}
          style={{
            maxWidth: 240,
            maxHeight: 180,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'block',
            objectFit: 'cover',
            transition: 'opacity 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
            e.currentTarget.style.boxShadow = '0 0 0 2px var(--c-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        {/* Vision indicator badge */}
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(139, 92, 246, 0.85)',
            color: '#fff',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Vision
        </span>
        {/* File name + size below image */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 2px',
            fontSize: 10,
            color: 'var(--c-text-3)',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
          >
            {attachment.name}
          </span>
          {attachment.size && <span>{formatFileSize(attachment.size)}</span>}
        </div>
      </div>
    );
  }

  // PDF / CSV / other files: card with inline preview
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: typeConfig.bg,
          borderBottom: '1px solid var(--c-border-2)',
          cursor: isPdf || isCsv ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (isPdf || isCsv) setExpanded((v) => !v);
        }}
      >
        <span style={{ fontSize: 14 }}>{typeConfig.icon}</span>
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
          {attachment.name}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 4,
            background: typeConfig.bg,
            color: typeConfig.color,
          }}
        >
          {typeConfig.label}
        </span>
        {attachment.size && (
          <span style={{ fontSize: 10, color: 'var(--c-text-5)' }}>
            {formatFileSize(attachment.size)}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--c-text-4)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '2px 4px',
          }}
          title="Download"
        >
          &#8681;
        </button>
        {(isPdf || isCsv) && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--c-text-4)"
            strokeWidth="2"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        )}
      </div>

      {/* Inline preview */}
      {expanded && isPdf && <PdfEmbed dataUrl={attachment.dataUrl} name={attachment.name} />}
      {expanded && isCsv && textContent && (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <CsvTable content={textContent} />
        </div>
      )}
      {isOfficeDoc && (
        <div
          style={{
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--c-text-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(34,197,94,0.15)',
              color: '#22c55e',
            }}
          >
            Parsed for AI
          </span>
          Content extracted and sent to the model
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────

export function FileAttachmentPreview({
  attachments,
  onImageClick,
}: {
  attachments: MessageAttachment[];
  onImageClick?: (src: string) => void;
}) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
      {attachments.map((att, i) => (
        <AttachmentCard key={`${att.name}-${i}`} attachment={att} onImageClick={onImageClick} />
      ))}
    </div>
  );
}
