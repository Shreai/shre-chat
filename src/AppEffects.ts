/**
 * AppEffects — side-effect hooks extracted from MainApp.
 * Keeps App.tsx under 800 LOC.
 */
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  Session,
  View,
  Theme,
  ThemeCustom,
  AppActions,
  FeedEntry,
  UploadedFile,
} from './store';
import {
  loadSessions,
  syncWithServer,
  saveActiveSession,
  loadActiveSession,
  flushPendingSave,
  saveSessionImmediate,
  fetchAgentModels,
  fetchAgentRegistry,
  fetchAgentCapabilities,
  initStorage,
  debouncedSaveSessions,
  markSessionDirty,
} from './store';
import { compactSession, listSessions } from './router-client';
import { isDevSafeMode } from './env';
import { scopedStorageKey } from './workspace-context';

const THEME_KEY = 'shre-theme';

declare global {
  interface Window {
    __shreSwitchView?: (view: View) => void;
  }
}

// ── Theme application ──
export function useThemeEffect(theme: Theme) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem(scopedStorageKey(THEME_KEY), theme);
  }, [theme]);
}

// ── Custom theme overrides via CSS custom properties ──
export function useThemeCustomEffect(themeCustom: ThemeCustom) {
  useEffect(() => {
    const el = document.documentElement.style;
    document.documentElement.dataset.productPack = themeCustom.themePack || 'custom';
    const packAccentMap: Record<NonNullable<ThemeCustom['themePack']>, string> = {
      'shre-os': '#2563eb',
      aros: '#0f766e',
      workspace: '#7c3aed',
      custom: '#2563eb',
    };
    const packAccent = themeCustom.themePack ? packAccentMap[themeCustom.themePack] : undefined;
    const accent = themeCustom.accentColor || packAccent;
    if (accent) {
      el.setProperty('--c-accent', accent);
      el.setProperty('--c-accent-hover', accent + 'cc');
      el.setProperty('--c-accent-soft', accent + '40');
      el.setProperty('--c-scrollbar', accent + '40');
    } else {
      el.removeProperty('--c-accent');
      el.removeProperty('--c-accent-hover');
      el.removeProperty('--c-accent-soft');
      el.removeProperty('--c-scrollbar');
    }
    const fontScaleMap = { sm: '0.875', md: '1', lg: '1.125' };
    const scale = fontScaleMap[themeCustom.fontSize || 'md'];
    if (themeCustom.fontSize && themeCustom.fontSize !== 'md') {
      el.setProperty('--font-scale', scale);
      document.body.style.fontSize = `calc(${scale} * 1rem)`;
    } else {
      el.removeProperty('--font-scale');
      document.body.style.removeProperty('font-size');
    }
    const radiusPresets: Record<string, Record<string, string>> = {
      sharp: {
        '--radius-sm': '2px',
        '--radius-base': '4px',
        '--radius-lg': '6px',
        '--radius-xl': '8px',
        '--radius-full': '10px',
      },
      normal: {
        '--radius-sm': '6px',
        '--radius-base': '10px',
        '--radius-lg': '14px',
        '--radius-xl': '20px',
        '--radius-full': '9999px',
      },
      round: {
        '--radius-sm': '10px',
        '--radius-base': '16px',
        '--radius-lg': '22px',
        '--radius-xl': '28px',
        '--radius-full': '9999px',
      },
    };
    const preset = radiusPresets[themeCustom.borderRadius || 'normal'];
    if (themeCustom.borderRadius && themeCustom.borderRadius !== 'normal') {
      Object.entries(preset).forEach(([k, v]) => el.setProperty(k, v));
    } else {
      Object.keys(preset).forEach((k) => el.removeProperty(k));
    }
  }, [themeCustom]);
}

