/**
 * Chat send/receive over WebSocket — stream handling, model sync, abort, history.
 */

import { stripProviderPrefix } from '../router-client';
import type { WSStreamCallbacks, ActiveStream } from './ws-types';
import { activeStreams, notifyStreamChange, notifyStreamStall, onEvent, uuid } from './ws-state';
import { rpc } from './ws-connection';

/**
 * Set the active model via the gateway config API.
 */
export async function setModelWS(modelId: string, agentId: string = 'main'): Promise<void> {
  try {
    const res = await fetch('/api/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, modelId }),
    });
    const result = await res.json();
    if (!result.ok) {
      console.warn('[ws] Model sync failed:', result.error);
    } else {
      console.log('[ws] Model synced to config:', modelId);
    }
  } catch (err) {
    console.warn('[ws] Model sync error:', err);
  }
}

export async function sendChatWS(
  agentId: string,
  sessionKey: string,
  message: string,
  callbacks: WSStreamCallbacks,
  modelOverride?: string,
  systemPrompt?: string,
): Promise<void> {
  const fullSessionKey = `agent:${agentId}:${sessionKey}`;
  const streamKey = `${agentId}:${sessionKey}`;
  const runIdempotencyKey = uuid();

  let fullText = '';
  let currentRunId: string | null = null;

  activeStreams.set(streamKey, {
    agentId,
    sessionKey,
    fullSessionKey,
    runId: null,
    startedAt: Date.now(),
    status: 'connecting',
  });
  notifyStreamChange();

  function finalizeStream() {
    activeStreams.delete(streamKey);
    notifyStreamChange();
  }

  function updateStreamStatus(status: ActiveStream['status']) {
    const stream = activeStreams.get(streamKey);
    if (stream) {
      stream.status = status;
      notifyStreamChange();
    }
  }

  // Stream stall detection
  let lastEventAt = Date.now();
  const STREAM_STALL_MS = 30_000;
  const STREAM_TIMEOUT_MS = 90_000;
  let stallNotified = false;
  let streamTimeoutRetried = false;

  const streamStallTimer = setInterval(() => {
    const elapsed = Date.now() - lastEventAt;
    if (elapsed > STREAM_STALL_MS) {
      if (!stallNotified) {
        stallNotified = true;
        console.warn(
          `[ws] Stream stalling for agent ${agentId} — no data in ${STREAM_STALL_MS / 1000}s`,
        );
      }
      notifyStreamStall({
        state: 'stalling',
        agentId,
        sessionKey,
        stalledSince: lastEventAt,
        elapsedMs: elapsed,
      });
    }
  }, 5_000);

  const streamTimeoutTimer = setInterval(() => {
    if (Date.now() - lastEventAt > STREAM_TIMEOUT_MS) {
      clearInterval(streamTimeoutTimer);
      clearInterval(streamStallTimer);

      if (!streamTimeoutRetried) {
        streamTimeoutRetried = true;
        console.warn(`[ws] Stream timeout for agent ${agentId} — retrying once`);
        notifyStreamStall({ state: 'retrying', agentId, sessionKey });
        unsubscribe();
        finalizeStream();
        callbacks.onStatus?.('reconnecting');
        sendChatWS(agentId, sessionKey, message, callbacks, modelOverride, systemPrompt).catch(
          (retryErr) => {
            callbacks.onError(
              `Retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
            );
            notifyStreamStall({ state: 'clear', agentId, sessionKey });
          },
        );
        return;
      }

      console.warn(
        `[ws] Stream timeout for agent ${agentId} — no events in ${STREAM_TIMEOUT_MS / 1000}s (after retry)`,
      );
      notifyStreamStall({ state: 'clear', agentId, sessionKey });
      unsubscribe();
      finalizeStream();
      callbacks.onError('Stream timeout — no response after retry. Please try again.');
    }
  }, 10_000);

  const terminalStates = new Set([
    'final',
    'done',
    'completed',
    'response.completed',
    'response.output_text.done',
  ]);

  function extractTerminalText(content: unknown): string {
    if (Array.isArray(content)) {
      return content
        .map((block: any) => {
          if (typeof block?.text === 'string') return block.text;
          if (block?.type === 'output_text' && typeof block.text === 'string') return block.text;
          return '';
        })
        .join('');
    }
    if (typeof content === 'string') return content;
    return '';
  }

  function clearStreamTimers() {
    clearInterval(streamTimeoutTimer);
    clearInterval(streamStallTimer);
    if (stallNotified) notifyStreamStall({ state: 'clear', agentId, sessionKey });
  }

  function finishStream(text: string) {
    clearStreamTimers();
    unsubscribe();
    finalizeStream();
    callbacks.onDone(text || fullText);
  }

  const unsubscribe = onEvent('chat', (payload) => {
    try {
      lastEventAt = Date.now();
      if (stallNotified) {
        stallNotified = false;
        notifyStreamStall({ state: 'clear', agentId, sessionKey });
      }
      console.log(
        '[ws] chat event:',
        payload.state,
        'sessionKey:',
        payload.sessionKey,
        'expected:',
        fullSessionKey,
        'runId:',
        payload.runId,
        'payload:',
        JSON.stringify(payload).slice(0, 300),
      );
      if (payload.sessionKey !== fullSessionKey) {
        console.warn(
          '[ws] sessionKey mismatch — ignoring event. got:',
          payload.sessionKey,
          'expected:',
          fullSessionKey,
        );
        return;
      }
      if (currentRunId && payload.runId !== currentRunId) {
        console.warn(
          '[ws] runId mismatch — ignoring event. got:',
          payload.runId,
          'expected:',
          currentRunId,
        );
        return;
      }

      if (payload.state === 'delta') {
        const content = payload.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block.type === 'tool_use' ||
              block.type === 'thinking' ||
              block.type === 'tool_result'
            ) {
              const activityText =
                block.type === 'tool_use'
                  ? `Using tool: ${block.name || 'unknown'}`
                  : block.type === 'thinking'
                    ? block.thinking || block.text || 'Thinking...'
                    : `Tool result: ${(block.content || '').toString().slice(0, 100)}`;
              callbacks.onActivity?.(activityText);
              callbacks.onStatus?.('thinking');
              updateStreamStatus('thinking');
              continue;
            }
            if (block.type === 'text' && block.text) {
              fullText += block.text;
              callbacks.onToken(block.text);
            }
          }
        } else if (typeof content === 'string') {
          if (content.length > fullText.length && content.startsWith(fullText)) {
            const delta = content.slice(fullText.length);
            fullText = content;
            callbacks.onToken(delta);
          } else if (
            fullText.length === 0 ||
            !content.startsWith(fullText.slice(0, Math.min(20, fullText.length)))
          ) {
            fullText += content;
            callbacks.onToken(content);
          } else {
            fullText = content;
            callbacks.onToken('');
          }
        }
        callbacks.onStatus?.('writing');
        updateStreamStatus('writing');
      } else if (payload.state === 'thinking' || payload.state === 'tool_use') {
        const detail = payload.message?.content || payload.detail || payload.state;
        const text = typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200);
        callbacks.onActivity?.(text);
        callbacks.onStatus?.('thinking');
        updateStreamStatus('thinking');
      } else if (payload.state === 'compacting' || payload.state === 'summarizing') {
        callbacks.onStatus?.(payload.state);
        updateStreamStatus('compacting');
      } else if (terminalStates.has(String(payload.state))) {
        finishStream(extractTerminalText(payload.message?.content));
      } else if (payload.state === 'aborted') {
        finishStream(fullText);
      } else if (payload.state === 'error') {
        clearStreamTimers();
        unsubscribe();
        finalizeStream();
        callbacks.onError(payload.errorMessage || 'Unknown error');
      }
    } catch (handlerErr) {
      console.error(`[ws] stream handler error for agent ${agentId}:`, handlerErr);
      clearStreamTimers();
      unsubscribe();
      finalizeStream();
      callbacks.onError(`Stream handler error: ${handlerErr}`);
    }
  });

  try {
    callbacks.onStatus?.('connecting');

    if (modelOverride) {
      await setModelWS(modelOverride, agentId);
    }

    const rpcParams: Record<string, unknown> = {
      sessionKey: fullSessionKey,
      message,
      idempotencyKey: runIdempotencyKey,
      deliver: false,
    };
    if (modelOverride) {
      rpcParams.model = stripProviderPrefix(modelOverride);
    }
    if (systemPrompt) {
      rpcParams.systemPrompt = systemPrompt;
    }
    const result = await rpc('chat.send', rpcParams);
    currentRunId = result?.runId || null;

    const stream = activeStreams.get(streamKey);
    if (stream) {
      stream.runId = currentRunId;
      stream.status = 'thinking';
    }
    notifyStreamChange();

    callbacks.onAck?.(currentRunId);
    console.log('[ws] chat.send OK, runId:', currentRunId, 'sessionKey:', fullSessionKey);
    callbacks.onStatus?.('thinking');
  } catch (err) {
    console.error('[ws] chat.send FAILED:', err);
    clearStreamTimers();
    unsubscribe();
    finalizeStream();
    throw err;
  }
}

/**
 * Abort all active streams.
 */
export function abortAllStreams(): void {
  const streams = Array.from(activeStreams.values());
  activeStreams.clear();
  notifyStreamChange();
  for (const stream of streams) {
    rpc('chat.abort', { sessionKey: stream.fullSessionKey }).catch(() => {
      void 0;
    });
  }
}

/**
 * Abort the current chat run.
 */
export async function abortChatWS(agentId: string, sessionKey: string): Promise<void> {
  const streamKey = `${agentId}:${sessionKey}`;
  activeStreams.delete(streamKey);
  notifyStreamChange();

  try {
    await rpc('chat.abort', {
      sessionKey: `agent:${agentId}:${sessionKey}`,
    });
  } catch (err) {
    console.debug('abortChatWS rpc failed', err);
  }
}

/**
 * Load chat history via WebSocket RPC.
 */
export async function loadHistoryWS(
  agentId: string,
  sessionKey: string,
  limit: number = 200,
): Promise<Array<{ role: string; content: string; timestamp?: number }>> {
  const result = await rpc('chat.history', {
    sessionKey: `agent:${agentId}:${sessionKey}`,
    limit,
  });
  if (!result?.messages) return [];

  return result.messages
    .map((m: any) => {
      let text = '';
      if (typeof m.content === 'string') {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('');
      }
      return {
        role: m.role,
        content: text,
        timestamp: m.timestamp,
      };
    })
    .filter((m: any) => m.content.trim());
}
