import { Plus } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ActivityEvent, FeedEntry, Session } from './store';
import { formatRelativeTime } from './RoleWorkspaceUi';
import type { LoginType } from './login-types';

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

export type RoleWorkspaceLeftRailProps = {
  authUser: AuthLike;
  activeWorkspace?: WorkspaceLike;
  onLogout: () => void;
  sessions: Session[];
  loginType: LoginType;
  copy: { label: string; description: string };
  accent: string;
  isCustomerFacing: boolean;
  menuPanel: 'sessions' | 'tasks' | 'feed' | 'agents';
  setMenuPanel: (panel: 'sessions' | 'tasks' | 'feed' | 'agents') => void;
  menuItems: Array<{ key: 'sessions' | 'tasks' | 'feed' | 'agents'; label: string; value: number }>;
  activeSession: Session | null;
  recentSessions: Session[];
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    description?: string;
    updated_at?: string;
    created_at?: string;
    assignee?: string;
  }>;
  quickActions: Array<{
    label: string;
    icon: ComponentType<{ className?: string }>;
    status: ActivityEvent['status'];
  }>;
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
    updates: Partial<{ status: string; priority: string; title: string }>,
  ) => Promise<void>;
  deleteWorkspaceTask: (taskId: string) => Promise<void>;
  runQuickAction: (label: string, status: ActivityEvent['status']) => void;
  setShellLoginType: (type: LoginType) => void;
  shellTitle: string;
  onNewCase: () => void;
};

export function RoleWorkspaceLeftRail({
  authUser,
  activeWorkspace,
  onLogout,
  sessions,
  loginType,
  copy,
  accent,
  isCustomerFacing,
  menuPanel,
  setMenuPanel,
  menuItems,
  activeSession,
  recentSessions,
  recentTasks,
  quickActions,
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
  runQuickAction,
  setShellLoginType,
  shellTitle,
  onNewCase,
}: RoleWorkspaceLeftRailProps) {
  return (
    <aside className="hidden lg:flex min-h-0 flex-col gap-4">
      <div className="rounded-[28px] border border-black/5 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Shre Chat</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{shellTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
          </div>
          <button
            onClick={onLogout}
            type="button"
            className="rounded-full border border-black/5 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Logout
          </button>
        </div>

        {isCustomerFacing ? (
          <div className="mt-4 rounded-3xl border border-black/5 bg-slate-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Access</div>
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
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mode</div>
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
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Cases</div>
              <div className="mt-1 text-sm font-semibold">{sessions.length}</div>
            </div>
          </div>
        )}

        {!isCustomerFacing && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(['dev', 'qa', 'beta', 'production'] as LoginType[]).map((type) => {
              const active = type === loginType;
              const isCustomer = type === 'beta' || type === 'production';
              const label = isCustomer ? type[0].toUpperCase() + type.slice(1) : type.toUpperCase();
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setShellLoginType(type)}
                  className={[
                    'rounded-full border px-3.5 py-2 text-[12px] font-medium tracking-wide transition',
                    active
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-black/5 bg-white text-slate-500 hover:bg-slate-100',
                  ].join(' ')}
                  style={{ minHeight: 44, backgroundColor: active ? accent : undefined }}
                >
                  {label}
                </button>
              );
            })}
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
                onClick={() => setMenuPanel(item.key)}
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
                  onClick={() => {}}
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
                        <div className="truncate text-sm font-semibold">{session.title}</div>
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
                              <span>{formatRelativeTime(new Date(task.updated_at).getTime())}</span>
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
                          onClick={() => void updateWorkspaceTask(task.id, { status: 'done' })}
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
                        <Plus className="h-4 w-4 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
