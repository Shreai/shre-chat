/**
 * Context building — task context, session context, context anchoring.
 * Extracted from useMessageHandlers.ts handleSend.
 */
import type { ChatMessage } from '../../router-client';
import { mib007Link } from '../../chat-utils';
import {
  buildRuntimeContextPacket,
  type RuntimeEvidenceItem,
  type RuntimeScope,
  type RuntimeContextPacket,
} from '../../runtime-contract';

interface TaskContextItem {
  id?: string;
  title?: string;
  priority?: string;
  assignee?: string;
  status?: string;
}

interface SessionContextData {
  recentSessions?: Array<{
    updated_at: string | number;
    title?: string;
    agent_id?: string;
    messageCount?: number;
  }>;
  voiceSummaries?: Array<{
    created_at: string | number;
    summary?: string;
    agent_id?: string;
  }>;
  recentActions?: Array<{
    created_at: string | number;
    action_type?: string;
    target?: string;
    result?: string;
  }>;
}

/**
 * Anchors short/vague follow-up messages with context from recent conversation.
 * Returns the enriched messageText, or the original if no anchoring is needed.
 */
export function anchorContextIfNeeded(
  text: string,
  sendText: string,
  replyToIndex: number | null,
  filteredMessages: ChatMessage[],
): string {
  if (replyToIndex !== null || filteredMessages.length === 0) return sendText;

  const lower = text.toLowerCase().trim();
  const stripped = lower
    .replace(/^(hey|ok|okay|so|shre|shrey|please|can you|could you|uh|um)\s+/g, '')
    .replace(/[.!?,]+$/g, '')
    .trim();

  const isStatusQuery =
    /^(status|any\s*(status|update|progress)|update\s*(me|us)?|update[s]?|give\s+me\s+(an?\s+)?(status|update|progress)|is\s+(this|that|it)\s+(done|complete|finished|ready|resolved|fixed)|done\s*\??|complete\s*\??|finished\s*\??|what('?s| is)\s+the\s+(status|progress|update)|where\s+(are|did)\s+we\s+(leave|left)\s+(off|this|that)|how('?s| is)\s+(this|that|it)\s+(going|coming|progressing)|catch\s+me\s+up|bring\s+me\s+up\s+to\s+(speed|date)|what('?s| is)\s+(new|happening|going\s+on)|fill\s+me\s+in)$/i.test(
      stripped,
    );
  const isContinue =
    /^(continue|keep\s+going|go\s+on|go\s+ahead|finish\s+(this|that|it)|carry\s+on|resume|pick\s+up\s+where|and\s*\??|then\s*\??|next\s*\??|keep\s+going\s+with\s+(this|that)|finish\s+what\s+you\s+(were|started)|where\s+were\s+we)$/i.test(
      stripped,
    );
  const isRecall =
    /^(show\s+(me\s+)?(that|it)\s+again|repeat\s+that|recall\s+(this|that)\s*(conversation|chat|session)?|the\s+(table|chart|list|query|data|result)\s+(you\s+)?(showed?|gave|returned|generated)|what\s+did\s+(you|we)\s+(say|show|find|get|discuss|talk\s+about)|what\s+was\s+(that|the\s+(result|answer|output))|what\s+were\s+we\s+(talking|discussing)\s+about|remind\s+me\s+(what|where)\s+we\s+(left\s+off|were|discussed)|go\s+back\s+to\s+(that|what\s+we)|summarize\s+(this|our)\s*(conversation|chat|discussion)?)$/i.test(
      stripped,
    );

  if (!isStatusQuery && !isContinue && !isRecall) return sendText;

  const recentPairs: string[] = [];
  let found = 0;
  for (let i = filteredMessages.length - 1; i >= 0 && found < 2; i--) {
    const m = filteredMessages[i];
    if (m.role === 'assistant') {
      const snippet = m.content.replace(/\n/g, ' ').slice(0, 400);
      recentPairs.unshift(`[assistant]: ${snippet}${m.content.length > 400 ? '...' : ''}`);
      if (i > 0 && filteredMessages[i - 1].role === 'user') {
        const uSnip = filteredMessages[i - 1].content.replace(/\n/g, ' ').slice(0, 200);
        recentPairs.unshift(
          `[user]: ${uSnip}${filteredMessages[i - 1].content.length > 200 ? '...' : ''}`,
        );
      }
      found++;
    }
  }

  if (recentPairs.length === 0) return sendText;

  const contextBlock = recentPairs.join('\n');
  if (isStatusQuery) {
    return `[Context — the user is asking for a status update on what was recently discussed. Review the conversation and determine if the task/topic was completed or left unfinished. Give a clear status.]\n\nRecent discussion:\n${contextBlock}\n\nUser's question: ${text}`;
  } else if (isContinue) {
    return `[Context — the user wants you to continue or finish what you were doing. Pick up exactly where you left off.]\n\nYour last response:\n${contextBlock}\n\nUser: ${text}`;
  } else {
    return `[Context — the user is asking you to recall or repeat something from earlier in this conversation. Find the relevant content in the conversation history and present it again.]\n\nRecent discussion:\n${contextBlock}\n\nUser: ${text}`;
  }
}

/**
 * Fetch task + cross-session context in parallel.
 * Returns { taskContext, sessionContext, contextHealth }.
 */
export async function fetchContextSources(sessionId: string): Promise<{
  taskContext: string;
  sessionContext: string;
  contextHealth: Record<string, 'ok' | 'missing' | 'error'>;
}> {
  let taskContext = '';
  let sessionContext = '';
  const contextHealth: Record<string, 'ok' | 'missing' | 'error'> = {
    tasks: 'missing',
    crossSession: 'missing',
  };

  const contextSignal = AbortSignal.timeout(3000);
  const [taskResult, sessionResult] = await Promise.allSettled([
    fetch(`/api/tasks?since=${Date.now() - 7 * 24 * 60 * 60 * 1000}&limit=50`, {
      signal: contextSignal,
    }),
    fetch('/api/chat-sessions/recent-context', { signal: contextSignal }),
  ]);

  // Build task context
  try {
    if (taskResult.status === 'fulfilled' && taskResult.value.ok) {
      const taskData = await taskResult.value.json();
      const tasks: TaskContextItem[] = Array.isArray(taskData)
        ? taskData
        : taskData?.tasks || taskData?.data || [];
      if (tasks.length > 0) {
        const byStatus: Record<string, TaskContextItem[]> = {};
        for (const t of tasks) {
          (byStatus[t.status || 'unknown'] ??= []).push(t);
        }
        const sections: string[] = [];
        for (const [status, items] of Object.entries(byStatus)) {
          const list = items
            .slice(0, 20)
            .map((t) => {
              const id = t.id ? ` (ID: ${t.id})` : '';
              const priority = t.priority ? ` [${t.priority}]` : '';
              const assignee = t.assignee ? ` \u2192 ${t.assignee}` : '';
              return `  - ${t.title || 'Untitled'}${id}${priority}${assignee}`;
            })
            .join('\n');
          sections.push(`[${status}] (${items.length}):\n${list}`);
        }
        taskContext = `\n\nTasks from last 7 days (${tasks.length} total):\n${sections.join('\n')}\nLink: [View Tasks](${mib007Link('tasks')}) | [View Issues](${mib007Link('issues')})`;
      }
      contextHealth.tasks = 'ok';
    } else if (taskResult.status === 'fulfilled') {
      contextHealth.tasks = 'error';
    } else {
      contextHealth.tasks = 'error';
    }
  } catch (err) {
    console.debug('build task context', err);
    contextHealth.tasks = 'error';
  }

  // Build cross-session context
  try {
    if (sessionResult.status === 'fulfilled' && sessionResult.value.ok) {
      const ctxData = (await sessionResult.value.json()) as SessionContextData;
      const parts: string[] = [];
      if (ctxData.recentSessions?.length) {
        parts.push(
          'Recent conversations:\n' +
            ctxData.recentSessions
              .map(
                (s) =>
                  `  - [${new Date(s.updated_at).toLocaleDateString()}] "${s.title}" (${s.agent_id || 'shre'}, ${s.messageCount || '?'} messages)`,
              )
              .join('\n'),
        );
      }
      if (ctxData.voiceSummaries?.length) {
        parts.push(
          'Recent voice sessions:\n' +
            ctxData.voiceSummaries
              .map(
                (v) =>
                  `  - [${new Date(v.created_at).toLocaleDateString()}] ${v.summary || 'No summary'} (${v.agent_id || 'shre'})`,
              )
              .join('\n'),
        );
      }
      if (ctxData.recentActions?.length) {
        parts.push(
          'Recent actions taken:\n' +
            ctxData.recentActions
              .map(
                (a) =>
                  `  - [${new Date(a.created_at).toLocaleDateString()}] ${a.action_type}: ${a.target || a.result || ''}`,
              )
              .join('\n'),
        );
      }
      if (parts.length) {
        sessionContext = `\n\nPrevious Context (for continuity \u2014 reference these when user mentions past discussions):\n${parts.join('\n')}`;
      }
      contextHealth.crossSession = 'ok';
    } else if (sessionResult.status === 'fulfilled') {
      contextHealth.crossSession = 'error';
    } else {
      contextHealth.crossSession = 'error';
    }
  } catch (err) {
    console.debug('build cross-session context', err);
    contextHealth.crossSession = 'error';
  }

  // Auto-create support task on context fetch failure
  if (contextHealth.tasks === 'error' || contextHealth.crossSession === 'error') {
    const failedSources = Object.entries(contextHealth)
      .filter(([, v]) => v === 'error')
      .map(([k]) => k);
    fetch('/api/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Context fetch failed: ${failedSources.join(', ')}`,
        description: `Client-side context sources failed during chat assembly.\nFailed: ${failedSources.join(', ')}\nSession: ${sessionId}\nTimestamp: ${new Date().toISOString()}`,
        priority: 'low',
        tags: ['context.fetch.failed', 'auto-created'],
      }),
    }).catch(() => {
      void 0;
    });
  }

  return { taskContext, sessionContext, contextHealth };
}

export function buildScopedRuntimePacket(
  scope: RuntimeScope,
  sources: {
    taskContext: string;
    sessionContext: string;
    contextHealth: Record<string, 'ok' | 'missing' | 'error'>;
  },
): RuntimeContextPacket {
  const evidence: RuntimeEvidenceItem[] = [];
  if (sources.taskContext.trim()) {
    evidence.push({
      source: 'task_context',
      text: sources.taskContext.trim(),
    });
  }
  if (sources.sessionContext.trim()) {
    evidence.push({
      source: 'session_context',
      text: sources.sessionContext.trim(),
    });
  }

  return buildRuntimeContextPacket(scope, evidence);
}
