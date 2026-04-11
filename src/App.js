import { jsx as _jsx, jsxs as _jsxs, Fragment } from "react/jsx-runtime";
import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { AppContext, createSession, loadSessions, loadActivity, loadFeed, loadFiles, loadTabs, loadActiveSession, loadQueue, loadThemeCustom, loadDrafts, } from './store';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
// ChatView lazy-loaded with preload — it's the default view so it starts
// fetching immediately, but the chunk split keeps the initial bundle small.
const ChatView = lazy(() => import('./ChatView').then((m) => ({ default: m.ChatView })));
// Preload ChatView chunk immediately so first paint isn't delayed
import('./ChatView').catch(() => { });
import { ErrorBoundary } from './ErrorBoundary';
import { ViewErrorBoundary } from './ViewErrorBoundary';
import { LoginView } from './LoginView';
import { loadUserProfile, saveUserProfile, createDefaultProfile } from './store';
import { useAnomalyStream } from './hooks/useAnomalyStream';
import InstallBanner from './components/InstallBanner';
// ── Extracted modules ──
import { useAuth, WorkspaceSelectionScreen, } from './AppAuth';
import { ViewNavHeader } from './ViewNavHeader';
import { buildActions } from './AppActions';
import { useThemeEffect, useThemeCustomEffect, useInitEffects, usePushNotifications, useStreamPersistence, usePeriodicSync, useDailyCompaction, useCrossTabSync, useViewSwitchEvent, useVisualViewport, useFoldDetection, useUpdateSessions, } from './AppEffects';
// Lazy-load non-default views for code splitting
const ActivityView = lazy(() => import('./ActivityView').then((m) => ({ default: m.ActivityView })));
const FilesView = lazy(() => import('./FilesView').then((m) => ({ default: m.FilesView })));
const CronView = lazy(() => import('./CronView').then((m) => ({ default: m.CronView })));
const FeedView = lazy(() => import('./FeedView').then((m) => ({ default: m.FeedView })));
const AgentFeedView = lazy(() => import('./AgentFeedView').then((m) => ({ default: m.AgentFeedView })));
const PreviewView = lazy(() => import('./PreviewView').then((m) => ({ default: m.PreviewView })));
const SpendView = lazy(() => import('./SpendView').then((m) => ({ default: m.SpendView })));
const BriefingView = lazy(() => import('./BriefingView').then((m) => ({ default: m.BriefingView })));
const RemindersView = lazy(() => import('./RemindersView').then((m) => ({ default: m.RemindersView })));
const CostDashboardView = lazy(() => import('./CostDashboardView').then((m) => ({ default: m.CostDashboardView })));
const MarketplaceView = lazy(() => import('./MarketplaceView').then((m) => ({ default: m.MarketplaceView })));
const AdminView = lazy(() => import('./AdminView').then((m) => ({ default: m.AdminView })));
const FeedAnalyticsView = lazy(() => import('./FeedAnalyticsView').then((m) => ({ default: m.FeedAnalyticsView })));
const TaskTimelineView = lazy(() => import('./TaskTimelineView').then((m) => ({ default: m.TaskTimelineView })));
const FinetuneView = lazy(() => import('./FinetuneView').then((m) => ({ default: m.FinetuneView })));
const ReportsView = lazy(() => import('./ReportsView').then((m) => ({ default: m.ReportsView })));
const EmployeeActivityView = lazy(() => import('./EmployeeActivityView').then((m) => ({ default: m.EmployeeActivityView })));
const TasksView = lazy(() => import('./TasksView').then((m) => ({ default: m.TasksView })));
const ProjectsView = lazy(() => import('./ProjectsView').then((m) => ({ default: m.ProjectsView })));
const EmailView = lazy(() => import('./EmailView').then((m) => ({ default: m.EmailView })));
const BillingView = lazy(() => import('./BillingView').then((m) => ({ default: m.BillingView })));
const DemoView = lazy(() => import('./DemoView').then((m) => ({ default: m.DemoView })));
const InvestorView = lazy(() => import('./InvestorView').then((m) => ({ default: m.InvestorView })));
const LazyFallback = () => (_jsx("div", { className: "flex-1 flex items-center justify-center", style: { color: 'var(--c-text-3)' }, children: "Loading\u2026" }));
/** Router Gateway Control UI embed — auto-injects gateway token + WS URL */
function RouterGatewayEmbed() {
    const [status, setStatus] = useState(null);
    useEffect(() => {
        fetch('/api/router/health')
            .then((r) => r.json())
            .then((d) => setStatus(d))
            .catch(() => setStatus({ error: 'Cannot reach shre-router' }));
    }, []);
    return (_jsx("div", { className: "flex-1 w-full h-full flex flex-col items-center justify-center gap-4 p-6", style: { background: 'var(--c-bg-1)' }, children: _jsx("div", { style: { fontSize: 14, color: 'var(--c-text-2)', maxWidth: 480, textAlign: 'center' }, children: _jsxs(Fragment, { children: [
        _jsx("h2", { style: { fontSize: 18, color: 'var(--c-text-1)', marginBottom: 12 }, children: "Router Gateway" }),
        !status && _jsx("p", { children: "Loading..." }),
        status?.error && _jsx("p", { style: { color: '#ef4444' }, children: status.error }),
        status?.ok && _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }, children: [
            _jsxs("p", { children: [_jsx("span", { style: { color: '#22c55e' }, children: "\u25CF" }), ` shre-router is online (uptime: ${Math.round((status.uptime || 0) / 60)}m)`] }),
            status.agents != null && _jsxs("p", { children: [`Active agents: ${status.agents}`] })
        ] }),
        _jsx("p", { style: { marginTop: 16, fontSize: 12, color: 'var(--c-text-3)' }, children: "Gateway management available via MIB007 dashboard or CLI." })
    ] }) }) }));
}
const AGENT_KEY = 'shre-active-agent';
const THEME_KEY = 'shre-theme';
export function App() {
    // ── Demo mode — no auth required, shows sandbox experience ──
    const isDemoMode = !!(window.__SHRE_DEMO_MODE__ ||
        new URLSearchParams(window.location.search).get('demo') === 'true');
    if (isDemoMode) {
        return (_jsx(Suspense, { fallback: _jsx("div", { style: {
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--c-bg-1, #000)',
                    color: 'var(--c-text-4)',
                }, children: "Loading demo..." }), children: _jsx(DemoView, {}) }));
    }
    const DEV_BYPASS_AUTH = false;
    const { authState, authChecking, pendingWorkspaceSelection, handleLogin, handleWorkspaceSelected, handleWorkspaceSwitch, handleLogout, } = useAuth(DEV_BYPASS_AUTH);
    if (authChecking) {
        return (_jsx("div", { style: {
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--c-bg-1, #000)',
                color: 'var(--c-text-4)',
            }, children: "Loading..." }));
    }
    if (pendingWorkspaceSelection) {
        return (_jsx(WorkspaceSelectionScreen, { pending: pendingWorkspaceSelection, onSelect: handleWorkspaceSelected }));
    }
    if (!authState) {
        return _jsx(LoginView, { onLogin: handleLogin });
    }
    return (_jsx(AuthenticatedApp, { authUser: authState.user, onLogout: handleLogout, activeWorkspace: authState.workspace, workspaces: authState.workspaces, onWorkspaceSwitch: handleWorkspaceSwitch }));
}
function AuthenticatedApp({ authUser, onLogout, activeWorkspace, workspaces, onWorkspaceSwitch, }) {
    const [userProfile, setUserProfile] = useState(() => loadUserProfile());
    if (!userProfile || userProfile.onboardedAt === 0) {
        const completed = {
            ...(userProfile || createDefaultProfile(authUser)),
            onboardedAt: Date.now(),
        };
        saveUserProfile(completed);
        setUserProfile(completed);
        return null;
    }
    return (_jsx(MainApp, { authUser: authUser, onLogout: onLogout, userProfile: userProfile, setUserProfile: setUserProfile, activeWorkspace: activeWorkspace, workspaces: workspaces, onWorkspaceSwitch: onWorkspaceSwitch }));
}
function MainApp({ authUser, onLogout, userProfile, setUserProfile, activeWorkspace, workspaces, onWorkspaceSwitch, }) {
    const [sessions, setSessions] = useState(() => {
        const loaded = loadSessions();
        if (loaded.length === 0) {
            try {
                const old = JSON.parse(localStorage.getItem('shre-chat-history') || '[]');
                if (old.length > 0) {
                    const migrated = createSession('Migrated chat', 'main');
                    migrated.messages = old;
                    return [migrated];
                }
            }
            catch (err) {
                console.debug('legacy chat history migration', err);
            }
        }
        return loaded;
    });
    const [activeSessionId, setActiveSessionId] = useState(() => {
        const saved = loadActiveSession();
        if (saved && sessions.some((s) => s.id === saved))
            return saved;
        return sessions[0]?.id ?? null;
    });
    const [openTabs, setOpenTabs] = useState(() => {
        const saved = loadTabs();
        if (saved.length > 0)
            return saved.filter((id) => sessions.some((s) => s.id === id));
        return activeSessionId ? [activeSessionId] : [];
    });
    const [activeAgentId, setActiveAgentId] = useState(() => localStorage.getItem(AGENT_KEY) || 'shre');
    const [view, setView] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('view') || 'chat';
    });
    const [activity, setActivity] = useState(() => loadActivity());
    const [feed, setFeed] = useState(() => loadFeed());
    const [files, setFiles] = useState(() => loadFiles());
    const [streaming, setStreaming] = useState(false);
    const [streamText, setStreamText] = useState('');
    const [statusLine, setStatusLine] = useState(null);
    const [gatewayUp, setGatewayUp] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
    const [syncing, setSyncing] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
    // ── RapidRMS live anomaly stream ──
    const [rapidrmsWorkspace] = useState(() => localStorage.getItem('rapidrms-workspace'));
    const { anomalies: rmsAnomalies, criticalCount: rmsCriticalCount, dismiss: dismissRmsAlerts, } = useAnomalyStream({
        workspaceId: rapidrmsWorkspace,
    });
    const [compact, setCompact] = useState(() => localStorage.getItem('shre-compact') === 'true');
    const [writeEnabled, setWriteEnabled] = useState(() => localStorage.getItem('shre-write-enabled') !== 'false');
    const [claudeCliMode, setClaudeCliMode] = useState(() => localStorage.getItem('shre-claude-cli-mode') === 'true');
    const [replyToIndex, setReplyToIndex] = useState(null);
    const [themeCustom, setThemeCustomState] = useState(() => loadThemeCustom());
    const queueRef = useRef(loadQueue());
    const draftsRef = useRef(loadDrafts());
    const draftSaveTimer = useRef(null);
    // Cleanup draft save timer on unmount
    useEffect(() => {
        return () => {
            if (draftSaveTimer.current)
                clearTimeout(draftSaveTimer.current);
        };
    }, []);
    // ── Refs ──
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;
    const agentRef = useRef(activeAgentId);
    agentRef.current = activeAgentId;
    const streamTextRef = useRef(streamText);
    streamTextRef.current = streamText;
    const streamingRef = useRef(streaming);
    streamingRef.current = streaming;
    const crossTabRef = useRef(false);
    // ── Effects (extracted) ──
    useThemeEffect(theme);
    useThemeCustomEffect(themeCustom);
    useInitEffects(sessions, setSessions, setActiveSessionId, setSyncing);
    usePushNotifications();
    useStreamPersistence(activeSessionId, streamingRef, streamTextRef);
    usePeriodicSync(activeSessionId, sessionsRef);
    useDailyCompaction(sessions);
    useCrossTabSync(crossTabRef, setSessions, setActivity, setFeed, setFiles, setOpenTabs);
    useViewSwitchEvent(setView);
    useVisualViewport();
    // ── Actions (extracted) ──
    const updateSessions = useUpdateSessions(setSessions, crossTabRef);
    const actions = buildActions({
        sessionsRef,
        agentRef,
        queueRef,
        draftsRef,
        draftSaveTimer,
        crossTabRef,
        activeSessionId,
        setActiveSessionId,
        setOpenTabs,
        setActiveAgentId,
        setView,
        setActivity,
        setFeed,
        setFiles,
        setStreaming,
        setStreamText,
        setStatusLine,
        setGatewayUp,
        setSidebarOpen,
        setSyncing,
        setTheme,
        setCompact,
        setWriteEnabled,
        setReplyToIndex,
        setThemeCustomState,
        setClaudeCliMode,
        updateSessions,
        onLogout,
    });
    useFoldDetection(actions);
    // ── Memoized context ──
    const state = useMemo(() => ({
        sessions,
        activeSessionId,
        activeAgentId,
        openTabs,
        view,
        activity,
        feed,
        files,
        queue: queueRef.current,
        streaming,
        streamText,
        statusLine,
        gatewayUp,
        sidebarOpen,
        syncing,
        theme,
        themeCustom,
        compact,
        writeEnabled,
        replyToIndex,
        userProfile,
        claudeCliMode,
    }), [
        sessions,
        activeSessionId,
        activeAgentId,
        openTabs,
        view,
        activity,
        feed,
        files,
        streaming,
        streamText,
        statusLine,
        gatewayUp,
        sidebarOpen,
        syncing,
        theme,
        themeCustom,
        compact,
        writeEnabled,
        replyToIndex,
        userProfile,
        claudeCliMode,
    ]);
    const actionsRef = useRef(actions);
    actionsRef.current = actions;
    const stableActions = useMemo(() => {
        const proxy = {};
        for (const key of Object.keys(actions)) {
            proxy[key] = (...args) => actionsRef.current[key](...args);
        }
        return proxy;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const contextValue = useMemo(() => ({ state, actions: stableActions }), [state, stableActions]);
    // ── Swipe gesture handling ──
    const touchStartRef = useRef(null);
    const [swipeActive, setSwipeActive] = useState(false);
    const handleTouchStart = useCallback((e) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        if (touch.clientX < 30 && !sidebarOpen) {
            setSwipeActive(true);
        }
    }, [sidebarOpen]);
    const handleTouchMove = useCallback((e) => {
        if (!touchStartRef.current)
            return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        if (touchStartRef.current.x < 30 && dx > 20 && !sidebarOpen) {
            setSwipeActive(true);
        }
    }, [sidebarOpen]);
    const handleTouchEnd = useCallback((e) => {
        setSwipeActive(false);
        if (!touchStartRef.current)
            return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = Math.abs(touch.clientY - touchStartRef.current.y);
        const elapsed = Date.now() - touchStartRef.current.time;
        if (touchStartRef.current.x < 30 && dx > 80 && dy < 100 && elapsed < 500) {
            actions.setSidebarOpen(true);
        }
        if (sidebarOpen && dx < -80 && dy < 100 && elapsed < 500) {
            actions.setSidebarOpen(false);
        }
        touchStartRef.current = null;
    }, [sidebarOpen, actions]);
    // Detect standalone (PWA / Add to Home Screen) mode
    const isPWA = typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true);
    return (_jsx(ErrorBoundary, { children: _jsx(AppContext.Provider, { value: contextValue, children: _jsxs("div", { className: `h-full flex flex-col${isPWA ? ' pwa-mode' : ''}`, style: { background: 'var(--c-bg-1)' }, onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd, children: [isPWA && (_jsx("div", { className: "shrink-0", style: {
                            height: 'env(safe-area-inset-top, 0px)',
                            background: 'var(--c-bg-2)',
                        } })), _jsx(StatusBar, {}), _jsx(InstallBanner, {}), workspaces && workspaces.length > 1 && (_jsx(WorkspaceSwitcher, { activeWorkspace: (activeWorkspace ?? null), workspaces: workspaces, onSwitch: onWorkspaceSwitch })), rmsAnomalies.length > 0 && (_jsxs("div", { style: {
                            background: rmsCriticalCount > 0 ? 'var(--c-error, #dc2626)' : 'var(--c-warning, #d97706)',
                            color: '#fff',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: 13,
                            lineHeight: 1.4,
                            flexShrink: 0,
                        }, role: "alert", "aria-live": "polite", children: [_jsx("span", { style: { fontSize: 16, flexShrink: 0, paddingTop: 1 }, children: "\u26A0\uFE0F" }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [rmsAnomalies.slice(0, 3).map((a, i) => (_jsxs("div", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [_jsx("strong", { style: { textTransform: 'capitalize' }, children: a.severity }), ":", ' ', a.message] }, i))), rmsAnomalies.length > 3 && (_jsxs("div", { style: { opacity: 0.85 }, children: ["+", rmsAnomalies.length - 3, " more alert", rmsAnomalies.length - 3 !== 1 ? 's' : ''] }))] }), _jsx("button", { onClick: dismissRmsAlerts, style: {
                                    background: 'none',
                                    border: 'none',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    padding: '0 4px',
                                    opacity: 0.85,
                                    flexShrink: 0,
                                }, title: "Dismiss alerts", "aria-label": "Dismiss RapidRMS alerts", children: "\u2715" })] })), _jsxs("div", { className: "flex flex-1 min-h-0", children: [_jsx("div", { className: `swipe-indicator ${swipeActive ? 'swipe-active' : ''}` }), _jsx(Sidebar, {}), _jsx("div", { style: { display: view === 'chat' ? 'contents' : 'none' }, children: _jsx(Suspense, { fallback: _jsx(LazyFallback, {}), children: _jsx(ChatView, {}) }) }), view !== 'chat' && (_jsxs("div", { className: "flex-1 flex flex-col min-h-0 min-w-0", children: [_jsx(ViewNavHeader, { view: view, onSwitch: actions.setView }), _jsxs(Suspense, { fallback: _jsx(LazyFallback, {}), children: [view === 'activity' && (_jsx(ViewErrorBoundary, { viewName: "Activity", children: _jsx(ActivityView, {}) })), view === 'files' && (_jsx(ViewErrorBoundary, { viewName: "Files", children: _jsx(FilesView, {}) })), view === 'cron' && (_jsx(ViewErrorBoundary, { viewName: "Cron", children: _jsx(CronView, {}) })), view === 'feed' && (_jsx(ViewErrorBoundary, { viewName: "Feed", children: _jsx(FeedView, {}) })), view === 'agent-feed' && (_jsx(ViewErrorBoundary, { viewName: "Agent Feed", children: _jsx(AgentFeedView, {}) })), view === 'preview' && (_jsx(ViewErrorBoundary, { viewName: "Preview", children: _jsx(PreviewView, {}) })), view === 'spend' && (_jsx(ViewErrorBoundary, { viewName: "Spend", children: _jsx(SpendView, {}) })), view === 'briefing' && (_jsx(ViewErrorBoundary, { viewName: "Briefing", children: _jsx(BriefingView, {}) })), view === 'reminders' && (_jsx(ViewErrorBoundary, { viewName: "Reminders", children: _jsx(RemindersView, {}) })), view === 'cost-dashboard' && (_jsx(ViewErrorBoundary, { viewName: "Cost Dashboard", children: _jsx(CostDashboardView, {}) })), view === 'marketplace' && (_jsx(ViewErrorBoundary, { viewName: "Marketplace", children: _jsx(MarketplaceView, {}) })), view === 'admin' && (_jsx(ViewErrorBoundary, { viewName: "Admin", children: _jsx(AdminView, {}) })), view === 'feed-analytics' && (_jsx(ViewErrorBoundary, { viewName: "Feed Analytics", children: _jsx(FeedAnalyticsView, {}) })), view === 'task-timeline' && (_jsx(ViewErrorBoundary, { viewName: "Task Timeline", children: _jsx(TaskTimelineView, {}) })), view === 'finetune' && (_jsx(ViewErrorBoundary, { viewName: "Fine-Tuning", children: _jsx(FinetuneView, {}) })), view === 'reports' && (_jsx(ViewErrorBoundary, { viewName: "Reports", children: _jsx(ReportsView, {}) })), view === 'employee-activity' && (_jsx(ViewErrorBoundary, { viewName: "Employee Activity", children: _jsx(EmployeeActivityView, {}) })), view === 'tasks' && (_jsx(ViewErrorBoundary, { viewName: "Tasks", children: _jsx(TasksView, {}) })), view === 'projects' && (_jsx(ViewErrorBoundary, { viewName: "Projects", children: _jsx(ProjectsView, {}) })), view === 'email' && (_jsx(ViewErrorBoundary, { viewName: "Email", children: _jsx(EmailView, {}) })), view === 'billing' && (_jsx(ViewErrorBoundary, { viewName: "Billing", children: _jsx(BillingView, {}) })), view === 'investor' && (_jsx(ViewErrorBoundary, { viewName: "Investor Dashboard", children: _jsx(InvestorView, {}) })), view === 'router-gateway' && (_jsx(ViewErrorBoundary, { viewName: "Router Gateway", children: _jsx(RouterGatewayEmbed, {}) })), view === 'shre-dashboard' && (_jsx(ViewErrorBoundary, { viewName: "Shre Dashboard", children: _jsx("div", { className: "flex-1 w-full h-full flex flex-col", style: { background: 'var(--c-bg-1)' }, children: _jsx("iframe", { src: "/shre-dashboard/", className: "flex-1 w-full border-0", title: "Shre AI Dashboard", style: { background: '#1a1a2e', minHeight: 0 } }) }) })), view === 'cortexdb' && (_jsx(ViewErrorBoundary, { viewName: "CortexDB", children: _jsx("div", { className: "flex-1 w-full h-full flex flex-col", style: { background: 'var(--c-bg-1)' }, children: _jsx("iframe", { src: "/cortexdb-ui/", className: "flex-1 w-full border-0", title: "CortexDB Dashboard", style: { background: '#1a1a2e', minHeight: 0 } }) }) })), view === 'storepulse' && (_jsx(ViewErrorBoundary, { viewName: "StorePulse", children: _jsx("div", { className: "flex-1 w-full h-full flex flex-col", style: { background: 'var(--c-bg-1)' }, children: _jsx("iframe", { src: "/storepulse/", className: "flex-1 w-full border-0", title: "StorePulse", style: { background: '#1a1a2e', minHeight: 0 } }) }) })), view === 'app-marketplace' && (_jsx(ViewErrorBoundary, { viewName: "Marketplace", children: _jsx("div", { className: "flex-1 w-full h-full flex flex-col", style: { background: 'var(--c-bg-1)' }, children: _jsx("iframe", { src: "/app-marketplace/", className: "flex-1 w-full border-0", title: "Marketplace", style: { background: '#1a1a2e', minHeight: 0 } }) }) }))] })] }))] })] }) }) }));
}
