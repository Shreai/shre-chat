import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessage, generateAITitle, type ChatMessage, type ToolResult, type ThreadContext } from "../openclaw";
import { sendChatWS, isWSConnected, queueMessage, onStateChange } from "../gateway-ws";
import { uid, generateTitle, getAgent, type UploadedFile, type Session, type AppActions } from "../store";
import { playNotifSound, mib007Link } from "../chat-utils";
import { detectTaskIntent, createTaskFromChat, detectIssueIntent, createIssueFromChat } from "../taskDetector";

// ── Extracted modules ──
import { validateCustomPrompt, buildDefaultSystemPrompt, SYSTEM_PROMPT_VERSION } from "./message-handlers/handler-utils";
import { anchorContextIfNeeded, fetchContextSources } from "./message-handlers/context-builder";

// Re-export for backward compatibility
export { SYSTEM_PROMPT_VERSION };

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
  actions: Pick<AppActions, "setDraft" | "setStreaming" | "setStreamText" | "setStatusLine" | "addMessage" | "addActivity" | "addFeed" | "addFile" | "replaceSessionMessages" | "updateSessionTitle" | "newSession" | "switchSession" | "setReplyTo">;
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
  setStreamPhase: React.Dispatch<React.SetStateAction<"connecting" | "thinking" | "planning" | "tool_use" | "writing" | "compacting" | "done" | "attention" | "error">>;
  setActiveToolName: (v: string | null) => void;
  setCompacting: (v: boolean) => void;
  setPendingApproval: (v: any) => void;
  streamStartRef: React.MutableRefObject<number>;
  sendTimeRef: React.MutableRefObject<number>;
  firstTokenTimeRef: React.MutableRefObject<number>;
  startRun: (id: string, sessionId: string) => void;
  addStep: (runId: string, step: any) => string;
  updateStep: (runId: string, stepId: string, update: any) => void;
  completeRun: (runId: string) => void;
  processStepRef: React.MutableRefObject<string>;
  processRunIdRef: React.MutableRefObject<string>;
  abortRef: React.MutableRefObject<AbortController | null>;
  sendingRef: React.MutableRefObject<boolean>;
  streamBufferRef: React.MutableRefObject<string>;
  streamFlushRaf: React.MutableRefObject<number | null>;
  bufferToken: (fullText: string) => void;
  flushStreamBuffer: () => void;
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  pendingEditSendRef: React.MutableRefObject<boolean>;
  wsConnected: boolean;
  wsReconnecting: boolean;
  recentWSSendRef: React.MutableRefObject<boolean>;
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
  const autoRetryCountRef = useRef<number>(0);
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
    } catch (err) { console.debug("fetch suggestions", err); }
  }, [setSuggestions]);

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
    } catch (err) {
      console.warn("identity verify request", err);
      return false;
    } finally {
      setVerifying(false);
    }
  }, [setVerifying, setIdentityVerified]);

  const sendFeedbackToRapidRMS = useCallback(async (msgIndex: number, rating: "like" | "dislike") => {
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
    } catch (err) { console.debug("save feedback", err); }
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
      if (!res.ok) { const err = await res.text().catch(() => "CLI unavailable"); throw new Error(err); }
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
              actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
              actions.addActivity(sessionId, "done", `CLI complete${evt.model ? ` (${evt.model})` : ""}${evt.cost ? ` \u2014 $${evt.cost.toFixed(4)}` : ""}`);
              setCliContinue(true);
              return;
            } else if (evt.type === "error") { throw new Error(evt.error); }
            else if (evt.type === "status") {
              actions.addActivity(sessionId, "thinking", `${evt.event}${evt.subtype ? `: ${evt.subtype}` : ""}`);
              actions.setStatusLine(`Claude: ${evt.event || "processing"}...`);
            } else if (evt.type === "end") {
              if (fullResponse && !evt.code) {
                if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
                streamBufferRef.current = "";
                const cliEndMeta: Record<string, string> = { route: "cli" };
                if (sendTimeRef.current > 0) cliEndMeta.total_ms = String(Date.now() - sendTimeRef.current);
                actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now(), meta: cliEndMeta });
                actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
                setCliContinue(true);
                return;
              }
            }
          } catch (e) { if (e instanceof Error && e.message !== raw) throw e; }
        }
      }
      if (fullResponse) {
        if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
        streamBufferRef.current = "";
        const cliStreamMeta: Record<string, string> = { route: "cli" };
        if (sendTimeRef.current > 0) cliStreamMeta.total_ms = String(Date.now() - sendTimeRef.current);
        actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now(), meta: cliStreamMeta });
        actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
        setCliContinue(true);
      }
    } catch (err) {
      if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
      streamBufferRef.current = "";
      const errMsg = err instanceof Error ? err.message : "CLI error";
      if (fullResponse) {
        actions.addMessage(sessionId, { role: "assistant", content: fullResponse, timestamp: Date.now() });
        actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
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
    if (text.startsWith("/")) { executeSlashCommand(text.slice(1)); return; }

    // Extract @@mention
    let mentionCleanText = text;
    let effectiveAgentId = activeAgentId;
    if (extractMention) {
      const { cleanText, agentId } = extractMention(text);
      if (agentId) { effectiveAgentId = agentId; mentionCleanText = cleanText || text; }
    }
    if (clearMention) clearMention();
    const sendText = mentionCleanText;

    if (streaming) { setQueue((prev) => [...prev, { id: uid(), text: sendText }]); setInput(""); return; }

    // Compare mode
    if (compareMode && compareModels.length >= 2) {
      sendingRef.current = true;
      const sessionId2 = ensureSession();
      const session2 = sessions.find((s) => s.id === sessionId2);
      queueMicrotask(() => { sendingRef.current = false; });
      if (session2 && session2.messages.length === 0) actions.updateSessionTitle(sessionId2, generateTitle(text));
      actions.addMessage(sessionId2, { role: "user", content: text, timestamp: Date.now() });
      setInput(""); setCompareWinner(null);
      const initStreams: Record<string, { text: string; done: boolean; error?: string }> = {};
      for (const modelId of compareModels) initStreams[modelId] = { text: "", done: false };
      setCompareStreams(initStreams);
      actions.setStreaming(true); actions.setStatusLine("Comparing models...");
      const currentMessages = session2?.messages ?? [];
      const sysPrompt = `You are ${currentAgent.name}, an AI agent (${currentAgent.id}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.`;
      const promises = compareModels.map(async (modelId) => {
        let fullResp = "";
        try {
          await sendMessage(text, currentMessages, sysPrompt, {
            onToken: (token) => { fullResp += token; setCompareStreams((prev: any) => ({ ...prev, [modelId]: { ...prev[modelId], text: fullResp, done: false } })); },
            onDone: (full) => { setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: full || fullResp, done: true } })); },
            onError: (error) => { setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: fullResp || `Error: ${error}`, done: true, error } })); },
            onStatus: () => {},
          }, undefined, undefined, modelId, undefined, openclawMode);
        } catch (err) {
          setCompareStreams((prev: any) => ({ ...prev, [modelId]: { text: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true, error: String(err) } }));
        }
      });
      Promise.all(promises).then(() => { actions.setStreaming(false); actions.setStatusLine(null); playNotifSound(); });
      return;
    }

    sendingRef.current = true;
    const sessionId = ensureSession();
    const session = sessions.find((s) => s.id === sessionId);
    queueMicrotask(() => { sendingRef.current = false; });

    const attachedFiles = [...pendingFiles];
    setPendingFiles([]);
    for (const f of attachedFiles) actions.addFile({ ...f, sessionId, sessionTitle: session?.title || "Chat", agentId: effectiveAgentId });

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now(), ...(replyToIndex !== null ? { replyTo: replyToIndex } : {}) };
    actions.addMessage(sessionId, userMsg);
    actions.setReplyTo(null);
    setInput(""); voiceFinalTranscriptRef.current = ""; setSuggestions([]);
    userNearBottomRef.current = true; setShowJumpToLatest(false);
    setTimeout(() => { virtualizer.scrollToIndex(filteredMessages.length + 2, { align: "end" }); }, 50);
    actions.setStreaming(true); actions.setStreamText(""); actions.setStatusLine("Connecting...");
    setStreamPhase("connecting"); setActiveToolName(null);
    streamStartRef.current = Date.now(); sendTimeRef.current = Date.now(); firstTokenTimeRef.current = 0;
    actions.addActivity(sessionId, "connecting", "Sending message");
    actions.addFeed(sessionId, "sent", text.length > 80 ? text.slice(0, 80) + "\u2026" : text);

    // Quick task query
    const lowerText = text.toLowerCase();
    const isTaskQuery = /\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|my\s+(?:tasks?|to-?do\s*list|todos?))\b/i.test(lowerText);
    if (isTaskQuery) {
      fetch("/api/voice-command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }), signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : null).then(data => {
          if (data?.action === "task_list" && data.tasks) {
            const tasks = data.tasks.slice(0, 10);
            const lines = tasks.map((t: any) => `- **${t.title}**${t.priority === "high" || t.priority === "critical" ? " _(urgent)_" : ""}${t.status ? ` [${t.status}]` : ""}`);
            const content = tasks.length === 0 ? `You're all clear \u2014 no pending tasks! [Open Tasks](${mib007Link("tasks")})` : `**Your pending tasks (${tasks.length}):**\n${lines.join("\n")}\n\n[View all in MIB007](${mib007Link("tasks")})`;
            actions.addMessage(sessionId, { role: "assistant", content, timestamp: Date.now(), meta: { type: "system" } });
          }
        }).catch(() => { void 0; });
    }

    // Process bar
    const runId = `run-${Date.now()}`;
    processRunIdRef.current = runId;
    startRun(runId, sessionId);
    const thinkStepId = addStep(runId, { kind: "thinking", label: "Thinking..." });
    processStepRef.current = thinkStepId;

    // Build message text with reply context
    let messageText = sendText;
    const replyMsg = replyToIndex !== null ? (filteredMessages[replyToIndex] ?? (session?.messages ?? [])[replyToIndex] ?? null) : null;
    if (replyMsg) {
      const replySnippet = replyMsg.content.length > 500 ? replyMsg.content.slice(0, 500) + "..." : replyMsg.content;
      const replyRole = replyMsg.role === "user" ? "my earlier message" : "your earlier response";
      messageText = `[Replying to ${replyRole}]: "${replySnippet}"\n\n${sendText}`;
    }

    // Context anchoring (extracted)
    messageText = anchorContextIfNeeded(text, messageText, replyToIndex, filteredMessages);

    // Attachments
    const attachments = attachedFiles.filter(f => f.dataUrl).map(f => ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));
    if (attachedFiles.length > 0) {
      const fileNames = attachedFiles.map((f) => f.name).join(", ");
      messageText = `[Attached files: ${fileNames}]\n\n${messageText}`;
      actions.addFeed(sessionId, "sent", `Attached: ${fileNames}`, { files: String(attachedFiles.length) });
    }

    // CLI mode
    if (cliMode) {
      try { await sendViaCLI(messageText, sessionId); return; }
      catch (err) {
        console.debug("CLI send failed, falling back", err);
        actions.addActivity(sessionId, "error", "CLI unavailable, falling back to gateway");
        actions.addFeed(sessionId, "fallback", "Claude CLI failed, using gateway");
        actions.setStatusLine("CLI failed, trying gateway...");
        actions.setStreaming(true); actions.setStreamText("");
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ROUTING: OpenClaw Gateway (WebSocket) → shre-router (HTTP fallback)
    // ═══════════════════════════════════════════════════════════
    const useOpenClawWS = isWSConnected();
    if (useOpenClawWS) {
      actions.addFeed(sessionId, "gateway", "OpenClaw Gateway (full agent)", { transport: "ws" });
      actions.addMessage(sessionId, { role: "assistant", content: "[system] Routing via OpenClaw Gateway (WebSocket)", timestamp: Date.now(), meta: { system: "true", type: "system", event: "route-change" } });

      let fullResponse = "";
      streamBufferRef.current = "";
      const wsResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const safetyTimeout = setTimeout(() => { console.warn("[shre] WS stream safety timeout"); resolve({ ok: false, error: "Stream timeout" }); }, 120_000);
        const resolveAndClear = (result: { ok: boolean; error?: string }) => { clearTimeout(safetyTimeout); resolve(result); };
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
            const wsMeta: Record<string, string> = { route: "ws", model: selectedModel ? (selectedModel.split("/").pop() || selectedModel) : currentAgent.name };
            if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0) wsMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
            if (sendTimeRef.current > 0) wsMeta.total_ms = String(Date.now() - sendTimeRef.current);
            if (full.trim()) actions.addMessage(sessionId, { role: "assistant", content: full, timestamp: Date.now(), meta: wsMeta });
            actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null); setCompacting(false);
            actions.addActivity(sessionId, "done", "Response complete");
            actions.addFeed(sessionId, "received", `Response (${full.length} chars)`, { transport: "ws", ...wsMeta });
            playNotifSound();
            const wsSession = sessions.find((s) => s.id === sessionId);
            if (wsSession && wsSession.title === "New chat") generateAITitle(text).then((aiTitle) => { actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text)); });
            recentWSSendRef.current = true; setTimeout(() => { recentWSSendRef.current = false; }, 30_000);
            generateSuggestions(full);
            addStep(runId, { kind: "done", label: "Done" }); completeRun(runId);
            fetch("/api/conversation-log", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, credentials: "include", body: JSON.stringify({ agentId: effectiveAgentId, userMessage: messageText, assistantResponse: full, model: selectedModel || "ws", sessionId }) }).catch(() => { void 0; });
            resolveAndClear({ ok: true });
          },
          onError: (error) => {
            if (streamFlushRaf.current) { clearTimeout(streamFlushRaf.current); streamFlushRaf.current = null; }
            streamBufferRef.current = ""; actions.setStreamText(""); setCompacting(false);
            actions.addActivity(sessionId, "error", `WS error: ${error}`);
            actions.addFeed(sessionId, "error", `WS: ${error}`);
            actions.addMessage(sessionId, { role: "assistant", content: `[system] Connection error: ${error || "Unknown error"}`, timestamp: Date.now(), meta: { system: "true", type: "system", event: "error" } });
            addStep(runId, { kind: "error", label: error || "Error" }); completeRun(runId);
            resolveAndClear({ ok: false, error });
          },
          onStatus: (status) => {
            if (status === "compacting" || status === "summarizing") {
              setCompacting(true); setStreamPhase("compacting"); actions.setStatusLine(null);
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const cId = addStep(runId, { kind: "compacting", label: "Optimizing context..." }); processStepRef.current = cId;
              return;
            }
            setCompacting(false);
            if (status === "thinking") setStreamPhase("thinking");
            else if (status === "planning") { setStreamPhase("planning"); if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() }); const pId = addStep(runId, { kind: "planning", label: "Planning strategy..." }); processStepRef.current = pId; }
            else if (status === "writing") { setStreamPhase("writing"); setActiveToolName(null); }
            else if (status === "connecting") setStreamPhase("connecting");
            const summaries: Record<string, string> = { connecting: "Connecting...", thinking: `${currentAgent.name} is thinking...`, planning: `${currentAgent.name} is planning strategy...`, writing: `${currentAgent.name} is writing...` };
            actions.setStatusLine(summaries[status] || "Processing...");
            if (status === "thinking") updateStep(runId, thinkStepId, { detail: summaries[status] });
          },
          onActivity: (text) => {
            actions.addActivity(sessionId, "thinking", text.length > 120 ? text.slice(0, 120) + "\u2026" : text);
            actions.setStatusLine(text.length > 60 ? text.slice(0, 60) + "\u2026" : text);
            const toolMatch = text.match(/^(?:Using tool|Running|Calling):\s*(.+)/i);
            if (toolMatch) {
              setStreamPhase("tool_use"); setActiveToolName(toolMatch[1].trim());
              if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
              const sid = addStep(runId, { kind: "tool_use", label: text.slice(0, 60), toolName: toolMatch[1].trim() }); processStepRef.current = sid;
            } else { updateStep(runId, processStepRef.current || thinkStepId, { detail: text }); }
          },
        }, selectedModel || undefined, session?.systemPrompt || undefined).catch((err) => { console.warn("[shre] WebSocket send failed:", err); resolveAndClear({ ok: false, error: String(err) }); });
      });

      if (wsResult.ok) return;
      actions.addFeed(sessionId, "fallback", `WS failed (${wsResult.error}), trying shre-router...`);
      actions.addMessage(sessionId, { role: "assistant", content: `[system] WebSocket failed \u2014 falling back to shre-router HTTP`, timestamp: Date.now(), meta: { system: "true", type: "system", event: "route-fallback" } });
      actions.setStatusLine("Falling back to shre-router...");
    }

    // shre-router HTTP
    const routeLabel = selectedModel ? `shre-router \u2192 ${selectedModel.split("/")[1] || selectedModel}` : "shre-router (auto)";
    actions.addFeed(sessionId, "gateway", routeLabel, { transport: "http" });
    if (!useOpenClawWS) {
      actions.addMessage(sessionId, { role: "assistant", content: `[system] Routing via shre-router${selectedModel ? ` \u2192 ${selectedModel.split("/").pop() || selectedModel}` : " (auto)"}`, timestamp: Date.now(), meta: { system: "true", type: "system", event: "route-change" } });
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let fullResponse = "";
    let streamStarted = false;
    const allMessages = session?.messages ?? [];
    const currentMessages = replyToIndex !== null ? allMessages.slice(0, replyToIndex + 1) : allMessages;

    // Fetch context (extracted)
    const { taskContext, sessionContext, contextHealth } = await fetchContextSources(sessionId);
    const defaultSystemPrompt = buildDefaultSystemPrompt(currentAgent.name, currentAgent.id);
    const validatedCustomPrompt = session?.systemPrompt ? validateCustomPrompt(session.systemPrompt) : null;
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
          streamStarted = true; setStreamPhase("writing");
          actions.addFeed(sessionId, "streaming", "Receiving response stream");
          if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
          const gId = addStep(runId, { kind: "generating", label: "Writing response..." }); processStepRef.current = gId;
        }
      },
      onDone: (full) => {
        const httpMeta: Record<string, string> = { route: "http", model: selectedModel ? (selectedModel.split("/").pop() || selectedModel) : "auto" };
        if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0) httpMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
        if (sendTimeRef.current > 0) httpMeta.total_ms = String(Date.now() - sendTimeRef.current);
        if (full.trim()) actions.addMessage(sessionId, { role: "assistant", content: full, meta: httpMeta });
        actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
        actions.addActivity(sessionId, "done", "Response complete");
        actions.addFeed(sessionId, "received", `Response (${full.length} chars)`, { transport: "http", ...httpMeta });
        playNotifSound();
        const httpSession = sessions.find((s) => s.id === sessionId);
        if (httpSession && httpSession.title === "New chat") generateAITitle(text).then((aiTitle) => { actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text)); });
        generateSuggestions(full);
        autoRetryCountRef.current = 0;
        addStep(runId, { kind: "done", label: "Done" }); completeRun(runId);
        fetch("/api/conversation-log", { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Id": sessionId }, credentials: "include", body: JSON.stringify({ agentId: effectiveAgentId, userMessage: messageText, assistantResponse: full, model: selectedModel || "auto", sessionId }) }).catch(() => { void 0; });
      },
      onError: (error) => {
        if (fullResponse) { actions.addMessage(sessionId, { role: "assistant", content: fullResponse }); }
        else {
          let friendlyError = error;
          const isTransient = error.includes("502") || error.includes("503") || error.includes("504") || error.includes("unreachable") || error.includes("Gateway unavailable");
          if (isTransient && autoRetryCountRef.current < 2) {
            autoRetryCountRef.current++;
            actions.setStatusLine(`Gateway hiccup \u2014 retrying (${autoRetryCountRef.current}/2)...`);
            actions.setStreamText(""); actions.setStreaming(false);
            addStep(runId, { kind: "error", label: `Transient error \u2014 auto-retry ${autoRetryCountRef.current}` }); completeRun(runId);
            setTimeout(() => { setInput(messageText); pendingEditSendRef.current = true; }, 2000);
            return;
          }
          if (isTransient) friendlyError = "Gateway unavailable after retries. Please try again in a moment.";
          if (error.includes("rate") || error.includes("429")) friendlyError = "Rate limited \u2014 too many requests. Wait a moment and try again.";
          else if (error.includes("401") || error.includes("403") || error.includes("auth")) {
            friendlyError = "Authentication failed. Check your API keys.";
            actions.addMessage(sessionId, { role: "assistant", content: "[system] Session expired \u2014 please sign in again", timestamp: Date.now(), meta: { system: "true", type: "system", event: "session-expired" } });
          }
          else if (error.includes("model") && error.includes("not found")) friendlyError = `Model not available. Try switching to a different model.`;
          else if (error.includes("timeout")) friendlyError = "Request timed out. The model may be overloaded.";
          else if (error.includes("fetch") || error.includes("network")) friendlyError = "Network error. Check your connection.";
          actions.addMessage(sessionId, { role: "assistant", content: `Error: ${friendlyError}` });
        }
        actions.setStreamText(""); actions.setStreaming(false); actions.setStatusLine(null);
        actions.addActivity(sessionId, "error", `Error: ${error}`);
        actions.addFeed(sessionId, "error", error);
        addStep(runId, { kind: "error", label: error || "Error" }); completeRun(runId);
      },
      onStatus: (status, detail) => {
        const summaries: Record<string, string> = {
          connecting: "Connecting...", thinking: `${currentAgent.name} is thinking...`, planning: `${currentAgent.name} is planning strategy...`,
          writing: `${currentAgent.name} is writing...`, researching: detail ? `Researching: ${detail}` : "Researching...",
          executing: detail ? `Executing: ${detail}` : "Executing...", tool_call: detail ? `Using tool: ${detail}` : "Processing...",
          done: "Done", attention: detail || "Attention needed", error: detail || "Error occurred",
        };
        actions.setStatusLine(summaries[status] || "Processing...");
        if (status === "thinking") setStreamPhase("thinking");
        else if (status === "planning") setStreamPhase("planning");
        else if (status === "writing") { setStreamPhase("writing"); setActiveToolName(null); }
        else if (status === "connecting") setStreamPhase("connecting");
        else if (status === "error") setStreamPhase("error");
        else if (status === "researching" || status === "executing" || status === "tool_call") { setStreamPhase("tool_use"); setActiveToolName(detail || status); }
        if (status === "planning") { if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() }); const pId = addStep(runId, { kind: "planning", label: "Planning strategy..." }); processStepRef.current = pId; }
        else if (status === "researching" || status === "executing" || status === "tool_call") { if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() }); const tId = addStep(runId, { kind: "tool_use", label: detail || status, toolName: detail || undefined }); processStepRef.current = tId; }
        if (status === "thinking" || status === "planning" || status === "researching" || status === "executing" || status === "tool_call") {
          actions.addActivity(sessionId, status, summaries[status] || "Processing");
          if (status === "thinking") actions.addFeed(sessionId, "routed", "Model selected, processing");
          else if (status === "researching" || status === "executing" || status === "tool_call") actions.addFeed(sessionId, "gateway", summaries[status] || "Processing", detail ? { tool: detail } : undefined);
        }
      },
      onApprovalRequired: (approval) => { setPendingApproval(approval); actions.setStatusLine(`Approval needed: ${approval.reason}`); setStreamPhase("attention"); addStep(runId, { kind: "approval", label: `Awaiting approval: ${approval.tool}` }); },
      onToolResult: (result: ToolResult) => {
        const toolLabel = result.tool.replace(/^(mib_|aros_)/, "").replace(/_/g, " ");
        const statusIcon = result.status === "success" ? "\u2713" : "\u2717";
        const durationStr = result.duration_ms ? ` (${result.duration_ms}ms)` : "";
        if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
        const stepId = addStep(runId, { kind: "tool_result", label: `${statusIcon} ${toolLabel}${durationStr}`, toolName: result.tool, detail: result.status === "error" ? String(result.output || "Error") : undefined });
        processStepRef.current = stepId;
        actions.addFeed(sessionId, "tool_result", `${toolLabel}: ${result.status}${durationStr}`, { tool: result.tool, status: result.status });
        actions.addActivity(sessionId, "executing", `${statusIcon} ${toolLabel}${durationStr}`);
      },
      onModelFailed: (model: string, reason: string) => {
        const shortModel = model.includes("/") ? model.split("/").pop()! : model;
        const failLine = `~~${shortModel}: Failed~~ \u2014 ${reason}\n\n`;
        fullResponse = failLine; actions.setStreamText(failLine);
        actions.addActivity(sessionId, "error", `${shortModel} failed: ${reason}`);
        actions.addFeed(sessionId, "error", `${shortModel}: ${reason}`);
        if (processStepRef.current) updateStep(runId, processStepRef.current, { status: "completed", completedAt: Date.now() });
        addStep(runId, { kind: "error", label: `${shortModel}: Failed` });
      },
      onClearResponse: () => {
        const failLine = fullResponse.match(/^~~.+?~~.*?\n\n/)?.[0] || "";
        fullResponse = failLine; actions.setStreamText(failLine); streamStarted = false;
      },
      onModelSwitch: (from: string, to: string, _reason: string) => {
        const shortTo = to.includes("/") ? to.split("/").pop()! : to;
        actions.setStatusLine(`Retrying with ${shortTo}...`); setStreamPhase("thinking");
        const stepId = addStep(runId, { kind: "thinking", label: `Retrying \u2192 ${shortTo}` }); processStepRef.current = stepId;
      },
    }, controller.signal, sessionId, selectedModel || undefined, attachments.length > 0 ? attachments : undefined, openclawMode,
    (session?.parentId || replyToIndex !== null) ? {
      ...(session?.parentId ? { parentSessionId: session.parentId, branchPoint: session.messages.length } : {}),
      ...(replyToIndex !== null ? { replyToMessageIndex: replyToIndex } : {}),
    } as ThreadContext : undefined,
    contextHealth);
  }, [input, streaming, syncing, ensureSession, sessions, activeSessionId, actions, pendingFiles, wsConnected, wsReconnecting, activeAgentId, currentAgent.name, cliMode, openclawMode, sendViaCLI, selectedModel, compareMode, compareModels, startRun, addStep, updateStep, completeRun, executeSlashCommand, generateSuggestions, identityVerified, pendingMessage, verifyIdentity]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    if (pendingEditSendRef.current && input.trim()) { pendingEditSendRef.current = false; handleSend(); }
    if (pendingSuggestionSendRef.current && input.trim()) { pendingSuggestionSendRef.current = false; handleSend(); }
  }, [input, handleSend]);

  useEffect(() => {
    if (wasStreamingRef.current && !streaming && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setTimeout(() => { setInput(next.text); setTimeout(() => { sendQueuedRef.current = true; }, 50); }, 500);
    }
    wasStreamingRef.current = streaming;
  }, [streaming, queue]);

  useEffect(() => {
    if (sendQueuedRef.current && !streaming && input.trim()) {
      sendQueuedRef.current = false;
      const btn = document.querySelector("[data-send-btn]") as HTMLButtonElement;
      btn?.click();
    }
  });

  return {
    handleSend, handleSendRef, sendViaCLI, verifyIdentity, generateSuggestions,
    sendFeedbackToRapidRMS, queue, setQueue, editingQueueId, setEditingQueueId,
    editingQueueText, setEditingQueueText, cliContinue, setCliContinue, pendingSuggestionSendRef,
  };
}
