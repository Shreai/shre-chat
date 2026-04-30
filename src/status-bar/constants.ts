import type { NotifFilter, StatusBarData } from './types';

export const NOTIF_ICONS: Record<string, string> = {
  'task.completed': '\u2705',
  'task.failed': '\u274c',
  'task.started': '\ud83d\ude80',
  'task.assigned': '\ud83d\udccb',
  'task.unblocked': '\ud83d\udd13',
  'service.unhealthy': '\u26a0\ufe0f',
  'service.started': '\u2714\ufe0f',
  'agent.quality_alert': '\ud83d\udcc9',
  'fleet.agent_status': '\ud83e\udd16',
  'fleet.agent.stuck': '\u26a0\ufe0f',
  'fleet.agent.dead': '\ud83d\udc80',
  'fleet.agent.recovered': '\u2705',
  'fleet.task.degraded': '\u26a0\ufe0f',
  'fleet.agent.crash_unrecoverable': '\ud83d\udca5',
  'deploy.monitor.breach': '\ud83d\udea8',
  'approval.requested': '\ud83d\udd12',
  'approval.resolved': '\u2705',
  'fleet.code_quality': '\ud83d\udcc8',
  'fleet.done-gate.failed': '\ud83d\uded1',
  'fleet.verify.passed': '\u2705',
  'fleet.verify.fix_created': '\ud83d\udd27',
  'wave.started': '\ud83c\udf0a',
  'wave.completed': '\ud83c\udfc6',
  'twin.divergence': '\ud83d\udc65',
};

export const TASK_GROUPS: { label: string; statuses: Set<string> }[] = [
  { label: 'Active', statuses: new Set(['in_progress', 'started', 'working_on']) },
  { label: 'Review', statuses: new Set(['pending_review', 'review_needed', 'approval_needed']) },
  {
    label: 'Failed',
    statuses: new Set(['failed', 'errored', 'crash_unrecoverable', 'divergence']),
  },
  { label: 'Blocked', statuses: new Set(['blocked', 'roadblock', 'on_hold', 'hold']) },
  { label: 'Queued', statuses: new Set(['created', 'queued', 'todo']) },
  { label: 'Completed', statuses: new Set(['done', 'completed', 'qa_tested', 'production_ready']) },
  { label: 'Cancelled', statuses: new Set(['cancelled']) },
];

export const TASK_STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  created: { color: '#6b7280', label: 'Created', icon: '\u25cb' },
  queued: { color: '#6b7280', label: 'Queued', icon: '\u23f3' },
  todo: { color: '#3b82f6', label: 'To-Do', icon: '\u25cb' },
  started: { color: '#8b5cf6', label: 'Started', icon: '\u25d4' },
  in_progress: { color: '#8b5cf6', label: 'In Progress', icon: '\u25d4' },
  working_on: { color: '#8b5cf6', label: 'Working', icon: '\u25d4' },
  pending_review: { color: '#f59e0b', label: 'Review', icon: '\u25d1' },
  review_needed: { color: '#f59e0b', label: 'Review Needed', icon: '\u25d1' },
  approval_needed: { color: '#f59e0b', label: 'Approval', icon: '\u25d1' },
  blocked: { color: '#ef4444', label: 'Blocked', icon: '\u25a0' },
  roadblock: { color: '#ef4444', label: 'Roadblock', icon: '\u25a0' },
  on_hold: { color: '#f59e0b', label: 'On Hold', icon: '\u275a\u275a' },
  hold: { color: '#f59e0b', label: 'On Hold', icon: '\u275a\u275a' },
  done: { color: '#22c55e', label: 'Done', icon: '\u25cf' },
  completed: { color: '#22c55e', label: 'Completed', icon: '\u25cf' },
  qa_tested: { color: '#10b981', label: 'QA Tested', icon: '\u25cf' },
  production_ready: { color: '#059669', label: 'Prod Ready', icon: '\u25cf' },
  cancelled: { color: '#9ca3af', label: 'Cancelled', icon: '\u2715' },
  failed: { color: '#ef4444', label: 'Failed', icon: '\ud83d\udc80' },
  errored: { color: '#ef4444', label: 'Error', icon: '\u26a0\ufe0f' },
  crash_unrecoverable: { color: '#ef4444', label: 'Crashed', icon: '\ud83d\udca5' },
  divergence: { color: '#f59e0b', label: 'Diverged', icon: '\ud83d\udd00' },
};

// Notification types that also surface as in-chat system messages.
export const IMPORTANT_TYPES = new Set([
  'task.failed',
  'task.errored',
  'task.crashed',
  'task.diverged',
  'service.unhealthy',
  'agent.quality_alert',
  'approval.requested',
  'approval.resolved',
  'deploy.monitor.breach',
]);

export const NOTIF_FILTERS: { key: NotifFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'agents', label: 'Agents' },
  { key: 'services', label: 'Services' },
];

export const EMPTY_DATA: StatusBarData = {
  nextEvent: null,
  activeTasks: 0,
  reminders: { total: 0, overdue: 0 },
  agentStatus: 'idle',
  gatewayConnected: false,
  activeAgents: 0,
  pendingTasks: 0,
};
