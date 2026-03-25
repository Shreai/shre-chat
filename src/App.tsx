import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import {
  AppContext,
  type AppState,
  type AppActions,
  type Session,
  type View,
  type Theme,
  type ThemeCustom,
  type UploadedFile,
  type QueuedMessage,
  type FeedEntry,
  uid,
  createSession,
  loadSessions,
  loadActivity,
  loadFeed,
  loadFiles,
  loadTabs,
  loadActiveSession,
  loadQueue,
  loadThemeCustom,
  loadDrafts,
} from "./store";
import type { ChatMessage } from "./openclaw";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { ChatView } from "./ChatView";
import { ErrorBoundary } from "./ErrorBoundary";
import { ViewErrorBoundary } from "./ViewErrorBoundary";
import { LoginView } from "./LoginView";
import { loadUserProfile, saveUserProfile, createDefaultProfile, type UserProfile } from "./store";
import { useAnomalyStream } from "./hooks/useAnomalyStream";

// ── Extracted modules ──
import {
  useAuth,
  installAuthFetch,
  type AuthWorkspace,
  type AuthUser,
  WorkspaceSelectionScreen,
} from "./AppAuth";
import { ViewNavHeader } from "./ViewNavHeader";
import { buildActions, type ActionDeps } from "./AppActions";
import {
  useThemeEffect,
  useThemeCustomEffect,
  useInitEffects,
  usePushNotifications,
  useStreamPersistence,
  usePeriodicSync,
  useDailyCompaction,
  useCrossTabSync,
  useViewSwitchEvent,
  useVisualViewport,
  useFoldDetection,
  useUpdateSessions,
} from "./AppEffects";

// Lazy-load non-default views for code splitting
const ActivityView = lazy(() => import("./ActivityView").then(m => ({ default: m.ActivityView })));
const FilesView = lazy(() => import("./FilesView").then(m => ({ default: m.FilesView })));
const CronView = lazy(() => import("./CronView").then(m => ({ default: m.CronView })));
const FeedView = lazy(() => import("./FeedView").then(m => ({ default: m.FeedView })));
const AgentFeedView = lazy(() => import("./AgentFeedView").then(m => ({ default: m.AgentFeedView })));
const PreviewView = lazy(() => import("./PreviewView").then(m => ({ default: m.PreviewView })));
const SpendView = lazy(() => import("./SpendView").then(m => ({ default: m.SpendView })));
const BriefingView = lazy(() => import("./BriefingView").then(m => ({ default: m.BriefingView })));
const RemindersView = lazy(() => import("./RemindersView").then(m => ({ default: m.RemindersView })));
const CostDashboardView = lazy(() => import("./CostDashboardView").then(m => ({ default: m.CostDashboardView })));
const MarketplaceView = lazy(() => import("./MarketplaceView").then(m => ({ default: m.MarketplaceView })));
const AdminView = lazy(() => import("./AdminView").then(m => ({ default: m.AdminView })));
const FeedAnalyticsView = lazy(() => import("./FeedAnalyticsView").then(m => ({ default: m.FeedAnalyticsView })));
const TaskTimelineView = lazy(() => import("./TaskTimelineView").then(m => ({ default: m.TaskTimelineView })));
const FinetuneView = lazy(() => import("./FinetuneView").then(m => ({ default: m.FinetuneView })));
const ReportsView = lazy(() => import("./ReportsView").then(m => ({ default: m.ReportsView })));
const EmployeeActivityView = lazy(() => import("./EmployeeActivityView").then(m => ({ default: m.EmployeeActivityView })));
const TasksView = lazy(() => import("./TasksView").then(m => ({ default: m.TasksView })));
const ProjectsView = lazy(() => import("./ProjectsView").then(m => ({ default: m.ProjectsView })));
const EmailView = lazy(() => import("./EmailView").then(m => ({ default: m.EmailView })));

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center" style={{ color: "var(--c-text-3)" }}>
    Loading…
  </div>
);

