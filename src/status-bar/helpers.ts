import type { Notification, NotifFilter } from './types';

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function notifMatchesFilter(n: Notification, filter: NotifFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'services') return n.type?.startsWith('service.') || false;
  if (filter === 'agents')
    return n.type?.startsWith('agent.') || n.type?.startsWith('fleet.') || false;
  if (filter === 'tasks') return n.type?.startsWith('task.') || false;
  return true;
}

// Returns JSON-encoded auth headers including Bearer token if present.
export function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
