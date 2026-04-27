import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, type ActivityEvent } from './store';
import { useRoleWorkspaceBackend } from './hooks/useRoleWorkspaceBackend';
import { RoleWorkspaceShell } from './RoleWorkspaceShell';
import { roleActionSet } from './RoleWorkspaceUi';
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
  const { sessions, activeSessionId, activity, feed, files } = state;
  const [shellLoginTypeOverride, setShellLoginTypeOverride] = useState<LoginType | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('shellLoginType');
    return initial ? normalizeLoginType(initial) : null;
  });
  const [menuPanel, setMenuPanel] = useState<'sessions' | 'tasks' | 'feed' | 'agents'>('sessions');
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

  const {
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
  } = useRoleWorkspaceBackend({
    activeSession,
    onTaskCreated: (title) => {
      if (!activeSession) return;
      actions.addFeed(activeSession.id, 'system', `Task created: ${title}`, {
        loginType: shellMode,
        surface: shellMode === 'customer' ? 'beta-production' : shellMode,
      });
      actions.setStatusLine(`Task created: ${title}`);
    },
  });

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
  const menuItems: Array<{
    key: 'sessions' | 'tasks' | 'feed' | 'agents';
    label: string;
    value: number;
  }> = isCustomerFacing
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

  return (
    <RoleWorkspaceShell
      authUser={authUser}
      activeWorkspace={activeWorkspace}
      onLogout={onLogout}
      sessions={sessions}
      menuPanel={menuPanel}
      setMenuPanel={setMenuPanel}
      mobileSessionsOpen={mobileSessionsOpen}
      setMobileSessionsOpen={setMobileSessionsOpen}
      isCompactViewport={isCompactViewport}
      loginType={loginType}
      shellMode={shellMode}
      copy={copy}
      accent={accent}
      isCustomerFacing={isCustomerFacing}
      activeSession={activeSession}
      sessionFeed={sessionFeed}
      sessionActivity={sessionActivity}
      sessionFiles={sessionFiles}
      recentSessions={recentSessions}
      recentTasks={recentTasks}
      quickActions={quickActions}
      menuItems={menuItems}
      activeAgentsCount={activeAgentsCount}
      pendingTasksCount={pendingTasksCount}
      showLeftRail={showLeftRail}
      showContextRail={showContextRail}
      tasksLoading={tasksLoading}
      tasksError={tasksError}
      taskDraftTitle={taskDraftTitle}
      setTaskDraftTitle={setTaskDraftTitle}
      taskDraftPriority={taskDraftPriority}
      setTaskDraftPriority={setTaskDraftPriority}
      taskSavingId={taskSavingId}
      workspaceTasks={workspaceTasks}
      statusSummary={statusSummary}
      createWorkspaceTask={createWorkspaceTask}
      updateWorkspaceTask={updateWorkspaceTask}
      deleteWorkspaceTask={deleteWorkspaceTask}
      shellTitle={shellTitle}
      onNewCase={onNewCase}
      runQuickAction={runQuickAction}
      setShellLoginType={setShellLoginType}
    />
  );
}
