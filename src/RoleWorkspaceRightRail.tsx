import { ArrowRight, FolderKanban, UserRound, WandSparkles } from 'lucide-react';
import type { ActivityEvent, FeedEntry, Session } from './store';
import { feedTypeLabel, formatClock, formatRelativeTime } from './RoleWorkspaceUi';

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

export type RoleWorkspaceRightRailProps = {
  authUser: AuthLike;
  activeSession: Session | null;
  sessionFeed: FeedEntry[];
  sessions: Session[];
  accent: string;
  copy: { label: string; description: string };
  isCustomerFacing: boolean;
  quickActions: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    status: ActivityEvent['status'];
  }>;
  runQuickAction: (label: string, status: ActivityEvent['status']) => void;
  activeWorkspace?: WorkspaceLike;
};

export function RoleWorkspaceRightRail({
  authUser,
  activeSession,
  sessionFeed,
  sessions,
  accent,
  copy,
  isCustomerFacing,
  quickActions,
  runQuickAction,
  activeWorkspace,
}: RoleWorkspaceRightRailProps) {
  return (
    <aside className="hidden lg:flex min-h-0 flex-col gap-4">
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
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Audience</div>
          <div className="mt-1 text-sm font-semibold">
            {isCustomerFacing ? 'Beta / Production' : copy.label}
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

      {!isCustomerFacing && (
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
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Owner</div>
                <div className="mt-1 text-sm font-medium">
                  {authUser.name} <span className="text-slate-500">({authUser.username})</span>
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
                  {activeSession ? formatClock(activeSession.updatedAt) : 'No session selected'}
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
  );
}
