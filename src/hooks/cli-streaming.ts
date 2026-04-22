// Pure async helper used by useMessageHandlers.sendViaCLI.
// Extracted here so the hook file stays under the max-lines limit; no
// React state of its own — all dependencies are injected by the caller.

import type { MutableRefObject } from 'react';
import type { AppActions } from '../store';

export interface StreamViaCLIDeps {
  cliContinue: boolean;
  claudeCliMode: boolean;
  activeAgentId: string | null;
  abortRef: MutableRefObject<AbortController | null>;
  bufferToken: (text: string) => void;
  streamFlushRaf: MutableRefObject<number | null>;
  streamBufferRef: MutableRefObject<string>;
  sendTimeRef: MutableRefObject<number>;
  firstTokenTimeRef: MutableRefObject<number>;
  setCliContinue: (v: boolean) => void;
  actions: Pick<
    AppActions,
    'setStatusLine' | 'addActivity' | 'addMessage' | 'setStreamText' | 'setStreaming'
  >;
}

export async function streamViaCLI(
  text: string,
  sessionId: string,
  deps: StreamViaCLIDeps,
): Promise<void> {
  const {
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
  } = deps;

  const controller = new AbortController();
  abortRef.current = controller;
  let fullResponse = '';
  const isAutoMode = claudeCliMode;
  actions.setStatusLine(isAutoMode ? 'Starting Claude Code (auto)...' : 'Starting Claude CLI...');
  actions.addActivity(
    sessionId,
    'connecting',
    isAutoMode ? 'Launching Claude Code (autonomous)' : 'Launching Claude CLI',
  );
  try {
    const res = await fetch('/api/cli/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        continueConversation: cliContinue,
        agentId: activeAgentId,
        autoMode: isAutoMode,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'CLI unavailable');
      throw new Error(err);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'delta' && evt.text) {
            fullResponse += evt.text;
            bufferToken(fullResponse);
            actions.setStatusLine(
              isAutoMode ? 'Claude Code executing...' : 'Claude CLI is writing...',
            );
          } else if (evt.type === 'tool_start') {
            const toolLabel =
              evt.tool === 'Bash'
                ? `Running: ${(evt.input || '').slice(0, 80)}`
                : evt.tool === 'Edit'
                  ? `Editing file`
                  : evt.tool === 'Write'
                    ? `Writing file`
                    : evt.tool === 'Read'
                      ? `Reading file`
                      : `Tool: ${evt.tool}`;
            actions.addActivity(sessionId, 'thinking', toolLabel);
            actions.setStatusLine(`${evt.tool}...`);
          } else if (evt.type === 'tool_result') {
            const status = evt.isError ? 'error' : 'done';
            const preview = (evt.output || '').slice(0, 120);
            actions.addActivity(sessionId, status, preview || `Tool ${status}`);
          } else if (evt.type === 'done') {
            const finalText = evt.text || fullResponse;
            if (streamFlushRaf.current) {
              clearTimeout(streamFlushRaf.current);
              streamFlushRaf.current = null;
            }
            streamBufferRef.current = '';
            const cliDoneMeta: Record<string, string> = { route: 'cli' };
            if (evt.model) cliDoneMeta.model = evt.model;
            if (evt.ledgerSessionId) cliDoneMeta.ledgerSessionId = evt.ledgerSessionId;
            if (sendTimeRef.current > 0)
              cliDoneMeta.total_ms = String(Date.now() - sendTimeRef.current);
            if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
              cliDoneMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: finalText,
              timestamp: Date.now(),
              meta: cliDoneMeta,
            });
            actions.setStreamText('');
            actions.setStreaming(false);
            actions.setStatusLine(null);
            actions.addActivity(
              sessionId,
              'done',
              `${isAutoMode ? 'Code' : 'CLI'} complete${evt.model ? ` (${evt.model})` : ''}${evt.cost ? ` \u2014 $${evt.cost.toFixed(4)}` : ''}`,
            );
            setCliContinue(true);
            return;
          } else if (evt.type === 'plan_detected') {
            actions.addActivity(
              sessionId,
              'done',
              `Plan detected: ${evt.taskCount} tasks. Click to hand off to agents.`,
            );
            actions.addMessage(sessionId, {
              role: 'assistant',
              content: `**Plan Ready** — ${evt.taskCount} tasks extracted. Use the handoff button to assign to agents.\n\n${(
                evt.tasks || []
              )
                .map(
                  (
                    t: { title: string; priority: string; suggestedAgent: string | null },
                    i: number,
                  ) =>
                    `${i + 1}. **${t.title}** (${t.priority}${t.suggestedAgent ? ` → ${t.suggestedAgent}` : ''})`,
                )
                .join('\n')}`,
              timestamp: Date.now(),
              meta: {
                type: 'plan_handoff',
                route: 'cli',
                ledgerSessionId: evt.ledgerSessionId,
                planTasks: JSON.stringify(evt.tasks),
                taskCount: String(evt.taskCount),
              },
            });
          } else if (evt.type === 'error') {
            throw new Error(evt.error);
          } else if (evt.type === 'status') {
            actions.addActivity(
              sessionId,
              'thinking',
              `${evt.event}${evt.subtype ? `: ${evt.subtype}` : ''}`,
            );
            actions.setStatusLine(`Claude: ${evt.event || 'processing'}...`);
          } else if (evt.type === 'end') {
            if (fullResponse && !evt.code) {
              if (streamFlushRaf.current) {
                clearTimeout(streamFlushRaf.current);
                streamFlushRaf.current = null;
              }
              streamBufferRef.current = '';
              const cliEndMeta: Record<string, string> = { route: 'cli' };
              if (sendTimeRef.current > 0)
                cliEndMeta.total_ms = String(Date.now() - sendTimeRef.current);
              actions.addMessage(sessionId, {
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
                meta: cliEndMeta,
              });
              actions.setStreamText('');
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
      if (streamFlushRaf.current) {
        clearTimeout(streamFlushRaf.current);
        streamFlushRaf.current = null;
      }
      streamBufferRef.current = '';
      const cliStreamMeta: Record<string, string> = { route: 'cli' };
      if (sendTimeRef.current > 0)
        cliStreamMeta.total_ms = String(Date.now() - sendTimeRef.current);
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
        meta: cliStreamMeta,
      });
      actions.setStreamText('');
      actions.setStreaming(false);
      actions.setStatusLine(null);
      setCliContinue(true);
    }
  } catch (err) {
    if (streamFlushRaf.current) {
      clearTimeout(streamFlushRaf.current);
      streamFlushRaf.current = null;
    }
    streamBufferRef.current = '';
    const errMsg = err instanceof Error ? err.message : 'CLI error';
    if (fullResponse) {
      actions.addMessage(sessionId, {
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
      });
      actions.setStreamText('');
      actions.setStreaming(false);
      actions.setStatusLine(null);
      actions.addActivity(sessionId, 'error', `CLI error: ${errMsg}`);
    } else {
      actions.setStreamText('');
      actions.addActivity(sessionId, 'error', `CLI error: ${errMsg}`);
      throw err;
    }
  }
}
