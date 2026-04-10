import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback } from 'react';
import MessageBubble, { SystemEventChip, ToolExecutionChip } from './MessageBubble';
import { BrowserApprovalCard } from './message-parts/BrowserApprovalCard';
import { WelcomeScreen } from './WelcomeScreen';
import { formatTime } from '../chat-utils';
import StreamTimeoutIndicator from './StreamTimeoutIndicator';
/** Convert a tool_exec meta message into a ToolExecStep for the ToolExecutionChip */
function toToolExecStep(msg) {
    const m = msg.meta || {};
    return {
        id: `tool-${msg.timestamp}-${m.tool || 'unknown'}`,
        tool: m.tool || 'unknown',
        status: m.status === 'error' ? 'error' : m.status === 'running' ? 'running' : 'success',
        input: m.inputJson
            ? (() => {
                try {
                    return JSON.parse(m.inputJson);
                }
                catch {
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
export function MessageList(props) {
    const { filteredMessages, messages, streaming, streamText, syncing, compact, currentAgent, activeAgentId, userName, activeSessionId, chatSearchOpen, chatSearch, chatSearchResults, chatSearchIndex, selectedMsgIndex, editingMsgIndex, editingMsgText, scrollRef, showJumpToLatest, newMsgStartIndex, pullDistance, pullRefreshing, PULL_THRESHOLD, streamStall, stallCountdown, streamElapsed, streamPhase, activeToolName, compacting, pendingApproval, runs, getRunForMessage, userProfile, onScroll, onPullStart, onPullMove, onPullEnd, onJumpToLatest, onImageClick, onSelectTemplate, onFeedback, onEditStart, onEditChange, onEditCancel, onEdit, onRegenerate, onAnnotate, onBranch, onReaction, onReply, onRetry, onRunCommand, onContentExpand, onApprove, onDeny, virtualizer, useVirtual, } = props;
    const renderMessageProps = useCallback((msg, i) => ({
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
        onFeedback: (fb) => onFeedback(i, fb),
        editing: editingMsgIndex === i,
        editText: editingMsgIndex === i ? editingMsgText : '',
        onEditStart: () => onEditStart(i, msg.content),
        onEditChange: (text) => onEditChange(text),
        onEditCancel,
        onEdit: (newText) => onEdit(i, newText),
        onRegenerate: !streaming && msg.role === 'assistant' && i === filteredMessages.length - 1
            ? () => onRegenerate(i)
            : undefined,
        onAnnotate: (text) => onAnnotate(i, text),
        onBranch: () => onBranch(i),
        onReaction: (emoji) => onReaction(i, emoji),
        onReply: () => onReply(i),
        replyPreview: msg.replyTo != null
            ? ((filteredMessages[msg.replyTo] ?? messages[msg.replyTo])?.content
                .replace(/\n/g, ' ')
                .slice(0, 80) ?? null)
            : null,
        processRun: getRunForMessage(msg, i),
        onRetry: !streaming && msg.role === 'assistant' && msg.content.startsWith('Error:')
            ? () => onRetry(i)
            : undefined,
        onContentExpand,
    }), [
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
    ]);
    return (_jsx(_Fragment, { children: _jsxs("section", { ref: scrollRef, onScroll: onScroll, onTouchStart: onPullStart, onTouchMove: onPullMove, onTouchEnd: onPullEnd, className: "flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 select-text relative scroll-anchor-container", role: "log", "aria-label": "Message history", "aria-relevant": "additions", style: { paddingLeft: '24px', paddingRight: '24px', paddingBottom: window.innerWidth <= 768 ? '120px' : '24px' }, children: [(pullDistance > 0 || pullRefreshing) && (_jsx("div", { className: "flex justify-center items-center transition-all", style: { height: pullDistance, overflow: 'hidden' }, children: _jsxs("div", { className: `flex items-center gap-2 text-xs ${pullRefreshing ? 'animate-pulse' : ''}`, style: {
                            color: pullDistance >= PULL_THRESHOLD ? 'var(--c-accent)' : 'var(--c-text-5)',
                        }, children: [_jsx("svg", { className: `h-4 w-4 transition-transform ${pullRefreshing ? 'animate-spin' : ''}`, style: {
                                    transform: pullDistance >= PULL_THRESHOLD && !pullRefreshing
                                        ? 'rotate(180deg)'
                                        : 'rotate(0deg)',
                                }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) }), pullRefreshing
                                ? 'Reconnecting...'
                                : pullDistance >= PULL_THRESHOLD
                                    ? 'Release to reconnect'
                                    : 'Pull to reconnect'] }) })), messages.length === 0 &&
                    !streaming &&
                    (syncing ? (_jsxs("div", { className: "max-w-3xl mx-auto space-y-4 animate-pulse", children: [[...Array(4)].map((_, i) => (_jsx("div", { className: `flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: "rounded-2xl px-4 py-3", style: {
                                        background: 'var(--c-bg-card)',
                                        width: `${45 + (i % 3) * 15}%`,
                                        minHeight: i % 2 === 0 ? '36px' : '60px',
                                    }, children: _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "h-3 rounded", style: { background: 'var(--c-border-2)', width: '90%' } }), i % 2 !== 0 && (_jsx("div", { className: "h-3 rounded", style: { background: 'var(--c-border-2)', width: '60%' } }))] }) }) }, i))), _jsx("div", { className: "text-center pt-2", children: _jsxs("span", { className: "text-[11px]", style: { color: 'var(--c-text-5)' }, children: ["Syncing ", currentAgent.name, "'s history..."] }) })] })) : (_jsx(WelcomeScreen, { agent: currentAgent, agentId: activeAgentId, userProfile: userProfile, onSelectTemplate: onSelectTemplate }))), useVirtual ? (_jsx("div", { style: {
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }, children: virtualizer.getVirtualItems().map((virtualRow) => {
                        const msg = filteredMessages[virtualRow.index];
                        const i = virtualRow.index;
                        return (_jsx("div", { "data-index": virtualRow.index, ref: virtualizer.measureElement, className: newMsgStartIndex.current !== null &&
                                virtualRow.index >= newMsgStartIndex.current
                                ? 'msg-enter'
                                : undefined, style: {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                                paddingBottom: compact ? '4px' : '12px',
                            }, children: msg.meta?.type === 'tool_exec' ? (_jsx(ToolExecutionChip, { step: toToolExecStep(msg) })) : msg._system ||
                                msg.meta?.system ||
                                (msg.role === 'assistant' && msg.content?.startsWith('[system]')) ? (msg.content?.includes('[browser_approval]') ? (_jsx(BrowserApprovalCard, { message: msg, timestamp: formatTime(msg.timestamp) })) : (_jsx(SystemEventChip, { message: msg, timestamp: formatTime(msg.timestamp) }))) : (_jsx(MessageBubble, { ...renderMessageProps(msg, i), onReplyClick: msg.replyTo != null
                                    ? () => {
                                        if (msg.replyTo != null)
                                            virtualizer.scrollToIndex(msg.replyTo, { align: 'center' });
                                    }
                                    : undefined })) }, virtualRow.key));
                    }) })) : (_jsx("div", { children: filteredMessages.map((msg, i) => (_jsx("div", { "data-msg-index": i, className: newMsgStartIndex.current !== null && i >= newMsgStartIndex.current
                            ? 'msg-enter'
                            : undefined, style: { paddingBottom: compact ? '4px' : '12px' }, children: msg.meta?.type === 'tool_exec' ? (_jsx(ToolExecutionChip, { step: toToolExecStep(msg) })) : msg._system ||
                            msg.meta?.system ||
                            (msg.role === 'assistant' && msg.content?.startsWith('[system]')) ? (_jsx(SystemEventChip, { message: msg, timestamp: formatTime(msg.timestamp) })) : (_jsx(MessageBubble, { ...renderMessageProps(msg, i), onReplyClick: msg.replyTo != null
                                ? () => {
                                    if (msg.replyTo != null) {
                                        const el = scrollRef.current?.querySelector(`[data-msg-index="${msg.replyTo}"]`);
                                        if (el)
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }
                                : undefined })) }, msg.timestamp || i))) })), streaming && (_jsxs("div", { className: "max-w-3xl mx-auto w-full stream-indicator-zone", children: [streamElapsed >= 3 && !streamStall && (_jsxs("div", { className: "flex items-center gap-1.5 px-3 py-0.5 mb-0.5 text-[10px] select-none", style: { color: 'var(--c-text-2)' }, children: [_jsx("span", { className: "inline-block h-1 w-1 rounded-full animate-pulse", style: { background: 'var(--c-text-2)' } }), streamElapsed < 10 ? `Thinking\u2026 ${streamElapsed}s` : `${streamElapsed}s`] })), streamStall === 'stalling' && stallCountdown > 0 && (_jsx(StreamTimeoutIndicator, { stallCountdown: stallCountdown })), streamStall === 'retrying' && (_jsxs("div", { className: "flex items-center gap-1.5 px-3 py-1 mb-1 rounded-lg text-[11px]", style: {
                                background: 'rgba(251, 146, 60, 0.10)',
                                color: 'var(--c-orange)',
                            }, children: [_jsx("span", { className: "inline-block h-1.5 w-1.5 rounded-full ws-reconnect-pulse", style: { background: 'var(--c-orange)' } }), "Retrying stream..."] })), pendingApproval && (_jsxs("div", { className: "mx-4 my-2 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg", children: [_jsx("div", { className: "text-amber-200 text-sm font-medium mb-1", children: "Approval Required" }), _jsxs("div", { className: "text-amber-100/80 text-xs mb-2", children: [_jsx("strong", { children: pendingApproval.tool }), ": ", pendingApproval.reason, !!pendingApproval.input?.command && (_jsx("pre", { className: "mt-1 p-1 bg-black/30 rounded text-xs overflow-x-auto", children: String(pendingApproval.input.command).slice(0, 200) })), !!pendingApproval.input?.path && (_jsxs("div", { className: "mt-1 text-xs opacity-70", children: ["Path: ", String(pendingApproval.input.path)] }))] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => onApprove(pendingApproval.approvalId), className: "px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded", children: "Approve" }), _jsx("button", { onClick: () => onDeny(pendingApproval.approvalId), className: "px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded", children: "Deny" })] })] })), streamText ? (_jsx(MessageBubble, { message: { role: 'assistant', content: streamText }, streaming: true, compact: compact, agentName: currentAgent.name, agentEmoji: currentAgent.emoji, userName: userName, onImageClick: onImageClick, onRunCommand: onRunCommand, onContentExpand: onContentExpand })) : (_jsx("div", { className: "flex justify-start", children: _jsxs("div", { className: "max-w-[85%]", children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-0.5 px-1", children: [_jsx("span", { className: "text-[11px]", children: currentAgent.emoji }), _jsx("span", { className: "text-[11px] font-medium", style: { color: 'var(--c-text-3)' }, children: currentAgent.name })] }), _jsx("div", { className: "rounded-2xl px-3 py-2 text-sm", style: { background: 'var(--c-msg-ai)', border: '1px solid var(--c-border-2)' }, children: (() => {
                                            const badges = {
                                                connecting: {
                                                    icon: '\uD83D\uDD17',
                                                    label: 'Connecting',
                                                    color: 'var(--c-slate)',
                                                    bg: 'rgba(148,163,184,0.12)',
                                                },
                                                thinking: {
                                                    icon: '\uD83E\uDDE0',
                                                    label: 'Thinking',
                                                    color: 'var(--c-text-2)',
                                                    bg: 'var(--c-bg-hover)',
                                                },
                                                planning: {
                                                    icon: '\uD83D\uDCCB',
                                                    label: 'Planning strategy',
                                                    color: 'var(--c-purple)',
                                                    bg: 'rgba(167,139,250,0.12)',
                                                },
                                                tool_use: {
                                                    icon: '\u26A1',
                                                    label: activeToolName || 'Tool',
                                                    color: 'var(--c-info-soft)',
                                                    bg: 'rgba(96,165,250,0.12)',
                                                    spin: true,
                                                },
                                                writing: {
                                                    icon: '\u270D\uFE0F',
                                                    label: 'Writing',
                                                    color: 'var(--c-success-soft)',
                                                    bg: 'rgba(74,222,128,0.12)',
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
                                            return (_jsxs("span", { className: "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full", style: {
                                                    background: b.bg,
                                                    color: b.color,
                                                    border: `1px solid ${b.color}33`,
                                                }, role: "status", "aria-live": "polite", "aria-label": `Agent is ${b.label.toLowerCase()}`, children: [_jsx("span", { className: b.spin ? 'animate-spin' : 'animate-pulse', children: b.icon }), b.label] }));
                                        })() })] }) }))] })), showJumpToLatest && (_jsx("div", { style: {
                        position: 'sticky',
                        bottom: 12,
                        zIndex: 20,
                        pointerEvents: 'none',
                        display: 'flex',
                        justifyContent: 'center',
                    }, children: _jsxs("button", { onClick: onJumpToLatest, className: "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:scale-105 active:scale-95 animate-fade-in", style: {
                            pointerEvents: 'auto',
                            background: 'var(--c-accent)',
                            color: 'var(--c-on-accent)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.15)',
                        }, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) }), "Latest messages"] }) }))] }) }));
}
