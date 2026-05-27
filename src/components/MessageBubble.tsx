import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  lazy,
  Suspense,
  useMemo,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
const ContentCard = lazy(() => import('./ContentCard'));
const MibWidgetBlock = lazy(() => import('./MibWidgetBlock'));
const DataCard = lazy(() => import('./DataCard'));
import type { ChatMessage } from '../router-client';
import type { ProcessRun } from './process-bar/types';
import { ChatMessageTools, type ToolCall } from './ChatMessageTools';
import type { ClaudeToolEvent } from './ClaudeToolView';
import {
  formatTime,
  estimateTokens,
  formatTokenCount,
  stripThinkBlocks,
  extractActionTags,
  lightweightMarkdown,
  splitStableAndPending,
  highlightSearchText,
  REACTION_EMOJIS,
} from '../chat-utils';

// ── Extracted sub-components ──
import { TaskBadge } from './message-parts/TaskBadge';
import { HtmlCodeBlock, TableWithExport } from './message-parts/CodeBlocks';
import { CopyButton, MessageActions, ActionTagChips } from './message-parts/MessageActions';
import { StableMarkdownBlock } from './message-parts/SystemEventChip';
import { FileAttachmentPreview } from './message-parts/FileAttachmentPreview';
import { MessageTraceDrawer } from './message-parts/MessageTraceDrawer';
import { CitationLinks } from './message-parts/CitationLinks';
import { usePreferences } from '../preferences-store';

// Re-export extracted components so existing imports from MessageBubble still work
export { Lightbox, StableMarkdownBlock, SystemEventChip } from './message-parts/SystemEventChip';
export { ToolExecutionChip, ToolExecutionGroup } from './message-parts/ToolExecutionChip';
export type { ToolExecStep } from './message-parts/ToolExecutionChip';

