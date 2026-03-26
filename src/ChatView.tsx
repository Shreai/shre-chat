import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { ProcessBar, ProcessDetail, useProcessRun } from "./components/process-bar";
import type { ChatMessage } from "./openclaw";
import ports from "../../ports.json";
import { useApp, generateTitle, getAgent, AGENTS, type Session, type View } from "./store";
import type { TerminalHandle } from "./TerminalView";
const TerminalView = lazy(() => import("./TerminalView").then(m => ({ default: m.TerminalView })));
const VoiceAssistant = lazy(() => import("./VoiceAssistant"));
// ContentCard lazy import moved to PreviewPanel component

// Extracted modules
import { getModelOverride, setModelOverride } from "./chat-utils";
import { Lightbox } from "./components/MessageBubble";
import { ViewErrorBoundary } from "./ViewErrorBoundary";
import { useVoiceRecording } from "./hooks/useVoiceRecording";
import { useWakeWord } from "./hooks/useWakeWord";
import { useStreamState } from "./hooks/useStreamState";
import { useChatSearch } from "./hooks/useChatSearch";
import { useGatewayConnection } from "./hooks/useGatewayConnection";

// Extracted custom hooks
import { useSlashCommands } from "./hooks/useSlashCommands";
import { useMentions } from "./hooks/useMentions";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useVoiceHandlers } from "./hooks/useVoiceHandlers";
import { useChatEffects } from "./hooks/useChatEffects";
import { useMessageHandlers } from "./hooks/useMessageHandlers";
import { useConversationTasks } from "./hooks/useConversationTasks";
import { useFileHandling } from "./hooks/useFileHandling";
import { useHeaderActions } from "./hooks/useHeaderActions";
import { useMessageListHandlers } from "./hooks/useMessageListHandlers";
import { useFilteredMessages } from "./hooks/useFilteredMessages";
import { useModelList } from "./hooks/useModelList";
import { useEscalationListener } from "./hooks/useEscalationListener";

// Extracted UI components
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { MessageQueue } from "./components/MessageQueue";
import { MessageList } from "./components/MessageList";
import { ChatComposer } from "./components/ChatComposer";
import { CompareView } from "./components/CompareView";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { ShareSnapshotView } from "./components/ShareSnapshotView";
import { SuggestionsBar } from "./components/SuggestionsBar";
import { ViewTabs } from "./components/ViewTabs";
import { AppsDrawer } from "./components/AppsDrawer";
import { PreviewPanel } from "./components/PreviewPanel";
import { DragOverlay } from "./components/DragOverlay";
import { ChatPanels } from "./components/ChatPanels";
import { useChatKeydown } from "./hooks/useChatKeydown";


// ── Helpers, sub-components, and constants moved to:
//    ./chat-utils.ts, ./components/MessageBubble.tsx,
//    ./components/WelcomeScreen.tsx, ./components/LinkPreview.tsx

const openClawUrl = "/openclaw/";