const AGENT_KEY = "shre-active-agent";
const THEME_KEY = "shre-theme";

export function App() {
  const DEV_BYPASS_AUTH = false;

  const {
    authState,
    authChecking,
    pendingWorkspaceSelection,
    handleLogin,
    handleWorkspaceSelected,
    handleWorkspaceSwitch,
    handleLogout,
  } = useAuth(DEV_BYPASS_AUTH);

  if (authChecking) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--c-bg-1, #000)", color: "var(--c-text-4)" }}>Loading...</div>;
  }

  if (pendingWorkspaceSelection) {
    return <WorkspaceSelectionScreen pending={pendingWorkspaceSelection} onSelect={handleWorkspaceSelected} />;
  }

  if (!authState) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <AuthenticatedApp
      authUser={authState.user}
      onLogout={handleLogout}
      activeWorkspace={authState.workspace}
      workspaces={authState.workspaces}
      onWorkspaceSwitch={handleWorkspaceSwitch}
    />
  );
}

function AuthenticatedApp({ authUser, onLogout, activeWorkspace, workspaces, onWorkspaceSwitch }: {
  authUser: AuthUser;
  onLogout: () => void;
  activeWorkspace?: AuthWorkspace | null;
  workspaces?: AuthWorkspace[];
  onWorkspaceSwitch: (workspaceId: string) => void;
}) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => loadUserProfile());

  if (!userProfile || userProfile.onboardedAt === 0) {
    const completed = { ...(userProfile || createDefaultProfile(authUser)), onboardedAt: Date.now() };
    saveUserProfile(completed);
    setUserProfile(completed);
    return null;
  }

  return (
    <MainApp
      authUser={authUser}
      onLogout={onLogout}
      userProfile={userProfile}
      setUserProfile={setUserProfile}
      activeWorkspace={activeWorkspace}
      workspaces={workspaces}
      onWorkspaceSwitch={onWorkspaceSwitch}
    />
  );
}

