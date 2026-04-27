import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Files,
  FolderKanban,
  MessageSquareMore,
  Plus,
  Sparkles,
  ShieldCheck,
  TriangleAlert,
  Moon,
  UserRound,
  SunMedium,
  WandSparkles,
} from 'lucide-react';
import { useApp, uid, type FeedEntry, type ActivityEvent } from './store';
import { ChatView } from './ChatView';
import {
  getLoginTypeAccent,
  getLoginTypeCopy,
  getShellMode,
  normalizeLoginType,
  type LoginType,
} from './login-types';

type AuthLike = {
  username: string;
  name: string;
  role?: string;
  loginType?: string;
};

type WorkspaceLike = {
  id: string;
  name: string;
  role?: string;
  loginType?: string;
} | null;

type WorkspaceTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  assignee?: string;
};

const WORKSPACE_TASKS_KEY = 'shre-workspace-tasks';

function loadStoredWorkspaceTasks(): WorkspaceTask[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_TASKS_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceTask[]) : [];
  } catch {
    return [];
  }
}

function saveStoredWorkspaceTasks(tasks: WorkspaceTask[]) {
  try {
    localStorage.setItem(WORKSPACE_TASKS_KEY, JSON.stringify(tasks));
  } catch {
    /* quota */
  }
}

function resolveLoginType(
  authUser: AuthLike,
  activeWorkspace?: WorkspaceLike,
  override?: LoginType | null,
): LoginType {
  const params = new URLSearchParams(window.location.search);
  return normalizeLoginType(
    override ||
      params.get('shellLoginType') ||
      authUser.loginType ||
      activeWorkspace?.loginType ||
      params.get('loginType') ||
      params.get('role') ||
      authUser.role ||
      activeWorkspace?.role,
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function statusLabel(status?: ActivityEvent['status']): string {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'thinking':
      return 'Thinking';
    case 'planning':
      return 'Planning';
    case 'writing':
      return 'Writing';
    case 'researching':
      return 'Researching';
    case 'executing':
      return 'Executing';
    case 'tool_call':
      return 'Tool call';
    case 'done':
      return 'Done';
    case 'attention':
      return 'Attention';
    case 'warning':
      return 'Warning';
    case 'error':
      return 'Error';
    default:
      return 'Active';
  }
}

function statusTone(status?: ActivityEvent['status']): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300';
    case 'warning':
    case 'attention':
      return 'bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-300';
    case 'error':
      return 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300';
    default:
      return 'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300';
  }
}

function feedTypeLabel(type: FeedEntry['type']): string {
  switch (type) {
    case 'sent':
      return 'Sent';
    case 'routed':
      return 'Routed';
    case 'streaming':
      return 'Streaming';
    case 'received':
      return 'Received';
    case 'error':
      return 'Error';
    case 'fallback':
      return 'Fallback';
    case 'gateway':
      return 'Gateway';
    case 'system':
      return 'System';
    case 'tool_result':
      return 'Tool result';
    default:
      return 'Event';
  }
}

function roleActionSet(mode: 'dev' | 'qa' | 'customer') {
  if (mode === 'dev') {
    return [
      { label: 'Need logs', icon: FileText, status: 'attention' as const },
      { label: 'Fix ready', icon: CheckCircle2, status: 'done' as const },
      { label: 'Escalate', icon: TriangleAlert, status: 'warning' as const },
    ];
  }
  if (mode === 'qa') {
    return [
      { label: 'Reproduced', icon: CheckCircle2, status: 'done' as const },
      { label: 'Blocked', icon: TriangleAlert, status: 'warning' as const },
      { label: 'Passed', icon: ShieldCheck, status: 'done' as const },
    ];
  }
  return [
    { label: 'Need details', icon: FileText, status: 'attention' as const },
    { label: 'Reply sent', icon: MessageSquareMore, status: 'done' as const },
    { label: 'Resolved', icon: CheckCircle2, status: 'done' as const },
  ];
}

