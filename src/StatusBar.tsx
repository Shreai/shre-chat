import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp, getAgent } from './store';
import { usePreferences } from './preferences-store';

// ── Notification types ──────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  source: string | null;
  read: boolean;
  createdAt: number;
}

const NOTIF_ICONS: Record<string, string> = {
  'task.completed': '\u2705',
  'task.failed': '\u274c',
  'task.started': '\ud83d\ude80',
  'task.assigned': '\ud83d\udccb',
  'task.unblocked': '\ud83d\udd13',
  'service.unhealthy': '\u26a0\ufe0f',
  'service.started': '\u2714\ufe0f',
  'agent.quality_alert': '\ud83d\udcc9',
  'fleet.agent_status': '\ud83e\udd16',
};

// ── Live task tracking types ─────────────────────────────────────────
interface LiveTask {
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

// ── Live agent/service types ─────────────────────────────────────────
interface LiveAgent {
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

interface LiveService {
  name: string;
  port?: number;
  type?: string;
  healthy: boolean;
  status: string;
  latency_ms?: number | null;
  uptime_pct?: number | null;
}

// ── Task status groups for grouping ──────────────────────────────────
const TASK_GROUPS: { label: string; statuses: Set<string> }[] = [
  { label: 'Active', statuses: new Set(['in_progress', 'started', 'working_on']) },
  { label: 'Review', statuses: new Set(['pending_review', 'review_needed', 'approval_needed']) },
  { label: 'Blocked', statuses: new Set(['blocked', 'roadblock', 'on_hold', 'hold']) },
  { label: 'Queued', statuses: new Set(['created', 'queued', 'todo']) },
  { label: 'Completed', statuses: new Set(['done', 'completed', 'qa_tested', 'production_ready']) },
  { label: 'Cancelled', statuses: new Set(['cancelled']) },
];

const TASK_STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
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
};

// Important notification types that also show as system messages in chat
const IMPORTANT_TYPES = new Set(['task.failed', 'service.unhealthy', 'agent.quality_alert']);

// ── Notification filter categories ──────────────────────────────────
type NotifFilter = 'all' | 'tasks' | 'agents' | 'services';

const NOTIF_FILTERS: { key: NotifFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'agents', label: 'Agents' },
  { key: 'services', label: 'Services' },
];

function notifMatchesFilter(n: Notification, filter: NotifFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'services') return n.type?.startsWith('service.') || false;
  if (filter === 'agents')
    return n.type?.startsWith('agent.') || n.type?.startsWith('fleet.') || false;
  if (filter === 'tasks') return n.type?.startsWith('task.') || false;
  return true;
}

// ── Types ────────────────────────────────────────────────────────────

interface StatusBarData {
  nextEvent: { title: string; startsAt: number } | null;
  activeTasks: number;
  reminders: { total: number; overdue: number };
  agentStatus: 'idle' | 'busy';
  gatewayConnected: boolean;
  activeAgents: number;
  pendingTasks: number;
}

const EMPTY_DATA: StatusBarData = {
  nextEvent: null,
  activeTasks: 0,
  reminders: { total: 0, overdue: 0 },
  agentStatus: 'idle',
  gatewayConnected: false,
  activeAgents: 0,
  pendingTasks: 0,
};

// ── Countdown formatter ──────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ── Component ────────────────────────────────────────────────────────

/** Routing mode indicator — shows which path chat messages take */
function RoutingModeIndicator() {
  const [mode, setMode] = useState<'cli' | 'openclaw' | 'router'>(() => {
    if (localStorage.getItem('shre-claude-cli-mode') === 'true') return 'cli';
    if (localStorage.getItem('shre-openclaw-mode') === 'true') return 'openclaw';
    return 'router';
  });

  // Listen for localStorage changes from other components
  useEffect(() => {
    const sync = () => {
      if (localStorage.getItem('shre-claude-cli-mode') === 'true') setMode('cli');
      else if (localStorage.getItem('shre-openclaw-mode') === 'true') setMode('openclaw');
      else setMode('router');
    };
    window.addEventListener('storage', sync);
    // Also poll briefly since same-tab storage changes don't fire 'storage'
    const id = setInterval(sync, 2000);
    return () => {
      window.removeEventListener('storage', sync);
      clearInterval(id);
    };
  }, []);

  const config: Record<string, { label: string; color: string; title: string }> = {
    cli: {
      label: 'CLI',
      color: '#a855f7',
      title: 'Claude Code CLI — coding tasks execute locally',
    },
    openclaw: {
      label: 'OpenClaw',
      color: '#8b5cf6',
      title: 'OpenClaw Gateway — full agent workspace',
    },
    router: { label: 'Router', color: '#3b82f6', title: 'shre-router — auto-routes to best model' },
  };
  const c = config[mode];

  return (
    <div
      className="status-bar-item hidden sm:flex items-center"
      style={{
        gap: 4,
        padding: '1px 6px',
        borderRadius: 4,
        background: `${c.color}15`,
        cursor: 'default',
      }}
      title={c.title}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: c.color,
          boxShadow: `0 0 4px ${c.color}`,
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: c.color, letterSpacing: '0.02em' }}>
        {c.label}
      </span>
    </div>
  );
}

