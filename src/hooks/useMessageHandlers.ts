import { useState, useRef, useCallback, useEffect } from 'react';
import { usePreferences } from '../preferences-store';
import {
  sendMessage,
  type ChatMessage,
  type PreviewGatePayload,
  type ChatErrorEnvelope,
} from '../router-client';
import { getAgent, type UploadedFile, type Session, type AppActions } from '../store';
import { getStoredWorkspaceId } from '../workspace-context';
import { playNotifSound } from '../chat-utils';
import { streamViaCLI } from './cli-streaming';
import { fetchSuggestions, verifyIdentityCode, sendFeedbackToServer } from './message-utils';
import type { ProcessStep } from '../components/process-bar/types';

// ── Extracted modules ──
import { buildDefaultSystemPrompt, SYSTEM_PROMPT_VERSION } from './message-handlers/handler-utils';
import { anchorContextIfNeeded, buildScopedRuntimePacket, fetchContextSources } from './message-handlers/context-builder';
import { useTaskIntents } from './message-handlers/task-intents';
import { useMemoryIntents } from './message-handlers/memory-intents';
import { useCommsIntents } from './message-handlers/comms-intents';
import type { ProcessStepKind } from '../components/process-bar/types';
import {
  buildRuntimeScope,
  buildRuntimeSystemPrompt,
  summarizeRuntimeScope,
  verifyRuntimeAnswer,
} from '../runtime-contract';

// Re-export for backward compatibility
export { SYSTEM_PROMPT_VERSION };

export interface UseMessageHandlersParams {
  input: string;
  setInput: (v: string) => void;
  streaming?: boolean;
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
    v: (
      prev: Record<string, { text: string; done: boolean; error?: string }>,
    ) => Record<string, { text: string; done: boolean; error?: string }>,
  ) => void;
  setCompareWinner: (v: string | null) => void;
  cliMode: boolean;
  routerMode: boolean;
  directMode?: boolean;
  gatewayMode?: string;
  claudeCliMode: boolean;
  identityVerified: boolean;
  setIdentityVerified: (v: boolean) => void;
  pendingMessage?: string | null;
  setPendingMessage: (v: string | null) => void;
  verifying?: boolean;
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
  setPendingApproval?: (
    v: { approvalId: string; tool: string; input: Record<string, unknown>; reason: string } | null,
  ) => void;
  setFirstTokenReceived: (v: boolean) => void;
  streamStartRef: React.MutableRefObject<number>;
  sendTimeRef: React.MutableRefObject<number>;
  firstTokenTimeRef: React.MutableRefObject<number>;
  startRun: (id: string, sessionId: string) => void;
  addStep: (
    runId: string,
    step: {
      kind: ProcessStepKind;
      label: string;
      [key: string]: unknown;
    } & Record<string, unknown>,
  ) => string;
  updateStep: (
    runId: string,
    stepId: string,
    update: Record<string, unknown> & { status?: string; completedAt?: number },
  ) => void;
  completeRun: (runId: string) => void;
  processStepRef: React.MutableRefObject<string>;
  processRunIdRef: React.MutableRefObject<string>;
  abortRef: React.MutableRefObject<AbortController | null>;
  sendingRef: React.MutableRefObject<boolean>;
  streamBufferRef: React.MutableRefObject<string>;
  streamFlushRaf: React.MutableRefObject<number | null>;
  bufferToken: (fullText: string) => void;
  flushStreamBuffer?: () => void;
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  wsConnected: boolean;
  wsReconnecting?: boolean;
  recentWSSendRef: React.MutableRefObject<boolean>;
  virtualizer: {
    scrollToIndex: (
      idx: number,
      opts?: ScrollIntoViewOptions & { align?: 'start' | 'center' | 'end' | 'auto' },
    ) => void;
  };
  userNearBottomRef: React.MutableRefObject<boolean>;
  setShowJumpToLatest: (v: boolean) => void;
  setSuggestions: (v: string[]) => void;
  setSelectedMsgIndex: (v: number | null) => void;
  voiceMode: boolean;
  pendingEditSendRef?: React.MutableRefObject<boolean>;
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

