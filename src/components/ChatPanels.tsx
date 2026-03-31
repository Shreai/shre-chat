/**
 * ChatPanels — Header toolbar, status bars, modals, and drawers
 * Extracted from ChatView to reduce its LOC.
 */
import React, { useRef, useState, useEffect } from 'react';
import { retryConnection } from '../gateway-ws';
import { setModelOverride, ECOSYSTEM_APPS } from '../chat-utils';
import { importSessions, type Session, type View } from '../store';
import type { ChatMessage, RouterModel } from '../openclaw';
import { useI18n } from '../useI18n';
import { LOCALE_LABELS, type Locale } from '../i18n';

import { ModelPicker } from './ModelPicker';
import type { TTSProvider, GatewayMode } from '../preferences-store';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { ShareBar } from './ShareBar';
import { ContextBar } from './ContextBar';
import { ChatSearchBar } from './ChatSearchBar';
import { AppsDrawer } from './AppsDrawer';
import { SystemPromptEditor } from './SystemPromptEditor';
import { SummaryModal } from './SummaryModal';
import { SessionAnalyticsModal } from './SessionAnalyticsModal';

interface ChatPanelsProps {
  // Session
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | undefined;
  activeAgentId: string;
  editingTabId: string | null;
  editingTabText: string;
  setEditingTabId: (id: string | null) => void;
  setEditingTabText: (text: string) => void;
  cliMode: boolean;
  actions: any;
  // Model picker
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  selectedModel: string | null;
  setSelectedModel: (v: string | null) => void;
  AVAILABLE_MODELS: {
    id: string;
    name: string;
    provider: string;
    icon: string;
    connected?: boolean;
  }[];
  MODEL_CONTEXT_LIMITS: Record<string, number>;
  dynamicModelsCount: number;
  currentAgent: { name: string; id: string; emoji: string };
  modelPickerRef: React.RefObject<HTMLDivElement | null>;
  ensureSession: () => string;
  // Voice provider
  ttsProvider: TTSProvider;
  setTtsProvider: (v: TTSProvider) => void;
  // Voice chat
  onOpenVoiceChat: () => void;
  // Header more menu
  showHeaderMore: boolean;
  setShowHeaderMore: (v: boolean) => void;
  headerMoreRef: React.RefObject<HTMLDivElement | null>;
  openclawMode: boolean;
  handleToggleOpenclawMode: () => void;
  gatewayMode: GatewayMode;
  handleSetGatewayMode: (mode: GatewayMode) => void;
  compareMode: boolean;
  compareModels: string[];
  handleToggleCompare: (len: number) => void;
  setCompareStreams: (v: Record<string, any>) => void;
  setCompareWinner: (v: string | null) => void;
  comparePickerRef: React.RefObject<HTMLDivElement | null>;
  handleOpenSystemPrompt: () => void;
  compact: boolean;
  notifSound: boolean;
  handleToggleNotifSound: () => void;
  messages: ChatMessage[];
  userName: string;
  summarizing: boolean;
  handleSummarize: () => void;
  showAnalytics: boolean;
  setShowAnalytics: (v: boolean) => void;
  handleShare: () => void;
  handleCopyMarkdown: () => void;
  handleDownloadMd: () => void;
  handleDownloadJson: () => void;
  showApps: boolean;
  setShowApps: (v: boolean) => void;
  view: View;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  // WS state
  wsFailed: boolean;
  setWsFailed: (v: boolean) => void;
  setWsConnected: (v: boolean) => void;
  // Share
  shareUrl: string | null;
  shareCopied: boolean;
  setShareCopied: (v: boolean) => void;
  setShareUrl: (v: string | null) => void;
  // Offline queue
  offlineQueue: any[];
  // Context bar
  selectedModelForContext: string | null;
  // Search
  chatSearchOpen: boolean;
  chatSearchRef: React.RefObject<HTMLInputElement | null>;
  chatSearch: string;
  setChatSearch: (v: string) => void;
  closeChatSearch: () => void;
  chatSearchNavigate: (dir: 1 | -1) => void;
  chatSearchResults: number[];
  chatSearchIndex: number;
  // System prompt
  showSystemPrompt: boolean;
  setShowSystemPrompt: (v: boolean) => void;
  systemPromptDraft: string;
  setSystemPromptDraft: (v: string) => void;
  handleSaveSystemPrompt: () => void;
  // Summary
  showSummary: boolean;
  setShowSummary: (v: boolean) => void;
  summaryText: string;
}

