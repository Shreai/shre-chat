import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessage, generateAITitle, type ChatMessage, type ToolResult, type ThreadContext } from "../openclaw";
import { sendChatWS, isWSConnected, queueMessage, onStateChange } from "../gateway-ws";
import { uid, generateTitle, getAgent, type UploadedFile, type Session } from "../store";
import { playNotifSound, mib007Link } from "../chat-utils";
import { detectTaskIntent, createTaskFromChat, detectIssueIntent, createIssueFromChat } from "../taskDetector";

export interface UseMessageHandlersParams {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  syncing: boolean;
  writeEnabled: boolean;
  activeSessionId: string | null;
  activeAgentId: string;
  sessions: Session[];
  messages: ChatMessage[];
  filteredMessages: ChatMessage[];
  actions: {
    setDraft: (id: string, v: string) => void;
    setStreaming: (v: boolean) => void;
    setStreamText: (v: string) => void;
    setStatusLine: (s: string | null) => void;
    addMessage: (id: string, msg: ChatMessage) => void;
    addActivity: (id: string, status: string, text: string) => void;
    addFeed: (id: string, type: string, text: string, meta?: Record<string, string>) => void;
    addFile: (f: UploadedFile) => void;
    replaceSessionMessages: (id: string, msgs: ChatMessage[]) => void;
    updateSessionTitle: (id: string, title: string) => void;
    newSession: () => string;
    switchSession: (id: string) => void;
    setReplyTo: (v: number | null) => void;
  };
  replyToIndex: number | null;
  pendingFiles: UploadedFile[];
  setPendingFiles: (v: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  selectedModel: string | null;
  compareMode: boolean;
  compareModels: string[];
  setCompareStreams: (v: Record<string, { text: string; done: boolean; error?: string }> | ((prev: any) => any)) => void;
  setCompareWinner: (v: string | null) => void;
  cliMode: boolean;
  openclawMode: boolean;
  identityVerified: boolean;
  setIdentityVerified: (v: boolean) => void;
  pendingMessage: string | null;
  setPendingMessage: (v: string | null) => void;
  verifying: boolean;
  setVerifying: (v: boolean) => void;
  ensureSession: () => string;
  executeSlashCommand: (cmd: string) => void;
  extractMention?: (text: string) => { cleanText: string; agentId: string | null };
  clearMention?: () => void;
  // Stream state
  setStreamPhase: (v: string) => void;
  setActiveToolName: (v: string | null) => void;
  setCompacting: (v: boolean) => void;
  setPendingApproval: (v: any) => void;
  streamStartRef: React.MutableRefObject<number>;
  sendTimeRef: React.MutableRefObject<number>;
  firstTokenTimeRef: React.MutableRefObject<number>;
  // Process bar
  startRun: (id: string, sessionId: string) => void;
  addStep: (runId: string, step: any) => string;
  updateStep: (runId: string, stepId: string, update: any) => void;
  completeRun: (runId: string) => void;
  processStepRef: React.MutableRefObject<string>;
  processRunIdRef: React.MutableRefObject<string>;
  // Buffers
  abortRef: React.MutableRefObject<AbortController | null>;
  sendingRef: React.MutableRefObject<boolean>;
  streamBufferRef: React.MutableRefObject<string>;
  streamFlushRaf: React.MutableRefObject<number | null>;
  bufferToken: (fullText: string) => void;
  flushStreamBuffer: () => void;
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  pendingEditSendRef: React.MutableRefObject<boolean>;
  // Gateway
  wsConnected: boolean;
  wsReconnecting: boolean;
  recentWSSendRef: React.MutableRefObject<boolean>;
  // Virtualizer
  virtualizer: { scrollToIndex: (idx: number, opts?: any) => void };
  userNearBottomRef: React.MutableRefObject<boolean>;
  setShowJumpToLatest: (v: boolean) => void;
  setSuggestions: (v: string[]) => void;
  setSelectedMsgIndex: (v: number | null) => void;
}

export interface UseMessageHandlersReturn {
  handleSend: () => Promise<void>;
  handleSendRef: React.MutableRefObject<() => void>;
  sendViaCLI: (text: string, sessionId: string) => Promise<void>;
  verifyIdentity: (code: string) => Promise<boolean>;
  generateSuggestions: (assistantResponse: string) => Promise<void>;
  sendFeedbackToRapidRMS: (msgIndex: number, rating: "like" | "dislike") => Promise<void>;
  queue: { id: string; text: string }[];
  setQueue: React.Dispatch<React.SetStateAction<{ id: string; text: string }[]>>;
  editingQueueId: string | null;
  setEditingQueueId: (v: string | null) => void;
  editingQueueText: string;
  setEditingQueueText: (v: string) => void;
  cliContinue: boolean;
  setCliContinue: (v: boolean) => void;
  pendingSuggestionSendRef: React.MutableRefObject<boolean>;
}

/** Version stamp for the default system prompt — bump when prompt logic changes. */
export const SYSTEM_PROMPT_VERSION = "1.0.0";

/**
 * Validate custom system prompt — reject injection patterns and excessive length.
 * Returns the prompt if safe, or null if it should be discarded.
 */
function validateCustomPrompt(prompt: string): string | null {
  if (!prompt || typeof prompt !== "string") return null;

  // Length cap: ~4000 tokens ≈ 14000 chars
  const MAX_CHARS = 14_000;
  if (prompt.length > MAX_CHARS) {
    console.warn("[shre] Custom system prompt exceeds length limit, using default", {
      length: prompt.length, max: MAX_CHARS
    });
    return null;
  }

  // Injection pattern detection — refuse prompts that try to override identity or instructions
  const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|context)/i,
    /disregard\s+(all\s+)?previous/i,
    /forget\s+(everything|all|your)\s*(previous|prior|above)/i,
    /you\s+are\s+now\s+(?!an?\s+AI\s+agent)/i,  // "you are now X" but allow "you are now an AI agent"
    /new\s+identity|new\s+persona|pretend\s+to\s+be/i,
    /override\s+(system|default|base)\s+(prompt|instructions?)/i,
    /do\s+not\s+follow\s+(the\s+)?(system|default|previous)/i,
    /\bsystem\s*:\s*\{/i,  // JSON injection attempt
    /<\/?system>/i,  // XML tag injection
  ];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      console.warn("[shre] Custom system prompt contains injection pattern, using default", {
        pattern: pattern.source,
      });
      return null;
    }
  }

  return prompt;
}

