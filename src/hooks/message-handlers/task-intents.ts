import { mib007Link } from '../../chat-utils';

export interface TaskIntentsProps {
  actions: {
    addMessage: (
      sessionId: string,
      msg: {
        role: 'user' | 'assistant';
        content: string;
        timestamp?: number;
        meta?: Record<string, string>;
      },
    ) => void;
  };
}

export function useTaskIntents({ actions }: TaskIntentsProps) {
  const detectAndHandleTaskQuery = async (text: string, sessionId: string) => {
    const lowerText = text.toLowerCase();
    const isTaskQuery =
      /\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|my\s+(?:tasks?|to-?do\s*list|todos?))\b/i.test(
        lowerText,
      );
    if (!isTaskQuery) return false;

    try {
      const res = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data?.action === 'task_list' && data.tasks) {
        const tasks = data.tasks.slice(0, 10);
        const lines = tasks.map(
          (t: { title: string; priority?: string; status?: string }) =>
            `- **${t.title}**${t.priority === 'high' || t.priority === 'critical' ? ' _(urgent)_' : ''}${t.status ? ` [${t.status}]` : ''}`,
        );
        const content =
          tasks.length === 0
            ? `You're all clear — no pending tasks! [Open Tasks](${mib007Link('tasks')})`
            : `**Your pending tasks (${tasks.length}):**\n${lines.join('\n')}\n\n[View all in MIB007](${mib007Link('tasks')})`;
        actions.addMessage(sessionId, {
          role: 'assistant',
          content,
          timestamp: Date.now(),
          meta: { type: 'system' },
        });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  return { detectAndHandleTaskQuery };
}
