import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkspaceTask as createWorkspaceTaskRequest,
  deleteWorkspaceTask as deleteWorkspaceTaskRequest,
  fetchWorkspaceStatusSummary,
  fetchWorkspaceTasks,
  updateWorkspaceTask as updateWorkspaceTaskRequest,
  type RoleWorkspaceTask,
  type StatusSummary,
} from '../services/roleWorkspaceApi';

const WORKSPACE_TASKS_KEY = 'shre-workspace-tasks';

function loadStoredWorkspaceTasks(): RoleWorkspaceTask[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_TASKS_KEY);
    return raw ? (JSON.parse(raw) as RoleWorkspaceTask[]) : [];
  } catch {
    return [];
  }
}

function saveStoredWorkspaceTasks(tasks: RoleWorkspaceTask[]) {
  try {
    localStorage.setItem(WORKSPACE_TASKS_KEY, JSON.stringify(tasks));
  } catch {
    /* quota */
  }
}

export interface UseRoleWorkspaceBackendArgs {
  activeSession?: { id: string; title: string } | null;
  onTaskCreated?: (title: string) => void;
}

export interface UseRoleWorkspaceBackendResult {
  workspaceTasks: RoleWorkspaceTask[];
  statusSummary: StatusSummary;
  tasksLoading: boolean;
  tasksError: string | null;
  taskDraftTitle: string;
  setTaskDraftTitle: (title: string) => void;
  taskDraftPriority: 'low' | 'medium' | 'high';
  setTaskDraftPriority: (priority: 'low' | 'medium' | 'high') => void;
  taskSavingId: string | 'new' | null;
  createWorkspaceTask: () => Promise<void>;
  updateWorkspaceTask: (
    taskId: string,
    updates: Partial<Pick<RoleWorkspaceTask, 'status' | 'priority' | 'title'>>,
  ) => Promise<void>;
  deleteWorkspaceTask: (taskId: string) => Promise<void>;
}

export function useRoleWorkspaceBackend({
  activeSession,
  onTaskCreated,
}: UseRoleWorkspaceBackendArgs): UseRoleWorkspaceBackendResult {
  const [workspaceTasks, setWorkspaceTasks] = useState<RoleWorkspaceTask[]>(() =>
    loadStoredWorkspaceTasks(),
  );
  const [statusSummary, setStatusSummary] = useState<StatusSummary>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskDraftTitle, setTaskDraftTitle] = useState('');
  const [taskDraftPriority, setTaskDraftPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskSavingId, setTaskSavingId] = useState<string | 'new' | null>(null);

  const loadWorkspaceTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const list = await fetchWorkspaceTasks(8, controller.signal);
      setWorkspaceTasks(list);
      saveStoredWorkspaceTasks(list);
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : 'Could not load tasks');
    } finally {
      window.clearTimeout(timeout);
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceTasks();
    const interval = window.setInterval(() => {
      void loadWorkspaceTasks();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceTasks]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceStatusSummary()
      .then((json) => {
        if (cancelled || !json) return;
        setStatusSummary(json);
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createWorkspaceTask = useCallback(async () => {
    const title = taskDraftTitle.trim();
    if (!title || !activeSession) return;
    setTaskSavingId('new');
    const tempTask: RoleWorkspaceTask = {
      id: `${Date.now()}`,
      title,
      status: 'todo',
      priority: taskDraftPriority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setWorkspaceTasks((prev) => {
      const next = [tempTask, ...prev].slice(0, 8);
      saveStoredWorkspaceTasks(next);
      return next;
    });
    onTaskCreated?.(title);
    try {
      const payload = await createWorkspaceTaskRequest({
        activeSessionTitle: activeSession.title,
        title,
        priority: taskDraftPriority,
      });
      const remoteId = payload?.task?.id;
      if (remoteId) {
        setWorkspaceTasks((prev) => {
          const next = prev.map((task) =>
            task.id === tempTask.id
              ? {
                  ...task,
                  id: String(remoteId),
                  status: payload?.task?.status || task.status,
                }
              : task,
          );
          saveStoredWorkspaceTasks(next);
          return next;
        });
      }
      setTaskDraftTitle('');
      setTaskDraftPriority('medium');
      await loadWorkspaceTasks();
    } catch {
      /* keep local optimistic task */
    } finally {
      setTaskSavingId(null);
    }
  }, [activeSession, loadWorkspaceTasks, taskDraftPriority, taskDraftTitle]);

  const updateWorkspaceTask = useCallback(
    async (
      taskId: string,
      updates: Partial<Pick<RoleWorkspaceTask, 'status' | 'priority' | 'title'>>,
    ) => {
      setTaskSavingId(taskId);
      setWorkspaceTasks((prev) => {
        const next = prev.map((task) => (task.id === taskId ? { ...task, ...updates } : task));
        saveStoredWorkspaceTasks(next);
        return next;
      });
      try {
        const ok = await updateWorkspaceTaskRequest(taskId, updates);
        if (!ok) return;
        await loadWorkspaceTasks();
      } catch {
        /* keep local update */
      } finally {
        setTaskSavingId(null);
      }
    },
    [loadWorkspaceTasks],
  );

  const deleteWorkspaceTask = useCallback(
    async (taskId: string) => {
      setTaskSavingId(taskId);
      setWorkspaceTasks((prev) => {
        const next = prev.filter((task) => task.id !== taskId);
        saveStoredWorkspaceTasks(next);
        return next;
      });
      try {
        const ok = await deleteWorkspaceTaskRequest(taskId);
        if (!ok) return;
        await loadWorkspaceTasks();
      } catch {
        /* keep local delete */
      } finally {
        setTaskSavingId(null);
      }
    },
    [loadWorkspaceTasks],
  );

  return useMemo(
    () => ({
      workspaceTasks,
      statusSummary,
      tasksLoading,
      tasksError,
      taskDraftTitle,
      setTaskDraftTitle,
      taskDraftPriority,
      setTaskDraftPriority,
      taskSavingId,
      createWorkspaceTask,
      updateWorkspaceTask,
      deleteWorkspaceTask,
    }),
    [
      createWorkspaceTask,
      deleteWorkspaceTask,
      statusSummary,
      taskDraftPriority,
      taskDraftTitle,
      taskSavingId,
      tasksError,
      tasksLoading,
      updateWorkspaceTask,
      workspaceTasks,
    ],
  );
}
