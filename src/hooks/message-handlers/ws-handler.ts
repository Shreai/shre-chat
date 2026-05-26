import { sendChatWS } from '../../gateway-ws';
import { generateAITitle } from '../../router-client';
import { generateTitle, type Session, type AppActions } from '../../store';
import { playNotifSound } from '../../chat-utils';

export interface WSHandlerProps {
  effectiveAgentId: string;
  sessionId: string;
  messageText: string;
  selectedModel: string | null;
  currentAgent: { name: string };
  runId: string;
  sessions: Session[];
  actions: Pick<
    AppActions,
    | 'addMessage'
    | 'addActivity'
    | 'addFeed'
    | 'setStreamText'
    | 'setStreaming'
    | 'setStatusLine'
    | 'updateSessionTitle'
  >;
  setCompacting: (v: boolean) => void;
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
  updateStep: (
    runId: string,
    stepId: string,
    update: { status?: string; completedAt?: number; [key: string]: any },
  ) => void;
  addStep: (runId: string, step: { kind: string; label: string; [key: string]: any }) => string;
  completeRun: (runId: string) => void;
  processStepRef: React.MutableRefObject<string>;
  firstTokenTimeRef: React.MutableRefObject<number>;
  sendTimeRef: React.MutableRefObject<number>;
  setFirstTokenReceived: (v: boolean) => void;
  bufferToken: (fullText: string) => void;
  streamBufferRef: React.MutableRefObject<string>;
  streamFlushRaf: React.MutableRefObject<number | null>;
  generateSuggestions: (full: string) => void;
  recentWSSendRef: React.MutableRefObject<boolean>;
  routerMode: boolean;
}

export async function handleWSMessage(
  props: WSHandlerProps,
): Promise<{ ok: boolean; error?: string }> {
  const {
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
  } = props;

  let fullResponse = '';
  streamBufferRef.current = '';

  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
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
          if (sendTimeRef.current > 0) wsMeta.total_ms = String(Date.now() - sendTimeRef.current);

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
            generateAITitle(messageText).then((aiTitle) => {
              actions.updateSessionTitle(sessionId, aiTitle || generateTitle(messageText));
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
        },
      },
      selectedModel || undefined,
    );
  });
}
