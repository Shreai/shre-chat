import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ProcessBar, ProcessDetail, useProcessRun } from "./components/process-bar";
import type { ChatMessage, RouterModel } from "./openclaw";
import ports from "../../ports.json";
import { retryConnection } from "./gateway-ws";
import { useApp, uid, generateTitle, getAgent, AGENTS, shareSession, exportSessions, importSessions, type UploadedFile, type Session } from "./store";
import type { TerminalHandle } from "./TerminalView";
const TerminalView = lazy(() => import("./TerminalView").then(m => ({ default: m.TerminalView })));
const VoiceAssistant = lazy(() => import("./VoiceAssistant"));
const ContentCard = lazy(() => import("./components/ContentCard"));

// Extracted modules
import {
  playNotifSound,
  estimateTokens, formatTokenCount, providerIcon, providerLabel,
  FALLBACK_MODELS, DEFAULT_CONTEXT_LIMIT,
  getContextColor, getModelOverride, setModelOverride,
  ECOSYSTEM_APPS, formatTime, copyToClipboard, mib007Link,
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
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useVoiceHandlers } from "./hooks/useVoiceHandlers";
import { useChatEffects } from "./hooks/useChatEffects";
import { useMessageHandlers } from "./hooks/useMessageHandlers";

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
    } catch { /* ignore */ }
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
  const [previewContent, setPreviewContent] = useState<{ content: string; type: "html" | "json" | "chart" | "table"; title?: string } | null>(null);
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
      }),
    [messages],
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
    generateTitle,
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
    ensureSession, executeSlashCommand,
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

  // ── Textarea keydown handler ──────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command dropdown navigation
    if (slashOpen && slashFiltered.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + slashFiltered.length) % slashFiltered.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % slashFiltered.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const selected = slashFiltered[slashIndex];
        if (selected) {
          const hasArg = selected.usage.includes("<");
          setInput("/" + selected.name + (hasArg ? " " : ""));
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = slashFiltered[slashIndex];
        if (selected) {
          const hasArg = selected.usage.includes("<");
          if (hasArg && !input.includes(" ")) {
            setInput("/" + selected.name + " ");
          } else {
            executeSlashCommand(input.slice(1));
          }
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

    // Escape cancels edit mode (queue or message)
    if (e.key === "Escape" && editingQueueId !== null) {
      e.preventDefault();
      setEditingQueueId(null);
      setEditingQueueText("");
      setInput("");
      return;
    }
    if (e.key === "Escape" && editingMsgIndex !== null) {
      e.preventDefault();
      setEditingMsgIndex(null);
      setEditingMsgText("");
      setInput("");
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // If editing a queue item, save back to queue and stop
      if (editingQueueId !== null) {
        const newText = input.trim();
        if (newText) {
          setQueue((prev) => prev.map((q) => q.id === editingQueueId ? { ...q, text: newText } : q));
        }
        setEditingQueueId(null);
        setEditingQueueText("");
        setInput("");
        return;
      }
      // If editing a message, truncate history and resend
      if (editingMsgIndex !== null && activeSessionId && input.trim()) {
        const truncated = messages.slice(0, editingMsgIndex);
        actions.replaceSessionMessages(activeSessionId, truncated);
        setEditingMsgIndex(null);
        setEditingMsgText("");
      }
      if (input.trim()) {
        // Avoid duplicating the last entry
        const hist = sentHistoryRef.current;
        if (hist[hist.length - 1] !== input.trim()) {
          hist.push(input.trim());
          if (hist.length > HISTORY_MAX) hist.splice(0, hist.length - HISTORY_MAX);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
        }
        sentHistoryIdxRef.current = hist.length;
      }
      handleSend();
    } else if (e.key === "ArrowUp" && !input) {
      e.preventDefault();
      const hist = sentHistoryRef.current;
      if (hist.length === 0) return;
      const idx = sentHistoryIdxRef.current - 1;
      if (idx >= 0) {
        sentHistoryIdxRef.current = idx;
        setInput(hist[idx]);
      }
    } else if (e.key === "ArrowDown" && sentHistoryIdxRef.current >= 0 && sentHistoryIdxRef.current < sentHistoryRef.current.length) {
      e.preventDefault();
      const hist = sentHistoryRef.current;
      const idx = sentHistoryIdxRef.current + 1;
      if (idx < hist.length) {
        sentHistoryIdxRef.current = idx;
        setInput(hist[idx]);
      } else {
        sentHistoryIdxRef.current = hist.length;
        setInput("");
      }
    }
  };

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
  const handleContentExpand = useCallback((content: string, type: "html" | "json" | "chart" | "table", title?: string) => {
    setPreviewContent({ content, type, title });
    setActiveView("preview");
    if (termViewMode !== "tabs") setTermViewMode("tabs");
  }, [termViewMode]);

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
      {/* Header with tabs — below traffic lights */}
      <header className="flex items-center justify-between px-4 py-2.5 shrink-0 backdrop-blur-xl"
        style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-2)", zIndex: 30, position: "relative" }}>
        <div className="flex items-center gap-3 min-w-0 flex-1 shre-no-drag">
          <button onClick={() => actions.setSidebarOpen(!state.sidebarOpen)} className="shrink-0 p-1 -ml-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "var(--c-text-3)" }}
            aria-label={state.sidebarOpen ? "Close sidebar" : "Open sidebar"}>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
          </button>

          {(() => {
            const s = sessions.find((x) => x.id === activeSessionId);
            if (!s) return <span className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--c-text-1)" }}>{currentAgent.name}</span>;
            return editingTabId === s.id ? (
              <input
                autoFocus
                value={editingTabText}
                onChange={(e) => setEditingTabText(e.target.value)}
                onBlur={() => { if (editingTabText.trim()) actions.updateSessionTitle(s.id, editingTabText.trim()); setEditingTabId(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { if (editingTabText.trim()) actions.updateSessionTitle(s.id, editingTabText.trim()); setEditingTabId(null); } if (e.key === "Escape") setEditingTabId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-[180px] sm:max-w-[260px] bg-transparent outline-none text-[13px] font-semibold tracking-tight rounded px-1"
                style={{ color: "var(--c-text-1)", border: "1px solid var(--c-accent)" }}
              />
            ) : (
              <span
                className="text-[13px] font-semibold tracking-tight truncate max-w-[180px] sm:max-w-[260px] cursor-default"
                style={{ color: "var(--c-text-1)" }}
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

          <span
            className={`inline-block h-[6px] w-[6px] rounded-full shrink-0 ${wsConnected ? "bg-emerald-400" : wsFailed ? "bg-red-400" : gatewayUp ? "bg-yellow-400" : gatewayUp === false ? "bg-red-400" : "bg-gray-500"}`}
            title={wsConnected ? "Connected" : wsFailed ? "Connection failed" : gatewayUp ? "HTTP fallback" : gatewayUp === false ? "Offline" : "Connecting..."}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ModelPicker
            open={showModelPicker}
            onToggle={() => setShowModelPicker(!showModelPicker)}
            onClose={() => setShowModelPicker(false)}
            selectedModel={selectedModel}
            onSelectModel={(modelId) => { setSelectedModel(modelId); setModelOverride(activeAgentId, modelId); }}
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

            {showHeaderMore && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMore(false)} />
                <div
                  className="absolute right-0 top-10 z-50 w-56 rounded-xl shadow-xl py-1"
                  style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-2)", maxHeight: "min(580px, calc(100dvh - 80px))", overflowY: "auto" }}
                >
                  <button
                    onClick={() => {
                      const next = !openclawMode;
                      setOpenclawMode(next);
                      localStorage.setItem("shre-openclaw-mode", String(next));
                      setShowHeaderMore(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: "var(--c-text-1)" }}
                  >
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: openclawMode ? "#a855f7" : "#3b82f6" }} />
                    {openclawMode ? "Switch to Router" : "Switch to OpenClaw"}
                  </button>

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <div className="relative" ref={comparePickerRef}>
                    <button
                      onClick={() => {
                        if (!compareMode) {
                          setCompareMode(true);
                          if (compareModels.length < 2) setComparePickerOpen(true);
                        } else {
                          setCompareMode(false);
                          setCompareStreams({});
                          setCompareWinner(null);
                          setComparePickerOpen(false);
                        }
                        setShowHeaderMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                      style={{ color: compareMode ? "var(--c-warning)" : "var(--c-text-1)" }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                      {compareMode ? "Exit Compare" : "Compare Models"}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setSystemPromptDraft(activeSession?.systemPrompt || "");
                      setShowSystemPrompt(true);
                      setShowHeaderMore(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: activeSession?.systemPrompt ? "var(--c-accent)" : "var(--c-text-1)" }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    System Prompt
                  </button>

                  <button
                    onClick={() => { actions.toggleCompact(); setShowHeaderMore(false); }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: state.compact ? "var(--c-accent)" : "var(--c-text-1)" }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {state.compact
                        ? <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
                        : <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>
                      }
                    </svg>
                    {state.compact ? "Comfortable View" : "Compact View"}
                  </button>

                  <button
                    onClick={() => {
                      const next = !notifSound;
                      setNotifSound(next);
                      if (next) playNotifSound();
                      setShowHeaderMore(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: "var(--c-text-1)" }}
                  >
                    {notifSound ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    )}
                    {notifSound ? "Mute Sounds" : "Enable Sounds"}
                  </button>

                  {messages.length > 0 && (
                    <>
                      <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                      {messages.length >= 4 && (
                        <button
                          onClick={async () => {
                            setShowHeaderMore(false);
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
                                  model: "anthropic/claude-haiku",
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
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                          style={{ color: "var(--c-text-1)" }}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                          Summarize
                        </button>
                      )}

                      <button
                        onClick={() => { setShowAnalytics(true); setShowHeaderMore(false); }}
                        className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                        style={{ color: "var(--c-text-1)" }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        Analytics
                      </button>

                      {activeSessionId && (
                        <button
                          onClick={async () => {
                            setShowHeaderMore(false);
                            setShareLoading(true);
                            setShareCopied(false);
                            try {
                              const url = await shareSession(activeSessionId);
                              setShareUrl(url);
                            } catch {
                              actions.setStatusLine("Failed to create share link");
                              setTimeout(() => actions.setStatusLine(null), 3000);
                            }
                            setShareLoading(false);
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                          style={{ color: "var(--c-text-1)" }}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                          Share
                        </button>
                      )}

                      <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                      <button
                        onClick={() => {
                          const md = messages.map((m) =>
                            `**${m.role === "user" ? userName : currentAgent.name}** (${formatTime(m.timestamp)}):\n${m.content}`
                          ).join("\n\n---\n\n");
                          navigator.clipboard?.writeText(md).then(() => {
                            actions.setStatusLine("Copied to clipboard");
                            setTimeout(() => actions.setStatusLine(null), 2000);
                          });
                          setShowHeaderMore(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                        style={{ color: "var(--c-text-2)" }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                        Copy as Markdown
                      </button>

                      <button
                        onClick={() => {
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
                          setShowHeaderMore(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                        style={{ color: "var(--c-text-2)" }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download .md
                      </button>

                      <button
                        onClick={() => {
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
                          setShowHeaderMore(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                        style={{ color: "var(--c-text-2)" }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Download .json
                      </button>
                    </>
                  )}

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <button
                    onClick={() => { setShowApps(!showApps); setShowHeaderMore(false); }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: "var(--c-text-1)" }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="1" y="1" width="4" height="4" rx="1" />
                      <rect x="6" y="1" width="4" height="4" rx="1" />
                      <rect x="11" y="1" width="4" height="4" rx="1" />
                      <rect x="1" y="6" width="4" height="4" rx="1" />
                      <rect x="6" y="6" width="4" height="4" rx="1" />
                      <rect x="11" y="6" width="4" height="4" rx="1" />
                    </svg>
                    Ecosystem Apps
                  </button>

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Views</div>
                  <HeaderMenuItem label="Feed" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>} active={view === "feed"} onClick={() => { actions.setView("feed"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Feed Analytics" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>} active={view === "feed-analytics"} onClick={() => { actions.setView("feed-analytics"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Cost Dashboard" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>} active={view === "cost-dashboard"} onClick={() => { actions.setView("cost-dashboard"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Reports" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} active={view === "reports"} onClick={() => { actions.setView("reports"); setShowHeaderMore(false); }} />

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Apps</div>
                  <HeaderMenuItem label="Marketplace" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z"/><line x1="3" y1="7" x2="21" y2="7"/><path d="M16 11a4 4 0 0 1-8 0"/></svg>} active={view === "marketplace"} onClick={() => { actions.setView("marketplace"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Task Timeline" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>} active={view === "task-timeline"} onClick={() => { actions.setView("task-timeline"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Tasks" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} external onClick={() => { window.open(mib007Link("tasks"), "_blank"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Reminders" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>} external onClick={() => { window.open(mib007Link("reminders"), "_blank"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Projects" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>} external onClick={() => { window.open(mib007Link("projects"), "_blank"); setShowHeaderMore(false); }} />

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Tools</div>
                  <HeaderMenuItem label="Admin" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} active={view === "admin"} onClick={() => { actions.setView("admin"); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Fine-Tuning" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} active={view === "finetune"} onClick={() => { actions.setView("finetune"); setShowHeaderMore(false); }} />

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "4px 12px" }} />

                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Data</div>
                  <HeaderMenuItem label="Export Sessions" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>} onClick={() => { exportSessions(sessions); setShowHeaderMore(false); }} />
                  <HeaderMenuItem label="Import Sessions" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>} onClick={() => { importInputRef.current?.click(); setShowHeaderMore(false); }} />
                </div>
              </>
            )}
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
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2"
          style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-2)" }}
        >
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none truncate"
            style={{ background: "var(--c-bg-input)", color: "var(--c-text-2)" }}
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl).then(() => {
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2000);
              });
            }}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
            style={{
              background: shareCopied ? "var(--c-success-bg)" : "var(--c-accent)",
              color: shareCopied ? "var(--c-success)" : "var(--c-on-accent)",
            }}
          >
            {shareCopied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => setShareUrl(null)}
            className="p-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "var(--c-text-3)" }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ── Reconnection banner ─────────────────────────────────────── */}
      {(wsReconnecting || wsFailed || wsBannerFlash === "connected") && (
        <div
          className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] font-medium ws-reconnect-banner"
          style={{
            background: wsBannerFlash === "connected"
              ? "rgba(34, 197, 94, 0.12)"
              : wsFailed
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(234, 179, 8, 0.12)",
            borderBottom: `1px solid ${
              wsBannerFlash === "connected"
                ? "rgba(34, 197, 94, 0.25)"
                : wsFailed
                  ? "rgba(239, 68, 68, 0.25)"
                  : "rgba(234, 179, 8, 0.25)"
            }`,
            color: wsBannerFlash === "connected"
              ? "var(--c-success-soft)"
              : wsFailed
                ? "var(--c-danger-soft)"
                : "var(--c-yellow)",
          }}
        >
          {wsBannerFlash === "connected" ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </>
          ) : wsReconnecting ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400 ws-reconnect-pulse" />
              Reconnecting{wsStateInfo.attempt ? ` (attempt ${wsStateInfo.attempt}/${wsStateInfo.maxAttempts})` : ""}...
            </>
          ) : wsFailed ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
              {wsStateInfo.errorMessage ? `Connection error: ${wsStateInfo.errorMessage}` : "Connection lost"}
              <button
                onClick={() => { setWsFailed(false); retryConnection().then(() => setWsConnected(true)).catch(() => {}); }}
                className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  color: "var(--c-danger-soft)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                Retry
              </button>
            </>
          ) : null}
        </div>
      )}

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
      {messages.length > 0 && (() => {
        const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
        const modelId = selectedModel || "anthropic/claude-sonnet-4-6";
        const knownLimit = MODEL_CONTEXT_LIMITS[modelId];
        if (!knownLimit && dynamicModels.length > 0) return null; // unknown context window — don't show misleading bar
        const contextLimit = knownLimit || DEFAULT_CONTEXT_LIMIT;
        const usagePct = Math.min((totalTokens / contextLimit) * 100, 100);
        const color = getContextColor(usagePct);
        return (
          <div className="shrink-0 relative" style={{ height: "3px", background: "var(--c-border-1)" }}
            title={`Context usage: ~${formatTokenCount(totalTokens)} / ${(contextLimit / 1000).toFixed(0)}k limit (${usagePct.toFixed(1)}%)`}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${usagePct}%`,
              background: color,
              transition: "width 0.3s ease, background 0.3s ease",
            }} />
            {usagePct > 80 && (
              <div className="absolute right-1 flex items-center gap-1" style={{ top: "4px" }}>
                <span className="text-[9px] font-medium px-1 py-0.5 rounded"
                  style={{ color: "var(--c-on-accent)", background: color, lineHeight: 1, opacity: 0.9 }}>
                  {usagePct.toFixed(0)}% context
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── In-chat search bar (Cmd+F) ───────────────────────────────── */}
      {chatSearchOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
          style={{
            background: "var(--c-bg-glass)",
            borderBottom: "1px solid var(--c-border-1)",
            backdropFilter: "blur(12px)",
            zIndex: 25,
          }}>
          <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={chatSearchRef}
            type="text"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); closeChatSearch(); }
              if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); chatSearchNavigate(-1); }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatSearchNavigate(1); }
            }}
            placeholder="Search in conversation..."
            aria-label="Search in conversation"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--c-text-1)" }}
            autoFocus
          />
          {chatSearch.trim() && (
            <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--c-text-4)" }}>
              {chatSearchResults.length > 0
                ? `${chatSearchIndex + 1} of ${chatSearchResults.length}`
                : "No results"}
            </span>
          )}
          <button
            onClick={() => chatSearchNavigate(-1)}
            disabled={chatSearchResults.length === 0}
            className="p-0.5 rounded transition-colors disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
            style={{ color: "var(--c-text-3)" }}
            title="Previous match (Shift+Enter)"
            aria-label="Previous search match"
          >
            <svg className="h-3.5 w-3.5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button
            onClick={() => chatSearchNavigate(1)}
            disabled={chatSearchResults.length === 0}
            className="p-0.5 rounded transition-colors disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
            style={{ color: "var(--c-text-3)" }}
            title="Next match (Enter)"
            aria-label="Next search match"
          >
            <svg className="h-3.5 w-3.5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button
            onClick={closeChatSearch}
            className="p-0.5 rounded transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
            style={{ color: "var(--c-text-4)" }}
            title="Close search (Escape)"
            aria-label="Close search"
          >
            <svg className="h-3.5 w-3.5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
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
            {ECOSYSTEM_APPS.map((app) => (
              <button
                key={app.id}
                onClick={() => { window.open(app.url, app.id, "noopener,noreferrer"); setShowApps(false); }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all group"
              >
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-xs font-bold group-hover:scale-105 transition-transform`}>
                  {app.icon}
                </div>
                <span className="text-[10px] font-medium" style={{ color: "var(--c-text-2)" }}>{app.name}</span>
              </button>
            ))}
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
        replyToIndex={state.replyToIndex}
        replyToContent={state.replyToIndex !== null && filteredMessages[state.replyToIndex] ? filteredMessages[state.replyToIndex].content : null}
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
            messages={messages}
            agentName={currentAgent.name}
            agentEmoji={currentAgent.emoji}
            agentId={activeAgentId}
            ttsVoice={ttsVoice}
            agents={AGENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }))}
            onSwitchAgent={(id) => actions.setActiveAgent(id)}
            onVoiceTurn={(turn) => { if (activeSessionId) actions.addMessage(activeSessionId, { role: turn.role, content: turn.content }); }}
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

function HeaderMenuItem({ label, icon, active, external, onClick }: {
  label: string; icon: React.ReactNode; active?: boolean; external?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
      style={{ color: active ? "var(--c-accent)" : "var(--c-text-1)" }}
    >
      <span style={{ color: active ? "var(--c-accent)" : "var(--c-text-3)" }}>{icon}</span>
      {label}
      {external && (
        <svg className="h-3 w-3 ml-auto" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      )}
    </button>
  );
}