// ── Init effects (agent models, IndexedDB, server sync) ──
export function useInitEffects(
  sessions: Session[],
  setSessions: Dispatch<SetStateAction<Session[]>>,
  setActiveSessionId: Dispatch<SetStateAction<string | null>>,
  setSyncing: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (isDevSafeMode()) {
      initStorage();
      setSyncing(false);
      return;
    }
    fetchAgentModels();
    fetchAgentRegistry().then(() => fetchAgentCapabilities());
  }, []);
  useEffect(() => {
    initStorage();
  }, []);

  useEffect(() => {
    if (isDevSafeMode()) {
      setSyncing(false);
      return;
    }
    syncWithServer(loadSessions())
      .then((merged) => {
        if (merged.length > 0) {
          setSessions(merged);
          const active = loadActiveSession();
          if (!active && merged.length > 0) {
            setActiveSessionId(merged[0].id);
            saveActiveSession(merged[0].id);
          }
        }
      })
      .catch(() => {
        void 0;
      })
      .finally(() => setSyncing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Desktop notification + Web Push ──
export function usePushNotifications() {
  useEffect(() => {
    if (isDevSafeMode()) return;
    if (typeof Notification === 'undefined') return;
    const setupPush = async () => {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (
        Notification.permission === 'granted' &&
        'PushManager' in window &&
        'serviceWorker' in navigator
      ) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription: existing.toJSON() }),
            }).catch(() => {
              void 0;
            });
            return;
          }
          const vapidRes = await fetch('/api/push/vapid-key');
          if (!vapidRes.ok) return;
          const { publicKey } = await vapidRes.json();
          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
          const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const raw = atob(base64);
          const key = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
          const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          }).catch(() => {
            void 0;
          });
        } catch (err) {
          console.warn('[push] Auto-subscribe failed:', err);
        }
      }
    };
    setupPush();
  }, []);
}

// ── Stream persistence on unload/hide ──
export function useStreamPersistence(
  activeSessionId: string | null,
  streamingRef: MutableRefObject<boolean>,
  streamTextRef: MutableRefObject<string>,
) {
  useEffect(() => {
    const persistStreamIfActive = () => {
      if (streamingRef.current && streamTextRef.current.trim() && activeSessionId) {
        const sessions = loadSessions();
        const idx = sessions.findIndex((s) => s.id === activeSessionId);
        if (idx >= 0) {
          const session = sessions[idx];
          const lastMsg = session.messages[session.messages.length - 1];
          if (lastMsg?.role !== 'assistant' || !lastMsg.meta?.partial) {
            session.messages.push({
              role: 'assistant',
              content: streamTextRef.current,
              timestamp: Date.now(),
              meta: { partial: 'true' },
            });
          } else {
            lastMsg.content = streamTextRef.current;
            lastMsg.timestamp = Date.now();
          }
          session.updatedAt = Date.now();
          sessions[idx] = session;
          try {
            localStorage.setItem(scopedStorageKey('shre-sessions'), JSON.stringify(sessions));
          } catch (err) {
            console.debug('stream persist quota', err);
          }
          markSessionDirty(activeSessionId);
        }
      }
    };

    const handleUnload = () => {
      persistStreamIfActive();
      flushPendingSave();
    };
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') {
        persistStreamIfActive();
        flushPendingSave();
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisChange);

    const streamPersistTimer = setInterval(() => {
      persistStreamIfActive();
    }, 2500);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisChange);
      clearInterval(streamPersistTimer);
    };
  }, [activeSessionId, streamingRef, streamTextRef]);
}

