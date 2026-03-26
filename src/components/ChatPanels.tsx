/**
 * ChatPanels — Header toolbar, status bars, modals, and drawers
 * Extracted from ChatView to reduce its LOC.
 */
import React, { useRef } from "react";
import { retryConnection } from "../gateway-ws";
import { setModelOverride, ECOSYSTEM_APPS } from "../chat-utils";
import { importSessions, type Session, type View } from "../store";
import type { ChatMessage, RouterModel } from "../openclaw";

import { ModelPicker } from "./ModelPicker";
import { HeaderMoreMenu } from "./HeaderMoreMenu";
import { ShareBar } from "./ShareBar";
import { ContextBar } from "./ContextBar";
import { ChatSearchBar } from "./ChatSearchBar";
import { AppsDrawer } from "./AppsDrawer";
import { SystemPromptEditor } from "./SystemPromptEditor";
import { SummaryModal } from "./SummaryModal";
import { SessionAnalyticsModal } from "./SessionAnalyticsModal";

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
  AVAILABLE_MODELS: { id: string; name: string; provider: string; icon: string; connected?: boolean }[];
  MODEL_CONTEXT_LIMITS: Record<string, number>;
  dynamicModelsCount: number;
  currentAgent: { name: string; id: string; emoji: string };
  modelPickerRef: React.RefObject<HTMLDivElement | null>;
  ensureSession: () => string;
  // Header more menu
  showHeaderMore: boolean;
  setShowHeaderMore: (v: boolean) => void;
  headerMoreRef: React.RefObject<HTMLDivElement | null>;
  openclawMode: boolean;
  handleToggleOpenclawMode: () => void;
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
  chatSearchNavigate: (dir: "next" | "prev") => void;
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
    sessions, activeSessionId, activeSession, activeAgentId,
    editingTabId, editingTabText, setEditingTabId, setEditingTabText,
    cliMode, actions,
    showModelPicker, setShowModelPicker, selectedModel, setSelectedModel,
    AVAILABLE_MODELS, MODEL_CONTEXT_LIMITS, dynamicModelsCount,
    currentAgent, modelPickerRef, ensureSession,
    showHeaderMore, setShowHeaderMore, headerMoreRef,
    openclawMode, handleToggleOpenclawMode,
    compareMode, compareModels, handleToggleCompare, setCompareStreams, setCompareWinner,
    comparePickerRef, handleOpenSystemPrompt, compact,
    notifSound, handleToggleNotifSound,
    messages, userName, summarizing, handleSummarize,
    showAnalytics, setShowAnalytics,
    handleShare, handleCopyMarkdown, handleDownloadMd, handleDownloadJson,
    showApps, setShowApps, view, importInputRef,
    wsFailed, setWsFailed, setWsConnected,
    shareUrl, shareCopied, setShareCopied, setShareUrl,
    offlineQueue,
    chatSearchOpen, chatSearchRef, chatSearch, setChatSearch,
    closeChatSearch, chatSearchNavigate, chatSearchResults, chatSearchIndex,
    showSystemPrompt, setShowSystemPrompt, systemPromptDraft, setSystemPromptDraft,
    handleSaveSystemPrompt,
    showSummary, setShowSummary, summaryText,
  } = props;

  return (
    <>
      {/* Compact toolbar -- model picker + options */}
      <header className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-2)", zIndex: 30, position: "relative" }}>
        <div className="flex items-center gap-2 min-w-0 flex-1 shre-no-drag">
          {(() => {
            const s = sessions.find((x) => x.id === activeSessionId);
            if (!s) return null;
            return editingTabId === s.id ? (
              <input
                autoFocus
                value={editingTabText}
                onChange={(e) => setEditingTabText(e.target.value)}
                onBlur={() => { if (editingTabText.trim()) actions.updateSessionTitle(s.id, editingTabText.trim()); setEditingTabId(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { if (editingTabText.trim()) actions.updateSessionTitle(s.id, editingTabText.trim()); setEditingTabId(null); } if (e.key === "Escape") setEditingTabId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-[180px] sm:max-w-[260px] bg-transparent outline-none text-[12px] tracking-tight rounded px-1"
                style={{ color: "var(--c-text-2)", border: "1px solid var(--c-accent)" }}
              />
            ) : (
              <span
                className="text-[12px] tracking-tight truncate max-w-[180px] sm:max-w-[260px] cursor-default"
                style={{ color: "var(--c-text-3)" }}
                onDoubleClick={() => { setEditingTabId(s.id); setEditingTabText(s.title); }}
                title="Double-click to rename"
              >
                {s.title}
              </span>
            );
          })()}

          {cliMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium" style={{ background: "rgba(168,85,247,0.12)", color: "var(--c-purple)" }}>CLI</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ModelPicker
            open={showModelPicker}
            onToggle={() => setShowModelPicker(!showModelPicker)}
            onClose={() => setShowModelPicker(false)}
            selectedModel={selectedModel}
            onSelectModel={(modelId) => {
              const providerLabels: Record<string, string> = { "provider:openai": "ChatGPT", "provider:anthropic": "Claude", "provider:ollama": "Local", "provider:google": "Google" };
              const prevName = providerLabels[selectedModel ?? ""] ?? AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name ?? selectedModel ?? "Auto";
              setSelectedModel(modelId);
              setModelOverride(activeAgentId, modelId);
              const sid = ensureSession();
              const newName = providerLabels[modelId ?? ""] ?? AVAILABLE_MODELS.find(m => m.id === modelId)?.name ?? modelId ?? "Auto";
              actions.addMessage(sid, {
                role: "assistant",
                content: `[system] Model switched from ${prevName} to ${newName}. Connected.`,
                timestamp: Date.now(),
                meta: { system: "true" },
              });
            }}
            models={AVAILABLE_MODELS}
            agentName={currentAgent.name}
            pickerRef={modelPickerRef}
          />

          <div className="relative" ref={headerMoreRef}>
            <button
              onClick={() => setShowHeaderMore(!showHeaderMore)}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: showHeaderMore ? "var(--c-text-1)" : "var(--c-text-3)" }}
              aria-label="More options"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>

            <HeaderMoreMenu
              open={showHeaderMore}
              onClose={() => setShowHeaderMore(false)}
              openclawMode={openclawMode}
              onToggleOpenclawMode={handleToggleOpenclawMode}
              compareMode={compareMode}
              onToggleCompare={() => {
                handleToggleCompare(compareModels.length);
                if (compareMode) { setCompareStreams({}); setCompareWinner(null); }
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

          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { importSessions(file, sessions, () => window.location.reload(), (msg: string) => { actions.setStatusLine(msg); setTimeout(() => actions.setStatusLine(null), 3000); }); }
            e.target.value = "";
          }} />

          {wsFailed && (
            <button
              onClick={() => { setWsFailed(false); retryConnection().then(() => setWsConnected(true)).catch(() => {}); }}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors font-medium"
              style={{ color: "var(--c-danger)", background: "var(--c-danger-bg)" }}
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
            background: "rgba(234, 179, 8, 0.08)",
            borderBottom: "1px solid rgba(234, 179, 8, 0.15)",
            color: "var(--c-yellow)",
          }}
        >
          <span className="ws-reconnect-pulse inline-block h-1 w-1 rounded-full bg-yellow-400" />
          {offlineQueue.length === 1
            ? "1 message queued \u2014 sending when reconnected..."
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
        onClear={() => setSystemPromptDraft("")}
      />

      {/* Summary modal */}
      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        summaryText={summaryText}
        onCopy={() => {
          navigator.clipboard?.writeText(summaryText).then(() => {
            actions.setStatusLine("Summary copied to clipboard");
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
