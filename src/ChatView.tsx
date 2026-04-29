import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { ProcessBar, ProcessDetail, useProcessRun } from './components/process-bar';
import type { ChatMessage } from './router-client';
import { useApp, generateTitle, getAgent, AGENTS, type Session, type View } from './store';
import { scopedStorageKey } from './workspace-context';
import type { TerminalHandle } from './TerminalView';
const TerminalView = lazy(() =>
  import('./TerminalView').then((m) => ({ default: m.TerminalView })),
);
const VoiceAssistant = lazy(() => import('./VoiceAssistant'));
const RealtimeVoiceOverlay = lazy(() =>
  import('./components/RealtimeVoiceOverlay').then((m) => ({ default: m.RealtimeVoiceOverlay })),
);
import { getModelOverride, setModelOverride } from './chat-utils';
import { Lightbox } from './components/MessageBubble';
import { ViewErrorBoundary } from './ViewErrorBoundary';
import { useVoiceRecording } from './hooks/useVoiceRecording';
import { useWakeWord } from './hooks/useWakeWord';
import { useStreamState } from './hooks/useStreamState';
import { useChatSearch } from './hooks/useChatSearch';
import { useGatewayConnection } from './hooks/useGatewayConnection';
import { useSlashCommands } from './hooks/useSlashCommands';
import { useMentions } from './hooks/useMentions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useVoiceHandlers } from './hooks/useVoiceHandlers';
import { useChatEffects } from './hooks/useChatEffects';
import { useMessageHandlers } from './hooks/useMessageHandlers';
import { useTaskTracker } from './hooks/useTaskTracker';
import { TaskPanel, TaskIndicatorButton } from './components/TaskPanel';
import { useFileHandling } from './hooks/useFileHandling';
import { useHeaderActions } from './hooks/useHeaderActions';
import type { ConversationModeId } from './preferences-store';
import { useMessageListHandlers } from './hooks/useMessageListHandlers';
import { useFilteredMessages } from './hooks/useFilteredMessages';
import { useModelList } from './hooks/useModelList';
import { useAppList } from './hooks/useAppList';
import { useToolList } from './hooks/useToolList';
import { useEscalationListener } from './hooks/useEscalationListener';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { MessageQueue } from './components/MessageQueue';
import { MessageList } from './components/MessageList';
import { ChatComposer } from './components/ChatComposer';
import { CompareView } from './components/CompareView';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ShareSnapshotView } from './components/ShareSnapshotView';
import { SuggestionsBar } from './components/SuggestionsBar';
import { ViewTabs } from './components/ViewTabs';
import { AppsDrawer } from './components/AppsDrawer';
import { PreviewPanel } from './components/PreviewPanel';
import { ArtifactCanvas, extractArtifacts, type Artifact } from './components/ArtifactCanvas';
import { DragOverlay } from './components/DragOverlay';
import { ChatPanels } from './components/ChatPanels';
import { TrialBanner } from './components/TrialBanner';
import { useChatKeydown } from './hooks/useChatKeydown';

