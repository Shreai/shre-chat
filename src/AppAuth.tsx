import { useState, useEffect, useCallback } from 'react';
import { LoginView } from './LoginView';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_WORKSPACE_KEY,
  AUTH_WORKSPACES_KEY,
  clearWorkspaceContext,
  getStoredWorkspaceId,
  persistWorkspaceContext,
  readStoredWorkspace,
} from './workspace-context';

export interface AuthWorkspace {
  id: string;
  name: string;
  role: string;
  isDefault?: boolean;
  loginType?: string;
}

export interface AuthUser {
  username: string;
  name: string;
  role: string;
  loginType?: string;
  id?: string;
  isSuperAdmin?: boolean;
}

export interface AuthState {
  token: string;
  user: AuthUser;
  workspace?: AuthWorkspace;
  workspaces?: AuthWorkspace[];
}

function normalizeWorkspaces(value: unknown): AuthWorkspace[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => {
      if (typeof item === 'string') {
        return { id: item, name: item, role: 'member' };
      }
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        const ws = item as Partial<AuthWorkspace>;
        return {
          id: ws.id!,
          name: ws.name || ws.id!,
          role: ws.role || 'member',
          isDefault: ws.isDefault,
          loginType: ws.loginType,
        };
      }
      return null;
    })
    .filter(Boolean) as AuthWorkspace[];
  return normalized.length > 0 ? normalized : undefined;
}

export function getStoredAuth(): AuthState | null {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
    if (token && user) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      const storedWorkspaceId = getStoredWorkspaceId();
      const workspace =
        readStoredWorkspace() ??
        (storedWorkspaceId
          ? {
              id: storedWorkspaceId,
              name: storedWorkspaceId,
              role: 'member',
            }
          : JSON.parse(localStorage.getItem(AUTH_WORKSPACE_KEY) || 'null'));
      const workspaces = normalizeWorkspaces(
        JSON.parse(localStorage.getItem(AUTH_WORKSPACES_KEY) || 'null'),
      );
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

function clearShellLoginTypeQueryParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('shellLoginType')) return;
  params.delete('shellLoginType');
  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

/** Install the auth-aware fetch interceptor. Idempotent — safe to call on login/logout. */
export function installAuthFetch() {
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
            clearWorkspaceContext();
            setAuthState(null);
            tryGateSSO();
          } else {
            try {
              const data = await r.json();
              if (data.workspace) {
                persistWorkspaceContext(
                  data.workspace,
                  normalizeWorkspaces(data.workspaces) || null,
                );
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
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
            persistWorkspaceContext(data.workspace, normalizeWorkspaces(data.workspaces) || null);
            installAuthFetch();
            setAuthState({ token: data.token, user: data.user });
            fetch('/api/auth/check', {
              headers: { Authorization: `Bearer ${data.token}` },
            })
              .then(async (checkRes) => {
                if (!checkRes.ok) return null;
                return checkRes.json();
              })
              .then((checkData) => {
                if (!checkData) return;
                persistWorkspaceContext(
                  checkData.workspace,
                  normalizeWorkspaces(checkData.workspaces) || null,
                );
                if (checkData.workspace || checkData.workspaces) {
                  setAuthState((prev) =>
                    prev
                      ? {
                          ...prev,
                          workspace: checkData.workspace || prev.workspace,
                          workspaces: normalizeWorkspaces(checkData.workspaces) || prev.workspaces,
                        }
                      : prev,
                  );
                }
              })
              .catch(() => {});
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

  const handleLogin = useCallback((token: string, user: AuthUser, loginData?: any) => {
    if (loginData?.requiresWorkspaceSelection) {
      setPendingWorkspaceSelection({
        workspaces: loginData.workspaces,
        tempToken: loginData.tempToken,
        user: loginData.user || user,
      });
      return;
    }

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    persistWorkspaceContext(
      loginData?.workspace,
      normalizeWorkspaces(loginData?.workspaces) || null,
    );
    resetCsrfToken();
    installAuthFetch();
    ensureCsrfToken().catch(() => {});
    clearShellLoginTypeQueryParam();
    setAuthState({
      token,
      user,
      workspace: loginData?.workspace,
      workspaces: loginData?.workspaces,
    });
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
      try {
        const url = new URL(redirect);
        if (url.hostname.endsWith('.nirtek.net')) {
          window.location.href = redirect;
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
        persistWorkspaceContext(
          data.workspace,
          normalizeWorkspaces(data.workspaces) || authState?.workspaces || null,
        );
        installAuthFetch();
        clearShellLoginTypeQueryParam();
        setAuthState({
          token: data.token,
          user: data.user,
          workspace: data.workspace,
          workspaces: normalizeWorkspaces(data.workspaces) || authState?.workspaces,
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
    clearWorkspaceContext();
    resetCsrfToken();
    clearShellLoginTypeQueryParam();
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
