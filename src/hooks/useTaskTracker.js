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
export function useTaskTracker({ sessionId, pollInterval }) {
    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const intervalRef = useRef(null);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);
    // ── Fetch tasks from shre-tasks API ──
    const fetchTasks = useCallback(async () => {
        if (!sessionId)
            return;
        try {
            const res = await fetch(`/api/tasks?session_id=${encodeURIComponent(sessionId)}&limit=50`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                return;
            const data = await res.json();
            const list = (Array.isArray(data) ? data : data.tasks || []).map((t) => ({
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
        }
        catch {
            // Network error — keep existing state
        }
    }, [sessionId]);
    // ── Polling ──
    const hasActive = useMemo(() => tasks.some((t) => !['done', 'cancelled', 'completed'].includes(t.status)), [tasks]);
    const effectiveInterval = pollInterval ?? (hasActive ? 10_000 : 30_000);
    useEffect(() => {
        fetchTasks();
        intervalRef.current = setInterval(fetchTasks, effectiveInterval);
        return () => {
            if (intervalRef.current)
                clearInterval(intervalRef.current);
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
                    if (data.type === 'project_progress' ||
                        data.type === 'task.created' ||
                        data.type === 'task.completed' ||
                        data.type === 'task.failed' ||
                        data.type === 'task.updated') {
                        // If this event is for our session, refetch immediately
                        if (!data.sessionId || data.sessionId === sessionId) {
                            fetchTasks();
                        }
                    }
                }
                catch {
                    // Ignore parse errors
                }
            };
            ws.onclose = () => {
                if (reconnectRef.current)
                    clearTimeout(reconnectRef.current);
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
    const updateTask = useCallback(async (taskId, patch) => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') ||
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
            if (!res.ok)
                return { error: `${res.status}` };
            // Optimistic update
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch, updated_at: Date.now() } : t)));
            // Also refetch to get server-computed fields (completion_ratio, etc.)
            setTimeout(fetchTasks, 500);
            return { ok: true };
        }
        catch (err) {
            return { error: String(err) };
        }
    }, [fetchTasks]);
    // ── Fetch subtasks for a parent ──
    const fetchSubtasks = useCallback(async (parentId) => {
        try {
            const res = await fetch(`/api/tasks?parent_id=${encodeURIComponent(parentId)}&limit=50`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            return (Array.isArray(data) ? data : data.tasks || []).map((t) => ({
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
        }
        catch {
            return [];
        }
    }, []);
    // ── Fetch trace steps for a task ──
    const fetchTrace = useCallback(async (traceId) => {
        try {
            const res = await fetch(`/api/router/v1/traces/${encodeURIComponent(traceId)}`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            return (data.spans || data.steps || []).map((s) => ({
                name: s.name || s.step,
                status: s.error ? 'fail' : s.endTime ? 'ok' : s.startTime ? 'running' : 'pending',
                duration_ms: s.duration_ms ?? (s.endTime && s.startTime ? s.endTime - s.startTime : undefined),
                error: s.error,
                timestamp: s.startTime || s.timestamp,
            }));
        }
        catch {
            return [];
        }
    }, []);
    const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
    const activeTasks = useMemo(() => tasks.filter((t) => !['done', 'cancelled', 'completed'].includes(t.status)), [tasks]);
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
