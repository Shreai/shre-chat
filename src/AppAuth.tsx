import { useState, useEffect, useCallback } from 'react';
import { LoginView } from './LoginView';
import { isDevSafeMode } from './env';

// ── Auth state ──
const AUTH_TOKEN_KEY = 'shre-auth-token';
const AUTH_USER_KEY = 'shre-auth-user';
const AUTH_WORKSPACE_KEY = 'shre-auth-workspace';
const AUTH_WORKSPACES_KEY = 'shre-auth-workspaces';
const DEV_SAFE_MODE = isDevSafeMode();

export interface AuthWorkspace {
  id: string;
  name: string;
  role: string;
  isDefault?: boolean;
}

export interface AuthUser {
  username: string;
  name: string;
  role: string;
  id?: string;
  email?: string;
  isSuperAdmin?: boolean;
}

export interface AuthState {
  token: string;
  user: AuthUser;
  workspace?: AuthWorkspace;
  workspaces?: AuthWorkspace[];
}

export function getStoredAuth(): AuthState | null {
  if (DEV_SAFE_MODE) return null;
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    const rawUser = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
    const user = rawUser ? normalizeAuthUser(rawUser) : null;
    if (token && user) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      const workspace = JSON.parse(localStorage.getItem(AUTH_WORKSPACE_KEY) || 'null');
      const workspaces = JSON.parse(localStorage.getItem(AUTH_WORKSPACES_KEY) || 'null');
      return { token, user, workspace, workspaces };
    }
  } catch (err) {
    console.debug('loadPersistedAuth JSON parse', err);
  }
  return null;
}

// Inject auth token + CSRF token into all fetch calls to /api/* (same-origin only)
const _nativeFetch = window.fetch.bind(window);

// ── CSRF token cache — fetched once per session, injected on state-changing requests ──
let _csrfToken: string | null = null;
async function ensureCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  try {
    const res = await _nativeFetch('/api/csrf-token', {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || ''}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      _csrfToken = data.csrfToken || '';
    }
  } catch {
    /* CSRF fetch failed — proceed without token */
  }
  return _csrfToken || '';
}

/** Reset cached CSRF token (call on login/logout/workspace switch) */
export function resetCsrfToken() {
  _csrfToken = null;
}

// ── Refresh-token support ──
// When the backend returns 401 on an /api/* or /v1/* call, we transparently
// try to exchange the current token for a fresh one via /api/auth/refresh
// (shre-auth enforces a 7-day max refresh window from original iat).
// If refresh fails, we invoke the registered auth-expired handler so the
// app can drop to LoginView instead of showing a stale zombie UI.

let _onAuthExpired: (() => void) | null = null;
/** Registered by useAuth so the fetch interceptor can trigger logout. */
export function setAuthExpiredHandler(fn: (() => void) | null) {
  _onAuthExpired = fn;
}

let _refreshInFlight: Promise<string | null> | null = null;
function currentToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Attempt to refresh the session. Concurrent calls share one in-flight request. */
export function attemptRefresh(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const oldToken = currentToken();
    if (!oldToken) return null;
    try {
      const res = await _nativeFetch('/api/auth/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const newToken = data?.token;
      if (!newToken || typeof newToken !== 'string') return null;
      sessionStorage.setItem(AUTH_TOKEN_KEY, newToken);
      localStorage.setItem(AUTH_TOKEN_KEY, newToken);
      return newToken;
    } catch {
      return null;
    } finally {
      // Clear next tick so a burst of concurrent 401s dedupe, but later
      // refreshes (hours apart) start fresh.
      setTimeout(() => {
        _refreshInFlight = null;
      }, 0);
    }
  })();
  return _refreshInFlight;
}

/** Minimal JWT payload parser — used for proactive expiry checks. */
function parseJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body == null) return true;
  if (typeof body === 'string') return true;
  if (body instanceof URLSearchParams) return true;
  if (body instanceof FormData) return true;
  if (body instanceof Blob) return true;
  if (body instanceof ArrayBuffer) return true;
  // ReadableStream / TypedArray views can't be replayed reliably
  return false;
}

/** Install the auth-aware fetch interceptor. Idempotent — safe to call on login/logout. */
export function installAuthFetch() {
  if (DEV_SAFE_MODE) return;
  // Already installed? No need to re-wrap.
  if ((window.fetch as { __shreAuthWrapped?: boolean }).__shreAuthWrapped) return;

  const wrapped = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const isApi = url.startsWith('/api/') || url.startsWith('/v1/');
    if (!isApi) return _nativeFetch(input, init);

    // Never retry the refresh endpoint itself — would loop.
    const isRefreshCall = url.startsWith('/api/auth/refresh');

    const applyHeaders = (token: string | null): RequestInit => {
      const headers = new Headers(init?.headers);
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const method = (init?.method || 'GET').toUpperCase();
      if (
        ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) &&
        _csrfToken &&
        !headers.has('X-CSRF-Token')
      ) {
        headers.set('X-CSRF-Token', _csrfToken);
      }
      return { ...init, headers };
    };

    const firstRes = await _nativeFetch(input, applyHeaders(currentToken()));
    if (firstRes.status !== 401 || isRefreshCall) return firstRes;
    if (!isReplayableBody(init?.body)) return firstRes;

    const newToken = await attemptRefresh();
    if (!newToken) {
      // Refresh failed → hard expire. Caller still gets the 401 so its own
      // error path can run, but the app-level handler flips to LoginView.
      _onAuthExpired?.();
      return firstRes;
    }
    // Retry the original request with the new token.
    return _nativeFetch(input, applyHeaders(newToken));
  };
  (wrapped as { __shreAuthWrapped?: boolean }).__shreAuthWrapped = true;
  window.fetch = wrapped;
}
installAuthFetch();

