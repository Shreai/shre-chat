import { useState, useRef, useEffect, useCallback } from 'react';
import { usePreferences } from '../preferences-store';
import {
  sendMessage,
  generateAITitle,
  type ChatMessage,
  type ToolResult,
  type ToolStartEvent,
  type ToolErrorEvent,
  type ThreadContext,
} from '../router-client';
import { sendChatWS, isWSConnected, queueMessage } from '../gateway-ws';
import {
  uid,
  generateTitle,
  getAgent,
  type UploadedFile,
  type Session,
  type AppActions,
} from '../store';
import { playNotifSound, mib007Link } from '../chat-utils';
import {
  detectTaskIntent,
  createTaskFromChat,
  detectIssueIntent,
  createIssueFromChat,
} from '../taskDetector';
import { detectMemoryIntent, captureMemory, forgetMemory, listMemories } from '../memoryDetector';
import { streamViaCLI } from './cli-streaming';
import { fetchSuggestions, verifyIdentityCode, sendFeedbackToServer } from './message-utils';

// ── Extracted modules ──
import {
  validateCustomPrompt,
  buildDefaultSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from './message-handlers/handler-utils';
import { anchorContextIfNeeded, fetchContextSources } from './message-handlers/context-builder';

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
  actions: Pick<
    AppActions,
    | 'setDraft'
    | 'setStreaming'
    | 'setStreamText'
    | 'setStatusLine'
    | 'addMessage'
    | 'addActivity'
    | 'addFeed'
    | 'addFile'
    | 'replaceSessionMessages'
    | 'updateSessionTitle'
    | 'newSession'
    | 'switchSession'
    | 'setReplyTo'
  >;
  replyToIndex: number | null;
  pendingFiles: UploadedFile[];
  setPendingFiles: (v: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  selectedModel: string | null;
  compareMode: boolean;
  compareModels: string[];
  setCompareStreams: (
    v: Record<string, { text: string; done: boolean; error?: string }> | ((prev: any) => any),
  ) => void;
  setCompareWinner: (v: string | null) => void;
  cliMode: boolean;
  routerMode: boolean;
  directMode: boolean;
  claudeCliMode: boolean;
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
  setStreamPhase: React.Dispatch<
    React.SetStateAction<
      | 'connecting'
      | 'thinking'
      | 'planning'
      | 'tool_use'
      | 'writing'
      | 'compacting'
      | 'done'
      | 'attention'
      | 'error'
    >
  >;
  setActiveToolName: (v: string | null) => void;
  setCompacting: (v: boolean) => void;
  setPendingApproval: (v: any) => void;
  setFirstTokenReceived: (v: boolean) => void;
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
  voiceMode: boolean;
}

export interface UseMessageHandlersReturn {
  handleSend: () => Promise<void>;
  handleSendRef: React.MutableRefObject<() => void>;
  sendViaCLI: (text: string, sessionId: string) => Promise<void>;
  verifyIdentity: (code: string) => Promise<boolean>;
  generateSuggestions: (assistantResponse: string) => Promise<void>;
  sendFeedbackToRapidRMS: (msgIndex: number, rating: 'like' | 'dislike') => Promise<void>;
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
    input,
    setInput,
    streaming,
    syncing,
    writeEnabled,
    activeSessionId,
    activeAgentId,
    sessions,
    messages,
    filteredMessages,
    actions,
    replyToIndex,
    pendingFiles,
    setPendingFiles,
    selectedModel,
    compareMode,
    compareModels,
    setCompareStreams,
    setCompareWinner,
    cliMode,
    routerMode,
    directMode,
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
  } = params;

  const traceEnabled = usePreferences((s) => s.traceEnabled);
  const conversationMode = usePreferences((s) => s.conversationMode);
  const activeAppId = usePreferences((s) => s.activeAppId);
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState('');
  const [cliContinue, setCliContinue] = useState(false);
  const sendQueuedRef = useRef<boolean>(false);
  const autoRetryCountRef = useRef<number>(0);
  const wasStreamingRef = useRef(false);
  const pendingSuggestionSendRef = useRef(false);

  const currentAgent = getAgent(activeAgentId);

  // Gateway WS is disabled — all chat routes through HTTP/SSE via shre-router.
  // No WS state change messages needed (they only caused false "disconnected" noise).

  const generateSuggestions = useCallback(
    (assistantResponse: string) => fetchSuggestions(assistantResponse, setSuggestions),
    [setSuggestions],
  );

  const verifyIdentity = useCallback(
    (code: string) => verifyIdentityCode(code, setVerifying, setIdentityVerified),
    [setVerifying, setIdentityVerified],
  );

  const sendFeedbackToRapidRMS = useCallback(
    (msgIndex: number, rating: 'like' | 'dislike') =>
      sendFeedbackToServer(msgIndex, rating, {
        messages,
        activeSessionId,
        activeAgentId,
        setStatusLine: actions.setStatusLine,
      }),
    [messages, activeSessionId, activeAgentId, actions],
  );

  // CLI mode sender — delegates to streamViaCLI in cli-streaming.ts
  const sendViaCLI = useCallback(
    async (text: string, sessionId: string) => {
      return streamViaCLI(text, sessionId, {
        cliContinue,
        claudeCliMode,
        activeAgentId,
        abortRef,
        bufferToken,
        streamFlushRaf,
        streamBufferRef,
        sendTimeRef,
        firstTokenTimeRef,
        setCliContinue,
        actions,
      });
    },
    [
      cliContinue,
      claudeCliMode,
      activeAgentId,
      abortRef,
      bufferToken,
      streamFlushRaf,
      streamBufferRef,
      sendTimeRef,
      firstTokenTimeRef,
      actions,
    ],
  );

  const handleSend = useCallback(async () => {
    setSelectedMsgIndex(null);
    const text = input.trim();
    if (!text || syncing || !writeEnabled) return;

    // Identity verification gate
    if (!identityVerified) {
      if (pendingMessage !== null) {
        setInput('');
        const sessionId = activeSessionId || ensureSession();
        actions.addMessage(sessionId, {
          role: 'user',
          content: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
          timestamp: Date.now(),
        });
        const verified = await verifyIdentity(text);
        if (verified) {
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: 'Identity confirmed. Shre online.',
            timestamp: Date.now(),
          });
          const savedMessage = pendingMessage;
          setPendingMessage(null);
          setInput(savedMessage);
          pendingEditSendRef.current = true;
          return;
        } else {
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: 'Incorrect code. Try again.',
            timestamp: Date.now(),
          });
          setInput('');
          return;
        }
      }
      const sessionId = activeSessionId || ensureSession();
      setPendingMessage(text);
      setInput('');
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: 'Identity verification required. Please provide the secret code to proceed.',
        timestamp: Date.now(),
      });
      return;
    }

    if (activeSessionId) actions.setDraft(activeSessionId, '');
    if (text.startsWith('/')) {
      executeSlashCommand(text.slice(1));
      return;
    }

    // Extract @@mention
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
    const sendText = mentionCleanText;

    if (streaming) {
      setQueue((prev) => [...prev, { id: uid(), text: sendText }]);
      setInput('');
      return;
    }

    // Compare mode
    if (compareMode && compareModels.length >= 2) {
      sendingRef.current = true;
      const sessionId2 = ensureSession();
      const session2 = sessions.find((s) => s.id === sessionId2);
      queueMicrotask(() => {
        sendingRef.current = false;
      });
      if (session2 && session2.messages.length === 0)
        actions.updateSessionTitle(sessionId2, generateTitle(text));
      actions.addMessage(sessionId2, { role: 'user', content: text, timestamp: Date.now() });
      setInput('');
      setCompareWinner(null);
      const initStreams: Record<string, { text: string; done: boolean; error?: string }> = {};
      for (const modelId of compareModels) initStreams[modelId] = { text: '', done: false };
      setCompareStreams(initStreams);
      actions.setStreaming(true);
      actions.setStatusLine('Comparing models...');
      const currentMessages = session2?.messages ?? [];
      const sysPrompt = `You are ${currentAgent.name}, an AI agent (${currentAgent.id}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.`;
      const promises = compareModels.map(async (modelId) => {
        let fullResp = '';
        try {
          await sendMessage(
            text,
            currentMessages,
            sysPrompt,
            {
              onToken: (token) => {
                fullResp += token;
                setCompareStreams((prev: any) => ({
                  ...prev,
                  [modelId]: { ...prev[modelId], text: fullResp, done: false },
                }));
              },
              onDone: (full) => {
                setCompareStreams((prev: any) => ({
                  ...prev,
                  [modelId]: { text: full || fullResp, done: true },
                }));
              },
              onError: (error) => {
                setCompareStreams((prev: any) => ({
                  ...prev,
                  [modelId]: { text: fullResp || `Error: ${error}`, done: true, error },
                }));
              },
              onStatus: () => {},
            },
            undefined,
            undefined,
            modelId,
            undefined,
            routerMode,
          );
        } catch (err) {
          setCompareStreams((prev: any) => ({
            ...prev,
            [modelId]: {
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              done: true,
              error: String(err),
            },
          }));
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
    queueMicrotask(() => {
      sendingRef.current = false;
    });

    const attachedFiles = [...pendingFiles];
    setPendingFiles([]);
    for (const f of attachedFiles)
      actions.addFile({
        ...f,
        sessionId,
        sessionTitle: session?.title || 'Chat',
        agentId: effectiveAgentId,
      });

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
      ...(replyToIndex !== null ? { replyTo: replyToIndex } : {}),
      ...(attachedFiles.length > 0
        ? {
            attachments: attachedFiles
              .filter((f) => f.dataUrl)
              .map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl, size: f.size })),
          }
        : {}),
    };
    actions.addMessage(sessionId, userMsg);
    actions.setReplyTo(null);
    setInput('');
    voiceFinalTranscriptRef.current = '';
    setSuggestions([]);
    userNearBottomRef.current = true;
    setShowJumpToLatest(false);
    setTimeout(() => {
      virtualizer.scrollToIndex(filteredMessages.length + 2, { align: 'end' });
    }, 50);
    actions.setStreaming(true);
    actions.setStreamText('');
    actions.setStatusLine('Connecting...');
    setStreamPhase('connecting');
    setActiveToolName(null);
    streamStartRef.current = Date.now();
    sendTimeRef.current = Date.now();
    firstTokenTimeRef.current = 0;
    setFirstTokenReceived(false);
    actions.addActivity(sessionId, 'connecting', 'Sending message');
    actions.addFeed(sessionId, 'sent', text.length > 80 ? text.slice(0, 80) + '\u2026' : text);

    // Quick task query
    const lowerText = text.toLowerCase();
    const isTaskQuery =
      /\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|my\s+(?:tasks?|to-?do\s*list|todos?))\b/i.test(
        lowerText,
      );
    if (isTaskQuery) {
      fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        signal: AbortSignal.timeout(8000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.action === 'task_list' && data.tasks) {
            const tasks = data.tasks.slice(0, 10);
            const lines = tasks.map(
              (t: any) =>
                `- **${t.title}**${t.priority === 'high' || t.priority === 'critical' ? ' _(urgent)_' : ''}${t.status ? ` [${t.status}]` : ''}`,
            );
            const content =
              tasks.length === 0
                ? `You're all clear \u2014 no pending tasks! [Open Tasks](${mib007Link('tasks')})`
                : `**Your pending tasks (${tasks.length}):**\n${lines.join('\n')}\n\n[View all in MIB007](${mib007Link('tasks')})`;
            actions.addMessage(sessionId, {
              role: 'assistant',
              content,
              timestamp: Date.now(),
              meta: { type: 'system' },
            });
          }
        })
        .catch(() => {
          void 0;
        });
    }

    // Memory commands: "remember that...", "forget that...", "what do you remember?"
    const memoryIntent = detectMemoryIntent(text);
    if (memoryIntent) {
      const handleMemory = async () => {
        try {
          let result;
          switch (memoryIntent.action) {
            case 'capture':
              result = await captureMemory(memoryIntent.text!);
              break;
            case 'forget':
              result = await forgetMemory(memoryIntent.text!);
              break;
            case 'list':
              result = await listMemories();
              break;
          }

          if (result.ok) {
            let content = result.message || 'Done.';
            // For list action, format the facts nicely
            if (memoryIntent.action === 'list' && result.facts && result.facts.length > 0) {
              const lines = result.facts.map(
                (f: { fact: string; category: string; confidence: number }) =>
                  `- **${f.fact}** _(${f.category}, ${(f.confidence * 100).toFixed(0)}% confidence)_`,
              );
              content = `**What I remember (${result.facts.length} facts):**\n${lines.join('\n')}`;
            }
            actions.addMessage(sessionId, {
              role: 'assistant',
              content,
              timestamp: Date.now(),
              meta: { type: 'system' },
            });
          } else {
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: `Memory error: ${result.error}`,
              timestamp: Date.now(),
              meta: { type: 'system' },
            });
          }
        } catch {
          void 0;
        }
      };
      handleMemory();
      // Don't return — still send the message to the AI for conversational response
    }

    // Process bar
    const runId = `run-${Date.now()}`;
    processRunIdRef.current = runId;
    startRun(runId, sessionId);
    const thinkStepId = addStep(runId, { kind: 'thinking', label: 'Thinking...' });
    processStepRef.current = thinkStepId;

    // Build message text with reply context
    let messageText = sendText;
    const replyMsg =
      replyToIndex !== null
        ? (filteredMessages[replyToIndex] ?? (session?.messages ?? [])[replyToIndex] ?? null)
        : null;
    if (replyMsg) {
      const replySnippet =
        replyMsg.content.length > 500 ? replyMsg.content.slice(0, 500) + '...' : replyMsg.content;
      const replyRole = replyMsg.role === 'user' ? 'my earlier message' : 'your earlier response';
      messageText = `[Replying to ${replyRole}]: "${replySnippet}"\n\n${sendText}`;
    }

    // Context anchoring (extracted)
    messageText = anchorContextIfNeeded(text, messageText, replyToIndex, filteredMessages);

    // Attachments
    const attachments = attachedFiles
      .filter((f) => f.dataUrl)
      .map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));
    if (attachedFiles.length > 0) {
      const fileNames = attachedFiles.map((f) => f.name).join(', ');
      messageText = `[Attached files: ${fileNames}]\n\n${messageText}`;
      actions.addFeed(sessionId, 'sent', `Attached: ${fileNames}`, {
        files: String(attachedFiles.length),
      });
    }

    // CLI mode
    if (cliMode) {
      try {
        await sendViaCLI(messageText, sessionId);
        return;
      } catch (err) {
        console.debug('CLI send failed, falling back', err);
        actions.addActivity(sessionId, 'error', 'CLI unavailable, falling back to gateway');
        actions.addFeed(sessionId, 'fallback', 'Claude CLI failed, using gateway');
        actions.setStatusLine('CLI failed, trying gateway...');
        actions.setStreaming(true);
        actions.setStreamText('');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ROUTING: Router Gateway (WebSocket) → shre-router (HTTP fallback)
    // ═══════════════════════════════════════════════════════════
    const useRouterWS = isWSConnected();
    if (useRouterWS) {
      actions.addFeed(sessionId, 'gateway', 'Router Gateway (full agent)', { transport: 'ws' });
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: '[system] Routing via Router Gateway (WebSocket)',
        timestamp: Date.now(),
        meta: { system: 'true', type: 'system', event: 'route-change' },
      });

      let fullResponse = '';
      streamBufferRef.current = '';
      const wsResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const safetyTimeout = setTimeout(() => {
          console.warn('[shre] WS stream safety timeout');
          resolve({ ok: false, error: 'Stream timeout' });
        }, 120_000);
        const resolveAndClear = (result: { ok: boolean; error?: string }) => {
          clearTimeout(safetyTimeout);
          resolve(result);
        };
        sendChatWS(
          effectiveAgentId,
          'main',
          messageText,
          {
            onToken: (token) => {
              if (!token) return;
              if (firstTokenTimeRef.current === 0) {
                firstTokenTimeRef.current = Date.now();
                setFirstTokenReceived(true);
              }
              fullResponse += token;
              bufferToken(fullResponse);
              actions.setStatusLine(`${currentAgent.name} is writing...`);
              setCompacting(false);
              if (processStepRef.current !== 'generating') {
                if (processStepRef.current)
                  updateStep(runId, processStepRef.current, {
                    status: 'completed',
                    completedAt: Date.now(),
                  });
                const gId = addStep(runId, { kind: 'generating', label: 'Writing response...' });
                processStepRef.current = gId;
              }
            },
            onDone: (full) => {
              if (streamFlushRaf.current) {
                clearTimeout(streamFlushRaf.current);
                streamFlushRaf.current = null;
              }
              streamBufferRef.current = '';
              const wsMeta: Record<string, string> = {
                route: 'ws',
                model: selectedModel
                  ? selectedModel.split('/').pop() || selectedModel
                  : currentAgent.name,
              };
              if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
                wsMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
              if (sendTimeRef.current > 0)
                wsMeta.total_ms = String(Date.now() - sendTimeRef.current);
              const finalContent = full.trim() ? full : fullResponse.trim() ? fullResponse : '';
              if (finalContent) {
                actions.addMessage(sessionId, {
                  role: 'assistant',
                  content: finalContent,
                  timestamp: Date.now(),
                  meta: wsMeta,
                });
              } else {
                actions.addMessage(sessionId, {
                  role: 'assistant',
                  content: '[system] Received empty response from the AI. Please try again.',
                  timestamp: Date.now(),
                  meta: { system: 'true', type: 'system', event: 'empty-response' },
                });
              }
              actions.setStreamText('');
              actions.setStreaming(false);
              actions.setStatusLine(null);
              setCompacting(false);
              actions.addActivity(sessionId, 'done', 'Response complete');
              actions.addFeed(sessionId, 'received', `Response (${full.length} chars)`, {
                transport: 'ws',
                ...wsMeta,
              });
              playNotifSound();
              const wsSession = sessions.find((s) => s.id === sessionId);
              if (wsSession && wsSession.title === 'New chat')
                generateAITitle(text).then((aiTitle) => {
                  actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text));
                });
              recentWSSendRef.current = true;
              setTimeout(() => {
                recentWSSendRef.current = false;
              }, 30_000);
              generateSuggestions(full);
              addStep(runId, { kind: 'done', label: 'Done' });
              completeRun(runId);
              fetch('/api/conversation-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
                credentials: 'include',
                body: JSON.stringify({
                  agentId: effectiveAgentId,
                  userMessage: messageText,
                  assistantResponse: full,
                  model: selectedModel || 'ws',
                  sessionId,
                }),
              }).catch(() => {
                void 0;
              });
              resolveAndClear({ ok: true });
            },
            onError: (error) => {
              if (streamFlushRaf.current) {
                clearTimeout(streamFlushRaf.current);
                streamFlushRaf.current = null;
              }
              streamBufferRef.current = '';
              actions.setStreamText('');
              setCompacting(false);
              actions.addActivity(sessionId, 'error', `WS error: ${error}`);
              actions.addFeed(sessionId, 'error', `WS: ${error}`);
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: `[system] Connection error: ${error || 'Unknown error'}`,
                timestamp: Date.now(),
                meta: { system: 'true', type: 'system', event: 'error' },
              });
              addStep(runId, { kind: 'error', label: error || 'Error' });
              completeRun(runId);
              resolveAndClear({ ok: false, error });
            },
            onStatus: (status) => {
              if (status === 'compacting' || status === 'summarizing') {
                setCompacting(true);
                setStreamPhase('compacting');
                actions.setStatusLine(null);
                if (processStepRef.current)
                  updateStep(runId, processStepRef.current, {
                    status: 'completed',
                    completedAt: Date.now(),
                  });
                const cId = addStep(runId, { kind: 'compacting', label: 'Optimizing context...' });
                processStepRef.current = cId;
                return;
              }
              setCompacting(false);
              if (status === 'thinking') setStreamPhase('thinking');
              else if (status === 'planning') {
                setStreamPhase('planning');
                if (processStepRef.current)
                  updateStep(runId, processStepRef.current, {
                    status: 'completed',
                    completedAt: Date.now(),
                  });
                const pId = addStep(runId, { kind: 'planning', label: 'Planning strategy...' });
                processStepRef.current = pId;
              } else if (status === 'writing') {
                setStreamPhase('writing');
                setActiveToolName(null);
              } else if (status === 'connecting') setStreamPhase('connecting');
              const summaries: Record<string, string> = {
                connecting: 'Connecting...',
                thinking: `${currentAgent.name} is thinking...`,
                planning: `${currentAgent.name} is planning strategy...`,
                writing: `${currentAgent.name} is writing...`,
              };
              actions.setStatusLine(summaries[status] || 'Processing...');
              if (status === 'thinking')
                updateStep(runId, thinkStepId, { detail: summaries[status] });
            },
            onActivity: (text) => {
              actions.addActivity(
                sessionId,
                'thinking',
                text.length > 120 ? text.slice(0, 120) + '\u2026' : text,
              );
              actions.setStatusLine(text.length > 60 ? text.slice(0, 60) + '\u2026' : text);
              const toolMatch = text.match(/^(?:Using tool|Running|Calling):\s*(.+)/i);
              if (toolMatch) {
                setStreamPhase('tool_use');
                setActiveToolName(toolMatch[1].trim());
                if (processStepRef.current)
                  updateStep(runId, processStepRef.current, {
                    status: 'completed',
                    completedAt: Date.now(),
                  });
                const sid = addStep(runId, {
                  kind: 'tool_use',
                  label: text.slice(0, 60),
                  toolName: toolMatch[1].trim(),
                });
                processStepRef.current = sid;
              } else {
                updateStep(runId, processStepRef.current || thinkStepId, { detail: text });
              }
            },
          },
          selectedModel || undefined,
          session?.systemPrompt || undefined,
        ).catch((err) => {
          console.warn('[shre] WebSocket send failed:', err);
          resolveAndClear({ ok: false, error: String(err) });
        });
      });

      if (wsResult.ok) return;
      actions.addFeed(
        sessionId,
        'fallback',
        `WS failed (${wsResult.error}), trying shre-router...`,
      );
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: `[system] WebSocket failed \u2014 falling back to shre-router HTTP`,
        timestamp: Date.now(),
        meta: { system: 'true', type: 'system', event: 'route-fallback' },
      });
      actions.setStatusLine('Falling back to shre-router...');
    }

    // shre-router HTTP
    const routeLabel = selectedModel
      ? `shre-router \u2192 ${selectedModel.split('/')[1] || selectedModel}`
      : 'shre-router (auto)';
    actions.addFeed(sessionId, 'gateway', routeLabel, { transport: 'http' });
    if (!useRouterWS) {
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: `[system] Routing via shre-router${selectedModel ? ` \u2192 ${selectedModel.split('/').pop() || selectedModel}` : ' (auto)'}`,
        timestamp: Date.now(),
        meta: { system: 'true', type: 'system', event: 'route-change' },
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let fullResponse = '';
    let capturedTraceId = '';
    let capturedTraceRecord: Record<string, unknown> | null = null;
    let streamStarted = false;
    // Claude CLI state tracking
    let isClaudeCliResponse = false;
    let claudeToolEvents: Array<{ type: string; [key: string]: any }> = [];
    let claudeSessionId = '';
    let claudeCost: number | undefined;
    let claudeDuration: number | undefined;
    let claudeModel: string | undefined;
    const allMessages = session?.messages ?? [];
    const currentMessages =
      replyToIndex !== null ? allMessages.slice(0, replyToIndex + 1) : allMessages;

    // Fetch context (extracted)
    const { taskContext, sessionContext, contextHealth } = await fetchContextSources(sessionId);
    const defaultSystemPrompt = buildDefaultSystemPrompt(currentAgent.name, currentAgent.id);
    const validatedCustomPrompt = session?.systemPrompt
      ? validateCustomPrompt(session.systemPrompt)
      : null;
    const systemPrompt = validatedCustomPrompt
      ? `${validatedCustomPrompt}\n\n${defaultSystemPrompt}${taskContext}${sessionContext}`
      : `${defaultSystemPrompt}${taskContext}${sessionContext}`;

    await sendMessage(
      messageText,
      currentMessages,
      systemPrompt,
      {
        onToken: (token) => {
          if (firstTokenTimeRef.current === 0) {
            firstTokenTimeRef.current = Date.now();
            setFirstTokenReceived(true);
          }
          fullResponse += token;
          streamBufferRef.current = fullResponse;
          actions.setStreamText(fullResponse);
          actions.setStatusLine(`${currentAgent.name} is writing...`);
          if (!streamStarted) {
            streamStarted = true;
            setStreamPhase('writing');
            actions.addFeed(sessionId, 'streaming', 'Receiving response stream');
            if (processStepRef.current)
              updateStep(runId, processStepRef.current, {
                status: 'completed',
                completedAt: Date.now(),
              });
            const gId = addStep(runId, { kind: 'generating', label: 'Writing response...' });
            processStepRef.current = gId;
          }
        },
        onDone: (full) => {
          const httpMeta: Record<string, string> = {
            route: 'http',
            model: selectedModel ? selectedModel.split('/').pop() || selectedModel : 'auto',
            ...(conversationMode !== 'assistant' ? { mode: conversationMode } : {}),
          };
          if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
            httpMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
          if (sendTimeRef.current > 0) httpMeta.total_ms = String(Date.now() - sendTimeRef.current);
          // Attach trace data if trace mode is on
          if (capturedTraceId) httpMeta.traceId = capturedTraceId;
          if (capturedTraceRecord) httpMeta.traceRecord = JSON.stringify(capturedTraceRecord);
          // Attach Claude CLI metadata if this was a Claude CLI response
          if (isClaudeCliResponse) {
            httpMeta.type = 'claude_cli_response';
            httpMeta.claudeMode = 'true';
            if (claudeSessionId) httpMeta.claudeSessionId = claudeSessionId;
            if (claudeCost != null) httpMeta.claudeCost = String(claudeCost);
            if (claudeDuration != null) httpMeta.claudeDuration = String(claudeDuration);
            if (claudeModel) httpMeta.model = claudeModel;
            httpMeta.route = 'claude-cli';
            if (claudeToolEvents.length > 0)
              httpMeta.claudeToolEvents = JSON.stringify(claudeToolEvents);
          }
          const finalContent = full.trim() ? full : fullResponse.trim() ? fullResponse : '';
          if (finalContent) {
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: finalContent,
              meta: httpMeta,
            });
          } else {
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: '[system] Received empty response from the AI. Please try again.',
              timestamp: Date.now(),
              meta: { system: 'true', type: 'system', event: 'empty-response' },
            });
          }
          actions.setStreamText('');
          actions.setStreaming(false);
          actions.setStatusLine(null);
          actions.addActivity(sessionId, 'done', 'Response complete');
          actions.addFeed(sessionId, 'received', `Response (${full.length} chars)`, {
            transport: 'http',
            ...httpMeta,
          });
          playNotifSound();
          const httpSession = sessions.find((s) => s.id === sessionId);
          if (httpSession && httpSession.title === 'New chat')
            generateAITitle(text).then((aiTitle) => {
              actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text));
            });
          generateSuggestions(full);
          autoRetryCountRef.current = 0;
          addStep(runId, { kind: 'done', label: 'Done' });
          completeRun(runId);
          fetch('/api/conversation-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
            credentials: 'include',
            body: JSON.stringify({
              agentId: effectiveAgentId,
              userMessage: messageText,
              assistantResponse: full,
              model: selectedModel || 'auto',
              sessionId,
            }),
          }).catch(() => {
            void 0;
          });
        },
        onError: (error) => {
          if (fullResponse) {
            actions.addMessage(sessionId, { role: 'assistant', content: fullResponse });
          } else {
            let friendlyError = error;
            // Tool loop exhaustion: not a transient error — retrying the same prompt
            // will hit the same limit. Show accurate message; escalation already fired.
            // Check both the prefixed form AND raw iteration keywords (defensive — catches
            // errors that slipped through router-client.ts classification as "Gateway unavailable — ...iterations...")
            const isToolLoop =
              error.startsWith('tool_loop_exhausted:') ||
              error.includes('maximum iteration') ||
              (error.includes('iterations') &&
                (error.includes('tool') || error.includes('execution') || error.includes('loop')));
            if (isToolLoop) {
              friendlyError =
                'The AI hit its tool execution limit on this request. Ellie has been notified and will review it. You can try rephrasing or breaking the request into smaller steps.';
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: `\u26a0\ufe0f ${friendlyError}`,
              });
              actions.setStreamText('');
              actions.setStreaming(false);
              actions.setStatusLine(null);
              actions.addActivity(sessionId, 'error', `Error: ${friendlyError}`);
              actions.addFeed(sessionId, 'error', friendlyError);
              addStep(runId, { kind: 'error', label: 'Tool loop exhausted — Ellie notified' });
              completeRun(runId);
              return;
            }
            const isTransient =
              !isToolLoop &&
              (error.includes('502') ||
                error.includes('503') ||
                error.includes('504') ||
                error.includes('unreachable') ||
                error.includes('Gateway unavailable'));
            if (isTransient && autoRetryCountRef.current < 2) {
              autoRetryCountRef.current++;
              actions.setStatusLine(
                `Gateway hiccup \u2014 retrying (${autoRetryCountRef.current}/2)...`,
              );
              actions.setStreamText('');
              addStep(runId, {
                kind: 'error',
                label: `Transient error \u2014 auto-retry ${autoRetryCountRef.current}`,
              });
              // Retry by re-calling sendMessage directly — do NOT re-trigger
              // handleSend which would add a duplicate user message bubble.
              setTimeout(async () => {
                try {
                  actions.setStreaming(true);
                  actions.setStreamText('');
                  actions.setStatusLine('Retrying...');
                  const retryController = new AbortController();
                  abortRef.current = retryController;
                  let retryResponse = '';
                  await sendMessage(
                    messageText,
                    currentMessages,
                    systemPrompt,
                    {
                      onToken: (token) => {
                        retryResponse += token;
                        streamBufferRef.current = retryResponse;
                        actions.setStreamText(retryResponse);
                        actions.setStatusLine(`${currentAgent.name} is writing...`);
                      },
                      onDone: (full) => {
                        const retryMeta: Record<string, string> = {
                          route: 'http',
                          model: selectedModel
                            ? selectedModel.split('/').pop() || selectedModel
                            : 'auto',
                          retry: String(autoRetryCountRef.current),
                        };
                        const finalContent = full.trim()
                          ? full
                          : retryResponse.trim()
                            ? retryResponse
                            : '';
                        if (finalContent) {
                          actions.addMessage(sessionId, {
                            role: 'assistant',
                            content: finalContent,
                            meta: retryMeta,
                          });
                        } else {
                          actions.addMessage(sessionId, {
                            role: 'assistant',
                            content:
                              '[system] Received empty response from the AI. Please try again.',
                            timestamp: Date.now(),
                            meta: { system: 'true', type: 'system', event: 'empty-response' },
                          });
                        }
                        actions.setStreamText('');
                        actions.setStreaming(false);
                        actions.setStatusLine(null);
                        autoRetryCountRef.current = 0;
                        addStep(runId, { kind: 'done', label: 'Done (retry)' });
                        completeRun(runId);
                        playNotifSound();
                      },
                      onError: (retryErr) => {
                        actions.addMessage(sessionId, {
                          role: 'assistant',
                          content: `Error: Gateway unavailable after retries. Please try again in a moment.`,
                        });
                        actions.setStreamText('');
                        actions.setStreaming(false);
                        actions.setStatusLine(null);
                        autoRetryCountRef.current = 0;
                        addStep(runId, { kind: 'error', label: 'Retry failed' });
                        completeRun(runId);
                      },
                    },
                    retryController.signal,
                    sessionId,
                    selectedModel || undefined,
                    undefined, // attachments already sent
                    routerMode,
                    undefined, // threadContext — same thread
                    contextHealth,
                    claudeCliMode,
                    directMode,
                    voiceMode,
                    traceEnabled,
                    conversationMode,
                    activeAppId,
                  );
                } catch {
                  actions.setStreaming(false);
                  actions.setStatusLine(null);
                }
              }, 2000);
              return;
            }
            if (isTransient)
              friendlyError = 'Gateway unavailable after retries. Please try again in a moment.';
            if (error.includes('rate') || error.includes('429'))
              friendlyError = 'Rate limited \u2014 too many requests. Wait a moment and try again.';
            else if (error.includes('401') || error.includes('403') || error.includes('auth')) {
              friendlyError = 'Authentication failed. Check your API keys.';
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: '[system] Session expired \u2014 please sign in again',
                timestamp: Date.now(),
                meta: { system: 'true', type: 'system', event: 'session-expired' },
              });
            } else if (error.includes('model') && error.includes('not found'))
              friendlyError = `Model not available. Try switching to a different model.`;
            else if (error.includes('timeout'))
              friendlyError = 'Request timed out. The model may be overloaded.';
            else if (error.includes('fetch') || error.includes('network'))
              friendlyError = 'Network error. Check your connection.';
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: `Error: ${friendlyError}`,
            });
          }
          actions.setStreamText('');
          actions.setStreaming(false);
          actions.setStatusLine(null);
          actions.addActivity(sessionId, 'error', `Error: ${error}`);
          actions.addFeed(sessionId, 'error', error);
          addStep(runId, { kind: 'error', label: error || 'Error' });
          completeRun(runId);
        },
        onStatus: (status, detail) => {
          const summaries: Record<string, string> = {
            connecting: 'Connecting...',
            thinking: `${currentAgent.name} is thinking...`,
            planning: `${currentAgent.name} is planning strategy...`,
            writing: `${currentAgent.name} is writing...`,
            researching: detail ? `Researching: ${detail}` : 'Researching...',
            executing: detail ? `Executing: ${detail}` : 'Executing...',
            tool_call: detail ? `Using tool: ${detail}` : 'Processing...',
            done: 'Done',
            warning: detail || 'Warning',
            attention: detail || 'Attention needed',
            error: detail || 'Error occurred',
          };
          actions.setStatusLine(summaries[status] || 'Processing...');
          if (status === 'thinking') setStreamPhase('thinking');
          else if (status === 'planning') setStreamPhase('planning');
          else if (status === 'writing') {
            setStreamPhase('writing');
            setActiveToolName(null);
          } else if (status === 'connecting') setStreamPhase('connecting');
          else if (status === 'error') setStreamPhase('error');
          else if (status === 'researching' || status === 'executing' || status === 'tool_call') {
            setStreamPhase('tool_use');
            setActiveToolName(detail || status);
          }
          if (status === 'planning') {
            if (processStepRef.current)
              updateStep(runId, processStepRef.current, {
                status: 'completed',
                completedAt: Date.now(),
              });
            const pId = addStep(runId, { kind: 'planning', label: 'Planning strategy...' });
            processStepRef.current = pId;
          } else if (status === 'researching' || status === 'executing' || status === 'tool_call') {
            if (processStepRef.current)
              updateStep(runId, processStepRef.current, {
                status: 'completed',
                completedAt: Date.now(),
              });
            const tId = addStep(runId, {
              kind: 'tool_use',
              label: detail || status,
              toolName: detail || undefined,
            });
            processStepRef.current = tId;
          }
          if (
            status === 'thinking' ||
            status === 'planning' ||
            status === 'researching' ||
            status === 'executing' ||
            status === 'tool_call'
          ) {
            actions.addActivity(sessionId, status, summaries[status] || 'Processing');
            if (status === 'thinking')
              actions.addFeed(sessionId, 'routed', 'Model selected, processing');
            else if (status === 'researching' || status === 'executing' || status === 'tool_call')
              actions.addFeed(
                sessionId,
                'gateway',
                summaries[status] || 'Processing',
                detail ? { tool: detail } : undefined,
              );
          }
        },
        onBillingWarning: (message: string) => {
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: `[system] ${message}`,
            timestamp: Date.now(),
            meta: { system: 'true', type: 'system', event: 'billing-warning' },
          });
          actions.addActivity(sessionId, 'warning', message);
          actions.addFeed(sessionId, 'system', message);
        },
        onApprovalRequired: (approval) => {
          setPendingApproval(approval);
          actions.setStatusLine(`Approval needed: ${approval.reason}`);
          setStreamPhase('attention');
          addStep(runId, { kind: 'approval', label: `Awaiting approval: ${approval.tool}` });
        },
        onToolStart: (event: ToolStartEvent) => {
          // Accumulate for Claude CLI rich view
          if (isClaudeCliResponse) {
            claudeToolEvents.push({
              type: 'tool_start',
              tools: [{ name: event.tool, input: event.input }],
            });
          }
          const toolLabel = event.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
          const input =
            event.input && typeof event.input === 'object'
              ? (event.input as Record<string, unknown>)
              : {};
          const inputPreview = input.command
            ? `: \`${String(input.command).slice(0, 60)}\``
            : input.path
              ? `: ${String(input.path).slice(0, 60)}`
              : input.query
                ? `: ${String(input.query).slice(0, 60)}`
                : '';
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: `[tool_exec] \u{1F527} Running ${toolLabel}${inputPreview}...`,
            timestamp: Date.now(),
            meta: {
              system: 'true',
              type: 'tool_exec',
              event: 'tool_start',
              tool: event.tool,
              status: 'running',
              iteration: String(event.iteration),
              inputJson: event.input ? JSON.stringify(event.input).slice(0, 200) : '',
            },
          });
          actions.setStatusLine(`Running ${toolLabel}...`);
          setStreamPhase('tool_use');
          setActiveToolName(event.tool);
        },
        onToolError: (event: ToolErrorEvent) => {
          const toolLabel = event.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: `[tool_exec] \u274C ${toolLabel} failed: ${event.error.slice(0, 120)}`,
            timestamp: Date.now(),
            meta: {
              system: 'true',
              type: 'tool_exec',
              event: 'tool_error',
              tool: event.tool,
              status: 'error',
              iteration: String(event.iteration),
              error: event.error.slice(0, 300),
            },
          });
          actions.addFeed(sessionId, 'tool_result', `${toolLabel}: error`, {
            tool: event.tool,
            status: 'error',
          });
          actions.addActivity(sessionId, 'error', `\u2717 ${toolLabel} failed`);
        },
        onToolResult: (result: ToolResult) => {
          // Accumulate for Claude CLI rich view
          if (isClaudeCliResponse) {
            claudeToolEvents.push({
              type: 'tool_result',
              tool: result.tool,
              result:
                typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
              isError: result.status === 'error',
            });
          }
          const toolLabel = result.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
          const statusIcon = result.status === 'success' ? '\u2713' : '\u2717';
          const durationStr = result.duration_ms
            ? ` (${(result.duration_ms / 1000).toFixed(1)}s)`
            : '';
          if (processStepRef.current)
            updateStep(runId, processStepRef.current, {
              status: 'completed',
              completedAt: Date.now(),
            });
          const stepId = addStep(runId, {
            kind: 'tool_result',
            label: `${statusIcon} ${toolLabel}${durationStr}`,
            toolName: result.tool,
            detail: result.status === 'error' ? String(result.output || 'Error') : undefined,
          });
          processStepRef.current = stepId;
          // Add inline tool completion message
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: `[tool_exec] ${result.status === 'success' ? '\u2705' : '\u274C'} ${toolLabel} ${result.status === 'success' ? 'completed' : 'failed'}${durationStr}`,
            timestamp: Date.now(),
            meta: {
              system: 'true',
              type: 'tool_exec',
              event: 'tool_result',
              tool: result.tool,
              status: result.status,
              duration: result.duration_ms ? String(result.duration_ms) : '',
              outputPreview:
                result.status === 'success' && typeof result.output === 'string'
                  ? result.output.slice(0, 200)
                  : '',
            },
          });
          actions.addFeed(
            sessionId,
            'tool_result',
            `${toolLabel}: ${result.status}${durationStr}`,
            { tool: result.tool, status: result.status },
          );
          actions.addActivity(sessionId, 'executing', `${statusIcon} ${toolLabel}${durationStr}`);
        },
        onModelFailed: (model: string, reason: string) => {
          const shortModel = model.includes('/') ? model.split('/').pop()! : model;
          const failLine = `~~${shortModel}: Failed~~ \u2014 ${reason}\n\n`;
          fullResponse = failLine;
          actions.setStreamText(failLine);
          actions.addActivity(sessionId, 'error', `${shortModel} failed: ${reason}`);
          actions.addFeed(sessionId, 'error', `${shortModel}: ${reason}`);
          if (processStepRef.current)
            updateStep(runId, processStepRef.current, {
              status: 'completed',
              completedAt: Date.now(),
            });
          addStep(runId, { kind: 'error', label: `${shortModel}: Failed` });
        },
        onClearResponse: () => {
          const failLine = fullResponse.match(/^~~.+?~~.*?\n\n/)?.[0] || '';
          fullResponse = failLine;
          actions.setStreamText(failLine);
          streamStarted = false;
        },
        onModelSwitch: (from: string, to: string, _reason: string) => {
          const shortTo = to.includes('/') ? to.split('/').pop()! : to;
          actions.setStatusLine(`Retrying with ${shortTo}...`);
          setStreamPhase('thinking');
          const stepId = addStep(runId, { kind: 'thinking', label: `Retrying \u2192 ${shortTo}` });
          processStepRef.current = stepId;
        },
        // ── Mode suggestion ──
        onModeSuggestion: (suggestion: {
          suggestedMode: string;
          reason: string;
          confidence: number;
        }) => {
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: `[system] ${suggestion.reason}`,
            timestamp: Date.now(),
            meta: {
              system: 'true',
              type: 'system',
              event: 'mode-suggestion',
              suggestedMode: suggestion.suggestedMode,
              confidence: String(suggestion.confidence),
            },
          });
        },
        // ── Claude CLI callbacks ──
        onClaudeCliRoute: (_mode: string) => {
          isClaudeCliResponse = true;
          claudeToolEvents = [];
          actions.addMessage(sessionId, {
            role: 'assistant',
            content: '[system] Routing to Claude Code CLI for execution',
            timestamp: Date.now(),
            meta: { system: 'true', type: 'system', event: 'route-change' },
          });
          setStreamPhase('tool_use');
          setActiveToolName('Claude CLI');
          actions.setStatusLine('Claude Code CLI executing...');
        },
        onClaudeSessionStart: (sid: string) => {
          claudeSessionId = sid;
          claudeToolEvents.push({ type: 'session_start', sessionId: sid });
          actions.setStatusLine('Claude CLI session started...');
        },
        onClaudeSessionEnd: (data) => {
          if (data.costUsd != null) claudeCost = data.costUsd;
          if (data.durationMs != null) claudeDuration = data.durationMs;
          claudeToolEvents.push({ type: 'session_end', ...data });
        },
        onClaudeResult: (data) => {
          if (data.costUsd != null) claudeCost = data.costUsd;
          if (data.durationMs != null) claudeDuration = data.durationMs;
          if (data.model) claudeModel = data.model;
          claudeToolEvents.push({ type: 'claude_result', ...data });
        },
        onFileDiff: (data) => {
          claudeToolEvents.push({ type: 'file_diff', ...data });
        },
        onClaudeSystem: (message: string) => {
          claudeToolEvents.push({ type: 'status', text: message });
        },
        onTrace: (traceId: string) => {
          capturedTraceId = traceId;
        },
        onTraceComplete: (traceRecord: Record<string, unknown>) => {
          capturedTraceRecord = traceRecord;
        },
      },
      controller.signal,
      sessionId,
      selectedModel || undefined,
      attachments.length > 0 ? attachments : undefined,
      routerMode,
      session?.parentId || replyToIndex !== null
        ? ({
            ...(session?.parentId
              ? { parentSessionId: session.parentId, branchPoint: session.messages.length }
              : {}),
            ...(replyToIndex !== null ? { replyToMessageIndex: replyToIndex } : {}),
          } as ThreadContext)
        : undefined,
      contextHealth,
      claudeCliMode,
      directMode,
      voiceMode,
      traceEnabled,
      conversationMode,
      activeAppId,
    );
  }, [
    input,
    streaming,
    syncing,
    ensureSession,
    sessions,
    activeSessionId,
    actions,
    pendingFiles,
    wsConnected,
    wsReconnecting,
    activeAgentId,
    currentAgent.name,
    cliMode,
    routerMode,
    directMode,
    claudeCliMode,
    voiceMode,
    conversationMode,
    activeAppId,
    sendViaCLI,
    selectedModel,
    compareMode,
    compareModels,
    startRun,
    addStep,
    updateStep,
    completeRun,
    executeSlashCommand,
    generateSuggestions,
    identityVerified,
    pendingMessage,
    verifyIdentity,
  ]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

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

  useEffect(() => {
    if (sendQueuedRef.current && !streaming && input.trim()) {
      sendQueuedRef.current = false;
      const btn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
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
