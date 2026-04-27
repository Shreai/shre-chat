import { Suspense } from 'react';
import {
  ArrowRight,
  Clock3,
  FileText,
  Files,
  FolderKanban,
  Plus,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import { ChatView } from './ChatView';
import { RoleWorkspaceLeftRail } from './RoleWorkspaceLeftRail';
import { RoleWorkspaceRightRail } from './RoleWorkspaceRightRail';
import { RoleWorkspaceMainPanel } from './RoleWorkspaceMainPanel';
import { getLoginTypeCopy, getShellMode, type LoginType } from './login-types';
import type { ActivityEvent, FeedEntry, Session, UploadedFile } from './store';
import {
  feedTypeLabel,
  formatClock,
  formatRelativeTime,
  roleActionSet,
  statusLabel,
  statusTone,
} from './RoleWorkspaceUi';

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

type RoleWorkspaceShellProps = {
  authUser: AuthLike;
  activeWorkspace?: WorkspaceLike;
  onLogout: () => void;
  sessions: Session[];
  menuPanel: 'sessions' | 'tasks' | 'feed' | 'agents';
  setMenuPanel: (panel: 'sessions' | 'tasks' | 'feed' | 'agents') => void;
  mobileSessionsOpen: boolean;
  setMobileSessionsOpen: (value: boolean) => void;
  isCompactViewport: boolean;
  loginType: LoginType;
  shellMode: 'dev' | 'qa' | 'customer';
  copy: ReturnType<typeof getLoginTypeCopy>;
  accent: string;
  isCustomerFacing: boolean;
  activeSession: Session | null;
  sessionFeed: FeedEntry[];
  sessionActivity: ActivityEvent[];
  sessionFiles: UploadedFile[];
  recentSessions: Session[];
  recentTasks: {
    id: string;
    title: string;
    status: string;
    priority?: string;
    description?: string;
    updated_at?: string;
    created_at?: string;
    assignee?: string;
  }[];
  quickActions: Array<{ label: string; icon: typeof FileText; status: ActivityEvent['status'] }>;
  menuItems: Array<{ key: 'sessions' | 'tasks' | 'feed' | 'agents'; label: string; value: number }>;
  activeAgentsCount: number;
  pendingTasksCount: number;
  showLeftRail: boolean;
  showContextRail: boolean;
  tasksLoading: boolean;
  tasksError: string | null;
  taskDraftTitle: string;
  setTaskDraftTitle: (title: string) => void;
  taskDraftPriority: 'low' | 'medium' | 'high';
  setTaskDraftPriority: (priority: 'low' | 'medium' | 'high') => void;
  taskSavingId: string | 'new' | null;
  workspaceTasks: {
    id: string;
    title: string;
    status: string;
    priority?: string;
    description?: string;
    updated_at?: string;
    created_at?: string;
    assignee?: string;
  }[];
  statusSummary: {
    activeAgents: number;
    pendingTasks: number;
    gatewayConnected: boolean;
  } | null;
  createWorkspaceTask: () => Promise<void>;
  updateWorkspaceTask: (
    taskId: string,
    updates: Partial<{ status: string; priority: string; title: string }>,
  ) => Promise<void>;
  deleteWorkspaceTask: (taskId: string) => Promise<void>;
  shellTitle: string;
  onNewCase: () => void;
  runQuickAction: (label: string, status: ActivityEvent['status']) => void;
  setShellLoginType: (type: LoginType) => void;
};

export function RoleWorkspaceShell(props: RoleWorkspaceShellProps) {
  const {
    authUser,
    activeWorkspace,
    onLogout,
    sessions,
    menuPanel,
    setMenuPanel,
    mobileSessionsOpen,
    setMobileSessionsOpen,
    isCompactViewport,
    loginType,
    shellMode,
    copy,
    accent,
    isCustomerFacing,
    activeSession,
    sessionFeed,
    sessionActivity,
    sessionFiles,
    recentSessions,
    recentTasks,
    quickActions,
    menuItems,
    activeAgentsCount,
    pendingTasksCount,
    showLeftRail,
    showContextRail,
    tasksLoading,
    tasksError,
    taskDraftTitle,
    setTaskDraftTitle,
    taskDraftPriority,
    setTaskDraftPriority,
    taskSavingId,
    workspaceTasks,
    statusSummary,
    createWorkspaceTask,
    updateWorkspaceTask,
    deleteWorkspaceTask,
    shellTitle,
    onNewCase,
    runQuickAction,
    setShellLoginType,
  } = props;

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
            <RoleWorkspaceLeftRail
              authUser={authUser}
              activeWorkspace={activeWorkspace}
              onLogout={onLogout}
              sessions={sessions}
              loginType={loginType}
              copy={copy}
              accent={accent}
              isCustomerFacing={isCustomerFacing}
              menuPanel={menuPanel}
              setMenuPanel={setMenuPanel}
              menuItems={menuItems}
              activeSession={activeSession}
              recentSessions={recentSessions}
              recentTasks={recentTasks}
              quickActions={quickActions}
              tasksLoading={tasksLoading}
              tasksError={tasksError}
              taskDraftTitle={taskDraftTitle}
              setTaskDraftTitle={setTaskDraftTitle}
              taskDraftPriority={taskDraftPriority}
              setTaskDraftPriority={setTaskDraftPriority}
              taskSavingId={taskSavingId}
              createWorkspaceTask={createWorkspaceTask}
              updateWorkspaceTask={updateWorkspaceTask}
              deleteWorkspaceTask={deleteWorkspaceTask}
              runQuickAction={runQuickAction}
              shellTitle={shellTitle}
              onNewCase={onNewCase}
              setShellLoginType={setShellLoginType}
            />
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
                    onClick={() => setMobileSessionsOpen(!mobileSessionsOpen)}
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
                            /* session selection stays in controller */
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

            <RoleWorkspaceMainPanel
              isCustomerFacing={isCustomerFacing}
              isCompactViewport={isCompactViewport}
              showContextRail={showContextRail}
              activeSession={activeSession}
              sessionFeed={sessionFeed}
              sessionActivity={sessionActivity}
              sessionFiles={sessionFiles}
              shellTitle={shellTitle}
            />
          </main>

          {showContextRail && (
            <RoleWorkspaceRightRail
              authUser={authUser}
              activeSession={activeSession}
              sessionFeed={sessionFeed}
              sessions={sessions}
              accent={accent}
              copy={copy}
              isCustomerFacing={isCustomerFacing}
              quickActions={quickActions}
              runQuickAction={runQuickAction}
              activeWorkspace={activeWorkspace}
            />
          )}
        </div>
      </div>
    </div>
  );
}
