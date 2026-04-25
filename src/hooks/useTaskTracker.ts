/**
 * useTaskTracker — Unified hook that merges polling (useConversationTasks)
 * with real-time WebSocket events (useEscalationListener task events).
 *
 * Provides:
 *  - tasks[]: all tasks for the current session
 *  - tasksByMessageIndex: Map<number, TrackedTask[]> — tasks linked to specific messages
 *  - updateTask(id, patch): PATCH a task (check off, approve, cancel, retry)
 *  - selectedTaskId / setSelectedTaskId: controls the TaskPanel drawer
 *  - subtasks(parentId): fetch subtasks for a parent task
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface TrackedTask {
  id: string;
  title: string;
  status: string;
  agent?: string;
  agent_id?: string;
  priority?: string;
  project_id?: string;
  parent_id?: string;
  session_id?: string;
  quality_score?: number;
  completion_ratio?: number;
  description?: string;
  source?: string;
  depends_on?: string[];
  message_index?: number;
  created_at: number;
  updated_at?: number;
  trace_id?: string;
}

export interface TraceStep {
  name: string;
  status: 'ok' | 'fail' | 'running' | 'pending';
  duration_ms?: number;
  error?: string;
  timestamp?: number;
}

export interface TraceExecutionStep {
  stepId: string;
  order: number;
  type: string;
  title: string;
  status: string;
  taskId?: string;
  error?: string;
  queryText?: string;
}

export interface TaskTraceDetails {
  steps: TraceStep[];
  executionPlan: TraceExecutionStep[];
}

interface RawTaskRecord {
  id?: string;
  title?: string;
  status?: string;
  agent?: string;
  agent_id?: string;
  priority?: string;
  project_id?: string;
  parent_id?: string;
  session_id?: string;
  quality_score?: number;
  completion_ratio?: number;
  description?: string;
  source?: string;
  depends_on?: string[];
  metadata?: { message_index?: number; trace_id?: string };
  created_at?: number;
  updated_at?: number;
  trace_id?: string;
}

interface RequiredTaskFields {
  id: string;
  title: string;
  status: string;
  created_at: number;
}

interface RawTraceSpan {
  name?: string;
  step?: string;
  error?: string;
  endTime?: number;
  startTime?: number;
  duration_ms?: number;
  timestamp?: number;
}

interface RawTraceExecutionStep {
  stepId?: string;
  id?: string;
  order?: number;
  type?: string;
  kind?: string;
  title?: string;
  name?: string;
  status?: string;
  taskId?: string | number;
  error?: string;
  queryText?: string;
}

function isRawTaskRecord(value: unknown): value is RawTaskRecord {
  return !!value && typeof value === 'object';
}

function isTaskRecord(value: unknown): value is RawTaskRecord & RequiredTaskFields {
  return (
    isRawTaskRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.status === 'string' &&
    typeof value.created_at === 'number'
  );
}

function isArrayOfRecords(value: unknown): value is Array<RawTaskRecord & RequiredTaskFields> {
  return Array.isArray(value) && value.every(isTaskRecord);
}

function toTaskArray(data: unknown): Array<RawTaskRecord & RequiredTaskFields> {
  if (Array.isArray(data)) return data.filter(isTaskRecord);
  if (!data || typeof data !== 'object') return [];
  const tasks = (data as { tasks?: unknown }).tasks;
  return isArrayOfRecords(tasks) ? tasks : [];
}

interface UseTaskTrackerOptions {
  sessionId: string | null;
  /** Polling interval in ms (default 30s, reduced to 10s when tasks are active) */
  pollInterval?: number;
}

