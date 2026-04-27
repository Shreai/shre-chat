import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp, getAgent } from './store';
import { usePreferences } from './preferences-store';
import { getOrRequestStream, releaseCachedStream } from './hooks/useVoiceRecording';
import { MemoryPanel } from './components/MemoryPanel';
import { RoutingModeIndicator, StatusBarGatewayPill } from './status-bar/GatewayIndicators';
import { NotificationPanel } from './status-bar/NotificationPanel';
import type {
  LiveAgent,
  LiveService,
  LiveTask,
  NotifFilter,
  Notification,
  StatusBarData,
} from './status-bar/types';
import { EMPTY_DATA, IMPORTANT_TYPES } from './status-bar/constants';
import { formatCountdown } from './status-bar/helpers';

interface StatusBarProps {
  customerFacing?: boolean;
}

export function StatusBar({ customerFacing = false }: StatusBarProps) {
  const { state, actions } = useApp();
  const [data, setData] = useState<StatusBarData>(EMPTY_DATA);
  const micEnabled = usePreferences((s) => s.micEnabled);
  const setMicEnabled = usePreferences((s) => s.setMicEnabled);
  const focusMode = usePreferences((s) => s.focusMode);
  const setFocusMode = usePreferences((s) => s.setFocusMode);
  const traceEnabled = usePreferences((s) => s.traceEnabled);
  const setTraceEnabled = usePreferences((s) => s.setTraceEnabled);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
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
          'failed',
          'errored',
          'crash_unrecoverable',
          'divergence',
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
    async (taskId: string, action: 'cancel' | 'escalate' | 'retry', e: React.MouseEvent) => {
      e.stopPropagation();
      setTaskActionPending(taskId);
      try {
        if (action === 'retry') {
          await fetch(`/api/tasks/${taskId}/retry`, {
            method: 'POST',
            headers: authHeaders(),
          });
        } else {
          const body = action === 'cancel' ? { status: 'cancelled' } : { priority: 'critical' };
          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(body),
          });
        }
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
      actions.setView('tasks');
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

  // Mic toggle — triggers ChatComposer's push-to-talk (text goes to input box)
  const toggleMic = useCallback(async () => {
    if (recording || micEnabled) {
      // Turn off — stop recording, text stays in textarea for user to send
      setRecording(false);
      setMicEnabled(false);
      window.dispatchEvent(new CustomEvent('shre-mic-stop'));
      // Release mic hardware so Android/iOS stops showing the mic indicator
      releaseCachedStream();
      return;
    }

    // Request mic access — always attempt getUserMedia directly.
    // The Permissions API (navigator.permissions.query) is unreliable on Android:
    // it can return 'denied' for site-level state even when the OS permission is granted,
    // so we skip the pre-check and let getUserMedia be the source of truth.
    try {
      await getOrRequestStream();

      // Persist on state + trigger ChatComposer mic recording (push-to-talk → textarea)
      setRecording(true);
      setMicEnabled(true);
      window.dispatchEvent(new CustomEvent('shre-mic-start'));
    } catch (err: unknown) {
      const micError = err instanceof Error ? err : null;
      console.error('[StatusBar] Mic error:', micError?.name, micError?.message, err);

      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/i.test(navigator.userAgent);
      let msg: string;

      if (micError?.name === 'NotAllowedError') {
        msg = isIOS
          ? 'Mic blocked. Go to Settings \u2192 Safari \u2192 Microphone to enable.'
          : isAndroid
            ? 'Mic blocked by browser. Tap \u22ee (3 dots) \u2192 Settings \u2192 Site settings \u2192 Microphone \u2192 find this site \u2192 Allow. Then reload.'
            : 'Mic blocked. Click the lock icon in the address bar \u2192 Site settings \u2192 Microphone \u2192 Allow.';
      } else if (micError?.name === 'NotFoundError') {
        msg = 'No microphone found on this device.';
      } else if (micError?.name === 'NotReadableError') {
        msg = 'Mic is in use by another app. Close other apps using the mic and try again.';
      } else {
        msg = `Mic error: ${micError?.name || 'Unknown'} \u2014 ${micError?.message || ''}`;
      }

      // Show in both status line (visible in-app) and as a system message in chat
      actions.setStatusLine(msg);
      setTimeout(() => actions.setStatusLine(null), 8000);

      // Also dispatch as system message so it persists in chat history
      window.dispatchEvent(
        new CustomEvent('shre-system-message', {
          detail: { text: msg, type: 'error' },
        }),
      );
    }
  }, [recording, micEnabled, setMicEnabled]);

  // Listen for mic stop/start events (sync with ChatComposer recording state)
  useEffect(() => {
    const handleStop = () => {
      setRecording(false);
      setMicEnabled(false);
    };
    const handleStart = () => {
      setRecording(true);
      setMicEnabled(true);
    };
    window.addEventListener('shre-mic-stop', handleStop);
    window.addEventListener('shre-mic-start', handleStart);
    // Also listen for legacy voice events from ChatComposer
    window.addEventListener('shre-voice-stop', handleStop);
    window.addEventListener('shre-voice-start', handleStart);
    return () => {
      window.removeEventListener('shre-mic-stop', handleStop);
      window.removeEventListener('shre-mic-start', handleStart);
      window.removeEventListener('shre-voice-stop', handleStop);
      window.removeEventListener('shre-voice-start', handleStart);
    };
  }, [setMicEnabled]);

  // Countdown for next event
  const countdown = data.nextEvent ? formatCountdown(data.nextEvent.startsAt - now) : null;

  // Connection status color
  const connColor = data.gatewayConnected ? '#22c55e' : '#ef4444';

  if (customerFacing) {
    return (
      <div className="status-bar" style={styles.bar}>
        <button
          onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
          className="shrink-0 p-2 md:p-1 rounded-lg transition-colors hover:bg-white/5"
          style={{
            color: 'var(--c-text-3)',
            minWidth: 36,
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
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

        <div style={{ flex: 1 }} />

        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setBellOpen(!bellOpen);
              if (!bellOpen) fetchNotifications();
            }}
            className="status-bar-item flex"
            style={{
              ...styles.iconBtn,
              position: 'relative',
              minWidth: 36,
              minHeight: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
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

        <NotificationPanel
          bellOpen={bellOpen}
          panelRef={panelRef}
          notifications={notifications}
          notifFilter={notifFilter}
          liveTasks={liveTasks}
          liveTasksLoading={liveTasksLoading}
          liveAgents={liveAgents}
          liveAgentsLoading={liveAgentsLoading}
          liveServices={liveServices}
          liveServicesLoading={liveServicesLoading}
          taskActionMenu={taskActionMenu}
          taskActionPending={taskActionPending}
          showAssignDropdown={showAssignDropdown}
          panelSearch={panelSearch}
          restartingService={restartingService}
          setBellOpen={setBellOpen}
          setNotifFilter={setNotifFilter}
          setTaskActionMenu={setTaskActionMenu}
          setShowAssignDropdown={setShowAssignDropdown}
          setPanelSearch={setPanelSearch}
          clearAll={clearAll}
          markRead={markRead}
          dismissNotif={dismissNotif}
          navigateToTask={navigateToTask}
          fetchLiveTasks={fetchLiveTasks}
          fetchLiveAgents={fetchLiveAgents}
          fetchLiveServices={fetchLiveServices}
          taskAction={taskAction}
          reassignTask={reassignTask}
          restartService={restartService}
        />

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
        `}</style>
      </div>
    );
  }

  return (
    <div className="status-bar" style={styles.bar}>
      {/* Hamburger — sidebar toggle */}
      <button
        onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
        className="shrink-0 p-2 md:p-1 rounded-lg transition-colors hover:bg-white/5"
        style={{
          color: 'var(--c-text-3)',
          minWidth: 36,
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
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

      {/* Execution pipeline — visible when streaming/processing */}
      {agentBusy && (
        <div
          className="status-bar-item hidden md:flex"
          style={{ ...styles.item, gap: 4 }}
          title="Processing — agent is executing"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {['route', 'model', 'exec', 'score'].map((step, i) => (
              <div
                key={step}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    i === 0 ? '#22c55e' : i === 1 ? 'var(--c-accent)' : 'var(--c-border-2)',
                  animation: i <= 1 ? 'statusPulse 1.5s ease-in-out infinite' : 'none',
                  animationDelay: `${i * 200}ms`,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 10, color: 'var(--c-accent)', fontWeight: 600 }}>
            Processing
          </span>
          <style>{`
            @keyframes statusPulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.8); }
            }
          `}</style>
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

      {/* Gateway mode pill — uses RoutingModeIndicator at top, this is the compact status-bar version */}
      <StatusBarGatewayPill />

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
          style={{
            ...styles.iconBtn,
            position: 'relative',
            minWidth: 36,
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
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

      {/* Focus mode toggle — hides system/cron/automated messages */}
      <button
        onClick={() => setFocusMode(!focusMode)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: focusMode
            ? 'var(--c-accent, #6366f1)'
            : 'var(--c-bg-hover, rgba(255,255,255,0.08))',
          color: focusMode ? '#fff' : 'var(--c-text-3)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
        title={
          focusMode
            ? 'Focus mode ON — system events hidden. Click to show all'
            : 'Focus mode OFF — showing all messages. Click to hide system events'
        }
        aria-label={focusMode ? 'Disable focus mode' : 'Enable focus mode'}
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
          {focusMode ? (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 5v-2M12 21v-2M7.05 7.05L5.64 5.64M18.36 18.36l-1.41-1.41M5 12H3M21 12h-2M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41" />
            </>
          )}
        </svg>
      </button>

      {/* Memory panel toggle */}
      <button
        onClick={() => setMemoryOpen(!memoryOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: memoryOpen
            ? 'rgba(139, 92, 246, 0.25)'
            : 'var(--c-bg-hover, rgba(255,255,255,0.08))',
          color: memoryOpen ? '#8b5cf6' : 'var(--c-text-3)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
        title="Memory — view learned facts and patterns"
        aria-label="Toggle memory panel"
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
          <path d="M12 2a9 9 0 0 0-9 9c0 3.9 2.5 7.1 6 8.3V21h6v-1.7c3.5-1.2 6-4.4 6-8.3a9 9 0 0 0-9-9z" />
          <path d="M9 21h6" />
        </svg>
      </button>
      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* Trace toggle — conversation traceroute */}
      <button
        onClick={() => setTraceEnabled(!traceEnabled)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: traceEnabled
            ? 'rgba(245, 158, 11, 0.25)'
            : 'var(--c-bg-hover, rgba(255,255,255,0.08))',
          color: traceEnabled ? '#f59e0b' : 'var(--c-text-3)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
        title={
          traceEnabled
            ? 'Trace ON — showing request pipeline per message'
            : 'Trace OFF — enable to see request flow details'
        }
        aria-label={traceEnabled ? 'Disable trace mode' : 'Enable trace mode'}
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
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </button>

      {/* Mic button — persistent on/off with permission check */}
      <button
        onClick={toggleMic}
        style={{
          ...styles.micBtn,
          background:
            recording || micEnabled
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
          recording ? 'Stop recording' : micEnabled ? 'Disable voice input' : 'Start voice input'
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

      <NotificationPanel
        bellOpen={bellOpen}
        panelRef={panelRef}
        notifications={notifications}
        notifFilter={notifFilter}
        liveTasks={liveTasks}
        liveTasksLoading={liveTasksLoading}
        liveAgents={liveAgents}
        liveAgentsLoading={liveAgentsLoading}
        liveServices={liveServices}
        liveServicesLoading={liveServicesLoading}
        taskActionMenu={taskActionMenu}
        taskActionPending={taskActionPending}
        showAssignDropdown={showAssignDropdown}
        panelSearch={panelSearch}
        restartingService={restartingService}
        setBellOpen={setBellOpen}
        setNotifFilter={setNotifFilter}
        setTaskActionMenu={setTaskActionMenu}
        setShowAssignDropdown={setShowAssignDropdown}
        setPanelSearch={setPanelSearch}
        clearAll={clearAll}
        markRead={markRead}
        dismissNotif={dismissNotif}
        navigateToTask={navigateToTask}
        fetchLiveTasks={fetchLiveTasks}
        fetchLiveAgents={fetchLiveAgents}
        fetchLiveServices={fetchLiveServices}
        taskAction={taskAction}
        reassignTask={reassignTask}
        restartService={restartService}
      />

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
