import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ProcessBar, ProcessDetail, useProcessRun } from "./components/process-bar";
import type { ChatMessage, RouterModel } from "./openclaw";
import ports from "../../ports.json";
import { retryConnection } from "./gateway-ws";
import { useApp, uid, generateTitle, getAgent, AGENTS, shareSession, exportSessions, importSessions, type UploadedFile, type Session, type View } from "./store";
import type { TerminalHandle } from "./TerminalView";
const TerminalView = lazy(() => import("./TerminalView").then(m => ({ default: m.TerminalView })));
const VoiceAssistant = lazy(() => import("./VoiceAssistant"));
const ContentCard = lazy(() => import("./components/ContentCard"));

// Extracted modules
import {
  playNotifSound, providerIcon, providerLabel,
  FALLBACK_MODELS, getModelOverride, setModelOverride,
  ECOSYSTEM_APPS, formatTime,
} from "./chat-utils";
import { usePreferences } from "./preferences-store";
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

// Extracted UI components
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { ModelPicker } from "./components/ModelPicker";
import { MessageQueue } from "./components/MessageQueue";
import { MessageList } from "./components/MessageList";
import { ChatComposer } from "./components/ChatComposer";
import { SystemPromptEditor } from "./components/SystemPromptEditor";
import { SummaryModal } from "./components/SummaryModal";
import { SessionAnalyticsModal } from "./components/SessionAnalyticsModal";
import { CompareView } from "./components/CompareView";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { ShareSnapshotView } from "./components/ShareSnapshotView";
import { SuggestionsBar } from "./components/SuggestionsBar";
import { HeaderMoreMenu } from "./components/HeaderMoreMenu";
import { ChatSearchBar } from "./components/ChatSearchBar";
import { ContextBar } from "./components/ContextBar";
import { ShareBar } from "./components/ShareBar";
import { useChatKeydown } from "./hooks/useChatKeydown";