// ── MessageBubble ───────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  agentName,
  agentEmoji,
  userName,
  onRunCommand,
  onFeedback,
  editing,
  editText,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEdit,
  searchHighlight,
  isCurrentSearchHit,
  onImageClick,
  compact,
  onRegenerate,
  selected,
  onAnnotate,
  onBranch,
  onReaction,
  onReply,
  replyPreview,
  onReplyClick,
  processRun,
  onRetry,
  onContentExpand,
  isBookmarked,
  onToggleBookmark,
  versionInfo,
}: {
  message: ChatMessage;
  streaming?: boolean;
  agentName: string;
  agentEmoji: string;
  userName?: string;
  onRunCommand?: (cmd: string) => void;
  onFeedback?: (fb: 'like' | 'dislike') => void;
  editing?: boolean;
  editText?: string;
  onEditStart?: () => void;
  onEditChange?: (text: string) => void;
  onEditCancel?: () => void;
  onEdit?: (newText: string) => void;
  searchHighlight?: string;
  isCurrentSearchHit?: boolean;
  onImageClick?: (src: string) => void;
  compact?: boolean;
  onRegenerate?: () => void;
  selected?: boolean;
  onAnnotate?: (text: string) => void;
  onBranch?: () => void;
  onReaction?: (emoji: string) => void;
  onReply?: () => void;
  replyPreview?: string | null;
  onReplyClick?: () => void;
  processRun?: ProcessRun | null;
  onRetry?: () => void;
  onContentExpand?: (content: string, type: string, title?: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  versionInfo?: { index: number; total: number } | null;
}) {
  const isUser = message.role === 'user';
  const name = isUser ? userName || 'You' : agentName;
  const time = formatTime(message.timestamp);
  const stripped = isUser ? message.content : stripThinkBlocks(message.content);
  const { cleanText: displayContent, tags: actionTags } = isUser
    ? { cleanText: stripped, tags: [] }
    : extractActionTags(stripped);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactionPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionPickerOpen]);

  const [routeExpanded, setRouteExpanded] = useState(false);
  const [annotationEditing, setAnnotationEditing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(message.annotation || '');

  const traceEnabled = usePreferences((s) => s.traceEnabled);

  // CLI Ledger: summary/full toggle for CLI responses
  const isCliResponse =
    !isUser && (message.meta?.route === 'cli' || message.meta?.route === 'claude-cli');
  const [summaryViewMode, setSummaryViewMode] = useState<'full' | 'summary'>('full');
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    if (summaryText) {
      setSummaryViewMode('summary');
      return;
    }
    setSummaryLoading(true);
    try {
      const ledgerSessionId = message.meta?.ledgerSessionId;
      if (!ledgerSessionId) {
        // Fallback: generate summary client-side (first 500 chars)
        setSummaryText(displayContent.slice(0, 500) + (displayContent.length > 500 ? '...' : ''));
        setSummaryViewMode('summary');
        return;
      }
      const res = await fetch(`/api/cli/sessions/${ledgerSessionId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responseId: message.id || 'unknown', content: displayContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryText(data.summary);
        setSummaryViewMode('summary');
      }
    } catch {
      setSummaryText(displayContent.slice(0, 500) + '...');
      setSummaryViewMode('summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [displayContent, message.meta?.ledgerSessionId, message.id, summaryText]);

  // Use summary text when in summary mode, otherwise full content
  const effectiveContent =
    isCliResponse && summaryViewMode === 'summary' && summaryText ? summaryText : displayContent;

  const meta = message.meta;
  const shortModel = meta?.model
    ? meta.model
        .replace(/^.*\//, '')
        .replace(/^claude-/, '')
        .replace(/-\d{8}$/, '')
    : null;

  // Swipe-to-reply on mobile
  const [swipeX, setSwipeX] = useState(0);
  const swipeTouchRef = useRef<{ x: number; y: number; started: boolean } | null>(null);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, started: false };
  }, []);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current) return;
    const dx = e.touches[0].clientX - swipeTouchRef.current.x;
    const dy = Math.abs(e.touches[0].clientY - swipeTouchRef.current.y);
    if (!swipeTouchRef.current.started && dy > 20) {
      swipeTouchRef.current = null;
      setSwipeX(0);
      return;
    }
    if (dx > 10) {
      swipeTouchRef.current.started = true;
      setSwipeX(Math.min(dx * 0.4, 60));
    }
  }, []);

  const handleSwipeTouchEnd = useCallback(() => {
    if (swipeX > 40 && onReply) {
      onReply();
      if (navigator.vibrate) navigator.vibrate(30);
    }
    setSwipeX(0);
    swipeTouchRef.current = null;
  }, [swipeX, onReply]);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${compact ? 'max-w-2xl' : 'max-w-3xl'} mx-auto`}
    >
      <div
        className={`${compact ? 'max-w-[95%]' : 'max-w-[85%]'} group/msg`}
        onTouchStart={onReply ? handleSwipeTouchStart : undefined}
        onTouchMove={onReply ? handleSwipeTouchMove : undefined}
        onTouchEnd={onReply ? handleSwipeTouchEnd : undefined}
        style={{
          ...(swipeX > 0
            ? { transform: `translateX(${swipeX}px)`, transition: 'none' }
            : { transition: 'transform 0.2s ease-out, border-color 0.15s, padding-left 0.15s' }),
          borderLeft: selected ? '2px solid var(--c-accent)' : '2px solid transparent',
          paddingLeft: '8px',
          ...(selected ? { borderRadius: '2px' } : {}),
        }}
      >
        {/* Quoted reply preview */}
        {replyPreview && (
          <div
            onClick={onReplyClick}
            className="mb-1 px-2 py-1 rounded-lg text-xs truncate"
            style={{
              borderLeft: '3px solid var(--c-accent)',
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-4)',
              cursor: onReplyClick ? 'pointer' : 'default',
              maxWidth: '100%',
            }}
            title="Click to scroll to original message"
          >
            {replyPreview.length > 80 ? replyPreview.slice(0, 80) + '...' : replyPreview}
          </div>
        )}
        {/* Name + timestamp + agent badge header */}
        <div
          className={`flex items-center gap-1.5 mb-0.5 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          {!isUser && <span className="text-[11px]">{agentEmoji}</span>}
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-2)' }}>
            {name}
          </span>
          {!isUser && shortModel && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: 'var(--c-bg-3)',
                color: 'var(--c-accent)',
                border: '1px solid var(--c-border-2)',
              }}
            >
              {shortModel}
            </span>
          )}
          {!isUser && versionInfo && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: 'rgba(96,165,250,0.12)',
                color: 'var(--c-info-soft)',
                border: '1px solid var(--c-border-2)',
              }}
              title={`Response version ${versionInfo.index} of ${versionInfo.total}`}
            >
              v{versionInfo.index}/{versionInfo.total}
            </span>
          )}
          {time && (
            <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
              {time}
            </span>
          )}
          <span
            className="text-[10px] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150"
            style={{ color: 'var(--c-text-5)' }}
          >
            {formatTokenCount(estimateTokens(message.content))}
          </span>
        </div>
        <div
          className={`rounded-2xl ${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-base'} leading-relaxed select-text`}
          style={{
            background: isUser ? 'var(--c-msg-user)' : 'var(--c-msg-ai)',
            color: 'var(--c-text-1)',
            border: `1px solid ${isCurrentSearchHit ? 'var(--c-accent)' : isUser ? 'var(--c-accent-soft)' : 'var(--c-border-2)'}`,
            boxShadow: isCurrentSearchHit
              ? '0 0 0 2px var(--c-accent), 0 0 12px rgba(99,102,241,0.25)'
              : undefined,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          }}
        >
          {isUser ? (
            <div
              className="whitespace-pre-wrap break-words"
              style={editing ? { opacity: 0.5 } : undefined}
            >
              {editing && (
                <div className="text-[10px] mb-1" style={{ color: 'var(--c-accent)', opacity: 1 }}>
                  Editing below ↓
                </div>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <FileAttachmentPreview
                  attachments={message.attachments}
                  onImageClick={onImageClick}
                />
              )}
              {searchHighlight
                ? highlightSearchText(displayContent, searchHighlight)
                : displayContent}
            </div>
          ) : streaming ? (
            (() => {
              const { stable, pending } = splitStableAndPending(effectiveContent);
              return (
                <div className="prose-chat break-words">
                  <StableMarkdownBlock text={stable} />
                  {pending && (
                    <pre
                      className="prose-chat whitespace-pre-wrap m-0 p-0 bg-transparent font-[inherit] text-[inherit] leading-relaxed"
                      style={{ fontFamily: 'inherit' }}
                      dangerouslySetInnerHTML={{ __html: lightweightMarkdown(pending) }}
                    />
                  )}
                  <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse rounded-sm" />
                  <ActionTagChips tags={actionTags} />
                </div>
              );
            })()
          ) : (
            <div className="prose-chat break-words">
              <Suspense fallback={null}>
                <DataCard content={effectiveContent} />
              </Suspense>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img({ src, alt, ...props }) {
                    return (
                      <img
                        src={src}
                        alt={alt || 'Image'}
                        {...props}
                        onClick={() => src && onImageClick?.(src)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 6,
                          maxWidth: '100%',
                          height: 'auto',
                          display: 'block',
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
                    );
                  },
                  a({ href, children, node, ...props }) {
                    // Document download card for agent-generated documents
                    if (href?.includes('/v1/documents/download')) {
                      const label = String(children || 'Download Document');
                      return (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--c-border-2)',
                            background: 'var(--c-bg-card, rgba(255,255,255,0.03))',
                            cursor: 'pointer',
                            margin: '4px 0',
                          }}
                          onClick={() => window.open(href, '_blank')}
                        >
                          <span style={{ fontSize: 16 }}>{'\u{1F4C4}'}</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--c-text-2)',
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'rgba(37,99,235,0.15)',
                              color: '#3b82f6',
                            }}
                          >
                            Download
                          </span>
                        </div>
                      );
                    }
                    return (
                      <>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--c-accent)' }}
                          {...props}
                        >
                          {children}
                        </a>
                      </>
                    );
                  },
                  table({ children, node, ...props }) {
                    return <TableWithExport {...props}>{children}</TableWithExport>;
                  },
                  pre({ children }) {
                    return <>{children}</>;
                  },
                  code({ className, children, ...props }) {
                    const lang = className?.replace('language-', '') || '';
                    const codeText = String(children).replace(/\n$/, '');
                    const isBlock = Boolean(className) || codeText.includes('\n');

                    if (!isBlock) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    if (lang === 'mib-widget') {
                      try {
                        const parsed = JSON.parse(codeText.trim());
                        if (parsed && typeof parsed === 'object' && parsed.type) {
                          return (
                            <Suspense
                              fallback={
                                <div style={{ padding: 8, color: 'var(--c-text-4)', fontSize: 12 }}>
                                  Loading widget...
                                </div>
                              }
                            >
                              <MibWidgetBlock block={parsed} />
                            </Suspense>
                          );
                        }
                      } catch (err) {
                        console.debug('widget JSON parse', err);
                      }
                    }

                    const contentTypes: Record<
                      string,
                      'html' | 'json' | 'chart' | 'table' | 'pdf'
                    > = {
                      'html:preview': 'html',
                      'html:embed': 'html',
                      'json:viewer': 'json',
                      'json:preview': 'json',
                      'chart:bar': 'chart',
                      'chart:line': 'chart',
                      'chart:pie': 'chart',
                      'chart:area': 'chart',
                      chart: 'chart',
                      'table:preview': 'table',
                      'table:viewer': 'table',
                      'csv:preview': 'table',
                      csv: 'table',
                      'pdf:preview': 'pdf',
                    };
                    const contentType = contentTypes[lang];
                    if (contentType) {
                      // Extract chart subtype from language tag (e.g. "chart:bar" → "bar")
                      const chartSubtype =
                        contentType === 'chart' && lang.includes(':')
                          ? lang.split(':')[1]
                          : undefined;
                      return (
                        <Suspense
                          fallback={
                            <div style={{ padding: 8, color: 'var(--c-text-4)', fontSize: 12 }}>
                              Loading preview...
                            </div>
                          }
                        >
                          <ContentCard
                            type={contentType}
                            content={codeText}
                            chartType={chartSubtype}
                            onExpand={onContentExpand}
                          />
                        </Suspense>
                      );
                    }

                    const isShell = ['bash', 'sh', 'zsh', 'shell', 'terminal', 'console'].includes(
                      lang,
                    );
                    let highlightedHtml = '';
                    try {
                      const raw =
                        lang && hljs.getLanguage(lang)
                          ? hljs.highlight(codeText, { language: lang }).value
                          : hljs.highlightAuto(codeText).value;
                      highlightedHtml = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
                    } catch (err) {
                      console.debug('syntax highlight failed', err);
                      highlightedHtml = '';
                    }

                    return (
                      <HtmlCodeBlock
                        lang={lang}
                        className={className}
                        highlightedHtml={highlightedHtml}
                        codeText={codeText}
                        isShell={isShell}
                        onRunCommand={onRunCommand}
                        props={props}
                      >
                        {children}
                      </HtmlCodeBlock>
                    );
                  },
                }}
              >
                {effectiveContent}
              </Markdown>
              <ActionTagChips tags={actionTags} />
              {!isUser && meta?.taskId && (
                <TaskBadge taskId={meta.taskId} status={meta.taskStatus} />
              )}
              {/* Claude CLI tool events */}
              {!isUser &&
                meta?.type === 'claude_cli_response' &&
                meta.claudeToolEvents &&
                (() => {
                  try {
                    const events: ClaudeToolEvent[] = JSON.parse(meta.claudeToolEvents);
                    if (events.length === 0) return null;
                    const toolCall: ToolCall = {
                      name: 'claude_cli',
                      toolEvents: events,
                      costUsd: meta.claudeCost ? parseFloat(meta.claudeCost) : undefined,
                      durationMs: meta.claudeDuration ? parseFloat(meta.claudeDuration) : undefined,
                      sessionId: meta.claudeSessionId,
                    };
                    return <ChatMessageTools tools={[toolCall]} />;
                  } catch {
                    return null;
                  }
                })()}
            </div>
          )}
          {!isUser && meta?.partial && (
            <div
              className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 rounded text-[10px] font-medium"
              style={{
                background: 'rgba(245,158,11,0.12)',
                color: 'rgb(217,119,6)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
              Response was interrupted — this is a partial reply
            </div>
          )}
        </div>
        {/* CLI Summary/Full toggle */}
        {isCliResponse && !streaming && displayContent.length > 300 && (
          <div className="flex items-center gap-1 mt-1 px-1">
            <button
              onClick={() => {
                if (summaryViewMode === 'full') {
                  loadSummary();
                } else {
                  setSummaryViewMode('full');
                }
              }}
              disabled={summaryLoading}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110"
              style={{
                background:
                  summaryViewMode === 'summary' ? 'rgba(139,92,246,0.15)' : 'rgba(107,114,128,0.1)',
                color: summaryViewMode === 'summary' ? 'rgb(167,139,250)' : 'var(--c-text-2)',
                border: `1px solid ${summaryViewMode === 'summary' ? 'rgba(139,92,246,0.25)' : 'rgba(107,114,128,0.15)'}`,
              }}
              title={summaryViewMode === 'full' ? 'Show summary' : 'Show full response'}
            >
              {summaryLoading ? (
                <span>Summarizing...</span>
              ) : summaryViewMode === 'full' ? (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M2 4h12v1H2V4zm0 3h8v1H2V7zm0 3h10v1H2v-1z" />
                  </svg>
                  Summary
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h12v1H2v-1z" />
                  </svg>
                  Full Response
                </>
              )}
            </button>
            {message.meta?.ledgerSessionId && (
              <span
                className="text-[9px]"
                style={{ color: 'var(--c-text-3)' }}
                title={`Session: ${message.meta.ledgerSessionId}`}
              >
                Ledger
              </span>
            )}
          </div>
        )}
        {/* Agent routing metadata */}
        {!isUser && !streaming && meta && shortModel && (
          <div className="flex items-center gap-1 mt-0.5 px-1">
            <button
              onClick={() => setRouteExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-all duration-150 hover:brightness-110"
              style={{
                background:
                  meta.route === 'ws'
                    ? 'rgba(99,102,241,0.12)'
                    : meta.route === 'cli' || meta.route === 'claude-cli'
                      ? 'rgba(16,185,129,0.12)'
                      : 'rgba(245,158,11,0.12)',
                color:
                  meta.route === 'ws'
                    ? 'rgb(129,140,248)'
                    : meta.route === 'cli' || meta.route === 'claude-cli'
                      ? 'rgb(52,211,153)'
                      : 'rgb(251,191,36)',
                border: `1px solid ${meta.route === 'ws' ? 'rgba(99,102,241,0.2)' : meta.route === 'cli' || meta.route === 'claude-cli' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
              }}
              title="Click to show routing details"
            >
              <span>{shortModel}</span>
              <svg
                className={`h-2 w-2 transition-transform duration-150 ${routeExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>
            {routeExpanded && (
              <div
                className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[9px]"
                style={{
                  background: 'var(--c-bg-3)',
                  color: 'var(--c-text-4)',
                  border: '1px solid var(--c-border-2)',
                }}
              >
                <span title="Route">{meta.route?.toUpperCase()}</span>
                {meta.mode && (
                  <span
                    title="Conversation mode"
                    style={{ color: 'var(--c-accent)', fontWeight: 600 }}
                  >
                    {meta.mode.toUpperCase()}
                  </span>
                )}
                {meta.ttft_ms && <span title="Time to first token">TTFT {meta.ttft_ms}ms</span>}
                {meta.total_ms && (
                  <span title="Total response time">
                    {(Number(meta.total_ms) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {/* Per-message process steps */}
        {!isUser && !streaming && processRun && processRun.steps.length > 0 && (
          <div
            className="flex items-center gap-1 mt-1.5 pt-1.5 flex-wrap"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            {processRun.steps.map((step) => {
              const icons: Record<string, string> = {
                thinking: '\u25C6',
                tool_use: '\u26A1',
                generating: '\u270E',
                compacting: '\u27F3',
                done: '\u2713',
                error: '\u2717',
              };
              const colors: Record<string, string> = {
                thinking: 'var(--c-warning-soft)',
                tool_use: 'var(--c-info-soft)',
                generating: 'var(--c-success-soft)',
                compacting: 'var(--c-orange)',
                done: 'var(--c-emerald)',
                error: 'var(--c-danger-soft)',
              };
              return (
                <span
                  key={step.id}
                  className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    color: colors[step.kind] || 'var(--c-text-4)',
                    background: 'var(--c-bg-3)',
                  }}
                  title={`${step.label}${step.toolName ? ` (${step.toolName})` : ''}${step.completedAt && step.startedAt ? ` \u2014 ${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s` : ''}`}
                >
                  <span>{icons[step.kind] || '?'}</span>
                  <span style={{ color: 'var(--c-text-4)' }}>{step.toolName || step.label}</span>
                </span>
              );
            })}
            {processRun.durationMs && (
              <span className="text-[9px] ml-auto" style={{ color: 'var(--c-text-5)' }}>
                {(processRun.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
        {/* Citations — extracted URLs and source references */}
        {!isUser && !streaming && message.content && <CitationLinks content={message.content} />}
        {/* Conversation trace drawer — shows request pipeline per message */}
        {!isUser && !streaming && traceEnabled && meta?.traceId && (
          <MessageTraceDrawer
            traceId={meta.traceId}
            traceRecord={meta.traceRecord}
            model={meta.model}
            totalMs={meta.total_ms}
          />
        )}
        {/* Message actions */}
        {!streaming &&
          message.content &&
          !editing &&
          (isUser ? (
            <div className="flex items-center justify-end gap-0.5 mt-1 px-1">
              <CopyButton content={message.content} />
              {onAnnotate && (
                <button
                  onClick={() => {
                    setAnnotationEditing(true);
                    setAnnotationDraft(message.annotation || '');
                  }}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: message.annotation ? 'var(--c-accent)' : 'var(--c-text-2)' }}
                  title={message.annotation ? 'Edit annotation' : 'Add annotation'}
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              )}
              {onEditStart && (
                <button
                  onClick={onEditStart}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5"
                  style={{ color: 'var(--c-text-2)' }}
                  title="Edit message"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
              )}
              {onBranch && (
                <button
                  onClick={onBranch}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5"
                  style={{ color: 'var(--c-text-2)' }}
                  title="Branch conversation here"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <path d="M6 9v3c0 2 2 3 6 3h3" />
                  </svg>
                </button>
              )}
              {onReaction && (
                <div
                  ref={reactionPickerRef}
                  style={{ position: 'relative', display: 'inline-block' }}
                >
                  <button
                    onClick={() => setReactionPickerOpen((o) => !o)}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5"
                    style={{ color: reactionPickerOpen ? 'var(--c-accent)' : 'var(--c-text-2)' }}
                    title="Add reaction"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>
                  {reactionPickerOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 4px)',
                        right: 0,
                        background: 'var(--c-bg-2)',
                        border: '1px solid var(--c-border-1)',
                        borderRadius: '12px',
                        padding: '4px 6px',
                        display: 'flex',
                        gap: '2px',
                        zIndex: 50,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            onReaction(emoji);
                            setReactionPickerOpen(false);
                          }}
                          className="rounded transition-transform hover:scale-125"
                          style={{
                            padding: '2px 4px',
                            fontSize: '16px',
                            lineHeight: 1,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {onReply && (
                <button
                  onClick={onReply}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: 'var(--c-text-5)' }}
                  title="Reply to this message"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                </button>
              )}
              <CopyButton content={message.content} inline />
              {onToggleBookmark && (
                <button
                  onClick={onToggleBookmark}
                  className={`p-1 rounded transition-colors ${isBookmarked ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'}`}
                  style={{ color: isBookmarked ? 'var(--c-accent)' : 'var(--c-text-5)' }}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark this message'}
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill={isBookmarked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              )}
            </div>
          ) : onFeedback ? (
            <div>
              <div className="flex items-center gap-0.5">
                <MessageActions
                  content={message.content}
                  feedback={message.feedback}
                  onFeedback={onFeedback}
                  onRegenerate={onRegenerate}
                  onBranch={onBranch}
                  onReaction={onReaction}
                />
                {onReply && (
                  <button
                    onClick={onReply}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                    style={{ color: 'var(--c-text-5)' }}
                    title="Reply to this message"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 17 4 12 9 7" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                    </svg>
                  </button>
                )}
                {onAnnotate && (
                  <button
                    onClick={() => {
                      setAnnotationEditing(true);
                      setAnnotationDraft(message.annotation || '');
                    }}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                    style={{ color: message.annotation ? 'var(--c-accent)' : 'var(--c-text-5)' }}
                    title={message.annotation ? 'Edit annotation' : 'Add annotation'}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
                {onToggleBookmark && (
                  <button
                    onClick={onToggleBookmark}
                    className={`p-1 rounded transition-colors ${isBookmarked ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'}`}
                    style={{ color: isBookmarked ? 'var(--c-accent)' : 'var(--c-text-5)' }}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark this message'}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill={isBookmarked ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ) : null)}
        {/* Retry button for error messages */}
        {!isUser && message.content.startsWith('Error:') && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-125"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--c-danger-soft)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        )}
        {/* Annotation inline editor */}
        {annotationEditing && onAnnotate && (
          <div className="mt-1 px-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="flex-1 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--c-bg-2)',
                  color: 'var(--c-text-1)',
                  border: '1px solid var(--c-border-1)',
                }}
                value={annotationDraft}
                onChange={(e) => setAnnotationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAnnotate(annotationDraft);
                    setAnnotationEditing(false);
                  }
                  if (e.key === 'Escape') setAnnotationEditing(false);
                }}
                placeholder="Add a note..."
                autoFocus
              />
              <button
                onClick={() => {
                  onAnnotate(annotationDraft);
                  setAnnotationEditing(false);
                }}
                className="text-[10px] px-2 py-1 rounded-lg font-medium"
                style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
              >
                Save
              </button>
              <button
                onClick={() => setAnnotationEditing(false)}
                className="text-[10px] px-1.5 py-1 rounded-lg"
                style={{ color: 'var(--c-text-4)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Annotation display */}
        {!annotationEditing && message.annotation && (
          <div
            className="mt-1 mx-1 px-2 py-1 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            style={{
              background: 'color-mix(in srgb, var(--c-accent) 10%, transparent)',
              borderLeft: '2px solid var(--c-accent)',
              color: 'var(--c-text-3)',
            }}
            onClick={() => {
              if (onAnnotate) {
                setAnnotationEditing(true);
                setAnnotationDraft(message.annotation || '');
              }
            }}
            title="Click to edit annotation"
          >
            <svg
              className="h-3 w-3 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="flex-1 truncate">{message.annotation}</span>
            {onAnnotate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnnotate('');
                }}
                className="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                style={{ color: 'var(--c-text-5)' }}
                title="Remove annotation"
              >
                <svg
                  className="h-2.5 w-2.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {/* Reaction pills */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReaction?.(emoji)}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors"
                style={{
                  background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--c-accent) 25%, transparent)',
                  color: 'var(--c-text-2)',
                  cursor: 'pointer',
                  lineHeight: 1.2,
                }}
                title={`${emoji} ${count}`}
              >
                <span style={{ fontSize: '14px' }}>{emoji}</span>
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--c-text-3)' }}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
