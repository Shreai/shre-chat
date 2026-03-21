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
  fetchAgentModels,
  loadSessions,
  saveSessions,
  debouncedSaveSessions,
  flushPendingSave,
  loadActivity,
  saveActivity,
  loadFeed,
  saveFeed,
  loadFiles,
  saveFiles,
  loadTabs,
  saveTabs,
  loadActiveSession,
  saveActiveSession,
  loadQueue,
  saveQueue,
  initStorage,
  loadThemeCustom,
  saveThemeCustom,
  loadDrafts,
  saveDrafts,
  syncWithServer,
  markSessionDirty,
  syncDeleteToServer,
  saveSessionImmediate,
} from "./store";
import type { ActivityStatus, ChatMessage } from "./openclaw";
import { compactSession, listSessions } from "./openclaw";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { ChatView } from "./ChatView";
import { ErrorBoundary } from "./ErrorBoundary";
import { ViewErrorBoundary } from "./ViewErrorBoundary";
import { LoginView } from "./LoginView";
// OnboardingView removed — shre-chat auto-completes profile (superadmin tool)
import { loadUserProfile, saveUserProfile, createDefaultProfile, type UserProfile } from "./store";
import { useAnomalyStream } from "./hooks/useAnomalyStream";

// ── Auth state ──────────────────────────────────────────────────
const AUTH_TOKEN_KEY = "shre-auth-token";
const AUTH_USER_KEY = "shre-auth-user";

function getStoredAuth(): { token: string; user: { username: string; name: string; role: string } } | null {
  try {
    // Token in both sessionStorage (fast) and localStorage (survives tab close)
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
    if (token && user) {
      // Ensure token is in both stores
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      return { token, user };
    }
  } catch { /* */ }
  return null;
}

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

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center" style={{ color: "var(--c-text-3)" }}>
    Loading…
  </div>
);

const AGENT_KEY = "shre-active-agent";
const THEME_KEY = "shre-theme";
const COMPACT_KEY = "shre-compact";
const WRITE_ENABLED_KEY = "shre-write-enabled";

export function App() {
  // ── Dev mode: set to true to skip auth for UI-only work ──
  const DEV_BYPASS_AUTH = false;

  // ── Auth gate ──────────────────────────────────────────────────
  const devUser = { token: "dev-token", user: { username: "dev", name: "Developer", role: "admin" } };
  const [authState, setAuthState] = useState<{ token: string; user: { username: string; name: string; role: string } } | null>(
    () => DEV_BYPASS_AUTH ? devUser : getStoredAuth()
  );
  const [authChecking, setAuthChecking] = useState(!DEV_BYPASS_AUTH);

  // Verify stored token on mount
  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    const stored = getStoredAuth();
    if (!stored) { setAuthChecking(false); return; }
    fetch("/api/auth/check", {
      headers: { Authorization: `Bearer ${stored.token}` },
    }).then((r) => {
      if (!r.ok) {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        setAuthState(null);
      }
    }).catch(() => {
      // Can't reach server — keep token, will revalidate later
    }).finally(() => setAuthChecking(false));
  }, []);

  const handleLogin = useCallback((token: string, user: { username: string; name: string; role: string }) => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    installAuthFetch(); // Re-install fetch interceptor with the new token
    setAuthState({ token, user });
    // Check for cross-service redirect (e.g., from pos.nirtek.net or openclaw.nirtek.net)
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (redirect) {
      try {
        const url = new URL(redirect);
        // Only allow redirects to *.nirtek.net
        if (url.hostname.endsWith(".nirtek.net")) {
          window.location.href = redirect;
          return;
        }
      } catch { /* invalid URL — ignore */ }
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (DEV_BYPASS_AUTH) return;
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setAuthState(null);
  }, []);

  if (authChecking) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--c-bg-1, #000)", color: "var(--c-text-4)" }}>Loading...</div>;
  }

  if (!authState) {
    return <LoginView onLogin={handleLogin} />;
  }

  return <AuthenticatedApp authUser={authState.user} onLogout={handleLogout} />;
}