export function useMessageHandlers(params: any): UseMessageHandlersReturn {
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
    setCompareStreams,
    setCompareWinner,
    cliMode,
    routerMode,
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
    wsConnected,
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
  const pendingTraceIdRef = useRef<string | null>(null);
  const pendingTraceRecordRef = useRef<Record<string, unknown> | null>(null);

  const currentAgent = getAgent(activeAgentId);
  const { detectAndHandleTaskQuery } = useTaskIntents({ actions });
  const { detectAndHandleMemoryIntent } = useMemoryIntents({ actions });
  const { detectAndHandleCommsIntent } = useCommsIntents({ actions });

  const generateSuggestions = useCallback(
    (res: string) => fetchSuggestions(res, setSuggestions),
    [setSuggestions],
  );

  // Shared 409 preview-gate handler: appends a system message so MessageList
  // can render PreviewConfirmCard + ProposalFiledCard instead of an error bubble.
  const emitPreviewRequired = useCallback(
    (sessionId: string, runId: string, payload: PreviewGatePayload, originalMessage: string) => {
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: `[system] ${payload.message || 'Preview confirmation required'}`,
        timestamp: Date.now(),
        meta: {
          system: 'true',
          type: 'preview_required',
          previewPayload: JSON.stringify(payload),
          originalMessage,
        },
      });
      actions.setStreaming(false);
      actions.setStreamText('');
      actions.setStatusLine(null);
      completeRun(runId);
    },
    [actions, completeRun],
  );

  const attachTraceRecord = useCallback(
    (sessionId: string, traceId: string, traceRecord: Record<string, unknown>) => {
      const session = sessions.find((s: Session) => s.id === sessionId);
      if (!session) return;
      const traceJson = JSON.stringify(traceRecord);
      const messages = session.messages.map((msg: ChatMessage) => {
        if (msg.role !== 'assistant') return msg;
        if (msg.meta?.traceId !== traceId) return msg;
        return {
          ...msg,
          meta: {
            ...msg.meta,
            traceRecord: traceJson,
          },
        };
      });
      actions.replaceSessionMessages(sessionId, messages);
    },
    [actions, sessions],
  );

  const emitStructuredError = useCallback(
    (sessionId: string, err: ChatErrorEnvelope) => {
      const traceId = err.traceId || pendingTraceIdRef.current || '';
      const traceRecord = pendingTraceRecordRef.current;
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: `[system] ${err.message}`,
        timestamp: Date.now(),
        meta: {
          system: 'true',
          type: 'system',
          event: 'chat_error',
          errorCode: err.code,
          errorStage: err.stage,
          errorRetryable: String(err.retryable),
          errorWhereToLook: err.whereToLook,
          errorEnvelope: JSON.stringify(err),
          ...(traceId ? { traceId } : {}),
          ...(traceRecord ? { traceRecord: JSON.stringify(traceRecord) } : {}),
        },
      });
      actions.addActivity(sessionId, 'error', `${err.code}: ${err.whereToLook}`);
    },
    [actions],
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

  const buildScopedRuntimeContext = useCallback(
    async (sessionId: string, messageText: string) => {
      const runtimeScope = buildRuntimeScope(messageText, getStoredWorkspaceId() || 'default');
      const runtimeSources = await fetchContextSources(sessionId);
      const runtimePacket = buildScopedRuntimePacket(runtimeScope, runtimeSources);
      const systemPrompt = buildRuntimeSystemPrompt(
        buildDefaultSystemPrompt(currentAgent.name, currentAgent.id),
        runtimePacket,
      );
      return { runtimeScope, runtimePacket, systemPrompt };
    },
    [currentAgent.name, currentAgent.id],
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
    const sendText = extractMention ? extractMention(text).cleanText : text;
    if (compareMode && compareModels.length > 0) {
      const cmpSid = ensureSession();
      actions.addMessage(cmpSid, { role: 'user', content: text, timestamp: Date.now() });
      setInput('');
      actions.setStreaming(true);
      actions.setStatusLine('Comparing models...');
      setCompareStreams(() => ({}));
      setCompareWinner(null);
      const { runtimeScope, runtimePacket, systemPrompt: compareSystemPrompt } =
        await buildScopedRuntimeContext(cmpSid, sendText);
      actions.setStatusLine(`Scoped → ${summarizeRuntimeScope(runtimeScope)}`);
      const promises = compareModels.map(async (modelId: string) => {
        try {
          let fullResp = '';
          await sendMessage(
            sendText,
            [],
            compareSystemPrompt,
            {
              onToken: (t) => {
                fullResp += t;
                setCompareStreams(
                  (p: Record<string, { text: string; done: boolean; error?: string }>) => ({
                    ...p,
                    [modelId]: { text: fullResp, done: false },
                  }),
                );
              },
              onDone: (f) => {
                setCompareStreams(
                  (p: Record<string, { text: string; done: boolean; error?: string }>) => ({
                    ...p,
                    [modelId]: { text: f || fullResp, done: true },
                  }),
                );
              },
              onError: (e) => {
                setCompareStreams(
                  (p: Record<string, { text: string; done: boolean; error?: string }>) => ({
                    ...p,
                    [modelId]: { text: fullResp || `Error: ${e}`, done: true, error: String(e) },
                  }),
                );
              },
              onStatus: () => {},
            },
            undefined,
            undefined,
            modelId,
            undefined,
            routerMode,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimePacket,
          );
        } catch (err: unknown) {
          setCompareStreams(
            (p: Record<string, { text: string; done: boolean; error?: string }>) => ({
              ...p,
              [modelId]: {
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                done: true,
                error: String(err),
              },
            }),
          );
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
    const session = sessions.find((s: Session) => s.id === sessionId);
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
    pendingTraceIdRef.current = null;
    pendingTraceRecordRef.current = null;

    const [, , commsHandled] = await Promise.all([
      detectAndHandleTaskQuery(text, sessionId),
      detectAndHandleMemoryIntent(text, sessionId),
      detectAndHandleCommsIntent(text, sessionId),
    ]);

    if (commsHandled) {
      actions.setStreaming(false);
      actions.setStreamText('');
      actions.setStatusLine(null);
      setStreamPhase('done');
      actions.addActivity(sessionId, 'done', 'Opened communication channel');
      playNotifSound();
      return;
    }

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

    const { runtimeScope, runtimePacket, systemPrompt } = await buildScopedRuntimeContext(
      sessionId,
      messageText,
    );
    actions.setStatusLine(`Scoped → ${summarizeRuntimeScope(runtimeScope)}`);

    if (cliMode) {
      try {
        await sendViaCLI(messageText, sessionId);
        return;
      } catch (err) {
        console.debug('CLI failed', err);
        actions.setStatusLine('CLI failed, trying gateway...');
      }
    }

    let fullResponse = '';
    const abortController = new AbortController();
    abortRef.current = abortController;
    const history = messages.slice(-20);

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
            const verdict = verifyRuntimeAnswer(final, runtimePacket);
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: final,
              timestamp: Date.now(),
              meta: {
                route: 'http',
                model: selectedModel || currentAgent.name,
                verifierOk: String(verdict.ok),
                ...(verdict.issues.length ? { verifierIssues: verdict.issues.join(',') } : {}),
                ...(pendingTraceIdRef.current ? { traceId: pendingTraceIdRef.current } : {}),
                ...(pendingTraceRecordRef.current
                  ? { traceRecord: JSON.stringify(pendingTraceRecordRef.current) }
                  : {}),
              },
            });
            if (!verdict.ok) {
              actions.addActivity(sessionId, 'warning', `Verifier: ${verdict.issues.join(', ')}`);
            }
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
          onStructuredError: (err) => {
            emitStructuredError(sessionId, err);
          },
          onPreviewRequired: (payload, originalMessage) =>
            emitPreviewRequired(sessionId, runId, payload, originalMessage),
          onTrace: (traceId: string) => {
            pendingTraceIdRef.current = traceId;
          },
          onTraceComplete: (traceRecord: Record<string, unknown>) => {
            pendingTraceRecordRef.current = traceRecord;
            const traceId =
              (traceRecord.traceId as string | undefined) || pendingTraceIdRef.current || '';
            if (traceId) {
              attachTraceRecord(sessionId, traceId, traceRecord);
            }
          },
          onStatus: (status: string) => {
            if (status === 'thinking') setStreamPhase('thinking');
            else if (status === 'writing') setStreamPhase('writing');
          },
        },
        abortController.signal,
        sessionId,
        selectedModel || undefined,
        undefined,
        routerMode,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        runtimePacket,
      );
    } catch (err) {
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
    cliMode,
    routerMode,
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
    buildScopedRuntimeContext,
    detectAndHandleTaskQuery,
    detectAndHandleMemoryIntent,
    detectAndHandleCommsIntent,
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

  // Re-submit the original user prompt with a preview-gate confirmation token.
  // Triggered by PreviewConfirmCard via a window CustomEvent so cards don't need
  // to reconstruct agent/session/history context themselves.
  const confirmPreview = useCallback(
    async (previewId: string, originalMessage: string) => {
      if (!previewId || !originalMessage) return;
      const sessionId = ensureSession();
      const abortController = new AbortController();
      abortRef.current = abortController;
      actions.setStreaming(true);
      actions.setStreamText('');
      actions.setStatusLine('Confirming preview...');
      setStreamPhase('connecting');
      pendingTraceIdRef.current = null;
      pendingTraceRecordRef.current = null;
      const runId = `run-${Date.now()}-confirm`;
      processRunIdRef.current = runId;
      startRun(runId, sessionId);
      const stepId = addStep(runId, { kind: 'thinking', label: 'Executing after confirm...' });
      processStepRef.current = stepId;

      let fullResponse = '';
      const history = messages.slice(-20);
      const { runtimePacket, systemPrompt } = await buildScopedRuntimeContext(
        sessionId,
        originalMessage,
      );
      try {
        await sendMessage(
          originalMessage,
          history,
          systemPrompt,
          {
            onToken: (token) => {
              fullResponse += token;
              bufferToken(fullResponse);
              actions.setStatusLine(`${currentAgent.name} is writing...`);
            },
            onDone: (full) => {
              const final = full || fullResponse;
              const verdict = verifyRuntimeAnswer(final, runtimePacket);
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: final,
                timestamp: Date.now(),
                meta: {
                  route: 'http',
                  model: selectedModel || currentAgent.name,
                  previewConfirmed: previewId,
                  verifierOk: String(verdict.ok),
                  ...(verdict.issues.length ? { verifierIssues: verdict.issues.join(',') } : {}),
                  ...(pendingTraceIdRef.current ? { traceId: pendingTraceIdRef.current } : {}),
                  ...(pendingTraceRecordRef.current
                    ? { traceRecord: JSON.stringify(pendingTraceRecordRef.current) }
                    : {}),
                },
              });
              if (!verdict.ok) {
                actions.addActivity(sessionId, 'warning', `Verifier: ${verdict.issues.join(', ')}`);
              }
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
            onStructuredError: (err) => {
              emitStructuredError(sessionId, err);
            },
            // Re-trigger card if gate fires again (e.g. token expired, fresh writes).
            onPreviewRequired: (payload, msg) =>
              emitPreviewRequired(sessionId, runId, payload, msg),
            onTrace: (traceId: string) => {
              pendingTraceIdRef.current = traceId;
            },
            onTraceComplete: (traceRecord: Record<string, unknown>) => {
              pendingTraceRecordRef.current = traceRecord;
              const traceId =
                (traceRecord.traceId as string | undefined) || pendingTraceIdRef.current || '';
              if (traceId) {
                attachTraceRecord(sessionId, traceId, traceRecord);
              }
            },
            onStatus: (status: string) => {
              if (status === 'thinking') setStreamPhase('thinking');
              else if (status === 'writing') setStreamPhase('writing');
            },
          },
          abortController.signal,
          sessionId,
          selectedModel || undefined,
          undefined,
          routerMode,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          previewId,
          undefined,
          runtimePacket,
        );
      } catch {
        actions.setStreaming(false);
        actions.setStatusLine('Failed to resubmit');
      }
    },
    [
      actions,
      addStep,
      bufferToken,
      completeRun,
      currentAgent.id,
      currentAgent.name,
      emitPreviewRequired,
      ensureSession,
      generateSuggestions,
      messages,
      buildScopedRuntimeContext,
      processStepRef,
      processRunIdRef,
      routerMode,
      selectedModel,
      setStreamPhase,
      startRun,
      abortRef,
    ],
  );

  // Listen for confirm-preview events from PreviewConfirmCard. Using a window
  // event keeps the card decoupled from the full hook context + prop tree.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ previewId: string; originalMessage: string }>).detail;
      if (!detail) return;
      void confirmPreview(detail.previewId, detail.originalMessage);
    };
    window.addEventListener('shre-preview-confirm', handler);
    return () => window.removeEventListener('shre-preview-confirm', handler);
  }, [confirmPreview]);

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
