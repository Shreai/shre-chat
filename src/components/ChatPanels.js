import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * ChatPanels — Header toolbar, status bars, modals, and drawers
 * Extracted from ChatView to reduce its LOC.
 */
import { useRef, useState, useEffect } from 'react';
import { retryConnection } from '../gateway-ws';
import { setModelOverride } from '../chat-utils';
import { importSessions } from '../store';
import { useI18n } from '../useI18n';
import { LOCALE_LABELS } from '../i18n';
import { ModelPicker } from './ModelPicker';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { ShareBar } from './ShareBar';
import { ContextBar } from './ContextBar';
import { ChatSearchBar } from './ChatSearchBar';
import { AppsDrawer } from './AppsDrawer';
import { SystemPromptEditor } from './SystemPromptEditor';
import { SummaryModal } from './SummaryModal';
import { SessionAnalyticsModal } from './SessionAnalyticsModal';
export function ChatPanels(props) {
    const { sessions, activeSessionId, activeSession, activeAgentId, editingTabId, editingTabText, setEditingTabId, setEditingTabText, cliMode, actions, showModelPicker, setShowModelPicker, selectedModel, setSelectedModel, AVAILABLE_MODELS, MODEL_CONTEXT_LIMITS, dynamicModelsCount, currentAgent, modelPickerRef, ttsProvider, setTtsProvider, ensureSession, onOpenVoiceChat, onOpenRealtimeVoice, showHeaderMore, setShowHeaderMore, headerMoreRef, routerMode, handleToggleRouterMode, gatewayMode, handleSetGatewayMode, compareMode, compareModels, handleToggleCompare, setCompareStreams, setCompareWinner, comparePickerRef, handleOpenSystemPrompt, compact, notifSound, handleToggleNotifSound, messages, userName, summarizing, handleSummarize, showAnalytics, setShowAnalytics, handleShare, handleCopyMarkdown, handleDownloadMd, handleDownloadJson, showApps, setShowApps, view, importInputRef, wsFailed, setWsFailed, setWsConnected, shareUrl, shareCopied, setShareCopied, setShareUrl, offlineQueue, chatSearchOpen, chatSearchRef, chatSearch, setChatSearch, closeChatSearch, chatSearchNavigate, chatSearchResults, chatSearchIndex, showSystemPrompt, setShowSystemPrompt, systemPromptDraft, setSystemPromptDraft, handleSaveSystemPrompt, showSummary, setShowSummary, summaryText, } = props;
    const [voicePickerOpen, setVoicePickerOpen] = useState(false);
    const voicePickerRef = useRef(null);
    const [langPickerOpen, setLangPickerOpen] = useState(false);
    const langPickerRef = useRef(null);
    const { locale, setLocale } = useI18n();
    // Close pickers on outside click
    useEffect(() => {
        if (!voicePickerOpen && !langPickerOpen)
            return;
        const handler = (e) => {
            if (voicePickerOpen && voicePickerRef.current && !voicePickerRef.current.contains(e.target)) {
                setVoicePickerOpen(false);
            }
            if (langPickerOpen && langPickerRef.current && !langPickerRef.current.contains(e.target)) {
                setLangPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [voicePickerOpen, langPickerOpen]);
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "flex items-center justify-between px-3 py-1.5 shrink-0", style: {
                    background: 'var(--c-bg-2)',
                    borderBottom: '1px solid var(--c-border-2)',
                    zIndex: 30,
                    position: 'relative',
                }, children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0 flex-1 shre-no-drag", children: [(() => {
                                const s = sessions.find((x) => x.id === activeSessionId);
                                if (!s)
                                    return null;
                                return editingTabId === s.id ? (_jsx("input", { autoFocus: true, value: editingTabText, onChange: (e) => setEditingTabText(e.target.value), onBlur: () => {
                                        if (editingTabText.trim())
                                            actions.updateSessionTitle(s.id, editingTabText.trim());
                                        setEditingTabId(null);
                                    }, onKeyDown: (e) => {
                                        if (e.key === 'Enter') {
                                            if (editingTabText.trim())
                                                actions.updateSessionTitle(s.id, editingTabText.trim());
                                            setEditingTabId(null);
                                        }
                                        if (e.key === 'Escape')
                                            setEditingTabId(null);
                                    }, onClick: (e) => e.stopPropagation(), className: "max-w-[180px] sm:max-w-[260px] bg-transparent outline-none text-[12px] tracking-tight rounded px-1", style: { color: 'var(--c-text-2)', border: '1px solid var(--c-accent)' } })) : (_jsx("span", { className: "text-[12px] tracking-tight truncate max-w-[180px] sm:max-w-[260px] cursor-default", style: { color: 'var(--c-text-3)' }, onDoubleClick: () => {
                                        setEditingTabId(s.id);
                                        setEditingTabText(s.title);
                                    }, title: "Double-click to rename", children: s.title }));
                            })(), cliMode && (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium", style: { background: 'rgba(168,85,247,0.12)', color: 'var(--c-purple)' }, children: "CLI" }))] }), _jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [_jsx(ModelPicker, { open: showModelPicker, onToggle: () => setShowModelPicker(!showModelPicker), onClose: () => setShowModelPicker(false), selectedModel: selectedModel, onSelectModel: (modelId) => {
                                    const providerLabels = {
                                        'provider:openai': 'ChatGPT',
                                        'provider:anthropic': 'Claude',
                                        'provider:ollama': 'Local',
                                        'provider:google': 'Google',
                                    };
                                    const prevName = providerLabels[selectedModel ?? ''] ??
                                        AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name ??
                                        selectedModel ??
                                        'Auto';
                                    setSelectedModel(modelId);
                                    setModelOverride(activeAgentId, modelId);
                                    const sid = ensureSession();
                                    const newName = providerLabels[modelId ?? ''] ??
                                        AVAILABLE_MODELS.find((m) => m.id === modelId)?.name ??
                                        modelId ??
                                        'Auto';
                                    actions.addMessage(sid, {
                                        role: 'assistant',
                                        content: `[system] Model switched from ${prevName} to ${newName}. Connected.`,
                                        timestamp: Date.now(),
                                        meta: { system: 'true' },
                                    });
                                }, models: AVAILABLE_MODELS, agentName: currentAgent.name, pickerRef: modelPickerRef }), _jsxs("div", { className: "relative", ref: voicePickerRef, children: [_jsx("button", { onClick: () => setVoicePickerOpen((v) => !v), className: "h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: {
                                            color: ttsProvider === 'personaplex'
                                                ? '#76b900'
                                                : ttsProvider === 'elevenlabs'
                                                    ? '#818cf8'
                                                    : 'var(--c-text-3)',
                                        }, title: `Voice: ${ttsProvider === 'personaplex' ? 'PersonaPlex' : ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'Auto'}`, "aria-label": "Select voice engine", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }), _jsx("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }), _jsx("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })] }) }), voicePickerOpen && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40", onClick: () => setVoicePickerOpen(false) }), _jsxs("div", { className: "absolute right-0 z-50 rounded-xl overflow-hidden shadow-2xl voice-picker-dropdown", style: {
                                                    width: 220,
                                                    top: '100%',
                                                    marginTop: 4,
                                                    background: 'var(--c-bg-2)',
                                                    border: '1px solid var(--c-border-1)',
                                                    animation: 'picker-fade-in 150ms ease-out forwards',
                                                }, children: [_jsx("div", { className: "px-3 pt-2.5 pb-1.5", style: { borderBottom: '1px solid var(--c-border-2)' }, children: _jsx("span", { className: "text-[12px] font-semibold", style: { color: 'var(--c-text-1)' }, children: "Voice Engine" }) }), ([
                                                        { id: 'auto', label: 'Auto', subtitle: 'Best available', icon: '\u26A1', color: 'var(--c-text-2)' },
                                                        { id: 'elevenlabs', label: 'ElevenLabs', subtitle: 'Cloud neural voice', icon: '\uD83C\uDF10', color: '#818cf8' },
                                                        { id: 'personaplex', label: 'PersonaPlex', subtitle: 'NVIDIA local TTS', icon: '\uD83D\uDDA5\uFE0F', color: '#76b900' },
                                                    ]).map((v) => {
                                                        const active = ttsProvider === v.id;
                                                        return (_jsxs("button", { onClick: () => { setTtsProvider(v.id); setVoicePickerOpen(false); }, className: "w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors", style: {
                                                                color: active ? v.color : 'var(--c-text-2)',
                                                                background: active ? 'var(--c-accent-soft)' : 'transparent',
                                                            }, onMouseEnter: (e) => { if (!active)
                                                                e.currentTarget.style.background = 'var(--c-bg-hover)'; }, onMouseLeave: (e) => { if (!active)
                                                                e.currentTarget.style.background = 'transparent'; }, children: [_jsx("span", { className: "text-base w-6 text-center", children: v.icon }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[12px] font-medium", children: v.label }), _jsx("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: v.subtitle })] }), active && (_jsx("svg", { className: "h-4 w-4 shrink-0", style: { color: v.color }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }))] }, v.id));
                                                    })] })] }))] }), _jsxs("div", { className: "relative", ref: langPickerRef, children: [_jsx("button", { onClick: () => setLangPickerOpen((v) => !v), className: "h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: { color: langPickerOpen ? 'var(--c-text-1)' : 'var(--c-text-3)' }, title: `Language: ${LOCALE_LABELS[locale]}`, "aria-label": "Select language", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), _jsx("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })] }) }), langPickerOpen && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40", onClick: () => setLangPickerOpen(false) }), _jsxs("div", { className: "absolute right-0 z-50 rounded-xl overflow-hidden shadow-2xl lang-picker-dropdown", style: {
                                                    width: 200,
                                                    top: '100%',
                                                    marginTop: 4,
                                                    maxHeight: 'min(360px, calc(100vh - 100px))',
                                                    background: 'var(--c-bg-2)',
                                                    border: '1px solid var(--c-border-1)',
                                                    animation: 'picker-fade-in 150ms ease-out forwards',
                                                }, children: [_jsx("div", { className: "px-3 pt-2.5 pb-1.5", style: { borderBottom: '1px solid var(--c-border-2)' }, children: _jsx("span", { className: "text-[12px] font-semibold", style: { color: 'var(--c-text-1)' }, children: "Language" }) }), _jsx("div", { className: "overflow-y-auto", style: { maxHeight: 300 }, children: Object.entries(LOCALE_LABELS).map(([code, label]) => {
                                                            const active = locale === code;
                                                            return (_jsxs("button", { onClick: () => { setLocale(code); setLangPickerOpen(false); }, className: "w-full text-left px-3 py-2 flex items-center gap-3 transition-colors", style: {
                                                                    color: active ? 'var(--c-accent)' : 'var(--c-text-2)',
                                                                    background: active ? 'var(--c-accent-soft)' : 'transparent',
                                                                }, onMouseEnter: (e) => { if (!active)
                                                                    e.currentTarget.style.background = 'var(--c-bg-hover)'; }, onMouseLeave: (e) => { if (!active)
                                                                    e.currentTarget.style.background = 'transparent'; }, children: [_jsx("span", { className: "flex-1 text-[12px]", children: label }), active && (_jsx("svg", { className: "h-3.5 w-3.5 shrink-0", style: { color: 'var(--c-accent)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }))] }, code));
                                                        }) })] })] }))] }), _jsx("button", { onClick: onOpenVoiceChat, className: "h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)', minHeight: 32, minWidth: 32 }, "aria-label": "Open voice chat", title: "Voice chat", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }), _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" })] }) }), onOpenRealtimeVoice && (_jsx("button", { onClick: onOpenRealtimeVoice, className: "h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)' }, "aria-label": "Realtime voice call", title: "Realtime voice (full-duplex)", children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" }) }) })), _jsxs("div", { className: "relative", ref: headerMoreRef, children: [_jsx("button", { onClick: () => setShowHeaderMore(!showHeaderMore), className: "h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: { color: showHeaderMore ? 'var(--c-text-1)' : 'var(--c-text-3)' }, "aria-label": "More options", children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "currentColor", children: [_jsx("circle", { cx: "12", cy: "5", r: "1.5" }), _jsx("circle", { cx: "12", cy: "12", r: "1.5" }), _jsx("circle", { cx: "12", cy: "19", r: "1.5" })] }) }), _jsx(HeaderMoreMenu, { open: showHeaderMore, onClose: () => setShowHeaderMore(false), routerMode: routerMode, onToggleRouterMode: handleToggleRouterMode, gatewayMode: gatewayMode, onSetGatewayMode: handleSetGatewayMode, compareMode: compareMode, onToggleCompare: () => {
                                            handleToggleCompare(compareModels.length);
                                            if (compareMode) {
                                                setCompareStreams({});
                                                setCompareWinner(null);
                                            }
                                        }, comparePickerRef: comparePickerRef, activeSession: activeSession, onOpenSystemPrompt: handleOpenSystemPrompt, compact: compact, onToggleCompact: () => actions.toggleCompact(), notifSound: notifSound, onToggleNotifSound: handleToggleNotifSound, messages: messages, userName: userName, currentAgentName: currentAgent.name, summarizing: summarizing, onSummarize: handleSummarize, onOpenAnalytics: () => setShowAnalytics(true), activeSessionId: activeSessionId, onShare: handleShare, onCopyMarkdown: handleCopyMarkdown, onDownloadMd: handleDownloadMd, onDownloadJson: handleDownloadJson, onToggleApps: () => setShowApps(!showApps), view: view, onSetView: (v) => actions.setView(v), sessions: sessions, importInputRef: importInputRef, onImportSessions: () => importInputRef.current?.click() })] }), _jsx("input", { ref: importInputRef, type: "file", accept: ".json", className: "hidden", onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        importSessions(file, sessions, () => window.location.reload(), (msg) => {
                                            actions.setStatusLine(msg);
                                            setTimeout(() => actions.setStatusLine(null), 3000);
                                        });
                                    }
                                    e.target.value = '';
                                } }), wsFailed && (_jsx("button", { onClick: () => {
                                    setWsFailed(false);
                                    retryConnection()
                                        .then(() => setWsConnected(true))
                                        .catch(() => { });
                                }, className: "text-[11px] px-2.5 py-1 rounded-lg transition-colors font-medium", style: { color: 'var(--c-danger)', background: 'var(--c-danger-bg)' }, "aria-label": "Reconnect to gateway", children: "Reconnect" }))] })] }), shareUrl && (_jsx(ShareBar, { shareUrl: shareUrl, shareCopied: shareCopied, onCopy: () => {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                    });
                }, onClose: () => setShareUrl(null) })), offlineQueue.length > 0 && (_jsxs("div", { className: "shrink-0 flex items-center justify-center gap-2 px-3 py-1 text-[10px]", style: {
                    background: 'rgba(234, 179, 8, 0.08)',
                    borderBottom: '1px solid rgba(234, 179, 8, 0.15)',
                    color: 'var(--c-yellow)',
                }, children: [_jsx("span", { className: "ws-reconnect-pulse inline-block h-1 w-1 rounded-full bg-yellow-400" }), offlineQueue.length === 1
                        ? '1 message queued \u2014 sending when reconnected...'
                        : `${offlineQueue.length} messages queued \u2014 sending when reconnected...`] })), _jsx(ContextBar, { messages: messages, selectedModel: selectedModel, modelContextLimits: MODEL_CONTEXT_LIMITS, dynamicModelsCount: dynamicModelsCount }), chatSearchOpen && (_jsx(ChatSearchBar, { chatSearchRef: chatSearchRef, chatSearch: chatSearch, onSearchChange: setChatSearch, onClose: closeChatSearch, onNavigate: chatSearchNavigate, chatSearchResults: chatSearchResults, chatSearchIndex: chatSearchIndex })), showApps && _jsx(AppsDrawer, { onClose: () => setShowApps(false) }), _jsx(SystemPromptEditor, { isOpen: showSystemPrompt, onClose: () => setShowSystemPrompt(false), draft: systemPromptDraft, onDraftChange: setSystemPromptDraft, onSave: handleSaveSystemPrompt, onClear: () => setSystemPromptDraft('') }), _jsx(SummaryModal, { isOpen: showSummary, onClose: () => setShowSummary(false), summaryText: summaryText, onCopy: () => {
                    navigator.clipboard?.writeText(summaryText).then(() => {
                        actions.setStatusLine('Summary copied to clipboard');
                        setTimeout(() => actions.setStatusLine(null), 2000);
                    });
                } }), _jsx(SessionAnalyticsModal, { isOpen: showAnalytics, onClose: () => setShowAnalytics(false), messages: messages })] }));
}