function MainApp({ authUser, onLogout, userProfile, setUserProfile, activeWorkspace, workspaces, onWorkspaceSwitch }: {
  authUser: AuthUser;
  onLogout: () => void;
  activeWorkspace?: AuthWorkspace | null;
  workspaces?: AuthWorkspace[];
  onWorkspaceSwitch: (workspaceId: string) => void;
  userProfile: UserProfile;
  setUserProfile: (p: UserProfile) => void;
}) {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const loaded = loadSessions();
    if (loaded.length === 0) {
      try {
        const old = JSON.parse(localStorage.getItem("shre-chat-history") || "[]");
        if (old.length > 0) {
          const migrated = createSession("Migrated chat", "main");
          migrated.messages = old;
          return [migrated];
        }
      } catch (err) { console.debug("legacy chat history migration", err); }
    }
    return loaded;
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const saved = loadActiveSession();
    if (saved && sessions.some((s) => s.id === saved)) return saved;
    return sessions[0]?.id ?? null;
  });

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    const saved = loadTabs();
    if (saved.length > 0) return saved.filter((id) => sessions.some((s) => s.id === id));
    return activeSessionId ? [activeSessionId] : [];
  });

  const [activeAgentId, setActiveAgentId] = useState(() => localStorage.getItem(AGENT_KEY) || "shre");
  const [view, setView] = useState<View>("chat");
  const [activity, setActivity] = useState(() => loadActivity());
  const [feed, setFeed] = useState(() => loadFeed());
  const [files, setFiles] = useState(() => loadFiles());
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [gatewayUp, setGatewayUp] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "dark");

  // ── RapidRMS live anomaly stream ──
  const [rapidrmsWorkspace] = useState<string | null>(
    () => localStorage.getItem("rapidrms-workspace")
  );
  const { anomalies: rmsAnomalies, criticalCount: rmsCriticalCount, dismiss: dismissRmsAlerts } = useAnomalyStream({
    workspaceId: rapidrmsWorkspace,
  });
  const [compact, setCompact] = useState(() => localStorage.getItem("shre-compact") === "true");
  const [writeEnabled, setWriteEnabled] = useState(() => localStorage.getItem("shre-write-enabled") !== "false");
  const [replyToIndex, setReplyToIndex] = useState<number | null>(null);
  const [themeCustom, setThemeCustomState] = useState<ThemeCustom>(() => loadThemeCustom());
  const queueRef = useRef<QueuedMessage[]>(loadQueue());
  const draftsRef = useRef<Record<string, string>>(loadDrafts());
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup draft save timer on unmount
  useEffect(() => {
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
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
    sessionsRef, agentRef, queueRef, draftsRef, draftSaveTimer, crossTabRef,
    activeSessionId,
    setActiveSessionId, setOpenTabs, setActiveAgentId, setView,
    setActivity, setFeed, setFiles, setStreaming, setStreamText,
    setStatusLine, setGatewayUp, setSidebarOpen, setSyncing, setTheme,
    setCompact, setWriteEnabled, setReplyToIndex, setThemeCustomState,
    updateSessions, onLogout,
  });

  useFoldDetection(actions);

  // ── Memoized context ──
  const state: AppState = useMemo(() => ({
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
  }), [
    sessions, activeSessionId, activeAgentId, openTabs, view,
    activity, feed, files, streaming, streamText, statusLine,
    gatewayUp, sidebarOpen, syncing, theme, themeCustom, compact,
    writeEnabled, replyToIndex, userProfile,
  ]);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const stableActions = useMemo(() => {
    const proxy: AppActions = {} as AppActions;
    for (const key of Object.keys(actions) as (keyof AppActions)[]) {
      (proxy as any)[key] = (...args: any[]) => (actionsRef.current as any)[key](...args);
    }
    return proxy;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const contextValue = useMemo(() => ({ state, actions: stableActions }), [state, stableActions]);

  // ── Swipe gesture handling ──
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeActive, setSwipeActive] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    if (touch.clientX < 30 && !sidebarOpen) {
      setSwipeActive(true);
    }
  }, [sidebarOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    if (touchStartRef.current.x < 30 && dx > 20 && !sidebarOpen) {
      setSwipeActive(true);
    }
  }, [sidebarOpen]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    setSwipeActive(false);
    if (!touchStartRef.current) return;
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
  const isPWA = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );

  return (
    <ErrorBoundary>
      <AppContext.Provider value={contextValue}>
        <div
          className={`h-full flex flex-col${isPWA ? " pwa-mode" : ""}`}
          style={{ background: "var(--c-bg-1)" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {isPWA && (
            <div
              className="flex items-center justify-between px-3 shrink-0"
              style={{
                height: `calc(44px + env(safe-area-inset-top, 0px))`,
                paddingTop: "env(safe-area-inset-top, 0px)",
                background: "var(--c-bg-2)",
                borderBottom: "1px solid var(--c-border)",
              }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Shre</span>
              <button
                onClick={() => { actions.switchView("chat"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ color: "var(--c-text-2)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                Chat
              </button>
            </div>
          )}
          <StatusBar />
          {workspaces && workspaces.length > 1 && (
            <WorkspaceSwitcher
              activeWorkspace={(activeWorkspace ?? null) as { id: string; name: string; role: string; isDefault?: boolean } | null}
              workspaces={workspaces}
              onSwitch={onWorkspaceSwitch}
            />
          )}
          {rmsAnomalies.length > 0 && (
            <div
              style={{
                background: rmsCriticalCount > 0 ? "var(--c-error, #dc2626)" : "var(--c-warning, #d97706)",
                color: "#fff",
                padding: "6px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                lineHeight: 1.4,
                flexShrink: 0,
              }}
              role="alert"
              aria-live="polite"
            >
              <span style={{ fontSize: 16, flexShrink: 0, paddingTop: 1 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {rmsAnomalies.slice(0, 3).map((a: any, i: number) => (
                  <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ textTransform: "capitalize" }}>{a.severity}</strong>: {a.message}
                  </div>
                ))}
                {rmsAnomalies.length > 3 && (
                  <div style={{ opacity: 0.85 }}>+{rmsAnomalies.length - 3} more alert{rmsAnomalies.length - 3 !== 1 ? "s" : ""}</div>
                )}
              </div>
              <button
                onClick={dismissRmsAlerts}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, padding: "0 4px", opacity: 0.85, flexShrink: 0 }}
                title="Dismiss alerts"
                aria-label="Dismiss RapidRMS alerts"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex flex-1 min-h-0">
            <div className={`swipe-indicator ${swipeActive ? "swipe-active" : ""}`} />
            <Sidebar />
            <div style={{ display: view === "chat" ? "contents" : "none" }}><ChatView /></div>
            {view !== "chat" && (
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <ViewNavHeader view={view} onSwitch={actions.setView} />
                <Suspense fallback={<LazyFallback />}>
                  {view === "activity" && <ViewErrorBoundary viewName="Activity"><ActivityView /></ViewErrorBoundary>}
                  {view === "files" && <ViewErrorBoundary viewName="Files"><FilesView /></ViewErrorBoundary>}
                  {view === "cron" && <ViewErrorBoundary viewName="Cron"><CronView /></ViewErrorBoundary>}
                  {view === "feed" && <ViewErrorBoundary viewName="Feed"><FeedView /></ViewErrorBoundary>}
                  {view === "agent-feed" && <ViewErrorBoundary viewName="Agent Feed"><AgentFeedView /></ViewErrorBoundary>}
                  {view === "preview" && <ViewErrorBoundary viewName="Preview"><PreviewView /></ViewErrorBoundary>}
                  {view === "spend" && <ViewErrorBoundary viewName="Spend"><SpendView /></ViewErrorBoundary>}
                  {view === "briefing" && <ViewErrorBoundary viewName="Briefing"><BriefingView /></ViewErrorBoundary>}
                  {view === "reminders" && <ViewErrorBoundary viewName="Reminders"><RemindersView /></ViewErrorBoundary>}
                  {view === "cost-dashboard" && <ViewErrorBoundary viewName="Cost Dashboard"><CostDashboardView /></ViewErrorBoundary>}
                  {view === "marketplace" && <ViewErrorBoundary viewName="Marketplace"><MarketplaceView /></ViewErrorBoundary>}
                  {view === "admin" && <ViewErrorBoundary viewName="Admin"><AdminView /></ViewErrorBoundary>}
                  {view === "feed-analytics" && <ViewErrorBoundary viewName="Feed Analytics"><FeedAnalyticsView /></ViewErrorBoundary>}
                  {view === "task-timeline" && <ViewErrorBoundary viewName="Task Timeline"><TaskTimelineView /></ViewErrorBoundary>}
                  {view === "finetune" && <ViewErrorBoundary viewName="Fine-Tuning"><FinetuneView /></ViewErrorBoundary>}
                  {view === "reports" && <ViewErrorBoundary viewName="Reports"><ReportsView /></ViewErrorBoundary>}
                  {view === "employee-activity" && <ViewErrorBoundary viewName="Employee Activity"><EmployeeActivityView /></ViewErrorBoundary>}
                  {view === "tasks" && <ViewErrorBoundary viewName="Tasks"><TasksView /></ViewErrorBoundary>}
                  {view === "projects" && <ViewErrorBoundary viewName="Projects"><ProjectsView /></ViewErrorBoundary>}
                  {view === "email" && <ViewErrorBoundary viewName="Email"><EmailView /></ViewErrorBoundary>}
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
