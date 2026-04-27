import {
  CheckCircle2,
  FileText,
  MessageSquareMore,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { ActivityEvent, FeedEntry } from './store';

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export function statusLabel(status?: ActivityEvent['status']): string {
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

export function statusTone(status?: ActivityEvent['status']): string {
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

export function feedTypeLabel(type: FeedEntry['type']): string {
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

export function roleActionSet(mode: 'dev' | 'qa' | 'customer') {
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
