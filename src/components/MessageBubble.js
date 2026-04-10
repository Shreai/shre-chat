import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback, memo, lazy, Suspense, } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
const ContentCard = lazy(() => import('./ContentCard'));
const MibWidgetBlock = lazy(() => import('./MibWidgetBlock'));
const DataCard = lazy(() => import('./DataCard'));
import { ChatMessageTools } from './ChatMessageTools';
import { formatTime, estimateTokens, formatTokenCount, stripThinkBlocks, extractActionTags, lightweightMarkdown, splitStableAndPending, highlightSearchText, REACTION_EMOJIS, } from '../chat-utils';
// ── Extracted sub-components ──
import { TaskBadge } from './message-parts/TaskBadge';
import { HtmlCodeBlock, TableWithExport } from './message-parts/CodeBlocks';
import { CopyButton, MessageActions, ActionTagChips } from './message-parts/MessageActions';
import { StableMarkdownBlock } from './message-parts/SystemEventChip';
// Re-export extracted components so existing imports from MessageBubble still work
export { Lightbox, StableMarkdownBlock, SystemEventChip } from './message-parts/SystemEventChip';
export { ToolExecutionChip, ToolExecutionGroup } from './message-parts/ToolExecutionChip';
// ── MessageBubble ───────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ message, streaming, agentName, agentEmoji, userName, onRunCommand, onFeedback, editing, editText, onEditStart, onEditChange, onEditCancel, onEdit, searchHighlight, isCurrentSearchHit, onImageClick, compact, onRegenerate, selected, onAnnotate, onBranch, onReaction, onReply, replyPreview, onReplyClick, processRun, onRetry, onContentExpand, isBookmarked, onToggleBookmark, }) {
    const isUser = message.role === 'user';
    const name = isUser ? userName || 'You' : agentName;
    const time = formatTime(message.timestamp);
    const stripped = isUser ? message.content : stripThinkBlocks(message.content);
    const { cleanText: displayContent, tags: actionTags } = isUser
        ? { cleanText: stripped, tags: [] }
        : extractActionTags(stripped);
    const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
    const reactionPickerRef = useRef(null);
    useEffect(() => {
        if (!reactionPickerOpen)
            return;
        const handler = (e) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target)) {
                setReactionPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [reactionPickerOpen]);
    const [routeExpanded, setRouteExpanded] = useState(false);
    const [annotationEditing, setAnnotationEditing] = useState(false);
    const [annotationDraft, setAnnotationDraft] = useState(message.annotation || '');
    const meta = message.meta;
    const shortModel = meta?.model
        ? meta.model
            .replace(/^.*\//, '')
            .replace(/^claude-/, '')
            .replace(/-\d{8}$/, '')
        : null;
    // Swipe-to-reply on mobile
    const [swipeX, setSwipeX] = useState(0);
    const swipeTouchRef = useRef(null);
    const handleSwipeTouchStart = useCallback((e) => {
        swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, started: false };
    }, []);
    const handleSwipeTouchMove = useCallback((e) => {
        if (!swipeTouchRef.current)
            return;
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
            if (navigator.vibrate)
                navigator.vibrate(30);
        }
        setSwipeX(0);
        swipeTouchRef.current = null;
    }, [swipeX, onReply]);
    return (_jsx("div", { className: `flex ${isUser ? 'justify-end' : 'justify-start'} ${compact ? 'max-w-2xl' : 'max-w-3xl'} mx-auto`, children: _jsxs("div", { className: `${compact ? 'max-w-[95%]' : 'max-w-[85%]'} group/msg`, onTouchStart: onReply ? handleSwipeTouchStart : undefined, onTouchMove: onReply ? handleSwipeTouchMove : undefined, onTouchEnd: onReply ? handleSwipeTouchEnd : undefined, style: {
                ...(swipeX > 0
                    ? { transform: `translateX(${swipeX}px)`, transition: 'none' }
                    : { transition: 'transform 0.2s ease-out, border-color 0.15s, padding-left 0.15s' }),
                borderLeft: selected ? '2px solid var(--c-accent)' : '2px solid transparent',
                paddingLeft: '8px',
                ...(selected ? { borderRadius: '2px' } : {}),
            }, children: [replyPreview && (_jsx("div", { onClick: onReplyClick, className: "mb-1 px-2 py-1 rounded-lg text-xs truncate", style: {
                        borderLeft: '3px solid var(--c-accent)',
                        background: 'var(--c-bg-3)',
                        color: 'var(--c-text-4)',
                        cursor: onReplyClick ? 'pointer' : 'default',
                        maxWidth: '100%',
                    }, title: "Click to scroll to original message", children: replyPreview.length > 80 ? replyPreview.slice(0, 80) + '...' : replyPreview })), _jsxs("div", { className: `flex items-center gap-1.5 mb-0.5 px-1 ${isUser ? 'justify-end' : 'justify-start'}`, children: [!isUser && _jsx("span", { className: "text-[11px]", children: agentEmoji }), _jsx("span", { className: "text-[11px] font-medium", style: { color: 'var(--c-text-2)' }, children: name }), !isUser && shortModel && (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full font-medium", style: {
                                background: 'var(--c-bg-3)',
                                color: 'var(--c-accent)',
                                border: '1px solid var(--c-border-2)',
                            }, children: shortModel })), time && (_jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: time })), _jsx("span", { className: "text-[10px] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150", style: { color: 'var(--c-text-5)' }, children: formatTokenCount(estimateTokens(message.content)) })] }), _jsxs("div", { className: `rounded-2xl ${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-base'} leading-relaxed select-text`, style: {
                        background: isUser ? 'var(--c-msg-user)' : 'var(--c-msg-ai)',
                        color: 'var(--c-text-1)',
                        border: `1px solid ${isCurrentSearchHit ? 'var(--c-accent)' : isUser ? 'var(--c-accent-soft)' : 'var(--c-border-2)'}`,
                        boxShadow: isCurrentSearchHit
                            ? '0 0 0 2px var(--c-accent), 0 0 12px rgba(99,102,241,0.25)'
                            : undefined,
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        WebkitUserSelect: 'text',
                        userSelect: 'text',
                    }, children: [isUser ? (_jsxs("div", { className: "whitespace-pre-wrap break-words", style: editing ? { opacity: 0.5 } : undefined, children: [editing && (_jsx("div", { className: "text-[10px] mb-1", style: { color: 'var(--c-accent)', opacity: 1 }, children: "Editing below \u2193" })), searchHighlight
                                    ? highlightSearchText(displayContent, searchHighlight)
                                    : displayContent] })) : streaming ? ((() => {
                            const { stable, pending } = splitStableAndPending(displayContent);
                            return (_jsxs("div", { className: "prose-chat break-words", children: [_jsx(StableMarkdownBlock, { text: stable }), pending && (_jsx("pre", { className: "prose-chat whitespace-pre-wrap m-0 p-0 bg-transparent font-[inherit] text-[inherit] leading-relaxed", style: { fontFamily: 'inherit' }, dangerouslySetInnerHTML: { __html: lightweightMarkdown(pending) } })), _jsx("span", { className: "inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse rounded-sm" }), _jsx(ActionTagChips, { tags: actionTags })] }));
                        })()) : (_jsxs("div", { className: "prose-chat break-words", children: [_jsx(Suspense, { fallback: null, children: _jsx(DataCard, { content: displayContent }) }), _jsx(Markdown, { remarkPlugins: [remarkGfm], components: {
                                        img({ src, alt, ...props }) {
                                            return (_jsx("img", { src: src, alt: alt || 'Image', ...props, onClick: () => src && onImageClick?.(src), style: {
                                                    cursor: 'pointer',
                                                    borderRadius: 6,
                                                    maxWidth: '100%',
                                                    height: 'auto',
                                                    display: 'block',
                                                    transition: 'opacity 0.15s, box-shadow 0.15s',
                                                }, onMouseEnter: (e) => {
                                                    e.currentTarget.style.opacity = '0.85';
                                                    e.currentTarget.style.boxShadow = '0 0 0 2px var(--c-accent)';
                                                }, onMouseLeave: (e) => {
                                                    e.currentTarget.style.opacity = '1';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                } }));
                                        },
                                        a({ href, children, node, ...props }) {
                                            return (_jsx(_Fragment, { children: _jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", style: { color: 'var(--c-accent)' }, ...props, children: children }) }));
                                        },
                                        table({ children, node, ...props }) {
                                            return _jsx(TableWithExport, { ...props, children: children });
                                        },
                                        pre({ children }) {
                                            return _jsx(_Fragment, { children: children });
                                        },
                                        code({ className, children, ...props }) {
                                            const lang = className?.replace('language-', '') || '';
                                            const codeText = String(children).replace(/\n$/, '');
                                            const isBlock = Boolean(className) || codeText.includes('\n');
                                            if (!isBlock) {
                                                return (_jsx("code", { className: className, ...props, children: children }));
                                            }
                                            if (lang === 'mib-widget') {
                                                try {
                                                    const parsed = JSON.parse(codeText.trim());
                                                    if (parsed && typeof parsed === 'object' && parsed.type) {
                                                        return (_jsx(Suspense, { fallback: _jsx("div", { style: { padding: 8, color: 'var(--c-text-4)', fontSize: 12 }, children: "Loading widget..." }), children: _jsx(MibWidgetBlock, { block: parsed }) }));
                                                    }
                                                }
                                                catch (err) {
                                                    console.debug('widget JSON parse', err);
                                                }
                                            }
                                            const contentTypes = {
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
                                            };
                                            const contentType = contentTypes[lang];
                                            if (contentType) {
                                                // Extract chart subtype from language tag (e.g. "chart:bar" → "bar")
                                                const chartSubtype = contentType === 'chart' && lang.includes(':')
                                                    ? lang.split(':')[1]
                                                    : undefined;
                                                return (_jsx(Suspense, { fallback: _jsx("div", { style: { padding: 8, color: 'var(--c-text-4)', fontSize: 12 }, children: "Loading preview..." }), children: _jsx(ContentCard, { type: contentType, content: codeText, chartType: chartSubtype, onExpand: onContentExpand }) }));
                                            }
                                            const isShell = ['bash', 'sh', 'zsh', 'shell', 'terminal', 'console'].includes(lang);
                                            let highlightedHtml = '';
                                            try {
                                                const raw = lang && hljs.getLanguage(lang)
                                                    ? hljs.highlight(codeText, { language: lang }).value
                                                    : hljs.highlightAuto(codeText).value;
                                                highlightedHtml = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
                                            }
                                            catch (err) {
                                                console.debug('syntax highlight failed', err);
                                                highlightedHtml = '';
                                            }
                                            return (_jsx(HtmlCodeBlock, { lang: lang, className: className, highlightedHtml: highlightedHtml, codeText: codeText, isShell: isShell, onRunCommand: onRunCommand, props: props, children: children }));
                                        },
                                    }, children: displayContent }), _jsx(ActionTagChips, { tags: actionTags }), !isUser && meta?.taskId && (_jsx(TaskBadge, { taskId: meta.taskId, status: meta.taskStatus })), !isUser &&
                                    meta?.type === 'claude_cli_response' &&
                                    meta.claudeToolEvents &&
                                    (() => {
                                        try {
                                            const events = JSON.parse(meta.claudeToolEvents);
                                            if (events.length === 0)
                                                return null;
                                            const toolCall = {
                                                name: 'claude_cli',
                                                toolEvents: events,
                                                costUsd: meta.claudeCost ? parseFloat(meta.claudeCost) : undefined,
                                                durationMs: meta.claudeDuration ? parseFloat(meta.claudeDuration) : undefined,
                                                sessionId: meta.claudeSessionId,
                                            };
                                            return _jsx(ChatMessageTools, { tools: [toolCall] });
                                        }
                                        catch {
                                            return null;
                                        }
                                    })()] })), !isUser && meta?.partial && (_jsxs("div", { className: "inline-flex items-center gap-1 mt-1.5 px-2 py-1 rounded text-[10px] font-medium", style: {
                                background: 'rgba(245,158,11,0.12)',
                                color: 'rgb(217,119,6)',
                                border: '1px solid rgba(245,158,11,0.2)',
                            }, children: [_jsx("svg", { viewBox: "0 0 16 16", fill: "currentColor", className: "h-3 w-3", children: _jsx("path", { d: "M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 110-1.5.75.75 0 010 1.5z" }) }), "Response was interrupted \u2014 this is a partial reply"] }))] }), !isUser && !streaming && meta && shortModel && (_jsxs("div", { className: "flex items-center gap-1 mt-0.5 px-1", children: [_jsxs("button", { onClick: () => setRouteExpanded((v) => !v), className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-all duration-150 hover:brightness-110", style: {
                                background: meta.route === 'ws'
                                    ? 'rgba(99,102,241,0.12)'
                                    : meta.route === 'cli' || meta.route === 'claude-cli'
                                        ? 'rgba(16,185,129,0.12)'
                                        : 'rgba(245,158,11,0.12)',
                                color: meta.route === 'ws'
                                    ? 'rgb(129,140,248)'
                                    : meta.route === 'cli' || meta.route === 'claude-cli'
                                        ? 'rgb(52,211,153)'
                                        : 'rgb(251,191,36)',
                                border: `1px solid ${meta.route === 'ws' ? 'rgba(99,102,241,0.2)' : meta.route === 'cli' || meta.route === 'claude-cli' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                            }, title: "Click to show routing details", children: [_jsx("span", { children: shortModel }), _jsx("svg", { className: `h-2 w-2 transition-transform duration-150 ${routeExpanded ? 'rotate-180' : ''}`, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M3 5l3 3 3-3" }) })] }), routeExpanded && (_jsxs("div", { className: "inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[9px]", style: {
                                background: 'var(--c-bg-3)',
                                color: 'var(--c-text-4)',
                                border: '1px solid var(--c-border-2)',
                            }, children: [_jsx("span", { title: "Route", children: meta.route?.toUpperCase() }), meta.ttft_ms && _jsxs("span", { title: "Time to first token", children: ["TTFT ", meta.ttft_ms, "ms"] }), meta.total_ms && (_jsxs("span", { title: "Total response time", children: [(Number(meta.total_ms) / 1000).toFixed(1), "s"] }))] }))] })), !isUser && !streaming && processRun && processRun.steps.length > 0 && (_jsxs("div", { className: "flex items-center gap-1 mt-1.5 pt-1.5 flex-wrap", style: { borderTop: '1px solid var(--c-border-2)' }, children: [processRun.steps.map((step) => {
                            const icons = {
                                thinking: '\u25C6',
                                tool_use: '\u26A1',
                                generating: '\u270E',
                                compacting: '\u27F3',
                                done: '\u2713',
                                error: '\u2717',
                            };
                            const colors = {
                                thinking: 'var(--c-warning-soft)',
                                tool_use: 'var(--c-info-soft)',
                                generating: 'var(--c-success-soft)',
                                compacting: 'var(--c-orange)',
                                done: 'var(--c-emerald)',
                                error: 'var(--c-danger-soft)',
                            };
                            return (_jsxs("span", { className: "inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full", style: {
                                    color: colors[step.kind] || 'var(--c-text-4)',
                                    background: 'var(--c-bg-3)',
                                }, title: `${step.label}${step.toolName ? ` (${step.toolName})` : ''}${step.completedAt && step.startedAt ? ` \u2014 ${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s` : ''}`, children: [_jsx("span", { children: icons[step.kind] || '?' }), _jsx("span", { style: { color: 'var(--c-text-4)' }, children: step.toolName || step.label })] }, step.id));
                        }), processRun.durationMs && (_jsxs("span", { className: "text-[9px] ml-auto", style: { color: 'var(--c-text-5)' }, children: [(processRun.durationMs / 1000).toFixed(1), "s"] }))] })), !streaming &&
                    message.content &&
                    !editing &&
                    (isUser ? (_jsxs("div", { className: "flex items-center justify-end gap-0.5 mt-1 px-1", children: [_jsx(CopyButton, { content: message.content }), onAnnotate && (_jsx("button", { onClick: () => {
                                    setAnnotationEditing(true);
                                    setAnnotationDraft(message.annotation || '');
                                }, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100", style: { color: message.annotation ? 'var(--c-accent)' : 'var(--c-text-2)' }, title: message.annotation ? 'Edit annotation' : 'Add annotation', children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" })] }) })), onEditStart && (_jsx("button", { onClick: onEditStart, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5", style: { color: 'var(--c-text-2)' }, title: "Edit message", children: _jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" }) }) })), onBranch && (_jsx("button", { onClick: onBranch, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5", style: { color: 'var(--c-text-2)' }, title: "Branch conversation here", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "18", cy: "18", r: "3" }), _jsx("circle", { cx: "6", cy: "6", r: "3" }), _jsx("circle", { cx: "18", cy: "6", r: "3" }), _jsx("path", { d: "M6 9v3c0 2 2 3 6 3h3" })] }) })), onReaction && (_jsxs("div", { ref: reactionPickerRef, style: { position: 'relative', display: 'inline-block' }, children: [_jsx("button", { onClick: () => setReactionPickerOpen((o) => !o), className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 hover:bg-white/5", style: { color: reactionPickerOpen ? 'var(--c-accent)' : 'var(--c-text-2)' }, title: "Add reaction", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M8 14s1.5 2 4 2 4-2 4-2" }), _jsx("line", { x1: "9", y1: "9", x2: "9.01", y2: "9" }), _jsx("line", { x1: "15", y1: "9", x2: "15.01", y2: "9" })] }) }), reactionPickerOpen && (_jsx("div", { style: {
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
                                        }, children: REACTION_EMOJIS.map((emoji) => (_jsx("button", { onClick: () => {
                                                onReaction(emoji);
                                                setReactionPickerOpen(false);
                                            }, className: "rounded transition-transform hover:scale-125", style: {
                                                padding: '2px 4px',
                                                fontSize: '16px',
                                                lineHeight: 1,
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                            }, title: emoji, children: emoji }, emoji))) }))] })), onReply && (_jsx("button", { onClick: onReply, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100", style: { color: 'var(--c-text-5)' }, title: "Reply to this message", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "9 17 4 12 9 7" }), _jsx("path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" })] }) })), _jsx(CopyButton, { content: message.content, inline: true }), onToggleBookmark && (_jsx("button", { onClick: onToggleBookmark, className: `p-1 rounded transition-colors ${isBookmarked ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'}`, style: { color: isBookmarked ? 'var(--c-accent)' : 'var(--c-text-5)' }, title: isBookmarked ? 'Remove bookmark' : 'Bookmark this message', children: _jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: isBookmarked ? 'currentColor' : 'none', stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }) }) }))] })) : onFeedback ? (_jsx("div", { children: _jsxs("div", { className: "flex items-center gap-0.5", children: [_jsx(MessageActions, { content: message.content, feedback: message.feedback, onFeedback: onFeedback, onRegenerate: onRegenerate, onBranch: onBranch, onReaction: onReaction }), onReply && (_jsx("button", { onClick: onReply, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100", style: { color: 'var(--c-text-5)' }, title: "Reply to this message", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "9 17 4 12 9 7" }), _jsx("path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" })] }) })), onAnnotate && (_jsx("button", { onClick: () => {
                                        setAnnotationEditing(true);
                                        setAnnotationDraft(message.annotation || '');
                                    }, className: "p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100", style: { color: message.annotation ? 'var(--c-accent)' : 'var(--c-text-5)' }, title: message.annotation ? 'Edit annotation' : 'Add annotation', children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" })] }) })), onToggleBookmark && (_jsx("button", { onClick: onToggleBookmark, className: `p-1 rounded transition-colors ${isBookmarked ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'}`, style: { color: isBookmarked ? 'var(--c-accent)' : 'var(--c-text-5)' }, title: isBookmarked ? 'Remove bookmark' : 'Bookmark this message', children: _jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: isBookmarked ? 'currentColor' : 'none', stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }) }) }))] }) })) : null), !isUser && message.content.startsWith('Error:') && onRetry && (_jsxs("button", { onClick: onRetry, className: "mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-125", style: {
                        background: 'rgba(239,68,68,0.1)',
                        color: 'var(--c-danger-soft)',
                        border: '1px solid rgba(239,68,68,0.2)',
                    }, children: [_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "23 4 23 10 17 10" }), _jsx("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })] }), "Retry"] })), annotationEditing && onAnnotate && (_jsx("div", { className: "mt-1 px-1", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { type: "text", className: "flex-1 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-1)',
                                    border: '1px solid var(--c-border-1)',
                                }, value: annotationDraft, onChange: (e) => setAnnotationDraft(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter') {
                                        onAnnotate(annotationDraft);
                                        setAnnotationEditing(false);
                                    }
                                    if (e.key === 'Escape')
                                        setAnnotationEditing(false);
                                }, placeholder: "Add a note...", autoFocus: true }), _jsx("button", { onClick: () => {
                                    onAnnotate(annotationDraft);
                                    setAnnotationEditing(false);
                                }, className: "text-[10px] px-2 py-1 rounded-lg font-medium", style: { color: 'var(--c-on-accent)', background: 'var(--c-accent)' }, children: "Save" }), _jsx("button", { onClick: () => setAnnotationEditing(false), className: "text-[10px] px-1.5 py-1 rounded-lg", style: { color: 'var(--c-text-4)' }, children: "Cancel" })] }) })), !annotationEditing && message.annotation && (_jsxs("div", { className: "mt-1 mx-1 px-2 py-1 rounded-lg text-xs flex items-center gap-1 cursor-pointer", style: {
                        background: 'color-mix(in srgb, var(--c-accent) 10%, transparent)',
                        borderLeft: '2px solid var(--c-accent)',
                        color: 'var(--c-text-3)',
                    }, onClick: () => {
                        if (onAnnotate) {
                            setAnnotationEditing(true);
                            setAnnotationDraft(message.annotation || '');
                        }
                    }, title: "Click to edit annotation", children: [_jsxs("svg", { className: "h-3 w-3 flex-shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" })] }), _jsx("span", { className: "flex-1 truncate", children: message.annotation }), onAnnotate && (_jsx("button", { onClick: (e) => {
                                e.stopPropagation();
                                onAnnotate('');
                            }, className: "flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors", style: { color: 'var(--c-text-5)' }, title: "Remove annotation", children: _jsx("svg", { className: "h-2.5 w-2.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) }))] })), message.reactions && Object.keys(message.reactions).length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1 mt-1 px-1", children: Object.entries(message.reactions).map(([emoji, count]) => (_jsxs("button", { onClick: () => onReaction?.(emoji), className: "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors", style: {
                            background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--c-accent) 25%, transparent)',
                            color: 'var(--c-text-2)',
                            cursor: 'pointer',
                            lineHeight: 1.2,
                        }, title: `${emoji} ${count}`, children: [_jsx("span", { style: { fontSize: '14px' }, children: emoji }), _jsx("span", { style: { fontSize: '11px', fontWeight: 500, color: 'var(--c-text-3)' }, children: count })] }, emoji))) }))] }) }));
});
export default MessageBubble;
