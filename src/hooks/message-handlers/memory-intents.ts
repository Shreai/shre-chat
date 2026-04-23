import {
  detectMemoryIntent,
  captureMemory,
  forgetMemory,
  listMemories,
} from '../../memoryDetector';

export interface MemoryIntentsProps {
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

export function useMemoryIntents({ actions }: MemoryIntentsProps) {
  const detectAndHandleMemoryIntent = async (text: string, sessionId: string) => {
    const memoryIntent = detectMemoryIntent(text);
    if (!memoryIntent) return false;

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
        default:
          return false;
      }

      if (result.ok) {
        let content = result.message || 'Done.';
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
        return true;
      } else {
        actions.addMessage(sessionId, {
          role: 'assistant',
          content: `Memory error: ${result.error}`,
          timestamp: Date.now(),
          meta: { type: 'system' },
        });
        return true;
      }
    } catch {
      return false;
    }
  };

  return { detectAndHandleMemoryIntent };
}