export function ChatView() {
  const { state, actions } = useApp();
  const { sessions, activeSessionId, activeAgentId, streaming, streamText, syncing, statusLine } =
    state;

  const [input, setInput] = useState(() => {
    try {
      const urlPrompt = new URLSearchParams(window.location.search).get('prompt');
      if (urlPrompt) {
        window.history.replaceState({}, '', window.location.pathname);
        return urlPrompt;
      }
    } catch (err) {
      console.debug('URL prompt parse', err);
    }
    if (activeSessionId) return actions.getDraft(activeSessionId);
    return '';
  });
  const [showApps, setShowApps] = useState(false);
  const [showHeaderMore, setShowHeaderMore] = useState(false);
  const headerMoreRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabText, setEditingTabText] = useState('');
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [selectedMsgIndex, setSelectedMsgIndex] = useState<number | null>(null);
  const [branchToast, setBranchToast] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pendingEditSendRef = useRef(false);
  const setCliContinueRef = useRef<(v: boolean) => void>(() => {});

  const {
    streamStall,
    setStreamStall,
    stallCountdown,
    setStallCountdown,
    streamElapsed,
    setStreamElapsed,
    streamPhase,
    setStreamPhase,
    compacting,
    setCompacting,
    activeToolName,
    setActiveToolName,
    pendingApproval,
    setPendingApproval,
    firstTokenReceived,
    setFirstTokenReceived,
    streamStartRef,
    sendTimeRef,
    firstTokenTimeRef,
    subscribeStreamStall,
  } = useStreamState(streaming);

  const { runs, activeRun, startRun, addStep, updateStep, completeRun } = useProcessRun();
  const [processDetailOpen, setProcessDetailOpen] = useState(false);
  const [highlightStepId, setHighlightStepId] = useState<string>();
  const processStepRef = useRef<string>('');
  const processRunIdRef = useRef<string>('');
  const [showEmoji, setShowEmoji] = useState(false);

  const {
    isRecording,
    setIsRecording,
    voicePhase,
    setVoicePhase,
    interimTranscript,
    setInterimTranscript,
    audioLevel,
    setAudioLevel,
    recordingDuration,
    setRecordingDuration,
    isSpeaking,
    setIsSpeaking,
    voiceAnnouncement,
    setVoiceAnnouncement,
    voiceAssistantOpen,
    setVoiceAssistantOpen,
    isHandsFree,
    setIsHandsFree,
    voiceMode,
    setVoiceMode,
    ttsVoice,
    setTtsVoice,
    ttsProvider,
    setTtsProvider,
    speechSupported,
    analyserRef,
    audioCtxRef,
    levelRafRef,
    recordingTimerRef,
    interimTranscriptRef,
    audioLevelRawRef,
    voiceSessionIdRef,
    voiceFinalTranscriptRef,
    levelThrottleRef,
    silenceStartRef,
    isHandsFreeRef,
    lastSpokenMsgRef,
    SILENCE_THRESHOLD,
    SILENCE_TIMEOUT_MS,
    hasSpeechRecognition,
    clearInterimAfter,
    cleanupAudioLevel,
    releaseCachedStream,
    micToast,
  } = useVoiceRecording();

  useWakeWord(voiceAssistantOpen, isRecording, setVoiceAssistantOpen, voiceMode);
  const voiceLaunchHandledRef = useRef(false);
  const [realtimeVoiceOpen, setRealtimeVoiceOpen] = useState(false);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (voiceLaunchHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const voiceLaunch = params.get('voice');
    if (voiceLaunch !== '1' && voiceLaunch !== 'true') return;

    voiceLaunchHandledRef.current = true;
    setVoiceMode(true);
    setVoiceAssistantOpen(true);
    params.delete('voice');
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [setVoiceAssistantOpen, setVoiceMode]);

  useEffect(() => {
    if (voiceAssistantOpen && !voiceSessionId) {
      const id = actions.getOrCreateVoiceSession(activeAgentId);
      setVoiceSessionId(id);
    }
  }, [voiceAssistantOpen, voiceSessionId, actions, activeAgentId]);

  const voiceSession = sessions.find((s) => s.id === voiceSessionId);
  const voiceMessages = voiceSession?.messages || [];

  const {
    tasks: sessionTasks,
    activeTasks,
    latestTask,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    updateTask,
    fetchSubtasks,
    fetchTrace,
  } = useTaskTracker({ sessionId: activeSessionId });

  useEscalationListener({ activeSessionId, addMessage: actions.addMessage });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(() =>
    getModelOverride(activeAgentId),
  );

  const {
    dynamicModels,
    setDynamicModels,
    routerUp,
    setRouterUp,
    AVAILABLE_MODELS,
    MODEL_CONTEXT_LIMITS,
  } = useModelList();

  const { appOptions } = useAppList();
  const { toolOptions, systemCount: toolSystemCount, appCount: toolAppCount } = useToolList();

  const [cliMode, setCliMode] = useState(
    () => localStorage.getItem(scopedStorageKey('shre-cli-mode-default')) === 'true',
  );
  const [claudeCliMode, setClaudeCliMode] = useState(
    () => localStorage.getItem(scopedStorageKey('shre-claude-cli-mode')) === 'true',
  );
  const [identityVerified, setIdentityVerified] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showTerminal, setShowTerminalRaw] = useState(
    () => localStorage.getItem(scopedStorageKey('shre-terminal-open')) === 'true',
  );

  const setShowTerminal = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setShowTerminalRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      localStorage.setItem(scopedStorageKey('shre-terminal-open'), String(next));
      return next;
    });
  }, []);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [termViewMode, setTermViewMode] = useState<'split' | 'tabs'>('split');
  const [activeView, setActiveView] = useState<string>('chat');
  const [previewContent, setPreviewContent] = useState<{
    content: string;
    type: string;
    title?: string;
  } | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [sharedSnapshot, setSharedSnapshot] = useState<{
    title: string;
    messages: ChatMessage[];
    model: string | null;
    createdAt: string;
  } | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [compareStreams, setCompareStreams] = useState<
    Record<string, { text: string; done: boolean; error?: string }>
  >({});
  const [compareWinner, setCompareWinner] = useState<string | null>(null);

  const comparePickerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  const streamBufferRef = useRef('');
  const streamFlushRaf = useRef<number | null>(null);
  const flushStreamBuffer = useCallback(() => {
    if (streamBufferRef.current) actions.setStreamText(streamBufferRef.current);
    streamFlushRaf.current = null;
  }, [actions]);

  const bufferToken = useCallback(
    (fullText: string) => {
      streamBufferRef.current = fullText;
      if (!streamFlushRaf.current)
        streamFlushRaf.current = requestAnimationFrame(flushStreamBuffer);
    },
    [flushStreamBuffer],
  );

  useEffect(
    () => () => {
      if (streamFlushRaf.current) cancelAnimationFrame(streamFlushRaf.current);
    },
    [],
  );

  const currentAgent = getAgent(activeAgentId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];
  const userName = state.userProfile?.name?.split(' ')[0] || 'You';

  const {
    pendingFiles,
    setPendingFiles,
    isDragging,
    fileRef,
    MAX_FILE_SIZE,
    handleFileSelect,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    removePendingFile,
    handlePaste,
  } = useFileHandling({
    activeSessionId,
    activeSessionTitle: activeSession?.title,
    activeAgentId,
    actions,
  });

  const {
    routerMode,
    setRouterMode,
    gatewayMode,
    handleSetGatewayMode,
    compareMode,
    setCompareMode,
    comparePickerOpen,
    setComparePickerOpen,
    showSystemPrompt,
    setShowSystemPrompt,
    systemPromptDraft,
    setSystemPromptDraft,
    summarizing,
    showSummary,
    setShowSummary,
    summaryText,
    showAnalytics,
    setShowAnalytics,
    shareUrl,
    setShareUrl,
    shareLoading,
    shareCopied,
    setShareCopied,
    notifSound,
    setNotifSound,
    handleToggleRouterMode,
    handleToggleCompare,
    handleOpenSystemPrompt,
    handleToggleNotifSound,
    handleSummarize,
    handleShare,
    handleCopyMarkdown,
    handleDownloadMd,
    handleDownloadJson,
    handleSaveSystemPrompt,
    conversationMode,
    activeAppId,
    setConversationMode,
  } = useHeaderActions({
    activeSessionId,
    activeSession,
    messages,
    userName,
    currentAgentName: currentAgent.name,
    currentAgentId: currentAgent.id,
    actions,
  });

  const { filteredMessages, lastAssistantMessage, getRunForMessage, useVirtual, virtualizer } =
    useFilteredMessages({ messages, latestTask, runs, scrollRef });

  const {
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    setGlobalSearchResults,
    globalSearching,
    setGlobalSearching,
    globalSearchRef,
    chatSearchOpen,
    setChatSearchOpen,
    chatSearch,
    setChatSearch,
    chatSearchIndex,
    setChatSearchIndex,
    chatSearchRef,
    chatSearchResults,
    chatSearchNavigate,
    closeChatSearch,
  } = useChatSearch(filteredMessages, virtualizer);

  const {
    wsConnected,
    setWsConnected,
    wsFailed,
    setWsFailed,
    wsStateInfo,
    setWsStateInfo,
    wsReconnecting,
    setWsReconnecting,
    wsBannerFlash,
    setWsBannerFlash,
    offlineQueue,
    setOfflineQueue,
  } = useGatewayConnection(subscribeStreamStall);

  const {
    scrollPositionsRef,
    prevMsgCount,
    newMsgStartIndex,
    initialLoadDone,
    showJumpToLatest,
    setShowJumpToLatest,
    userNearBottomRef,
    handleScroll,
    jumpToLatest,
    pullRefreshing,
    pullDistance,
    handlePullStart,
    handlePullMove,
    handlePullEnd,
    PULL_THRESHOLD,
    sentHistoryRef,
    sentHistoryIdxRef,
    HISTORY_MAX,
    HISTORY_KEY,
    recentWSSendRef,
  } = useChatEffects({
    activeSessionId,
    activeAgentId,
    streaming,
    streamText,
    sessions,
    messages,
    filteredMessages,
    actions,
    scrollRef,
    inputRef,
    streamFlushRaf,
    streamBufferRef,
    sendingRef,
    abortRef,
    setInput,
    setSelectedModel,
    setDynamicModels,
    setRouterUp,
    setCompareModels,
    showEmoji,
    setShowEmoji,
    emojiRef,
    showModelPicker,
    setShowModelPicker,
    modelPickerRef,
    comparePickerOpen,
    setComparePickerOpen,
    comparePickerRef,
    setShareUrl,
    setSharedSnapshot,
    setSharedLoading,
    setSharedError,
    generateTitle,
    virtualizer,
  });

  const ensureSession = useCallback((): string => {
    if (activeSessionId) return activeSessionId;
    const id = actions.newSession();
    actions.switchSession(id);
    return id;
  }, [activeSessionId, actions]);

  const {
    SLASH_COMMANDS,
    slashOpen,
    setSlashOpen,
    slashIndex,
    setSlashIndex,
    slashRef,
    slashFiltered,
    executeSlashCommand,
  } = useSlashCommands({
    input,
    setInput,
    activeSessionId,
    activeAgentId,
    activeSession,
    messages,
    actions,
    stateCompact: state.compact,
    cliMode,
    setCliMode,
    setCliContinue: (v: boolean) => setCliContinueRef.current(v),
    ensureSession,
    AVAILABLE_MODELS,
    setSelectedModel,
    setModelOverride,
  });

  const {
    mentionOpen,
    setMentionOpen,
    mentionIndex,
    setMentionIndex,
    mentionRef,
    mentionFiltered,
    mentionAgent,
    clearMention,
    onMentionSelect,
    extractMention,
  } = useMentions({
    input,
    setInput,
    agents: AGENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, group: a.group })),
    inputRef,
  });

  const {
    handleSend,
    handleSendRef,
    sendFeedbackToRapidRMS,
    queue,
    setQueue,
    editingQueueId,
    setEditingQueueId,
    editingQueueText,
    setEditingQueueText,
    setCliContinue,
    pendingSuggestionSendRef,
  } = useMessageHandlers({
    input,
    setInput,
    streaming,
    syncing,
    writeEnabled: state.writeEnabled,
    activeSessionId,
    activeAgentId,
    sessions,
    messages,
    filteredMessages,
    actions,
    replyToIndex: state.replyToIndex,
    pendingFiles,
    setPendingFiles,
    selectedModel,
    compareMode,
    compareModels,
    setCompareStreams,
    setCompareWinner,
    cliMode,
    routerMode,
    directMode: gatewayMode === 'direct',
    claudeCliMode,
    identityVerified,
    setIdentityVerified,
    pendingMessage,
    setPendingMessage,
    verifying,
    setVerifying,
    ensureSession,
    executeSlashCommand,
    extractMention,
    clearMention,
    setStreamPhase,
    setActiveToolName,
    setCompacting,
    setPendingApproval,
    setFirstTokenReceived,
    streamStartRef,
    sendTimeRef,
    firstTokenTimeRef,
    startRun,
    addStep,
    updateStep,
    completeRun,
    processStepRef,
    processRunIdRef,
    abortRef,
    sendingRef,
    streamBufferRef,
    streamFlushRaf,
    bufferToken,
    flushStreamBuffer,
    voiceFinalTranscriptRef,
    pendingEditSendRef,
    wsConnected,
    wsReconnecting,
    recentWSSendRef,
    virtualizer,
    userNearBottomRef,
    setShowJumpToLatest,
    setSuggestions,
    setSelectedMsgIndex,
    voiceMode,
  });

  setCliContinueRef.current = setCliContinue;

  const { startRecording, stopRecording, ttsAudioRef } = useVoiceHandlers({
    setInput,
    setIsRecording,
    setVoicePhase,
    setInterimTranscript,
    setAudioLevel,
    setRecordingDuration,
    setIsSpeaking,
    isSpeaking,
    voiceSessionIdRef,
    voiceFinalTranscriptRef,
    audioCtxRef,
    analyserRef,
    levelRafRef,
    recordingTimerRef,
    interimTranscriptRef,
    audioLevelRawRef,
    levelThrottleRef,
    silenceStartRef,
    lastSpokenMsgRef,
    isHandsFreeRef,
    SILENCE_THRESHOLD,
    SILENCE_TIMEOUT_MS,
    clearInterimAfter,
    cleanupAudioLevel,
    releaseCachedStream,
    isHandsFree,
    isRecording,
    voiceMode,
    setVoiceMode,
    ttsVoice,
    ttsProvider,
    streaming,
    messages,
    handleSendRef,
  });

  useEffect(() => {
    const onMicStart = () => startRecording();
    const onMicStop = () => stopRecording();
    window.addEventListener('shre-mic-start', onMicStart);
    window.addEventListener('shre-mic-stop', onMicStop);
    return () => {
      window.removeEventListener('shre-mic-start', onMicStart);
      window.removeEventListener('shre-mic-stop', onMicStop);
    };
  }, [startRecording, stopRecording]);

  const { handleAbort } = useKeyboardShortcuts({
    streaming,
    wsConnected,
    activeAgentId,
    activeSessionId,
    messages,
    filteredMessages,
    selectedMsgIndex,
    setSelectedMsgIndex,
    chatSearchOpen,
    setChatSearchOpen,
    chatSearchRef,
    closeChatSearch,
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchRef,
    shortcutsOpen,
    setShortcutsOpen,
    showModelPicker,
    setShowModelPicker,
    abortRef,
    inputRef,
    pendingEditSendRef,
    setInput,
    setEditingMsgIndex,
    setEditingMsgText,
    actions,
    virtualizer,
  });

  const handleKeyDown = useChatKeydown({
    slashOpen,
    slashFiltered,
    slashIndex,
    setSlashIndex,
    setSlashOpen,
    executeSlashCommand,
    mentionOpen,
    mentionFiltered,
    mentionIndex,
    setMentionIndex,
    setMentionOpen,
    onMentionSelect,
    editingQueueId,
    setEditingQueueId,
    setEditingQueueText,
    editingMsgIndex,
    setEditingMsgIndex,
    setEditingMsgText,
    input,
    setInput,
    setQueue,
    messages,
    activeSessionId,
    replaceSessionMessages: actions.replaceSessionMessages,
    handleSend,
    streaming,
    sentHistoryRef,
    sentHistoryIdxRef,
    HISTORY_KEY,
  });

  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );
  useEffect(() => {
    const onResize = () => {
      const nowMobile = window.innerWidth <= 768;
      setIsMobileLayout((wasMobile) => {
        if (nowMobile && !wasMobile && showTerminal) setActiveView('terminal');
        return nowMobile;
      });
    };
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
    };
  }, [showTerminal]);

  const isTabMode =
    (isMobileLayout || termViewMode === 'tabs') && (showTerminal || activeView === 'preview');
  const prevIsTabMode = useRef(false);
  useEffect(() => {
    if (isTabMode && !prevIsTabMode.current && showTerminal) setActiveView('terminal');
    prevIsTabMode.current = isTabMode;
  }, [isTabMode, showTerminal]);

  const messageListHandlers = useMessageListHandlers({
    activeSessionId,
    activeAgentId,
    actions,
    setEditingMsgIndex,
    setEditingMsgText,
    setInput,
    inputRef,
    setSelectedMsgIndex,
    setLightboxSrc,
    virtualizer,
  });

  if (!activeAgentId) return null;

  return (
    <div
      className={`chat-view-root flex flex-col h-full relative overflow-hidden bg-background-main selection:bg-indigo-500/30 selection:text-indigo-200 ${state.compact ? 'chat-compact' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DragOverlay isDragging={isDragging} />
      <TrialBanner />
      <ViewErrorBoundary>
        <ChatPanels
          showTerminal={showTerminal}
          termViewMode={termViewMode}
          activeView={activeView}
          isTabMode={isTabMode}
          sidebar={state.sidebarOpen}
          header={
            <ViewTabs
              activeView={activeView}
              setActiveView={setActiveView}
              showTerminal={showTerminal}
              termViewMode={termViewMode}
              isMobile={isMobileLayout}
              isTabMode={isTabMode}
              currentAgent={currentAgent}
              agents={AGENTS}
              onSwitchAgent={(id) => {
                actions.setActiveAgent(id);
                actions.newSession();
              }}
              routerMode={routerMode}
              onToggleRouterMode={handleToggleRouterMode}
              gatewayMode={gatewayMode}
              onSetGatewayMode={handleSetGatewayMode}
              compareMode={compareMode}
              onToggleCompare={handleToggleCompare}
              selectedModel={selectedModel}
              onShowModelPicker={() => setShowModelPicker(true)}
              onShowSystemPrompt={handleOpenSystemPrompt}
              onSummarize={handleSummarize}
              onShare={handleShare}
              onToggleNotifSound={handleToggleNotifSound}
              notifSound={notifSound}
              onDownloadMd={handleDownloadMd}
              onDownloadJson={handleDownloadJson}
              onCopyMarkdown={handleCopyMarkdown}
              onNewChat={() => {
                const id = actions.newSession();
                actions.switchSession(id);
                setInput('');
              }}
            />
          }
          content={
            <div className="flex flex-col h-full relative">
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
                statusLine={statusLine}
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
                firstTokenReceived={firstTokenReceived}
                onCancelStream={() => {
                  abortRef.current?.abort();
                  actions.setStreaming(false);
                  actions.setStreamText('');
                  actions.setStatusLine('');
                }}
                runs={runs}
                getRunForMessage={getRunForMessage}
                userProfile={state.userProfile}
                onScroll={handleScroll}
                onPullStart={handlePullStart}
                onPullMove={handlePullMove}
                onPullEnd={handlePullEnd}
                onJumpToLatest={jumpToLatest}
                {...messageListHandlers}
                onModeSwitchRequest={(mode: string) =>
                  setConversationMode(mode as ConversationModeId)
                }
                virtualizer={virtualizer}
                useVirtual={useVirtual}
              />
              {compareMode && (
                <CompareView
                  compareStreams={compareStreams}
                  compareWinner={compareWinner}
                  availableModels={AVAILABLE_MODELS}
                  activeSessionId={activeSessionId}
                  onPickWinner={(modelId, text) => {
                    setCompareWinner(modelId);
                    if (activeSessionId) {
                      const modelInfo = AVAILABLE_MODELS.find((m) => m.id === modelId);
                      actions.addMessage(activeSessionId, {
                        role: 'assistant',
                        content: text,
                        timestamp: Date.now(),
                      });
                      actions.addActivity(
                        activeSessionId,
                        'done',
                        `Compare winner: ${modelInfo?.name || modelId}`,
                      );
                      actions.addFeed(
                        activeSessionId,
                        'received',
                        `Winner: ${modelInfo?.name || modelId} (${text.length} chars)`,
                        { compare: 'true', model: modelId },
                      );
                    }
                  }}
                  onDismiss={() => {
                    setCompareStreams({});
                    setCompareWinner(null);
                  }}
                />
              )}
              {processDetailOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '50%',
                    zIndex: 30,
                    borderTop: '1px solid var(--c-border-1)',
                    background: 'var(--c-bg-main)',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  <ProcessDetail
                    run={activeRun ?? runs[runs.length - 1] ?? null}
                    highlightStepId={highlightStepId}
                    onClose={() => setProcessDetailOpen(false)}
                  />
                </div>
              )}
              <MessageQueue
                queue={queue}
                editingQueueId={editingQueueId}
                onReorder={(idx, dir) =>
                  setQueue((prev) => {
                    const next = [...prev];
                    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
                    return next;
                  })
                }
                onEdit={(item) => {
                  setEditingQueueId(item.id);
                  setEditingQueueText(item.text);
                  setInput(item.text);
                  setTimeout(() => {
                    const ta = document.getElementById('shre-chat-textarea');
                    if (ta) {
                      ta.focus();
                      (ta as HTMLTextAreaElement).setSelectionRange(
                        item.text.length,
                        item.text.length,
                      );
                    }
                  }, 50);
                }}
                onRemove={(id) => setQueue((prev) => prev.filter((q) => q.id !== id))}
              />
              <ProcessBar
                runs={runs}
                activeRun={activeRun}
                onStepClick={(_runId, stepId) => {
                  setHighlightStepId(stepId);
                  setProcessDetailOpen(true);
                }}
              />
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
                  localStorage.setItem(scopedStorageKey('shre-claude-cli-mode'), String(on));
                  if (on) {
                    setShowTerminal(true);
                    if (isMobileLayout || termViewMode === 'tabs') setActiveView('terminal');
                  } else if (cliMode) {
                    setCliMode(false);
                    localStorage.setItem(scopedStorageKey('shre-cli-mode-default'), 'false');
                  }
                }}
                onOpenClaudeCli={() => {
                  setShowTerminal(true);
                  if (isMobileLayout || termViewMode === 'tabs') setActiveView('terminal');
                  setTimeout(
                    () => terminalRef.current?.openTab({ title: 'Claude CLI', cmd: 'claude' }),
                    100,
                  );
                }}
                onOpenShreCli={() => {
                  setShowTerminal(true);
                  if (isMobileLayout || termViewMode === 'tabs') setActiveView('terminal');
                  setTimeout(
                    () => terminalRef.current?.openTab({ title: 'Shre CLI', cmd: 'shre' }),
                    100,
                  );
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
                ttsProvider={ttsProvider}
                speechSupported={speechSupported}
                hasSpeechRecognition={hasSpeechRecognition}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
                setIsHandsFree={setIsHandsFree}
                setVoiceMode={setVoiceMode}
                setTtsVoice={setTtsVoice}
                setTtsProvider={setTtsProvider}
                onStopTTS={() => {
                  if (ttsAudioRef.current) {
                    ttsAudioRef.current.pause();
                    ttsAudioRef.current = null;
                  }
                  window.speechSynthesis?.cancel();
                  setIsSpeaking(false);
                }}
                showTerminal={showTerminal}
                termViewMode={termViewMode}
                onToggleTerminal={() => {
                  if (!showTerminal) {
                    setShowTerminal(true);
                    if (isMobileLayout || termViewMode === 'tabs') setActiveView('terminal');
                  } else {
                    setShowTerminal(false);
                    setActiveView('chat');
                  }
                }}
                onToggleTermViewMode={() => {
                  const next = termViewMode === 'split' ? 'tabs' : 'split';
                  setTermViewMode(next);
                  if (next === 'tabs') setActiveView('chat');
                }}
                slashOpen={slashOpen}
                slashFiltered={slashFiltered}
                slashIndex={slashIndex}
                slashRef={slashRef}
                setSlashIndex={setSlashIndex}
                onSlashSelect={(cmd) => {
                  const hasArg = slashFiltered.find((c) => c.name === cmd)?.usage.includes('<');
                  if (hasArg && !input.includes(' ')) setInput(`/${cmd} `);
                  else executeSlashCommand(cmd.startsWith('model ') ? cmd : input.slice(1));
                }}
                mentionOpen={mentionOpen}
                mentionFiltered={mentionFiltered}
                mentionIndex={mentionIndex}
                mentionRef={mentionRef}
                setMentionIndex={setMentionIndex}
                onMentionSelect={onMentionSelect}
                mentionAgent={mentionAgent}
                replyToIndex={state.replyToIndex}
                replyToContent={
                  state.replyToIndex !== null
                    ? (filteredMessages[state.replyToIndex]?.content ??
                      messages[state.replyToIndex]?.content ??
                      null)
                    : null
                }
                onCancelReply={() => actions.setReplyTo(null)}
                editingMsgIndex={editingMsgIndex}
                editingQueueId={editingQueueId}
                onCancelEdit={() => {
                  if (editingQueueId) {
                    setEditingQueueId(null);
                    setEditingQueueText('');
                  } else {
                    setEditingMsgIndex(null);
                    setEditingMsgText('');
                  }
                  setInput('');
                }}
                suggestions={suggestions}
                onSelectSuggestion={(s) => {
                  setSuggestions([]);
                  setInput(s);
                }}
                voiceAnnouncement={voiceAnnouncement}
              />
            </div>
          }
          terminal={
            showTerminal && (
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center bg-background-main">
                    <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                }
              >
                <TerminalView
                  ref={terminalRef}
                  visible={showTerminal}
                  onClose={() => {
                    setShowTerminal(false);
                    setActiveView('chat');
                  }}
                  active={activeView === 'terminal'}
                  onExecute={handleSend}
                />
              </Suspense>
            )
          }
          preview={
            activeView === 'preview' &&
            previewContent && (
              <PreviewPanel content={previewContent} onClose={() => setActiveView('chat')} />
            )
          }
        />
      </ViewErrorBoundary>
      {branchToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-full shadow-lg z-50 animate-bounce">
          Branched conversation
        </div>
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Mic hardware release confirmation */}
      {micToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white/90 text-xs font-bold uppercase tracking-widest rounded-full shadow-2xl border border-white/10 z-[300] flex items-center gap-2 animate-fadeIn">
          <svg
            className="w-3 h-3 text-red-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Mic Off
        </div>
      )}

      <GlobalSearchModal
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        query={globalSearchQuery}
        onQueryChange={setGlobalSearchQuery}
        results={globalSearchResults}
        searching={globalSearching}
        onSelect={(s, m) => {
          actions.switchSession(s);
          setTimeout(() => setSelectedMsgIndex(m), 100);
          setGlobalSearchOpen(false);
        }}
      />
      {sharedSnapshot && (
        <ShareSnapshotView
          snapshot={sharedSnapshot}
          loading={sharedLoading}
          error={sharedError}
          onClose={() => setSharedSnapshot(null)}
        />
      )}
      <AppsDrawer
        open={showApps}
        onClose={() => setShowApps(false)}
        activeAgentId={activeAgentId}
      />
      <Suspense fallback={null}>
        <VoiceAssistant
          open={voiceAssistantOpen}
          onClose={() => setVoiceAssistantOpen(false)}
          messages={messages}
          agentName={currentAgent.name}
          agentEmoji={currentAgent.emoji}
          agentId={activeAgentId}
          ttsVoice={ttsVoice}
          ttsProvider={ttsProvider}
          agents={AGENTS}
          onSwitchAgent={(id) => {
            actions.setActiveAgent(id);
            actions.newSession();
          }}
          onVoiceTurn={(t) => {
            if (voiceSessionId)
              actions.addMessage(voiceSessionId, { role: t.role, content: t.content });
          }}
          routerMode={routerMode}
          models={AVAILABLE_MODELS}
          selectedModel={selectedModel}
          onSelectModel={(id) => {
            setSelectedModel(id);
            setModelOverride(activeAgentId, id);
          }}
          onSetTtsProvider={setTtsProvider}
        />
      </Suspense>
      <RealtimeVoiceOverlay
        open={realtimeVoiceOpen}
        onClose={() => setRealtimeVoiceOpen(false)}
        agentName={currentAgent.name}
        agentEmoji={currentAgent.emoji}
      />
      <ArtifactCanvas
        artifact={activeArtifact}
        artifacts={extractArtifacts(messages)}
        onClose={() => setActiveArtifact(null)}
        onArtifactClick={setActiveArtifact}
      />
    </div>
  );
}