export function RoleWorkspaceView({
  authUser,
  activeWorkspace,
  onLogout,
}: {
  authUser: AuthLike;
  activeWorkspace?: WorkspaceLike;
  onLogout: () => void;
}) {
  const { state, actions } = useApp();
  const { sessions, activeSessionId, activity, feed, files, theme } = state;
  const [shellLoginTypeOverride, setShellLoginTypeOverride] = useState<LoginType | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('shellLoginType');
    return initial ? normalizeLoginType(initial) : null;
  });
  const [menuPanel, setMenuPanel] = useState<'sessions' | 'tasks' | 'feed' | 'agents'>('sessions');
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTask[]>(() =>
    loadStoredWorkspaceTasks(),
  );
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskDraftTitle, setTaskDraftTitle] = useState('');
  const [taskDraftPriority, setTaskDraftPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskSavingId, setTaskSavingId] = useState<string | 'new' | null>(null);
  const [statusSummary, setStatusSummary] = useState<{
    activeAgents: number;
    pendingTasks: number;
    gatewayConnected: boolean;
  } | null>(null);
  const loginType = resolveLoginType(authUser, activeWorkspace, shellLoginTypeOverride);
  const shellMode = getShellMode(loginType);
  const copy = getLoginTypeCopy(loginType);
  const accent = getLoginTypeAccent(loginType);
  const isCustomerFacing = shellMode === 'customer';
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900,
  );

  useEffect(() => {
    document.title = `Shre Chat | ${copy.label}`;
  }, [copy.label]);

  useEffect(() => {
    setMobileSessionsOpen(false);
  }, [activeSessionId]);

  useEffect(() => {
    let cancelled = false;
    const token =
      sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
    fetch('/api/status-bar', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setStatusSummary({
          activeAgents: json.activeAgents ?? 0,
          pendingTasks: json.pendingTasks ?? 0,
          gatewayConnected: json.gatewayConnected ?? false,
        });
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateCompact = () => {
      setIsCompactViewport(window.innerWidth < 900);
    };
    updateCompact();
    window.addEventListener('resize', updateCompact);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateCompact);
    return () => {
      window.removeEventListener('resize', updateCompact);
      vv?.removeEventListener('resize', updateCompact);
    };
  }, []);

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;
  }, [activeSessionId, sessions]);

  const sessionFeed = useMemo(() => {
    if (!activeSession) return [];
    return [...feed]
      .filter((entry) => entry.sessionId === activeSession.id)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  }, [activeSession, feed]);

  const sessionActivity = useMemo(() => {
    if (!activeSession) return [];
    return [...activity]
      .filter((entry) => entry.sessionId === activeSession.id)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [activeSession, activity]);

  const sessionFiles = useMemo(() => {
    if (!activeSession) return [];
    return files
      .filter((file) => file.sessionId === activeSession.id)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .slice(0, 4);
  }, [activeSession, files]);

  const queueCount = state.queue.length;
  const activeAgentsCount = statusSummary?.activeAgents ?? 0;
  const pendingTasksCount = statusSummary?.pendingTasks ?? queueCount;
  const showLeftRail = !isCompactViewport;
  const showContextRail = !isCustomerFacing && !isCompactViewport;

  const recentSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  }, [sessions]);

  const recentTasks = useMemo(() => {
    return [...workspaceTasks]
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [workspaceTasks]);

  const quickActions = roleActionSet(shellMode);

  const authHeaders = useCallback(() => {
    const token =
      sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadWorkspaceTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch('/api/tasks?limit=8', {
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) {
        setTasksError('Could not load tasks');
        return;
      }
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.tasks || [];
      setWorkspaceTasks(list);
      saveStoredWorkspaceTasks(list);
    } catch {
      setTasksError(null);
    } finally {
      window.clearTimeout(timeout);
      setTasksLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadWorkspaceTasks();
    const interval = window.setInterval(() => {
      void loadWorkspaceTasks();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceTasks]);

  const createWorkspaceTask = useCallback(async () => {
    const title = taskDraftTitle.trim();
    if (!title || !activeSession) return;
    setTaskSavingId('new');
    const tempTask: WorkspaceTask = {
      id: uid(),
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
    actions.addFeed(activeSession.id, 'system', `Task created: ${title}`, {
      loginType: shellMode,
      surface: shellMode === 'customer' ? 'beta-production' : shellMode,
    });
    actions.setStatusLine(`Task created: ${title}`);
    try {
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          title,
          priority: taskDraftPriority,
          source: 'shre-chat',
          description: `Created from ${activeSession.title}`,
        }),
      });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
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
  }, [
    activeSession,
    actions,
    authHeaders,
    loadWorkspaceTasks,
    shellMode,
    taskDraftPriority,
    taskDraftTitle,
  ]);

  const updateWorkspaceTask = useCallback(
    async (
      taskId: string,
      updates: Partial<Pick<WorkspaceTask, 'status' | 'priority' | 'title'>>,
    ) => {
      setTaskSavingId(taskId);
      setWorkspaceTasks((prev) => {
        const next = prev.map((task) => (task.id === taskId ? { ...task, ...updates } : task));
        saveStoredWorkspaceTasks(next);
        return next;
      });
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify(updates),
        });
        if (!res.ok) return;
        await loadWorkspaceTasks();
      } catch {
        /* keep local update */
      } finally {
        setTaskSavingId(null);
      }
    },
    [authHeaders, loadWorkspaceTasks],
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
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) return;
        await loadWorkspaceTasks();
      } catch {
        /* keep local delete */
      } finally {
        setTaskSavingId(null);
      }
    },
    [authHeaders, loadWorkspaceTasks],
  );
  const menuItems = isCustomerFacing
    ? [
        { key: 'sessions', label: 'Sessions', value: sessions.length },
        { key: 'tasks', label: 'Tasks', value: pendingTasksCount },
        { key: 'agents', label: 'Agents', value: activeAgentsCount },
      ]
    : [
        { key: 'sessions', label: 'Sessions', value: sessions.length },
        { key: 'tasks', label: 'Tasks', value: pendingTasksCount },
        { key: 'feed', label: 'Feed', value: sessionFeed.length },
        { key: 'agents', label: 'Agents', value: activeAgentsCount },
      ];

  useEffect(() => {
    if (isCustomerFacing && menuPanel === 'feed') {
      setMenuPanel('sessions');
    }
  }, [isCustomerFacing, menuPanel]);

  const setShellLoginType = useCallback((type: LoginType) => {
    setShellLoginTypeOverride(type);
    const params = new URLSearchParams(window.location.search);
    params.set('shellLoginType', type);
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  const runQuickAction = (label: string, status: ActivityEvent['status']) => {
    if (!activeSession) return;
    actions.addActivity(activeSession.id, status, label);
    actions.addFeed(activeSession.id, 'system', label, {
      loginType: shellMode,
      surface: shellMode === 'customer' ? 'beta-production' : shellMode,
    });
    actions.setStatusLine(label);
  };

  const onNewCase = () => {
    const id = actions.newSession();
    actions.switchSession(id);
    actions.setView('chat');
  };

  const shellTitle = shellMode === 'customer' ? 'Customer' : copy.label;
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode';

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div
        className="h-full min-h-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(79,110,220,0.12), transparent 34%), linear-gradient(180deg, #f7f6f2 0%, #f3f2ee 40%, #efede7 100%)',
          color: 'var(--c-text-1)',
        }}
      >
        <div
          className={[
            'h-full min-h-0 grid grid-cols-1 gap-4 p-4 lg:p-5',
            showContextRail
              ? 'lg:grid-cols-[320px_minmax(0,1fr)_340px]'
              : 'lg:grid-cols-[320px_minmax(0,1fr)]',
          ].join(' ')}
        >
          {showLeftRail && (
            <aside className="hidden lg:flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 pb-1">
              <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      Shre Chat
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{shellTitle}</h1>
                    <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => actions.toggleTheme()}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                      title={themeLabel}
                      aria-label={themeLabel}
                    >
                      {theme === 'dark' ? (
                        <SunMedium className="h-3.5 w-3.5" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                      {theme === 'dark' ? 'Light' : 'Dark'}
                    </button>
                    <button
                      onClick={onLogout}
                      type="button"
                      className="rounded-full border border-black/5 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                {isCustomerFacing ? (
                  <div className="mt-4 rounded-3xl border border-black/5 bg-slate-50 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Access
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>Beta / Production</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                        {activeWorkspace?.name || 'Default workspace'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Mode
                      </div>
                      <div className="mt-1 text-sm font-semibold">{copy.label}</div>
                    </div>
                    <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Workspace
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold">
                        {activeWorkspace?.name || 'Default'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Cases
                      </div>
                      <div className="mt-1 text-sm font-semibold">{sessions.length}</div>
                    </div>
                  </div>
                )}

                {!isCustomerFacing && (
                  <div className="mt-4 rounded-3xl border border-black/5 bg-slate-50 px-3 py-3">
                    <label className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Login mode
                    </label>
                    <div className="mt-2">
                      <select
                        value={loginType}
                        onChange={(event) => setShellLoginType(event.target.value as LoginType)}
                        className="w-full rounded-2xl border border-black/5 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-black/10 focus:bg-white"
                        style={{ minHeight: 44 }}
                      >
                        <option value="dev">Dev</option>
                        <option value="qa">QA</option>
                        <option value="beta">Beta</option>
                        <option value="production">Production</option>
                      </select>
                    </div>
                  </div>
                )}

                <button
                  onClick={onNewCase}
                  type="button"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  New case
                </button>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4 min-h-0 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Menu</div>
                    <div className="text-xs text-slate-500">Communication first</div>
                  </div>
                  <span className="rounded-full border border-black/5 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                    {menuPanel}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {menuItems.map((item) => {
                    const active = menuPanel === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setMenuPanel(item.key as typeof menuPanel)}
                        className={[
                          'rounded-2xl border px-3 py-3 text-left transition',
                          active
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-black/5 bg-slate-50 text-slate-700 hover:bg-white',
                        ].join(' ')}
                        style={{ backgroundColor: active ? accent : undefined }}
                      >
                        <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">
                          {item.label}
                        </div>
                        <div className="mt-1 text-base font-semibold">{item.value}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                  {menuPanel === 'sessions' &&
                    recentSessions.map((session) => {
                      const lastMessage = session.messages[session.messages.length - 1];
                      const preview =
                        lastMessage?.content?.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim() ||
                        'No activity yet';
                      const isActive = session.id === activeSession?.id;
                      return (
                        <button
                          key={session.id}
                          onClick={() => {
                            actions.switchSession(session.id);
                            actions.setView('chat');
                          }}
                          className={[
                            'group w-full rounded-3xl border p-4 text-left transition',
                            isActive
                              ? 'border-transparent bg-slate-950 text-white shadow-[0_20px_40px_rgba(15,23,42,0.22)]'
                              : 'border-black/5 bg-slate-50/90 text-slate-800 hover:bg-white',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-xs font-semibold text-slate-700">
                                  {session.title.slice(0, 1).toUpperCase()}
                                </span>
                                <div className="truncate text-sm font-semibold">
                                  {session.title}
                                </div>
                              </div>
                              <p
                                className={[
                                  'mt-2 line-clamp-2 text-xs leading-5',
                                  isActive ? 'text-slate-200' : 'text-slate-500',
                                ].join(' ')}
                              >
                                {preview}
                              </p>
                            </div>
                            <span
                              className={[
                                'shrink-0 rounded-full px-2 py-1 text-[10px] font-medium',
                                isActive ? 'bg-white/15 text-white' : 'bg-white text-slate-500',
                              ].join(' ')}
                            >
                              {formatRelativeTime(session.updatedAt)}
                            </span>
                          </div>
                        </button>
                      );
                    })}

                  {menuPanel === 'tasks' && (
                    <div className="space-y-3">
                      <div className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Task list
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {tasksLoading ? '...' : recentTasks.length}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Create and update the live task list without leaving the conversation.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-black/5 bg-white p-4">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Create task
                        </div>
                        <div className="mt-3 space-y-2">
                          <input
                            value={taskDraftTitle}
                            onChange={(e) => setTaskDraftTitle(e.target.value)}
                            placeholder="Add a task"
                            className="w-full rounded-2xl border border-black/5 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-black/10 focus:bg-white"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={taskDraftPriority}
                              onChange={(e) =>
                                setTaskDraftPriority(e.target.value as 'low' | 'medium' | 'high')
                              }
                              className="min-w-0 flex-1 rounded-2xl border border-black/5 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-black/10 focus:bg-white"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                            <button
                              type="button"
                              disabled={!taskDraftTitle.trim() || taskSavingId === 'new'}
                              onClick={() => void createWorkspaceTask()}
                              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Plus className="h-4 w-4" />
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                      {tasksError && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                          {tasksError}
                        </div>
                      )}
                      <div className="space-y-2">
                        {recentTasks.length === 0 && !tasksLoading && (
                          <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                            No tasks yet. Add one to start the list.
                          </div>
                        )}
                        {recentTasks.map((task) => {
                          const busy = taskSavingId === task.id;
                          return (
                            <div
                              key={task.id}
                              className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">{task.title}</div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                    <span>{task.status}</span>
                                    {task.priority && <span>{task.priority}</span>}
                                    {task.updated_at && (
                                      <span>
                                        {formatRelativeTime(new Date(task.updated_at).getTime())}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void deleteWorkspaceTask(task.id)}
                                  className="rounded-full border border-black/5 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy || task.status === 'in_progress'}
                                  onClick={() =>
                                    void updateWorkspaceTask(task.id, { status: 'in_progress' })
                                  }
                                  className="rounded-full border border-black/5 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Start
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || task.status === 'done'}
                                  onClick={() =>
                                    void updateWorkspaceTask(task.id, { status: 'done' })
                                  }
                                  className="rounded-full border border-black/5 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Mark done
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Shortcuts
                        </div>
                        <div className="mt-3 space-y-2">
                          {quickActions.map((action) => {
                            const Icon = action.icon;
                            return (
                              <button
                                key={action.label}
                                type="button"
                                disabled={!activeSession}
                                onClick={() => runQuickAction(action.label, action.status)}
                                className="flex w-full items-center justify-between rounded-2xl border border-black/5 bg-white px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  {action.label}
                                </span>
                                <ArrowRight className="h-4 w-4 text-slate-400" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {menuPanel === 'feed' &&
                    sessionFeed.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                {feedTypeLabel(entry.type)}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatRelativeTime(entry.timestamp)}
                              </span>
                            </div>
                            <div className="mt-2 text-sm font-medium">{entry.message}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                      </div>
                    ))}

                  {menuPanel === 'agents' && (
                    <div className="space-y-3">
                      <div className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Active agents
                        </div>
                        <div className="mt-1 text-2xl font-semibold">{activeAgentsCount}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {statusSummary?.gatewayConnected
                            ? 'Gateway is connected and routing is live.'
                            : 'Gateway is disconnected. Some live panels may lag.'}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Current agent
                        </div>
                        <div className="mt-1 text-base font-semibold">{currentAgent.name}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {shellMode === 'customer' ? 'Customer-facing surface' : copy.description}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}

          <main className="min-h-0 min-w-0 flex flex-col gap-4">
            <div className="lg:hidden rounded-[24px] border border-black/5 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                    Shre Chat
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-[-0.04em]">{shellTitle}</div>
                </div>
                <button
                  onClick={onNewCase}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-xs font-medium text-white"
                  style={{ minHeight: 44 }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New case
                </button>
                <button
                  onClick={() => actions.toggleTheme()}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/5 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-700"
                  style={{ minHeight: 44 }}
                  title={themeLabel}
                  aria-label={themeLabel}
                >
                  {theme === 'dark' ? (
                    <SunMedium className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                  {theme === 'dark' ? 'Light' : 'Dark'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isCustomerFacing ? (
                  <>
                    <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                      Beta / Production
                    </span>
                    <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                      {activeWorkspace?.name || 'Default workspace'}
                    </span>
                  </>
                ) : (
                  <>
                    {(['dev', 'qa', 'beta', 'production'] as LoginType[]).map((type) => {
                      const active = type === loginType;
                      const isCustomer = type === 'beta' || type === 'production';
                      const label = isCustomer
                        ? type[0].toUpperCase() + type.slice(1)
                        : type.toUpperCase();
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setShellLoginType(type)}
                          className={[
                            'rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition',
                            active
                              ? 'border-transparent text-white shadow-sm'
                              : 'border-black/5 bg-slate-50 text-slate-600 hover:bg-slate-100',
                          ].join(' ')}
                          style={{ backgroundColor: active ? accent : undefined }}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                      {activeWorkspace?.name || 'Default workspace'}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    Mobile cases
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileSessionsOpen((value) => !value)}
                    className="rounded-full border border-black/5 bg-slate-50 px-3.5 py-2 text-[12px] font-medium text-slate-700"
                    style={{ minHeight: 44 }}
                  >
                    {mobileSessionsOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(mobileSessionsOpen ? recentSessions : recentSessions.slice(0, 3)).map(
                    (session) => {
                      const isActive = session.id === activeSession?.id;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            actions.switchSession(session.id);
                            actions.setView('chat');
                            setMobileSessionsOpen(false);
                          }}
                          className={[
                            'shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-medium transition',
                            isActive
                              ? 'border-transparent text-white shadow-sm'
                              : 'border-black/5 bg-slate-50 text-slate-600 hover:bg-slate-100',
                          ].join(' ')}
                          style={{ minHeight: 44, backgroundColor: isActive ? accent : undefined }}
                        >
                          {session.title}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {!isCustomerFacing && (
                <div className="mt-3 rounded-[20px] border border-black/5 bg-white p-3 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    Login mode
                  </div>
                  <select
                    value={loginType}
                    onChange={(event) => setShellLoginType(event.target.value as LoginType)}
                    className="mt-2 w-full rounded-2xl border border-black/5 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-black/10 focus:bg-white"
                    style={{ minHeight: 44 }}
                  >
                    <option value="dev">Dev</option>
                    <option value="qa">QA</option>
                    <option value="beta">Beta</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              )}

              <div className="mt-3 rounded-[20px] border border-black/5 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Mobile actions
                    </div>
                    <div className="mt-1 text-sm font-semibold">Quick actions</div>
                  </div>
                  <WandSparkles className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        disabled={!activeSession}
                        onClick={() => runQuickAction(action.label, action.status)}
                        className="flex items-center justify-between rounded-2xl border border-black/5 bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ minHeight: 44 }}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {action.label}
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[32px] border border-black/5 bg-white/88 shadow-[0_24px_70px_rgba(15,23,42,0.1)] backdrop-blur-xl">
              <div
                className={[
                  'grid h-full min-h-0 grid-cols-1',
                  showContextRail ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-1',
                ].join(' ')}
              >
                <div className="min-h-0 min-w-0">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        Loading chat workspace...
                      </div>
                    }
                  >
                    <ChatView simplified={isCustomerFacing || isCompactViewport} />
                  </Suspense>
                </div>

                {showContextRail && (
                  <section className="hidden xl:flex min-h-0 flex-col border-l border-black/5 bg-[rgba(248,247,243,0.88)] p-4 overflow-y-auto overscroll-contain">
                    {isCustomerFacing ? (
                      <>
                        <div className="rounded-[26px] border border-black/5 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
                                Active case
                              </div>
                              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                                {activeSession?.title || 'New chat'}
                              </h2>
                              <p className="mt-1 text-sm text-slate-500">
                                {activeSession
                                  ? `${activeSession.messages.length} messages, last updated ${formatClock(activeSession.updatedAt)}`
                                  : 'Open or create a case to see details.'}
                              </p>
                            </div>
                            <div className="rounded-full border border-black/5 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                              {shellTitle}
                            </div>
                          </div>
                          <div className="mt-4 rounded-2xl border border-black/5 bg-slate-50 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              Status
                            </div>
                            <div className="mt-1 text-sm font-semibold">
                              {statusLabel(sessionActivity[0]?.status)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 rounded-[26px] border border-black/5 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">Recent feed</div>
                            <FolderKanban className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="mt-3 space-y-3 overflow-auto pr-1">
                            {sessionFeed.length === 0 && (
                              <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                                Activity cards will appear here once the conversation starts moving.
                              </div>
                            )}
                            {sessionFeed.map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                        {feedTypeLabel(entry.type)}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {formatRelativeTime(entry.timestamp)}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-sm font-medium">{entry.message}</div>
                                  </div>
                                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-[26px] border border-black/5 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
                                Active case
                              </div>
                              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                                {activeSession?.title || 'New chat'}
                              </h2>
                              <p className="mt-1 text-sm text-slate-500">
                                {activeSession
                                  ? `${activeSession.messages.length} messages, last updated ${formatClock(activeSession.updatedAt)}`
                                  : 'Open or create a case to see details.'}
                              </p>
                            </div>
                            <div className="rounded-full border border-black/5 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                              {shellTitle}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                Status
                              </div>
                              <div className="mt-1 text-sm font-semibold">
                                {statusLabel(sessionActivity[0]?.status)}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                Files
                              </div>
                              <div className="mt-1 text-sm font-semibold">
                                {sessionFiles.length}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                Feed
                              </div>
                              <div className="mt-1 text-sm font-semibold">{sessionFeed.length}</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 rounded-[26px] border border-black/5 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">Timeline</div>
                            <Clock3 className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="mt-3 space-y-3 overflow-auto pr-1">
                            {sessionActivity.length === 0 && (
                              <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                                No activity yet. Use the quick actions to add the first update.
                              </div>
                            )}
                            {sessionActivity.map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold">
                                      {statusLabel(entry.status)}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {entry.summary}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      'shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium',
                                      statusTone(entry.status),
                                    ].join(' ')}
                                  >
                                    {formatRelativeTime(entry.timestamp)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 rounded-[26px] border border-black/5 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">Files</div>
                            <Files className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="mt-3 space-y-2">
                            {sessionFiles.length === 0 && (
                              <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                                Files and screenshots for this case appear here.
                              </div>
                            )}
                            {sessionFiles.map((file) => (
                              <div
                                key={file.id}
                                className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="rounded-2xl bg-white p-2 text-slate-500 shadow-sm">
                                    <FileText className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{file.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {Math.round(file.size / 1024)} KB
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                )}
              </div>
            </div>
          </main>

          {showContextRail && (
            <aside className="hidden lg:flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 pb-1">
              <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Case details
                    </div>
                    <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                      {activeSession?.title || 'New chat'}
                    </h2>
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-xs font-medium text-white shadow-sm"
                    style={{ backgroundColor: accent }}
                  >
                    {copy.label}
                  </div>
                </div>
                <div className="mt-4 rounded-3xl border border-black/5 bg-slate-50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Audience
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {shellMode === 'customer' ? 'Beta / Production' : copy.label}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{copy.description}</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Quick actions</div>
                    <div className="text-xs text-slate-500">Role-aware shortcuts</div>
                  </div>
                  <WandSparkles className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-3 space-y-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        disabled={!activeSession}
                        onClick={() => runQuickAction(action.label, action.status)}
                        className="flex w-full items-center justify-between rounded-2xl border border-black/5 bg-slate-50 px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {action.label}
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {shellMode !== 'customer' && (
                <>
                  <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4 min-h-0 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Session summary</div>
                        <div className="text-xs text-slate-500">Current conversation context</div>
                      </div>
                      <UserRound className="h-4 w-4 text-slate-500" />
                    </div>

                    <div className="mt-4 space-y-3 overflow-auto pr-1">
                      <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Owner
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {authUser.name}{' '}
                          <span className="text-slate-500">({authUser.username})</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Conversations
                        </div>
                        <div className="mt-1 text-sm font-medium">{sessions.length}</div>
                      </div>
                      <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Latest update
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {activeSession
                            ? formatClock(activeSession.updatedAt)
                            : 'No session selected'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Recent feed</div>
                        <div className="text-xs text-slate-500">Operational events</div>
                      </div>
                      <FolderKanban className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {sessionFeed.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          Activity cards will appear here once the conversation starts moving.
                        </div>
                      )}
                      {sessionFeed.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                  {feedTypeLabel(entry.type)}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {formatRelativeTime(entry.timestamp)}
                                </span>
                              </div>
                              <div className="mt-2 text-sm font-medium">{entry.message}</div>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
