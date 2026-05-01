/**
 * TaskPanel — Slide-out drawer showing task detail, trace route, subtasks
 * with interactive checkboxes for approving/completing/cancelling tasks.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  TrackedTask,
  TraceExecutionStep,
  TaskTraceDetails,
  TraceStep,
} from '../hooks/useTaskTracker';
import { cityWorkflowLink, mib007Link } from '../chat-utils';

// ── Status & Priority styling ──

const STATUS_COLORS: Record<string, string> = {
  created: '#6b7280',
  todo: '#3b82f6',
  in_progress: '#8b5cf6',
  pending_review: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
  completed: '#22c55e',
  cancelled: '#9ca3af',
  failed: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  todo: 'To-Do',
  in_progress: 'In Progress',
  pending_review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const DISPATCH_COLORS: Record<string, string> = {
  pending: '#6b7280',
  dispatched: '#22c55e',
  queued: '#f59e0b',
  skipped: '#9ca3af',
  failed: '#ef4444',
  manual: '#38bdf8',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Props ──

interface TaskPanelProps {
  task: TrackedTask;
  onClose: () => void;
  onUpdateTask: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  fetchSubtasks: (parentId: string) => Promise<TrackedTask[]>;
  fetchTrace: (traceId: string) => Promise<TaskTraceDetails>;
}

export function TaskPanel({
  task,
  onClose,
  onUpdateTask,
  fetchSubtasks,
  fetchTrace,
}: TaskPanelProps) {
  const [subtasks, setSubtasks] = useState<TrackedTask[]>([]);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [executionPlan, setExecutionPlan] = useState<TraceExecutionStep[]>([]);
  const [activity, setActivity] = useState<TaskActivityEntry[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detail' | 'subtasks' | 'trace' | 'history'>('detail');
  const workflowPacket = useMemo(() => parseWorkflowPacket(task.task_memory), [task.task_memory]);

  // Load subtasks
  useEffect(() => {
    setLoadingSubtasks(true);
    fetchSubtasks(task.id).then((list) => {
      setSubtasks(list);
      setLoadingSubtasks(false);
      if (list.length > 0 && activeTab === 'detail') setActiveTab('subtasks');
    });
  }, [task.id, fetchSubtasks]);

  // Load trace if available
  useEffect(() => {
    if (task.trace_id) {
      setLoadingTrace(true);
      fetchTrace(task.trace_id).then((details) => {
        setTraceSteps(details.steps);
        setExecutionPlan(details.executionPlan);
        setLoadingTrace(false);
      });
    }
  }, [task.trace_id, fetchTrace]);

  // Load task history
  useEffect(() => {
    let cancelled = false;
    setLoadingActivity(true);
    fetch(`/api/tasks/${task.id}/activity?limit=20`, {
      signal: AbortSignal.timeout(5000),
    })
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as unknown;
      })
      .then((data) => {
        if (cancelled) return;
        setActivity(parseActivityEntries(data));
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const handleUpdate = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      setUpdating(taskId);
      await onUpdateTask(taskId, patch);
      // Refresh subtasks
      const refreshed = await fetchSubtasks(task.id);
      setSubtasks(refreshed);
      setUpdating(null);
    },
    [onUpdateTask, fetchSubtasks, task.id],
  );

  const isDone =
    task.status === 'done' || task.status === 'completed' || task.status === 'cancelled';
  const completedSubtasks = subtasks.filter(
    (s) => s.status === 'done' || s.status === 'completed',
  ).length;
  const progress =
    task.completion_ratio != null
      ? Math.round(task.completion_ratio * 100)
      : subtasks.length > 0
        ? Math.round((completedSubtasks / subtasks.length) * 100)
        : undefined;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 380,
        background: 'var(--c-bg-1)',
        borderLeft: '1px solid var(--c-border-2)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_COLORS[task.status] || '#6b7280' }}
          />
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text-1)' }}>
            {task.title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-white/5 transition-colors"
          style={{ color: 'var(--c-text-4)' }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Status bar + progress */}
      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
        <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--c-text-3)' }}>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{
              background: `${STATUS_COLORS[task.status] || '#6b7280'}20`,
              color: STATUS_COLORS[task.status] || '#6b7280',
            }}
          >
            {STATUS_LABELS[task.status] || task.status}
          </span>
          {task.agent && <span>Agent: {task.agent}</span>}
          {task.dispatch_status && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{
                background: `${DISPATCH_COLORS[task.dispatch_status] || '#6b7280'}20`,
                color: DISPATCH_COLORS[task.dispatch_status] || '#6b7280',
              }}
            >
              Fleet: {task.dispatch_status}
            </span>
          )}
          {task.priority && <span style={{ textTransform: 'capitalize' }}>{task.priority}</span>}
          <span>{relativeTime(task.updated_at || task.created_at)}</span>
        </div>
        {progress != null && (
          <div className="mt-2">
            <div
              className="flex items-center justify-between text-[11px] mb-1"
              style={{ color: 'var(--c-text-4)' }}
            >
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--c-bg-3, rgba(255,255,255,0.06))' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress === 100 ? '#22c55e' : '#8b5cf6',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
        {(['detail', 'subtasks', 'trace', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 text-[11px] py-2 transition-colors"
            style={{
              color: activeTab === tab ? 'var(--c-accent, #8b5cf6)' : 'var(--c-text-4)',
              borderBottom:
                activeTab === tab ? '2px solid var(--c-accent, #8b5cf6)' : '2px solid transparent',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab === 'detail' && 'Detail'}
            {tab === 'subtasks' && `Subtasks${subtasks.length > 0 ? ` (${subtasks.length})` : ''}`}
            {tab === 'trace' && 'Trace Route'}
            {tab === 'history' && `History${activity.length > 0 ? ` (${activity.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'detail' && (
          <DetailTab task={task} isDone={isDone} onUpdate={handleUpdate} updating={updating} />
        )}
        {activeTab === 'subtasks' && (
          <SubtasksTab
            subtasks={subtasks}
            loading={loadingSubtasks}
            onUpdate={handleUpdate}
            updating={updating}
          />
        )}
        {activeTab === 'trace' && (
          <TraceTab
            steps={traceSteps}
            executionPlan={executionPlan}
            loading={loadingTrace}
            traceId={task.trace_id}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab entries={activity} loading={loadingActivity} currentStatus={task.status} />
        )}
      </div>

      {/* Footer actions */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid var(--c-border-2)' }}
      >
        {!isDone && (
          <>
            {(task.status === 'in_progress' || task.status === 'pending_review') && (
              <ActionButton
                label="Complete"
                color="#22c55e"
                loading={updating === task.id}
                onClick={() =>
                  handleUpdate(task.id, { status: 'done', expected_status: task.status })
                }
              />
            )}
            {task.status === 'blocked' && (
              <ActionButton
                label="Unblock"
                color="#3b82f6"
                loading={updating === task.id}
                onClick={() =>
                  handleUpdate(task.id, { status: 'in_progress', expected_status: 'blocked' })
                }
              />
            )}
            <ActionButton
              label="Cancel"
              color="#ef4444"
              loading={updating === task.id}
              onClick={() => handleUpdate(task.id, { status: 'cancelled' })}
            />
          </>
        )}
        {(task.status === 'failed' || task.status === 'cancelled') && (
          <ActionButton
            label="Retry"
            color="#f59e0b"
            loading={updating === task.id}
            onClick={() => handleUpdate(task.id, { status: 'todo' })}
          />
        )}
        {workflowPacket && (
          <a
            href={cityWorkflowLink(workflowPacket, buildCityWorkflowParams(workflowPacket))}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] px-2 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-text-4)' }}
          >
            Open in Shre City
          </a>
        )}
        <a
          href={mib007Link('tasks', `id=${task.id}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[11px] px-2 py-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-4)' }}
        >
          Open in MIB007
        </a>
      </div>
    </div>
  );
}

// ── Detail Tab ──

function DetailTab({
  task,
  isDone,
  onUpdate,
  updating,
}: {
  task: TrackedTask;
  isDone: boolean;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  updating: string | null;
}) {
  const workflowPacket = parseWorkflowPacket(task.task_memory);
  const dispatchState =
    task.session_id || ['started', 'in_progress'].includes(task.status)
      ? 'dispatched'
      : 'published';
  return (
    <div className="space-y-3">
      {workflowPacket && (
        <WorkflowSummaryCard packet={workflowPacket} dispatchState={dispatchState} />
      )}
      {task.description && (
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
          {task.description}
        </p>
      )}

      <div className="space-y-1.5">
        <InfoRow label="ID" value={task.id.slice(0, 16)} />
        {task.project_id && <InfoRow label="Project" value={task.project_id.slice(0, 16)} />}
        {task.source && <InfoRow label="Source" value={task.source} />}
        {task.quality_score != null && (
          <InfoRow label="Quality" value={`${task.quality_score.toFixed(1)} / 5.0`} />
        )}
        {task.depends_on && task.depends_on.length > 0 && (
          <InfoRow
            label="Depends on"
            value={task.depends_on.map((d) => d.slice(0, 8)).join(', ')}
          />
        )}
        <InfoRow label="Created" value={new Date(task.created_at).toLocaleString()} />
        {task.updated_at && <InfoRow label="Updated" value={relativeTime(task.updated_at)} />}
      </div>
    </div>
  );
}

type WorkflowPacket = {
  workflowId?: string;
  sourceAgentId?: string;
  sourceAppId?: string | null;
  sourceAppName?: string | null;
  inferred?: {
    sourceAppId?: string | null;
    targetAppId?: string | null;
    pipeMode?: boolean;
  };
  requestedScopes?: {
    vault?: boolean;
    memory?: boolean;
    database?: boolean;
  };
  nodes?: Array<{ id?: string; appId?: string; role?: string }>;
  pipes?: Array<{ id?: string; sourceAppId?: string; targetAppId?: string; label?: string }>;
  securityMode?: string;
};

type TaskActivityEntry = {
  id?: string;
  event_type?: string;
  message?: string;
  agent?: string | null;
  source?: string | null;
  created_at?: number;
  project_id?: string | null;
  task_id?: string | null;
};

function parseWorkflowPacket(raw?: string): WorkflowPacket | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    if ('packet' in parsed && parsed.packet && typeof parsed.packet === 'object') {
      return parsed.packet as WorkflowPacket;
    }
    return parsed as WorkflowPacket;
  } catch {
    return null;
  }
}

function parseActivityEntries(data: unknown): TaskActivityEntry[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry): entry is TaskActivityEntry => !!entry && typeof entry === 'object')
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

function buildCityWorkflowParams(packet: WorkflowPacket): Record<string, string> {
  const params: Record<string, string> = {};
  const focusAppId = packet.sourceAppId ?? packet.inferred?.sourceAppId ?? undefined;
  if (focusAppId) params.appId = focusAppId;
  if (focusAppId) params.serviceId = focusAppId;
  if (packet.inferred?.targetAppId) params.targetAppId = packet.inferred.targetAppId;
  if (packet.workflowId) params.workflowId = packet.workflowId;
  if (packet.securityMode) params.securityMode = packet.securityMode;
  return params;
}

function WorkflowSummaryCard({
  packet,
  dispatchState,
}: {
  packet: WorkflowPacket;
  dispatchState: 'published' | 'dispatched';
}) {
  const nodes = packet.nodes?.length ?? 0;
  const pipes = packet.pipes?.length ?? 0;
  const scopes = [
    packet.requestedScopes?.vault ? 'vault' : null,
    packet.requestedScopes?.memory ? 'memory' : null,
    packet.requestedScopes?.database ? 'database' : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--c-border-2)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--c-text-4)' }}
          >
            Workflow
          </div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--c-text-1)' }}>
            {packet.workflowId || 'Unnamed workflow'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className="px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.14)', color: '#22c55e' }}
          >
            {dispatchState === 'dispatched' ? 'Published + dispatched' : 'Published'}
          </span>
          <span style={{ color: 'var(--c-text-4)' }}>{packet.securityMode ?? 'brokered'}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded bg-white/[0.03] px-2 py-1">
          <div style={{ color: 'var(--c-text-4)' }}>Nodes</div>
          <div style={{ color: 'var(--c-text-1)' }}>{nodes}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1">
          <div style={{ color: 'var(--c-text-4)' }}>Pipes</div>
          <div style={{ color: 'var(--c-text-1)' }}>{pipes}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1">
          <div style={{ color: 'var(--c-text-4)' }}>Scopes</div>
          <div style={{ color: 'var(--c-text-1)' }}>
            {scopes.length > 0 ? scopes.join(', ') : 'none'}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({
  entries,
  loading,
  currentStatus,
}: {
  entries: TaskActivityEntry[];
  loading: boolean;
  currentStatus: string;
}) {
  if (loading) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        Loading history...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        No activity yet. Current status: {currentStatus}.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
        Lifecycle events
      </div>
      {entries.map((entry, index) => (
        <div
          key={entry.id || `${entry.event_type || 'event'}-${index}`}
          className="rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--c-border-2)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-1)' }}>
              {entry.event_type || 'update'}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
              {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'unknown'}
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
            {entry.message || 'No message'}
          </div>
          {(entry.agent || entry.source) && (
            <div className="mt-1 text-[10px]" style={{ color: 'var(--c-text-4)' }}>
              {[
                entry.agent ? `agent: ${entry.agent}` : null,
                entry.source ? `source: ${entry.source}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: 'var(--c-text-4)' }}>{label}</span>
      <span
        style={{ color: 'var(--c-text-2)' }}
        className="font-mono text-right max-w-[200px] truncate"
      >
        {value}
      </span>
    </div>
  );
}

// ── Subtasks Tab (Interactive Checkboxes) ──

function SubtasksTab({
  subtasks,
  loading,
  onUpdate,
  updating,
}: {
  subtasks: TrackedTask[];
  loading: boolean;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  updating: string | null;
}) {
  if (loading) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        Loading subtasks...
      </div>
    );
  }

  if (subtasks.length === 0) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        No subtasks. This is a standalone task.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {subtasks.map((sub) => {
        const isChecked = sub.status === 'done' || sub.status === 'completed';
        const isFailed = sub.status === 'failed';
        const isActive = sub.status === 'in_progress';
        const isUpdating = updating === sub.id;

        return (
          <div
            key={sub.id}
            className="flex items-start gap-2.5 py-2 px-2 rounded-lg transition-colors hover:bg-white/[0.03]"
          >
            {/* Checkbox */}
            <button
              disabled={isUpdating}
              onClick={() => {
                if (isChecked) {
                  onUpdate(sub.id, { status: 'in_progress', expected_status: sub.status });
                } else {
                  onUpdate(sub.id, { status: 'done', expected_status: sub.status });
                }
              }}
              className="shrink-0 mt-0.5 h-4 w-4 rounded border transition-all duration-150 flex items-center justify-center"
              style={{
                borderColor: isChecked
                  ? '#22c55e'
                  : isFailed
                    ? '#ef4444'
                    : isActive
                      ? '#8b5cf6'
                      : 'var(--c-border-2)',
                background: isChecked
                  ? '#22c55e'
                  : isFailed
                    ? 'rgba(239,68,68,0.15)'
                    : 'transparent',
                opacity: isUpdating ? 0.5 : 1,
              }}
            >
              {isChecked && (
                <svg
                  className="h-2.5 w-2.5"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
              {isFailed && (
                <svg
                  className="h-2.5 w-2.5"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                >
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              )}
              {isActive && (
                <span
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ background: '#8b5cf6' }}
                />
              )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div
                className="text-[12px] leading-snug"
                style={{
                  color: isChecked ? 'var(--c-text-4)' : 'var(--c-text-1)',
                  textDecoration: isChecked ? 'line-through' : 'none',
                }}
              >
                {sub.title}
              </div>
              <div
                className="flex items-center gap-2 mt-0.5 text-[10px]"
                style={{ color: 'var(--c-text-4)' }}
              >
                {sub.agent && <span>{sub.agent}</span>}
                {sub.quality_score != null && <span>Q: {sub.quality_score.toFixed(1)}</span>}
                <span
                  className="px-1 py-px rounded"
                  style={{
                    background: `${STATUS_COLORS[sub.status] || '#6b7280'}15`,
                    color: STATUS_COLORS[sub.status] || '#6b7280',
                  }}
                >
                  {STATUS_LABELS[sub.status] || sub.status}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Trace Route Tab ──

function TraceTab({
  steps,
  executionPlan,
  loading,
  traceId,
}: {
  steps: TraceStep[];
  executionPlan: TraceExecutionStep[];
  loading: boolean;
  traceId?: string;
}) {
  if (!traceId) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        No trace ID attached to this task.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        Loading trace route...
      </div>
    );
  }

  if (steps.length === 0 && executionPlan.length === 0) {
    return (
      <div className="text-[12px] py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
        Trace data not available yet.
        <div className="mt-1 text-[10px]">ID: {traceId.slice(0, 20)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {steps.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-[7px] top-2 bottom-2 w-px"
            style={{ background: 'var(--c-border-2)' }}
          />

          <div className="space-y-0.5">
            {steps.map((step, i) => {
              const icon =
                step.status === 'ok'
                  ? 'check'
                  : step.status === 'fail'
                    ? 'x'
                    : step.status === 'running'
                      ? 'pulse'
                      : 'dot';
              const color =
                step.status === 'ok'
                  ? '#22c55e'
                  : step.status === 'fail'
                    ? '#ef4444'
                    : step.status === 'running'
                      ? '#8b5cf6'
                      : '#6b7280';

              return (
                <div key={i} className="flex items-start gap-3 py-1.5 pl-0 relative">
                  {/* Icon */}
                  <div
                    className="shrink-0 h-[14px] w-[14px] rounded-full flex items-center justify-center z-10"
                    style={{ background: 'var(--c-bg-1)' }}
                  >
                    {icon === 'check' && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill={color}>
                        <circle cx="6" cy="6" r="6" />
                        <path d="M3.5 6l2 2 3-3.5" fill="none" stroke="white" strokeWidth="1.5" />
                      </svg>
                    )}
                    {icon === 'x' && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill={color}>
                        <circle cx="6" cy="6" r="6" />
                        <path d="M4 4l4 4M8 4l-4 4" fill="none" stroke="white" strokeWidth="1.5" />
                      </svg>
                    )}
                    {icon === 'pulse' && (
                      <span
                        className="h-3 w-3 rounded-full animate-pulse"
                        style={{ background: color }}
                      />
                    )}
                    {icon === 'dot' && (
                      <span
                        className="h-2.5 w-2.5 rounded-full border-2"
                        style={{ borderColor: color }}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12px]"
                      style={{
                        color: step.status === 'pending' ? 'var(--c-text-4)' : 'var(--c-text-1)',
                      }}
                    >
                      {step.name}
                    </div>
                    <div
                      className="flex items-center gap-2 text-[10px]"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      {step.duration_ms != null && (
                        <span>
                          {step.duration_ms < 1000
                            ? `${step.duration_ms}ms`
                            : `${(step.duration_ms / 1000).toFixed(1)}s`}
                        </span>
                      )}
                      {step.error && (
                        <span style={{ color: '#ef4444' }} className="truncate max-w-[200px]">
                          {step.error}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {executionPlan.length > 0 && (
        <div
          className="space-y-2 rounded-lg border px-3 py-3"
          style={{ borderColor: 'var(--c-border-2)' }}
        >
          <div
            className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--c-text-4)' }}
          >
            <span>Execution plan</span>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}
            >
              {executionPlan.length} step{executionPlan.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-2">
            {executionPlan
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((step) => {
                const color =
                  step.status === 'done'
                    ? '#22c55e'
                    : step.status === 'failed'
                      ? '#ef4444'
                      : step.status === 'delegated'
                        ? '#3b82f6'
                        : step.status === 'running'
                          ? '#f59e0b'
                          : '#6b7280';

                return (
                  <div
                    key={step.stepId}
                    className="rounded-md border px-3 py-2"
                    style={{ borderColor: `${color}33`, background: `${color}08` }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ background: `${color}20`, color }}
                      >
                        {step.status.replace(/_/g, ' ')}
                      </span>
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: 'var(--c-text-1)' }}
                      >
                        {step.order}. {step.title}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                        {step.type}
                      </span>
                      {step.taskId && (
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          task {step.taskId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    {step.queryText && (
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                        {step.queryText}
                      </div>
                    )}
                    {step.error && (
                      <div className="mt-1 text-[10px]" style={{ color: '#ef4444' }}>
                        {step.error}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ──

function ActionButton({
  label,
  color,
  loading,
  onClick,
}: {
  label: string;
  color: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={loading}
      onClick={onClick}
      className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all duration-150 hover:brightness-110"
      style={{
        background: `${color}20`,
        color,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? '...' : label}
    </button>
  );
}

// ── Inline Task Status Pills (for use inside message bubbles) ──

export function InlineTaskPills({
  tasks,
  onSelectTask,
}: {
  tasks: TrackedTask[];
  onSelectTask: (id: string) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tasks.map((task) => {
        const color = STATUS_COLORS[task.status] || '#6b7280';
        const isDone = task.status === 'done' || task.status === 'completed';
        const isActive = task.status === 'in_progress';

        return (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110 cursor-pointer"
            style={{
              background: `${color}15`,
              color,
              border: `1px solid ${color}30`,
            }}
          >
            {/* Status indicator */}
            {isDone ? (
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 0a6 6 0 110 12A6 6 0 016 0zm2.4 4.2a.5.5 0 00-.7.02L5.5 6.8l-1.2-1.3a.5.5 0 10-.7.7l1.6 1.7a.5.5 0 00.7 0l2.5-2.9a.5.5 0 000-.7z" />
              </svg>
            ) : isActive ? (
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: color }} />
            ) : (
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            )}

            {/* Agent + status */}
            <span className="truncate max-w-[120px]">{task.agent || 'agent'}</span>
            <span style={{ opacity: 0.7 }}>{STATUS_LABELS[task.status] || task.status}</span>

            {/* Completion */}
            {task.completion_ratio != null && task.completion_ratio > 0 && (
              <span style={{ opacity: 0.7 }}>{Math.round(task.completion_ratio * 100)}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Floating Task Indicator (shows in chat header/sidebar) ──

export function TaskIndicatorButton({
  activeTasks,
  onClick,
}: {
  activeTasks: TrackedTask[];
  onClick: () => void;
}) {
  if (activeTasks.length === 0) return null;

  const inProgress = activeTasks.filter((t) => t.status === 'in_progress').length;
  const blocked = activeTasks.filter((t) => t.status === 'blocked').length;

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 hover:brightness-110"
      style={{
        background: 'rgba(139,92,246,0.1)',
        color: '#a78bfa',
        border: '1px solid rgba(139,92,246,0.2)',
      }}
      title={`${activeTasks.length} active task${activeTasks.length > 1 ? 's' : ''}`}
    >
      {/* Animated dot for active tasks */}
      {inProgress > 0 && (
        <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#8b5cf6' }} />
      )}
      {blocked > 0 && inProgress === 0 && (
        <span className="h-2 w-2 rounded-full" style={{ background: '#ef4444' }} />
      )}

      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>

      <span>{activeTasks.length}</span>
    </button>
  );
}
