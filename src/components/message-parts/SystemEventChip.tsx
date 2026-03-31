import React, { useState, useEffect, memo } from 'react';
import type { ChatMessage } from '../../openclaw';
import { classifySystemEvent, lightweightMarkdown } from '../../chat-utils';
import { PlanChecklist } from './PlanChecklist';

// ── Image Lightbox ──
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: '50%',
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--c-on-accent)',
          fontSize: 20,
          lineHeight: 1,
          backdropFilter: 'blur(8px)',
        }}
        aria-label="Close lightbox"
      >
        ✕
      </button>
      <img
        src={src}
        alt="Lightbox preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: 8,
          cursor: 'default',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}

// ── StableMarkdownBlock ──
export const StableMarkdownBlock = memo(function StableMarkdownBlock({ text }: { text: string }) {
  if (!text) return null;
  return (
    <pre
      className="prose-chat whitespace-pre-wrap m-0 p-0 bg-transparent font-[inherit] text-[inherit] leading-relaxed"
      style={{ fontFamily: 'inherit' }}
      dangerouslySetInnerHTML={{ __html: lightweightMarkdown(text) }}
    />
  );
});

// ── SystemEventChip ──
export function SystemEventChip({
  message,
  timestamp,
}: {
  message: ChatMessage;
  timestamp?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = message.content.trim().replace(/^\[system\]\s*/i, '');

  // If this is a project_pending message, render the interactive PlanChecklist instead
  if (content.includes('[project_pending]')) {
    const projectIdMatch = content.match(/Project ID:\s*(\S+)/);
    const subtaskMatch = content.match(/(\d+)\s*tasks?\b/);
    const projectId = projectIdMatch?.[1] || '';
    const subtaskCount = subtaskMatch ? parseInt(subtaskMatch[1], 10) : 0;

    if (projectId) {
      return (
        <PlanChecklist projectId={projectId} subtaskCount={subtaskCount} timestamp={timestamp} />
      );
    }
  }

  const chips: { icon: string; label: string; color: string }[] = [];
  const seen = new Set<string>();

  const main = classifySystemEvent(content);
  if (!seen.has(main.label)) {
    chips.push(main);
    seen.add(main.label);
  }

  if (content.includes('compact') && !seen.has('Context compacted')) {
    chips.push({ icon: '\u27F3', label: 'Context compacted', color: 'var(--c-orange)' });
    seen.add('Context compacted');
  }
  if (content.includes('Session Startup') && !seen.has('Session refresh')) {
    chips.push({ icon: '\uD83D\uDD04', label: 'Session refresh', color: 'var(--c-info-soft)' });
    seen.add('Session refresh');
  }
  if (content.includes('AGENTS.md') && !seen.has('Agent startup')) {
    chips.push({ icon: '\uD83D\uDCCB', label: 'Agent startup', color: 'var(--c-purple)' });
    seen.add('Agent startup');
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-1.5 py-1 px-2">
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
        {chips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-all hover:opacity-80"
            style={{
              background: 'var(--c-bg-3)',
              color: chip.color,
              border: '1px solid var(--c-border-2)',
              cursor: 'pointer',
            }}
            title="Click to view details"
          >
            <span>{chip.icon}</span>
            <span>{chip.label}</span>
          </button>
        ))}
        {timestamp && (
          <span className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
            {timestamp}
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: 'var(--c-border-2)' }} />
      </div>

      {expanded && (
        <div
          className="mx-4 mb-2 rounded-lg overflow-hidden text-[11px] leading-relaxed"
          style={{
            background: 'var(--c-bg-3)',
            border: '1px solid var(--c-border-2)',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ borderBottom: '1px solid var(--c-border-2)' }}
          >
            <span className="font-medium" style={{ color: 'var(--c-text-3)' }}>
              System Event
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{ color: 'var(--c-text-4)' }}
            >
              ✕
            </button>
          </div>
          <pre
            className="px-3 py-2 whitespace-pre-wrap break-words"
            style={{ color: 'var(--c-text-4)', fontFamily: 'inherit', margin: 0 }}
          >
            {content.length > 1000 ? content.slice(0, 1000) + '\n... (truncated)' : content}
          </pre>
        </div>
      )}
    </div>
  );
}