export function ChatView() {
  const { state, actions } = useApp();
  const { sessions, activeSessionId, activeAgentId, openTabs, streaming, streamText, statusLine, gatewayUp, syncing, view } = state;

  const [input, setInput] = useState(() => {
    // Check for ?prompt= URL parameter (from MIB007 "Discuss with Shre" link)
    try {
      const urlPrompt = new URLSearchParams(window.location.search).get("prompt");
      if (urlPrompt) {
        // Clean the URL to prevent re-triggering
        window.history.replaceState({}, "", window.location.pathname);
        return urlPrompt;
      }
    } catch (err) { console.debug("URL prompt parse", err); }
    if (activeSessionId) return actions.getDraft(activeSessionId);
    return "";
  });
  const [showApps, setShowApps] = useState(false);
  const [showHeaderMore, setShowHeaderMore] = useState(false);
  const headerMoreRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabText, setEditingTabText] = useState("");
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [selectedMsgIndex, setSelectedMsgIndex] = useState<number | null>(null);
  const [branchToast, setBranchToast] = useState(false);
  // ── Keyboard shortcuts overlay (Cmd+?) ──────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pendingEditSendRef = useRef(false);
  const setCliContinueRef = useRef<(v: boolean) => void>(() => {});
  // ── Stream state (extracted hook) ──
  const {
    streamStall, setStreamStall, stallCountdown, setStallCountdown,
    streamElapsed, setStreamElapsed, streamPhase, setStreamPhase,
    compacting, setCompacting, activeToolName, setActiveToolName,
    pendingApproval, setPendingApproval,
    streamStartRef, sendTimeRef, firstTokenTimeRef,
    subscribeStreamStall,
  } = useStreamState(streaming);
  // Process bar
  const { runs, activeRun, startRun, addStep, updateStep, completeRun } = useProcessRun();
  const [processDetailOpen, setProcessDetailOpen] = useState(false);
  const [highlightStepId, setHighlightStepId] = useState<string>();
  const processStepRef = useRef<string>("");
  const processRunIdRef = useRef<string>("");
  const [showEmoji, setShowEmoji] = useState(false);
  // ── Voice recording (extracted hook) ──
  const {
    isRecording, setIsRecording, voicePhase, setVoicePhase,
    interimTranscript, setInterimTranscript, audioLevel, setAudioLevel,
    recordingDuration, setRecordingDuration, isSpeaking, setIsSpeaking,
    voiceAnnouncement, setVoiceAnnouncement, voiceAssistantOpen, setVoiceAssistantOpen,
    isHandsFree, setIsHandsFree, voiceMode, setVoiceMode, ttsVoice, setTtsVoice,
    speechSupported, analyserRef, audioCtxRef, levelRafRef, recordingTimerRef,
    interimTranscriptRef, audioLevelRawRef, voiceSessionIdRef, voiceFinalTranscriptRef,
    levelThrottleRef, silenceStartRef, isHandsFreeRef, lastSpokenMsgRef,
    SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS, hasSpeechRecognition,
    clearInterimAfter, cleanupAudioLevel,
  } = useVoiceRecording();
  // ── Wake word listener (extracted hook) ──
  useWakeWord(voiceAssistantOpen, isRecording, setVoiceAssistantOpen);

  // ── Dedicated voice session (isolated from chat) ──
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (voiceAssistantOpen && !voiceSessionId) {
      const id = actions.getOrCreateVoiceSession(activeAgentId);
      setVoiceSessionId(id);
    }
  }, [voiceAssistantOpen, voiceSessionId, actions, activeAgentId]);
  const voiceSession = sessions.find((s) => s.id === voiceSessionId);
  const voiceMessages = voiceSession?.messages || [];

  // ── Conversation task loop (badge on messages) ──
  const { latestTask } = useConversationTasks(activeSessionId);

  // ── Escalation visibility (Ellie escalation WS events → chat) ──
  useEscalationListener({ activeSessionId, addMessage: actions.addMessage });

  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(() => getModelOverride(activeAgentId));
  // ── Dynamic model list from shre-router (extracted hook) ──
  const { dynamicModels, setDynamicModels, routerUp, setRouterUp, AVAILABLE_MODELS, MODEL_CONTEXT_LIMITS } = useModelList();
  const [cliMode, setCliMode] = useState(() => {
    const stored = localStorage.getItem("shre-cli-mode-default");
    return stored === "true"; // Default OFF — user enables via /cli or button
  });
  // ── Claude CLI mode (auto-route coding tasks to Claude CLI) ──
  const [claudeCliMode, setClaudeCliMode] = useState(() => {
    const stored = localStorage.getItem("shre-claude-cli-mode");
    return stored === "true";
  });
  // ── Identity verification gate ──────────────────────────────────────
  const [identityVerified, setIdentityVerified] = useState(true); // Gate disabled — only enforce for CLI/sensitive ops
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [termViewMode, setTermViewMode] = useState<"split" | "tabs">("split");
  const [activeView, setActiveView] = useState<string>("chat"); // "chat" | "terminal" | "preview"
  const [previewContent, setPreviewContent] = useState<{ content: string; type: string; title?: string } | null>(null);
  // ── Shared view (read-only snapshot from /shared/:id) ─────────────
  const [sharedSnapshot, setSharedSnapshot] = useState<{ title: string; messages: ChatMessage[]; model: string | null; createdAt: string } | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  // ── Compare mode ──────────────────────────────────────────────────
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [compareStreams, setCompareStreams] = useState<Record<string, { text: string; done: boolean; error?: string }>>({});
  const [compareWinner, setCompareWinner] = useState<string | null>(null);
  const comparePickerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false); // true while handleSend is executing — prevents cleanup abort on ensureSession switch
  const emojiRef = useRef<HTMLDivElement>(null);

  // Streaming buffer — batch token updates to reduce re-renders
  const streamBufferRef = useRef("");
  const streamFlushRaf = useRef<number | null>(null);
  const flushStreamBuffer = useCallback(() => {
    if (streamBufferRef.current) {
      actions.setStreamText(streamBufferRef.current);
    }
    streamFlushRaf.current = null;
  }, [actions]);

  const bufferToken = useCallback((fullText: string) => {
    streamBufferRef.current = fullText;
    if (!streamFlushRaf.current) {
      streamFlushRaf.current = requestAnimationFrame(flushStreamBuffer);
    }
  }, [flushStreamBuffer]);

  // Cleanup buffer RAF on unmount
  useEffect(() => {
    return () => { if (streamFlushRaf.current) cancelAnimationFrame(streamFlushRaf.current); };
  }, []);

  const currentAgent = getAgent(activeAgentId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];
  const userName = state.userProfile?.name?.split(" ")[0] || "You";

  // ── File handling (extracted hook) ──
  const {
    pendingFiles, setPendingFiles,
    isDragging, fileRef, MAX_FILE_SIZE,
    handleFileSelect, handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
    removePendingFile, handlePaste,
  } = useFileHandling({
    activeSessionId,
    activeSessionTitle: activeSession?.title,
    activeAgentId,
    actions,
  });

  // ── Header actions (extracted hook) ──
  const {
    openclawMode, setOpenclawMode,
    compareMode, setCompareMode,
    comparePickerOpen, setComparePickerOpen,
    showSystemPrompt, setShowSystemPrompt,
    systemPromptDraft, setSystemPromptDraft,
    summarizing,
    showSummary, setShowSummary,
    summaryText,
    showAnalytics, setShowAnalytics,
    shareUrl, setShareUrl,
    shareLoading,
    shareCopied, setShareCopied,
    notifSound, setNotifSound,
    handleToggleOpenclawMode,
    handleToggleCompare,
    handleOpenSystemPrompt,
    handleToggleNotifSound,
    handleSummarize,
    handleShare,
    handleCopyMarkdown,
    handleDownloadMd,
    handleDownloadJson,
    handleSaveSystemPrompt,
  } = useHeaderActions({
    activeSessionId,
    activeSession,
    messages,
    userName,
    currentAgentName: currentAgent.name,
    currentAgentId: currentAgent.id,
    actions,
  });

  // Sync openclawMode when StatusBar toggle changes localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "shre-openclaw-mode") setOpenclawMode(e.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Filtered messages + virtualizer (extracted hook) ──
  const { filteredMessages, lastAssistantMessage, getRunForMessage, useVirtual, virtualizer } =
    useFilteredMessages({ messages, latestTask, runs, scrollRef });

  // ── Chat search (extracted hook) ──
  const {
    globalSearchOpen, setGlobalSearchOpen, globalSearchQuery, setGlobalSearchQuery,
    globalSearchResults, setGlobalSearchResults, globalSearching, setGlobalSearching,
    globalSearchRef, chatSearchOpen, setChatSearchOpen, chatSearch, setChatSearch,
    chatSearchIndex, setChatSearchIndex, chatSearchRef,
    chatSearchResults, chatSearchNavigate, closeChatSearch,
  } = useChatSearch(filteredMessages, virtualizer);

  // ── Gateway connection (extracted hook) ──
  const {
    wsConnected, setWsConnected, wsFailed, setWsFailed,
    wsStateInfo, setWsStateInfo, wsReconnecting, setWsReconnecting,
    wsBannerFlash, setWsBannerFlash, offlineQueue, setOfflineQueue,
  } = useGatewayConnection(subscribeStreamStall);

  // ── Chat effects (extracted hook) ──
  const {
    scrollPositionsRef, prevMsgCount, newMsgStartIndex, initialLoadDone,
    showJumpToLatest, setShowJumpToLatest,
    userNearBottomRef, handleScroll, jumpToLatest,
    pullRefreshing, pullDistance, handlePullStart, handlePullMove, handlePullEnd,
    PULL_THRESHOLD,
    sentHistoryRef, sentHistoryIdxRef, HISTORY_MAX, HISTORY_KEY,
    recentWSSendRef,
  } = useChatEffects({
    activeSessionId, activeAgentId, streaming, streamText,
    sessions, messages, filteredMessages, actions,
    scrollRef, inputRef, streamFlushRaf, streamBufferRef,
    sendingRef, abortRef, setInput, setSelectedModel,
    setDynamicModels, setRouterUp, setCompareModels,
    showEmoji, setShowEmoji, emojiRef,
    showModelPicker, setShowModelPicker, modelPickerRef,
    comparePickerOpen, setComparePickerOpen, comparePickerRef,
    setShareUrl, setSharedSnapshot, setSharedLoading, setSharedError,
    generateTitle, virtualizer,
  });

  const ensureSession = useCallback((): string => {
    if (activeSessionId) return activeSessionId;
    const id = actions.newSession();
    actions.switchSession(id);
    return id;
  }, [activeSessionId, actions]);

  // ── Slash commands (extracted hook) ──
  const {
    SLASH_COMMANDS, slashOpen, setSlashOpen, slashIndex, setSlashIndex,
    slashRef, slashFiltered, executeSlashCommand,
  } = useSlashCommands({
    input, setInput, activeSessionId, activeAgentId, activeSession, messages,
    actions, stateCompact: state.compact, cliMode, setCliMode,
    setCliContinue: (v: boolean) => { setCliContinueRef.current(v); },
    ensureSession, AVAILABLE_MODELS, setSelectedModel, setModelOverride,
  });

  // ── @@ Mentions (extracted hook) ──
  const {
    mentionOpen, setMentionOpen, mentionIndex, setMentionIndex,
    mentionRef, mentionFiltered, mentionAgent, clearMention,
    onMentionSelect, extractMention,
  } = useMentions({
    input, setInput,
    agents: AGENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, group: a.group })),
    inputRef,
  });

  // ── Message handlers (extracted hook) ──
  const {
    handleSend, handleSendRef, sendFeedbackToRapidRMS,
    queue, setQueue, editingQueueId, setEditingQueueId,
    editingQueueText, setEditingQueueText,
    setCliContinue, pendingSuggestionSendRef,
  } = useMessageHandlers({
    input, setInput, streaming, syncing, writeEnabled: state.writeEnabled,
    activeSessionId, activeAgentId, sessions, messages, filteredMessages,
    actions, replyToIndex: state.replyToIndex, pendingFiles, setPendingFiles,
    selectedModel, compareMode, compareModels, setCompareStreams, setCompareWinner,
    cliMode, openclawMode, claudeCliMode, identityVerified, setIdentityVerified,
    pendingMessage, setPendingMessage, verifying, setVerifying,
    ensureSession, executeSlashCommand, extractMention, clearMention,
    setStreamPhase, setActiveToolName, setCompacting, setPendingApproval,
    streamStartRef, sendTimeRef, firstTokenTimeRef,
    startRun, addStep, updateStep, completeRun,
    processStepRef, processRunIdRef,
    abortRef, sendingRef, streamBufferRef, streamFlushRaf,
    bufferToken, flushStreamBuffer, voiceFinalTranscriptRef,
    pendingEditSendRef,
    wsConnected, wsReconnecting, recentWSSendRef,
    virtualizer, userNearBottomRef, setShowJumpToLatest,
    setSuggestions, setSelectedMsgIndex,
  });

  // Wire the real setCliContinue into the ref so useSlashCommands can call it
  setCliContinueRef.current = setCliContinue;

  // ── Voice handlers (extracted hook) ──
  const {
    startRecording, stopRecording, ttsAudioRef,
  } = useVoiceHandlers({
    setInput, setIsRecording, setVoicePhase, setInterimTranscript,
    setAudioLevel, setRecordingDuration, setIsSpeaking,
    voiceSessionIdRef, voiceFinalTranscriptRef,
    audioCtxRef, analyserRef, levelRafRef, recordingTimerRef,
    interimTranscriptRef, audioLevelRawRef, levelThrottleRef, silenceStartRef,
    lastSpokenMsgRef, isHandsFreeRef,
    SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS,
    clearInterimAfter, cleanupAudioLevel,
    isHandsFree, isRecording, voiceMode, setVoiceMode, ttsVoice,
    streaming, messages, handleSendRef,
  });

  // ── Keyboard shortcuts (extracted hook) ──
  const { handleAbort } = useKeyboardShortcuts({
    streaming, wsConnected, activeAgentId, activeSessionId,
    messages, filteredMessages, selectedMsgIndex, setSelectedMsgIndex,
    chatSearchOpen, setChatSearchOpen, chatSearchRef, closeChatSearch,
    globalSearchOpen, setGlobalSearchOpen, globalSearchRef,
    shortcutsOpen, setShortcutsOpen, showModelPicker, setShowModelPicker,
    abortRef, inputRef, pendingEditSendRef, setInput,
    setEditingMsgIndex, setEditingMsgText,
    actions, virtualizer,
  });

  // ── Textarea keydown handler (extracted hook) ──────────────────────
  const handleKeyDown = useChatKeydown({
    slashOpen, slashFiltered, slashIndex, setSlashIndex, setSlashOpen, executeSlashCommand,
    mentionOpen, mentionFiltered, mentionIndex, setMentionIndex, setMentionOpen, onMentionSelect,
    editingQueueId, setEditingQueueId, setEditingQueueText,
    editingMsgIndex, setEditingMsgIndex, setEditingMsgText,
    input, setInput, setQueue,
    messages, activeSessionId, replaceSessionMessages: actions.replaceSessionMessages,
    handleSend,
    sentHistoryRef, sentHistoryIdxRef, HISTORY_KEY,
  });

  const isTabMode = termViewMode === "tabs" && (showTerminal || showOpenClaw || activeView === "preview");
  const showChat = !isTabMode || activeView === "chat";
  const showTermPanel = showTerminal && (!isTabMode || activeView === "terminal");
  const showOpenClawPanel = showOpenClaw && (!isTabMode || activeView === "openclaw");
  const showPreviewPanel = isTabMode && activeView === "preview" && previewContent;

  // Handler for content block expand (lego blocks)
  const handleContentExpand = useCallback((content: string, type: string, title?: string) => {
    setPreviewContent({ content, type, title });
    setActiveView("preview");
    if (termViewMode !== "tabs") setTermViewMode("tabs");
  }, [termViewMode]);

  // ── MessageList handlers (extracted hook) ──
  const messageListHandlers = useMessageListHandlers({
    activeSessionId, messages, filteredMessages, actions,
    setInput, setEditingMsgIndex, setEditingMsgText,
    setBranchToast, setShowTerminal, setPendingApproval,
    pendingEditSendRef, inputRef, terminalRef,
    setLightboxSrc, sendFeedbackToRapidRMS, handleContentExpand,
  });

  // ── Shared snapshot view (read-only) ──────────────────────────────
  if (sharedSnapshot || sharedLoading || sharedError) {
    return <ShareSnapshotView snapshot={sharedSnapshot} loading={sharedLoading} error={sharedError} />;
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Image lightbox */}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Branch toast */}
      {branchToast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-medium shadow-lg"
          style={{
            bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
            background: "var(--c-bg-card)",
            color: "var(--c-text-1)",
            border: "1px solid var(--c-accent)",
            animation: "branchToastIn 0.2s ease-out",
          }}
        >
          Conversation branched
        </div>
      )}
      <style>{`@keyframes branchToastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>

      {/* Drag-and-drop overlay */}
      {isDragging && <DragOverlay />}
      {/* Traffic light safe area — only takes space in Shre desktop */}
      <div className="shre-drag shrink-0 titlebar-safe" style={{ background: "var(--c-bg-glass)" }} />

      {/* Top-level view tabs — visible in tab mode when terminal is open */}
      {isTabMode && (
        <ViewTabs
          activeView={activeView}
          setActiveView={setActiveView}
          setTermViewMode={setTermViewMode}
          previewContent={previewContent}
          showOpenClaw={showOpenClaw}
        />
      )}

      {/* Terminal — persisted across visibility toggles */}
      <div
        className={isTabMode ? "flex-1 min-h-0" : "shrink-0"}
        style={{
          ...(isTabMode ? {} : { height: "40%", minHeight: 200, borderBottom: "2px solid rgba(255,255,255,0.1)" }),
          display: (isTabMode ? showTermPanel : showTerminal) ? (isTabMode ? "flex" : "block") : "none",
        }}
      >
        <ViewErrorBoundary viewName="Terminal">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center" style={{ background: "var(--c-bg-1)", color: "var(--c-text-4)" }}>Loading terminal...</div>}>
            <TerminalView ref={terminalRef} visible={showTerminal} onClose={() => { setShowTerminal(false); setActiveView("chat"); }} />
          </Suspense>
        </ViewErrorBoundary>
      </div>

      {/* OpenClaw panel — embedded gateway UI */}
      <div
        className={isTabMode ? "flex-1 min-h-0" : "shrink-0"}
        style={{
          ...(isTabMode ? {} : { height: "50%", minHeight: 300, borderBottom: "2px solid rgba(255,255,255,0.1)" }),
          display: (isTabMode ? showOpenClawPanel : showOpenClaw) ? (isTabMode ? "flex" : "block") : "none",
        }}
      >
        <ViewErrorBoundary viewName="OpenClaw">
          <div className="w-full h-full flex flex-col" style={{ background: "var(--c-bg-1)" }}>
            <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ borderBottom: "1px solid var(--c-border-1)" }}>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[9px] font-bold">O</div>
                <span className="text-[11px] font-medium" style={{ color: "var(--c-text-1)" }}>OpenClaw Gateway</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.open(openClawUrl, "openclaw", "noopener,noreferrer")}
                  className="h-6 w-6 rounded flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "var(--c-text-3)" }}
                  title="Open in new tab"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
                <button
                  onClick={() => { setShowOpenClaw(false); setActiveView("chat"); }}
                  className="h-6 w-6 rounded flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "var(--c-text-3)" }}
                  title="Close OpenClaw"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <iframe
              src={openClawUrl}
              className="flex-1 w-full border-0"
              title="OpenClaw Gateway"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              style={{ background: "#1a1a2e" }}
            />
          </div>
        </ViewErrorBoundary>
      </div>

      {/* Preview panel — expanded content block (lego block) */}
      {showPreviewPanel && previewContent && (
        <PreviewPanel content={previewContent} onClose={() => { setPreviewContent(null); setActiveView("chat"); }} />
      )}

      {/* Chat content — hidden in tab mode when terminal is active */}
      {showChat && <>
      <ChatPanels
        sessions={sessions} activeSessionId={activeSessionId} activeSession={activeSession}
        activeAgentId={activeAgentId} editingTabId={editingTabId} editingTabText={editingTabText}
        setEditingTabId={setEditingTabId} setEditingTabText={setEditingTabText}
        cliMode={cliMode} actions={actions}
        showModelPicker={showModelPicker} setShowModelPicker={setShowModelPicker}
        selectedModel={selectedModel} setSelectedModel={setSelectedModel}
        AVAILABLE_MODELS={AVAILABLE_MODELS} MODEL_CONTEXT_LIMITS={MODEL_CONTEXT_LIMITS}
        dynamicModelsCount={dynamicModels.length} currentAgent={currentAgent}
        modelPickerRef={modelPickerRef} ensureSession={ensureSession}
        showHeaderMore={showHeaderMore} setShowHeaderMore={setShowHeaderMore}
        headerMoreRef={headerMoreRef} openclawMode={openclawMode}
        handleToggleOpenclawMode={handleToggleOpenclawMode}
        compareMode={compareMode} compareModels={compareModels}
        handleToggleCompare={handleToggleCompare} setCompareStreams={setCompareStreams}
        setCompareWinner={setCompareWinner} comparePickerRef={comparePickerRef}
        handleOpenSystemPrompt={handleOpenSystemPrompt} compact={state.compact}
        notifSound={notifSound} handleToggleNotifSound={handleToggleNotifSound}
        messages={messages} userName={userName} summarizing={summarizing}
        handleSummarize={handleSummarize} showAnalytics={showAnalytics}
        setShowAnalytics={setShowAnalytics} handleShare={handleShare}
        handleCopyMarkdown={handleCopyMarkdown} handleDownloadMd={handleDownloadMd}
        handleDownloadJson={handleDownloadJson} showApps={showApps} setShowApps={setShowApps}
        view={view} importInputRef={importInputRef}
        wsFailed={wsFailed} setWsFailed={setWsFailed} setWsConnected={setWsConnected}
        shareUrl={shareUrl} shareCopied={shareCopied} setShareCopied={setShareCopied}
        setShareUrl={setShareUrl} offlineQueue={offlineQueue}
        selectedModelForContext={selectedModel}
        chatSearchOpen={chatSearchOpen} chatSearchRef={chatSearchRef}
        chatSearch={chatSearch} setChatSearch={setChatSearch}
        closeChatSearch={closeChatSearch} chatSearchNavigate={chatSearchNavigate}
        chatSearchResults={chatSearchResults} chatSearchIndex={chatSearchIndex}
        showSystemPrompt={showSystemPrompt} setShowSystemPrompt={setShowSystemPrompt}
        systemPromptDraft={systemPromptDraft} setSystemPromptDraft={setSystemPromptDraft}
        handleSaveSystemPrompt={handleSaveSystemPrompt}
        showSummary={showSummary} setShowSummary={setShowSummary} summaryText={summaryText}
      />

      {/* Messages */}
      <MessageList
        filteredMessages={filteredMessages}
        messages={messages}
        streaming={streaming}
        streamText={streamText}
        syncing={syncing}
        compact={state.compact}
        currentAgent={currentAgent}
        activeAgentId={activeAgentId}
        userName={userName}
        activeSessionId={activeSessionId}
        chatSearchOpen={chatSearchOpen}
        chatSearch={chatSearch}
        chatSearchResults={chatSearchResults}
        chatSearchIndex={chatSearchIndex}
        selectedMsgIndex={selectedMsgIndex}
        editingMsgIndex={editingMsgIndex}
        editingMsgText={editingMsgText}
        scrollRef={scrollRef}
        showJumpToLatest={showJumpToLatest}
        newMsgStartIndex={newMsgStartIndex}
        pullDistance={pullDistance}
        pullRefreshing={pullRefreshing}
        PULL_THRESHOLD={PULL_THRESHOLD}
        streamStall={streamStall}
        stallCountdown={stallCountdown}
        streamElapsed={streamElapsed}
        streamPhase={streamPhase}
        activeToolName={activeToolName}
        compacting={compacting}
        pendingApproval={pendingApproval}
        runs={runs}
        getRunForMessage={getRunForMessage}
        userProfile={state.userProfile}
        onScroll={handleScroll}
        onPullStart={handlePullStart}
        onPullMove={handlePullMove}
        onPullEnd={handlePullEnd}
        onJumpToLatest={jumpToLatest}
        {...messageListHandlers}
        virtualizer={virtualizer}
        useVirtual={useVirtual}
      />

      {/* Compare mode results */}
        {compareMode && <CompareView
          compareStreams={compareStreams}
          compareWinner={compareWinner}
          availableModels={AVAILABLE_MODELS}
          activeSessionId={activeSessionId}
          onPickWinner={(modelId, text) => {
            setCompareWinner(modelId);
            if (activeSessionId) {
              const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);
              actions.addMessage(activeSessionId, {
                role: "assistant",
                content: text,
                timestamp: Date.now(),
              });
              actions.addActivity(activeSessionId, "done", `Compare winner: ${modelInfo?.name || modelId}`);
              actions.addFeed(activeSessionId, "received", `Winner: ${modelInfo?.name || modelId} (${text.length} chars)`, { compare: "true", model: modelId });
            }
          }}
          onDismiss={() => { setCompareStreams({}); setCompareWinner(null); }}
        />}

      {/* Process Detail overlay */}
      {processDetailOpen && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
          zIndex: 30, borderTop: "1px solid var(--c-border-1)",
          background: "var(--c-bg-main)",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
        }}>
          <ProcessDetail
            run={activeRun ?? runs[runs.length - 1] ?? null}
            highlightStepId={highlightStepId}
            onClose={() => setProcessDetailOpen(false)}
          />
        </div>
      )}

      {/* Task Queue */}
      <MessageQueue
        queue={queue}
        editingQueueId={editingQueueId}
        onReorder={(idx, dir) => setQueue((prev) => {
          const next = [...prev];
          const swapIdx = dir === "up" ? idx - 1 : idx + 1;
          [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
          return next;
        })}
        onEdit={(item) => {
          setEditingQueueId(item.id);
          setEditingQueueText(item.text);
          setInput(item.text);
          setTimeout(() => {
            const ta = document.getElementById("shre-chat-textarea");
            if (ta) { ta.focus(); (ta as HTMLTextAreaElement).setSelectionRange(item.text.length, item.text.length); }
          }, 50);
        }}
        onRemove={(id) => setQueue((prev) => prev.filter((q) => q.id !== id))}
      />

      {/* Process Bar — between messages and input */}
      <ProcessBar
        runs={runs}
        activeRun={activeRun}
        onStepClick={(_runId, stepId) => {
          setHighlightStepId(stepId);
          setProcessDetailOpen(true);
        }}
      />

      {/* Contextual quick-action suggestions from last assistant message */}
      <SuggestionsBar
        lastAssistantMessage={lastAssistantMessage}
        streaming={streaming}
        messageCount={messages.length}
        onSelect={(text) => {
          setInput(text);
          pendingSuggestionSendRef.current = true;
        }}
      />

      <ChatComposer
        input={input}
        setInput={setInput}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
        onAbort={handleAbort}
        streaming={streaming}
        syncing={syncing}
        writeEnabled={state.writeEnabled}
        compareMode={compareMode}
        compareModelsCount={compareModels.length}
        cliMode={cliMode}
        claudeCliMode={claudeCliMode}
        setClaudeCliMode={(on: boolean) => {
          setClaudeCliMode(on);
          localStorage.setItem("shre-claude-cli-mode", String(on));
          // When turning off Claude CLI, also turn off legacy cliMode so
          // the placeholder returns to normal instead of cycling to "subscription mode"
          if (!on && cliMode) {
            setCliMode(false);
            localStorage.setItem("shre-cli-mode-default", "false");
          }
        }}
        currentAgentName={currentAgent.name}
        activeSessionId={activeSessionId}
        messages={messages}
        inputRef={inputRef}
        fileRef={fileRef}
        emojiRef={emojiRef}
        pendingFiles={pendingFiles}
        onFileSelect={handleFileSelect}
        onRemovePendingFile={removePendingFile}
        onImageClick={setLightboxSrc}
        onPaste={handlePaste}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        isRecording={isRecording}
        voicePhase={voicePhase}
        audioLevel={audioLevel}
        recordingDuration={recordingDuration}
        isSpeaking={isSpeaking}
        interimTranscript={interimTranscript}
        isHandsFree={isHandsFree}
        voiceMode={voiceMode}
        ttsVoice={ttsVoice}
        speechSupported={speechSupported}
        hasSpeechRecognition={hasSpeechRecognition}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        setIsHandsFree={setIsHandsFree}
        setVoiceMode={setVoiceMode}
        setTtsVoice={setTtsVoice}
        onStopTTS={() => {
          if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
          window.speechSynthesis?.cancel();
          setIsSpeaking(false);
        }}
        showTerminal={showTerminal}
        termViewMode={termViewMode}
        onToggleTerminal={() => { if (!showTerminal) { setShowTerminal(true); } else { setShowTerminal(false); setActiveView("chat"); } }}
        onToggleTermViewMode={() => { const next = termViewMode === "split" ? "tabs" : "split"; setTermViewMode(next); if (next === "tabs") setActiveView("chat"); }}
        showOpenClaw={showOpenClaw}
        onToggleOpenClaw={() => { if (!showOpenClaw) { setShowOpenClaw(true); } else { setShowOpenClaw(false); setActiveView("chat"); } }}
        slashOpen={slashOpen}
        slashFiltered={slashFiltered}
        slashIndex={slashIndex}
        slashRef={slashRef}
        setSlashIndex={setSlashIndex}
        onSlashSelect={(cmd) => {
          const hasArg = slashFiltered.find(c => c.name === cmd)?.usage.includes("<");
          if (hasArg && !input.includes(" ")) {
            setInput(`/${cmd} `);
          } else {
            executeSlashCommand(cmd.startsWith("model ") ? cmd : input.slice(1));
          }
        }}
        mentionOpen={mentionOpen}
        mentionFiltered={mentionFiltered}
        mentionIndex={mentionIndex}
        mentionRef={mentionRef}
        setMentionIndex={setMentionIndex}
        onMentionSelect={onMentionSelect}
        mentionAgent={mentionAgent}
        replyToIndex={state.replyToIndex}
        replyToContent={state.replyToIndex !== null ? (filteredMessages[state.replyToIndex]?.content ?? messages[state.replyToIndex]?.content ?? null) : null}
        onCancelReply={() => actions.setReplyTo(null)}
        editingMsgIndex={editingMsgIndex}
        editingQueueId={editingQueueId}
        onCancelEdit={() => {
          if (editingQueueId) { setEditingQueueId(null); setEditingQueueText(""); }
          else { setEditingMsgIndex(null); setEditingMsgText(""); }
          setInput("");
        }}
        suggestions={suggestions}
        onSelectSuggestion={(s) => { setSuggestions([]); setInput(s); }}
        voiceAnnouncement={voiceAnnouncement}
        queueCount={state.queue.length}
        onInputChange={(val) => { setInput(val); if (activeSessionId) actions.setDraft(activeSessionId, val); if (val && suggestions.length) setSuggestions([]); if (selectedMsgIndex !== null) setSelectedMsgIndex(null); }}
        filteredMessages={filteredMessages}
      />
      </>}

      {/* ── Voice Assistant Overlay ──────────────────────────── */}
      <ViewErrorBoundary viewName="Voice Assistant">
        <Suspense fallback={null}>
          <VoiceAssistant
            open={voiceAssistantOpen}
            onClose={() => { setVoiceAssistantOpen(false); window.dispatchEvent(new CustomEvent("shre-voice-stop")); }}
            messages={voiceMessages}
            agentName={currentAgent.name}
            agentEmoji={currentAgent.emoji}
            agentId={activeAgentId}
            ttsVoice={ttsVoice}
            agents={AGENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }))}
            onSwitchAgent={(id) => actions.setActiveAgent(id)}
            onVoiceTurn={(turn) => {
              if (voiceSessionId) {
                actions.addMessage(voiceSessionId, { role: turn.role, content: turn.content });
                // Auto-title on first user message
                if (turn.role === "user" && voiceSession && voiceSession.messages.length === 0) {
                  const title = "Voice: " + (turn.content.length > 35 ? turn.content.slice(0, 35) + "…" : turn.content);
                  actions.updateSessionTitle(voiceSessionId, title);
                }
              }
            }}
            openclawMode={openclawMode}
          />
        </Suspense>
      </ViewErrorBoundary>

      {/* ── Keyboard Shortcuts Overlay (Cmd+?) ──────────────────────────── */}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ── Cross-Session Search Modal (Cmd+Shift+F) ───────────────────── */}
      <GlobalSearchModal
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        query={globalSearchQuery}
        onQueryChange={setGlobalSearchQuery}
        results={globalSearchResults}
        searching={globalSearching}
        onSearch={() => {
          setGlobalSearching(true);
          fetch(`/api/search?q=${encodeURIComponent(globalSearchQuery.trim())}`)
            .then((r) => r.json())
            .then((data) => { setGlobalSearchResults(data.results || []); setGlobalSearching(false); })
            .catch(() => setGlobalSearching(false));
        }}
        onResultClick={(r) => {
          actions.setActiveAgent(r.agentId);
          const existing = sessions.find((s) => s.agentId === r.agentId);
          if (existing) actions.switchSession(existing.id);
          setGlobalSearchOpen(false);
          setChatSearchOpen(true);
          setChatSearch(globalSearchQuery);
        }}
        inputRef={globalSearchRef}
      />
    </main>
  );
}

