export interface WorkspaceContext {
  id: string;
  name: string;
  role: string;
  isDefault?: boolean;
}

export const AUTH_TOKEN_KEY = 'shre-auth-token';
export const AUTH_USER_KEY = 'shre-auth-user';
export const AUTH_WORKSPACE_KEY = 'shre-auth-workspace';
export const AUTH_WORKSPACES_KEY = 'shre-auth-workspaces';
export const WORKSPACE_ID_KEY = 'shre-workspace-id';
export const RAPIDRMS_WORKSPACE_KEY = 'rapidrms-workspace';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage && !!window.sessionStorage;
}

function parseWorkspace(value: string | null): WorkspaceContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceContext>;
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
    return {
      id: parsed.id,
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : parsed.id,
      role: typeof parsed.role === 'string' && parsed.role ? parsed.role : 'member',
      isDefault: parsed.isDefault,
    };
  } catch {
    return null;
  }
}

export function readStoredWorkspace(): WorkspaceContext | null {
  if (!canUseStorage()) return null;
  return parseWorkspace(localStorage.getItem(AUTH_WORKSPACE_KEY));
}

export function getStoredWorkspaceId(): string | null {
  if (!canUseStorage()) return null;
  const candidates = [
    sessionStorage.getItem(WORKSPACE_ID_KEY),
    localStorage.getItem(WORKSPACE_ID_KEY),
    readStoredWorkspace()?.id,
    localStorage.getItem(RAPIDRMS_WORKSPACE_KEY),
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

export function persistWorkspaceContext(
  workspace: WorkspaceContext | null | undefined,
  workspaces?: WorkspaceContext[] | null,
): void {
  if (!canUseStorage()) return;
  if (workspace) {
    localStorage.setItem(AUTH_WORKSPACE_KEY, JSON.stringify(workspace));
    sessionStorage.setItem(WORKSPACE_ID_KEY, workspace.id);
    localStorage.setItem(WORKSPACE_ID_KEY, workspace.id);
    localStorage.setItem(RAPIDRMS_WORKSPACE_KEY, workspace.id);
  } else {
    localStorage.removeItem(AUTH_WORKSPACE_KEY);
    localStorage.removeItem(WORKSPACE_ID_KEY);
    localStorage.removeItem(RAPIDRMS_WORKSPACE_KEY);
    sessionStorage.removeItem(WORKSPACE_ID_KEY);
  }
  if (workspaces) {
    localStorage.setItem(AUTH_WORKSPACES_KEY, JSON.stringify(workspaces));
  }
}

export function clearWorkspaceContext(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(AUTH_WORKSPACE_KEY);
  localStorage.removeItem(AUTH_WORKSPACES_KEY);
  localStorage.removeItem(WORKSPACE_ID_KEY);
  localStorage.removeItem(RAPIDRMS_WORKSPACE_KEY);
  sessionStorage.removeItem(WORKSPACE_ID_KEY);
}
