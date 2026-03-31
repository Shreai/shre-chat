/**
 * useFilteredMessages — filters out system/internal messages, injects task badges,
 * provides virtualizer and message-to-run matching.
 */
import { useMemo, useCallback, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '../openclaw';
import type { ProcessRun } from '../components/process-bar/types';

interface UseFilteredMessagesOptions {
  messages: ChatMessage[];
  latestTask: { id: string; status: string } | null;
  runs: ProcessRun[];
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function useFilteredMessages({
  messages,
  latestTask,
  runs,
  scrollRef,
}: UseFilteredMessagesOptions) {
  // Last assistant message content — for SuggestionsBar pattern detection
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content.trim())
        return messages[i].content;
    }
    return '';
  }, [messages]);

  const filteredMessages = useMemo(
    () =>
      messages
        .filter((msg) => {
          if (msg.role !== 'user' && !msg.content.trim()) return false;
          const t = msg.content.trim();
          if (
            t.includes('suggest 3 brief follow-up questions') ||
            t.includes('suggest 3 brief followup')
          )
            return false;
          if (/^\s*\[\s*"/.test(t) && /"\s*\]\s*$/.test(t)) return false;
          if (t.includes('MEMORY CHECKPOINT') || t.includes('MEMORY_CHECKPOINT')) return false;
          if (
            t.startsWith('subagent task') ||
            t.startsWith('[subagent]') ||
            t.startsWith('Subagent result:')
          )
            return false;
          if (
            t.includes('Post-compaction context refresh') ||
            t.includes('Session Startup') ||
            t.includes('Session was just compacted')
          )
            return false;
          if (t.startsWith('System:') || t.startsWith('[System]')) return false;
          if (t.includes('AGENTS.md') || t.includes('Sender (untrusted metadata)')) return false;
          if (t.includes('identity verification') && t.length > 200) return false;
          if (t.includes('You are an AI assistant') && t.includes('session') && t.length > 800)
            return false;
          return true;
        })
        .map((msg) => {
          if (msg.role !== 'user' && msg.content.startsWith('[[reply_to_current]]')) {
            return { ...msg, content: msg.content.replace(/^\[\[reply_to_current\]\]\s*/, '') };
          }
          return msg;
        })
        .map((msg, i, arr) => {
          if (latestTask && msg.role === 'assistant' && i === arr.length - 1) {
            return {
              ...msg,
              meta: { ...msg.meta, taskId: latestTask.id, taskStatus: latestTask.status },
            };
          }
          return msg;
        }),
    [messages, latestTask],
  );

  // Match process runs to assistant messages by timestamp proximity
  const getRunForMessage = useCallback(
    (msg: ChatMessage, _msgIndex: number): ProcessRun | null => {
      if (msg.role === 'user' || !msg.timestamp) return null;
      let best: ProcessRun | null = null;
      let bestDiff = Infinity;
      for (const run of runs) {
        const diff = msg.timestamp - run.startedAt;
        if (diff >= 0 && diff < 300_000 && diff < bestDiff) {
          best = run;
          bestDiff = diff;
        }
      }
      return best;
    },
    [runs],
  );

  // Virtualize at 30+ messages to avoid DOM bloat
  const useVirtual = filteredMessages.length > 30;
  const virtualizer = useVirtualizer({
    count: useVirtual ? filteredMessages.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 15,
    enabled: useVirtual,
  });

  return { filteredMessages, lastAssistantMessage, getRunForMessage, useVirtual, virtualizer };
}