// Inject auth token into all fetch calls to /api/* (same-origin only)
// Safe to call multiple times — always wraps the real native fetch, not a previous wrapper.
const _nativeFetch = window.fetch.bind(window);
function installAuthFetch() {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    // Only inject auth for same-origin API calls
    if (url.startsWith("/api/") || url.startsWith("/v1/")) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return _nativeFetch(input, { ...init, headers });
    }
    return _nativeFetch(input, init);
  };
}
installAuthFetch();

function AuthenticatedApp({ authUser, onLogout }: { authUser: { username: string; name: string; role: string }; onLogout: () => void }) {
  // ── User Profile / Onboarding gate ──────────────────────────────
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => loadUserProfile());

  // Shre-chat is a superadmin tool — skip onboarding, auto-complete profile
  if (!userProfile || userProfile.onboardedAt === 0) {
    const completed = { ...(userProfile || createDefaultProfile(authUser)), onboardedAt: Date.now() };
    saveUserProfile(completed);
    setUserProfile(completed);
    return null; // re-render with completed profile
  }

  return <MainApp authUser={authUser} onLogout={onLogout} userProfile={userProfile} setUserProfile={setUserProfile} />;
}

function MainApp({ authUser, onLogout, userProfile, setUserProfile }: {
  authUser: { username: string; name: string; role: string };
  onLogout: () => void;
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
      } catch { /* skip */ }
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

  // ── RapidRMS live anomaly stream ─────────────────────────────
  // workspaceId is set by the rapidrms auth flow in localStorage as 'rapidrms-workspace'
  const [rapidrmsWorkspace] = useState<string | null>(
    () => localStorage.getItem("rapidrms-workspace")
  );
  const { anomalies: rmsAnomalies, criticalCount: rmsCriticalCount, dismiss: dismissRmsAlerts } = useAnomalyStream({
    workspaceId: rapidrmsWorkspace,
  });
  const [compact, setCompact] = useState(() => localStorage.getItem(COMPACT_KEY) === "true");
  const [writeEnabled, setWriteEnabled] = useState(() => localStorage.getItem(WRITE_ENABLED_KEY) !== "false");
  const [replyToIndex, setReplyToIndex] = useState<number | null>(null);
  const [themeCustom, setThemeCustomState] = useState<ThemeCustom>(() => loadThemeCustom());
  const queueRef = useRef<QueuedMessage[]>(loadQueue());
  // Drafts live in a ref to avoid re-rendering the entire tree on every keystroke.
  // Only localStorage persistence is debounced; reads are synchronous via getDraft.
  const draftsRef = useRef<Record<string, string>>(loadDrafts());
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup draft save timer on unmount
  useEffect(() => {
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, []);

  // Apply theme class to document
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Apply custom theme overrides via CSS custom properties
  useEffect(() => {
    const el = document.documentElement.style;
    if (themeCustom.accentColor) {
      el.setProperty("--c-accent", themeCustom.accentColor);
      // Derive lighter hover variant
      el.setProperty("--c-accent-hover", themeCustom.accentColor + "cc");
      el.setProperty("--c-accent-soft", themeCustom.accentColor + "40");
      el.setProperty("--c-scrollbar", themeCustom.accentColor + "40");
    } else {
      el.removeProperty("--c-accent");
      el.removeProperty("--c-accent-hover");
      el.removeProperty("--c-accent-soft");
      el.removeProperty("--c-scrollbar");
    }
    // Font scale
    const fontScaleMap = { sm: "0.875", md: "1", lg: "1.125" };
    const scale = fontScaleMap[themeCustom.fontSize || "md"];
    if (themeCustom.fontSize && themeCustom.fontSize !== "md") {
      el.setProperty("--font-scale", scale);
      document.body.style.fontSize = `calc(${scale} * 1rem)`;
    } else {
      el.removeProperty("--font-scale");
      document.body.style.removeProperty("font-size");
    }
    const radiusPresets: Record<string, Record<string, string>> = {
      sharp: { "--radius-sm": "2px", "--radius-base": "4px", "--radius-lg": "6px", "--radius-xl": "8px", "--radius-full": "10px" },
      normal: { "--radius-sm": "6px", "--radius-base": "10px", "--radius-lg": "14px", "--radius-xl": "20px", "--radius-full": "9999px" },
      round: { "--radius-sm": "10px", "--radius-base": "16px", "--radius-lg": "22px", "--radius-xl": "28px", "--radius-full": "9999px" },
    };
    const preset = radiusPresets[themeCustom.borderRadius || "normal"];
    if (themeCustom.borderRadius && themeCustom.borderRadius !== "normal") {
      Object.entries(preset).forEach(([k, v]) => el.setProperty(k, v));
    } else {
      Object.keys(preset).forEach(k => el.removeProperty(k));
    }
  }, [themeCustom]);

  // Fetch agent model assignments from central config
  useEffect(() => { fetchAgentModels(); }, []);

  // Initialize IndexedDB storage (migrates localStorage data on first run)
  useEffect(() => { initStorage(); }, []);

  // Sync sessions with server on mount — recovers history from server-side DB
  // In dev mode (no backend), this resolves immediately to avoid hanging
  useEffect(() => {
    syncWithServer(loadSessions()).then((merged) => {
      if (merged.length > 0) {
        setSessions(merged);
        if (!loadActiveSession() && merged.length > 0) {
          setActiveSessionId(merged[0].id);
          saveActiveSession(merged[0].id);
        }
      }
    }).catch(() => {}).finally(() => setSyncing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Request desktop notification permission + auto-subscribe to Web Push
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const setupPush = async () => {
      // Request permission if not yet decided
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      // Auto-subscribe to Web Push if permission granted and PushManager available
      if (Notification.permission === "granted" && "PushManager" in window && "serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            // Re-register with server (in case server lost it)
            fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription: existing.toJSON() }),
            }).catch(() => {});
            return;
          }
          // New subscription
          const vapidRes = await fetch("/api/push/vapid-key");
          if (!vapidRes.ok) return;
          const { publicKey } = await vapidRes.json();
          const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
          const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
          const raw = atob(base64);
          const key = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
          const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
          fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          }).catch(() => {});
        } catch (err) {
          console.warn("[push] Auto-subscribe failed:", err);
        }
      }
    };
    setupPush();
  }, []);

  // Flush pending debounced session saves on page unload
  useEffect(() => {
    const handleUnload = () => flushPendingSave();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Periodic background sync — push active session to server every 30s as safety net
  useEffect(() => {
    const interval = setInterval(() => {
      const sid = activeSessionId;
      if (!sid) return;
      const s = sessionsRef.current.find((s) => s.id === sid);
      if (s) saveSessionImmediate(s);
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeSessionId]);

  // Daily session compaction — run once per day on app launch
  useEffect(() => {
    const COMPACT_DATE_KEY = "shre-last-compact";
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(COMPACT_DATE_KEY) === today) return;

    // Run compaction in background after a short delay to not block UI
    const timer = setTimeout(async () => {
      try {
        // Get unique agent IDs from current sessions
        const agentIds = [...new Set(sessions.map((s) => s.agentId))];
        for (const agentId of agentIds) {
          const agentSessions = await listSessions(agentId);
          for (const s of agentSessions) {
            const keyParts = s.key.split(":");
            const sessionKey = keyParts.slice(2).join(":");
            if (!sessionKey || sessionKey.startsWith("subagent:") || sessionKey.startsWith("cron:")) continue;
            await compactSession(agentId, sessionKey, 1);
          }
        }
        localStorage.setItem(COMPACT_DATE_KEY, today);
        console.log("[compact] Daily compaction complete");
      } catch (err) {
        console.warn("[compact] Daily compaction failed:", err);
      }
    }, 5000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab synchronization: listen for storage events from other tabs
  const crossTabRef = useRef(false);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key) return;
      crossTabRef.current = true;
      try {
        switch (e.key) {
          case "shre-sessions":
            setSessions(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case "shre-activity":
            setActivity(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case "shre-feed":
            setFeed(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case "shre-files":
            setFiles(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case "shre-open-tabs":
            setOpenTabs(e.newValue ? JSON.parse(e.newValue) : []);
            break;
        }
      } catch { /* ignore malformed JSON */ }
      crossTabRef.current = false;
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Handle switch-view events dispatched by child components (e.g. MessageBubble "👁 Preview" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<string>).detail as View;
      if (v) setView(v);
    };
    window.addEventListener("shre:switch-view", handler);
    return () => window.removeEventListener("shre:switch-view", handler);
  }, []);

  const updateSessions = useCallback((fn: (prev: Session[]) => Session[]) => {
    setSessions((prev) => {
      const next = fn(prev);
      if (!crossTabRef.current) {
        debouncedSaveSessions(next);
        // Track which sessions changed for server sync
        const prevMap = new Map(prev.map((s) => [s.id, s.updatedAt]));
        for (const s of next) {
          if (s.updatedAt !== prevMap.get(s.id)) markSessionDirty(s.id);
        }
      }
      return next;
    });
  }, []);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const agentRef = useRef(activeAgentId);
  agentRef.current = activeAgentId;

  const actions: AppActions = {
    newSession: () => {
      const s = createSession(undefined, agentRef.current);
      updateSessions((prev) => [...prev, s]);
      setOpenTabs((prev) => { const next = [...prev, s.id]; saveTabs(next); return next; });
      return s.id;
    },

    switchSession: (id: string) => {
      setActiveSessionId(id);
      saveActiveSession(id);
      // Sync agent to match the session's agent
      const session = sessionsRef.current.find((s) => s.id === id);
      if (session?.agentId) {
        setActiveAgentId(session.agentId);
        localStorage.setItem(AGENT_KEY, session.agentId);
        // Pin this session for the agent
        const PINNED_KEY = "shre-pinned-sessions";
        let pinned: Record<string, string> = {};
        try { pinned = JSON.parse(localStorage.getItem(PINNED_KEY) || "{}"); } catch {}
        pinned[session.agentId] = id;
        localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
      }
      setOpenTabs((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        saveTabs(next);
        return next;
      });
    },

    closeTab: (id: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t !== id);
        saveTabs(next);
        if (activeSessionId === id) {
          const idx = prev.indexOf(id);
          const newActive = next[Math.min(idx, next.length - 1)] ?? null;
          setActiveSessionId(newActive);
          saveActiveSession(newActive);
        }
        return next;
      });
    },

    deleteSession: (id: string) => {
      actions.closeTab(id);
      updateSessions((prev) => prev.filter((s) => s.id !== id));
      syncDeleteToServer(id);
    },

    setView,
    switchView: setView,

    addMessage: (sessionId, msg) => {
      updateSessions((prev) => {
        const next = prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, msg], updatedAt: Date.now() }
            : s
        );
        // Crash-proof: immediately persist to localStorage + server after every message
        const updated = next.find((s) => s.id === sessionId);
        if (updated) saveSessionImmediate(updated);
        return next;
      });
    },

    updateSessionTitle: (sessionId, title) => {
      updateSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );
    },

    addActivity: (sessionId, status, summary) => {
      setActivity((prev) => {
        const session = sessionsRef.current.find((s) => s.id === sessionId);
        const evt = {
          id: uid(),
          sessionId,
          sessionTitle: session?.title || "Chat",
          agentId: session?.agentId || agentRef.current,
          status,
          summary,
          timestamp: Date.now(),
        };
        const next = [...prev, evt];
        saveActivity(next);
        return next;
      });
    },

    addFeed: (sessionId, type, message, meta) => {
      setFeed((prev) => {
        const session = sessionsRef.current.find((s) => s.id === sessionId);
        const entry: FeedEntry = {
          id: uid(),
          sessionId,
          sessionTitle: session?.title || "Chat",
          type,
          message,
          meta: { ...meta, agent: session?.agentId || agentRef.current },
          timestamp: Date.now(),
        };
        const next = [...prev, entry];
        saveFeed(next);
        return next;
      });
    },

    addFile: (file) => {
      setFiles((prev) => {
        const next = [...prev, file];
        saveFiles(next);
        return next;
      });
    },

    removeFile: (id) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        saveFiles(next);
        return next;
      });
    },

    enqueue: (msg) => { queueRef.current.push(msg); saveQueue(queueRef.current); },
    dequeue: () => { const msg = queueRef.current.shift(); saveQueue(queueRef.current); return msg; },

    setStreaming,
    setStreamText,
    setStatusLine,
    setGatewayUp,
    setSidebarOpen,

    setActiveAgent: (agentId: string) => {
      setActiveAgentId(agentId);
      localStorage.setItem(AGENT_KEY, agentId);

      // Session pinning: check for a pinned session for this agent
      const PINNED_KEY = "shre-pinned-sessions";
      let pinned: Record<string, string> = {};
      try { pinned = JSON.parse(localStorage.getItem(PINNED_KEY) || "{}"); } catch {}
      const pinnedId = pinned[agentId];
      const pinnedSession = pinnedId ? sessionsRef.current.find((s) => s.id === pinnedId) : null;

      if (pinnedSession) {
        setActiveSessionId(pinnedSession.id);
        saveActiveSession(pinnedSession.id);
        setOpenTabs((prev) => {
          if (prev.includes(pinnedSession.id)) return prev;
          const next = [...prev, pinnedSession.id];
          saveTabs(next);
          return next;
        });
      } else {
        // Fall back to most recent session for this agent, or show fresh screen
        const agentSessions = sessionsRef.current.filter((s) => (s.agentId || "main") === agentId);
        if (agentSessions.length > 0) {
          const mostRecent = agentSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          setActiveSessionId(mostRecent.id);
          saveActiveSession(mostRecent.id);
          setOpenTabs((prev) => {
            if (prev.includes(mostRecent.id)) return prev;
            const next = [...prev, mostRecent.id];
            saveTabs(next);
            return next;
          });
        } else {
          setActiveSessionId(null);
          saveActiveSession(null);
        }
      }
    },

    setSyncing,

    toggleTheme: () => {
      // Add transitioning class for smooth theme switch, remove after animation
      document.documentElement.classList.add("theme-transitioning");
      setTheme((prev) => prev === "dark" ? "light" : "dark");
      setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), 300);
    },

    replaceSessionMessages: (sessionId: string, msgs: ChatMessage[]) => {
      updateSessions((prev) => {
        const next = prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: msgs, updatedAt: Date.now() }
            : s
        );
        // Crash-proof: persist after stream completion
        const updated = next.find((s) => s.id === sessionId);
        if (updated) saveSessionImmediate(updated);
        return next;
      });
    },

    setMessageFeedback: (sessionId: string, msgIndex: number, feedback: "like" | "dislike" | null) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (msgIndex >= 0 && msgIndex < msgs.length) {
            msgs[msgIndex] = { ...msgs[msgIndex], feedback };
          }
          return { ...s, messages: msgs };
        })
      );
    },

    setAnnotation: (sessionId: string, messageIndex: number, text: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (messageIndex >= 0 && messageIndex < msgs.length) {
            msgs[messageIndex] = { ...msgs[messageIndex], annotation: text || undefined };
          }
          return { ...s, messages: msgs };
        })
      );
    },

    toggleReaction: (sessionId: string, messageIndex: number, emoji: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (messageIndex >= 0 && messageIndex < msgs.length) {
            const existing = { ...(msgs[messageIndex].reactions || {}) };
            if (existing[emoji] && existing[emoji] > 0) {
              existing[emoji] -= 1;
              if (existing[emoji] <= 0) delete existing[emoji];
            } else {
              existing[emoji] = 1;
            }
            msgs[messageIndex] = { ...msgs[messageIndex], reactions: Object.keys(existing).length > 0 ? existing : undefined };
          }
          return { ...s, messages: msgs };
        })
      );
    },

    togglePin: (sessionId: string) => {
      updateSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, pinned: !s.pinned } : s
        )
      );
    },

    addSessionTag: (sessionId: string, tag: string) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const existing = s.tags || [];
          if (existing.includes(normalized)) return s;
          return { ...s, tags: [...existing, normalized] };
        })
      );
    },

    removeSessionTag: (sessionId: string, tag: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return { ...s, tags: (s.tags || []).filter((t) => t !== tag) };
        })
      );
    },

    toggleCompact: () => {
      setCompact((prev) => {
        const next = !prev;
        localStorage.setItem(COMPACT_KEY, String(next));
        return next;
      });
    },
    toggleWriteEnabled: () => {
      setWriteEnabled((prev) => {
        const next = !prev;
        localStorage.setItem(WRITE_ENABLED_KEY, String(next));
        return next;
      });
    },

    setSystemPrompt: (sessionId: string, prompt: string) => {
      updateSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, systemPrompt: prompt || undefined } : s
        )
      );
    },

    setThemeCustom: (custom: ThemeCustom) => {
      setThemeCustomState(custom);
      saveThemeCustom(custom);
    },

    branchFrom: (sessionId: string, messageIndex: number) => {
      const source = sessionsRef.current.find((s) => s.id === sessionId);
      if (!source) return null;
      const branchedMessages = source.messages.slice(0, messageIndex + 1);
      const newId = uid();
      const branched: Session = {
        id: newId,
        title: source.title + " (branch)",
        agentId: source.agentId,
        messages: branchedMessages.map((m) => ({ ...m })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        systemPrompt: source.systemPrompt,
        parentId: source.id,
      };
      updateSessions((prev) => [...prev, branched]);
      setOpenTabs((prev) => { const next = [...prev, newId]; saveTabs(next); return next; });
      setActiveSessionId(newId);
      saveActiveSession(newId);
      return newId;
    },

    setDraft: (sessionId: string, text: string) => {
      // Mutate ref directly — no state update, no re-render
      if (text) draftsRef.current[sessionId] = text;
      else delete draftsRef.current[sessionId];
      // Debounced persist to localStorage
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = setTimeout(() => { saveDrafts(draftsRef.current); draftSaveTimer.current = null; }, 500);
    },

    getDraft: (sessionId: string) => {
      return draftsRef.current[sessionId] || "";
    },

    setReplyTo: (index: number | null) => {
      setReplyToIndex(index);
    },

    logout: onLogout,
  };

  // Memoize state object so context value only changes when actual state values change
  // (not on every render due to new object reference)
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

  // Keep actions in a ref so the context value identity is stable —
  // actions reference state via closures/refs, not via dependency array.
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

  // ── Swipe gesture handling for mobile sidebar ──────────────────
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

    // Swipe right from left edge to open sidebar
    if (touchStartRef.current.x < 30 && dx > 80 && dy < 100 && elapsed < 500) {
      actions.setSidebarOpen(true);
    }
    // Swipe left to close sidebar (when sidebar is open)
    if (sidebarOpen && dx < -80 && dy < 100 && elapsed < 500) {
      actions.setSidebarOpen(false);
    }

    touchStartRef.current = null;
  }, [sidebarOpen, actions]);

  // ── VisualViewport resize handler for virtual keyboard ────────
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      document.documentElement.style.setProperty("--vv-height", `${vv.height}px`);
    };
    handler();
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);

  // Detect standalone (PWA / Add to Home Screen) mode
  const isPWA = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );

  // Adaptive layout for fold phones — auto-show sidebar when screen is wide (unfolded)
  useEffect(() => {
    let lastWidth = window.innerWidth;
    const handler = () => {
      const w = window.innerWidth;
      const dw = Math.abs(w - lastWidth);
      // Only react to significant changes (fold/unfold typically > 200px)
      if (dw > 200) {
        if (w > 600 && lastWidth <= 600) {
          // Unfolded — show sidebar
          actions.setSidebarOpen(true);
        } else if (w <= 600 && lastWidth > 600) {
          // Folded — hide sidebar
          actions.setSidebarOpen(false);
        }
      }
      lastWidth = w;
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          {/* PWA top nav — visible only in standalone mode (no browser chrome) */}
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
          {/* RapidRMS live anomaly banner — shown when active alerts exist */}
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
                {rmsAnomalies.slice(0, 3).map((a, i) => (
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
            {/* Swipe indicator — left edge visual feedback */}
            <div className={`swipe-indicator ${swipeActive ? "swipe-active" : ""}`} />
            <Sidebar />
            <div style={{ display: view === "chat" ? "contents" : "none" }}><ChatView /></div>
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
            </Suspense>
          </div>
        </div>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
