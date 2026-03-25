/**
 * useConversationTasks.ts — Polls shre-tasks for conversation-loop tasks
 * and exposes task info for badge rendering in message bubbles.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface ConversationTask {
  id: string;
  status: string;
  title: string;
  agent?: string;
  session_id?: string;
}

/**
 * Returns conversation-loop tasks for the current session.
 * Polls every 30s when active.
 */
export function useConversationTasks(sessionId: string | null) {
  const [tasks, setTasks] = useState<ConversationTask[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(
        `/api/tasks?session_id=${encodeURIComponent(sessionId)}&source=conversation-loop&limit=20`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data.map((t: any) => ({
          id: t.id,
          status: t.status,
          title: t.title,
          agent: t.agent,
          session_id: t.session_id,
        })));
      }
    } catch (err) { console.debug("fetch conversation tasks", err); }
  }, [sessionId]);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTasks]);

  const latestTask = tasks.length > 0 ? tasks[0] : null;

  return { tasks, latestTask, refetch: fetchTasks };
}