export function ChatPanels(props: ChatPanelsProps) {
  const {
    sessions,
    activeSessionId,
    activeSession,
    activeAgentId,
    editingTabId,
    editingTabText,
    setEditingTabId,
    setEditingTabText,
    cliMode,
    actions,
    showModelPicker,
    setShowModelPicker,
    selectedModel,
    setSelectedModel,
    AVAILABLE_MODELS,
    MODEL_CONTEXT_LIMITS,
    dynamicModelsCount,
    currentAgent,
    modelPickerRef,
    ttsProvider,
    setTtsProvider,
    ensureSession,
    onOpenVoiceChat,
    showHeaderMore,
    setShowHeaderMore,
    headerMoreRef,
    openclawMode,
    handleToggleOpenclawMode,
    gatewayMode,
    handleSetGatewayMode,
    compareMode,
    compareModels,
    handleToggleCompare,
    setCompareStreams,
    setCompareWinner,
    comparePickerRef,
    handleOpenSystemPrompt,
    compact,
    notifSound,
    handleToggleNotifSound,
    messages,
    userName,
    summarizing,
    handleSummarize,
    showAnalytics,
    setShowAnalytics,
    handleShare,
    handleCopyMarkdown,
    handleDownloadMd,
    handleDownloadJson,
    showApps,
    setShowApps,
    view,
    importInputRef,
    wsFailed,
    setWsFailed,
    setWsConnected,
    shareUrl,
    shareCopied,
    setShareCopied,
    setShareUrl,
    offlineQueue,
    chatSearchOpen,
    chatSearchRef,
    chatSearch,
    setChatSearch,
    closeChatSearch,
    chatSearchNavigate,
    chatSearchResults,
    chatSearchIndex,
    showSystemPrompt,
    setShowSystemPrompt,
    systemPromptDraft,
    setSystemPromptDraft,
    handleSaveSystemPrompt,
    showSummary,
    setShowSummary,
    summaryText,
  } = props;

  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const voicePickerRef = useRef<HTMLDivElement>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);
  const { locale, setLocale } = useI18n();

  // Close pickers on outside click
  useEffect(() => {
    if (!voicePickerOpen && !langPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (voicePickerOpen && voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
        setVoicePickerOpen(false);
      }
      if (langPickerOpen && langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setLangPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [voicePickerOpen, langPickerOpen]);

  return (
    <>
      {/* Compact toolbar -- model picker + options */}
      <header
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          background: 'var(--c-bg-2)',
          borderBottom: '1px solid var(--c-border-2)',
          zIndex: 30,
          position: 'relative',
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 shre-no-drag">
          {(() => {
            const s = sessions.find((x) => x.id === activeSessionId);
            if (!s) return null;
            return editingTabId === s.id ? (
              <input
                autoFocus
                value={editingTabText}
                onChange={(e) => setEditingTabText(e.target.value)}
                onBlur={() => {
                  if (editingTabText.trim())
                    actions.updateSessionTitle(s.id, editingTabText.trim());
                  setEditingTabId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingTabText.trim())
                      actions.updateSessionTitle(s.id, editingTabText.trim());
                    setEditingTabId(null);
                  }
                  if (e.key === 'Escape') setEditingTabId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-[180px] sm:max-w-[260px] bg-transparent outline-none text-[12px] tracking-tight rounded px-1"
                style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-accent)' }}
              />
            ) : (
              <span
                className="text-[12px] tracking-tight truncate max-w-[180px] sm:max-w-[260px] cursor-default"
                style={{ color: 'var(--c-text-3)' }}
                onDoubleClick={() => {
                  setEditingTabId(s.id);
                  setEditingTabText(s.title);
                }}
                title="Double-click to rename"
              >
                {s.title}
              </span>
            );
          })()}

          {cliMode && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium"
              style={{ background: 'rgba(168,85,247,0.12)', color: 'var(--c-purple)' }}
            >
              CLI
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ModelPicker
            open={showModelPicker}
            onToggle={() => setShowModelPicker(!showModelPicker)}
            onClose={() => setShowModelPicker(false)}
            selectedModel={selectedModel}
            onSelectModel={(modelId) => {
              const providerLabels: Record<string, string> = {
                'provider:openai': 'ChatGPT',
                'provider:anthropic': 'Claude',
                'provider:ollama': 'Local',
                'provider:google': 'Google',
              };
              const prevName =
                providerLabels[selectedModel ?? ''] ??
                AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name ??
                selectedModel ??
                'Auto';
              setSelectedModel(modelId);
              setModelOverride(activeAgentId, modelId);
              const sid = ensureSession();
              const newName =
                providerLabels[modelId ?? ''] ??
                AVAILABLE_MODELS.find((m) => m.id === modelId)?.name ??
                modelId ??
                'Auto';
              actions.addMessage(sid, {
                role: 'assistant',
                content: `[system] Model switched from ${prevName} to ${newName}. Connected.`,
                timestamp: Date.now(),
                meta: { system: 'true' },
              });
            }}
            models={AVAILABLE_MODELS}
            agentName={currentAgent.name}
            pickerRef={modelPickerRef}
          />

          {/* Voice engine selector — icon + dropdown */}
          <div className="relative" ref={voicePickerRef}>
            <button
              onClick={() => setVoicePickerOpen((v) => !v)}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{
                color: ttsProvider === 'personaplex'
                  ? '#76b900'
                  : ttsProvider === 'elevenlabs'
                    ? '#818cf8'
                    : 'var(--c-text-3)',
              }}
              title={`Voice: ${ttsProvider === 'personaplex' ? 'PersonaPlex' : ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'Auto'}`}
              aria-label="Select voice engine"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
            {voicePickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVoicePickerOpen(false)} />
                <div
                  className="absolute right-0 z-50 rounded-xl overflow-hidden shadow-2xl voice-picker-dropdown"
                  style={{
                    width: 220,
                    top: '100%',
                    marginTop: 4,
                    background: 'var(--c-bg-2)',
                    border: '1px solid var(--c-border-1)',
                    animation: 'picker-fade-in 150ms ease-out forwards',
                  }}
                >
                  <div className="px-3 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--c-text-1)' }}>Voice Engine</span>
                  </div>
                  {([
                    { id: 'auto' as const, label: 'Auto', subtitle: 'Best available', icon: '\u26A1', color: 'var(--c-text-2)' },
                    { id: 'elevenlabs' as const, label: 'ElevenLabs', subtitle: 'Cloud neural voice', icon: '\uD83C\uDF10', color: '#818cf8' },
                    { id: 'personaplex' as const, label: 'PersonaPlex', subtitle: 'NVIDIA local TTS', icon: '\uD83D\uDDA5\uFE0F', color: '#76b900' },
                  ]).map((v) => {
                    const active = ttsProvider === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => { setTtsProvider(v.id); setVoicePickerOpen(false); }}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                        style={{
                          color: active ? v.color : 'var(--c-text-2)',
                          background: active ? 'var(--c-accent-soft)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--c-bg-hover)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span className="text-base w-6 text-center">{v.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium">{v.label}</div>
                          <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>{v.subtitle}</div>
                        </div>
                        {active && (
                          <svg className="h-4 w-4 shrink-0" style={{ color: v.color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Language picker */}
          <div className="relative" ref={langPickerRef}>
            <button
              onClick={() => setLangPickerOpen((v) => !v)}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: langPickerOpen ? 'var(--c-text-1)' : 'var(--c-text-3)' }}
              title={`Language: ${LOCALE_LABELS[locale]}`}
              aria-label="Select language"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </button>
            {langPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangPickerOpen(false)} />
                <div
                  className="absolute right-0 z-50 rounded-xl overflow-hidden shadow-2xl lang-picker-dropdown"
                  style={{
                    width: 200,
                    top: '100%',
                    marginTop: 4,
                    maxHeight: 'min(360px, calc(100vh - 100px))',
                    background: 'var(--c-bg-2)',
                    border: '1px solid var(--c-border-1)',
                    animation: 'picker-fade-in 150ms ease-out forwards',
                  }}
                >
                  <div className="px-3 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--c-text-1)' }}>Language</span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
                    {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => {
                      const active = locale === code;
                      return (
                        <button
                          key={code}
                          onClick={() => { setLocale(code); setLangPickerOpen(false); }}
                          className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                          style={{
                            color: active ? 'var(--c-accent)' : 'var(--c-text-2)',
                            background: active ? 'var(--c-accent-soft)' : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--c-bg-hover)'; }}
                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="flex-1 text-[12px]">{label}</span>
                          {active && (
                            <svg className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--c-accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Voice chat — opens dedicated voice screen */}
          <button
            onClick={onOpenVoiceChat}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-text-3)' }}
            aria-label="Open voice chat"
            title="Voice chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          <div className="relative" ref={headerMoreRef}>
            <button
              onClick={() => setShowHeaderMore(!showHeaderMore)}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: showHeaderMore ? 'var(--c-text-1)' : 'var(--c-text-3)' }}
              aria-label="More options"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>

            <HeaderMoreMenu
              open={showHeaderMore}
              onClose={() => setShowHeaderMore(false)}
              openclawMode={openclawMode}
              onToggleOpenclawMode={handleToggleOpenclawMode}
              gatewayMode={gatewayMode}
              onSetGatewayMode={handleSetGatewayMode}
              compareMode={compareMode}
              onToggleCompare={() => {
                handleToggleCompare(compareModels.length);
                if (compareMode) {
                  setCompareStreams({});
                  setCompareWinner(null);
                }
              }}
              comparePickerRef={comparePickerRef}
              activeSession={activeSession}
              onOpenSystemPrompt={handleOpenSystemPrompt}
              compact={compact}
              onToggleCompact={() => actions.toggleCompact()}
              notifSound={notifSound}
              onToggleNotifSound={handleToggleNotifSound}
              messages={messages}
              userName={userName}
              currentAgentName={currentAgent.name}
              summarizing={summarizing}
              onSummarize={handleSummarize}
              onOpenAnalytics={() => setShowAnalytics(true)}
              activeSessionId={activeSessionId}
              onShare={handleShare}
              onCopyMarkdown={handleCopyMarkdown}
              onDownloadMd={handleDownloadMd}
              onDownloadJson={handleDownloadJson}
              onToggleApps={() => setShowApps(!showApps)}
              view={view}
              onSetView={(v) => actions.setView(v as View)}
              sessions={sessions}
              importInputRef={importInputRef}
              onImportSessions={() => importInputRef.current?.click()}
            />
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importSessions(
                  file,
                  sessions,
                  () => window.location.reload(),
                  (msg: string) => {
                    actions.setStatusLine(msg);
                    setTimeout(() => actions.setStatusLine(null), 3000);
                  },
                );
              }
              e.target.value = '';
            }}
          />

          {wsFailed && (
            <button
              onClick={() => {
                setWsFailed(false);
                retryConnection()
                  .then(() => setWsConnected(true))
                  .catch(() => {});
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors font-medium"
              style={{ color: 'var(--c-danger)', background: 'var(--c-danger-bg)' }}
              aria-label="Reconnect to gateway"
            >
              Reconnect
            </button>
          )}
        </div>
      </header>

      {shareUrl && (
        <ShareBar
          shareUrl={shareUrl}
          shareCopied={shareCopied}
          onCopy={() => {
            navigator.clipboard.writeText(shareUrl).then(() => {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 2000);
            });
          }}
          onClose={() => setShareUrl(null)}
        />
      )}

      {/* Offline message queue indicator */}
      {offlineQueue.length > 0 && (
        <div
          className="shrink-0 flex items-center justify-center gap-2 px-3 py-1 text-[10px]"
          style={{
            background: 'rgba(234, 179, 8, 0.08)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.15)',
            color: 'var(--c-yellow)',
          }}
        >
          <span className="ws-reconnect-pulse inline-block h-1 w-1 rounded-full bg-yellow-400" />
          {offlineQueue.length === 1
            ? '1 message queued \u2014 sending when reconnected...'
            : `${offlineQueue.length} messages queued \u2014 sending when reconnected...`}
        </div>
      )}

      {/* Context window usage bar */}
      <ContextBar
        messages={messages}
        selectedModel={selectedModel}
        modelContextLimits={MODEL_CONTEXT_LIMITS}
        dynamicModelsCount={dynamicModelsCount}
      />

      {/* In-chat search bar (Cmd+F) */}
      {chatSearchOpen && (
        <ChatSearchBar
          chatSearchRef={chatSearchRef}
          chatSearch={chatSearch}
          onSearchChange={setChatSearch}
          onClose={closeChatSearch}
          onNavigate={chatSearchNavigate}
          chatSearchResults={chatSearchResults}
          chatSearchIndex={chatSearchIndex}
        />
      )}

      {/* Apps drawer */}
      {showApps && <AppsDrawer onClose={() => setShowApps(false)} />}

      {/* System prompt modal */}
      <SystemPromptEditor
        isOpen={showSystemPrompt}
        onClose={() => setShowSystemPrompt(false)}
        draft={systemPromptDraft}
        onDraftChange={setSystemPromptDraft}
        onSave={handleSaveSystemPrompt}
        onClear={() => setSystemPromptDraft('')}
      />

      {/* Summary modal */}
      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        summaryText={summaryText}
        onCopy={() => {
          navigator.clipboard?.writeText(summaryText).then(() => {
            actions.setStatusLine('Summary copied to clipboard');
            setTimeout(() => actions.setStatusLine(null), 2000);
          });
        }}
      />

      {/* Session Analytics Modal */}
      <SessionAnalyticsModal
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        messages={messages}
      />
    </>
  );
}
