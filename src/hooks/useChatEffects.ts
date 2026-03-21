import { useState, useRef, useEffect, useCallback } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { setAgent, fetchAllAgentMessages, fetchAvailableModels, type ChatMessage, type RouterModel } from "../openclaw";
import { isWSConnected, startHealthPoll, stopHealthPoll, onHealthChange, abortChatWS, abortAllStreams, retryConnection } from "../gateway-ws";
import { loadScrollPositions, saveScrollPositions, type Session } from "../store";
import { showDesktopNotification, getModelOverride, setModelOverride } from "../chat-utils";

export interface UseChatEffectsParams {
  activeSessionId: string | null;
  activeAgentId: string;
  streaming: boolean;
  streamText: string;
  sessions: Session[];
  messages: ChatMessage[];
  filteredMessages: ChatMessage[];
  actions: {
    setSyncing: (v: boolean) => void;
    switchSession: (id: string) => void;
    replaceSessionMessages: (id: string, msgs: ChatMessage[]) => void;
    addMessage: (id: string, msg: ChatMessage) => void;
    addFeed: (id: string, type: string, text: string, meta?: Record<string, string>) => void;
    newSession: () => string;
    updateSessionTitle: (id: string, title: string) => void;
    setStreaming: (v: boolean) => void;
    setStreamText: (v: string) => void;
    setGatewayUp: (v: boolean | null) => void;
    setDraft: (id: string, v: string) => void;
    getDraft: (id: string) => string;
    setStatusLine: (s: string | null) => void;
  };
  scrollRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  streamFlushRaf: React.MutableRefObject<number | null>;
  streamBufferRef: React.MutableRefObject<string>;
  sendingRef: React.MutableRefObject<boolean>;
  abortRef: React.MutableRefObject<AbortController | null>;
  setInput: (v: string) => void;
  setSelectedModel: (v: string | null | ((prev: string | null) => string | null)) => void;
  setDynamicModels: (v: RouterModel[]) => void;
  setRouterUp: (v: boolean | null) => void;
  setCompareModels: (v: string[] | ((prev: string[]) => string[])) => void;
  showEmoji: boolean;
  setShowEmoji: (v: boolean) => void;
  emojiRef: React.RefObject<HTMLDivElement>;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  modelPickerRef: React.RefObject<HTMLDivElement>;
  comparePickerOpen: boolean;
  setComparePickerOpen: (v: boolean) => void;
  comparePickerRef: React.RefObject<HTMLDivElement>;
  setShareUrl: (v: string | null) => void;
  setSharedSnapshot: (v: any) => void;
  setSharedLoading: (v: boolean) => void;
  setSharedError: (v: string | null) => void;
  generateTitle: (text: string) => string;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
}

export interface UseChatEffectsReturn {
  scrollPositionsRef: React.MutableRefObject<Record<string, number>>;
  prevMsgCount: React.MutableRefObject<number>;
  newMsgStartIndex: React.MutableRefObject<number | null>;
  initialLoadDone: React.MutableRefObject<boolean>;
  showJumpToLatest: boolean;
  setShowJumpToLatest: (v: boolean) => void;
  userNearBottomRef: React.MutableRefObject<boolean>;
  handleScroll: () => void;
  jumpToLatest: () => void;
  pullRefreshing: boolean;
  pullDistance: number;
  handlePullStart: (e: React.TouchEvent) => void;
  handlePullMove: (e: React.TouchEvent) => void;
  handlePullEnd: () => void;
  PULL_THRESHOLD: number;
  sentHistoryRef: React.MutableRefObject<string[]>;
  sentHistoryIdxRef: React.MutableRefObject<number>;
  HISTORY_MAX: number;
  HISTORY_KEY: string;
  recentWSSendRef: React.MutableRefObject<boolean>;
}

