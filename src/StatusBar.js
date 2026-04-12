import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp, getAgent } from './store';
import { usePreferences } from './preferences-store';
import { getOrRequestStream, releaseCachedStream } from './hooks/useVoiceRecording';
const NOTIF_ICONS = {
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
// ── Task status groups for grouping ──────────────────────────────────
const TASK_GROUPS = [
    { label: 'Active', statuses: new Set(['in_progress', 'started', 'working_on']) },
    { label: 'Review', statuses: new Set(['pending_review', 'review_needed', 'approval_needed']) },
    { label: 'Blocked', statuses: new Set(['blocked', 'roadblock', 'on_hold', 'hold']) },
    { label: 'Queued', statuses: new Set(['created', 'queued', 'todo']) },
    { label: 'Completed', statuses: new Set(['done', 'completed', 'qa_tested', 'production_ready']) },
    { label: 'Cancelled', statuses: new Set(['cancelled']) },
];
const TASK_STATUS_CONFIG = {
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
const NOTIF_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'agents', label: 'Agents' },
    { key: 'services', label: 'Services' },
];
function notifMatchesFilter(n, filter) {
    if (filter === 'all')
        return true;
    if (filter === 'services')
        return n.type?.startsWith('service.') || false;
    if (filter === 'agents')
        return n.type?.startsWith('agent.') || n.type?.startsWith('fleet.') || false;
    if (filter === 'tasks')
        return n.type?.startsWith('task.') || false;
    return true;
}
const EMPTY_DATA = {
    nextEvent: null,
    activeTasks: 0,
    reminders: { total: 0, overdue: 0 },
    agentStatus: 'idle',
    gatewayConnected: false,
    activeAgents: 0,
    pendingTasks: 0,
};
// ── Countdown formatter ──────────────────────────────────────────────
function formatCountdown(ms) {
    if (ms <= 0)
        return 'now';
    const mins = Math.floor(ms / 60000);
    if (mins < 60)
        return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hrs < 24)
        return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
}
// ── Component ────────────────────────────────────────────────────────
/** Routing mode indicator — shows which gateway path chat messages take */
function RoutingModeIndicator() {
    const gatewayMode = usePreferences((s) => s.gatewayMode);
    const setGatewayMode = usePreferences((s) => s.setGatewayMode);
    const config = {
        router: { label: 'Router', color: '#3b82f6', title: 'Shre Router — trust gate, RAG, scoring' },
        direct: { label: 'Direct', color: '#22c55e', title: 'Direct Ollama — local models, no gateway' },
    };
    const modes = ['router', 'direct'];
    const c = config[gatewayMode];
    return (_jsxs("button", { className: "status-bar-item hidden sm:flex items-center", style: {
            gap: 4,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${c.color}15`,
            border: `1px solid ${c.color}25`,
            cursor: 'pointer',
        }, title: `${c.title} — click to cycle`, onClick: () => {
            const idx = modes.indexOf(gatewayMode);
            setGatewayMode(modes[(idx + 1) % modes.length]);
        }, children: [_jsx("span", { style: {
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: c.color,
                    boxShadow: `0 0 4px ${c.color}`,
                } }), _jsx("span", { style: { fontSize: 11, fontWeight: 600, color: c.color, letterSpacing: '0.02em' }, children: c.label })] }));
}
/** Compact gateway pill for the bottom status bar — click to cycle modes */
function StatusBarGatewayPill() {
    const gatewayMode = usePreferences((s) => s.gatewayMode);
    const setGatewayMode = usePreferences((s) => s.setGatewayMode);
    const modes = ['router', 'direct'];
    const cfg = {
        router: { label: 'R', color: '#3b82f6' },
        direct: { label: 'D', color: '#22c55e' },
    };
    const c = cfg[gatewayMode];
    return (_jsxs("button", { onClick: () => {
            const idx = modes.indexOf(gatewayMode);
            setGatewayMode(modes[(idx + 1) % modes.length]);
        }, style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '4px 8px', minHeight: 32,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: `${c.color}15`,
            color: c.color,
            border: `1px solid ${c.color}30`,
            cursor: 'pointer',
        }, title: `Gateway: ${gatewayMode} — click to cycle`, children: [_jsx("span", { style: { width: 5, height: 5, borderRadius: '50%', background: c.color } }), c.label] }));
}
export function StatusBar() {
    const { state, actions } = useApp();
    const [data, setData] = useState(EMPTY_DATA);
    const micEnabled = usePreferences((s) => s.micEnabled);
    const setMicEnabled = usePreferences((s) => s.setMicEnabled);
    const focusMode = usePreferences((s) => s.focusMode);
    const setFocusMode = usePreferences((s) => s.setFocusMode);
    const [recording, setRecording] = useState(false);
    const [now, setNow] = useState(Date.now());
    const intervalRef = useRef(null);
    // Notification state
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [bellOpen, setBellOpen] = useState(false);
    const [notifFilter, setNotifFilter] = useState('all');
    const [liveTasks, setLiveTasks] = useState([]);
    const [liveTasksLoading, setLiveTasksLoading] = useState(false);
    const [liveAgents, setLiveAgents] = useState([]);
    const [liveAgentsLoading, setLiveAgentsLoading] = useState(false);
    const [liveServices, setLiveServices] = useState([]);
    const [liveServicesLoading, setLiveServicesLoading] = useState(false);
    const [taskActionMenu, setTaskActionMenu] = useState(null);
    const [taskActionPending, setTaskActionPending] = useState(null);
    const [showAssignDropdown, setShowAssignDropdown] = useState(null);
    const [panelSearch, setPanelSearch] = useState('');
    const [restartingService, setRestartingService] = useState(null);
    const bellRef = useRef(null);
    const panelRef = useRef(null);
    const lastNotifCheck = useRef(0);
    // Derive busy from streaming state
    const agentBusy = state.streaming || data.agentStatus === 'busy';
    // Current agent info
    const currentAgent = getAgent(state.activeAgentId);
    // Fetch status bar data
    const fetchStatus = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
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
        }
        catch {
            // Silently fail — status bar is non-critical
        }
    }, []);
    // Fetch notification unread count
    const fetchUnreadCount = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
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
        }
        catch {
            /* non-critical */
        }
    }, [unreadCount]);
    // Fetch full notification list
    const fetchNotifications = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const res = await fetch(`/api/notifications?since=0&limit=20`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const json = await res.json();
                const items = json.notifications || [];
                setNotifications(items);
                const lastCheck = lastNotifCheck.current;
                for (const n of items) {
                    if (n.createdAt > lastCheck && !n.read && IMPORTANT_TYPES.has(n.type)) {
                        window.dispatchEvent(new CustomEvent('shre-system-notification', {
                            detail: { title: n.title, body: n.body, type: n.type },
                        }));
                    }
                }
                if (items.length > 0) {
                    lastNotifCheck.current = Math.max(...items.map((n) => n.createdAt));
                }
            }
        }
        catch {
            /* non-critical */
        }
    }, []);
    // Mark a notification as read
    const markRead = useCallback(async (id) => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PATCH',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        catch {
            /* non-critical */
        }
    }, []);
    // Dismiss a single notification
    const dismissNotif = useCallback(async (id, e) => {
        e.stopPropagation();
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            await fetch(`/api/notifications/${id}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        catch {
            /* non-critical */
        }
    }, []);
    // Clear all notifications
    const clearAll = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const ids = notifications.map((n) => n.id);
            if (ids.length === 0)
                return;
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
        }
        catch {
            /* non-critical */
        }
    }, [notifications]);
    // Fetch live tasks for the Tasks tab
    const fetchLiveTasks = useCallback(async () => {
        setLiveTasksLoading(true);
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const res = await fetch('/api/tasks?limit=50', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const data = await res.json();
                const tasks = Array.isArray(data) ? data : data.tasks || [];
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
                    if (aActive !== bActive)
                        return aActive - bActive;
                    return (b.updated_at || b.created_at) - (a.updated_at || a.created_at);
                });
                setLiveTasks(tasks);
            }
        }
        catch {
            /* non-critical */
        }
        setLiveTasksLoading(false);
    }, []);
    // Fetch live agents for the Agents tab
    const fetchLiveAgents = useCallback(async () => {
        setLiveAgentsLoading(true);
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const res = await fetch('/api/agents', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const data = await res.json();
                setLiveAgents(Array.isArray(data) ? data : []);
            }
        }
        catch {
            /* non-critical */
        }
        setLiveAgentsLoading(false);
    }, []);
    // Fetch live services for the Services tab
    const fetchLiveServices = useCallback(async () => {
        setLiveServicesLoading(true);
        try {
            const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
            const res = await fetch('/api/platform-status', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const data = await res.json();
                setLiveServices(data.services || []);
            }
        }
        catch {
            /* non-critical */
        }
        setLiveServicesLoading(false);
    }, []);
    // ── Task actions ──
    const authHeaders = useCallback(() => {
        const token = sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
        const h = { 'Content-Type': 'application/json' };
        if (token)
            h.Authorization = `Bearer ${token}`;
        return h;
    }, []);
    const taskAction = useCallback(async (taskId, action, e) => {
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
        }
        catch {
            /* non-critical */
        }
        setTaskActionPending(null);
        setTaskActionMenu(null);
    }, [authHeaders, fetchLiveTasks]);
    const reassignTask = useCallback(async (taskId, agentId) => {
        setTaskActionPending(taskId);
        try {
            await fetch(`/api/tasks/${taskId}/assignment`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ agent: agentId, reason: 'manual reassignment' }),
            });
            setTimeout(fetchLiveTasks, 500);
        }
        catch {
            /* non-critical */
        }
        setTaskActionPending(null);
        setShowAssignDropdown(null);
        setTaskActionMenu(null);
    }, [authHeaders, fetchLiveTasks]);
    // Restart a down service
    const restartService = useCallback(async (serviceName, e) => {
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
        }
        catch {
            /* non-critical */
        }
        setRestartingService(null);
    }, [authHeaders, fetchLiveServices]);
    // Navigate to TasksView when clicking a task
    const navigateToTask = useCallback((taskId) => {
        setBellOpen(false);
        actions.setView('tasks');
        window.dispatchEvent(new CustomEvent('shre-navigate', { detail: { view: 'tasks', taskId } }));
    }, [actions]);
    // Fetch live data when respective tabs are selected + auto-refresh every 30s
    useEffect(() => {
        if (!bellOpen)
            return;
        const fetchForTab = () => {
            if (notifFilter === 'tasks')
                fetchLiveTasks();
            else if (notifFilter === 'agents')
                fetchLiveAgents();
            else if (notifFilter === 'services')
                fetchLiveServices();
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
        if (!bellOpen)
            return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let ws = null;
        let retryTimeout = null;
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
                        if (msg.category === 'tasks' && notifFilter === 'tasks')
                            fetchLiveTasks();
                        else if (msg.category === 'agents' && notifFilter === 'agents')
                            fetchLiveAgents();
                        else if (msg.category === 'services' && notifFilter === 'services')
                            fetchLiveServices();
                        // Always refresh notification count
                        fetchUnreadCount();
                    }
                    // Refresh notifications for the All tab
                    if (msg.type?.startsWith('task.') ||
                        msg.type?.startsWith('service.') ||
                        msg.type?.startsWith('agent.')) {
                        fetchNotifications();
                        fetchUnreadCount();
                    }
                }
                catch {
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
            if (retryTimeout)
                clearTimeout(retryTimeout);
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
        if (!bellOpen)
            return;
        const handler = (e) => {
            const target = e.target;
            if (bellRef.current?.contains(target) || panelRef.current?.contains(target))
                return;
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
        // The Permissions API is unreliable on Android (can return 'denied' even when OS allows it).
        try {
            await getOrRequestStream();
            // Persist on state + trigger ChatComposer mic recording (push-to-talk → textarea)
            setRecording(true);
            setMicEnabled(true);
            window.dispatchEvent(new CustomEvent('shre-mic-start'));
        }
        catch (err) {
            console.error('[StatusBar] Mic error:', err?.name, err?.message, err);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isAndroid = /Android/i.test(navigator.userAgent);
            let msg;
            if (err?.name === 'NotAllowedError') {
                msg = isIOS
                    ? 'Mic blocked. Go to Settings \u2192 Safari \u2192 Microphone to enable.'
                    : isAndroid
                        ? 'Mic blocked by browser. Tap \u22ee (3 dots) \u2192 Settings \u2192 Site settings \u2192 Microphone \u2192 find this site \u2192 Allow. Then reload.'
                        : 'Mic blocked. Click the lock icon in the address bar \u2192 Site settings \u2192 Microphone \u2192 Allow.';
            }
            else if (err?.name === 'NotFoundError') {
                msg = 'No microphone found on this device.';
            }
            else if (err?.name === 'NotReadableError') {
                msg = 'Mic is in use by another app. Close other apps using the mic and try again.';
            }
            else {
                msg = 'Mic error: ' + (err?.name || 'Unknown') + ' \u2014 ' + (err?.message || '');
            }
            actions.setStatusLine(msg);
            setTimeout(() => actions.setStatusLine(null), 8000);
            window.dispatchEvent(new CustomEvent('shre-system-message', {
                detail: { text: msg, type: 'error' },
            }));
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
    return (_jsxs("div", { className: "status-bar", style: styles.bar, children: [_jsx("button", { onClick: () => actions.setSidebarOpen(!state.sidebarOpen), className: "shrink-0 p-2 md:p-1 rounded-lg transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }, "aria-label": state.sidebarOpen ? 'Close sidebar' : 'Open sidebar', children: _jsxs("svg", { className: "h-[18px] w-[18px] md:h-[16px] md:w-[16px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", children: [_jsx("line", { x1: "4", y1: "7", x2: "20", y2: "7" }), _jsx("line", { x1: "4", y1: "12", x2: "20", y2: "12" }), _jsx("line", { x1: "4", y1: "17", x2: "20", y2: "17" })] }) }), _jsxs("div", { className: "status-bar-item flex items-center", style: { ...styles.item, gap: 6 }, children: [_jsx("span", { className: "shrink-0", style: {
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: connColor,
                            boxShadow: data.gatewayConnected ? `0 0 6px ${connColor}` : 'none',
                        }, title: data.gatewayConnected ? 'Connected' : 'Disconnected' }), _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)', lineHeight: 1 }, children: currentAgent.name }), _jsx("svg", { className: "shrink-0", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-3)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" }) })] }), _jsx(RoutingModeIndicator, {}), data.activeAgents > 0 && (_jsxs("div", { className: "status-bar-item hidden md:flex", style: styles.item, title: `${data.activeAgents} active agent${data.activeAgents !== 1 ? 's' : ''}`, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }), _jsx("span", { style: styles.badge, children: data.activeAgents })] })), data.pendingTasks > 0 && (_jsxs("div", { className: "status-bar-item hidden md:flex", style: styles.item, title: `${data.pendingTasks} pending task${data.pendingTasks !== 1 ? 's' : ''}`, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-accent)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("polyline", { points: "12 6 12 12 16 14" })] }), _jsx("span", { style: { ...styles.badge, color: 'var(--c-accent)' }, children: data.pendingTasks })] })), data.nextEvent && (_jsxs("div", { className: "status-bar-item hidden md:flex", style: styles.item, children: [_jsxs("svg", { className: "shrink-0", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }), _jsx("line", { x1: "16", y1: "2", x2: "16", y2: "6" }), _jsx("line", { x1: "8", y1: "2", x2: "8", y2: "6" }), _jsx("line", { x1: "3", y1: "10", x2: "21", y2: "10" })] }), _jsx("span", { style: styles.label, className: "truncate max-w-[140px]", children: data.nextEvent.title }), _jsx("span", { style: styles.countdown, children: countdown })] })), data.reminders.total > 0 && (_jsxs("div", { className: "status-bar-item hidden md:flex", style: styles.item, children: [_jsxs("div", { style: { position: 'relative' }, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" }), _jsx("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" })] }), data.reminders.overdue > 0 && _jsx("span", { style: styles.redDot })] }), _jsx("span", { style: styles.badge, children: data.reminders.total })] })), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { className: "status-bar-item hidden md:flex", style: styles.item, title: agentBusy ? 'Agent busy' : 'Agent idle', children: [_jsx("span", { style: {
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: agentBusy ? '#22c55e' : 'var(--c-text-5)',
                            boxShadow: agentBusy ? '0 0 8px #22c55e' : 'none',
                            transition: 'all 0.3s ease',
                            animation: agentBusy ? 'pulse 1.5s ease-in-out infinite' : 'none',
                        } }), _jsx("span", { style: { ...styles.label, fontSize: 10 }, children: agentBusy ? 'busy' : 'idle' })] }), _jsx(StatusBarGatewayPill, {}), _jsxs("select", { value: localStorage.getItem('shre-user-language') || '', onChange: (e) => {
                    const lang = e.target.value;
                    if (lang)
                        localStorage.setItem('shre-user-language', lang);
                    else
                        localStorage.removeItem('shre-user-language');
                    setData((d) => ({ ...d }));
                }, style: {
                    ...styles.pillBtn,
                    background: 'rgba(59,130,246,0.1)',
                    color: 'var(--c-text-secondary, #94a3b8)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                }, title: "Chat language preference", children: [_jsx("option", { value: "", children: "EN" }), _jsx("option", { value: "es", children: "ES" }), _jsx("option", { value: "hi", children: "HI" }), _jsx("option", { value: "gu", children: "GU" }), _jsx("option", { value: "zh", children: "ZH" }), _jsx("option", { value: "fr", children: "FR" }), _jsx("option", { value: "pt", children: "PT" }), _jsx("option", { value: "de", children: "DE" }), _jsx("option", { value: "ar", children: "AR" }), _jsx("option", { value: "ja", children: "JA" })] }), _jsx("div", { ref: bellRef, style: { position: 'relative' }, children: _jsxs("button", { onClick: () => {
                        setBellOpen(!bellOpen);
                        if (!bellOpen)
                            fetchNotifications();
                    }, className: "status-bar-item flex", style: { ...styles.iconBtn, position: 'relative', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }, title: `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`, "aria-label": "Notifications", children: [_jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" }), _jsx("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" })] }), unreadCount > 0 && (_jsx("span", { style: {
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
                            }, children: unreadCount > 99 ? '99+' : unreadCount }))] }) }), _jsx("button", { onClick: () => setFocusMode(!focusMode), style: {
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
                }, title: focusMode ? 'Focus mode ON — system events hidden. Click to show all' : 'Focus mode OFF — showing all messages. Click to hide system events', "aria-label": focusMode ? 'Disable focus mode' : 'Enable focus mode', children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: focusMode ? (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" })] })) : (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M12 5v-2M12 21v-2M7.05 7.05L5.64 5.64M18.36 18.36l-1.41-1.41M5 12H3M21 12h-2M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41" })] })) }) }), _jsx("button", { onClick: toggleMic, style: {
                    ...styles.micBtn,
                    background: recording || micEnabled
                        ? 'var(--c-accent, #6366f1)'
                        : 'var(--c-bg-hover, rgba(255,255,255,0.08))',
                    animation: recording ? 'mic-pulse 1.5s ease-in-out infinite' : 'none',
                }, title: recording
                    ? 'Tap to stop voice input'
                    : micEnabled
                        ? 'Voice input ON \u2014 tap to turn off'
                        : 'Tap to start voice input', "aria-label": recording
                    ? 'Stop recording'
                    : micEnabled
                        ? 'Disable voice input'
                        : 'Start voice input', children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: recording || micEnabled ? '#fff' : 'currentColor', strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: micEnabled && !recording ? (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }), _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" }), _jsx("circle", { cx: "18", cy: "18", r: "4", fill: "#22c55e", stroke: "#22c55e" })] })) : (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }), _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" })] })) }) }), createPortal(_jsxs(_Fragment, { children: [_jsx("div", { style: {
                            position: 'fixed',
                            inset: 0,
                            zIndex: 199,
                            background: 'rgba(0,0,0,0.3)',
                            opacity: bellOpen ? 1 : 0,
                            pointerEvents: bellOpen ? 'auto' : 'none',
                            transition: 'opacity 0.25s ease',
                        }, onClick: () => setBellOpen(false) }), _jsxs("div", { ref: panelRef, style: {
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
                        }, children: [_jsxs("div", { style: {
                                    padding: '16px 16px 12px',
                                    borderBottom: '1px solid var(--c-border-2)',
                                    flexShrink: 0,
                                }, children: [_jsxs("div", { style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: 10,
                                        }, children: [_jsx("span", { style: { fontSize: 15, fontWeight: 700, color: 'var(--c-text-1)' }, children: "Notifications" }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [notifications.length > 0 && (_jsx("button", { onClick: clearAll, style: {
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            fontSize: 11,
                                                            color: 'var(--c-text-3)',
                                                            padding: '4px 8px',
                                                            borderRadius: 6,
                                                            transition: 'color 0.15s',
                                                        }, onMouseEnter: (e) => {
                                                            e.currentTarget.style.color = 'var(--c-danger, #ef4444)';
                                                        }, onMouseLeave: (e) => {
                                                            e.currentTarget.style.color = 'var(--c-text-3)';
                                                        }, children: "Clear all" })), _jsx("button", { onClick: () => setBellOpen(false), style: {
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
                                                        }, "aria-label": "Close notifications", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsx("div", { style: { display: 'flex', gap: 4 }, children: NOTIF_FILTERS.map((f) => {
                                            const count = f.key === 'tasks'
                                                ? liveTasks.length
                                                : f.key === 'agents'
                                                    ? liveAgents.length
                                                    : f.key === 'services'
                                                        ? liveServices.length
                                                        : notifications.length;
                                            const active = notifFilter === f.key;
                                            return (_jsxs("button", { onClick: () => {
                                                    setNotifFilter(f.key);
                                                    setPanelSearch('');
                                                }, style: {
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
                                                }, children: [f.label, count > 0 && (_jsx("span", { style: {
                                                            fontSize: 9,
                                                            fontWeight: 700,
                                                            background: active ? 'rgba(255,255,255,0.25)' : 'var(--c-bg-hover)',
                                                            padding: '1px 5px',
                                                            borderRadius: 8,
                                                            lineHeight: '14px',
                                                        }, children: count }))] }, f.key));
                                        }) })] }), _jsx("div", { style: { overflowY: 'auto', flex: 1 }, children: notifFilter === 'tasks' ? (
                                /* ── Live Task Tracker (grouped, with actions) ── */
                                _jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 12px',
                                                borderBottom: '1px solid var(--c-border-2)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                            }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsxs("div", { style: { flex: 1, position: 'relative' }, children: [_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-4)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                        position: 'absolute',
                                                                        left: 8,
                                                                        top: '50%',
                                                                        transform: 'translateY(-50%)',
                                                                    }, children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { type: "text", placeholder: "Search tasks...", value: panelSearch, onChange: (e) => setPanelSearch(e.target.value), style: {
                                                                        width: '100%',
                                                                        boxSizing: 'border-box',
                                                                        padding: '5px 8px 5px 26px',
                                                                        fontSize: 12,
                                                                        background: 'var(--c-bg-1)',
                                                                        border: '1px solid var(--c-border-2)',
                                                                        borderRadius: 6,
                                                                        color: 'var(--c-text-1)',
                                                                        outline: 'none',
                                                                    } })] }), _jsx("button", { onClick: fetchLiveTasks, disabled: liveTasksLoading, style: {
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--c-text-3)',
                                                                padding: '4px',
                                                                borderRadius: 4,
                                                                flexShrink: 0,
                                                                opacity: liveTasksLoading ? 0.5 : 1,
                                                            }, title: "Refresh", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                    animation: liveTasksLoading ? 'spin 1s linear infinite' : 'none',
                                                                }, children: [_jsx("path", { d: "M23 4v6h-6" }), _jsx("path", { d: "M1 20v-6h6" }), _jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] }) })] }), _jsxs("div", { style: { fontSize: 10, color: 'var(--c-text-4)' }, children: [liveTasks.length, " task", liveTasks.length !== 1 ? 's' : '', panelSearch ? ` · filtered` : '', " \u00B7 auto-refreshes"] })] }), liveTasksLoading && liveTasks.length === 0 ? (_jsx("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "Loading tasks..." }) })) : liveTasks.length === 0 ? (_jsxs("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: [_jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { margin: '0 auto 12px' }, children: [_jsx("path", { d: "M9 11l3 3L22 4" }), _jsx("path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" })] }), _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "No tasks found" })] })) : (TASK_GROUPS.map((group) => {
                                            const searchLower = panelSearch.toLowerCase();
                                            const groupTasks = liveTasks.filter((t) => group.statuses.has(t.status) &&
                                                (!panelSearch ||
                                                    t.title.toLowerCase().includes(searchLower) ||
                                                    t.agent?.toLowerCase().includes(searchLower) ||
                                                    t.status.includes(searchLower)));
                                            if (groupTasks.length === 0)
                                                return null;
                                            return (_jsxs("div", { children: [_jsxs("div", { style: {
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
                                                        }, children: [group.label, " (", groupTasks.length, ")"] }), groupTasks.map((task) => {
                                                        const cfg = TASK_STATUS_CONFIG[task.status] || {
                                                            color: '#6b7280',
                                                            label: task.status,
                                                            icon: '\u25cb',
                                                        };
                                                        const isActive = ['in_progress', 'started', 'working_on'].includes(task.status);
                                                        const isPending = taskActionPending === task.id;
                                                        const isTerminal = [
                                                            'done',
                                                            'completed',
                                                            'cancelled',
                                                            'qa_tested',
                                                            'production_ready',
                                                        ].includes(task.status);
                                                        return (_jsxs("div", { onClick: () => navigateToTask(task.id), style: {
                                                                padding: '10px 16px',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid var(--c-border-2)',
                                                                transition: 'background 0.15s',
                                                                opacity: isPending ? 0.5 : 1,
                                                                position: 'relative',
                                                            }, onMouseEnter: (e) => {
                                                                e.currentTarget.style.background =
                                                                    'var(--c-bg-hover)';
                                                            }, onMouseLeave: (e) => {
                                                                e.currentTarget.style.background = 'transparent';
                                                            }, children: [_jsxs("div", { style: {
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        marginBottom: 4,
                                                                    }, children: [_jsx("span", { style: {
                                                                                width: 8,
                                                                                height: 8,
                                                                                borderRadius: '50%',
                                                                                flexShrink: 0,
                                                                                background: cfg.color,
                                                                                boxShadow: isActive ? `0 0 6px ${cfg.color}` : 'none',
                                                                                animation: isActive
                                                                                    ? 'pulse-dot 2s ease-in-out infinite'
                                                                                    : 'none',
                                                                            } }), _jsxs("span", { style: {
                                                                                fontSize: 10,
                                                                                fontWeight: 600,
                                                                                padding: '1px 6px',
                                                                                borderRadius: 4,
                                                                                background: `${cfg.color}20`,
                                                                                color: cfg.color,
                                                                                whiteSpace: 'nowrap',
                                                                            }, children: [cfg.icon, " ", cfg.label] }), task.priority &&
                                                                            ['high', 'critical'].includes(task.priority) && (_jsx("span", { style: {
                                                                                fontSize: 10,
                                                                                fontWeight: 600,
                                                                                color: task.priority === 'critical' ? '#ef4444' : '#f59e0b',
                                                                            }, children: task.priority === 'critical' ? '!!' : '!' })), !isTerminal && (_jsx("button", { onClick: (e) => {
                                                                                e.stopPropagation();
                                                                                setTaskActionMenu(taskActionMenu === task.id ? null : task.id);
                                                                                setShowAssignDropdown(null);
                                                                            }, style: {
                                                                                marginLeft: 'auto',
                                                                                background: 'none',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                color: 'var(--c-text-4)',
                                                                                padding: '2px 4px',
                                                                                borderRadius: 4,
                                                                                fontSize: 14,
                                                                                lineHeight: 1,
                                                                            }, title: "Actions", children: "\u22EE" }))] }), taskActionMenu === task.id && (_jsxs("div", { style: {
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
                                                                    }, children: [_jsx("button", { onClick: (e) => taskAction(task.id, 'escalate', e), style: {
                                                                                width: '100%',
                                                                                textAlign: 'left',
                                                                                background: 'none',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                padding: '6px 10px',
                                                                                borderRadius: 4,
                                                                                fontSize: 12,
                                                                                color: '#f59e0b',
                                                                            }, onMouseEnter: (e) => {
                                                                                e.currentTarget.style.background =
                                                                                    'var(--c-bg-hover)';
                                                                            }, onMouseLeave: (e) => {
                                                                                e.currentTarget.style.background = 'none';
                                                                            }, children: "Escalate to critical" }), _jsx("button", { onClick: (e) => {
                                                                                e.stopPropagation();
                                                                                setShowAssignDropdown(showAssignDropdown === task.id ? null : task.id);
                                                                            }, style: {
                                                                                width: '100%',
                                                                                textAlign: 'left',
                                                                                background: 'none',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                padding: '6px 10px',
                                                                                borderRadius: 4,
                                                                                fontSize: 12,
                                                                                color: 'var(--c-text-2)',
                                                                            }, onMouseEnter: (e) => {
                                                                                e.currentTarget.style.background =
                                                                                    'var(--c-bg-hover)';
                                                                            }, onMouseLeave: (e) => {
                                                                                e.currentTarget.style.background = 'none';
                                                                            }, children: "Reassign agent" }), showAssignDropdown === task.id && liveAgents.length > 0 && (_jsx("div", { style: {
                                                                                padding: '4px 0',
                                                                                borderTop: '1px solid var(--c-border-2)',
                                                                                marginTop: 2,
                                                                            }, children: liveAgents
                                                                                .filter((a) => a.id !== task.agent)
                                                                                .slice(0, 8)
                                                                                .map((a) => (_jsx("button", { onClick: (e) => {
                                                                                    e.stopPropagation();
                                                                                    reassignTask(task.id, a.id);
                                                                                }, style: {
                                                                                    width: '100%',
                                                                                    textAlign: 'left',
                                                                                    background: 'none',
                                                                                    border: 'none',
                                                                                    cursor: 'pointer',
                                                                                    padding: '4px 10px 4px 18px',
                                                                                    borderRadius: 4,
                                                                                    fontSize: 11,
                                                                                    color: 'var(--c-text-2)',
                                                                                }, onMouseEnter: (e) => {
                                                                                    e.currentTarget.style.background =
                                                                                        'var(--c-bg-hover)';
                                                                                }, onMouseLeave: (e) => {
                                                                                    e.currentTarget.style.background =
                                                                                        'none';
                                                                                }, children: a.name }, a.id))) })), _jsx("div", { style: {
                                                                                borderTop: '1px solid var(--c-border-2)',
                                                                                marginTop: 2,
                                                                                paddingTop: 2,
                                                                            }, children: _jsx("button", { onClick: (e) => taskAction(task.id, 'cancel', e), style: {
                                                                                    width: '100%',
                                                                                    textAlign: 'left',
                                                                                    background: 'none',
                                                                                    border: 'none',
                                                                                    cursor: 'pointer',
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: 4,
                                                                                    fontSize: 12,
                                                                                    color: '#ef4444',
                                                                                }, onMouseEnter: (e) => {
                                                                                    e.currentTarget.style.background =
                                                                                        'var(--c-bg-hover)';
                                                                                }, onMouseLeave: (e) => {
                                                                                    e.currentTarget.style.background =
                                                                                        'none';
                                                                                }, children: "Cancel task" }) })] })), _jsx("div", { style: {
                                                                        fontSize: 13,
                                                                        fontWeight: 500,
                                                                        color: 'var(--c-text-1)',
                                                                        lineHeight: 1.4,
                                                                        marginBottom: 4,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    }, children: task.title }), _jsxs("div", { style: {
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        flexWrap: 'wrap',
                                                                    }, children: [task.agent && (_jsxs("span", { style: {
                                                                                fontSize: 11,
                                                                                color: 'var(--c-text-2)',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: 3,
                                                                            }, children: [_jsxs("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "12", cy: "7", r: "4" })] }), task.agent] })), task.quality_score != null && (_jsxs("span", { style: {
                                                                                fontSize: 11,
                                                                                color: task.quality_score >= 0.8
                                                                                    ? '#22c55e'
                                                                                    : task.quality_score >= 0.5
                                                                                        ? '#f59e0b'
                                                                                        : '#ef4444',
                                                                            }, children: ["Q: ", (task.quality_score * 100).toFixed(0), "%"] })), task.completion_ratio != null &&
                                                                            task.completion_ratio > 0 &&
                                                                            task.completion_ratio < 1 && (_jsxs("span", { style: { fontSize: 11, color: 'var(--c-text-3)' }, children: [(task.completion_ratio * 100).toFixed(0), "% done"] })), _jsx("span", { style: {
                                                                                fontSize: 10,
                                                                                color: 'var(--c-text-4)',
                                                                                marginLeft: 'auto',
                                                                            }, children: new Date(task.updated_at || task.created_at).toLocaleString([], {
                                                                                month: 'short',
                                                                                day: 'numeric',
                                                                                hour: 'numeric',
                                                                                minute: '2-digit',
                                                                            }) })] })] }, task.id));
                                                    })] }, group.label));
                                        }))] })) : notifFilter === 'agents' ? (
                                /* ── Live Agents Panel (enriched with fleet data) ── */
                                _jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 12px',
                                                borderBottom: '1px solid var(--c-border-2)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                            }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsxs("div", { style: { flex: 1, position: 'relative' }, children: [_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-4)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                        position: 'absolute',
                                                                        left: 8,
                                                                        top: '50%',
                                                                        transform: 'translateY(-50%)',
                                                                    }, children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { type: "text", placeholder: "Search agents...", value: panelSearch, onChange: (e) => setPanelSearch(e.target.value), style: {
                                                                        width: '100%',
                                                                        boxSizing: 'border-box',
                                                                        padding: '5px 8px 5px 26px',
                                                                        fontSize: 12,
                                                                        background: 'var(--c-bg-1)',
                                                                        border: '1px solid var(--c-border-2)',
                                                                        borderRadius: 6,
                                                                        color: 'var(--c-text-1)',
                                                                        outline: 'none',
                                                                    } })] }), _jsx("button", { onClick: fetchLiveAgents, disabled: liveAgentsLoading, style: {
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--c-text-3)',
                                                                padding: '4px',
                                                                borderRadius: 4,
                                                                flexShrink: 0,
                                                                opacity: liveAgentsLoading ? 0.5 : 1,
                                                            }, title: "Refresh", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                    animation: liveAgentsLoading ? 'spin 1s linear infinite' : 'none',
                                                                }, children: [_jsx("path", { d: "M23 4v6h-6" }), _jsx("path", { d: "M1 20v-6h6" }), _jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] }) })] }), _jsxs("div", { style: { fontSize: 10, color: 'var(--c-text-4)' }, children: [liveAgents.filter((a) => a.status === 'busy').length, " busy /", ' ', liveAgents.length, " total"] })] }), liveAgentsLoading && liveAgents.length === 0 ? (_jsx("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "Loading agents..." }) })) : liveAgents.length === 0 ? (_jsxs("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: [_jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { margin: '0 auto 12px' }, children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }), _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "No agents registered" })] })) : (liveAgents
                                            .filter((a) => !panelSearch ||
                                            a.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                                            a.model.toLowerCase().includes(panelSearch.toLowerCase()) ||
                                            a.currentTask?.title?.toLowerCase().includes(panelSearch.toLowerCase()))
                                            .map((agent) => {
                                            const isBusy = agent.status === 'busy';
                                            const task = agent.currentTask;
                                            return (_jsxs("div", { style: {
                                                    padding: '10px 16px',
                                                    borderBottom: '1px solid var(--c-border-2)',
                                                    transition: 'background 0.15s',
                                                }, onMouseEnter: (e) => {
                                                    e.currentTarget.style.background =
                                                        'var(--c-bg-hover)';
                                                }, onMouseLeave: (e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: {
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    flexShrink: 0,
                                                                    background: isBusy ? '#8b5cf6' : '#22c55e',
                                                                    animation: isBusy ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                                                                } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                                                                            fontSize: 13,
                                                                            fontWeight: 500,
                                                                            color: 'var(--c-text-1)',
                                                                        }, children: agent.name || agent.id }), _jsx("div", { style: { fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }, children: agent.model })] }), _jsx("span", { style: {
                                                                    fontSize: 10,
                                                                    fontWeight: 600,
                                                                    padding: '2px 6px',
                                                                    borderRadius: 4,
                                                                    background: isBusy ? '#8b5cf620' : '#22c55e20',
                                                                    color: isBusy ? '#8b5cf6' : '#22c55e',
                                                                }, children: isBusy ? 'busy' : 'idle' })] }), task && (_jsxs("div", { style: {
                                                            marginTop: 6,
                                                            marginLeft: 16,
                                                            padding: '4px 8px',
                                                            borderRadius: 4,
                                                            background: 'var(--c-bg-1)',
                                                            fontSize: 11,
                                                            color: 'var(--c-text-2)',
                                                        }, children: [_jsx("div", { style: {
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    fontWeight: 500,
                                                                }, children: task.title }), _jsxs("div", { style: {
                                                                    display: 'flex',
                                                                    gap: 8,
                                                                    marginTop: 2,
                                                                    color: 'var(--c-text-4)',
                                                                    fontSize: 10,
                                                                }, children: [task.phase && _jsx("span", { children: task.phase }), task.progress && _jsx("span", { children: task.progress }), task.elapsedMs != null && (_jsxs("span", { children: [Math.round(task.elapsedMs / 60000), "m elapsed"] })), task.type && (_jsx("span", { style: { marginLeft: 'auto', opacity: 0.7 }, children: task.type }))] })] }))] }, agent.id));
                                        }))] })) : notifFilter === 'services' ? (
                                /* ── Live Services Panel (enriched with latency/uptime) ── */
                                _jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 12px',
                                                borderBottom: '1px solid var(--c-border-2)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                            }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsxs("div", { style: { flex: 1, position: 'relative' }, children: [_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-4)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                        position: 'absolute',
                                                                        left: 8,
                                                                        top: '50%',
                                                                        transform: 'translateY(-50%)',
                                                                    }, children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { type: "text", placeholder: "Search services...", value: panelSearch, onChange: (e) => setPanelSearch(e.target.value), style: {
                                                                        width: '100%',
                                                                        boxSizing: 'border-box',
                                                                        padding: '5px 8px 5px 26px',
                                                                        fontSize: 12,
                                                                        background: 'var(--c-bg-1)',
                                                                        border: '1px solid var(--c-border-2)',
                                                                        borderRadius: 6,
                                                                        color: 'var(--c-text-1)',
                                                                        outline: 'none',
                                                                    } })] }), _jsx("button", { onClick: fetchLiveServices, disabled: liveServicesLoading, style: {
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--c-text-3)',
                                                                padding: '4px',
                                                                borderRadius: 4,
                                                                flexShrink: 0,
                                                                opacity: liveServicesLoading ? 0.5 : 1,
                                                            }, title: "Refresh", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                                    animation: liveServicesLoading ? 'spin 1s linear infinite' : 'none',
                                                                }, children: [_jsx("path", { d: "M23 4v6h-6" }), _jsx("path", { d: "M1 20v-6h6" }), _jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] }) })] }), _jsxs("div", { style: { fontSize: 10, color: 'var(--c-text-4)' }, children: [liveServices.filter((s) => s.healthy).length, "/", liveServices.length, " healthy"] })] }), liveServicesLoading && liveServices.length === 0 ? (_jsx("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "Loading services..." }) })) : liveServices.length === 0 ? (_jsxs("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: [_jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { margin: '0 auto 12px' }, children: [_jsx("rect", { x: "2", y: "2", width: "20", height: "8", rx: "2" }), _jsx("rect", { x: "2", y: "14", width: "20", height: "8", rx: "2" }), _jsx("circle", { cx: "6", cy: "6", r: "1" }), _jsx("circle", { cx: "6", cy: "18", r: "1" })] }), _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: "No service data available" })] })) : (liveServices
                                            .filter((s) => !panelSearch ||
                                            s.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                                            s.status?.toLowerCase().includes(panelSearch.toLowerCase()))
                                            .map((svc) => {
                                            const isRestarting = restartingService === svc.name;
                                            return (_jsx("div", { style: {
                                                    padding: '10px 16px',
                                                    borderBottom: '1px solid var(--c-border-2)',
                                                    transition: 'background 0.15s',
                                                }, onMouseEnter: (e) => {
                                                    e.currentTarget.style.background =
                                                        'var(--c-bg-hover)';
                                                }, onMouseLeave: (e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: {
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                flexShrink: 0,
                                                                background: svc.healthy ? '#22c55e' : '#ef4444',
                                                                boxShadow: !svc.healthy ? '0 0 6px #ef4444' : 'none',
                                                            } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: {
                                                                        fontSize: 13,
                                                                        fontWeight: 500,
                                                                        color: 'var(--c-text-1)',
                                                                    }, children: [svc.name, svc.port && (_jsxs("span", { style: {
                                                                                fontSize: 10,
                                                                                color: 'var(--c-text-4)',
                                                                                marginLeft: 4,
                                                                            }, children: [":", svc.port] }))] }), _jsxs("div", { style: {
                                                                        display: 'flex',
                                                                        gap: 8,
                                                                        fontSize: 10,
                                                                        color: 'var(--c-text-4)',
                                                                        marginTop: 2,
                                                                    }, children: [svc.latency_ms != null && (_jsxs("span", { style: {
                                                                                color: svc.latency_ms < 100
                                                                                    ? '#22c55e'
                                                                                    : svc.latency_ms < 500
                                                                                        ? '#f59e0b'
                                                                                        : '#ef4444',
                                                                            }, children: [svc.latency_ms, "ms"] })), svc.uptime_pct != null && (_jsxs("span", { style: {
                                                                                color: svc.uptime_pct >= 99.9
                                                                                    ? '#22c55e'
                                                                                    : svc.uptime_pct >= 95
                                                                                        ? '#f59e0b'
                                                                                        : '#ef4444',
                                                                            }, children: [svc.uptime_pct.toFixed(1), "% uptime"] })), svc.type && _jsx("span", { children: svc.type })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [!svc.healthy && (_jsxs("button", { onClick: (e) => restartService(svc.name, e), disabled: isRestarting, style: {
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
                                                                    }, title: `Restart ${svc.name}`, children: [isRestarting ? (_jsxs("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { animation: 'spin 1s linear infinite' }, children: [_jsx("path", { d: "M23 4v6h-6" }), _jsx("path", { d: "M1 20v-6h6" }), _jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] })) : (_jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polygon", { points: "5 3 19 12 5 21 5 3" }) })), isRestarting ? 'Starting...' : 'Start'] })), _jsx("span", { style: {
                                                                        fontSize: 10,
                                                                        fontWeight: 600,
                                                                        padding: '2px 6px',
                                                                        borderRadius: 4,
                                                                        background: svc.healthy ? '#22c55e20' : '#ef444420',
                                                                        color: svc.healthy ? '#22c55e' : '#ef4444',
                                                                    }, children: svc.status || (svc.healthy ? 'up' : 'down') })] })] }) }, svc.name));
                                        }))] })) : (
                                /* ── "All" Tab — live summary cards + notification stream ── */
                                _jsxs(_Fragment, { children: [_jsx("div", { style: { padding: '6px 12px', borderBottom: '1px solid var(--c-border-2)' }, children: _jsxs("div", { style: { position: 'relative' }, children: [_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-4)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                                            position: 'absolute',
                                                            left: 8,
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                        }, children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { type: "text", placeholder: "Search notifications...", value: panelSearch, onChange: (e) => setPanelSearch(e.target.value), style: {
                                                            width: '100%',
                                                            boxSizing: 'border-box',
                                                            padding: '5px 8px 5px 26px',
                                                            fontSize: 12,
                                                            background: 'var(--c-bg-1)',
                                                            border: '1px solid var(--c-border-2)',
                                                            borderRadius: 6,
                                                            color: 'var(--c-text-1)',
                                                            outline: 'none',
                                                        } })] }) }), (() => {
                                            const activeTasks = liveTasks.filter((t) => ['in_progress', 'started', 'working_on'].includes(t.status));
                                            const blockedTasks = liveTasks.filter((t) => ['blocked', 'roadblock'].includes(t.status));
                                            const unhealthySvcs = liveServices.filter((s) => !s.healthy);
                                            const busyAgents = liveAgents.filter((a) => a.status === 'busy');
                                            const hasLiveData = activeTasks.length > 0 ||
                                                blockedTasks.length > 0 ||
                                                unhealthySvcs.length > 0 ||
                                                busyAgents.length > 0;
                                            if (!hasLiveData)
                                                return null;
                                            return (_jsxs("div", { style: {
                                                    padding: '8px 12px',
                                                    borderBottom: '1px solid var(--c-border-2)',
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 6,
                                                }, children: [activeTasks.length > 0 && (_jsxs("button", { onClick: () => setNotifFilter('tasks'), style: {
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
                                                        }, children: [_jsx("span", { style: {
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: '50%',
                                                                    background: '#8b5cf6',
                                                                    animation: 'pulse-dot 2s ease-in-out infinite',
                                                                } }), activeTasks.length, " active task", activeTasks.length !== 1 ? 's' : ''] })), blockedTasks.length > 0 && (_jsxs("button", { onClick: () => setNotifFilter('tasks'), style: {
                                                            background: '#ef444415',
                                                            border: '1px solid #ef444430',
                                                            borderRadius: 6,
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                        }, children: [blockedTasks.length, " blocked"] })), busyAgents.length > 0 && (_jsxs("button", { onClick: () => setNotifFilter('agents'), style: {
                                                            background: '#8b5cf615',
                                                            border: '1px solid #8b5cf630',
                                                            borderRadius: 6,
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            color: '#8b5cf6',
                                                            cursor: 'pointer',
                                                        }, children: [busyAgents.length, " agent", busyAgents.length !== 1 ? 's' : '', " busy"] })), unhealthySvcs.length > 0 && (_jsxs("button", { onClick: () => setNotifFilter('services'), style: {
                                                            background: '#ef444415',
                                                            border: '1px solid #ef444430',
                                                            borderRadius: 6,
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                        }, children: [unhealthySvcs.length, " service", unhealthySvcs.length !== 1 ? 's' : '', ' ', "down"] }))] }));
                                        })(), (() => {
                                            const filtered = panelSearch
                                                ? notifications.filter((n) => n.title.toLowerCase().includes(panelSearch.toLowerCase()) ||
                                                    n.body?.toLowerCase().includes(panelSearch.toLowerCase()) ||
                                                    n.source?.toLowerCase().includes(panelSearch.toLowerCase()))
                                                : notifications;
                                            return filtered.length === 0 ? (_jsxs("div", { style: { padding: '48px 16px', textAlign: 'center' }, children: [_jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { margin: '0 auto 12px' }, children: [_jsx("path", { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" }), _jsx("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" })] }), _jsx("div", { style: { fontSize: 13, color: 'var(--c-text-3)' }, children: panelSearch ? 'No matching notifications' : 'No notifications yet' })] })) : (filtered.map((n) => (_jsx("div", { onClick: () => {
                                                    if (!n.read)
                                                        markRead(n.id);
                                                }, style: {
                                                    padding: '12px 16px',
                                                    cursor: 'pointer',
                                                    borderBottom: '1px solid var(--c-border-2)',
                                                    background: n.read
                                                        ? 'transparent'
                                                        : 'var(--c-accent-soft, rgba(99,141,255,0.08))',
                                                    transition: 'background 0.15s',
                                                }, onMouseEnter: (e) => {
                                                    e.currentTarget.style.background = 'var(--c-bg-hover)';
                                                }, onMouseLeave: (e) => {
                                                    e.currentTarget.style.background = n.read
                                                        ? 'transparent'
                                                        : 'var(--c-accent-soft, rgba(99,141,255,0.08))';
                                                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 10 }, children: [_jsx("span", { style: {
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                flexShrink: 0,
                                                                marginTop: 5,
                                                                background: n.type?.includes('failed') || n.type?.includes('unhealthy')
                                                                    ? 'var(--c-danger, #ef4444)'
                                                                    : n.type?.includes('quality')
                                                                        ? '#f59e0b'
                                                                        : 'var(--c-accent)',
                                                            } }), _jsx("span", { style: { fontSize: 15, flexShrink: 0 }, children: NOTIF_ICONS[n.type] || '\ud83d\udd14' }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                                                                        fontSize: 13,
                                                                        fontWeight: n.read ? 400 : 600,
                                                                        color: 'var(--c-text-1)',
                                                                        lineHeight: 1.4,
                                                                    }, children: n.title }), n.body && (_jsx("div", { style: {
                                                                        fontSize: 12,
                                                                        color: 'var(--c-text-2)',
                                                                        marginTop: 4,
                                                                        lineHeight: 1.4,
                                                                        whiteSpace: 'pre-wrap',
                                                                        wordBreak: 'break-word',
                                                                    }, children: n.body })), _jsxs("div", { style: { fontSize: 10, color: 'var(--c-text-3)', marginTop: 5 }, children: [new Date(n.createdAt).toLocaleString([], {
                                                                            month: 'short',
                                                                            day: 'numeric',
                                                                            hour: 'numeric',
                                                                            minute: '2-digit',
                                                                        }), n.source && _jsxs("span", { children: [" \u00B7 ", n.source] })] })] }), _jsx("button", { onClick: (e) => dismissNotif(n.id, e), style: {
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
                                                            }, onMouseEnter: (e) => {
                                                                e.currentTarget.style.color = 'var(--c-danger)';
                                                            }, onMouseLeave: (e) => {
                                                                e.currentTarget.style.color = 'var(--c-text-3)';
                                                            }, title: "Dismiss", "aria-label": "Dismiss notification", children: _jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }) }, n.id))));
                                        })()] })) })] })] }), document.body), _jsx("style", { children: `
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
      ` })] }));
}
// ── Inline style objects ─────────────────────────────────────────────
const styles = {
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
