import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
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
  saveSessions,
  syncWithServer,
  loadActivity,
  loadFeed,
  loadFiles,
  loadTabs,
  loadActiveSession,
  loadQueue,
  loadThemeCustom,
  loadDrafts,
} from './store';
import type { ChatMessage } from './router-client';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
// ChatView lazy-loaded with preload — it's the default view so it starts
// fetching immediately, but the chunk split keeps the initial bundle small.
const ChatView = lazy(() => import('./ChatView').then((m) => ({ default: m.ChatView })));
// Preload ChatView chunk immediately so first paint isn't delayed
import('./ChatView').catch(() => {});
import { ErrorBoundary } from './ErrorBoundary';
import { ViewErrorBoundary } from './ViewErrorBoundary';
import { LoginView } from './LoginView';
import { loadUserProfile, saveUserProfile, createDefaultProfile, type UserProfile } from './store';
import { OnboardingView } from './OnboardingView';
import { useAnomalyStream } from './hooks/useAnomalyStream';
import InstallBanner from './components/InstallBanner';
import { CINotificationToast } from './components/CINotificationToast';

// ── Extracted modules ──
import {
  useAuth,
  installAuthFetch,
  type AuthWorkspace,
  type AuthUser,
  WorkspaceSelectionScreen,
} from './AppAuth';
import { ViewNavHeader } from './ViewNavHeader';
import { buildActions, type ActionDeps } from './AppActions';
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
} from './AppEffects';

// Lazy-load non-default views for code splitting
const ActivityView = lazy(() =>
  import('./ActivityView').then((m) => ({ default: m.ActivityView })),
);
const FilesView = lazy(() => import('./FilesView').then((m) => ({ default: m.FilesView })));
const CronView = lazy(() => import('./CronView').then((m) => ({ default: m.CronView })));
const FeedView = lazy(() => import('./FeedView').then((m) => ({ default: m.FeedView })));
const AgentFeedView = lazy(() =>
  import('./AgentFeedView').then((m) => ({ default: m.AgentFeedView })),
);
const AgentSocialView = lazy(() =>
  import('./AgentSocialView').then((m) => ({ default: m.AgentSocialView })),
);
const PreviewView = lazy(() => import('./PreviewView').then((m) => ({ default: m.PreviewView })));
const SpendView = lazy(() => import('./SpendView').then((m) => ({ default: m.SpendView })));
const BriefingView = lazy(() =>
  import('./BriefingView').then((m) => ({ default: m.BriefingView })),
);
const RemindersView = lazy(() =>
  import('./RemindersView').then((m) => ({ default: m.RemindersView })),
);
const CostDashboardView = lazy(() =>
  import('./CostDashboardView').then((m) => ({ default: m.CostDashboardView })),
);
const MarketplaceView = lazy(() =>
  import('./MarketplaceView').then((m) => ({ default: m.MarketplaceView })),
);
const AdminView = lazy(() => import('./AdminView').then((m) => ({ default: m.AdminView })));
const FeedAnalyticsView = lazy(() =>
  import('./FeedAnalyticsView').then((m) => ({ default: m.FeedAnalyticsView })),
);
const TaskTimelineView = lazy(() =>
  import('./TaskTimelineView').then((m) => ({ default: m.TaskTimelineView })),
);
const FinetuneView = lazy(() =>
  import('./FinetuneView').then((m) => ({ default: m.FinetuneView })),
);
const ReportsView = lazy(() => import('./ReportsView').then((m) => ({ default: m.ReportsView })));
const EmployeeActivityView = lazy(() =>
  import('./EmployeeActivityView').then((m) => ({ default: m.EmployeeActivityView })),
);
const TasksView = lazy(() => import('./TasksView').then((m) => ({ default: m.TasksView })));
const ProjectsView = lazy(() =>
  import('./ProjectsView').then((m) => ({ default: m.ProjectsView })),
);
const EmailView = lazy(() => import('./EmailView').then((m) => ({ default: m.EmailView })));
const BillingView = lazy(() => import('./BillingView').then((m) => ({ default: m.BillingView })));
const DemoView = lazy(() => import('./DemoView').then((m) => ({ default: m.DemoView })));
const InvestorView = lazy(() =>
  import('./InvestorView').then((m) => ({ default: m.InvestorView })),
);
const AgentTraceView = lazy(() =>
  import('./AgentTraceView').then((m) => ({ default: m.AgentTraceView })),
);

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--c-text-3)' }}>
    Loading…
  </div>
);