// ── Helpers, sub-components, and constants moved to:
//    ./chat-utils.ts, ./components/MessageBubble.tsx,
//    ./components/WelcomeScreen.tsx, ./components/LinkPreview.tsx

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
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const dragCounter = useRef(0);
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

  const [showModelPicker, setShowModelPicker] = useState(false);
  const notifSound = usePreferences((s) => s.notifSound);
  const setNotifSound = usePreferences((s) => s.setNotifSound);
  const [selectedModel, setSelectedModel] = useState<string | null>(() => getModelOverride(activeAgentId));
  // ── Dynamic model list from shre-router ────────────────────────────
  const [dynamicModels, setDynamicModels] = useState<RouterModel[]>([]);
  const [routerUp, setRouterUp] = useState<boolean | null>(null);
  const AVAILABLE_MODELS = useMemo(() => {
    if (dynamicModels.length === 0) return FALLBACK_MODELS;
    return dynamicModels.map((m) => ({
      id: m.id,
      name: m.name,
      provider: providerLabel(m.provider),
      icon: providerIcon(m.provider),
      connected: m.connected,
    }));
  }, [dynamicModels]);
  const MODEL_CONTEXT_LIMITS = useMemo(() => {
    const limits: Record<string, number> = {};
    for (const m of dynamicModels) {
      if (m.contextWindow) limits[m.id] = m.contextWindow;
    }
    return limits;
  }, [dynamicModels]);
  const [cliMode, setCliMode] = useState(false);
  const [openclawMode, setOpenclawMode] = useState(() => localStorage.getItem("shre-openclaw-mode") === "true");
  // Sync openclawMode when StatusBar toggle changes localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "shre-openclaw-mode") setOpenclawMode(e.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // ── Identity verification gate ──────────────────────────────────────
  const [identityVerified, setIdentityVerified] = useState(() => sessionStorage.getItem("shre-identity-verified") === "true");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [termViewMode, setTermViewMode] = useState<"split" | "tabs">("split");
  const [activeView, setActiveView] = useState<string>("chat"); // "chat" | "terminal" | "preview"
  const [previewContent, setPreviewContent] = useState<{ content: string; type: string; title?: string } | null>(null);
  // ── Share via link ────────────────────────────────────────────────
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // ── Shared view (read-only snapshot from /shared/:id) ─────────────
  const [sharedSnapshot, setSharedSnapshot] = useState<{ title: string; messages: ChatMessage[]; model: string | null; createdAt: string } | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  // ── Compare mode ──────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [compareStreams, setCompareStreams] = useState<Record<string, { text: string; done: boolean; error?: string }>>({});
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [compareWinner, setCompareWinner] = useState<string | null>(null);
  const comparePickerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // ── System prompt editor ──────────────────────────────────────────
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  // ── Conversation summarization ────────────────────────────────────
  const [summarizing, setSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  // ── Session analytics modal ──────────────────────────────────────
  const [showAnalytics, setShowAnalytics] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Last assistant message content — for SuggestionsBar pattern detection
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content.trim()) return messages[i].content;
    }
    return "";
  }, [messages]);

  // ── Virtualized message list ──────────────────────────────────────
  const filteredMessages = useMemo(
    () => messages
      .filter((msg) => {
        // Filter out empty assistant messages
        if (msg.role !== "user" && !msg.content.trim()) return false;
        const t = msg.content.trim();
        // ── Filter internal/system messages from OpenClaw sync ──
        if (t.includes("suggest 3 brief follow-up questions") || t.includes("suggest 3 brief followup")) return false;
        if (/^\s*\[\s*"/.test(t) && /"\s*\]\s*$/.test(t)) return false;
        if (t.includes("MEMORY CHECKPOINT") || t.includes("MEMORY_CHECKPOINT")) return false;
        if (t.startsWith("subagent task") || t.startsWith("[subagent]") || t.startsWith("Subagent result:")) return false;
        if (t.includes("Post-compaction context refresh") || t.includes("Session Startup")
          || t.includes("Session was just compacted")) return false;
        if (t.startsWith("System:") || t.startsWith("[System]")) return false;
        if (t.includes("AGENTS.md") || t.includes("Sender (untrusted metadata)")) return false;
        if (t.includes("identity verification") && t.length > 200) return false;
        if (t.includes("You are an AI assistant") && t.includes("session") && t.length > 800) return false;
        return true;
      })
      .map((msg) => {
        if (msg.role !== "user" && msg.content.startsWith("[[reply_to_current]]")) {
          return { ...msg, content: msg.content.replace(/^\[\[reply_to_current\]\]\s*/, "") };
        }
        return msg;
      })
      .map((msg, i, arr) => {
        // Inject task badge on the last assistant message if a conversation-loop task exists
        if (latestTask && msg.role === "assistant" && i === arr.length - 1) {
          return { ...msg, meta: { ...msg.meta, taskId: latestTask.id, taskStatus: latestTask.status } };
        }
        return msg;
      }),
    [messages, latestTask],
  );

  // Match process runs to assistant messages by timestamp proximity
  const getRunForMessage = useCallback((msg: ChatMessage, msgIndex: number): import("./components/process-bar/types").ProcessRun | null => {
    if (msg.role === "user" || !msg.timestamp) return null;
    let best: import("./components/process-bar/types").ProcessRun | null = null;
    let bestDiff = Infinity;
    for (const run of runs) {
      const diff = msg.timestamp - run.startedAt;
      if (diff >= 0 && diff < 300_000 && diff < bestDiff) {
        best = run;
        bestDiff = diff;
      }
    }
    return best;
  }, [runs]);

  // Virtualize at 30+ messages to avoid DOM bloat
  const useVirtual = filteredMessages.length > 30;
  const virtualizer = useVirtualizer({
    count: useVirtual ? filteredMessages.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 15,
    enabled: useVirtual,
  });

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
    cliMode, openclawMode, identityVerified, setIdentityVerified,
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

  // ── File handling ─────────────────────────────────────────────────
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const processFiles = useCallback((files: File[]) => {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        actions.setStatusLine(`File "${file.name}" too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 5MB)`);
        setTimeout(() => actions.setStatusLine(null), 4000);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const uploaded: UploadedFile = {
          id: uid(),
          name: file.name,
          size: file.size,
          type: file.type,
          sessionId: activeSessionId || "",
          sessionTitle: activeSession?.title || "Chat",
          agentId: activeAgentId,
          uploadedAt: Date.now(),
          dataUrl: reader.result as string,
        };
        setPendingFiles((prev) => [...prev, uploaded]);
      };
      reader.readAsDataURL(file);
    }
  }, [activeSessionId, activeSession?.title, activeAgentId, actions]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    processFiles(Array.from(fileList));
    e.target.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  }, [processFiles]);

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const isTabMode = termViewMode === "tabs" && (showTerminal || activeView === "preview");
  const showChat = !isTabMode || activeView === "chat";
  const showTermPanel = showTerminal && (!isTabMode || activeView === "terminal");
  const showPreviewPanel = isTabMode && activeView === "preview" && previewContent;

  // Handler for content block expand (lego blocks)
  const handleContentExpand = useCallback((content: string, type: string, title?: string) => {
    setPreviewContent({ content, type, title });
    setActiveView("preview");
    if (termViewMode !== "tabs") setTermViewMode("tabs");
  }, [termViewMode]);

  // ── Header menu callbacks ────────────────────────────────────────
  const handleToggleOpenclawMode = useCallback(() => {
    const next = !openclawMode;
    setOpenclawMode(next);
    localStorage.setItem("shre-openclaw-mode", String(next));
  }, [openclawMode]);

  const handleToggleCompare = useCallback(() => {
    if (!compareMode) {
      setCompareMode(true);
      if (compareModels.length < 2) setComparePickerOpen(true);
    } else {
      setCompareMode(false);
      setCompareStreams({});
      setCompareWinner(null);
      setComparePickerOpen(false);
    }
  }, [compareMode, compareModels.length]);

  const handleOpenSystemPrompt = useCallback(() => {
    setSystemPromptDraft(activeSession?.systemPrompt || "");
    setShowSystemPrompt(true);
  }, [activeSession?.systemPrompt]);

  const handleToggleNotifSound = useCallback(() => {
    const next = !notifSound;
    setNotifSound(next);
    if (next) playNotifSound();
  }, [notifSound, setNotifSound]);

  const handleSummarize = useCallback(async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const convoText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n")
        .slice(0, 4000);
      const res = await fetch("/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          input: `Summarize this conversation concisely in bullet points. Include key decisions, questions asked, and conclusions reached.\n\nConversation:\n${convoText}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
      const data = await res.json();
      const text = data?.output
        ?.filter((o: { type: string }) => o.type === "message")
        ?.flatMap((o: { content: { type: string; text: string }[] }) => o.content?.filter((c: { type: string }) => c.type === "output_text")?.map((c: { text: string }) => c.text) ?? [])
        ?.join("") || "";
      if (!text) throw new Error("Empty summary returned");
      setSummaryText(text);
      setShowSummary(true);
    } catch (err: unknown) {
      actions.setStatusLine(`Summary failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setTimeout(() => actions.setStatusLine(null), 4000);
    } finally {
      setSummarizing(false);
    }
  }, [summarizing, messages, actions]);

  const handleShare = useCallback(async () => {
    if (!activeSessionId) return;
    setShareLoading(true);
    setShareCopied(false);
    try {
      const url = await shareSession(activeSessionId);
      setShareUrl(url);
    } catch (err) {
      console.warn("share session", err);
      actions.setStatusLine("Failed to create share link");
      setTimeout(() => actions.setStatusLine(null), 3000);
    }
    setShareLoading(false);
  }, [activeSessionId, actions]);

  const handleCopyMarkdown = useCallback(() => {
    const md = messages.map((m) =>
      `**${m.role === "user" ? userName : currentAgent.name}** (${formatTime(m.timestamp)}):\n${m.content}`
    ).join("\n\n---\n\n");
    navigator.clipboard?.writeText(md).then(() => {
      actions.setStatusLine("Copied to clipboard");
      setTimeout(() => actions.setStatusLine(null), 2000);
    });
  }, [messages, userName, currentAgent.name, actions]);

  const handleDownloadMd = useCallback(() => {
    const md = `# ${activeSession?.title || "Chat"}\n\n` + messages.map((m) =>
      `## ${m.role === "user" ? userName : currentAgent.name} (${formatTime(m.timestamp)})\n\n${m.content}`
    ).join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeSession?.title || "chat").replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    actions.setStatusLine("Downloaded as Markdown");
    setTimeout(() => actions.setStatusLine(null), 2000);
  }, [messages, userName, currentAgent.name, activeSession?.title, actions]);

  const handleDownloadJson = useCallback(() => {
    const data = {
      title: activeSession?.title || "Chat",
      agent: currentAgent.id,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model: m.meta?.model,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeSession?.title || "chat").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    actions.setStatusLine("Downloaded as JSON");
    setTimeout(() => actions.setStatusLine(null), 2000);
  }, [messages, currentAgent.id, activeSession?.title, actions]);

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
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="flex flex-col items-center gap-3 px-12 py-10 rounded-2xl"
            style={{
              border: "2px dashed var(--c-accent, #3b82f6)",
              background: "rgba(59, 130, 246, 0.08)",
            }}
          >
            <svg className="h-10 w-10" style={{ color: "var(--c-accent, #3b82f6)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--c-text-1, #fff)" }}>Drop files here</span>
            <span className="text-[11px]" style={{ color: "var(--c-text-4, #888)" }}>Max 5MB per file</span>
          </div>
        </div>
      )}
      {/* Traffic light safe area — only takes space in Shre desktop */}
      <div className="shre-drag shrink-0 titlebar-safe" style={{ background: "var(--c-bg-glass)" }} />

      {/* Top-level view tabs — visible in tab mode when terminal is open */}
      {isTabMode && (
        <nav className="flex items-center shrink-0 px-2 gap-0.5" role="tablist" aria-label="View switcher"
          style={{ background: "var(--c-bg-glass)", borderBottom: "1px solid var(--c-border-1)" }}>
          <button
            onClick={() => setActiveView("chat")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
            style={{
              color: activeView === "chat" ? "var(--c-text-1)" : "var(--c-text-4)",
              borderBottom: activeView === "chat" ? "2px solid var(--c-accent)" : "2px solid transparent",
            }}
            aria-label="Chat view"
            aria-selected={activeView === "chat"}
            role="tab"
          >
            <svg className="h-3 w-3" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Chat
          </button>
          <button
            onClick={() => setActiveView("terminal")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
            style={{
              color: activeView === "terminal" ? "var(--c-text-1)" : "var(--c-text-4)",
              borderBottom: activeView === "terminal" ? "2px solid var(--c-terminal-accent)" : "2px solid transparent",
            }}
            aria-label="Terminal view"
            aria-selected={activeView === "terminal"}
            role="tab"
          >
            <svg className="h-3 w-3" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            Terminal
          </button>
          {previewContent && (
            <button
              onClick={() => setActiveView("preview")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
              style={{
                color: activeView === "preview" ? "var(--c-text-1)" : "var(--c-text-4)",
                borderBottom: activeView === "preview" ? "2px solid var(--c-emerald, #34d399)" : "2px solid transparent",
              }}
              aria-label="Preview view"
              aria-selected={activeView === "preview"}
              role="tab"
            >
              <svg className="h-3 w-3" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Preview
            </button>
          )}
          {/* View mode toggle — switch back to split */}
          <button
            onClick={() => { setTermViewMode("split"); if (activeView === "preview") setActiveView("chat"); }}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors hover:brightness-125"
            style={{ color: "var(--c-text-4)" }}
            title="Switch to split view"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
          </button>
        </nav>
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

      {/* Preview panel — expanded content block (lego block) */}
      {showPreviewPanel && previewContent && (
        <div className="flex-1 min-h-0 flex flex-col" style={{ background: "var(--c-bg-1)" }}>
          <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
            <div className="flex items-center gap-2">
              <span className="text-sm">{previewContent.type === "chart" ? "\u{1F4CA}" : previewContent.type === "json" ? "{}" : previewContent.type === "table" ? "\u{1F4CB}" : "</>"}</span>
              <span className="text-xs font-medium" style={{ color: "var(--c-text-1)" }}>{previewContent.title || `${previewContent.type.toUpperCase()} Preview`}</span>
            </div>
            <button
              onClick={() => { setPreviewContent(null); setActiveView("chat"); }}
              className="h-7 w-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--c-text-4)" }}
              aria-label="Close preview"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <ViewErrorBoundary viewName="Content Preview">
              <Suspense fallback={<div className="flex items-center justify-center h-full" style={{ color: "var(--c-text-4)" }}>Loading...</div>}>
                <ContentCard type={previewContent.type} content={previewContent.content} title={previewContent.title} />
              </Suspense>
            </ViewErrorBoundary>
          </div>
        </div>
      )}

      {/* Chat content — hidden in tab mode when terminal is active */}
      {showChat && <>
      {/* Compact toolbar — model picker + options */}
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
              const prevName = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name ?? selectedModel;
              setSelectedModel(modelId);
              setModelOverride(activeAgentId, modelId);
              const sid = ensureSession();
              const newName = AVAILABLE_MODELS.find(m => m.id === modelId)?.name ?? modelId;
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
              onToggleCompare={handleToggleCompare}
              comparePickerRef={comparePickerRef}
              activeSession={activeSession}
              onOpenSystemPrompt={handleOpenSystemPrompt}
              compact={state.compact}
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

      {/* Gateway WS reconnection banner removed — all chat routes via HTTP/SSE through shre-router */}

      {/* ── Offline message queue indicator ────────────────────────────── */}
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

      {/* ── Context window usage bar ─────────────────────────────────── */}
      <ContextBar
        messages={messages}
        selectedModel={selectedModel}
        modelContextLimits={MODEL_CONTEXT_LIMITS}
        dynamicModelsCount={dynamicModels.length}
      />

      {/* ── In-chat search bar (Cmd+F) ───────────────────────────────── */}
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
      {showApps && (
        <div className="px-4 py-3 shrink-0 relative" style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-1)" }}>
          <button
            onClick={() => setShowApps(false)}
            className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--c-text-3)" }}
            aria-label="Close apps"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="flex gap-3 justify-center">
            {ECOSYSTEM_APPS.map((app) => {
              const disabled = !app.url;
              return (
              <button
                key={app.id}
                onClick={() => { if (!disabled) { window.open(app.url, app.id, "noopener,noreferrer"); setShowApps(false); } }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all group ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                title={disabled ? `${app.name} — local access only` : app.description}
              >
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-xs font-bold ${disabled ? "" : "group-hover:scale-105"} transition-transform`}>
                  {app.icon}
                </div>
                <span className="text-[10px] font-medium" style={{ color: "var(--c-text-2)" }}>{app.name}</span>
                {disabled && <span className="text-[8px]" style={{ color: "var(--c-text-5)" }}>local only</span>}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* System prompt modal */}
      <SystemPromptEditor
        isOpen={showSystemPrompt}
        onClose={() => setShowSystemPrompt(false)}
        draft={systemPromptDraft}
        onDraftChange={setSystemPromptDraft}
        onSave={() => {
          if (activeSessionId) {
            actions.setSystemPrompt(activeSessionId, systemPromptDraft.trim());
          }
          setShowSystemPrompt(false);
        }}
        onClear={() => setSystemPromptDraft("")}
      />

      {/* ── Summary modal ─────────────────────────────────────────── */}
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

      {/* ── Session Analytics Modal ─────────────────────────────────── */}
      <SessionAnalyticsModal
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        messages={messages}
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
        onImageClick={setLightboxSrc}
        onSelectTemplate={(prompt) => { setInput(prompt); inputRef.current?.focus(); }}
        onFeedback={(msgIndex, fb) => {
          if (activeSessionId) {
            const msg = filteredMessages[msgIndex];
            const newFeedback = msg.feedback === fb ? null : fb;
            actions.setMessageFeedback(activeSessionId, msgIndex, newFeedback);
            if (newFeedback !== null && msg.role === "assistant") {
              sendFeedbackToRapidRMS(msgIndex, newFeedback);
            }
          }
        }}
        onEditStart={(msgIndex, content) => {
          setEditingMsgIndex(msgIndex);
          setEditingMsgText(content);
          setInput(content);
          setTimeout(() => {
            const ta = document.getElementById("shre-chat-textarea");
            if (ta) { ta.focus(); (ta as HTMLTextAreaElement).setSelectionRange(content.length, content.length); }
          }, 50);
        }}
        onEditChange={(text) => setEditingMsgText(text)}
        onEditCancel={() => { setEditingMsgIndex(null); setEditingMsgText(""); }}
        onEdit={(msgIndex, newText) => {
          if (!activeSessionId) return;
          const truncated = messages.slice(0, msgIndex);
          actions.replaceSessionMessages(activeSessionId, truncated);
          setEditingMsgIndex(null);
          setEditingMsgText("");
          setInput(newText);
          pendingEditSendRef.current = true;
        }}
        onRegenerate={(msgIndex) => {
          if (!activeSessionId) return;
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          if (!lastUserMsg) return;
          const truncated = messages.slice(0, messages.length - 1);
          actions.replaceSessionMessages(activeSessionId, truncated);
          setInput(lastUserMsg.content);
          pendingEditSendRef.current = true;
        }}
        onAnnotate={(msgIndex, text) => {
          if (activeSessionId) actions.setAnnotation(activeSessionId, msgIndex, text);
        }}
        onBranch={(msgIndex) => {
          if (!activeSessionId) return;
          const newId = actions.branchFrom(activeSessionId, msgIndex);
          if (newId) {
            setBranchToast(true);
            setTimeout(() => setBranchToast(false), 2000);
          }
        }}
        onReaction={(msgIndex, emoji) => {
          if (activeSessionId) actions.toggleReaction(activeSessionId, msgIndex, emoji);
        }}
        onReply={(msgIndex) => {
          actions.setReplyTo(msgIndex);
          inputRef.current?.focus();
        }}
        onRetry={(msgIndex) => {
          if (!activeSessionId) return;
          const lastUserMsg = [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === "user");
          if (!lastUserMsg) return;
          const truncated = messages.slice(0, msgIndex);
          actions.replaceSessionMessages(activeSessionId, truncated);
          setInput(lastUserMsg.content);
          pendingEditSendRef.current = true;
        }}
        onRunCommand={(cmd) => { setShowTerminal(true); setTimeout(() => terminalRef.current?.sendCommand(cmd), 300); }}
        onContentExpand={handleContentExpand}
        onApprove={(approvalId) => {
          fetch("/api/router/v1/chat/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approvalId, approved: true }),
          }).catch(() => {});
          setPendingApproval(null);
          actions.setStatusLine("Approved \u2014 executing...");
        }}
        onDeny={(approvalId) => {
          fetch("/api/router/v1/chat/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approvalId, approved: false }),
          }).catch(() => {});
          setPendingApproval(null);
          actions.setStatusLine("Denied \u2014 operation cancelled");
        }}
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
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const item of Array.from(items)) {
            if (!item.type.startsWith("image/")) continue;
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            if (file.size > MAX_FILE_SIZE) {
              actions.setStatusLine(`Pasted image too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 5MB)`);
              setTimeout(() => actions.setStatusLine(null), 4000);
              continue;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const uploaded: UploadedFile = {
                id: uid(),
                name: `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`,
                size: file.size,
                type: file.type,
                sessionId: activeSessionId || "",
                sessionTitle: activeSession?.title || "Chat",
                agentId: activeAgentId,
                uploadedAt: Date.now(),
                dataUrl: reader.result as string,
              };
              setPendingFiles((prev) => [...prev, uploaded]);
            };
            reader.readAsDataURL(file);
          }
        }}
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