// ── Periodic background sync ──
export function usePeriodicSync(
  activeSessionId: string | null,
  sessionsRef: MutableRefObject<Session[]>,
) {
  useEffect(() => {
    if (isDevSafeMode()) return;
    const interval = setInterval(() => {
      const sid = activeSessionId;
      if (!sid) return;
      const s = sessionsRef.current.find((s) => s.id === sid);
      if (s) saveSessionImmediate(s);
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeSessionId, sessionsRef]);
}

// ── Daily session compaction ──
export function useDailyCompaction(sessions: Session[]) {
  useEffect(() => {
    const COMPACT_DATE_KEY = scopedStorageKey('shre-last-compact');
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(COMPACT_DATE_KEY) === today) return;

    const timer = setTimeout(async () => {
      try {
        const agentIds = [...new Set(sessions.map((s) => s.agentId))];
        for (const agentId of agentIds) {
          const agentSessions = await listSessions(agentId);
          for (const s of agentSessions) {
            const keyParts = s.key.split(':');
            const sessionKey = keyParts.slice(2).join(':');
            if (!sessionKey || sessionKey.startsWith('subagent:') || sessionKey.startsWith('cron:'))
              continue;
            await compactSession(agentId, sessionKey, 1);
          }
        }
        localStorage.setItem(COMPACT_DATE_KEY, today);
        console.log('[compact] Daily compaction complete');
      } catch (err) {
        console.warn('[compact] Daily compaction failed:', err);
      }
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Cross-tab synchronization ──
export function useCrossTabSync(
  crossTabRef: MutableRefObject<boolean>,
  setSessions: Dispatch<SetStateAction<Session[]>>,
  setActivity: Dispatch<SetStateAction<any[]>>,
  setFeed: Dispatch<SetStateAction<FeedEntry[]>>,
  setFiles: Dispatch<SetStateAction<UploadedFile[]>>,
  setOpenTabs: Dispatch<SetStateAction<string[]>>,
) {
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key) return;
      crossTabRef.current = true;
      const currentSessionsKey = scopedStorageKey('shre-sessions');
      const currentActivityKey = scopedStorageKey('shre-activity');
      const currentFeedKey = scopedStorageKey('shre-feed');
      const currentFilesKey = scopedStorageKey('shre-files');
      const currentTabsKey = scopedStorageKey('shre-open-tabs');
      try {
        switch (e.key) {
          case currentSessionsKey:
            setSessions(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case currentActivityKey:
            setActivity(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case currentFeedKey:
            setFeed(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case currentFilesKey:
            setFiles(e.newValue ? JSON.parse(e.newValue) : []);
            break;
          case currentTabsKey:
            setOpenTabs(e.newValue ? JSON.parse(e.newValue) : []);
            break;
        }
      } catch (err) {
        console.debug('cross-tab storage event JSON parse', err);
      }
      crossTabRef.current = false;
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [crossTabRef, setSessions, setActivity, setFeed, setFiles, setOpenTabs]);
}

// ── Custom view event handler ──
export function useViewSwitchEvent(setView: Dispatch<SetStateAction<View>>) {
  useLayoutEffect(() => {
    const bridge = (v: View) => {
      if (v) setView(v);
    };
    const handler = (e: Event) => {
      const v = (e as CustomEvent<string>).detail as View;
      bridge(v);
    };
    window.__shreSwitchView = bridge;
    window.addEventListener('shre:switch-view', handler);
    return () => {
      window.removeEventListener('shre:switch-view', handler);
      if (window.__shreSwitchView === bridge) {
        delete window.__shreSwitchView;
      }
    };
  }, [setView]);
}

// ── VisualViewport resize handler for virtual keyboard ──
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback for browsers without VisualViewport API
      document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
      return;
    }
    let prevHeight = vv.height;
    const handler = () => {
      document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
      // Keyboard opened (viewport shrank significantly) — scroll active input into view
      const shrunk = prevHeight - vv.height > 100;
      prevHeight = vv.height;
      if (shrunk) {
        requestAnimationFrame(() => {
          const active = document.activeElement as HTMLElement | null;
          if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
            active.scrollIntoView({ block: 'end', behavior: 'smooth' });
          }
        });
      }
    };
    // Set immediately — critical for initial mobile layout before any resize
    handler();
    vv.addEventListener('resize', handler);
    // Also listen for scroll events (iOS Safari shifts viewport on address bar hide/show)
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);
}

// ── Adaptive fold-phone layout ──
export function useFoldDetection(actions: AppActions) {
  useEffect(() => {
    let lastWidth = window.innerWidth;
    const handler = () => {
      const w = window.innerWidth;
      const dw = Math.abs(w - lastWidth);
      if (dw > 200) {
        if (w > 600 && lastWidth <= 600) {
          actions.setSidebarOpen(true);
        } else if (w <= 600 && lastWidth > 600) {
          actions.setSidebarOpen(false);
        }
      }
      lastWidth = w;
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── updateSessions helper (curried) ──
export function useUpdateSessions(
  setSessions: Dispatch<SetStateAction<Session[]>>,
  crossTabRef: MutableRefObject<boolean>,
) {
  return useCallback(
    (fn: (prev: Session[]) => Session[]) => {
      setSessions((prev) => {
        const next = fn(prev);
        if (!crossTabRef.current) {
          debouncedSaveSessions(next);
          const prevMap = new Map(prev.map((s) => [s.id, s.updatedAt]));
          for (const s of next) {
            if (s.updatedAt !== prevMap.get(s.id)) markSessionDirty(s.id);
          }
        }
        return next;
      });
    },
    [setSessions, crossTabRef],
  );
}

// ── Swipe gesture handling for mobile sidebar ──
export function useSwipeGesture(sidebarOpen: boolean, actions: AppActions) {
  const touchStartRef = { current: null as { x: number; y: number; time: number } | null };
  // Note: returned via object for use in the component

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      if (touchStartRef.current.x < 30 && dx > 20 && !sidebarOpen) {
        // swipe active visual feedback handled in component
      }
    },
    [sidebarOpen],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
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

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}