/** Router Gateway Control UI embed — auto-injects gateway token + WS URL */
function RouterGatewayEmbed() {
  const [status, setStatus] = useState<{
    ok?: boolean;
    models?: string[];
    agents?: number;
    uptime?: number;
    error?: string;
  } | null>(null);
  useEffect(() => {
    fetch('/api/router/health')
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ error: 'Cannot reach shre-router' }));
  }, []);
  return (
    <div
      className="flex-1 w-full h-full flex flex-col items-center justify-center gap-4 p-6"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div style={{ fontSize: 14, color: 'var(--c-text-2)', maxWidth: 480, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, color: 'var(--c-text-1)', marginBottom: 12 }}>Router Gateway</h2>
        {!status && <p>Loading...</p>}
        {status?.error && <p style={{ color: '#ef4444' }}>{status.error}</p>}
        {status?.ok && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            <p>
              <span style={{ color: '#22c55e' }}>&#9679;</span> shre-router is online (uptime:{' '}
              {Math.round((status.uptime || 0) / 60)}m)
            </p>
            {status.agents != null && <p>Active agents: {status.agents}</p>}
          </div>
        )}
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--c-text-3)' }}>
          Gateway management available via MIB007 dashboard or CLI.
        </p>
      </div>
    </div>
  );
}

const AGENT_KEY = 'shre-active-agent';
const THEME_KEY = 'shre-theme';

