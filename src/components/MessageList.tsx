import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '../router-client';
import type { UserProfile } from '../store';
import type { ProcessRun } from './process-bar/types';
import MessageBubble, { SystemEventChip, ToolExecutionChip } from './MessageBubble';
import { BrowserApprovalCard } from './message-parts/BrowserApprovalCard';
import { PreviewConfirmCard } from './PreviewConfirmCard';
import type { ToolExecStep } from './MessageBubble';
import { WelcomeScreen } from './WelcomeScreen';
import { formatTime } from '../chat-utils';
import StreamTimeoutIndicator from './StreamTimeoutIndicator';
import { MessageProgressTrail, messageToStep } from './MessageProgressTrail';
import type { ProgressStep } from './MessageProgressTrail';

interface Agent {
  id: string;
  name: string;
  emoji: string;
}

/** Convert a tool_exec meta message into a ToolExecStep for the ToolExecutionChip */
function toToolExecStep(msg: ChatMessage): ToolExecStep {
  const m = msg.meta || {};
  return {
    id: `tool-${msg.timestamp}-${m.tool || 'unknown'}`,
    tool: m.tool || 'unknown',
    status: m.status === 'error' ? 'error' : m.status === 'running' ? 'running' : 'success',
    input: m.inputJson
      ? (() => {
          try {
            return JSON.parse(m.inputJson);
          } catch {
            return undefined;
          }
        })()
      : undefined,
    outputPreview: m.outputPreview || undefined,
    error: m.error || undefined,
    latencyMs: m.duration ? parseInt(m.duration, 10) || undefined : undefined,
    iteration: m.iteration ? parseInt(m.iteration, 10) : 1,
    timestamp: msg.timestamp || Date.now(),
  };
}

function isStatusMessage(msg: ChatMessage): boolean {
  if (msg.meta?.type === 'tool_exec') return true;
  if ((msg as any)._system || msg.meta?.system) return true;
  if (msg.role === 'assistant' && msg.content?.startsWith('[system]')) return true;
  return false;
}

function isBrowserApproval(msg: ChatMessage): boolean {
  return isStatusMessage(msg) && !!msg.content?.includes('[browser_approval]');
}

function isPreviewRequired(msg: ChatMessage): boolean {
  return isStatusMessage(msg) && msg.meta?.type === 'preview_required';
}

export interface MessageListProps {
  filteredMessages: ChatMessage[];
  messages: ChatMessage[];
  streaming: boolean;
  streamText: string;
  syncing: boolean;
  compact: boolean;
  currentAgent: Agent;
  activeAgentId: string;
  userName: string;
  activeSessionId: string | null;
  statusLine?: string | null;

  // Search
  chatSearchOpen: boolean;
  chatSearch: string;
  chatSearchResults: number[];
  chatSearchIndex: number;

  // Selection
  selectedMsgIndex: number | null;

  // Editing
  editingMsgIndex: number | null;
  editingMsgText: string;

  // Scroll
  scrollRef: React.RefObject<HTMLDivElement>;
  showJumpToLatest: boolean;
  newMsgStartIndex: React.MutableRefObject<number | null>;

  // Pull-to-refresh
  pullDistance: number;
  pullRefreshing: boolean;
  PULL_THRESHOLD: number;

  // Stream state
  streamStall: 'stalling' | 'retrying' | 'clear' | null;
  stallCountdown: number;
  streamElapsed: number;
  streamPhase: string;
  activeToolName: string | null;
  compacting: boolean;
  pendingApproval: {
    approvalId: string;
    tool: string;
    reason: string;
    input?: Record<string, unknown>;
  } | null;

  /** True once the first content token has been received */
  firstTokenReceived: boolean;
  /** Cancel the current stream */
  onCancelStream: () => void;

  // Process runs
  runs: ProcessRun[];
  getRunForMessage: (msg: ChatMessage, idx: number) => ProcessRun | null;

  // User profile
  userProfile: UserProfile | null;

  // Callbacks
  onScroll: () => void;
  onPullStart: (e: React.TouchEvent) => void;
  onPullMove: (e: React.TouchEvent) => void;
  onPullEnd: () => void;
  onJumpToLatest: () => void;
  onImageClick: (src: string) => void;
  onSelectTemplate: (prompt: string) => void;
  onFeedback: (msgIndex: number, fb: 'like' | 'dislike') => void;
  onEditStart: (msgIndex: number, content: string) => void;
  onEditChange: (text: string) => void;
  onEditCancel: () => void;
  onEdit: (msgIndex: number, newText: string) => void;
  onRegenerate: (msgIndex: number) => void;
  onAnnotate: (msgIndex: number, text: string) => void;
  onBranch: (msgIndex: number) => void;
  onReaction: (msgIndex: number, emoji: string) => void;
  onReply: (msgIndex: number) => void;
  onRetry: (msgIndex: number) => void;
  onRunCommand: (cmd: string) => void;
  onContentExpand: (content: string, type: string, title?: string) => void;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onModeSwitchRequest?: (mode: string) => void;