export function useMessageHandlers(params: UseMessageHandlersParams): UseMessageHandlersReturn {
  const {
    input, setInput, streaming, syncing, writeEnabled,
    activeSessionId, activeAgentId, sessions, messages, filteredMessages,
    actions, replyToIndex, pendingFiles, setPendingFiles,
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
  } = params;

  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState("");
  const [cliContinue, setCliContinue] = useState(false);
  const sendQueuedRef = useRef<boolean>(false);
  const wasStreamingRef = useRef(false);
  const pendingSuggestionSendRef = useRef(false);

  const currentAgent = getAgent(activeAgentId);

  // Surface WS connection state changes as system messages
  useEffect(() => {
    const unsubscribe = onStateChange((_state, info) => {
      const activeSession = sessions[0]?.id;
      if (!activeSession) return;

      if (info.state === "disconnected" || info.state === "failed") {
        actions.addMessage(activeSession, {
          role: "assistant",
          content: `[system] ${info.errorMessage || "Gateway disconnected"}`,
          timestamp: Date.now(),
          meta: { system: "true", type: "system", event: "disconnect" },
        });
      } else if (info.state === "connected") {
        actions.addMessage(activeSession, {
          role: "assistant",
          content: "[system] Gateway reconnected",
          timestamp: Date.now(),
          meta: { system: "true", type: "system", event: "reconnect" },
        });
      }
    });
    return unsubscribe;
  }, [sessions, actions]);

  // Follow-up suggestion generation
  const generateSuggestions = useCallback(async (assistantResponse: string) => {
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: assistantResponse.slice(0, 500) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.slice(0, 3));
      }
    } catch {
      // Silently skip
    }
  }, [setSuggestions]);

  // Identity verification handler
  const verifyIdentity = useCallback(async (code: string): Promise<boolean> => {
    setVerifying(true);
    try {
      const res = await fetch("/api/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.verified) {
        sessionStorage.setItem("shre-identity-verified", "true");
        setIdentityVerified(true);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setVerifying(false);
    }
  }, [setVerifying, setIdentityVerified]);

  // Feedback to shre-rapidrms
  const sendFeedbackToRapidRMS = useCallback(async (
    msgIndex: number,
    rating: "like" | "dislike",
  ) => {
    const assistantMsg = messages[msgIndex];
    if (!assistantMsg || assistantMsg.role !== "assistant") return;

    let userInput = "";
    for (let k = msgIndex - 1; k >= 0; k--) {
      if (messages[k].role === "user") { userInput = messages[k].content; break; }
    }

    const workspaceId = activeSessionId ?? "unknown";
    const feedbackRating = rating === "like" ? "positive" : "negative";

    try {
      const resp = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: assistantMsg.id ?? `${workspaceId}-${msgIndex}`,
          workspaceId,
          rating: feedbackRating,
          agentId: activeAgentId ?? "shre",
          userInput: userInput.slice(0, 500),
          assistantText: assistantMsg.content.slice(0, 500),
        }),
      });
      if (resp.ok) {
        actions.setStatusLine("Feedback saved \u2713");
        setTimeout(() => actions.setStatusLine(null), 2500);
      }
    } catch {
      // Network error — silent fail
    }

    // Routing feedback is forwarded server-side by /api/feedback endpoint
  }, [messages, activeSessionId, activeAgentId, actions]);

  // CLI mode sender
  const sendViaCLI = useCallback(async (text: string, sessionId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    let fullResponse = "";
    actions.setStatusLine("Starting Claude CLI...");
    actions.addActivity(sessionId, "connecting", "Launching Claude CLI");

    try {
      const res = await fetch("/api/cli/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, continueConversation: cliContinue, agentId: activeAgentId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "CLI unavailable");
        throw new Error(err);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const evt = JSON.parse(raw);
            if (evt.type === "delta" && evt.text) {
              fullResponse += evt.text;
              bufferToken(fullResponse);
              actions.setStatusLine("Claude CLI is writing...");
            } else if (evt.type === "done") {
              const finalText = evt.text || fullResponse;
              if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
              streamBufferRef.current = "";
              const cliDoneMeta: Record<string, string> = { route: "cli" };
              if (evt.model) cliDoneMeta.model = evt.model;
              if (sendTimeRef.current > 0) cliDoneMeta.total_ms = String(Date.now() - sendTimeRef.current);
              if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0) cliDoneMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
              actions.addMessage(sessionId, { role: "assistant", content: finalText, timestamp: Date.now(), meta: cliDoneMeta });
              actions.setStreamText("");
              actions.setStreaming(false);
              actions.setStatusLine(null);
              actions.addActivity(sessionId, "done", `CLI complete${evt.model ? ` (${evt.model})` : ""}${evt.cost ? ` \u2014 $${evt.cost.toFixed(4)}` : ""}`);
              setCliContinue(true);
              return;
            } else if (evt.type === "error") {
              throw new Error(evt.error);
            } else if (evt.type === "status") {
              actions.addActivity(sessionId, "thinking", `${evt.event}${evt.subtype ? `: ${evt.subtype}` : ""}`);
              actions.setStatusLine(`Claude: ${evt.event || "processing"}...`);
            } else if (evt.type === "end") {
              if (fullResponse && !evt.code) {
                if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
                streamBufferRef.current = "";
                const cliEndMeta: Record<string, string> = { route: "cli" };
                if (sendTimeRef.current > 0) cliEndMeta.total_ms = String(Date.now() - sendTimeRef.current);
                actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now(), meta: cliEndMeta });
                actions.setStreamText("");
                actions.setStreaming(false);
                actions.setStatusLine(null);
                setCliContinue(true);
                return;
              }
            }
          } catch (e) {
            if (e instanceof Error && e.message !== raw) throw e;
          }
        }
      }

      if (fullResponse) {
        if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
        streamBufferRef.current = "";
        const cliStreamMeta: Record<string, string> = { route: "cli" };
        if (sendTimeRef.current > 0) cliStreamMeta.total_ms = String(Date.now() - sendTimeRef.current);
        actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now(), meta: cliStreamMeta });
        actions.setStreamText("");
        actions.setStreaming(false);
        actions.setStatusLine(null);
        setCliContinue(true);
      }
    } catch (err) {
      if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
      streamBufferRef.current = "";
      const errMsg = err instanceof Error ? err.message : "CLI error";
      if (fullResponse) {
        actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now() });
        actions.setStreamText("");
        actions.setStreaming(false);
        actions.setStatusLine(null);
        actions.addActivity(sessionId, "error", `CLI error: ${errMsg}`);
      } else {
        actions.setStreamText("");
        actions.addActivity(sessionId, "error", `CLI error: ${errMsg}`);
        throw err;
      }
    }
  }, [cliContinue, actions, bufferToken, flushStreamBuffer, activeAgentId]);

  const handleSend = useCallback(async () => {
    setSelectedMsgIndex(null);
    const text = input.trim();
    if (!text || syncing || !writeEnabled) return;

    // Identity verification gate
    if (!identityVerified) {
      if (pendingMessage !== null) {
        setInput("");
        const sessionId = activeSessionId || ensureSession();
        actions.addMessage(sessionId, { role: "user", content: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", timestamp: Date.now() });

        const verified = await verifyIdentity(text);
        if (verified) {
          actions.addMessage(sessionId, { role: "assistant", content: "Identity confirmed. Shre online.", timestamp: Date.now() });
          const savedMessage = pendingMessage;
          setPendingMessage(null);
          setInput(savedMessage);
          pendingEditSendRef.current = true;
          return;
        } else {
          actions.addMessage(sessionId, { role: "assistant", content: "Incorrect code. Try again.", timestamp: Date.now() });
          setInput("");
          return;
        }
      }

      const sessionId = activeSessionId || ensureSession();
      setPendingMessage(text);
      setInput("");
      actions.addMessage(sessionId, { role: "assistant", content: "Identity verification required. Please provide the secret code to proceed.", timestamp: Date.now() });
      return;
    }

    if (activeSessionId) actions.setDraft(activeSessionId, "");

    if (text.startsWith("/")) {
      const cmdText = text.slice(1);
      executeSlashCommand(cmdText);
      return;
    }

    // Extract @@mention to override target agent
    let mentionCleanText = text;
    let effectiveAgentId = activeAgentId;
    if (extractMention) {
      const { cleanText, agentId } = extractMention(text);
      if (agentId) {
        effectiveAgentId = agentId;
        mentionCleanText = cleanText || text;
      }
    }
    if (clearMention) clearMention();
    // Use cleaned text going forward (@@mention stripped)
    const sendText = mentionCleanText;

    if (streaming) {
      setQueue((prev) => [...prev, { id: uid(), text: sendText }]);
      setInput("");
      return;
    }

    // Compare mode
    if (compareMode && compareModels.length >= 2) {
      sendingRef.current = true;
      const sessionId2 = ensureSession();
      const session2 = sessions.find((s) => s.id === sessionId2);
      queueMicrotask(() => { sendingRef.current = false; });
      if (session2 && session2.messages.length === 0) {
        actions.updateSessionTitle(sessionId2, generateTitle(text));
      }
      actions.addMessage(sessionId2, { role: "user", content: text, timestamp: Date.now() });
      setInput("");
      setCompareWinner(null);

      const initStreams: Record<string, { text: string; done: boolean; error?: string }> = {};
      for (const modelId of compareModels) {
        initStreams[modelId] = { text: "", done: false };
      }
      setCompareStreams(initStreams);
      actions.setStreaming(true);
      actions.setStatusLine("Comparing models...");

      const currentMessages = session2?.messages ?? [];
      const sysPrompt = `You are ${currentAgent.name}, an AI agent (${currentAgent.id}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.`;

      const promises = compareModels.map(async (modelId) => {
        let fullResp = "";
        try {
          await sendMessage(text, currentMessages, sysPrompt, {
            onToken: (token) => {
              fullResp += token;
              setCompareStreams((prev: any) => ({ ...prev, [modelId]: { ...prev[modelId], text: fullResp, done: false } }));
            },
            onDone: (full) => {
              setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: full || fullResp, done: true } }));
            },
            onError: (error) => {
              setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: fullResp || `Error: ${error}`, done: true, error } }));
            },
            onStatus: () => {},
          }, undefined, undefined, modelId, undefined, openclawMode);
        } catch (err) {
          setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true, error: String(err) } }));
        }
      });

      Promise.all(promises).then(() => {
        actions.setStreaming(false);
        actions.setStatusLine(null);
        playNotifSound();
      });
      return;
    }

    sendingRef.current = true;
    const sessionId = ensureSession();
    const session = sessions.find((s) => s.id === sessionId);
    queueMicrotask(() => { sendingRef.current = false; });

    const attachedFiles = [...pendingFiles];
    setPendingFiles([]);
    for (const f of attachedFiles) {
      actions.addFile({ ...f, sessionId, sessionTitle: session?.title || "Chat", agentId: effectiveAgentId });
    }

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now(), ...(replyToIndex !== null ? { replyTo: replyToIndex } : {}) };
    actions.addMessage(sessionId, userMsg);
    actions.setReplyTo(null);
    setInput("");
    voiceFinalTranscriptRef.current = "";
    setSuggestions([]);
    userNearBottomRef.current = true;
    setShowJumpToLatest(false);
    setTimeout(() => {
      virtualizer.scrollToIndex(filteredMessages.length + 2, { align: "end" });
    }, 50);
    actions.setStreaming(true);
    actions.setStreamText("");
    actions.setStatusLine("Connecting...");
    setStreamPhase("connecting");
    setActiveToolName(null);
    streamStartRef.current = Date.now();
    sendTimeRef.current = Date.now();
    firstTokenTimeRef.current = 0;
    actions.addActivity(sessionId, "connecting", "Sending message");
    actions.addFeed(sessionId, "sent", text.length > 80 ? text.slice(0, 80) + "\u2026" : text);

    // Task creation detection
    const taskIntent = detectTaskIntent(text);
    if (taskIntent) {
      createTaskFromChat(taskIntent.title, `Created from chat: "${text.slice(0, 200)}"`).then((result) => {
        if (result.ok) {
          const taskLink = mib007Link("tasks");
          actions.addMessage(sessionId, {
            role: "assistant",
            content: `Task created: **${taskIntent.title}**${result.taskId ? ` (ID: ${result.taskId.slice(0, 8)})` : ""}\n\n[View in Tasks](${taskLink})`,
            timestamp: Date.now(),
            meta: { type: "system", taskId: result.taskId || "" },
          });
          actions.addFeed(sessionId, "system", `Task created: ${taskIntent.title.slice(0, 60)}`, { taskId: result.taskId || "" });
        }
      });
    }

    // Issue creation detection (mutually exclusive with task — task takes priority)
    const issueIntent = taskIntent ? null : detectIssueIntent(text);
    if (issueIntent) {
      createIssueFromChat(issueIntent.title, `Created from Shre Chat: "${text.slice(0, 200)}"`, issueIntent.priority).then((result) => {
        if (result.ok) {
          const issueLink = mib007Link("issues");
          actions.addMessage(sessionId, {
            role: "assistant",
            content: `Issue created: **${result.identifier || issueIntent.title}** — ${issueIntent.title}\n\n[View in Issues](${issueLink})`,
            timestamp: Date.now(),
            meta: { type: "system", issueId: result.issueId || "" },
          });
          actions.addFeed(sessionId, "system", `Issue created: ${result.identifier || issueIntent.title.slice(0, 60)}`, { issueId: result.issueId || "" });
        }
      });
    }

    // Quick command queries
    const lowerText = text.toLowerCase();
    const isTaskQuery = /\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|my\s+(?:tasks?|to-?do\s*list|todos?))\b/i.test(lowerText);
    if (isTaskQuery) {
      fetch("/api/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
        signal: AbortSignal.timeout(8000),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.action === "task_list" && data.tasks) {
          const tasks = data.tasks.slice(0, 10);
          const lines = tasks.map((t: any) =>
            `- **${t.title}**${t.priority === "high" || t.priority === "critical" ? " _(urgent)_" : ""}${t.status ? ` [${t.status}]` : ""}`
          );
          const content = tasks.length === 0
            ? `You're all clear \u2014 no pending tasks! [Open Tasks](${mib007Link("tasks")})`
            : `**Your pending tasks (${tasks.length}):**\n${lines.join("\n")}\n\n[View all in MIB007](${mib007Link("tasks")})`;
          actions.addMessage(sessionId, {
            role: "assistant", content, timestamp: Date.now(),
            meta: { type: "system" },
          });
        }
      }).catch(() => { /* still goes to AI */ });
    }

    // Start process run
    const runId = `run-${Date.now()}`;
    processRunIdRef.current = runId;
    startRun(runId, sessionId);
    const thinkStepId = addStep(runId, { kind: "thinking", label: "Thinking..." });
    processStepRef.current = thinkStepId;

    let messageText = sendText;

    // Prepend quoted reply context so the model knows which message the user is responding to
    // Try filteredMessages first; fall back to full session messages when the reply target
    // has been scrolled out of the virtualized/filtered list (dangling reference).
    const replyMsg = replyToIndex !== null
      ? (filteredMessages[replyToIndex] ?? (session?.messages ?? [])[replyToIndex] ?? null)
      : null;
    if (replyMsg) {
      const replySnippet = replyMsg.content.length > 500
        ? replyMsg.content.slice(0, 500) + "..."
        : replyMsg.content;
      const replyRole = replyMsg.role === "user" ? "my earlier message" : "your earlier response";
      messageText = `[Replying to ${replyRole}]: "${replySnippet}"\n\n${sendText}`;
    }

    // ── Context anchoring for short/vague follow-ups ──
    // When the user sends a terse message without a reply reference, inject
    // context from recent messages so the model knows what "this" refers to.
    if (replyToIndex === null && filteredMessages.length > 0) {
      const lower = text.toLowerCase().trim();

      // Status keywords: user asking about progress on something discussed
      // Voice-friendly: allow leading filler (hey/ok/so/shre/please), trailing punctuation, and natural phrasing
      const stripped = lower.replace(/^(hey|ok|okay|so|shre|shrey|please|can you|could you|uh|um)\s+/g, "").replace(/[.!?,]+$/g, "").trim();

      const isStatusQuery = /^(status|any\s*(status|update|progress)|update\s*(me|us)?|update[s]?|give\s+me\s+(an?\s+)?(status|update|progress)|is\s+(this|that|it)\s+(done|complete|finished|ready|resolved|fixed)|done\s*\??|complete\s*\??|finished\s*\??|what('?s| is)\s+the\s+(status|progress|update)|where\s+(are|did)\s+we\s+(leave|left)\s+(off|this|that)|how('?s| is)\s+(this|that|it)\s+(going|coming|progressing)|catch\s+me\s+up|bring\s+me\s+up\s+to\s+(speed|date)|what('?s| is)\s+(new|happening|going\s+on)|fill\s+me\s+in)$/i.test(stripped);

      // Continue keywords: user wants the assistant to resume where it stopped
      const isContinue = /^(continue|keep\s+going|go\s+on|go\s+ahead|finish\s+(this|that|it)|carry\s+on|resume|pick\s+up\s+where|and\s*\??|then\s*\??|next\s*\??|keep\s+going\s+with\s+(this|that)|finish\s+what\s+you\s+(were|started)|where\s+were\s+we)$/i.test(stripped);

      // Repeat/recall keywords: user wants to see something again
      const isRecall = /^(show\s+(me\s+)?(that|it)\s+again|repeat\s+that|recall\s+(this|that)\s*(conversation|chat|session)?|the\s+(table|chart|list|query|data|result)\s+(you\s+)?(showed?|gave|returned|generated)|what\s+did\s+(you|we)\s+(say|show|find|get|discuss|talk\s+about)|what\s+was\s+(that|the\s+(result|answer|output))|what\s+were\s+we\s+(talking|discussing)\s+about|remind\s+me\s+(what|where)\s+we\s+(left\s+off|were|discussed)|go\s+back\s+to\s+(that|what\s+we)|summarize\s+(this|our)\s*(conversation|chat|discussion)?)$/i.test(stripped);

      if (isStatusQuery || isContinue || isRecall) {
        // Find the last 2 assistant messages and the user messages that prompted them
        const recentPairs: string[] = [];
        let found = 0;
        for (let i = filteredMessages.length - 1; i >= 0 && found < 2; i--) {
          const m = filteredMessages[i];
          if (m.role === "assistant") {
            const snippet = m.content.replace(/\n/g, " ").slice(0, 400);
            recentPairs.unshift(`[assistant]: ${snippet}${m.content.length > 400 ? "..." : ""}`);
            // Also grab the preceding user message
            if (i > 0 && filteredMessages[i - 1].role === "user") {
              const uSnip = filteredMessages[i - 1].content.replace(/\n/g, " ").slice(0, 200);
              recentPairs.unshift(`[user]: ${uSnip}${filteredMessages[i - 1].content.length > 200 ? "..." : ""}`);
            }
            found++;
          }
        }

        if (recentPairs.length > 0) {
          const contextBlock = recentPairs.join("\n");
          if (isStatusQuery) {
            messageText = `[Context — the user is asking for a status update on what was recently discussed. Review the conversation and determine if the task/topic was completed or left unfinished. Give a clear status.]\n\nRecent discussion:\n${contextBlock}\n\nUser's question: ${text}`;
          } else if (isContinue) {
            messageText = `[Context — the user wants you to continue or finish what you were doing. Pick up exactly where you left off.]\n\nYour last response:\n${contextBlock}\n\nUser: ${text}`;
          } else if (isRecall) {
            messageText = `[Context — the user is asking you to recall or repeat something from earlier in this conversation. Find the relevant content in the conversation history and present it again.]\n\nRecent discussion:\n${contextBlock}\n\nUser: ${text}`;
          }
        }
      }
    }

    const attachments = attachedFiles.filter(f => f.dataUrl).map(f => ({
      name: f.name,
      type: f.type,
      dataUrl: f.dataUrl,
    }));
    if (attachedFiles.length > 0) {
      const fileNames = attachedFiles.map((f) => f.name).join(", ");
      messageText = `[Attached files: ${fileNames}]\n\n${messageText}`;
      actions.addFeed(sessionId, "sent", `Attached: ${fileNames}`, { files: String(attachedFiles.length) });
    }

    // CLI mode
    if (cliMode) {
      try {
        await sendViaCLI(messageText, sessionId);
        return;
      } catch {
        actions.addActivity(sessionId, "error", "CLI unavailable, falling back to gateway");
        actions.addFeed(sessionId, "fallback", "Claude CLI failed, using gateway");
        actions.setStatusLine("CLI failed, trying gateway...");
        actions.setStreaming(true);
        actions.setStreamText("");
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ROUTING: Shre Chat → OpenClaw Gateway (WebSocket)
    //   Full agent loop: tools, file edits, exec, web search,
    //   sub-agent spawning. Store context injected as systemPrompt.
    //   Fallback: shre-router HTTP if WS unavailable.
    // ═══════════════════════════════════════════════════════════
    const useOpenClawWS = isWSConnected();
    if (useOpenClawWS) {
      actions.addFeed(sessionId, "gateway", "OpenClaw Gateway (full agent)", { transport: "ws" });
      actions.addMessage(sessionId, {
        role: "assistant",
        content: "[system] Routing via OpenClaw Gateway (WebSocket)",
        timestamp: Date.now(),
        meta: { system: "true", type: "system", event: "route-change" },
      });

      let fullResponse = "";
      streamBufferRef.current = "";
      const wsResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const safetyTimeout = setTimeout(() => {
          console.warn("[shre] WS stream safety timeout \u2014 forcing fallback");
          resolve({ ok: false, error: "Stream timeout" });
        }, 120_000);
        const resolveAndClear = (result: { ok: boolean; error?: string }) => {
          clearTimeout(safetyTimeout);
          resolve(result);
        };
        sendChatWS(effectiveAgentId, "main", messageText, {
          onToken: (token) => {
            if (!token) return;
            if (firstTokenTimeRef.current === 0) firstTokenTimeRef.current = Date.now();
            fullResponse += token;
            bufferToken(fullResponse);
            actions.setStatusLine(`${currentAgent.name} is writing...`);
            setCompacting(false);
            if (processStepRef.current !== "generating") {
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const gId = addStep(runId, { kind: "generating", label: "Writing response..." });
              processStepRef.current = gId;
            }
          },
          onDone: (full) => {
            if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
            streamBufferRef.current = "";
            const wsDoneTime = Date.now();
            const wsMeta: Record<string, string> = {
              route: "ws",
              model: selectedModel ? (selectedModel.split("/").pop() || selectedModel) : currentAgent.name,
            };
            if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0) {
              wsMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
            }
            if (sendTimeRef.current > 0) {
              wsMeta.total_ms = String(wsDoneTime - sendTimeRef.current);
            }
            if (full.trim()) {
              actions.addMessage(sessionId, { role: "assistant", content: full, timestamp: Date.now(), meta: wsMeta });
            }
            actions.setStreamText("");
            actions.setStreaming(false);
            actions.setStatusLine(null);
            setCompacting(false);
            actions.addActivity(sessionId, "done", "Response complete");
            const wsPerfMeta: Record<string, string> = { transport: "ws", ...wsMeta };
            actions.addFeed(sessionId, "received", `Response (${full.length} chars)`, wsPerfMeta);
            playNotifSound();
            const wsSession = sessions.find((s) => s.id === sessionId);
            if (wsSession && wsSession.title === "New chat") {
              generateAITitle(text).then((aiTitle) => {
                if (aiTitle) {
                  actions.updateSessionTitle(sessionId, aiTitle);
                } else {
                  actions.updateSessionTitle(sessionId, generateTitle(text));
                }
              });
            }
            recentWSSendRef.current = true;
            setTimeout(() => { recentWSSendRef.current = false; }, 30_000);
            generateSuggestions(full);
            addStep(runId, { kind: "done", label: "Done" });
            completeRun(runId);
            fetch("/api/conversation-log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ agentId: effectiveAgentId, userMessage: messageText, assistantResponse: full, model: selectedModel || "ws" }),
            }).catch(() => {});
            resolveAndClear({ ok: true });
          },
          onError: (error) => {
            if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
            streamBufferRef.current = "";
            actions.setStreamText("");
            setCompacting(false);
            actions.addActivity(sessionId, "error", `WS error: ${error}`);
            actions.addFeed(sessionId, "error", `WS: ${error}`);
            actions.addMessage(sessionId, {
              role: "assistant",
              content: `[system] Connection error: ${error || "Unknown error"}`,
              timestamp: Date.now(),
              meta: { system: "true", type: "system", event: "error" },
            });
            addStep(runId, { kind: "error", label: error || "Error" });
            completeRun(runId);
            resolveAndClear({ ok: false, error });
          },
          onStatus: (status) => {
            if (status === "compacting" || status === "summarizing") {
              setCompacting(true);
              setStreamPhase("compacting");
              actions.setStatusLine(null);
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const cId = addStep(runId, { kind: "compacting", label: "Optimizing context..." });
              processStepRef.current = cId;
              return;
            }
            setCompacting(false);
            if (status === "thinking") setStreamPhase("thinking");
            else if (status === "planning") {
              setStreamPhase("planning");
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const pId = addStep(runId, { kind: "planning", label: "Planning strategy..." });
              processStepRef.current = pId;
            }
            else if (status === "writing") { setStreamPhase("writing"); setActiveToolName(null); }
            else if (status === "connecting") setStreamPhase("connecting");
            const summaries: Record<string, string> = {
              connecting: "Connecting...",
              thinking: `${currentAgent.name} is thinking...`,
              planning: `${currentAgent.name} is planning strategy...`,
              writing: `${currentAgent.name} is writing...`,
            };
            actions.setStatusLine(summaries[status] || "Processing...");
            if (status === "thinking") {
              updateStep(runId, thinkStepId, { detail: summaries[status] });
            }
          },
          onActivity: (text) => {
            actions.addActivity(sessionId, "thinking", text.length > 120 ? text.slice(0, 120) + "\u2026" : text);
            actions.setStatusLine(text.length > 60 ? text.slice(0, 60) + "\u2026" : text);
            const toolMatch = text.match(/^(?:Using tool|Running|Calling):\s*(.+)/i);
            if (toolMatch) {
              setStreamPhase("tool_use");
              setActiveToolName(toolMatch[1].trim());
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const sid = addStep(runId, { kind: "tool_use", label: text.slice(0, 60), toolName: toolMatch[1].trim() });
              processStepRef.current = sid;
            } else {
              updateStep(runId, processStepRef.current || thinkStepId, { detail: text });
            }
          },
        }, selectedModel || undefined, session?.systemPrompt || undefined).catch((err) => {
          console.warn("[shre] WebSocket send failed:", err);
          resolveAndClear({ ok: false, error: String(err) });
        });
      });

      if (wsResult.ok) return;

      actions.addFeed(sessionId, "fallback", `WS failed (${wsResult.error}), trying shre-router...`);
      actions.addMessage(sessionId, {
        role: "assistant",
        content: `[system] WebSocket failed — falling back to shre-router HTTP`,
        timestamp: Date.now(),
        meta: { system: "true", type: "system", event: "route-fallback" },
      });
      actions.setStatusLine("Falling back to shre-router...");
    }

    // shre-router smart gateway
    const routeLabel = selectedModel ? `shre-router \u2192 ${selectedModel.split("/")[1] || selectedModel}` : "shre-router (auto)";
    actions.addFeed(sessionId, "gateway", routeLabel, { transport: "http" });
    if (!useOpenClawWS) {
      actions.addMessage(sessionId, {
        role: "assistant",
        content: `[system] Routing via shre-router${selectedModel ? ` → ${selectedModel.split("/").pop() || selectedModel}` : " (auto)"}`,
        timestamp: Date.now(),
        meta: { system: "true", type: "system", event: "route-change" },
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let fullResponse = "";
    let streamStarted = false;
    // When replying to a previous message, only send history up to that point
    // so the AI continues from the correct context instead of seeing the full
    // conversation and getting confused about what the user is referencing.
    const allMessages = session?.messages ?? [];
    const currentMessages = replyToIndex !== null
      ? allMessages.slice(0, replyToIndex + 1)
      : allMessages;
    const defaultSystemPrompt = `[prompt-version: ${SYSTEM_PROMPT_VERSION}] You are ${currentAgent.name}, an AI agent (${currentAgent.id}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.

UI Capabilities: This chat app has a Preview tab that renders HTML. When the user asks you to create or show HTML content (pages, charts, dashboards, visualizations), output it in a \`\`\`html code block. The user can click "Preview" in the sidebar and "Load from Chat" to render it live \u2014 do NOT tell them to save as a file. You can generate full HTML pages with inline CSS and JavaScript.

Task Management: You can help manage tasks and todos. When the user asks to create, check, update, or manage tasks:
- To create a task: tell the user what you're creating, and include "create task: [title]" in your response so the system auto-creates it
- To check task status: the user's tasks are tracked in the system \u2014 reference them by what was discussed
- To link to tasks: use [View Tasks](${mib007Link("tasks")}) or [View Issues](${mib007Link("issues")})
- Available MIB007 views: [Tasks](${mib007Link("tasks")}), [Issues](${mib007Link("issues")}), [Skills](${mib007Link("skills")}), [Agents](${mib007Link("agents")})

Conversation Memory: You have access to the full conversation in this session. When the user references earlier discussions ("what did we talk about", "the task I mentioned", "status update"), look through the conversation history to find the relevant context. Never say you don't remember \u2014 the history is right here. Summarize what was discussed and provide updates.`;

    // Fetch tasks from last 7 days to inject as context — AI can reference them
    let taskContext = "";
    let sessionContext = "";
    const contextSignal = AbortSignal.timeout(3000);
    const [taskResult, sessionResult] = await Promise.allSettled([
      // Tasks from last 7 days
      fetch(`/api/tasks?since=${Date.now() - 7 * 24 * 60 * 60 * 1000}&limit=50`, { signal: contextSignal }),
      // Recent session summaries for cross-session context
      fetch("/api/chat-sessions/recent-context", { signal: contextSignal }),
    ]);

    // Build task context
    try {
      if (taskResult.status === "fulfilled" && taskResult.value.ok) {
        const taskData = await taskResult.value.json();
        const tasks = Array.isArray(taskData) ? taskData : taskData?.tasks || taskData?.data || [];
        if (tasks.length > 0) {
          const byStatus: Record<string, any[]> = {};
          for (const t of tasks) { (byStatus[t.status || "unknown"] ??= []).push(t); }
          const sections: string[] = [];
          for (const [status, items] of Object.entries(byStatus)) {
            const list = items.slice(0, 20).map((t: any) =>
              `  - ${t.title}${t.id ? ` (ID: ${t.id})` : ""}${t.priority ? ` [${t.priority}]` : ""}${t.assignee ? ` → ${t.assignee}` : ""}`
            ).join("\n");
            sections.push(`[${status}] (${items.length}):\n${list}`);
          }
          taskContext = `\n\nTasks from last 7 days (${tasks.length} total):\n${sections.join("\n")}\nLink: [View Tasks](${mib007Link("tasks")}) | [View Issues](${mib007Link("issues")})`;
        }
      }
    } catch { /* non-fatal */ }

    // Build cross-session context (recent sessions + voice summaries)
    try {
      if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
        const ctxData = await sessionResult.value.json();
        const parts: string[] = [];
        if (ctxData.recentSessions?.length) {
          parts.push("Recent conversations:\n" + ctxData.recentSessions.map((s: any) =>
            `  - [${new Date(s.updated_at).toLocaleDateString()}] "${s.title}" (${s.agent_id || "shre"}, ${s.messageCount || "?"} messages)`
          ).join("\n"));
        }
        if (ctxData.voiceSummaries?.length) {
          parts.push("Recent voice sessions:\n" + ctxData.voiceSummaries.map((v: any) =>
            `  - [${new Date(v.created_at).toLocaleDateString()}] ${v.summary || "No summary"} (${v.agent_id || "shre"})`
          ).join("\n"));
        }
        if (ctxData.recentActions?.length) {
          parts.push("Recent actions taken:\n" + ctxData.recentActions.map((a: any) =>
            `  - [${new Date(a.created_at).toLocaleDateString()}] ${a.action_type}: ${a.target || a.result || ""}`
          ).join("\n"));
        }
        if (parts.length) {
          sessionContext = `\n\nPrevious Context (for continuity — reference these when user mentions past discussions):\n${parts.join("\n")}`;
        }
      }
    } catch { /* non-fatal */ }

    // Build contextHealth — signal which client-side sources succeeded/failed
    const contextHealth: Record<string, "ok" | "missing" | "error"> = {
      tasks: "missing",
      crossSession: "missing",
    };
    try {
      if (taskResult.status === "fulfilled" && taskResult.value.ok) {
        contextHealth.tasks = "ok";
      } else if (taskResult.status === "rejected") {
        contextHealth.tasks = "error";
      } else if (taskResult.status === "fulfilled" && !taskResult.value.ok) {
        contextHealth.tasks = "error";
      }
    } catch { contextHealth.tasks = "error"; }

    try {
      if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
        contextHealth.crossSession = "ok";
      } else if (sessionResult.status === "rejected") {
        contextHealth.crossSession = "error";
      } else if (sessionResult.status === "fulfilled" && !sessionResult.value.ok) {
        contextHealth.crossSession = "error";
      }
    } catch { contextHealth.crossSession = "error"; }

    // Auto-create support task on context fetch failure (non-blocking)
    if (contextHealth.tasks === "error" || contextHealth.crossSession === "error") {
      const failedSources = Object.entries(contextHealth)
        .filter(([, v]) => v === "error")
        .map(([k]) => k);
      fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Context fetch failed: ${failedSources.join(", ")}`,
          description: `Client-side context sources failed during chat assembly.\nFailed: ${failedSources.join(", ")}\nSession: ${sessionId}\nTimestamp: ${new Date().toISOString()}`,
          priority: "low",
          tags: ["context.fetch.failed", "auto-created"],
        }),
      }).catch(() => {}); // Fire and forget
    }

    const validatedCustomPrompt = session?.systemPrompt
      ? validateCustomPrompt(session.systemPrompt)
      : null;

    const systemPrompt = validatedCustomPrompt
      ? `${validatedCustomPrompt}\n\n${defaultSystemPrompt}${taskContext}${sessionContext}`
      : `${defaultSystemPrompt}${taskContext}${sessionContext}`;

    await sendMessage(messageText, currentMessages, systemPrompt, {
      onToken: (token) => {
        if (firstTokenTimeRef.current === 0) firstTokenTimeRef.current = Date.now();
        fullResponse += token;
        actions.setStreamText(fullResponse);
        actions.setStatusLine(`${currentAgent.name} is writing...`);
        if (!streamStarted) {
          streamStarted = true;
          setStreamPhase("writing");
          actions.addFeed(sessionId, "streaming", "Receiving response stream");
          if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
          const gId = addStep(runId, { kind: "generating", label: "Writing response..." });
          processStepRef.current = gId;
        }
      },
      onDone: (full) => {
        const httpDoneTime = Date.now();
        const httpMeta: Record<string, string> = {
          route: "http",
          model: selectedModel ? (selectedModel.split("/").pop() || selectedModel) : "auto",
        };
        if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0) {
          httpMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
        }
        if (sendTimeRef.current > 0) {
          httpMeta.total_ms = String(httpDoneTime - sendTimeRef.current);
        }
        if (full.trim()) {
          actions.addMessage(sessionId, { role: "assistant", content: full, meta: httpMeta });
        }
        actions.setStreamText("");
        actions.setStreaming(false);
        actions.setStatusLine(null);
        actions.addActivity(sessionId, "done", "Response complete");
        const httpPerfMeta: Record<string, string> = { transport: "http", ...httpMeta };
        actions.addFeed(sessionId, "received", `Response (${full.length} chars)`, httpPerfMeta);
        playNotifSound();
        const httpSession = sessions.find((s) => s.id === sessionId);
        if (httpSession && httpSession.title === "New chat") {
          generateAITitle(text).then((aiTitle) => {
            if (aiTitle) {
              actions.updateSessionTitle(sessionId, aiTitle);
            } else {
              actions.updateSessionTitle(sessionId, generateTitle(text));
            }
          });
        }
        generateSuggestions(full);
        addStep(runId, { kind: "done", label: "Done" });
        completeRun(runId);
        fetch("/api/conversation-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
          credentials: "include",
          body: JSON.stringify({ agentId: effectiveAgentId, userMessage: messageText, assistantResponse: full, model: selectedModel || "auto" }),
        }).catch(() => {});
      },
      onError: (error) => {
        if (fullResponse) {
          actions.addMessage(sessionId, { role: "assistant", content: fullResponse });
        } else {
          let friendlyError = error;
          if (error.includes("502") || error.includes("unreachable")) friendlyError = "OpenClaw gateway is down. Check that it's running.";
          else if (error.includes("rate") || error.includes("429")) friendlyError = "Rate limited \u2014 too many requests. Wait a moment and try again.";
          else if (error.includes("401") || error.includes("403") || error.includes("auth")) {
            friendlyError = "Authentication failed. Check your API keys.";
            actions.addMessage(sessionId, {
              role: "assistant",
              content: "[system] Session expired — please sign in again",
              timestamp: Date.now(),
              meta: { system: "true", type: "system", event: "session-expired" },
            });
          }
          else if (error.includes("model") && error.includes("not found")) friendlyError = `Model not available. Try switching to a different model.`;
          else if (error.includes("timeout")) friendlyError = "Request timed out. The model may be overloaded.";
          else if (error.includes("fetch") || error.includes("network")) friendlyError = "Network error. Check your connection.";
          actions.addMessage(sessionId, { role: "assistant", content: `Error: ${friendlyError}` });
        }
        actions.setStreamText("");
        actions.setStreaming(false);
        actions.setStatusLine(null);
        actions.addActivity(sessionId, "error", `Error: ${error}`);
        actions.addFeed(sessionId, "error", error);
        addStep(runId, { kind: "error", label: error || "Error" });
        completeRun(runId);
      },
      onStatus: (status, detail) => {
        const summaries: Record<string, string> = {
          connecting: "Connecting...",
          thinking: `${currentAgent.name} is thinking...`,
          planning: `${currentAgent.name} is planning strategy...`,
          writing: `${currentAgent.name} is writing...`,
          researching: detail ? `Researching: ${detail}` : "Researching...",
          executing: detail ? `Executing: ${detail}` : "Executing...",
          tool_call: detail ? `Using tool: ${detail}` : "Processing...",
          done: "Done",
          attention: detail || "Attention needed",
          error: detail || "Error occurred",
        };
        actions.setStatusLine(summaries[status] || "Processing...");
        if (status === "thinking") setStreamPhase("thinking");
        else if (status === "planning") setStreamPhase("planning");
        else if (status === "writing") { setStreamPhase("writing"); setActiveToolName(null); }
        else if (status === "connecting") setStreamPhase("connecting");
        else if (status === "error") setStreamPhase("error");
        else if (status === "researching" || status === "executing" || status === "tool_call") {
          setStreamPhase("tool_use");
          setActiveToolName(detail || status);
        }

        if (status === "planning") {
          if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
          const pId = addStep(runId, { kind: "planning", label: "Planning strategy..." });
          processStepRef.current = pId;
        } else if (status === "researching" || status === "executing" || status === "tool_call") {
          if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
          const tId = addStep(runId, { kind: "tool_use", label: detail || status, toolName: detail || undefined });
          processStepRef.current = tId;
        }

        if (status === "thinking" || status === "planning" || status === "researching" || status === "executing" || status === "tool_call") {
          actions.addActivity(sessionId, status, summaries[status] || "Processing");
          if (status === "thinking") {
            actions.addFeed(sessionId, "routed", "Model selected, processing");
          } else if (status === "researching" || status === "executing" || status === "tool_call") {
            actions.addFeed(sessionId, "gateway", summaries[status] || "Processing", detail ? { tool: detail } : undefined);
          }
        }
      },
      onApprovalRequired: (approval) => {
        setPendingApproval(approval);
        actions.setStatusLine(`Approval needed: ${approval.reason}`);
        setStreamPhase("attention");
        addStep(runId, { kind: "approval", label: `Awaiting approval: ${approval.tool}` });
      },
      onToolResult: (result: ToolResult) => {
        // Show tool execution results in the process bar and activity feed
        const toolLabel = result.tool.replace(/^(mib_|aros_)/, "").replace(/_/g, " ");
        const statusIcon = result.status === "success" ? "\u2713" : "\u2717";
        const durationStr = result.duration_ms ? ` (${result.duration_ms}ms)` : "";
        if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
        const stepId = addStep(runId, {
          kind: "tool_result",
          label: `${statusIcon} ${toolLabel}${durationStr}`,
          toolName: result.tool,
          detail: result.status === "error" ? String(result.output || "Error") : undefined,
        });
        processStepRef.current = stepId;
        actions.addFeed(sessionId, "tool_result", `${toolLabel}: ${result.status}${durationStr}`, {
          tool: result.tool,
          status: result.status,
        });
        actions.addActivity(sessionId, "executing", `${statusIcon} ${toolLabel}${durationStr}`);
      },
    }, controller.signal, sessionId, selectedModel || undefined, attachments.length > 0 ? attachments : undefined, openclawMode,
    // Phase 4: thread context propagation for branch/reply continuity
    (session?.parentId || replyToIndex !== null) ? {
      ...(session?.parentId ? { parentSessionId: session.parentId, branchPoint: session.messages.length } : {}),
      ...(replyToIndex !== null ? { replyToMessageIndex: replyToIndex } : {}),
    } as ThreadContext : undefined,
    contextHealth);
  }, [input, streaming, syncing, ensureSession, sessions, activeSessionId, actions, pendingFiles, wsConnected, wsReconnecting, activeAgentId, currentAgent.name, cliMode, openclawMode, sendViaCLI, selectedModel, compareMode, compareModels, startRun, addStep, updateStep, completeRun, executeSlashCommand, generateSuggestions, identityVerified, pendingMessage, verifyIdentity]);

  // Keep handleSend accessible via ref for voice auto-send
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  // Trigger handleSend after editing a message
  useEffect(() => {
    if (pendingEditSendRef.current && input.trim()) {
      pendingEditSendRef.current = false;
      handleSend();
    }
    if (pendingSuggestionSendRef.current && input.trim()) {
      pendingSuggestionSendRef.current = false;
      handleSend();
    }
  }, [input, handleSend]);

  // When streaming finishes, auto-send next queued message
  useEffect(() => {
    if (wasStreamingRef.current && !streaming && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setTimeout(() => {
        setInput(next.text);
        setTimeout(() => {
          sendQueuedRef.current = true;
        }, 50);
      }, 500);
    }
    wasStreamingRef.current = streaming;
  }, [streaming, queue]);

  // Watch for queued send trigger
  useEffect(() => {
    if (sendQueuedRef.current && !streaming && input.trim()) {
      sendQueuedRef.current = false;
      const btn = document.querySelector("[data-send-btn]") as HTMLButtonElement;
      btn?.click();
    }
  });

  return {
    handleSend,
    handleSendRef,
    sendViaCLI,
    verifyIdentity,
    generateSuggestions,
    sendFeedbackToRapidRMS,
    queue,
    setQueue,
    editingQueueId,
    setEditingQueueId,
    editingQueueText,
    setEditingQueueText,
    cliContinue,
    setCliContinue,
    pendingSuggestionSendRef,
  };
}
