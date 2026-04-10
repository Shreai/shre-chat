import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { lazy, Suspense, useEffect } from 'react';
import { ViewErrorBoundary } from '../ViewErrorBoundary';
import { estimateTokens, formatTokenCount, MAX_RECORDING_SECONDS } from '../chat-utils';
import { usePreferences } from '../preferences-store';
// Lazy-load both emoji data (~300KB) and picker — only fetched when user opens picker
const EmojiPicker = lazy(() => Promise.all([import('@emoji-mart/data'), import('@emoji-mart/react')]).then(([dataModule, mod]) => ({
    default: (props) => _jsx(mod.default, { ...props, data: dataModule.default }),
})));
export function ChatComposer(props) {
    const { input, setInput, onKeyDown, onSend, onAbort, streaming, syncing, writeEnabled, compareMode, compareModelsCount, cliMode, currentAgentName, activeSessionId, messages, inputRef, fileRef, emojiRef, pendingFiles, onFileSelect, onRemovePendingFile, onImageClick, onPaste, showEmoji, setShowEmoji, isRecording, voicePhase, audioLevel, recordingDuration, isSpeaking, interimTranscript, isHandsFree, voiceMode, ttsVoice, ttsProvider, speechSupported, hasSpeechRecognition, onStartRecording, onStopRecording, setIsHandsFree, setVoiceMode, setTtsVoice, setTtsProvider, onStopTTS, showTerminal, termViewMode, onToggleTerminal, onToggleTermViewMode, slashOpen, slashFiltered, slashIndex, slashRef, setSlashIndex, onSlashSelect, mentionOpen, mentionFiltered, mentionIndex, mentionRef, setMentionIndex, onMentionSelect, mentionAgent, replyToIndex, replyToContent, onCancelReply, editingMsgIndex, editingQueueId, onCancelEdit, suggestions, onSelectSuggestion, voiceAnnouncement, queueCount, onInputChange, filteredMessages, claudeCliMode, setClaudeCliMode, } = props;
    const features = usePreferences((s) => s.features);
    // Reset textarea height when input is cleared (e.g. after send)
    useEffect(() => {
        if (!input && inputRef.current) {
            inputRef.current.style.height = '36px';
        }
    }, [input, inputRef]);
    return (_jsxs(_Fragment, { children: [pendingFiles.length > 0 && (_jsx("div", { className: "px-4 py-2 flex gap-2 flex-wrap shrink-0", style: { borderTop: '1px solid var(--c-border-2)' }, children: pendingFiles.map((f) => (_jsxs("div", { className: "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]", style: { background: 'var(--c-bg-card)', color: 'var(--c-text-3)' }, children: [f.type.startsWith('image/') ? (_jsx("img", { src: f.dataUrl, alt: f.name, onClick: () => onImageClick(f.dataUrl), className: "h-8 w-8 rounded object-cover shrink-0 cursor-pointer", style: { transition: 'opacity 0.15s, box-shadow 0.15s' }, onMouseEnter: (e) => {
                                e.currentTarget.style.opacity = '0.85';
                                e.currentTarget.style.boxShadow = '0 0 0 2px var(--c-accent)';
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.boxShadow = 'none';
                            } })) : (_jsxs("svg", { className: "h-3 w-3 shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] })), _jsx("span", { className: "truncate max-w-[120px]", children: f.name }), _jsxs("span", { style: { color: 'var(--c-text-5)' }, children: ["(", (f.size / 1024).toFixed(0), "kb)"] }), _jsx("button", { onClick: () => onRemovePendingFile(f.id), className: "text-red-400/40 hover:text-red-400", "aria-label": "Remove file", children: "\u00D7" })] }, f.id))) })), suggestions.length > 0 && !streaming && (_jsx("div", { className: "px-2 sm:px-4 py-2 shrink-0 flex flex-wrap gap-2 justify-center max-w-3xl mx-auto", children: suggestions.map((s, i) => (_jsx("button", { className: "suggestion-chip text-xs px-3 py-1.5 rounded-full transition-all", style: {
                        background: 'transparent',
                        color: 'var(--c-text-2)',
                        border: '1px solid var(--c-border-2)',
                        cursor: 'pointer',
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.background = 'var(--c-bg-hover)';
                        e.currentTarget.style.borderColor = 'var(--c-accent)';
                        e.currentTarget.style.color = 'var(--c-text-1)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                        e.currentTarget.style.color = 'var(--c-text-2)';
                        e.currentTarget.style.transform = 'none';
                    }, onClick: () => onSelectSuggestion(s), children: s }, i))) })), _jsxs("div", { className: "px-2 sm:px-4 py-1 shrink-0 mobile-safe-bottom mobile-input-sticky mobile-input-area relative", style: { background: 'var(--c-bg-2)', borderTop: '1px solid var(--c-border-2)' }, children: [_jsx("div", { "aria-live": "polite", "aria-atomic": "true", className: "sr-only", children: voiceAnnouncement }), _jsx("input", { ref: fileRef, type: "file", multiple: true, className: "hidden", onChange: onFileSelect, "aria-label": "Upload files", tabIndex: -1 }), slashOpen && slashFiltered.length > 0 && (_jsxs("div", { ref: slashRef, className: "max-w-3xl mx-auto mb-1 rounded-lg overflow-hidden shadow-lg", style: {
                            background: 'var(--c-bg-2)',
                            border: '1px solid var(--c-border-2)',
                            maxHeight: '280px',
                            overflowY: 'auto',
                        }, children: [_jsx("div", { className: "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider", style: { color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border-1)' }, children: "Commands" }), (() => {
                                let lastCategory = '';
                                return slashFiltered.map((cmd, i) => {
                                    const cat = cmd.category || 'session';
                                    const showHeader = cat !== lastCategory;
                                    lastCategory = cat;
                                    const catLabel = cat === 'app' ? 'Apps' : cat === 'platform' ? 'Platform' : '';
                                    return (_jsxs(React.Fragment, { children: [showHeader && catLabel && (_jsx("div", { className: "px-3 py-1 text-[9px] font-semibold uppercase tracking-widest", style: { color: 'var(--c-text-5)', background: 'var(--c-bg-3)' }, children: catLabel })), _jsxs("button", { "data-slash-active": i === slashIndex ? 'true' : 'false', className: "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors", style: {
                                                    background: i === slashIndex ? 'var(--c-bg-hover)' : 'transparent',
                                                    color: 'var(--c-text-1)',
                                                }, onMouseEnter: () => setSlashIndex(i), onMouseDown: (e) => {
                                                    e.preventDefault();
                                                    onSlashSelect(cmd.name.startsWith('model ') ? cmd.name : input.slice(1));
                                                }, children: [_jsx("span", { className: "flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-bold", style: {
                                                            background: 'var(--c-bg-3)',
                                                            color: cat === 'app'
                                                                ? 'var(--c-success, #22c55e)'
                                                                : cat === 'platform'
                                                                    ? 'var(--c-warning, #f59e0b)'
                                                                    : 'var(--c-accent)',
                                                        }, children: "/" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium truncate", children: cmd.name.startsWith('model ') ? cmd.name : cmd.usage }), _jsx("div", { className: "text-xs truncate", style: { color: 'var(--c-text-4)' }, children: cmd.description })] }), i === slashIndex && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: "Enter" }))] })] }, cmd.name));
                                });
                            })()] })), mentionOpen && mentionFiltered.length > 0 && (_jsxs("div", { ref: mentionRef, className: "max-w-3xl mx-auto mb-1 rounded-lg overflow-hidden shadow-lg", style: {
                            background: 'var(--c-bg-2)',
                            border: '1px solid var(--c-border-2)',
                            maxHeight: '240px',
                            overflowY: 'auto',
                        }, children: [_jsx("div", { className: "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider", style: { color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border-1)' }, children: "Mention Agent" }), mentionFiltered.map((agent, i) => (_jsxs("button", { "data-mention-active": i === mentionIndex ? 'true' : 'false', className: "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors", style: {
                                    background: i === mentionIndex ? 'var(--c-bg-hover)' : 'transparent',
                                    color: 'var(--c-text-1)',
                                }, onMouseEnter: () => setMentionIndex(i), onMouseDown: (e) => {
                                    e.preventDefault();
                                    onMentionSelect(agent);
                                }, children: [_jsx("span", { className: "flex items-center justify-center w-6 h-6 rounded text-sm", children: agent.emoji }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium truncate", children: agent.name }), _jsx("div", { className: "text-xs truncate", style: { color: 'var(--c-text-4)' }, children: agent.group })] }), i === mentionIndex && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: "Enter" }))] }, agent.id)))] })), _jsxs("div", { className: "max-w-3xl mx-auto overflow-hidden transition-all", id: "shre-input-box", children: [replyToIndex !== null && replyToContent && (_jsxs("div", { className: "flex items-center gap-2 px-4 py-2 text-xs rounded-lg mb-1", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }, children: [_jsxs("svg", { className: "h-3 w-3 shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "9 17 4 12 9 7" }), _jsx("path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" })] }), _jsxs("span", { className: "flex-1 truncate", style: { color: 'var(--c-text-4)' }, children: ["Replying to: ", replyToContent.replace(/\n/g, ' ').slice(0, 60), replyToContent.length > 60 ? '...' : ''] }), _jsx("button", { onClick: onCancelReply, className: "p-0.5 rounded transition-colors hover:brightness-125", style: { color: 'var(--c-text-5)' }, title: "Cancel reply", children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })), (editingMsgIndex !== null || editingQueueId !== null) && (_jsxs("div", { className: "flex items-center gap-2 px-2 py-1 text-[11px] rounded-lg mb-1", style: { background: 'var(--c-bg-active)', color: 'var(--c-accent)' }, children: [_jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" })] }), _jsx("span", { children: editingQueueId
                                            ? 'Editing queue item — press Ctrl+Enter to save, Escape to cancel'
                                            : 'Editing message — press Ctrl+Enter to resend, Escape to cancel' }), _jsx("button", { onClick: onCancelEdit, className: "ml-auto p-0.5 rounded hover:opacity-80", style: { color: 'var(--c-text-3)' }, children: _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })), mentionAgent && (_jsxs("div", { className: "flex items-center gap-1.5 px-3 py-1 text-[11px]", style: { color: 'var(--c-accent)' }, children: [_jsx("span", { children: mentionAgent.emoji }), _jsxs("span", { children: ["Directing to ", _jsx("strong", { children: mentionAgent.name })] })] })), (isRecording || voicePhase === 'transcribing' ||
                                (!isRecording && !voicePhase.startsWith('trans') && interimTranscript)) && (_jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-lg", style: {
                                    background: 'var(--c-bg-3)',
                                    borderBottom: '1px solid var(--c-border-1)',
                                }, children: [isRecording && voicePhase === 'recording' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-red-400 animate-pulse" }), _jsx("span", { style: { color: '#f87171' }, className: "font-medium", children: "Recording" }), _jsxs("span", { className: "tabular-nums", style: { color: 'var(--c-text-3)' }, children: [Math.floor(recordingDuration / 60), ":", String(recordingDuration % 60).padStart(2, '0')] }), recordingDuration >= MAX_RECORDING_SECONDS - 30 && (_jsx("span", { className: "text-yellow-400 animate-pulse", children: "Stopping soon..." })), _jsx("button", { onClick: onStopRecording, className: "ml-auto text-[10px] px-2 py-0.5 rounded transition-colors", style: { background: 'rgba(239,68,68,0.15)', color: '#f87171' }, children: "Stop" })] })), isRecording && voicePhase === 'waiting' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-yellow-400 animate-pulse" }), _jsx("span", { style: { color: '#facc15' }, children: "Listening for voice..." })] })), voicePhase === 'transcribing' && (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "h-3 w-3 animate-spin text-blue-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [_jsx("circle", { cx: "12", cy: "12", r: "10", opacity: "0.3" }), _jsx("path", { d: "M12 2a10 10 0 0 1 10 10", strokeLinecap: "round" })] }), _jsx("span", { style: { color: '#60a5fa' }, children: "Transcribing..." })] })), !isRecording && !voicePhase.startsWith('trans') && !isSpeaking && interimTranscript && (_jsx("span", { className: "truncate", style: {
                                            color: interimTranscript.includes('failed') || interimTranscript.includes('blocked') ||
                                                interimTranscript.includes('timed') || interimTranscript.includes('error')
                                                ? '#f87171' : 'var(--c-text-4)',
                                        }, children: interimTranscript }))] })), _jsx("textarea", { id: "shre-chat-textarea", ref: inputRef, value: input, onChange: (e) => onInputChange(e.target.value), onKeyDown: onKeyDown, onPaste: onPaste, placeholder: !writeEnabled
                                    ? 'Read-only mode — enable Write in settings'
                                    : syncing && messages.length === 0
                                        ? 'Syncing history...'
                                        : compareMode
                                            ? `Compare ${compareModelsCount} models...`
                                            : streaming
                                                ? `Queue a task for ${currentAgentName}...`
                                                : claudeCliMode
                                                    ? 'Claude Code CLI — describe what to build...'
                                                    : cliMode
                                                        ? 'Claude CLI (subscription mode)...'
                                                        : `Message ${currentAgentName}...`, disabled: (syncing && messages.length === 0) || !writeEnabled, rows: 1, autoCapitalize: "off", "aria-label": "Message input", className: "w-full px-4 pt-3 pb-1 text-base resize-none focus:outline-none disabled:opacity-50 max-h-60 overflow-y-auto bg-transparent", style: { color: 'var(--c-text-1)', minHeight: '44px' }, onFocus: () => {
                                    // On mobile, scroll textarea into view when keyboard opens
                                    setTimeout(() => {
                                        inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
                                    }, 300);
                                }, onInput: (e) => {
                                    const el = e.currentTarget;
                                    el.style.height = '36px';
                                    const maxH = window.innerWidth <= 768 ? 160 : 240;
                                    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
                                } }), _jsxs("div", { className: "flex items-center justify-between px-2 py-1.5", children: [_jsxs("div", { className: "flex items-center gap-0.5", children: [_jsx("button", { tabIndex: -1, onClick: () => fileRef.current?.click(), className: "h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", style: { color: 'var(--c-text-2)' }, title: "Attach file", "aria-label": "Attach file", children: _jsx("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" }) }) }), _jsxs("div", { className: "relative", ref: emojiRef, children: [_jsx("button", { tabIndex: -1, onClick: () => setShowEmoji(!showEmoji), className: "h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", style: { color: showEmoji ? 'var(--c-accent)' : 'var(--c-text-2)' }, title: "Emoji", "aria-label": "Insert emoji", children: _jsxs("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M8 14s1.5 2 4 2 4-2 4-2" }), _jsx("line", { x1: "9", y1: "9", x2: "9.01", y2: "9" }), _jsx("line", { x1: "15", y1: "9", x2: "15.01", y2: "9" })] }) }), showEmoji && (_jsx("div", { className: "fixed sm:absolute bottom-16 sm:bottom-9 left-2 sm:left-0 right-2 sm:right-auto z-50 flex justify-center sm:justify-start", children: _jsx(ViewErrorBoundary, { viewName: "Emoji Picker", children: _jsx(Suspense, { fallback: _jsx("div", { style: {
                                                                        width: 'min(320px, calc(100vw - 16px))',
                                                                        height: 350,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        background: 'var(--bg-card)',
                                                                        borderRadius: 8,
                                                                        color: 'var(--text-secondary)',
                                                                    }, children: "Loading\u2026" }), children: _jsx(EmojiPicker, { theme: "dark", onEmojiSelect: (emoji) => {
                                                                        setInput(input + emoji.native);
                                                                        inputRef.current?.focus();
                                                                        setShowEmoji(false);
                                                                    }, previewPosition: "none", skinTonePosition: "search", dynamicWidth: typeof window !== 'undefined' && window.innerWidth < 640 }) }) }) }))] }), speechSupported && (_jsxs("button", { tabIndex: -1, onClick: () => {
                                                    if (isRecording)
                                                        onStopRecording();
                                                    else
                                                        onStartRecording();
                                                }, onContextMenu: (e) => e.preventDefault(), className: `relative h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${isRecording && voicePhase === 'recording' ? 'bg-red-500/20 text-red-400' : voicePhase === 'transcribing' ? 'bg-blue-500/20 text-blue-400' : ''}`, style: isRecording ? {} : { color: 'var(--c-text-2)' }, title: isRecording ? 'Tap to stop' : 'Tap for voice input', "aria-label": isRecording ? 'Stop recording' : 'Voice input', children: [voicePhase === 'transcribing' ? (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10", opacity: "0.3" }), _jsx("path", { d: "M12 2a10 10 0 0 1 10 10", strokeLinecap: "round" })] })) : isRecording ? (_jsx("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) })) : (_jsxs("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v1a7 7 0 0 1-14 0v-1" }), _jsx("line", { x1: "12", y1: "18", x2: "12", y2: "22" })] })), isRecording && voicePhase === 'recording' && (_jsx("span", { className: "absolute inset-0 rounded-lg pointer-events-none", style: {
                                                            boxShadow: `0 0 ${4 + audioLevel * 16}px ${1 + audioLevel * 4}px rgba(239, 68, 68, ${0.2 + audioLevel * 0.5})`,
                                                            transition: 'box-shadow 100ms ease-out',
                                                        } }))] })), features['claudeCli'] && (_jsxs("button", { tabIndex: -1, onClick: () => setClaudeCliMode(!claudeCliMode), className: `h-8 sm:h-8 rounded-lg flex items-center gap-1.5 px-2 text-xs transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${claudeCliMode ? 'bg-purple-500/20 text-purple-400' : ''}`, style: claudeCliMode ? {} : { color: 'var(--c-text-2)' }, title: claudeCliMode
                                                    ? 'Claude CLI mode ON — coding tasks auto-execute via Claude Code'
                                                    : 'Enable Claude CLI mode for coding tasks', "aria-label": claudeCliMode ? 'Disable Claude CLI mode' : 'Enable Claude CLI mode', children: [_jsxs("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "16 18 22 12 16 6" }), _jsx("polyline", { points: "8 6 2 12 8 18" })] }), claudeCliMode && (_jsx("span", { className: "hidden sm:inline text-[10px] font-medium", children: "CLI" }))] })), features['terminal'] && (_jsx("button", { tabIndex: -1, onClick: onToggleTerminal, className: `h-8 sm:h-8 rounded-lg flex items-center gap-1.5 px-2 text-xs transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${showTerminal ? 'bg-violet-500/20 text-violet-400' : ''}`, style: showTerminal ? {} : { color: 'var(--c-text-2)' }, title: showTerminal ? 'Close terminal' : 'Open terminal', "aria-label": showTerminal ? 'Close terminal' : 'Open terminal', children: _jsxs("svg", { className: "h-4 w-4 sm:h-4 sm:w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "4 17 10 11 4 5" }), _jsx("line", { x1: "12", y1: "19", x2: "20", y2: "19" })] }) })), showTerminal && (_jsx("button", { tabIndex: -1, onClick: onToggleTermViewMode, className: "h-7 rounded-lg flex items-center px-1.5 text-[10px] transition-all hover:brightness-125", style: {
                                                    color: termViewMode === 'tabs' ? 'var(--c-terminal-accent)' : 'var(--c-text-2)',
                                                }, title: termViewMode === 'split' ? 'Switch to tab view' : 'Switch to split view', children: termViewMode === 'split' ? (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "15", rx: "2" }), _jsx("path", { d: "M3 10h18" }), _jsx("path", { d: "M9 6v4" }), _jsx("path", { d: "M15 6v4" })] })) : (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }), _jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" })] })) }))] }), _jsxs("div", { className: "flex items-center gap-1", children: [input.trim() && (_jsx("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: formatTokenCount(estimateTokens(input)) })), streaming && (_jsx("button", { tabIndex: -1, onClick: onAbort, className: "h-7 w-7 rounded-lg flex items-center justify-center transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", title: "Stop", "aria-label": "Stop generating", children: _jsx("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }) })), _jsxs("div", { className: "relative", children: [_jsx("button", { "data-send-btn": true, onClick: () => {
                                                            if (input.trim() && !syncing && writeEnabled)
                                                                onSend();
                                                        }, onKeyDown: (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                if (input.trim() && !syncing && writeEnabled)
                                                                    onSend();
                                                            }
                                                        }, className: "h-7 w-7 rounded-lg flex items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", style: input.trim() && !syncing
                                                            ? {
                                                                background: streaming ? 'var(--c-accent-soft)' : 'var(--c-accent)',
                                                                color: streaming ? 'var(--c-accent)' : 'var(--c-on-accent)',
                                                            }
                                                            : { color: 'var(--c-text-4)', opacity: 0.5 }, "aria-disabled": !input.trim() || syncing || !writeEnabled, title: !writeEnabled
                                                            ? 'Read-only mode — enable Write in settings'
                                                            : streaming
                                                                ? `Add to queue${queueCount ? ` (${queueCount} queued)` : ''}`
                                                                : 'Send (Enter)', "aria-label": streaming ? 'Add to queue' : 'Send message', children: streaming ? (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), _jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })] })) : (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "22", y1: "2", x2: "11", y2: "13" }), _jsx("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })] })) }), queueCount > 0 && (_jsx("span", { className: "absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1", style: { background: 'var(--c-warning)', color: 'var(--c-on-dark)' }, children: queueCount }))] })] })] })] })] })] }));
}
