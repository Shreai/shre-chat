export type RoleWorkspaceTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  assignee?: string;
};

export type StatusSummary = {
  activeAgents: number;
  pendingTasks: number;
  gatewayConnected: boolean;
} | null;

function buildAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseTaskList(json: unknown): RoleWorkspaceTask[] {
  if (Array.isArray(json)) return json as RoleWorkspaceTask[];
  if (json && typeof json === 'object') {
    const maybeTasks = (json as { tasks?: unknown }).tasks;
    if (Array.isArray(maybeTasks)) return maybeTasks as RoleWorkspaceTask[];
  }
  return [];
}

export async function fetchWorkspaceTasks(
  limit = 8,
  signal?: AbortSignal,
): Promise<RoleWorkspaceTask[]> {
  const res = await fetch(`/api/tasks?limit=${limit}`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error('Could not load tasks');
  }
  const json = await res.json();
  return parseTaskList(json);
}

export async function fetchWorkspaceStatusSummary(): Promise<StatusSummary> {
  const token =
    sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
  const res = await fetch('/api/status-bar', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    activeAgents: json.activeAgents ?? 0,
    pendingTasks: json.pendingTasks ?? 0,
    gatewayConnected: json.gatewayConnected ?? false,
  };
}

export async function createWorkspaceTask(params: {
  activeSessionTitle: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  source?: string;
}): Promise<{ task?: RoleWorkspaceTask } | null> {
  const res = await fetch('/api/tasks/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({
      title: params.title,
      priority: params.priority,
      source: params.source || 'shre-chat',
      description: `Created from ${params.activeSessionTitle}`,
    }),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { task?: RoleWorkspaceTask } | null;
}

export async function updateWorkspaceTask(
  taskId: string,
  updates: Partial<Pick<RoleWorkspaceTask, 'status' | 'priority' | 'title'>>,
): Promise<boolean> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

export async function deleteWorkspaceTask(taskId: string): Promise<boolean> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(),
  });
  return res.ok;
}
