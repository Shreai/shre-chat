import { useState, useEffect, useCallback } from 'react';
import { LoginView } from './LoginView';

// ── Auth state ──
const AUTH_TOKEN_KEY = 'shre-auth-token';
const AUTH_USER_KEY = 'shre-auth-user';
const AUTH_WORKSPACE_KEY = 'shre-auth-workspace';
const AUTH_WORKSPACES_KEY = 'shre-auth-workspaces';

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
  isSuperAdmin?: boolean;
}

export interface AuthState {
  token: string;
  user: AuthUser;
  workspace?: AuthWorkspace;
  workspaces?: AuthWorkspace[];
}

export function getStoredAuth(): AuthState | null {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
    if (token && user) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
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
export function installAuthFetch() {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;
  window.fetch = function (input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.startsWith('/api/') || url.startsWith('/v1/')) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      // Inject CSRF token on state-changing methods
      const method = (init?.method || 'GET').toUpperCase();
      if (
        ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) &&
        _csrfToken &&
        !headers.has('X-CSRF-Token')
      ) {
        headers.set('X-CSRF-Token', _csrfToken);
      }
      return _nativeFetch(input, { ...init, headers });
    }
    return _nativeFetch(input, init);
  };
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
            setAuthChecking(false);
          }
        })
        .catch(() => {
          setAuthChecking(false);
        });
    } else {
      tryGateSSO();
    }

    function tryGateSSO() {
      fetch('/api/auth/gate-sso')
        .then(async (r) => {
          if (!r.ok) {
            setAuthChecking(false);
            return;
          }
          const data = await r.json();
          if (data.sso && data.token && data.user) {
            sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            localStorage.setItem(AUTH_TOKEN_KEY, data.token);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
            setAuthState({ token: data.token, user: data.user });
            installAuthFetch();
          }
          setAuthChecking(false);
        })
        .catch(() => {
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
