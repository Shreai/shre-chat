import type { ConversationModeId } from './preferences-store';

export type WorkspaceChannelId =
  | 'general'
  | 'code'
  | 'ops'
  | 'strategy'
  | 'alerts'
  | 'approvals';

export interface WorkspaceChannel {
  id: WorkspaceChannelId;
  label: string;
  description: string;
  mode: ConversationModeId;
  accent: string;
}

export const WORKSPACE_CHANNELS: WorkspaceChannel[] = [
  {
    id: 'general',
    label: 'general',
    description: 'Company-wide coordination and default work',
    mode: 'assistant',
    accent: '#7c8cff',
  },
  {
    id: 'code',
    label: 'code',
    description: 'Autonomous build, debug, and ship loops',
    mode: 'code',
    accent: '#4ade80',
  },
  {
    id: 'ops',
    label: 'ops',
    description: 'Infra, incidents, approvals, and guardrails',
    mode: 'ops',
    accent: '#f59e0b',
  },
  {
    id: 'strategy',
    label: 'strategy',
    description: 'Planning, priorities, and decision context',
    mode: 'strategy',
    accent: '#f472b6',
  },
  {
    id: 'alerts',
    label: 'alerts',
    description: 'Operational alerts, failures, and escalations',
    mode: 'ops',
    accent: '#ef4444',
  },
  {
    id: 'approvals',
    label: 'approvals',
    description: 'Pending approvals and browser review actions',
    mode: 'ops',
    accent: '#fbbf24',
  },
];

const CHANNEL_LOOKUP = new Map(WORKSPACE_CHANNELS.map((channel) => [channel.id, channel]));

const ALERT_EVENT_TYPES = new Set([
  'task.failed',
  'task.unblocked',
  'service.unhealthy',
  'service.started',
  'fleet.agent.dead',
  'fleet.agent.crash_unrecoverable',
  'fleet.task.degraded',
  'fleet.done-gate.failed',
  'deploy.monitor.breach',
  'agent.quality_alert',
  'budget_warning',
  'budget_blocked',
  'ellie.escalation',
  'escalation.failed',
  'escalation.resolved',
  'project_progress',
  'project_fallback',
  'file_diff',
  'conversation.reopened',
]);

const APPROVAL_EVENT_TYPES = new Set([
  'approval.requested',
  'approval.resolved',
  'project.pending_approval',
]);

export function getWorkspaceChannel(channelId: string): WorkspaceChannel | null {
  return CHANNEL_LOOKUP.get(channelId as WorkspaceChannelId) ?? null;
}

export function getWorkspaceChannelTag(channelId: string): string {
  return `channel:${channelId}`;
}

export function getWorkspaceChannelTitle(channelId: string): string {
  const channel = getWorkspaceChannel(channelId);
  return channel ? `#${channel.label}` : `#${channelId}`;
}

export function resolveWorkspaceChannelForEvent(
  type: string,
  data?: { severity?: string | null; level?: string | null },
): WorkspaceChannelId | null {
  if (APPROVAL_EVENT_TYPES.has(type)) return 'approvals';
  if (ALERT_EVENT_TYPES.has(type)) return 'alerts';

  const severity = String(data?.severity || data?.level || '').toLowerCase();
  if (severity === 'critical' || severity === 'high') return 'alerts';

  return null;
}