export function App() {
  // ── Demo mode — internal only, gated by compile flag ──
  const isDemoMode =
    __SHRE_INTERNAL__ &&
    !!(
      (window as any).__SHRE_DEMO_MODE__ ||
      new URLSearchParams(window.location.search).get('demo') === 'true'
    );

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

  if (isDemoMode) {
    return (
      <Suspense
        fallback={
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--c-bg-1, #000)',
              color: 'var(--c-text-4)',
            }}
          >
            Loading demo...
          </div>
        }
      >
        <DemoView />
      </Suspense>
    );
  }

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--c-bg-1, #000)',
          color: 'var(--c-text-4)',
        }}
      >
        Loading...
      </div>
    );
  }

  if (pendingWorkspaceSelection) {
    return (
      <WorkspaceSelectionScreen
        pending={pendingWorkspaceSelection}
        onSelect={handleWorkspaceSelected}
      />
    );
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

function AuthenticatedApp({
  authUser,
  onLogout,
  activeWorkspace,
  workspaces,
  onWorkspaceSwitch,
}: {
  authUser: AuthUser;
  onLogout: () => void;
  activeWorkspace?: AuthWorkspace | null;
  workspaces?: AuthWorkspace[];
  onWorkspaceSwitch: (workspaceId: string) => void;
}) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => loadUserProfile());
  const [onboardingPhase, setOnboardingPhase] = useState<'loading' | 'needed' | 'done' | 'welcome'>(
    'loading',
  );
  const [landingTarget, setLandingTarget] = useState<'chat' | 'home'>('chat');
  const [dashboardTargets, setDashboardTargets] = useState<Array<{ id: string; label: string; url: string }>>([]);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    const ac = new AbortController();

    fetch('/api/onboarding/status', { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ac.signal.aborted) return;
        if (data?.phase === 'complete') {
          // Server says onboarding is done — sync identity to local profile if needed
          if (!userProfile || userProfile.onboardedAt === 0) {
            const completed = {
              ...(userProfile || createDefaultProfile(authUser)),
              name: data.identityData?.name || authUser.name || '',
              role: data.identityData?.role || authUser.role || '',
              onboardedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
            };
            if (data.identityData?.businessName) {
              completed.business = {
                ...completed.business,
                name: data.identityData.businessName,
                industry: data.identityData.businessType || '',
                size: data.identityData.businessSize || '',
              };
            }
            saveUserProfile(completed);
            setUserProfile(completed);
          }
          setOnboardingPhase('done');
        } else {
          // Server says not complete — check for local migration
          const migrated = localStorage.getItem('shre-onboarding-migrated');
          if (!migrated && userProfile?.onboardedAt && userProfile.onboardedAt > 0) {
            // Existing local user — push to server as complete, don't re-onboard
            fetch('/api/onboarding/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                onboardingPhase: 'complete',
                step: 'dashboard',
                completedSteps: [
                  'welcome',
                  'marketplace',
                  'configure',
                  'stores',
                  'model',
                  'agents',
                  'dashboard',
                ],
                path: 'operator',
                identityData: {
                  name: userProfile.name,
                  role: userProfile.role,
                  businessName: userProfile.business?.name || '',
                  businessType: userProfile.business?.industry || '',
                  businessSize: userProfile.business?.size || '',
                },
                chatPreferences: userProfile.preferences
                  ? {
                      communicationStyle: userProfile.preferences.communicationStyle,
                      goals: userProfile.business?.goals || [],
                      tools: userProfile.business?.tools || [],
                    }
                  : undefined,
              }),
            })
              .then(() => localStorage.setItem('shre-onboarding-migrated', '1'))
              .catch(() => {
                /* non-fatal */
              });
            setOnboardingPhase('done');
          } else {
            setOnboardingPhase('needed');
          }
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // MIB007 unreachable — fall back to localStorage
        if (userProfile?.onboardedAt && userProfile.onboardedAt > 0) {
          setOnboardingPhase('done');
        } else {
          setOnboardingPhase('needed');
        }
      });
    return () => ac.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (onboardingPhase === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #0a0a0a)',
        }}
      >
        <div style={{ color: 'var(--text-secondary, #888)', fontSize: '14px' }}>Loading...</div>
      </div>
    );
  }

  if (onboardingPhase === 'needed') {
    return (
      <OnboardingView
        profile={userProfile || createDefaultProfile(authUser)}
        onComplete={(completed, selectedAgents, selectedBundle) => {
          // Persist to server with selected agents from wizard
          fetch('/api/onboarding/unified/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selectedAgents: selectedAgents || [],
              selectedBundle: selectedBundle || undefined,
              chatPreferences: completed.preferences
                ? {
                    communicationStyle: completed.preferences.communicationStyle,
                    goals: completed.business?.goals || [],
                    tools: completed.business?.tools || [],
                  }
                : undefined,
            }),
          }).catch(() => {
            /* non-fatal */
          });
          saveUserProfile(completed);
          setUserProfile(completed);
          // Check smart landing target
          fetch('/api/onboarding/landing-target')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.target === 'home') setLandingTarget('home');
              if (Array.isArray(data?.dashboardTargets)) setDashboardTargets(data.dashboardTargets);
            })
            .catch(() => {});
          setOnboardingPhase('welcome');
        }}
        onSkip={() => {
          const skipped = {
            ...(userProfile || createDefaultProfile(authUser)),
            onboardedAt: Date.now(),
          };
          // Push skip state to server
          fetch('/api/onboarding/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onboardingPhase: 'complete' }),
          }).catch(() => {
            /* non-fatal */
          });
          saveUserProfile(skipped);
          setUserProfile(skipped);
          setOnboardingPhase('done');
        }}
      />
    );
  }

  if (onboardingPhase === 'welcome') {
    const defaultDashboards = [
      { id: 'mib', label: 'MIB Dashboard', url: 'https://mib.shre.ai' },
      { id: 'chat', label: 'Chat Dashboard', url: 'https://chat.shre.ai' },
    ];
    const dashboards = dashboardTargets.length > 0 ? dashboardTargets : defaultDashboards;
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--c-bg-1)' }}
      >
        <div className="w-full max-w-md text-center space-y-6">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
            You're all set!
          </h2>
          <p className="text-sm" style={{ color: 'var(--c-text-4)' }}>
            Your AI workspace is ready. Where would you like to start?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => setOnboardingPhase('done')}
              className="w-full px-5 py-3 rounded-xl font-medium text-sm transition-colors"
              style={{ background: 'var(--c-accent)', color: '#fff' }}
            >
              Start Chatting
            </button>
            {landingTarget === 'home' && dashboards.map((dash) => (
              <a
                key={dash.id}
                href={dash.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-5 py-3 rounded-xl font-medium text-sm transition-colors text-center"
                style={{
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-2)',
                  background: 'var(--c-bg-card)',
                }}
              >
                {dash.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <MainApp
      authUser={authUser}
      onLogout={onLogout}
      userProfile={userProfile!}
      setUserProfile={setUserProfile}
      activeWorkspace={activeWorkspace}
      workspaces={workspaces}
      onWorkspaceSwitch={onWorkspaceSwitch}
    />
  );
}

function MainApp({
  authUser,
  onLogout,
  userProfile,
  setUserProfile,
  activeWorkspace,
  workspaces,
  onWorkspaceSwitch,
}: {
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
        const old = JSON.parse(localStorage.getItem('shre-chat-history') || '[]');
        if (old.length > 0) {
          const migrated = createSession('Migrated chat', 'main');
          migrated.messages = old;
          return [migrated];
        }
      } catch (err) {
        console.debug('legacy chat history migration', err);
      }
    }
    return loaded;
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const saved = loadActiveSession();
    if (saved && sessions.some((s) => s.id === saved)) return saved;
    return sessions[0]?.id ?? null;
  });

  // Sync sessions with server on mount — merges server data with local
  useEffect(() => {
    syncWithServer(sessions).then((merged) => {
      if (merged !== sessions && merged.length > 0) {
        setSessions(merged);
        saveSessions(merged);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    const saved = loadTabs();
    if (saved.length > 0) return saved.filter((id) => sessions.some((s) => s.id === id));
    return activeSessionId ? [activeSessionId] : [];
  });

  const [activeAgentId, setActiveAgentId] = useState(
    () => localStorage.getItem(AGENT_KEY) || 'shre',
  );
  const [view, setView] = useState<View>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as View) || 'chat';
  });
  const [activity, setActivity] = useState(() => loadActivity());
  const [feed, setFeed] = useState(() => loadFeed());
  const [files, setFiles] = useState(() => loadFiles());
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [gatewayUp, setGatewayUp] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) || 'dark',
  );

  // ── RapidRMS live anomaly stream ──
  const [rapidrmsWorkspace] = useState<string | null>(() =>
    localStorage.getItem('rapidrms-workspace'),
  );
  const {
    anomalies: rmsAnomalies,
    criticalCount: rmsCriticalCount,
    dismiss: dismissRmsAlerts,
  } = useAnomalyStream({
    workspaceId: rapidrmsWorkspace,
  });
  const [compact, setCompact] = useState(() => localStorage.getItem('shre-compact') === 'true');
  const [writeEnabled, setWriteEnabled] = useState(
    () => localStorage.getItem('shre-write-enabled') !== 'false',
  );
  const [claudeCliMode, setClaudeCliMode] = useState(
    () => localStorage.getItem('shre-claude-cli-mode') === 'true',
  );
  const [replyToIndex, setReplyToIndex] = useState<number | null>(null);
  const [themeCustom, setThemeCustomState] = useState<ThemeCustom>(() => loadThemeCustom());
  const [cliLedgerSessionId, setCliLedgerSessionId] = useState<string | null>(null);
  const [cliSummaryMode, setCliSummaryMode] = useState<Record<string, 'full' | 'summary'>>({});
  const queueRef = useRef<QueuedMessage[]>(loadQueue());
  const draftsRef = useRef<Record<string, string>>(loadDrafts());
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup draft save timer on unmount
  useEffect(() => {
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
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
    setCliLedgerSessionId,
    cliSummaryMode,
    setCliSummaryMode,
    updateSessions,
    onLogout,
  });

  useFoldDetection(actions);

  // ── Memoized context ──
  const state: AppState = useMemo(
    () => ({
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
      cliLedgerSessionId,
      cliSummaryMode,
    }),
    [
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
      cliLedgerSessionId,
      cliSummaryMode,
    ],
  );

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

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      if (touch.clientX < 30 && !sidebarOpen) {
        setSwipeActive(true);
      }
    },
    [sidebarOpen],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      if (touchStartRef.current.x < 30 && dx > 20 && !sidebarOpen) {
        setSwipeActive(true);
      }
    },
    [sidebarOpen],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
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
    },
    [sidebarOpen, actions],
  );

  // Detect standalone (PWA / Add to Home Screen) mode
  const isPWA =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  return (
    <ErrorBoundary>
      <AppContext.Provider value={contextValue}>
        <div
          className={`h-full flex flex-col${isPWA ? ' pwa-mode' : ''}`}
          style={{ background: 'var(--c-bg-1)' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* PWA safe-area spacer — accounts for notch/status bar without a redundant header */}
          {isPWA && (
            <div
              className="shrink-0"
              style={{
                height: 'env(safe-area-inset-top, 0px)',
                background: 'var(--c-bg-2)',
              }}
            />
          )}
          <StatusBar />
          <InstallBanner />
          {workspaces && workspaces.length > 1 && (
            <WorkspaceSwitcher
              activeWorkspace={
                (activeWorkspace ?? null) as {
                  id: string;
                  name: string;
                  role: string;
                  isDefault?: boolean;
                } | null
              }
              workspaces={workspaces}
              onSwitch={onWorkspaceSwitch}
            />
          )}
          {rmsAnomalies.length > 0 && (
            <div
              style={{
                background:
                  rmsCriticalCount > 0 ? 'var(--c-error, #dc2626)' : 'var(--c-warning, #d97706)',
                color: '#fff',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'flex-start',
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
                  <div
                    key={i}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <strong style={{ textTransform: 'capitalize' }}>{a.severity}</strong>:{' '}
                    {a.message}
                  </div>
                ))}
                {rmsAnomalies.length > 3 && (
                  <div style={{ opacity: 0.85 }}>
                    +{rmsAnomalies.length - 3} more alert{rmsAnomalies.length - 3 !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <button
                onClick={dismissRmsAlerts}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '0 4px',
                  opacity: 0.85,
                  flexShrink: 0,
                }}
                title="Dismiss alerts"
                aria-label="Dismiss RapidRMS alerts"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex flex-1 min-h-0">
            <div className={`swipe-indicator ${swipeActive ? 'swipe-active' : ''}`} />
            <Sidebar />
            <div style={{ display: view === 'chat' ? 'contents' : 'none' }}>
              <Suspense fallback={<LazyFallback />}>
                <ChatView />
              </Suspense>
            </div>
            {view !== 'chat' && (
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <ViewNavHeader view={view} onSwitch={actions.setView} />
                <Suspense fallback={<LazyFallback />}>
                  {view === 'activity' && (
                    <ViewErrorBoundary viewName="Activity">
                      <ActivityView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'files' && (
                    <ViewErrorBoundary viewName="Files">
                      <FilesView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'cron' && (
                    <ViewErrorBoundary viewName="Cron">
                      <CronView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'feed' && (
                    <ViewErrorBoundary viewName="Feed">
                      <FeedView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'agent-feed' && (
                    <ViewErrorBoundary viewName="Agent Feed">
                      <AgentFeedView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'agent-social' && (
                    <ViewErrorBoundary viewName="Agent Social">
                      <AgentSocialView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'preview' && (
                    <ViewErrorBoundary viewName="Preview">
                      <PreviewView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'spend' && (
                    <ViewErrorBoundary viewName="Spend">
                      <SpendView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'briefing' && (
                    <ViewErrorBoundary viewName="Briefing">
                      <BriefingView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'reminders' && (
                    <ViewErrorBoundary viewName="Reminders">
                      <RemindersView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'cost-dashboard' && (
                    <ViewErrorBoundary viewName="Cost Dashboard">
                      <CostDashboardView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'marketplace' && (
                    <ViewErrorBoundary viewName="Marketplace">
                      <MarketplaceView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'admin' && (
                    <ViewErrorBoundary viewName="Admin">
                      <AdminView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'feed-analytics' && (
                    <ViewErrorBoundary viewName="Feed Analytics">
                      <FeedAnalyticsView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'task-timeline' && (
                    <ViewErrorBoundary viewName="Task Timeline">
                      <TaskTimelineView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'finetune' && (
                    <ViewErrorBoundary viewName="Fine-Tuning">
                      <FinetuneView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'reports' && (
                    <ViewErrorBoundary viewName="Reports">
                      <ReportsView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'employee-activity' && (
                    <ViewErrorBoundary viewName="Employee Activity">
                      <EmployeeActivityView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'tasks' && (
                    <ViewErrorBoundary viewName="Tasks">
                      <TasksView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'projects' && (
                    <ViewErrorBoundary viewName="Projects">
                      <ProjectsView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'email' && (
                    <ViewErrorBoundary viewName="Email">
                      <EmailView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'billing' && (
                    <ViewErrorBoundary viewName="Billing">
                      <BillingView />
                    </ViewErrorBoundary>
                  )}
                  {__SHRE_INTERNAL__ && view === 'investor' && (
                    <ViewErrorBoundary viewName="Investor Dashboard">
                      <InvestorView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'agent-trace' && (
                    <ViewErrorBoundary viewName="Agent Trace">
                      <AgentTraceView />
                    </ViewErrorBoundary>
                  )}
                  {view === 'router-gateway' && (
                    <ViewErrorBoundary viewName="Router Gateway">
                      <RouterGatewayEmbed />
                    </ViewErrorBoundary>
                  )}
                  {view === 'shre-dashboard' && (
                    <ViewErrorBoundary viewName="Shre Dashboard">
                      <div
                        className="flex-1 w-full h-full flex flex-col"
                        style={{ background: 'var(--c-bg-1)' }}
                      >
                        <iframe
                          src="/shre-dashboard/"
                          className="flex-1 w-full border-0"
                          title="Shre AI Dashboard"
                          style={{ background: '#1a1a2e', minHeight: 0 }}
                        />
                      </div>
                    </ViewErrorBoundary>
                  )}
                  {view === 'cortexdb' && (
                    <ViewErrorBoundary viewName="CortexDB">
                      <div
                        className="flex-1 w-full h-full flex flex-col"
                        style={{ background: 'var(--c-bg-1)' }}
                      >
                        <iframe
                          src="/cortexdb-ui/"
                          className="flex-1 w-full border-0"
                          title="CortexDB Dashboard"
                          style={{ background: '#1a1a2e', minHeight: 0 }}
                        />
                      </div>
                    </ViewErrorBoundary>
                  )}
                  {view === 'storepulse' && (
                    <ViewErrorBoundary viewName="StorePulse">
                      <div
                        className="flex-1 w-full h-full flex flex-col"
                        style={{ background: 'var(--c-bg-1)' }}
                      >
                        <iframe
                          src="/storepulse/"
                          className="flex-1 w-full border-0"
                          title="StorePulse"
                          style={{ background: '#1a1a2e', minHeight: 0 }}
                        />
                      </div>
                    </ViewErrorBoundary>
                  )}
                  {view === 'app-marketplace' && (
                    <ViewErrorBoundary viewName="Marketplace">
                      <div
                        className="flex-1 w-full h-full flex flex-col"
                        style={{ background: 'var(--c-bg-1)' }}
                      >
                        <iframe
                          src="/app-marketplace/"
                          className="flex-1 w-full border-0"
                          title="Marketplace"
                          style={{ background: '#1a1a2e', minHeight: 0 }}
                        />
                      </div>
                    </ViewErrorBoundary>
                  )}
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </AppContext.Provider>
      <CINotificationToast />
    </ErrorBoundary>
  );
}
