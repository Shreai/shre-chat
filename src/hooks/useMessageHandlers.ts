import { useState, useRef, useCallback } from 'react';
import { usePreferences } from '../preferences-store';
import { sendMessage, type ChatMessage } from '../router-client';
import { isWSConnected } from '../gateway-ws';
import { getAgent, type UploadedFile, type Session, type AppActions } from '../store';
import { playNotifSound } from '../chat-utils';
import { streamViaCLI } from './cli-streaming';
import { fetchSuggestions, verifyIdentityCode, sendFeedbackToServer } from './message-utils';
import { extractToolTokens } from '../lib/composer-grammar';

// ── Extracted modules ──
import { buildDefaultSystemPrompt, SYSTEM_PROMPT_VERSION } from './message-handlers/handler-utils';
import { anchorContextIfNeeded } from './message-handlers/context-builder';
import { useTaskIntents } from './message-handlers/task-intents';
import { useMemoryIntents } from './message-handlers/memory-intents';
import { handleWSMessage } from './message-handlers/ws-handler';

// Re-export for backward compatibility
export { SYSTEM_PROMPT_VERSION };

export interface UseMessageHandlersParams {
  input: string;
  setInput: (v: string) => void;
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
  selectedTools: string[];
  ragProfile: 'fast' | 'balanced' | 'deep';
  ragDepth: number;
  setCompareStreams: (
    v: (
      prev: Record<string, { text: string; done: boolean; error?: string }>,
    ) => Record<string, { text: string; done: boolean; error?: string }>,
  ) => void;
  setCompareWinner: (v: string | null) => void;
  cliMode: boolean;
  routerMode: boolean;
  gatewayMode: string;
  claudeCliMode: boolean;
  identityVerified: boolean;
  setIdentityVerified: (v: boolean) => void;
  setPendingMessage: (v: string | null) => void;
  setVerifying: (v: boolean) => void;
  ensureSession: () => string;
  executeSlashCommand: (cmd: string) => void;
  extractMention?: (text: string) => { cleanText: string; agentId: string | null };
  clearMention?: () => void;
  setStreamPhase: (
    v:
      | 'connecting'
      | 'thinking'
      | 'planning'
      | 'tool_use'
      | 'writing'
      | 'compacting'
      | 'done'
      | 'attention'
      | 'error',
  ) => void;
  setActiveToolName: (v: string | null) => void;
  setCompacting: (v: boolean) => void;
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
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  wsConnected: boolean;
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
    selectedTools,
    ragProfile,
    ragDepth,
    setCompareStreams,
    setCompareWinner,
    cliMode,
    routerMode,
    gatewayMode,
    claudeCliMode,
    identityVerified,
    setIdentityVerified,
    setPendingMessage,
    setVerifying,
    ensureSession,
    executeSlashCommand,
    extractMention,
    clearMention,
    setStreamPhase,
    setActiveToolName,
    setCompacting,
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
    voiceFinalTranscriptRef,
    recentWSSendRef,
    virtualizer,
    userNearBottomRef,
    setShowJumpToLatest,
    setSuggestions,
    setSelectedMsgIndex,
    voiceMode,
  } = params;

  const activeAppId = usePreferences((s) => s.activeAppId);
  const conversationMode = usePreferences((s) => s.conversationMode);
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState('');
  const [cliContinue, setCliContinue] = useState(false);
  const pendingSuggestionSendRef = useRef(false);

  const currentAgent = getAgent(activeAgentId);
  const { detectAndHandleTaskQuery } = useTaskIntents({ actions });
  const { detectAndHandleMemoryIntent } = useMemoryIntents({ actions });

  const generateSuggestions = useCallback(
    (res: string) => fetchSuggestions(res, setSuggestions),
    [setSuggestions],
  );
  const verifyIdentity = useCallback(
    (code: string) => verifyIdentityCode(code, setVerifying, setIdentityVerified),
    [setVerifying, setIdentityVerified],
  );
  const sendFeedbackToRapidRMS = useCallback(
    (idx: number, r: 'like' | 'dislike') =>
      sendFeedbackToServer(idx, r, {
        messages,
        activeSessionId,
        activeAgentId,
        setStatusLine: actions.setStatusLine,
      }),
    [messages, activeSessionId, activeAgentId, actions],
  );

  const sendViaCLI = useCallback(
    async (text: string, sid: string) =>
      streamViaCLI(text, sid, {
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
      }),
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

    if (!identityVerified) {
      setPendingMessage(text);
      setVerifying(true);
      return;
    }

    const effectiveAgentId = extractMention
      ? extractMention(text).agentId || activeAgentId
      : activeAgentId;
    const mentionCleanText = extractMention ? extractMention(text).cleanText : text;
    // Strip any free-typed `#tool` tokens and merge them into the tools armed
    // for this request (dropdown-armed tools already live in selectedTools).
    const { cleanText: sendText, toolIds: typedToolIds } = extractToolTokens(mentionCleanText);
    const effectiveTools =
      typedToolIds.length > 0
        ? [...new Set([...selectedTools, ...typedToolIds])]
        : selectedTools;

    if (compareMode && compareModels.length > 0) {
      const cmpSid = ensureSession();
      actions.addMessage(cmpSid, { role: 'user', content: text, timestamp: Date.now() });
      setInput('');
      actions.setStreaming(true);
      actions.setStatusLine('Comparing models...');
      setCompareStreams(() => ({}));
      setCompareWinner(null);
      const promises = compareModels.map(async (modelId) => {
        try {
          let fullResp = '';
          await sendMessage(
            sendText,
            [],
            '',
            {
              onToken: (t) => {
                fullResp += t;
                setCompareStreams((p) => ({
                  ...p,
                  [modelId]: { text: fullResp, done: false },
                }));
              },
              onDone: (f) => {
                setCompareStreams((p) => ({
                  ...p,
                  [modelId]: { text: f || fullResp, done: true },
                }));
              },
              onError: (e) => {
                setCompareStreams((p) => ({
                  ...p,
                  [modelId]: { text: fullResp || `Error: ${e}`, done: true, error: String(e) },
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
        } catch (err: unknown) {
          setCompareStreams((p) => ({
            ...p,
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
    setTimeout(() => virtualizer.scrollToIndex(filteredMessages.length + 2, { align: 'end' }), 50);
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

    detectAndHandleTaskQuery(text, sessionId);
    detectAndHandleMemoryIntent(text, sessionId);

    const runId = `run-${Date.now()}`;
    processRunIdRef.current = runId;
    startRun(runId, sessionId);
    const thinkStepId = addStep(runId, { kind: 'thinking', label: 'Thinking...' });
    processStepRef.current = thinkStepId;

    let messageText = sendText;
    const replyMsg =
      replyToIndex !== null
        ? (filteredMessages[replyToIndex] ?? (session?.messages ?? [])[replyToIndex] ?? null)
        : null;
    if (replyMsg) {
      const replySnippet =
        replyMsg.content.length > 500 ? replyMsg.content.slice(0, 500) + '...' : replyMsg.content;
      messageText = `[Replying to ${replyMsg.role === 'user' ? 'my earlier message' : 'your earlier response'}]: "${replySnippet}"\n\n${sendText}`;
    }
    messageText = anchorContextIfNeeded(text, messageText, replyToIndex, filteredMessages);

    if (attachedFiles.length > 0) {
      const names = attachedFiles.map((f) => f.name).join(', ');
      messageText = `[Attached files: ${names}]\n\n${messageText}`;
      actions.addFeed(sessionId, 'sent', `Attached: ${names}`, {
        files: String(attachedFiles.length),
      });
    }

    if (effectiveTools.length > 0) {
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: `[system] Active tools for this request: ${effectiveTools.join(', ')}`,
        timestamp: Date.now(),
        meta: { system: 'true' },
      });
      actions.addFeed(sessionId, 'gateway', `Tools: ${effectiveTools.join(', ')}`, {
        tools: String(effectiveTools.length),
      });
    }

    if (cliMode) {
      try {
        await sendViaCLI(messageText, sessionId);
        return;
      } catch (err) {
        console.debug('CLI failed', err);
        actions.setStatusLine('CLI failed, trying gateway...');
      }
    }

    const useRouterWS = isWSConnected();
    if (useRouterWS) {
      actions.addFeed(sessionId, 'gateway', 'Router Gateway', { transport: 'ws' });
      const wsResult = await handleWSMessage({
        effectiveAgentId,
        sessionId,
        messageText,
        selectedModel,
        currentAgent,
        runId,
        sessions,
        actions,
        setCompacting,
        setStreamPhase,
        setActiveToolName,
        updateStep,
        addStep,
        completeRun,
        processStepRef,
        firstTokenTimeRef,
        sendTimeRef,
        setFirstTokenReceived,
        bufferToken,
        streamBufferRef,
        streamFlushRaf,
        generateSuggestions,
        recentWSSendRef,
        routerMode,
      });
      if (wsResult.ok) return;
    }

    let fullResponse = '';
    let routedModel = '';
    let routedProvider = '';
    let toolsAck: string[] = [];
    const abortController = new AbortController();
    abortRef.current = abortController;
    const history = messages.slice(-20);
    const systemPrompt = buildDefaultSystemPrompt(currentAgent.name, currentAgent.id);

    try {
      await sendMessage(
        messageText,
        history,
        systemPrompt,
        {
          onToken: (token) => {
            if (firstTokenTimeRef.current === 0) {
              firstTokenTimeRef.current = Date.now();
              setFirstTokenReceived(true);
            }
            fullResponse += token;
            bufferToken(fullResponse);
            actions.setStatusLine(`${currentAgent.name} is writing...`);
            if (processStepRef.current !== 'writing') {
              if (processStepRef.current)
                updateStep(runId, processStepRef.current, {
                  status: 'completed',
                  completedAt: Date.now(),
                });
              processStepRef.current = addStep(runId, {
                kind: 'generating',
                label: 'Writing response...',
              });
            }
          },
          onDone: (full) => {
            const final = full || fullResponse;
            if (toolsAck.length > 0) {
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: `[system] Tool subset acknowledged by router: ${toolsAck.join(', ')}`,
                timestamp: Date.now(),
                meta: { system: 'true' },
              });
            }
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: final,
              timestamp: Date.now(),
              meta: {
                route: 'http',
                model: routedModel || selectedModel || currentAgent.name,
                provider: routedProvider || '',
              },
            });
            actions.setStreaming(false);
            actions.setStreamText('');
            actions.setStatusLine(null);
            completeRun(runId);
            generateSuggestions(final);
            playNotifSound();
          },
          onError: (err) => {
            actions.setStreaming(false);
            actions.setStatusLine(`Error: ${err}`);
            completeRun(runId);
          },
          onStatus: (status: string) => {
            if (status === 'thinking') setStreamPhase('thinking');
            else if (status === 'writing') setStreamPhase('writing');
          },
          onRouteMeta: (meta) => {
            if (meta.model) routedModel = meta.model;
            if (meta.provider) routedProvider = meta.provider;
            if (Array.isArray(meta.toolsAcknowledged) && meta.toolsAcknowledged.length > 0) {
              toolsAck = meta.toolsAcknowledged.filter(Boolean);
            }
          },
        },
        abortController.signal,
        sessionId,
        selectedModel || undefined,
        undefined,
        routerMode,
        undefined,
        undefined,
        claudeCliMode,
        false,
        voiceMode,
        false,
        conversationMode,
        activeAppId,
        effectiveTools,
        { profile: ragProfile, depth: ragDepth },
      );
    } catch {
      actions.setStreaming(false);
      actions.setStatusLine('Failed to send message');
    }
  }, [
    input,
    syncing,
    writeEnabled,
    identityVerified,
    activeAgentId,
    activeSessionId,
    sessions,
    messages,
    filteredMessages,
    actions,
    replyToIndex,
    pendingFiles,
    selectedModel,
    compareMode,
    compareModels,
    selectedTools,
    ragProfile,
    ragDepth,
    cliMode,
    routerMode,
    gatewayMode,
    claudeCliMode,
    setVerifying,
    setIdentityVerified,
    setPendingMessage,
    ensureSession,
    executeSlashCommand,
    extractMention,
    clearMention,
    setStreamPhase,
    setActiveToolName,
    setCompacting,
    setFirstTokenReceived,
    bufferToken,
    generateSuggestions,
    startRun,
    addStep,
    updateStep,
    completeRun,
    sendViaCLI,
    detectAndHandleTaskQuery,
    detectAndHandleMemoryIntent,
    virtualizer,
    userNearBottomRef,
    setShowJumpToLatest,
    setSelectedMsgIndex,
    activeAppId,
    conversationMode,
    currentAgent,
    abortRef,
    firstTokenTimeRef,
    processRunIdRef,
    processStepRef,
    recentWSSendRef,
    sendTimeRef,
    sendingRef,
    setCompareStreams,
    setCompareWinner,
    streamBufferRef,
    streamFlushRaf,
    streamStartRef,
    voiceFinalTranscriptRef,
    voiceMode,
  ]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

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