// Pre-fetch CSRF token on module load (fire-and-forget)
ensureCsrfToken().catch(() => {});

interface PendingWorkspaceSelection {
  workspaces: AuthWorkspace[];
  tempToken: string;
  user: any;
}

function normalizeAuthUser(user: any): AuthUser {
  const username = String(user?.username || user?.email || user?.id || '').trim();
  return {
    ...user,
    username,
    email: user?.email,
    id: user?.id,
    name: user?.name || username,
    role: user?.role || 'user',
  };
}

/**
 * useAuth — manages auth state, login, workspace selection, logout.
 */
export function useAuth(devBypass: boolean) {
  const devUser = {
    token: 'dev-token',
    user: { username: 'dev', name: 'Developer', role: 'admin' },
  };
  const [authState, setAuthState] = useState<AuthState | null>(() =>
    devBypass ? devUser : getStoredAuth(),
  );
  const [authChecking, setAuthChecking] = useState(!devBypass);
  const [pendingWorkspaceSelection, setPendingWorkspaceSelection] =
    useState<PendingWorkspaceSelection | null>(null);

  useEffect(() => {
    if (devBypass) return;

    // Safety timeout: stop checking if it takes more than 10s (e.g. backend hang)
    const timeout = setTimeout(() => {
      if (authChecking) {
        console.warn('Auth check timed out');
        setAuthChecking(false);
      }
    }, 10000);

    const stored = getStoredAuth();
    if (stored) {
      fetch('/api/auth/check', {
        headers: { Authorization: `Bearer ${stored.token}` },
      })
        .then(async (r) => {
          if (!r.ok) {
            sessionStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(AUTH_WORKSPACE_KEY);
            localStorage.removeItem(AUTH_WORKSPACES_KEY);
            setAuthState(null);
            tryGateSSO();
          } else {
            try {
              const data = await r.json();
              if (data.workspace) {
                localStorage.setItem(AUTH_WORKSPACE_KEY, JSON.stringify(data.workspace));
              }
            } catch (err) {
              console.debug('auth check workspace parse', err);
            }
            clearTimeout(timeout);
            setAuthChecking(false);
          }
        })
        .catch(() => {
          clearTimeout(timeout);
          setAuthChecking(false);
        });
    } else {
      tryGateSSO();
    }

    function tryGateSSO() {
      fetch('/api/auth/gate-sso')
        .then(async (r) => {
          if (!r.ok) {
            clearTimeout(timeout);
            setAuthChecking(false);
            return;
          }
          const data = await r.json();
          if (data.sso && data.token && data.user) {
            sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            localStorage.setItem(AUTH_TOKEN_KEY, data.token);
            const normalizedUser = normalizeAuthUser(data.user);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
            setAuthState({ token: data.token, user: normalizedUser });
            installAuthFetch();
          }
          clearTimeout(timeout);
          setAuthChecking(false);
        })
        .catch(() => {
          clearTimeout(timeout);
          setAuthChecking(false);
        });
    }
  }, []);

  useEffect(() => {
    if (!devBypass) return;
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_WORKSPACE_KEY);
    localStorage.removeItem(AUTH_WORKSPACES_KEY);
    resetCsrfToken();
  }, [devBypass]);

  const handleLogin = useCallback((token: string, user: AuthUser, loginData?: any) => {
    const normalizedUser = normalizeAuthUser(user);
    if (loginData?.requiresWorkspaceSelection) {
      setPendingWorkspaceSelection({
        workspaces: loginData.workspaces,
        tempToken: loginData.tempToken,
        user: normalizeAuthUser(loginData.user || user),
      });
      return;
    }

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
    if (loginData?.workspace) {
      localStorage.setItem(AUTH_WORKSPACE_KEY, JSON.stringify(loginData.workspace));
    }
    if (loginData?.workspaces) {
      localStorage.setItem(AUTH_WORKSPACES_KEY, JSON.stringify(loginData.workspaces));
    }
    resetCsrfToken();
    installAuthFetch();
    ensureCsrfToken().catch(() => {});
    setAuthState({
      token,
      user: normalizedUser,
      workspace: loginData?.workspace,
      workspaces: loginData?.workspaces,
    });
    const params = new URLSearchParams(window.location.search);
    const redirectTarget = params.get('redirect') || params.get('next');
    if (redirectTarget) {
      try {
        const url = new URL(redirectTarget, window.location.origin);
        const isAllowedHost = url.origin === window.location.origin || url.hostname.endsWith('.nirtek.net');
        if (isAllowedHost) {
          window.location.href = url.toString();
          return;
        }
      } catch (err) {
        console.debug('redirect URL parse failed', err);
      }
    }
  }, []);

  const handleWorkspaceSelected = useCallback(
    async (workspaceId: string) => {
      if (!pendingWorkspaceSelection) return;
      try {
        const res = await fetch('/api/auth/select-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: pendingWorkspaceSelection.tempToken, workspaceId }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) return;
        setPendingWorkspaceSelection(null);
        handleLogin(data.token, data.user, data);
      } catch (err) {
        console.warn('workspace selection failed', err);
      }
    },
    [pendingWorkspaceSelection, handleLogin],
  );

  const handleWorkspaceSwitch = useCallback(
    async (workspaceId: string) => {
      try {
        const res = await fetch('/api/auth/switch-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) return;
        sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        if (data.workspace)
          localStorage.setItem(AUTH_WORKSPACE_KEY, JSON.stringify(data.workspace));
        installAuthFetch();
        setAuthState({
          token: data.token,
          user: data.user,
          workspace: data.workspace,
          workspaces: authState?.workspaces,
        });
        sessionStorage.removeItem('shre-identity-verified');
        window.location.reload();
      } catch (err) {
        console.warn('workspace switch failed', err);
      }
    },
    [authState],
  );

  const handleLogout = useCallback(() => {
    if (devBypass) return;
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
      void 0;
    });
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_WORKSPACE_KEY);
    localStorage.removeItem(AUTH_WORKSPACES_KEY);
    resetCsrfToken();
    setAuthState(null);
    setPendingWorkspaceSelection(null);
  }, [devBypass]);

  // ── Wire up fetch interceptor's expiry callback to handleLogout ──
  // When the refresh flow gives up (7-day max window exceeded, revoked
  // session, network failure), flip the app to LoginView.
  useEffect(() => {
    setAuthExpiredHandler(handleLogout);
    return () => setAuthExpiredHandler(null);
  }, [handleLogout]);

  // ── Proactive refresh on focus + near-expiry ──
  // shre-auth issues 8h JWTs; refresh window is 7 days from original iat.
  // If exp is within 5 minutes OR already past, try refresh silently.
  useEffect(() => {
    if (devBypass || !authState?.token) return;

    const tryProactiveRefresh = async () => {
      const tok = currentToken();
      if (!tok) return;
      const exp = parseJwtExp(tok);
      if (exp == null) return;
      const secondsLeft = exp - Math.floor(Date.now() / 1000);
      const PROACTIVE_WINDOW = 5 * 60;
      if (secondsLeft <= PROACTIVE_WINDOW) {
        const newTok = await attemptRefresh();
        if (newTok) {
          setAuthState((prev) => (prev ? { ...prev, token: newTok } : prev));
        } else if (secondsLeft <= 0) {
          handleLogout();
        }
      }
    };

    tryProactiveRefresh();
    const onFocus = () => {
      tryProactiveRefresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [devBypass, authState?.token, handleLogout]);

  return {
    authState,
    authChecking,
    pendingWorkspaceSelection,
    handleLogin,
    handleWorkspaceSelected,
    handleWorkspaceSwitch,
    handleLogout,
  };
}

/**
 * WorkspaceSelectionScreen — rendered when user must choose a workspace after login.
 */
export function WorkspaceSelectionScreen({
  pending,
  onSelect,
}: {
  pending: PendingWorkspaceSelection;
  onSelect: (workspaceId: string) => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--c-bg-1, #000)',
      }}
    >
      <div
        style={{
          background: 'var(--c-bg-2, #111)',
          border: '1px solid var(--c-border, #333)',
          borderRadius: 12,
          padding: 32,
          maxWidth: 400,
          width: '90%',
        }}
      >
        <h2
          style={{ color: 'var(--c-text-1, #fff)', fontSize: 18, fontWeight: 600, marginBottom: 8 }}
        >
          Select Workspace
        </h2>
        <p style={{ color: 'var(--c-text-3, #888)', fontSize: 13, marginBottom: 20 }}>
          Welcome, {pending.user?.name}. Choose a workspace to continue.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onSelect(ws.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid var(--c-border, #333)',
                background: 'var(--c-bg-3, #1a1a1a)',
                color: 'var(--c-text-1, #fff)',
                cursor: 'pointer',
                fontSize: 14,
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--c-bg-4, #222)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'var(--c-bg-3, #1a1a1a)')}
            >
              <span>{ws.name}</span>
              <span
                style={{ fontSize: 11, color: 'var(--c-text-3, #888)', textTransform: 'uppercase' }}
              >
                {ws.role}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