export function useTaskTracker({ sessionId, pollInterval }: UseTaskTrackerOptions) {
  const [tasks, setTasks] = useState<TrackedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch tasks from shre-tasks API ──
  const fetchTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/tasks?session_id=${encodeURIComponent(sessionId)}&limit=50`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data: unknown = await res.json();
      const rawTasks = toTaskArray(data);
      const list: TrackedTask[] = rawTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agent: t.agent || t.agent_id,
        agent_id: t.agent_id,
        priority: t.priority,
        project_id: t.project_id,
        parent_id: t.parent_id,
        session_id: t.session_id,
        quality_score: t.quality_score,
        completion_ratio: t.completion_ratio,
        description: t.description,
        source: t.source,
        depends_on: t.depends_on,
        message_index: t.metadata?.message_index,
        created_at: t.created_at,
        updated_at: t.updated_at,
        trace_id: t.trace_id || t.metadata?.trace_id,
      }));
      setTasks(list);
    } catch {
      // Network error — keep existing state
    }
  }, [sessionId]);

  // ── Polling ──
  const hasActive = useMemo(
    () => tasks.some((t) => !['done', 'cancelled', 'completed'].includes(t.status)),
    [tasks],
  );
  const effectiveInterval = pollInterval ?? (hasActive ? 10_000 : 30_000);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, effectiveInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTasks, effectiveInterval]);

  // ── WebSocket real-time updates ──
  useEffect(() => {
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws/notifications`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Only handle task-related events
          if (
            data.type === 'project_progress' ||
            data.type === 'task.created' ||
            data.type === 'task.completed' ||
            data.type === 'task.failed' ||
            data.type === 'task.updated'
          ) {
            // If this event is for our session, refetch immediately
            if (!data.sessionId || data.sessionId === sessionId) {
              fetchTasks();
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            connect();
          }
        }, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId, fetchTasks]);

  // ── Update task (check off, approve, cancel, retry) ──
  const updateTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      try {
        const token =
          sessionStorage.getItem('shre-auth-token') ||
          localStorage.getItem('shre-auth-token') ||
          '';
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });
        if (res.status === 409) {
          // Conflict — task was modified by another process, refetch
          fetchTasks();
          return { conflict: true };
        }
        if (!res.ok) return { error: `${res.status}` };
        // Optimistic update
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...patch, updated_at: Date.now() } : t)),
        );
        // Also refetch to get server-computed fields (completion_ratio, etc.)
        setTimeout(fetchTasks, 500);
        return { ok: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
    [fetchTasks],
  );

  // ── Fetch subtasks for a parent ──
  const fetchSubtasks = useCallback(async (parentId: string): Promise<TrackedTask[]> => {
    try {
      const res = await fetch(`/api/tasks?parent_id=${encodeURIComponent(parentId)}&limit=50`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      const rawTasks = toTaskArray(data);
      return rawTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agent: t.agent || t.agent_id,
        priority: t.priority,
        quality_score: t.quality_score,
        completion_ratio: t.completion_ratio,
        created_at: t.created_at,
        updated_at: t.updated_at,
      }));
    } catch {
      return [];
    }
  }, []);

  // ── Fetch trace steps for a task ──
  const fetchTrace = useCallback(async (traceId: string): Promise<TaskTraceDetails> => {
    try {
      const res = await fetch(`/api/router/v1/traces/${encodeURIComponent(traceId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { steps: [], executionPlan: [] };
      const data: unknown = await res.json();
      const trace = (data && typeof data === 'object' ? data : {}) as {
        spans?: RawTraceSpan[];
        steps?: RawTraceSpan[];
        executionPlan?: RawTraceExecutionStep[];
      };
      return {
        steps: (trace.spans || trace.steps || []).map((s) => ({
          name: String(s.name || s.step || 'step'),
          status: s.error ? 'fail' : s.endTime ? 'ok' : s.startTime ? 'running' : 'pending',
          duration_ms:
            s.duration_ms ?? (s.endTime && s.startTime ? s.endTime - s.startTime : undefined),
          error: s.error,
          timestamp: s.startTime || s.timestamp,
        })),
        executionPlan: (trace.executionPlan || []).map((step) => ({
          stepId: String(step.stepId || step.id || `${step.order ?? 0}-${step.title || 'step'}`),
          order: Number(step.order ?? 0),
          type: String(step.type || step.kind || 'step'),
          title: String(step.title || step.name || 'Untitled step'),
          status: String(step.status || 'pending'),
          taskId: step.taskId ? String(step.taskId) : undefined,
          error: step.error ? String(step.error) : undefined,
          queryText: step.queryText ? String(step.queryText) : undefined,
        })),
      };
    } catch {
      return { steps: [], executionPlan: [] };
    }
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const activeTasks = useMemo(
    () => tasks.filter((t) => !['done', 'cancelled', 'completed'].includes(t.status)),
    [tasks],
  );

  const latestTask = tasks.length > 0 ? tasks[0] : null;

  return {
    tasks,
    activeTasks,
    latestTask,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    updateTask,
    fetchSubtasks,
    fetchTrace,
    refetch: fetchTasks,
  };
}