  // Virtualizer (passed from parent so it's shared for search navigation)
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  useVirtual: boolean;
}

export function MessageList(props: MessageListProps) {
  const {
    filteredMessages,
    messages,
    streaming,
    streamText,
    syncing,
    compact,
    currentAgent,
    activeAgentId,
    userName,
    activeSessionId,
    chatSearchOpen,
    chatSearch,
    chatSearchResults,
    chatSearchIndex,
    selectedMsgIndex,
    editingMsgIndex,
    editingMsgText,
    scrollRef,
    showJumpToLatest,
    newMsgStartIndex,
    pullDistance,
    pullRefreshing,
    PULL_THRESHOLD,
    streamStall,
    stallCountdown,
    streamElapsed,
    streamPhase,
    activeToolName,
    compacting,
    pendingApproval,
    firstTokenReceived,
    onCancelStream,
    runs,
    getRunForMessage,
    userProfile,
    onScroll,
    onPullStart,
    onPullMove,
    onPullEnd,
    onJumpToLatest,
    onImageClick,
    onSelectTemplate,
    onFeedback,
    onEditStart,
    onEditChange,
    onEditCancel,
    onEdit,
    onRegenerate,
    onAnnotate,
    onBranch,
    onReaction,
    onReply,
    onRetry,
    onRunCommand,
    onContentExpand,
    onApprove,
    onDeny,
    virtualizer,
    useVirtual,
  } = props;

  const renderMessageProps = useCallback(
    (msg: ChatMessage, i: number) => ({
      message: msg,
      compact,
      agentName: currentAgent.name,
      agentEmoji: currentAgent.emoji,
      userName,
      onImageClick,
      searchHighlight: chatSearchOpen && chatSearch.trim() ? chatSearch : undefined,
      isCurrentSearchHit: chatSearchOpen && chatSearchResults[chatSearchIndex] === i,
      selected: selectedMsgIndex === i,
      onRunCommand,
      onFeedback: (fb: 'like' | 'dislike') => onFeedback(i, fb),
      editing: editingMsgIndex === i,
      editText: editingMsgIndex === i ? editingMsgText : '',
      onEditStart: () => onEditStart(i, msg.content),
      onEditChange: (text: string) => onEditChange(text),
      onEditCancel,
      onEdit: (newText: string) => onEdit(i, newText),
      onRegenerate:
        !streaming && msg.role === 'assistant' && i === filteredMessages.length - 1
          ? () => onRegenerate(i)
          : undefined,
      onAnnotate: (text: string) => onAnnotate(i, text),
      onBranch: () => onBranch(i),
      onReaction: (emoji: string) => onReaction(i, emoji),
      onReply: () => onReply(i),
      replyPreview:
        msg.replyTo != null
          ? ((filteredMessages[msg.replyTo] ?? messages[msg.replyTo])?.content
              .replace(/\n/g, ' ')
              .slice(0, 80) ?? null)
          : null,
      processRun: getRunForMessage(msg, i),
      onRetry:
        !streaming && msg.role === 'assistant' && msg.content.startsWith('Error:')
          ? () => onRetry(i)
          : undefined,
      onContentExpand,
    }),
    [
      compact,
      currentAgent.name,
      currentAgent.emoji,
      userName,
      onImageClick,
      chatSearchOpen,
      chatSearch,
      chatSearchResults,
      chatSearchIndex,
      selectedMsgIndex,
      onRunCommand,
      onFeedback,
      editingMsgIndex,
      editingMsgText,
      onEditStart,
      onEditChange,
      onEditCancel,
      onEdit,
      streaming,
      filteredMessages,
      onRegenerate,
      onAnnotate,
      onBranch,
      onReaction,
      onReply,
      getRunForMessage,
      onRetry,
      onContentExpand,
    ],
  );

  const { trailMap, groupedIndices } = useMemo(() => {
    const trailMap = new Map<number, ProgressStep[]>();
    const groupedIndices = new Set<number>();
    let anchorIdx = -1;

    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i];
      if (isStatusMessage(msg) && !isBrowserApproval(msg) && !isPreviewRequired(msg)) {
        if (anchorIdx >= 0) {
          if (!trailMap.has(anchorIdx)) trailMap.set(anchorIdx, []);
          trailMap.get(anchorIdx)!.push(messageToStep(msg));
          groupedIndices.add(i);
        }
      } else {
        anchorIdx = i;
      }
    }
    return { trailMap, groupedIndices };
  }, [filteredMessages]);

  return (
    <>
      <section
        ref={scrollRef}
        onScroll={onScroll}
        onTouchStart={onPullStart}
        onTouchMove={onPullMove}
        onTouchEnd={onPullEnd}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 select-text relative scroll-anchor-container"
        role="log"
        aria-label="Message history"
        aria-relevant="additions"
        style={{
          paddingLeft: '24px',
          paddingRight: '24px',
          paddingBottom: window.innerWidth <= 768 ? '120px' : '24px',
        }}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || pullRefreshing) && (
          <div
            className="flex justify-center items-center transition-all"
            style={{ height: pullDistance, overflow: 'hidden' }}
          >
            <div
              className={`flex items-center gap-2 text-xs ${pullRefreshing ? 'animate-pulse' : ''}`}
              style={{
                color: pullDistance >= PULL_THRESHOLD ? 'var(--c-accent)' : 'var(--c-text-5)',
              }}
            >
              <svg
                className={`h-4 w-4 transition-transform ${pullRefreshing ? 'animate-spin' : ''}`}
                style={{
                  transform:
                    pullDistance >= PULL_THRESHOLD && !pullRefreshing
                      ? 'rotate(180deg)'
                      : 'rotate(0deg)',
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {pullRefreshing
                ? 'Reconnecting...'
                : pullDistance >= PULL_THRESHOLD
                  ? 'Release to reconnect'
                  : 'Pull to reconnect'}
            </div>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 &&
          !streaming &&
          (syncing ? (
            <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{
                      background: 'var(--c-bg-card)',
                      width: `${45 + (i % 3) * 15}%`,
                      minHeight: i % 2 === 0 ? '36px' : '60px',
                    }}
                  >
                    <div className="space-y-2">
                      <div
                        className="h-3 rounded"
                        style={{ background: 'var(--c-border-2)', width: '90%' }}
                      />
                      {i % 2 !== 0 && (
                        <div
                          className="h-3 rounded"
                          style={{ background: 'var(--c-border-2)', width: '60%' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-center pt-2">
                <span className="text-[11px]" style={{ color: 'var(--c-text-5)' }}>
                  Syncing {currentAgent.name}'s history...
                </span>
              </div>
            </div>
          ) : (
            <WelcomeScreen
              agent={currentAgent}
              agentId={activeAgentId}
              userProfile={userProfile}
              onSelectTemplate={onSelectTemplate}
            />
          ))}

        {/* Message list */}
        {useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const msg = filteredMessages[virtualRow.index];
              const i = virtualRow.index;
              const isGrouped = groupedIndices.has(i);
              const trail = trailMap.get(i);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={
                    newMsgStartIndex.current !== null &&
                    virtualRow.index >= newMsgStartIndex.current
                      ? 'msg-enter'
                      : undefined
                  }
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: isGrouped ? '0px' : compact ? '4px' : '12px',
                    ...(isGrouped ? { height: 0, overflow: 'hidden' } : {}),
                  }}
                >
                  {isGrouped ? null : msg.content?.includes('[browser_approval]') &&
                    isStatusMessage(msg) ? (
                    <BrowserApprovalCard message={msg} timestamp={formatTime(msg.timestamp)} />
                  ) : isPreviewRequired(msg) ? (
                    <PreviewConfirmCard message={msg} timestamp={formatTime(msg.timestamp)} />
                  ) : isStatusMessage(msg) && msg.meta?.type === 'tool_exec' ? (
                    <ToolExecutionChip step={toToolExecStep(msg)} />
                  ) : isStatusMessage(msg) ? (
                    <SystemEventChip
                      message={msg}
                      timestamp={formatTime(msg.timestamp)}
                      onModeSwitchRequest={props.onModeSwitchRequest}
                    />
                  ) : (
                    <>
                      <MessageBubble
                        {...renderMessageProps(msg, i)}
                        onReplyClick={
                          msg.replyTo != null
                            ? () => {
                                if (msg.replyTo != null)
                                  virtualizer.scrollToIndex(msg.replyTo, { align: 'center' });
                              }
                            : undefined
                        }
                      />
                      {trail && trail.length > 0 && <MessageProgressTrail steps={trail} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {filteredMessages.map((msg, i) => {
              const isGrouped = groupedIndices.has(i);
              const trail = trailMap.get(i);
              if (isGrouped) return null;
              return (
                <div
                  key={msg.timestamp || i}
                  data-msg-index={i}
                  className={
                    newMsgStartIndex.current !== null && i >= newMsgStartIndex.current
                      ? 'msg-enter'
                      : undefined
                  }
                  style={{ paddingBottom: compact ? '4px' : '12px' }}
                >
                  {msg.content?.includes('[browser_approval]') && isStatusMessage(msg) ? (
                    <BrowserApprovalCard message={msg} timestamp={formatTime(msg.timestamp)} />
                  ) : isPreviewRequired(msg) ? (
                    <PreviewConfirmCard message={msg} timestamp={formatTime(msg.timestamp)} />
                  ) : isStatusMessage(msg) && msg.meta?.type === 'tool_exec' ? (
                    <ToolExecutionChip step={toToolExecStep(msg)} />
                  ) : isStatusMessage(msg) ? (
                    <SystemEventChip
                      message={msg}
                      timestamp={formatTime(msg.timestamp)}
                      onModeSwitchRequest={props.onModeSwitchRequest}
                    />
                  ) : (
                    <>
                      <MessageBubble
                        {...renderMessageProps(msg, i)}
                        onReplyClick={
                          msg.replyTo != null
                            ? () => {
                                if (msg.replyTo != null) {
                                  const el = scrollRef.current?.querySelector(
                                    `[data-msg-index="${msg.replyTo}"]`,
                                  );
                                  if (el)
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }
                            : undefined
                        }
                      />
                      {trail && trail.length > 0 && <MessageProgressTrail steps={trail} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Streaming indicator — TTFT timer + timeout warnings */}
        {streaming && (
          <div className="max-w-3xl mx-auto w-full stream-indicator-zone">
            {/* Pre-first-token: show elapsed TTFT timer immediately */}
            {!firstTokenReceived && !streamStall && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 mb-0.5 text-[11px] select-none"
                style={{ color: 'var(--c-text-2)' }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{
                    background: streamElapsed >= 30 ? 'var(--c-warning)' : 'var(--c-text-2)',
                  }}
                />
                <span>
                  {streamElapsed < 30
                    ? `Thinking\u2026 ${streamElapsed}s`
                    : streamElapsed < 60
                      ? `Taking longer than usual\u2026 ${streamElapsed}s`
                      : `Still waiting\u2026 ${streamElapsed}s`}
                </span>
                {streamElapsed >= 60 && (
                  <button
                    onClick={onCancelStream}
                    className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                    style={{
                      background: 'rgba(248, 113, 113, 0.15)',
                      color: 'var(--c-danger-soft)',
                      border: '1px solid rgba(248, 113, 113, 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'rgba(248, 113, 113, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.background =
                        'rgba(248, 113, 113, 0.15)';
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* Post-first-token: subtle elapsed counter (only after 5s of streaming) */}
            {firstTokenReceived && streamElapsed >= 5 && !streamStall && (
              <div
                className="flex items-center gap-1.5 px-3 py-0.5 mb-0.5 text-[10px] select-none"
                style={{ color: 'var(--c-text-2)' }}
              >
                <span
                  className="inline-block h-1 w-1 rounded-full animate-pulse"
                  style={{ background: 'var(--c-text-2)' }}
                />
                {streamElapsed}s
              </div>
            )}

            {streamStall === 'stalling' && stallCountdown > 0 && (
              <StreamTimeoutIndicator stallCountdown={stallCountdown} />
            )}

            {streamStall === 'retrying' && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 mb-1 rounded-lg text-[11px]"
                style={{
                  background: 'rgba(251, 146, 60, 0.10)',
                  color: 'var(--c-orange)',
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full ws-reconnect-pulse"
                  style={{ background: 'var(--c-orange)' }}
                />
                Retrying stream...
              </div>
            )}

            {pendingApproval && (
              <div className="mx-4 my-2 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                <div className="text-amber-200 text-sm font-medium mb-1">Approval Required</div>
                <div className="text-amber-100/80 text-xs mb-2">
                  <strong>{pendingApproval.tool}</strong>: {pendingApproval.reason}
                  {!!pendingApproval.input?.command && (
                    <pre className="mt-1 p-1 bg-black/30 rounded text-xs overflow-x-auto">
                      {String(pendingApproval.input.command).slice(0, 200)}
                    </pre>
                  )}
                  {!!pendingApproval.input?.path && (
                    <div className="mt-1 text-xs opacity-70">
                      Path: {String(pendingApproval.input.path)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onApprove(pendingApproval.approvalId)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDeny(pendingApproval.approvalId)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                  >
                    Deny
                  </button>
                </div>
              </div>
            )}

            {streamText ? (
              <MessageBubble
                message={{ role: 'assistant', content: streamText }}
                streaming
                compact={compact}
                agentName={currentAgent.name}
                agentEmoji={currentAgent.emoji}
                userName={userName}
                onImageClick={onImageClick}
                onRunCommand={onRunCommand}
                onContentExpand={onContentExpand}
              />
            ) : (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    <span className="text-[11px]">{currentAgent.emoji}</span>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>
                      {currentAgent.name}
                    </span>
                  </div>
                  <div
                    className="rounded-2xl px-3 py-2 text-sm"
                    style={{ background: 'var(--c-msg-ai)', border: '1px solid var(--c-border-2)' }}
                  >
                    {(() => {
                      const badges: Record<
                        string,
                        { icon: string; label: string; color: string; bg: string; spin?: boolean }
                      > = {
                        connecting: {
                          icon: '\uD83D\uDD17',
                          label: 'Connecting',
                          color: 'var(--c-slate)',
                          bg: 'rgba(148,163,184,0.12)',
                        },
                        research: {
                          icon: '\uD83D\uDD0D',
                          label: 'Research',
                          color: 'var(--c-text-2)',
                          bg: 'var(--c-bg-hover)',
                        },
                        thinking: {
                          icon: '\uD83D\uDD0D',
                          label: 'Research',
                          color: 'var(--c-text-2)',
                          bg: 'var(--c-bg-hover)',
                        },
                        planning: {
                          icon: '\uD83D\uDCCB',
                          label: 'Planning strategy',
                          color: 'var(--c-purple)',
                          bg: 'rgba(167,139,250,0.12)',
                        },
                        implementation: {
                          icon: '\u2699\uFE0F',
                          label: 'Implementation',
                          color: 'var(--c-info-soft)',
                          bg: 'rgba(96,165,250,0.12)',
                          spin: true,
                        },
                        tool_use: {
                          icon: '\u26A1',
                          label: activeToolName || 'Tool',
                          color: 'var(--c-info-soft)',
                          bg: 'rgba(96,165,250,0.12)',
                          spin: true,
                        },
                        writing: {
                          icon: '\u2699\uFE0F',
                          label: 'Implementation',
                          color: 'var(--c-info-soft)',
                          bg: 'rgba(96,165,250,0.12)',
                          spin: true,
                        },
                        compacting: {
                          icon: '\uD83D\uDCE6',
                          label: 'Compacting',
                          color: 'var(--c-orange)',
                          bg: 'rgba(251,146,60,0.12)',
                          spin: true,
                        },
                        done: {
                          icon: '\u2705',
                          label: 'Done',
                          color: 'var(--c-emerald)',
                          bg: 'rgba(52,211,153,0.12)',
                        },
                        attention: {
                          icon: '\u26A0\uFE0F',
                          label: 'Attention Needed',
                          color: 'var(--c-yellow)',
                          bg: 'rgba(250,204,21,0.12)',
                        },
                        error: {
                          icon: '\u274C',
                          label: 'Error',
                          color: 'var(--c-danger-soft)',
                          bg: 'rgba(248,113,113,0.12)',
                        },
                      };
                      const b = badges[streamPhase] || badges.thinking;
                      return (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: b.bg,
                            color: b.color,
                            border: `1px solid ${b.color}33`,
                          }}
                          role="status"
                          aria-live="polite"
                          aria-label={`Agent is ${b.label.toLowerCase()}`}
                        >
                          <span className={b.spin ? 'animate-spin' : 'animate-pulse'}>
                            {b.icon}
                          </span>
                          {b.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Jump to latest — sticky inside scroll container */}
        {showJumpToLatest && (
          <div
            style={{
              position: 'sticky',
              bottom: 12,
              zIndex: 20,
              pointerEvents: 'none',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={onJumpToLatest}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:scale-105 active:scale-95 animate-fade-in"
              style={{
                pointerEvents: 'auto',
                background: 'var(--c-accent)',
                color: 'var(--c-on-accent)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              Latest messages
            </button>
          </div>
        )}
      </section>
    </>
  );
}
