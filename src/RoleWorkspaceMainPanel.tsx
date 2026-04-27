import { Suspense } from 'react';
import { Clock3, FileText, Files, FolderKanban, ArrowRight } from 'lucide-react';
import { ChatView } from './ChatView';
import type { ActivityEvent, FeedEntry, Session, UploadedFile } from './store';
import {
  feedTypeLabel,
  formatClock,
  formatRelativeTime,
  statusLabel,
  statusTone,
} from './RoleWorkspaceUi';

export type RoleWorkspaceMainPanelProps = {
  isCustomerFacing: boolean;
  isCompactViewport: boolean;
  showContextRail: boolean;
  activeSession: Session | null;
  sessionFeed: FeedEntry[];
  sessionActivity: ActivityEvent[];
  sessionFiles: UploadedFile[];
  shellTitle: string;
};

export function RoleWorkspaceMainPanel({
  isCustomerFacing,
  isCompactViewport,
  showContextRail,
  activeSession,
  sessionFeed,
  sessionActivity,
  sessionFiles,
  shellTitle,
}: RoleWorkspaceMainPanelProps) {
  return (
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
          <section className="hidden xl:flex min-h-0 flex-col border-l border-black/5 bg-[rgba(248,247,243,0.88)] p-4">
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
                      <div className="mt-1 text-sm font-semibold">{sessionFiles.length}</div>
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
                            <div className="text-sm font-semibold">{statusLabel(entry.status)}</div>
                            <div className="mt-1 text-xs text-slate-500">{entry.summary}</div>
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
  );
}