export function StatusBar() {
  const { state, actions } = useApp();
  const [data, setData] = useState<StatusBarData>(EMPTY_DATA);
  const micEnabled = usePreferences((s) => s.micEnabled);
  const setMicEnabled = usePreferences((s) => s.setMicEnabled);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>('all');
  const [liveTasks, setLiveTasks] = useState<LiveTask[]>([]);
  const [liveTasksLoading, setLiveTasksLoading] = useState(false);
  const [liveAgents, setLiveAgents] = useState<LiveAgent[]>([]);
  const [liveAgentsLoading, setLiveAgentsLoading] = useState(false);
  const [liveServices, setLiveServices] = useState<LiveService[]>([]);
  const [liveServicesLoading, setLiveServicesLoading] = useState(false);
  const [taskActionMenu, setTaskActionMenu] = useState<string | null>(null);
  const [taskActionPending, setTaskActionPending] = useState<string | null>(null);
  const [showAssignDropdown, setShowAssignDropdown] = useState<string | null>(null);
  const [panelSearch, setPanelSearch] = useState('');
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastNotifCheck = useRef(0);

  // Derive busy from streaming state
  const agentBusy = state.streaming || data.agentStatus === 'busy';

  // Current agent info
  const currentAgent = getAgent(state.activeAgentId);

  // Fetch status bar data
  const fetchStatus = useCallback(async () => {
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch('/api/status-bar', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        setData({
          nextEvent: json.nextEvent ?? null,
          activeTasks: json.tasks?.due ?? 0,
          reminders: { total: json.reminders?.active ?? 0, overdue: json.reminders?.overdue ?? 0 },
          agentStatus: json.streaming ? 'busy' : 'idle',
          gatewayConnected: json.gatewayConnected ?? false,
          activeAgents: json.activeAgents ?? 0,
          pendingTasks: json.pendingTasks ?? 0,
        });
      }
    } catch {
      // Silently fail — status bar is non-critical
    }
  }, []);

  // Fetch notification unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch('/api/notifications/unread-count', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        const newCount = json.count || 0;
        if (newCount > unreadCount && unreadCount > 0) {
          fetchNotifications();
        }
        setUnreadCount(newCount);
      }
    } catch {
      /* non-critical */
    }
  }, [unreadCount]);

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch(`/api/notifications?since=0&limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        const items: Notification[] = json.notifications || [];
        setNotifications(items);
        const lastCheck = lastNotifCheck.current;
        for (const n of items) {
          if (n.createdAt > lastCheck && !n.read && IMPORTANT_TYPES.has(n.type)) {
            window.dispatchEvent(
              new CustomEvent('shre-system-notification', {
                detail: { title: n.title, body: n.body, type: n.type },
              }),
            );
          }
        }
        if (items.length > 0) {
          lastNotifCheck.current = Math.max(...items.map((n) => n.createdAt));
        }
      }
    } catch {
      /* non-critical */
    }
  }, []);

  // Mark a notification as read
  const markRead = useCallback(async (id: string) => {
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* non-critical */
    }
  }, []);

  // Dismiss a single notification
  const dismissNotif = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* non-critical */
    }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const ids = notifications.map((n) => n.id);
      if (ids.length === 0) return;
      await fetch(`/api/notifications/bulk`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      /* non-critical */
    }
  }, [notifications]);

  // Fetch live tasks for the Tasks tab
  const fetchLiveTasks = useCallback(async () => {
    setLiveTasksLoading(true);
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch('/api/tasks?limit=50', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const tasks: LiveTask[] = Array.isArray(data) ? data : data.tasks || [];
        // Sort: active first (in_progress, started, working_on), then by updated_at desc
        const activeStatuses = new Set([
          'in_progress',
          'started',
          'working_on',
          'pending_review',
          'review_needed',
          'blocked',
          'roadblock',
        ]);
        tasks.sort((a, b) => {
          const aActive = activeStatuses.has(a.status) ? 0 : 1;
          const bActive = activeStatuses.has(b.status) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return (b.updated_at || b.created_at) - (a.updated_at || a.created_at);
        });
        setLiveTasks(tasks);
      }
    } catch {
      /* non-critical */
    }
    setLiveTasksLoading(false);
  }, []);

  // Fetch live agents for the Agents tab
  const fetchLiveAgents = useCallback(async () => {
    setLiveAgentsLoading(true);
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch('/api/agents', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setLiveAgents(Array.isArray(data) ? data : []);
      }
    } catch {
      /* non-critical */
    }
    setLiveAgentsLoading(false);
  }, []);

  // Fetch live services for the Services tab
  const fetchLiveServices = useCallback(async () => {
    setLiveServicesLoading(true);
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      const res = await fetch('/api/platform-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setLiveServices(data.services || []);
      }
    } catch {
      /* non-critical */
    }
    setLiveServicesLoading(false);
  }, []);

  // ── Task actions ──
  const authHeaders = useCallback((): Record<string, string> => {
    const token =
      sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const taskAction = useCallback(
    async (taskId: string, action: 'cancel' | 'escalate', e: React.MouseEvent) => {
      e.stopPropagation();
      setTaskActionPending(taskId);
      try {
        const body = action === 'cancel' ? { status: 'cancelled' } : { priority: 'critical' };
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        // Refresh tasks after action
        setTimeout(fetchLiveTasks, 500);
      } catch {
        /* non-critical */
      }
      setTaskActionPending(null);
      setTaskActionMenu(null);
    },
    [authHeaders, fetchLiveTasks],
  );

  const reassignTask = useCallback(
    async (taskId: string, agentId: string) => {
      setTaskActionPending(taskId);
      try {
        await fetch(`/api/tasks/${taskId}/assignment`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ agent: agentId, reason: 'manual reassignment' }),
        });
        setTimeout(fetchLiveTasks, 500);
      } catch {
        /* non-critical */
      }
      setTaskActionPending(null);
      setShowAssignDropdown(null);
      setTaskActionMenu(null);
    },
    [authHeaders, fetchLiveTasks],
  );

  // Restart a down service
  const restartService = useCallback(
    async (serviceName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setRestartingService(serviceName);
      try {
        const res = await fetch(`/api/services/${serviceName}/restart`, {
          method: 'POST',
          headers: authHeaders(),
        });
        const data = await res.json();
        if (data.ok) {
          // Refresh services list after successful restart
          setTimeout(fetchLiveServices, 1000);
        }
      } catch {
        /* non-critical */
      }
      setRestartingService(null);
    },
    [authHeaders, fetchLiveServices],
  );

  // Navigate to TasksView when clicking a task
  const navigateToTask = useCallback(
    (taskId: string) => {
      setBellOpen(false);
      actions.setView('tasks' as any);
      window.dispatchEvent(new CustomEvent('shre-navigate', { detail: { view: 'tasks', taskId } }));
    },
    [actions],
  );

  // Fetch live data when respective tabs are selected + auto-refresh every 30s
  useEffect(() => {
    if (!bellOpen) return;
    const fetchForTab = () => {
      if (notifFilter === 'tasks') fetchLiveTasks();
      else if (notifFilter === 'agents') fetchLiveAgents();
      else if (notifFilter === 'services') fetchLiveServices();
      else if (notifFilter === 'all') {
        // Fetch all live data for the summary cards
        fetchLiveTasks();
        fetchLiveAgents();
        fetchLiveServices();
      }
    };
    fetchForTab();
    const interval = setInterval(fetchForTab, 30_000);
    return () => clearInterval(interval);
  }, [bellOpen, notifFilter, fetchLiveTasks, fetchLiveAgents, fetchLiveServices]);

  // WebSocket for real-time panel updates
  useEffect(() => {
    if (!bellOpen) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    function connect() {
      ws = new WebSocket(`${proto}//${location.host}/ws/notifications`);
      ws.onopen = () => {
        retries = 0;
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'panel.refresh') {
            if (msg.category === 'tasks' && notifFilter === 'tasks') fetchLiveTasks();
            else if (msg.category === 'agents' && notifFilter === 'agents') fetchLiveAgents();
            else if (msg.category === 'services' && notifFilter === 'services') fetchLiveServices();
            // Always refresh notification count
            fetchUnreadCount();
          }
          // Refresh notifications for the All tab
          if (
            msg.type?.startsWith('task.') ||
            msg.type?.startsWith('service.') ||
            msg.type?.startsWith('agent.')
          ) {
            fetchNotifications();
            fetchUnreadCount();
          }
        } catch {
          /* ignore malformed messages */
        }
      };
      ws.onclose = () => {
        if (retries < 4) {
          const delay = Math.min(1000 * Math.pow(2, retries), 8000);
          retryTimeout = setTimeout(connect, delay);
          retries++;
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
    }
    connect();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [
    bellOpen,
    notifFilter,
    fetchLiveTasks,
    fetchLiveAgents,
    fetchLiveServices,
    fetchNotifications,
    fetchUnreadCount,
  ]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  // Fetch on mount (deferred by 2s), then every 60s
  useEffect(() => {
    const initial = setTimeout(() => {
      fetchStatus();
      fetchUnreadCount();
    }, 2000);
    const id = setInterval(() => {
      fetchStatus();
      fetchUnreadCount();
    }, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [fetchStatus, fetchUnreadCount]);

  // Tick the countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Mic toggle — check permission, then start/stop voice assistant
  const toggleMic = useCallback(async () => {
    if (recording || micEnabled) {
      // Turn off — stop recording AND persist the off state
      setRecording(false);
      setMicEnabled(false);
      window.dispatchEvent(new CustomEvent('shre-voice-stop'));
      return;
    }

    // Check microphone permission before starting
    try {
      const permResult = await navigator.permissions?.query({ name: 'microphone' as any }).catch(() => null);
      const currentPerm = permResult?.state;

      if (currentPerm === 'denied') {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
        const msg = isIOS
          ? 'Microphone is blocked. Open Settings \u2192 Safari \u2192 Microphone and allow for this site.'
          : 'Microphone is blocked. Click the lock icon in the address bar \u2192 Site settings \u2192 Microphone \u2192 Allow.';
        alert(msg);
        return;
      }

      // Request mic access (triggers browser prompt if needed)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Release the permission-check stream — VoiceAssistant will create its own
      stream.getTracks().forEach((t) => t.stop());

      // Persist on state + open voice assistant
      setRecording(true);
      setMicEnabled(true);
      window.dispatchEvent(new CustomEvent('shre-voice-start'));
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
        const msg = isIOS
          ? 'Microphone access denied. Go to Settings \u2192 Safari \u2192 Microphone to enable.'
          : 'Microphone access denied. Click the lock/info icon in the address bar to allow microphone.';
        alert(msg);
      } else if (err?.name === 'NotFoundError') {
        alert('No microphone found on this device.');
      } else {
        console.warn('[StatusBar] Mic error:', err);
        alert('Could not access microphone: ' + (err?.message || 'Unknown error'));
      }
    }
  }, [recording, micEnabled, setMicEnabled]);

  // Listen for external voice-stop AND voice-start events (sync with ChatComposer/VoiceAssistant)
  useEffect(() => {
    const handleStop = () => {
      setRecording(false);
      setMicEnabled(false);
    };
    const handleStart = () => {
      setRecording(true);
      setMicEnabled(true);
    };
    window.addEventListener('shre-voice-stop', handleStop);
    window.addEventListener('shre-voice-start', handleStart);
    return () => {
      window.removeEventListener('shre-voice-stop', handleStop);
      window.removeEventListener('shre-voice-start', handleStart);
    };
  }, [setMicEnabled]);

  // Countdown for next event
  const countdown = data.nextEvent ? formatCountdown(data.nextEvent.startsAt - now) : null;

  // Connection status color
  const connColor = data.gatewayConnected ? '#22c55e' : '#ef4444';

  return (
    <div className="status-bar" style={styles.bar}>
      {/* Hamburger — sidebar toggle */}
      <button
        onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
        className="shrink-0 p-2 md:p-1 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: 'var(--c-text-3)', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label={state.sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg
          className="h-[18px] w-[18px] md:h-[16px] md:w-[16px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {/* Connection dot + Agent name + Chat icon */}
      <div className="status-bar-item flex items-center" style={{ ...styles.item, gap: 6 }}>
        <span
          className="shrink-0"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: connColor,
            boxShadow: data.gatewayConnected ? `0 0 6px ${connColor}` : 'none',
          }}
          title={data.gatewayConnected ? 'Connected' : 'Disconnected'}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)', lineHeight: 1 }}>
          {currentAgent.name}
        </span>
        <svg
          className="shrink-0"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--c-text-3)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>

      {/* Routing mode indicator */}
      <RoutingModeIndicator />

      {/* Active agents badge */}
      {data.activeAgents > 0 && (
        <div
          className="status-bar-item hidden md:flex"
          style={styles.item}
          title={`${data.activeAgents} active agent${data.activeAgents !== 1 ? 's' : ''}`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={styles.badge}>{data.activeAgents}</span>
        </div>
      )}

      {/* Pending tasks badge */}
      {data.pendingTasks > 0 && (
        <div
          className="status-bar-item hidden md:flex"
          style={styles.item}
          title={`${data.pendingTasks} pending task${data.pendingTasks !== 1 ? 's' : ''}`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ ...styles.badge, color: 'var(--c-accent)' }}>{data.pendingTasks}</span>
        </div>
      )}

      {/* Next event countdown */}
      {data.nextEvent && (
        <div className="status-bar-item hidden md:flex" style={styles.item}>
          <svg
            className="shrink-0"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={styles.label} className="truncate max-w-[140px]">
            {data.nextEvent.title}
          </span>
          <span style={styles.countdown}>{countdown}</span>
        </div>
      )}

      {/* Reminders badge */}
      {data.reminders.total > 0 && (
        <div className="status-bar-item hidden md:flex" style={styles.item}>
          <div style={{ position: 'relative' }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {data.reminders.overdue > 0 && <span style={styles.redDot} />}
          </div>
          <span style={styles.badge}>{data.reminders.total}</span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Agent status dot */}
      <div
        className="status-bar-item hidden md:flex"
        style={styles.item}
        title={agentBusy ? 'Agent busy' : 'Agent idle'}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: agentBusy ? '#22c55e' : 'var(--c-text-5)',
            boxShadow: agentBusy ? '0 0 8px #22c55e' : 'none',
            transition: 'all 0.3s ease',
            animation: agentBusy ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
        <span style={{ ...styles.label, fontSize: 10 }}>{agentBusy ? 'busy' : 'idle'}</span>
      </div>

      {/* Router / OpenClaw toggle */}
      <button
        onClick={() => {
          const curr = localStorage.getItem('shre-openclaw-mode') === 'true';
          const next = !curr;
          localStorage.setItem('shre-openclaw-mode', String(next));
          window.dispatchEvent(
            new StorageEvent('storage', { key: 'shre-openclaw-mode', newValue: String(next) }),
          );
          setData((d) => ({ ...d }));
        }}
        style={{
          ...styles.pillBtn,
          background:
            localStorage.getItem('shre-openclaw-mode') === 'true'
              ? 'rgba(168,85,247,0.15)'
              : 'rgba(59,130,246,0.1)',
          color: localStorage.getItem('shre-openclaw-mode') === 'true' ? '#a855f7' : '#3b82f6',
          border: `1px solid ${localStorage.getItem('shre-openclaw-mode') === 'true' ? 'rgba(168,85,247,0.25)' : 'rgba(59,130,246,0.2)'}`,
        }}
        title={
          localStorage.getItem('shre-openclaw-mode') === 'true'
            ? 'OpenClaw mode — click to switch to Router'
            : 'Router mode — click to switch to OpenClaw'
        }
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background:
              localStorage.getItem('shre-openclaw-mode') === 'true' ? '#a855f7' : '#3b82f6',
          }}
        />
        {localStorage.getItem('shre-openclaw-mode') === 'true' ? 'OC' : 'R'}
      </button>

      {/* Language selector */}
      <select
        value={localStorage.getItem('shre-user-language') || ''}
        onChange={(e) => {
          const lang = e.target.value;
          if (lang) localStorage.setItem('shre-user-language', lang);
          else localStorage.removeItem('shre-user-language');
          setData((d) => ({ ...d }));
        }}
        style={{
          ...styles.pillBtn,
          background: 'rgba(59,130,246,0.1)',
          color: 'var(--c-text-secondary, #94a3b8)',
          border: '1px solid rgba(59,130,246,0.2)',
          cursor: 'pointer',
          appearance: 'none' as const,
          WebkitAppearance: 'none' as const,
        }}
        title="Chat language preference"
      >
        <option value="">EN</option>
        <option value="es">ES</option>
        <option value="hi">HI</option>
        <option value="gu">GU</option>
        <option value="zh">ZH</option>
        <option value="fr">FR</option>
        <option value="pt">PT</option>
        <option value="de">DE</option>
        <option value="ar">AR</option>
        <option value="ja">JA</option>
      </select>

      {/* Notification bell — opens right slider */}
      <div ref={bellRef} style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setBellOpen(!bellOpen);
            if (!bellOpen) fetchNotifications();
          }}
          className="status-bar-item flex"
          style={{ ...styles.iconBtn, position: 'relative', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          aria-label="Notifications"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -4,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: 'var(--c-danger, #ef4444)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
                boxShadow: '0 0 4px rgba(239,68,68,0.5)',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Mic button — persistent on/off with permission check */}
      <button
        onClick={toggleMic}
        style={{
          ...styles.micBtn,
          background: recording || micEnabled
            ? 'var(--c-accent, #6366f1)'
            : 'var(--c-bg-hover, rgba(255,255,255,0.08))',
          animation: recording ? 'mic-pulse 1.5s ease-in-out infinite' : 'none',
        }}
        title={
          recording
            ? 'Tap to stop voice input'
            : micEnabled
              ? 'Voice input ON \u2014 tap to turn off'
              : 'Tap to start voice input'
        }
        aria-label={
          recording
            ? 'Stop recording'
            : micEnabled
              ? 'Disable voice input'
              : 'Start voice input'
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={recording || micEnabled ? '#fff' : 'currentColor'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {micEnabled && !recording ? (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <circle cx="18" cy="18" r="4" fill="#22c55e" stroke="#22c55e" />
            </>
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      </button>

      {/* ── Notification Slide-in Panel (right side) ── */}
      {createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 199,
              background: 'rgba(0,0,0,0.3)',
              opacity: bellOpen ? 1 : 0,
              pointerEvents: bellOpen ? 'auto' : 'none',
              transition: 'opacity 0.25s ease',
            }}
            onClick={() => setBellOpen(false)}
          />
          {/* Panel */}
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 200,
              width: 360,
              maxWidth: '90vw',
              transform: bellOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--c-bg-2)',
              borderLeft: '1px solid var(--c-border-1)',
              boxShadow: bellOpen ? '-8px 0 30px rgba(0,0,0,0.3)' : 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '16px 16px 12px',
                borderBottom: '1px solid var(--c-border-2)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text-1)' }}>
                  Notifications
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAll}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: 'var(--c-text-3)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--c-danger, #ef4444)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--c-text-3)';
                      }}
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setBellOpen(false)}
                    style={{
                      background: 'var(--c-bg-hover)',
                      border: 'none',
                      cursor: 'pointer',
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--c-text-3)',
                    }}
                    aria-label="Close notifications"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 4 }}>
                {NOTIF_FILTERS.map((f) => {
                  const count =
                    f.key === 'tasks'
                      ? liveTasks.length
                      : f.key === 'agents'
                        ? liveAgents.length
                        : f.key === 'services'
                          ? liveServices.length
                          : notifications.length;
                  const active = notifFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => {
                        setNotifFilter(f.key);
                        setPanelSearch('');
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: 11,
                        fontWeight: active ? 600 : 400,
                        background: active
                          ? 'var(--c-accent, #6366f1)'
                          : 'var(--c-bg-card, var(--c-bg-1))',
                        color: active ? '#fff' : 'var(--c-text-3)',
                        border: `1px solid ${active ? 'transparent' : 'var(--c-border-2)'}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      {f.label}
                      {count > 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            background: active ? 'rgba(255,255,255,0.25)' : 'var(--c-bg-hover)',
                            padding: '1px 5px',
                            borderRadius: 8,
                            lineHeight: '14px',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content area */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifFilter === 'tasks' ? (
                /* ── Live Task Tracker (grouped, with actions) ── */
                <>
                  {/* Search + refresh bar */}
                  <div
                    style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--c-border-2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--c-text-4)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            position: 'absolute',
                            left: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search tasks..."
                          value={panelSearch}
                          onChange={(e) => setPanelSearch(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '5px 8px 5px 26px',
                            fontSize: 12,
                            background: 'var(--c-bg-1)',
                            border: '1px solid var(--c-border-2)',
                            borderRadius: 6,
                            color: 'var(--c-text-1)',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <button
                        onClick={fetchLiveTasks}
                        disabled={liveTasksLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--c-text-3)',
                          padding: '4px',
                          borderRadius: 4,
                          flexShrink: 0,
                          opacity: liveTasksLoading ? 0.5 : 1,
                        }}
                        title="Refresh"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            animation: liveTasksLoading ? 'spin 1s linear infinite' : 'none',
                          }}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
                      {liveTasks.length} task{liveTasks.length !== 1 ? 's' : ''}
                      {panelSearch ? ` · filtered` : ''} · auto-refreshes
                    </div>
                  </div>
                  {liveTasksLoading && liveTasks.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading tasks...</div>
                    </div>
                  ) : liveTasks.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--c-text-5)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ margin: '0 auto 12px' }}
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>No tasks found</div>
                    </div>
                  ) : (
                    TASK_GROUPS.map((group) => {
                      const searchLower = panelSearch.toLowerCase();
                      const groupTasks = liveTasks.filter(
                        (t) =>
                          group.statuses.has(t.status) &&
                          (!panelSearch ||
                            t.title.toLowerCase().includes(searchLower) ||
                            t.agent?.toLowerCase().includes(searchLower) ||
                            t.status.includes(searchLower)),
                      );
                      if (groupTasks.length === 0) return null;
                      return (
                        <div key={group.label}>
                          {/* Group header */}
                          <div
                            style={{
                              padding: '6px 16px',
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              color: 'var(--c-text-4)',
                              background: 'var(--c-bg-1)',
                              borderBottom: '1px solid var(--c-border-2)',
                              position: 'sticky',
                              top: 0,
                              zIndex: 1,
                            }}
                          >
                            {group.label} ({groupTasks.length})
                          </div>
                          {groupTasks.map((task) => {
                            const cfg = TASK_STATUS_CONFIG[task.status] || {
                              color: '#6b7280',
                              label: task.status,
                              icon: '\u25cb',
                            };
                            const isActive = ['in_progress', 'started', 'working_on'].includes(
                              task.status,
                            );
                            const isPending = taskActionPending === task.id;
                            const isTerminal = [
                              'done',
                              'completed',
                              'cancelled',
                              'qa_tested',
                              'production_ready',
                            ].includes(task.status);
                            return (
                              <div
                                key={task.id}
                                onClick={() => navigateToTask(task.id)}
                                style={{
                                  padding: '10px 16px',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid var(--c-border-2)',
                                  transition: 'background 0.15s',
                                  opacity: isPending ? 0.5 : 1,
                                  position: 'relative',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background =
                                    'var(--c-bg-hover)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      flexShrink: 0,
                                      background: cfg.color,
                                      boxShadow: isActive ? `0 0 6px ${cfg.color}` : 'none',
                                      animation: isActive
                                        ? 'pulse-dot 2s ease-in-out infinite'
                                        : 'none',
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      background: `${cfg.color}20`,
                                      color: cfg.color,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {cfg.icon} {cfg.label}
                                  </span>
                                  {task.priority &&
                                    ['high', 'critical'].includes(task.priority) && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 600,
                                          color:
                                            task.priority === 'critical' ? '#ef4444' : '#f59e0b',
                                        }}
                                      >
                                        {task.priority === 'critical' ? '!!' : '!'}
                                      </span>
                                    )}
                                  {/* Action menu trigger */}
                                  {!isTerminal && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTaskActionMenu(
                                          taskActionMenu === task.id ? null : task.id,
                                        );
                                        setShowAssignDropdown(null);
                                      }}
                                      style={{
                                        marginLeft: 'auto',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--c-text-4)',
                                        padding: '2px 4px',
                                        borderRadius: 4,
                                        fontSize: 14,
                                        lineHeight: 1,
                                      }}
                                      title="Actions"
                                    >
                                      &#x22EE;
                                    </button>
                                  )}
                                </div>
                                {/* Action dropdown */}
                                {taskActionMenu === task.id && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 16,
                                      top: 32,
                                      zIndex: 10,
                                      background: 'var(--c-bg-2)',
                                      border: '1px solid var(--c-border-1)',
                                      borderRadius: 8,
                                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                                      padding: 4,
                                      minWidth: 140,
                                    }}
                                  >
                                    <button
                                      onClick={(e) => taskAction(task.id, 'escalate', e)}
                                      style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '6px 10px',
                                        borderRadius: 4,
                                        fontSize: 12,
                                        color: '#f59e0b',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.background =
                                          'var(--c-bg-hover)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.background = 'none';
                                      }}
                                    >
                                      Escalate to critical
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAssignDropdown(
                                          showAssignDropdown === task.id ? null : task.id,
                                        );
                                      }}
                                      style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '6px 10px',
                                        borderRadius: 4,
                                        fontSize: 12,
                                        color: 'var(--c-text-2)',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.background =
                                          'var(--c-bg-hover)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.background = 'none';
                                      }}
                                    >
                                      Reassign agent
                                    </button>
                                    {showAssignDropdown === task.id && liveAgents.length > 0 && (
                                      <div
                                        style={{
                                          padding: '4px 0',
                                          borderTop: '1px solid var(--c-border-2)',
                                          marginTop: 2,
                                        }}
                                      >
                                        {liveAgents
                                          .filter((a) => a.id !== task.agent)
                                          .slice(0, 8)
                                          .map((a) => (
                                            <button
                                              key={a.id}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                reassignTask(task.id, a.id);
                                              }}
                                              style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px 10px 4px 18px',
                                                borderRadius: 4,
                                                fontSize: 11,
                                                color: 'var(--c-text-2)',
                                              }}
                                              onMouseEnter={(e) => {
                                                (e.currentTarget as HTMLElement).style.background =
                                                  'var(--c-bg-hover)';
                                              }}
                                              onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLElement).style.background =
                                                  'none';
                                              }}
                                            >
                                              {a.name}
                                            </button>
                                          ))}
                                      </div>
                                    )}
                                    <div
                                      style={{
                                        borderTop: '1px solid var(--c-border-2)',
                                        marginTop: 2,
                                        paddingTop: 2,
                                      }}
                                    >
                                      <button
                                        onClick={(e) => taskAction(task.id, 'cancel', e)}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '6px 10px',
                                          borderRadius: 4,
                                          fontSize: 12,
                                          color: '#ef4444',
                                        }}
                                        onMouseEnter={(e) => {
                                          (e.currentTarget as HTMLElement).style.background =
                                            'var(--c-bg-hover)';
                                        }}
                                        onMouseLeave={(e) => {
                                          (e.currentTarget as HTMLElement).style.background =
                                            'none';
                                        }}
                                      >
                                        Cancel task
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: 'var(--c-text-1)',
                                    lineHeight: 1.4,
                                    marginBottom: 4,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {task.title}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {task.agent && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: 'var(--c-text-2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 3,
                                      }}
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                      </svg>
                                      {task.agent}
                                    </span>
                                  )}
                                  {task.quality_score != null && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color:
                                          task.quality_score >= 0.8
                                            ? '#22c55e'
                                            : task.quality_score >= 0.5
                                              ? '#f59e0b'
                                              : '#ef4444',
                                      }}
                                    >
                                      Q: {(task.quality_score * 100).toFixed(0)}%
                                    </span>
                                  )}
                                  {task.completion_ratio != null &&
                                    task.completion_ratio > 0 &&
                                    task.completion_ratio < 1 && (
                                      <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                                        {(task.completion_ratio * 100).toFixed(0)}% done
                                      </span>
                                    )}
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: 'var(--c-text-4)',
                                      marginLeft: 'auto',
                                    }}
                                  >
                                    {new Date(task.updated_at || task.created_at).toLocaleString(
                                      [],
                                      {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      },
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </>
              ) : notifFilter === 'agents' ? (
                /* ── Live Agents Panel (enriched with fleet data) ── */
                <>
                  <div
                    style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--c-border-2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--c-text-4)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            position: 'absolute',
                            left: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search agents..."
                          value={panelSearch}
                          onChange={(e) => setPanelSearch(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '5px 8px 5px 26px',
                            fontSize: 12,
                            background: 'var(--c-bg-1)',
                            border: '1px solid var(--c-border-2)',
                            borderRadius: 6,
                            color: 'var(--c-text-1)',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <button
                        onClick={fetchLiveAgents}
                        disabled={liveAgentsLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--c-text-3)',
                          padding: '4px',
                          borderRadius: 4,
                          flexShrink: 0,
                          opacity: liveAgentsLoading ? 0.5 : 1,
                        }}
                        title="Refresh"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            animation: liveAgentsLoading ? 'spin 1s linear infinite' : 'none',
                          }}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
                      {liveAgents.filter((a) => a.status === 'busy').length} busy /{' '}
                      {liveAgents.length} total
                    </div>
                  </div>
                  {liveAgentsLoading && liveAgents.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                        Loading agents...
                      </div>
                    </div>
                  ) : liveAgents.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--c-text-5)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ margin: '0 auto 12px' }}
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                        No agents registered
                      </div>
                    </div>
                  ) : (
                    liveAgents
                      .filter(
                        (a) =>
                          !panelSearch ||
                          a.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                          a.model.toLowerCase().includes(panelSearch.toLowerCase()) ||
                          a.currentTask?.title?.toLowerCase().includes(panelSearch.toLowerCase()),
                      )
                      .map((agent) => {
                        const isBusy = agent.status === 'busy';
                        const task = agent.currentTask;
                        return (
                          <div
                            key={agent.id}
                            style={{
                              padding: '10px 16px',
                              borderBottom: '1px solid var(--c-border-2)',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--c-bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  background: isBusy ? '#8b5cf6' : '#22c55e',
                                  animation: isBusy ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: 'var(--c-text-1)',
                                  }}
                                >
                                  {agent.name || agent.id}
                                </div>
                                <div
                                  style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}
                                >
                                  {agent.model}
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: isBusy ? '#8b5cf620' : '#22c55e20',
                                  color: isBusy ? '#8b5cf6' : '#22c55e',
                                }}
                              >
                                {isBusy ? 'busy' : 'idle'}
                              </span>
                            </div>
                            {/* Current task info */}
                            {task && (
                              <div
                                style={{
                                  marginTop: 6,
                                  marginLeft: 16,
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  background: 'var(--c-bg-1)',
                                  fontSize: 11,
                                  color: 'var(--c-text-2)',
                                }}
                              >
                                <div
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 500,
                                  }}
                                >
                                  {task.title}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    marginTop: 2,
                                    color: 'var(--c-text-4)',
                                    fontSize: 10,
                                  }}
                                >
                                  {task.phase && <span>{task.phase}</span>}
                                  {task.progress && <span>{task.progress}</span>}
                                  {task.elapsedMs != null && (
                                    <span>{Math.round(task.elapsedMs / 60000)}m elapsed</span>
                                  )}
                                  {task.type && (
                                    <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
                                      {task.type}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </>
              ) : notifFilter === 'services' ? (
                /* ── Live Services Panel (enriched with latency/uptime) ── */
                <>
                  <div
                    style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--c-border-2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--c-text-4)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            position: 'absolute',
                            left: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search services..."
                          value={panelSearch}
                          onChange={(e) => setPanelSearch(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '5px 8px 5px 26px',
                            fontSize: 12,
                            background: 'var(--c-bg-1)',
                            border: '1px solid var(--c-border-2)',
                            borderRadius: 6,
                            color: 'var(--c-text-1)',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <button
                        onClick={fetchLiveServices}
                        disabled={liveServicesLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--c-text-3)',
                          padding: '4px',
                          borderRadius: 4,
                          flexShrink: 0,
                          opacity: liveServicesLoading ? 0.5 : 1,
                        }}
                        title="Refresh"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            animation: liveServicesLoading ? 'spin 1s linear infinite' : 'none',
                          }}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
                      {liveServices.filter((s) => s.healthy).length}/{liveServices.length} healthy
                    </div>
                  </div>
                  {liveServicesLoading && liveServices.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                        Loading services...
                      </div>
                    </div>
                  ) : liveServices.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--c-text-5)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ margin: '0 auto 12px' }}
                      >
                        <rect x="2" y="2" width="20" height="8" rx="2" />
                        <rect x="2" y="14" width="20" height="8" rx="2" />
                        <circle cx="6" cy="6" r="1" />
                        <circle cx="6" cy="18" r="1" />
                      </svg>
                      <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                        No service data available
                      </div>
                    </div>
                  ) : (
                    liveServices
                      .filter(
                        (s) =>
                          !panelSearch ||
                          s.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                          s.status?.toLowerCase().includes(panelSearch.toLowerCase()),
                      )
                      .map((svc) => {
                        const isRestarting = restartingService === svc.name;
                        return (
                          <div
                            key={svc.name}
                            style={{
                              padding: '10px 16px',
                              borderBottom: '1px solid var(--c-border-2)',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--c-bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  background: svc.healthy ? '#22c55e' : '#ef4444',
                                  boxShadow: !svc.healthy ? '0 0 6px #ef4444' : 'none',
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: 'var(--c-text-1)',
                                  }}
                                >
                                  {svc.name}
                                  {svc.port && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: 'var(--c-text-4)',
                                        marginLeft: 4,
                                      }}
                                    >
                                      :{svc.port}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    fontSize: 10,
                                    color: 'var(--c-text-4)',
                                    marginTop: 2,
                                  }}
                                >
                                  {svc.latency_ms != null && (
                                    <span
                                      style={{
                                        color:
                                          svc.latency_ms < 100
                                            ? '#22c55e'
                                            : svc.latency_ms < 500
                                              ? '#f59e0b'
                                              : '#ef4444',
                                      }}
                                    >
                                      {svc.latency_ms}ms
                                    </span>
                                  )}
                                  {svc.uptime_pct != null && (
                                    <span
                                      style={{
                                        color:
                                          svc.uptime_pct >= 99.9
                                            ? '#22c55e'
                                            : svc.uptime_pct >= 95
                                              ? '#f59e0b'
                                              : '#ef4444',
                                      }}
                                    >
                                      {svc.uptime_pct.toFixed(1)}% uptime
                                    </span>
                                  )}
                                  {svc.type && <span>{svc.type}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {!svc.healthy && (
                                  <button
                                    onClick={(e) => restartService(svc.name, e)}
                                    disabled={isRestarting}
                                    style={{
                                      background: isRestarting ? 'var(--c-bg-hover)' : '#ef444415',
                                      border: '1px solid #ef444430',
                                      borderRadius: 4,
                                      padding: '2px 8px',
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: '#ef4444',
                                      cursor: isRestarting ? 'wait' : 'pointer',
                                      opacity: isRestarting ? 0.6 : 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={`Restart ${svc.name}`}
                                  >
                                    {isRestarting ? (
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ animation: 'spin 1s linear infinite' }}
                                      >
                                        <path d="M23 4v6h-6" />
                                        <path d="M1 20v-6h6" />
                                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                      </svg>
                                    ) : (
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                      </svg>
                                    )}
                                    {isRestarting ? 'Starting...' : 'Start'}
                                  </button>
                                )}
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: svc.healthy ? '#22c55e20' : '#ef444420',
                                    color: svc.healthy ? '#22c55e' : '#ef4444',
                                  }}
                                >
                                  {svc.status || (svc.healthy ? 'up' : 'down')}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </>
              ) : (
                /* ── "All" Tab — live summary cards + notification stream ── */
                <>
                  {/* Search bar */}
                  <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--c-border-2)' }}>
                    <div style={{ position: 'relative' }}>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--c-text-4)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search notifications..."
                        value={panelSearch}
                        onChange={(e) => setPanelSearch(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 8px 5px 26px',
                          fontSize: 12,
                          background: 'var(--c-bg-1)',
                          border: '1px solid var(--c-border-2)',
                          borderRadius: 6,
                          color: 'var(--c-text-1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  {/* Live summary cards at top */}
                  {(() => {
                    const activeTasks = liveTasks.filter((t) =>
                      ['in_progress', 'started', 'working_on'].includes(t.status),
                    );
                    const blockedTasks = liveTasks.filter((t) =>
                      ['blocked', 'roadblock'].includes(t.status),
                    );
                    const unhealthySvcs = liveServices.filter((s) => !s.healthy);
                    const busyAgents = liveAgents.filter((a) => a.status === 'busy');
                    const hasLiveData =
                      activeTasks.length > 0 ||
                      blockedTasks.length > 0 ||
                      unhealthySvcs.length > 0 ||
                      busyAgents.length > 0;
                    if (!hasLiveData) return null;
                    return (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--c-border-2)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                        }}
                      >
                        {activeTasks.length > 0 && (
                          <button
                            onClick={() => setNotifFilter('tasks')}
                            style={{
                              background: '#8b5cf615',
                              border: '1px solid #8b5cf630',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              color: '#8b5cf6',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#8b5cf6',
                                animation: 'pulse-dot 2s ease-in-out infinite',
                              }}
                            />
                            {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}
                          </button>
                        )}
                        {blockedTasks.length > 0 && (
                          <button
                            onClick={() => setNotifFilter('tasks')}
                            style={{
                              background: '#ef444415',
                              border: '1px solid #ef444430',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            {blockedTasks.length} blocked
                          </button>
                        )}
                        {busyAgents.length > 0 && (
                          <button
                            onClick={() => setNotifFilter('agents')}
                            style={{
                              background: '#8b5cf615',
                              border: '1px solid #8b5cf630',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              color: '#8b5cf6',
                              cursor: 'pointer',
                            }}
                          >
                            {busyAgents.length} agent{busyAgents.length !== 1 ? 's' : ''} busy
                          </button>
                        )}
                        {unhealthySvcs.length > 0 && (
                          <button
                            onClick={() => setNotifFilter('services')}
                            style={{
                              background: '#ef444415',
                              border: '1px solid #ef444430',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 11,
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            {unhealthySvcs.length} service{unhealthySvcs.length !== 1 ? 's' : ''}{' '}
                            down
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {/* Notification stream */}
                  {(() => {
                    const filtered = panelSearch
                      ? notifications.filter(
                          (n) =>
                            n.title.toLowerCase().includes(panelSearch.toLowerCase()) ||
                            n.body?.toLowerCase().includes(panelSearch.toLowerCase()) ||
                            n.source?.toLowerCase().includes(panelSearch.toLowerCase()),
                        )
                      : notifications;
                    return filtered.length === 0 ? (
                      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--c-text-5)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ margin: '0 auto 12px' }}
                        >
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                          {panelSearch ? 'No matching notifications' : 'No notifications yet'}
                        </div>
                      </div>
                    ) : (
                      filtered.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.read) markRead(n.id);
                          }}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--c-border-2)',
                            background: n.read
                              ? 'transparent'
                              : 'var(--c-accent-soft, rgba(99,141,255,0.08))',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = n.read
                              ? 'transparent'
                              : 'var(--c-accent-soft, rgba(99,141,255,0.08))';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                flexShrink: 0,
                                marginTop: 5,
                                background:
                                  n.type?.includes('failed') || n.type?.includes('unhealthy')
                                    ? 'var(--c-danger, #ef4444)'
                                    : n.type?.includes('quality')
                                      ? '#f59e0b'
                                      : 'var(--c-accent)',
                              }}
                            />
                            <span style={{ fontSize: 15, flexShrink: 0 }}>
                              {NOTIF_ICONS[n.type] || '\ud83d\udd14'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: n.read ? 400 : 600,
                                  color: 'var(--c-text-1)',
                                  lineHeight: 1.4,
                                }}
                              >
                                {n.title}
                              </div>
                              {n.body && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: 'var(--c-text-2)',
                                    marginTop: 4,
                                    lineHeight: 1.4,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {n.body}
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: 'var(--c-text-3)', marginTop: 5 }}>
                                {new Date(n.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                                {n.source && <span> &middot; {n.source}</span>}
                              </div>
                            </div>
                            <button
                              onClick={(e) => dismissNotif(n.id, e)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--c-text-3)',
                                padding: '4px',
                                flexShrink: 0,
                                borderRadius: 6,
                                transition: 'color 0.15s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--c-danger)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--c-text-3)';
                              }}
                              title="Dismiss"
                              aria-label="Dismiss notification"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Inline styles */}
      <style>{`
        .status-bar {
          position: relative;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 38px;
          padding: 0 10px;
          padding-top: env(safe-area-inset-top, 0px);
          flex-shrink: 0;
          background: color-mix(in srgb, var(--c-bg-2, #0f0f1a) 80%, transparent);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          border-bottom: 1px solid var(--c-border-1, rgba(255,255,255,0.06));
          font-family: inherit;
          color: var(--c-text-2, #a1a1aa);
          user-select: none;
        }
        .pwa-mode .status-bar { padding-top: 0; }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--c-accent, rgba(99, 102, 241, 0.6)); }
          50% { box-shadow: 0 0 0 8px transparent; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 767px) {
          .status-bar { padding: 0 6px; gap: 6px; }
        }
      `}</style>
    </div>
  );
}

// ── Inline style objects ─────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  bar: {},
  item: {
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  label: {
    color: 'var(--c-text-3, #71717a)',
    fontSize: 11,
    lineHeight: 1,
  },
  countdown: {
    color: 'var(--c-accent, #6366f1)',
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--c-text-2, #a1a1aa)',
  },
  redDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--c-danger, #ef4444)',
    boxShadow: '0 0 4px #ef4444',
  },
  iconBtn: {
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--c-text-2, #a1a1aa)',
    flexShrink: 0,
  },
  pillBtn: {
    minHeight: 32,
    height: 'auto',
    padding: '4px 8px',
    fontSize: 10,
    gap: 3,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--c-text-2, #a1a1aa)',
    transition: 'background 0.2s ease, box-shadow 0.2s ease',
    flexShrink: 0,
  },
};