export function useChatEffects(params: UseChatEffectsParams): UseChatEffectsReturn {
  const {
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
  } = params;

  const scrollPositionsRef = useRef<Record<string, number>>(loadScrollPositions());
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const prevMsgCount = useRef(0);
  const newMsgStartIndex = useRef<number | null>(null);
  const initialLoadDone = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const userNearBottomRef = useRef(true);
  const showJumpRef = useRef(false);
  const jumpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const PULL_THRESHOLD = 80;
  const prevAgentRef = useRef(activeAgentId);
  const prevStreamingRef = useRef(false);
  const lastSyncRef = useRef(0);
  const syncedAgentRef = useRef<string | null>(null);
  const recentWSSendRef = useRef(false);
  const HISTORY_MAX = 20;
  const HISTORY_KEY = "shre-sent-history";
  const [initHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  });
  const sentHistoryRef = useRef<string[]>(initHistory);
  const sentHistoryIdxRef = useRef(initHistory.length);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji]);

  // Close model picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  // Close compare picker on outside click
  useEffect(() => {
    if (!comparePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (comparePickerRef.current && !comparePickerRef.current.contains(e.target as Node)) setComparePickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [comparePickerOpen]);

  // Sync selected model when agent changes
  useEffect(() => {
    setSelectedModel(getModelOverride(activeAgentId));
  }, [activeAgentId]);

  // Fetch live model list from shre-router
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchAvailableModels().then((models) => {
        if (cancelled) return;
        if (models.length > 0) {
          setDynamicModels(models);
          setRouterUp(true);
          const validIds = new Set(models.map((m) => m.id));
          setSelectedModel((prev: string | null) => {
            if (prev && !validIds.has(prev)) {
              setModelOverride(activeAgentId, null);
              return null;
            }
            return prev;
          });
          setCompareModels((prev: string[]) => {
            const valid = prev.filter((id) => validIds.has(id));
            return valid.length !== prev.length ? valid : prev;
          });
        } else {
          setRouterUp(false);
        }
      });
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeAgentId]);

  // Detect /shared/:id URL and load snapshot
  useEffect(() => {
    const match = window.location.pathname.match(/^\/shared\/([a-z0-9]{8})$/);
    if (!match) return;
    setSharedLoading(true);
    fetch(`/api/share/${match[1]}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setSharedSnapshot(data);
        setSharedLoading(false);
      })
      .catch(() => {
        setSharedError("Shared conversation not found or has expired.");
        setSharedLoading(false);
      });
  }, []);

  // Collect and send client system info on mount
  useEffect(() => {
    const sendClientInfo = async () => {
      try {
        const info = {
          platform: navigator.platform,
          userAgent: navigator.userAgent,
          language: navigator.language,
          languages: navigator.languages?.slice(0, 5),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffset: new Date().getTimezoneOffset(),
          screen: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio },
          window: { width: window.innerWidth, height: window.innerHeight },
          online: navigator.onLine,
          cookieEnabled: navigator.cookieEnabled,
          hardwareConcurrency: navigator.hardwareConcurrency,
          maxTouchPoints: navigator.maxTouchPoints,
          colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
        };
        await fetch("/api/client-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(info),
        });
      } catch { /* non-critical */ }
    };
    sendClientInfo();
  }, []);

  // Sync OpenClaw agent when active agent changes
  useEffect(() => {
    setAgent(activeAgentId);
  }, [activeAgentId]);

  // Sync messages from OpenClaw session files on agent change
  useEffect(() => {
    let cancelled = false;

    async function syncFromOpenClaw() {
      const isInitialSync = syncedAgentRef.current !== activeAgentId;
      if (isInitialSync) {
        actions.setSyncing(true);
        syncedAgentRef.current = activeAgentId;
      }

      try {
        const sinceTs = isInitialSync ? 0 : lastSyncRef.current;
        const syncTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("sync-timeout")), 8000)
        );
        const result = await Promise.race([fetchAllAgentMessages(activeAgentId, sinceTs), syncTimeout]);
        if (cancelled || result.messages.length === 0) return;

        const isInternal = (c: string) => {
          const t = c.trim();
          if (/^\s*\[\s*"/.test(t) && /"\s*\]\s*$/.test(t)) return true;
          if (t.includes("suggest 3 brief follow-up questions")) return true;
          if (t.includes("MEMORY CHECKPOINT") || t.includes("MEMORY_CHECKPOINT")) return true;
          if (t.startsWith("System:") || t.startsWith("[System]") || t.startsWith("[subagent]")) return true;
          if (t.includes("Post-compaction context refresh") || t.includes("Session Startup")) return true;
          return false;
        };
        const rawMsgs = result.messages.filter(
          (m) => (m.role === "user" || m.role === "assistant") && m.content?.trim() && !isInternal(m.content)
        );
        const seenOC = new Set<string>();
        const chatMessages = rawMsgs.filter((m) => {
          const k = `${m.role}:${m.content.trim().slice(0, 100)}`;
          if (seenOC.has(k)) return false;
          seenOC.add(k);
          return true;
        });
        if (chatMessages.length === 0) return;

        let liveSessions = sessions;
        try {
          const stored = localStorage.getItem("shre-sessions");
          if (stored) liveSessions = JSON.parse(stored);
        } catch {}
        const existingSession = liveSessions.find((s: Session) => (s.agentId || "main") === activeAgentId);

        if (existingSession) {
          if (isInitialSync) {
            if (activeSessionId !== existingSession.id) {
              actions.switchSession(existingSession.id);
            }
            const localTimestamps = new Set(existingSession.messages.map((m) => m.timestamp).filter(Boolean));
            const localContentsInit = new Set(existingSession.messages.map((m) => m.content.trim().slice(0, 100)));
            const localWithoutTs = existingSession.messages.filter((m) => !m.timestamp);
            const openClawNew = chatMessages.filter((m) =>
              m.timestamp && !localTimestamps.has(m.timestamp) && !localContentsInit.has(m.content.trim().slice(0, 100))
            );
            const allTimestamped = [...existingSession.messages.filter((m) => m.timestamp), ...openClawNew];
            const seen = new Set<string>();
            const deduped = allTimestamped.filter((m) => {
              const key = `${m.timestamp || 0}:${m.role}:${m.content.trim().slice(0, 80)}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const merged = [...localWithoutTs, ...deduped].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const changed = merged.length !== existingSession.messages.length ||
              merged.some((m, idx) => m.content !== existingSession.messages[idx]?.content);
            if (changed) {
              actions.replaceSessionMessages(existingSession.id, merged);
            }
          } else {
            const localContents = new Set(existingSession.messages.map((m) => `${m.role}:${m.content.trim().slice(0, 120)}`));
            const newMsgs = chatMessages.filter((m) =>
              m.role === "assistant" &&
              !localContents.has(`${m.role}:${m.content.trim().slice(0, 120)}`)
            );
            for (const msg of newMsgs) {
              actions.addMessage(existingSession.id, msg);
              actions.addFeed(existingSession.id, "received",
                `[OpenClaw] ${msg.content.slice(0, 80)}${msg.content.length > 80 ? "\u2026" : ""}`,
                { source: "openclaw", agent: activeAgentId, model: msg.model || "" }
              );
            }
          }
        } else {
          const id = actions.newSession();
          const firstUserMsg = chatMessages.find((m) => m.role === "user");
          actions.updateSessionTitle(id, generateTitle(firstUserMsg?.content || "OpenClaw chat"));
          actions.replaceSessionMessages(id, chatMessages);
          actions.switchSession(id);
        }

        lastSyncRef.current = Date.now();
      } finally {
        if (isInitialSync && !cancelled) {
          actions.setSyncing(false);
        }
      }
    }

    syncFromOpenClaw();
    const iv = setInterval(async () => {
      if (streaming || isWSConnected() || recentWSSendRef.current) return;
      await syncFromOpenClaw();
    }, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeAgentId]);

  // Smart scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevCount = prevMsgCount.current;
    const newMessage = filteredMessages.length > prevCount;
    prevMsgCount.current = filteredMessages.length;

    if (newMessage && initialLoadDone.current) {
      newMsgStartIndex.current = prevCount;
      setTimeout(() => { newMsgStartIndex.current = null; }, 220);
    }
    if (!initialLoadDone.current && filteredMessages.length > 0) {
      initialLoadDone.current = true;
    }

    if (newMessage) {
      if (userNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToLatest(false);
      } else {
        setShowJumpToLatest(true);
      }
      return;
    }
    if (streamText && userNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredMessages.length, streamText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 300;
    userNearBottomRef.current = near;
    if (activeSessionId) {
      scrollPositionsRef.current[activeSessionId] = el.scrollTop;
      if (!scrollSaveTimerRef.current) {
        scrollSaveTimerRef.current = setTimeout(() => {
          scrollSaveTimerRef.current = null;
          saveScrollPositions(scrollPositionsRef.current);
        }, 2000);
      }
    }
    const shouldShow = !near && el.scrollHeight > el.clientHeight;
    if (shouldShow !== showJumpRef.current) {
      showJumpRef.current = shouldShow;
      if (jumpDebounceRef.current) clearTimeout(jumpDebounceRef.current);
      jumpDebounceRef.current = setTimeout(() => {
        jumpDebounceRef.current = null;
        setShowJumpToLatest(shouldShow);
      }, 300);
    }
  }, [activeSessionId]);

  const jumpToLatest = useCallback(() => {
    if (filteredMessages.length > 30 && virtualizer) {
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: "end", behavior: "smooth" });
    } else {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    setShowJumpToLatest(false);
    userNearBottomRef.current = true;
  }, [filteredMessages.length, virtualizer]);

  // Pull-to-refresh handlers
  const handlePullStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    pullStartRef.current = { y: e.touches[0].clientY, scrollTop: el.scrollTop };
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (!pullStartRef.current || pullRefreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 5) { setPullDistance(0); return; }
    const dy = e.touches[0].clientY - pullStartRef.current.y;
    if (dy > 0 && pullStartRef.current.scrollTop <= 0) {
      setPullDistance(Math.min(dy * 0.5, 120));
    }
  }, [pullRefreshing]);

  const handlePullEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !pullRefreshing) {
      setPullRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      retryConnection().finally(() => {
        setTimeout(() => { setPullRefreshing(false); setPullDistance(0); }, 800);
      });
      if (navigator.vibrate) navigator.vibrate(30);
    } else {
      setPullDistance(0);
    }
    pullStartRef.current = null;
  }, [pullDistance, pullRefreshing]);

  // Flush scroll positions on page unload + cleanup timer
  useEffect(() => {
    const handleUnload = () => saveScrollPositions(scrollPositionsRef.current);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
    };
  }, []);

  // Gateway health polling
  useEffect(() => {
    startHealthPoll();
    const unsub = onHealthChange((up) => actions.setGatewayUp(up));
    return () => { unsub(); stopHealthPoll(); };
  }, []);

  // Focus input + restore scroll position on session switch
  useEffect(() => {
    const prevId = prevSessionIdRef.current;
    const isSameSession = prevId === activeSessionId;

    if (prevId && !isSameSession) {
      const el = scrollRef.current;
      if (el) scrollPositionsRef.current[prevId] = el.scrollTop;
      const currentInput = inputRef.current?.value ?? "";
      actions.setDraft(prevId, currentInput);
    }
    prevSessionIdRef.current = activeSessionId ?? null;

    if (!isSameSession) {
      if (activeSessionId) {
        const draft = actions.getDraft(activeSessionId);
        setInput(draft);
      } else {
        setInput("");
      }
    }

    if (!isSameSession) {
      initialLoadDone.current = false;
      newMsgStartIndex.current = null;
    }

    inputRef.current?.focus();

    const savedPos = activeSessionId ? scrollPositionsRef.current[activeSessionId] : undefined;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el = scrollRef.current;
        if (savedPos != null && savedPos >= 0) {
          if (el) {
            el.scrollTop = savedPos;
            const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            const near = distFromBottom < 300;
            userNearBottomRef.current = near;
            setShowJumpToLatest(!near && el.scrollHeight > el.clientHeight);
          }
        } else {
          // Scroll to bottom — use virtualizer for large message lists
          if (filteredMessages.length > 30 && virtualizer) {
            virtualizer.scrollToIndex(filteredMessages.length - 1, { align: "end" });
          } else if (el) {
            el.scrollTop = el.scrollHeight;
          }
          userNearBottomRef.current = true;
          setShowJumpToLatest(false);
        }
      });
    });
    return () => { cancelled = true; };
  }, [activeSessionId]);

  // Abort active stream on session change or unmount
  useEffect(() => {
    return () => {
      if (sendingRef.current) return;
      abortRef.current?.abort();
      abortRef.current = null;
      if (isWSConnected()) {
        abortChatWS(activeAgentId, "main");
      }
      if (streamFlushRaf.current) {
        clearTimeout(streamFlushRaf.current);
        streamFlushRaf.current = null;
      }
      streamBufferRef.current = "";
      actions.setStreaming(false);
      actions.setStreamText("");
    };
  }, [activeSessionId]);

  // When switching agents, reset local UI streaming state
  useEffect(() => {
    if (prevAgentRef.current !== activeAgentId) {
      actions.setStreaming(false);
      actions.setStreamText("");
      streamBufferRef.current = "";
      if (streamFlushRaf.current) {
        clearTimeout(streamFlushRaf.current);
        streamFlushRaf.current = null;
      }
      prevAgentRef.current = activeAgentId;
    }
  }, [activeAgentId]);

  // Abort all agent streams on page close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => { abortAllStreams(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Clear share popover when session changes
  useEffect(() => { setShareUrl(null); }, [activeSessionId]);

  // Desktop notification when streaming completes while tab is hidden
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        showDesktopNotification(last.content);
      }
    }
    prevStreamingRef.current = streaming;
  }, [streaming, messages]);

  // Seed sent history from session messages if localStorage is empty
  useEffect(() => {
    if (sentHistoryRef.current.length > 0) return;
    const userMsgs = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
    if (userMsgs.length > 0) {
      const unique = [...new Set(userMsgs)].slice(-HISTORY_MAX);
      sentHistoryRef.current = unique;
      sentHistoryIdxRef.current = unique.length;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(unique));
    }
  }, [messages.length]);

  return {
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
  };
}
