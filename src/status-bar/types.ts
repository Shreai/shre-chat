// Types for the StatusBar notification panel and live-data tabs.

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  source: string | null;
  read: boolean;
  createdAt: number;
}

export interface LiveTask {
  id: string;
  title: string;
  status: string;
  agent: string | null;
  priority: string | null;
  quality_score: number | null;
  completion_ratio: number | null;
  project_id: string | null;
  created_at: number;
  updated_at: number | null;
}

export interface LiveAgent {
  id: string;
  name: string;
  model: string;
  status: string;
  currentTask: {
    taskId: string;
    title: string;
    phase?: string;
    progress?: string;
    elapsedMs?: number;
    type?: string;
  } | null;
}

export interface LiveService {
  name: string;
  port?: number;
  type?: string;
  healthy: boolean;
  status: string;
  latency_ms?: number | null;
  uptime_pct?: number | null;
}

export interface StatusBarData {
  nextEvent: { title: string; startsAt: number } | null;
  activeTasks: number;
  reminders: { total: number; overdue: number };
  agentStatus: 'idle' | 'busy';
  gatewayConnected: boolean;
  activeAgents: number;
  pendingTasks: number;
}

export type NotifFilter = 'all' | 'tasks' | 'agents' | 'services';
