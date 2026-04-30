import { createContext, useContext } from 'react';
import type { ActivityStatus, ChatMessage } from './router-client';
import { AGENT_META as GENERATED_AGENT_META } from './generated/agents';

// ── Structured logging (browser-compatible shre-sdk/logger equivalent) ──
export function createLogger(service: string) {
  const fmt = (level: string, msg: string, meta?: Record<string, unknown>) =>
    JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...meta });
  return {
    info: (msg: string, meta?: Record<string, unknown>) => console.log(fmt('info', msg, meta)),
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(fmt('warn', msg, meta)),
    error: (msg: string, meta?: Record<string, unknown>, err?: unknown) =>
      console.error(fmt('error', msg, { ...meta, error: String(err) })),
    debug: (msg: string, meta?: Record<string, unknown>) => console.debug(fmt('debug', msg, meta)),
  };
}

export const log = createLogger('shre-chat');
import {
  isIdbReady,
  initIdb,
  idbSaveSessions,
  idbSaveActivity,
  idbSaveFeed,
  idbSaveFiles,
  idbSaveQueue,
  idbSaveTabs,
  idbSaveActiveSession,
  idbSaveScrollPositions,
  idbLoadScrollPositions,
} from './idb';
import { isDevSafeMode } from './env';
import { getStoredAuthUserId, getStoredWorkspaceId, scopedStorageKey } from './workspace-context';

// ── Agent Registry ───────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  group: 'core' | 'department' | 'council';
  domains?: string[];
  description?: string;
  fleetRoleId?: string;
  fleetRoleLabel?: string;
}

interface MinimumFleetRole {
  id: string;
  name: string;
  agentId: string;
}

const FALLBACK_MINIMUM_FLEET_ROLE_LABEL_BY_AGENT_ID: Record<string, string> = {
  shre: 'Orchestrator',
  architect: 'Planner',
  'shre-context': 'Memory',
  'chief-scientist': 'Researcher',
  compass: 'Analyst',
  'founding-engineer': 'Builder',
  herald: 'Communicator',
  weaver: 'Integrator',
  guardian: 'Guardian',
  pulse: 'Observer',
  'shre-scorer': 'Trainer',
  'shre-chronicle': 'Scribe',
};

let minimumFleetRoleLabelByAgentId: Record<string, string> = {
  ...FALLBACK_MINIMUM_FLEET_ROLE_LABEL_BY_AGENT_ID,
};

export function getMinimumFleetRoleLabel(agentId: string): string | null {
  const visibleId = normalizeVisibleAgentId(agentId);
  return (
    minimumFleetRoleLabelByAgentId[visibleId] ??
    AGENTS.find((agent) => agent.id === visibleId)?.fleetRoleLabel ??
    null
  );
}

function applyMinimumFleetRole(agent: Agent, agentId: string): Agent {
  const fleetRoleLabel = getMinimumFleetRoleLabel(agentId);
  if (!fleetRoleLabel) return agent;
  return {
    ...agent,
    fleetRoleId: fleetRoleLabel.toLowerCase(),
    fleetRoleLabel,
  };
}

// Agent UI metadata — generated from mib007/packages/shared/src/platform-registry.ts.
// To change which agents appear in chat, edit CHAT_VISIBLE_IDS in
// scripts/gen-chat-agents.mjs (parent repo) and rerun the generator.
const AGENT_META: Omit<Agent, 'model'>[] = GENERATED_AGENT_META;

// ── Domain labels + colors for capability badges ────────────────────
export const DOMAIN_META: Record<string, { label: string; color: string }> = {
  all: { label: 'All', color: '#a78bfa' },
  code: { label: 'Code', color: '#60a5fa' },
  pos: { label: 'POS', color: '#34d399' },
  analytics: { label: 'Analytics', color: '#fbbf24' },
  security: { label: 'Security', color: '#f87171' },
  infra: { label: 'Infra', color: '#38bdf8' },
  hr: { label: 'HR', color: '#a3e635' },
  finance: { label: 'Finance', color: '#facc15' },
  marketing: { label: 'Marketing', color: '#f472b6' },
  sales: { label: 'Sales', color: '#fb923c' },
  research: { label: 'Research', color: '#c084fc' },
  retail: { label: 'Retail', color: '#2dd4bf' },
  general: { label: 'General', color: '#94a3b8' },
  architecture: { label: 'Arch', color: '#818cf8' },
  messaging: { label: 'Messaging', color: '#67e8f9' },
  product: { label: 'Product', color: '#e879f9' },
};

/**
 * Fetch canonical agent registry from platform-registry (single source of truth).
 * Falls back to hardcoded AGENT_META if MIB007 is unreachable.
 */
export async function fetchAgentRegistry(): Promise<void> {
  try {
    const res = await fetch('/api/registry/agents', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = (await res.json()) as {
      agents: Array<{
        id: string;
        name: string;
        emoji: string;
        tier: string;
        audience: string;
        group: string;
        domains: string[];
        description: string;
      }>;
    };
    if (!data.agents?.length) return;

    // Map platform-registry group names to shre-chat group type
    const mapGroup = (g: string): 'core' | 'department' | 'council' =>
      g === 'council' ? 'council' : g === 'department' || g === 'business' ? 'department' : 'core';

    // Filter out infra-only agents (shre-fleet, shre-voice, claude-code)
    const INFRA_AGENTS = new Set(['shre-fleet', 'shre-voice', 'claude-code']);

    // Replace AGENTS contents with registry data (preserve array reference)
    const registryAgents = data.agents
      .filter((a) => !INFRA_AGENTS.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        model: getAgentModelFromConfig(a.id),
        group: mapGroup(a.group),
        domains: a.domains,
        description: a.description,
      }))
      .map((agent) => applyMinimumFleetRole(agent, agent.id));

    // Preserve any agents in AGENTS not in registry (runtime-added)
    const registryIds = new Set(registryAgents.map((a) => a.id));
    const preserved = AGENTS.filter((a) => !registryIds.has(a.id) && !INFRA_AGENTS.has(a.id));

    AGENTS.length = 0;
    AGENTS.push(...registryAgents, ...preserved);

    log.info('Agent registry loaded from platform-registry', { count: AGENTS.length });
  } catch {
    // MIB007 unreachable — keep using hardcoded AGENT_META fallback
  }
}

/** Fetch agent capabilities from shre-router and merge domains into AGENTS */
export async function fetchAgentCapabilities(): Promise<void> {
  try {
    const [capabilitiesRes, fleetRes] = await Promise.all([
      fetch('/api/agents/capabilities'),
      fetch('/api/agents/minimum-fleet'),
    ]);
    if (!capabilitiesRes.ok) return;
    const data = (await capabilitiesRes.json()) as {
      agents: Array<{ id: string; tier: string; domains: string[]; specializations: string[] }>;
    };
    const fleetData = fleetRes.ok
      ? ((await fleetRes.json()) as { fleet?: MinimumFleetRole[] })
      : null;
    const fleetByAgentId = new Map<string, MinimumFleetRole>(
      (fleetData?.fleet ?? []).map((role) => [role.agentId, role]),
    );
    if (fleetData?.fleet?.length) {
      minimumFleetRoleLabelByAgentId = Object.fromEntries(
        fleetData.fleet.map((role) => [role.agentId, role.name.replace(/\s+Agent$/, '')]),
      );
    }
    for (const remote of data.agents) {
      const local = AGENTS.find((a) => a.id === remote.id);
      if (local && remote.domains.length > 0) {
        // Merge: keep local domains as fallback, add remote domains
        const merged = new Set([...(local.domains || []), ...remote.domains]);
        (local as any).domains = [...merged];
      }
      if (local) {
        const role = fleetByAgentId.get(remote.id);
        if (role) {
          local.fleetRoleId = role.id;
          local.fleetRoleLabel = role.name.replace(/\s+Agent$/, '');
        }
      }
      // If an agent exists in router but not in local AGENT_META, add it dynamically
      if (!local && remote.id !== 'shre-fleet' && remote.id !== 'shre-voice') {
        const agent: Agent = {
          id: remote.id,
          name: remote.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          emoji:
            remote.tier === 'child-company'
              ? '\uD83C\uDFEA'
              : remote.tier === 'execution'
                ? '\u2699\uFE0F'
                : '\u25CF',
          model: DEFAULT_MODEL,
          group:
            remote.tier === 'council'
              ? 'council'
              : remote.tier === 'c-suite'
                ? 'department'
                : 'core',
          domains: remote.domains,
        };
        AGENTS.push(applyMinimumFleetRole(agent, remote.id));
      }
    }
  } catch {
    // shre-router unavailable — keep using static domains
  }
}

const DEFAULT_MODEL = 'google/gemini-2.5-flash';

const ROUTER_URL = import.meta.env.VITE_ROUTER_URL ?? 'https://127.0.0.1:5497';

// Cached agent model assignments from shre-router config API
let agentModelMap: Record<string, string> = {};

/** Fetch agent model assignments from shre-router central config */
export async function fetchAgentModels(): Promise<void> {
  try {
    const res = await fetch(`${ROUTER_URL}/v1/config/agents`);
    if (res.ok) {
      agentModelMap = await res.json();
      // Rebuild AGENTS with fresh models
      for (const agent of AGENTS) {
        (agent as any).model = agentModelMap[agent.id] ?? agentModelMap._default ?? DEFAULT_MODEL;
      }
    }
  } catch {
    // shre-router unavailable — keep using defaults
  }
}

function getAgentModelFromConfig(agentId: string): string {
  return agentModelMap[agentId] ?? agentModelMap._default ?? DEFAULT_MODEL;
}

function normalizeVisibleAgentId(agentId: string): string {
  return agentId === 'nova' ? 'ellie' : agentId;
}

function normalizeSessionAgentId(session: Session): Session {
  const agentId = normalizeVisibleAgentId(session.agentId || 'main');
  return agentId === session.agentId ? session : { ...session, agentId };
}

// Merged AGENTS array — models come from config, fallback to default
export const AGENTS: Agent[] = AGENT_META.map((a) => ({
  ...a,
  model: DEFAULT_MODEL,
}));

export function getAgent(id: string): Agent {
  const visibleId = normalizeVisibleAgentId(id);
  const agent = AGENTS.find((a) => a.id === visibleId) || {
    id: visibleId,
    name: visibleId,
    emoji: '●',
    model: getAgentModelFromConfig(visibleId),
    group: 'core' as const,
  };
  return applyMinimumFleetRole(agent, visibleId);
}

// ── User Profile & Identity ──────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  role: string; // their title/role
  bio: string; // short about me
  timezone: string;
  language: string;
  avatar?: string; // emoji or URL
  onboardedAt: number;
  // Business context
  business: {
    name: string;
    industry: string;
    size: string; // solo, small, medium, large
    goals: string[]; // top 3 goals
    challenges: string[]; // pain points
    tools: string[]; // tools they use (e.g., "RapidRMS", "Clover")
  };
  // Preferences
  preferences: {
    communicationStyle: 'concise' | 'detailed' | 'balanced';
    notifyOnComplete: boolean;
    showTasksOnGreeting: boolean;
    floatingChat: boolean;
  };
  // Learned over time
  skills: string[]; // user's skills/expertise
  interests: string[]; // topics they engage with
  memories: Array<{ key: string; value: string; learnedAt: number }>;
}

const USER_PROFILE_KEY = 'shre-user-profile';
const USER_PROFILE_KEY_PREFIX = 'shre-user-profile:';

function userProfileKeys(userId?: string): string[] {
  const resolvedUserId = userId || getStoredAuthUserId() || 'anonymous';
  return [
    scopedStorageKey(`${USER_PROFILE_KEY_PREFIX}${resolvedUserId}`, {
      userId: resolvedUserId,
      workspaceId: 'profile',
    }),
    userId ? `${USER_PROFILE_KEY_PREFIX}${resolvedUserId}` : null,
    USER_PROFILE_KEY,
  ].filter((value): value is string => Boolean(value));
}

export function loadUserProfile(userId?: string): UserProfile | null {
  try {
    for (const key of userProfileKeys(userId)) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as UserProfile;
      if (userId && parsed?.id && parsed.id !== userId) continue;
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveUserProfile(profile: UserProfile, userId?: string): void {
  try {
    const resolvedUserId = userId || profile.id || getStoredAuthUserId() || 'anonymous';
    localStorage.setItem(
      scopedStorageKey(`${USER_PROFILE_KEY_PREFIX}${resolvedUserId}`, {
        userId: resolvedUserId,
        workspaceId: 'profile',
      }),
      JSON.stringify(profile),
    );
  } catch {
    /* quota */
  }
}

export function createDefaultProfile(user: {
  username: string;
  name: string;
  role: string;
}): UserProfile {
  return {
    id: user.username,
    name: user.name,
    role: user.role,
    bio: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || 'en',
    onboardedAt: 0,
    business: { name: '', industry: '', size: '', goals: [], challenges: [], tools: [] },
    preferences: {
      communicationStyle: 'balanced',
      notifyOnComplete: true,
      showTasksOnGreeting: true,
      floatingChat: false,
    },
    skills: [],
    interests: [],
    memories: [],
  };
}

// ── Types ────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
  systemPrompt?: string;
  parentId?: string;
  type?: 'chat' | 'voice';
  trimmed?: boolean; // true when localStorage quota trimmed this session's messages
}

export interface ActivityEvent {
  id: string;
  sessionId: string;
  sessionTitle: string;
  agentId: string;
  status: ActivityStatus;
  summary: string;
  timestamp: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  sessionId: string;
  sessionTitle: string;
  agentId: string;
  uploadedAt: number;
  dataUrl: string;
}

export interface QueuedMessage {
  id: string;
  sessionId: string;
  text: string;
  files: UploadedFile[];
}

export interface FeedEntry {
  id: string;
  sessionId: string;
  sessionTitle: string;
  type:
    | 'sent'
    | 'routed'
    | 'streaming'
    | 'received'
    | 'error'
    | 'fallback'
    | 'gateway'
    | 'system'
    | 'tool_result';
  message: string;
  meta?: Record<string, string>; // model, confidence, tokens, etc.
  timestamp: number;
}

export type View =
  | 'chat'
  | 'activity'
  | 'files'
  | 'cron'
  | 'feed'
  | 'agent-feed'
  | 'preview'
  | 'spend'
  | 'briefing'
  | 'reminders'
  | 'cost-dashboard'
  | 'marketplace'
  | 'admin'
  | 'feed-analytics'
  | 'task-timeline'
  | 'agent-social'
  | 'finetune'
  | 'reports'
  | 'employee-activity'
  | 'tasks'
  | 'projects'
  | 'email'
  | 'billing'
  | 'router-gateway'
  | 'shre-dashboard'
  | 'cortexdb'
  | 'storepulse'
  | 'app-marketplace'
  | 'investor'
  | 'agent-trace';

// ── Bookmarks ─────────────────────────────────────────────────────

export interface Bookmark {
  id: string;
  messageIndex: number;
  sessionId: string;
  agentId: string;
  preview: string;
  note?: string;
  createdAt: number;
}

const BOOKMARKS_KEY = 'shre-bookmarks';

export function loadBookmarks(): Map<string, Bookmark> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return new Map();
    const arr: [string, Bookmark][] = JSON.parse(raw);
    return new Map(arr);
  } catch {
    return new Map();
  }
}

export function saveBookmarks(bookmarks: Map<string, Bookmark>): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarks.entries())));
  } catch {
    /* quota */
  }
}

export function addBookmark(
  sessionId: string,
  messageIndex: number,
  sessions: Session[],
  note?: string,
): Bookmark | null {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || !session.messages[messageIndex]) return null;
  const msg = session.messages[messageIndex];
  const id = uid();
  const bookmark: Bookmark = {
    id,
    messageIndex,
    sessionId,
    agentId: session.agentId || 'main',
    preview: msg.content
      .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
      .trim()
      .slice(0, 100),
    note,
    createdAt: Date.now(),
  };
  const bookmarks = loadBookmarks();
  bookmarks.set(id, bookmark);
  saveBookmarks(bookmarks);
  return bookmark;
}

export function removeBookmark(id: string): void {
  const bookmarks = loadBookmarks();
  bookmarks.delete(id);
  saveBookmarks(bookmarks);
}

export function updateBookmarkNote(id: string, note: string): void {
  const bookmarks = loadBookmarks();
  const bm = bookmarks.get(id);
  if (!bm) return;
  bm.note = note || undefined;
  bookmarks.set(id, bm);
  saveBookmarks(bookmarks);
}

export function getBookmarks(): Bookmark[] {
  const bookmarks = loadBookmarks();
  return Array.from(bookmarks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function isMessageBookmarked(sessionId: string, messageIndex: number): string | null {
  const bookmarks = loadBookmarks();
  for (const [id, bm] of bookmarks) {
    if (bm.sessionId === sessionId && bm.messageIndex === messageIndex) return id;
  }
  return null;
}

export type Theme = 'dark' | 'light';

export interface ThemeCustom {
  accentColor?: string;
  fontSize?: 'sm' | 'md' | 'lg';
  fontFamily?: string;
  borderRadius?: 'sharp' | 'normal' | 'round';
  themePack?: 'shre-os' | 'aros' | 'workspace' | 'custom';
}

const THEME_CUSTOM_KEY = 'shre-theme-custom';

function scopedKey(base: string, workspaceAware = true): string {
  return scopedStorageKey(base, {
    userId: getStoredAuthUserId(),
    workspaceId: workspaceAware ? getStoredWorkspaceId() : 'profile',
  });
}

export function loadThemeCustom(): ThemeCustom {
  try {
    return JSON.parse(
      localStorage.getItem(scopedKey(THEME_CUSTOM_KEY)) ||
        localStorage.getItem(THEME_CUSTOM_KEY) ||
        '{}',
    );
  } catch {
    return {};
  }
}

export function saveThemeCustom(custom: ThemeCustom) {
  try {
    localStorage.setItem(scopedKey(THEME_CUSTOM_KEY), JSON.stringify(custom));
  } catch {
    /* quota */
  }
}

export interface DeploymentRequest {
  id: string;
  projectName: string;
  owner: string;
  productShell: 'shre-os' | 'aros' | 'workspace';
  requestType: 'internal' | 'client' | 'platform';
  targetNodes: string;
  environment: string;
  hosting: string;
  database: string;
  frontend: string;
  backend: string;
  themePack: 'shre-os' | 'aros' | 'workspace' | 'custom';
  agents: string;
  notes: string;
  status: 'draft' | 'queued' | 'sent' | 'deployed';
  createdAt: number;
  updatedAt: number;
}

const DEPLOYMENT_REQUESTS_KEY = 'shre-deployment-requests';

export function loadDeploymentRequests(): DeploymentRequest[] {
  return loadFromScopedArray<DeploymentRequest>(
    DEPLOYMENT_REQUESTS_KEY,
    DEPLOYMENT_REQUESTS_KEY,
  ).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveDeploymentRequests(requests: DeploymentRequest[]) {
  try {
    localStorage.setItem(scopedDataKey(DEPLOYMENT_REQUESTS_KEY), JSON.stringify(requests));
  } catch {
    /* quota */
  }
}

export function upsertDeploymentRequest(request: DeploymentRequest): DeploymentRequest[] {
  const current = loadDeploymentRequests();
  const next = [request, ...current.filter((item) => item.id !== request.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  saveDeploymentRequests(next);
  return next;
}

export interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  activeAgentId: string;
  openTabs: string[]; // session IDs open as tabs
  view: View;
  activity: ActivityEvent[];
  feed: FeedEntry[];
  files: UploadedFile[];
  queue: QueuedMessage[];
  streaming: boolean;
  streamText: string;
  statusLine: string | null; // one-sentence status shown in chat
  gatewayUp: boolean | null;
  sidebarOpen: boolean;
  syncing: boolean; // true while loading router session history
  theme: Theme;
  themeCustom: ThemeCustom;
  compact: boolean; // compact message display mode
  writeEnabled: boolean; // false = read-only (default), true = can send messages/delete/etc
  replyToIndex: number | null;
  userProfile: UserProfile | null;
  claudeCliMode: boolean; // When true, coding messages auto-route to Claude CLI execution
  cliLedgerSessionId: string | null; // Active CLI ledger session ID
  cliSummaryMode: Record<string, 'full' | 'summary'>; // Per-message view mode toggle
  // drafts now live in a ref (App.tsx) — no re-render on keystrokes
}

// ── Helpers ──────────────────────────────────────────────────────────

const SESSIONS_KEY = 'shre-sessions';
const ACTIVITY_KEY = 'shre-activity';
const FEED_KEY = 'shre-feed';
const FILES_KEY = 'shre-files';
const TABS_KEY = 'shre-open-tabs';
const ACTIVE_KEY = 'shre-active-session';
const QUEUE_KEY = 'shre-queue';
const DRAFTS_KEY = 'shre-drafts';

function scopedDataKey(base: string): string {
  return scopedKey(base);
}

function loadFromScopedArray<T>(base: string, legacyKey: string): T[] {
  const scoped = loadArray<T>(scopedDataKey(base));
  if (scoped.length > 0) return scoped;
  return loadArray<T>(legacyKey);
}

function loadFromScopedRecord<T extends Record<string, unknown>>(
  base: string,
  legacyKey: string,
  fallback: T,
): T {
  const scoped = loadRecord<T>(scopedDataKey(base), fallback);
  if (Object.keys(scoped).length > 0) return scoped;
  return loadRecord<T>(legacyKey, fallback);
}

function loadFromScopedValue(base: string, legacyKey: string): string | null {
  return localStorage.getItem(scopedDataKey(base)) || localStorage.getItem(legacyKey);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return JSON.parse(raw || '') as T;
  } catch {
    return fallback;
  }
}

function loadArray<T>(key: string): T[] {
  const parsed = parseJson<unknown>(localStorage.getItem(key), []);
  return Array.isArray(parsed) ? parsed : [];
}

function loadRecord<T extends Record<string, unknown>>(key: string, fallback: T): T {
  const parsed = parseJson<unknown>(localStorage.getItem(key), fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback;
}

export function loadSessions(): Session[] {
  return loadFromScopedArray<Session>(SESSIONS_KEY, SESSIONS_KEY).map(normalizeSessionAgentId);
}

const MAX_SESSIONS = 100;
const MAX_FEED_ENTRIES = 300;
const MAX_FILES = 50;

export function saveSessions(sessions: Session[]) {
  // Cap sessions — always keep pinned, then most recently updated unpinned
  let toSave = sessions;
  if (sessions.length > MAX_SESSIONS) {
    const pinned = sessions.filter((s) => s.pinned);
    const unpinned = sessions.filter((s) => !s.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const unpinnedSlots = Math.max(0, MAX_SESSIONS - pinned.length);
    toSave = [...pinned, ...unpinned.slice(0, unpinnedSlots)];
  }
  try {
    localStorage.setItem(scopedDataKey(SESSIONS_KEY), JSON.stringify(toSave));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveSessions(toSave).catch(() => {});
}

// ── Server-side session persistence ──────────────────────────────────

/** Push a single session to the server. Returns true on success. */
export async function syncSessionToServer(session: Session): Promise<boolean> {
  if (isDevSafeMode()) return true;
  try {
    const res = await fetch('/api/chat-sessions/' + encodeURIComponent(session.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget: delete a session from the server */
export function syncDeleteToServer(id: string): void {
  fetch('/api/chat-sessions/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
}

/** Full sync: push local sessions, receive merged result from server.
 *  Server wins on conflicts (higher updatedAt). Returns merged list. */
export async function syncWithServer(localSessions: Session[]): Promise<Session[]> {
  if (isDevSafeMode()) return localSessions;
  try {
    const res = await fetch('/api/chat-sessions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions: localSessions }),
    });
    if (!res.ok) return localSessions; // server down — use local
    const { sessions: serverMerged } = await res.json();
    if (!Array.isArray(serverMerged) || serverMerged.length === 0) return localSessions;

    // Merge: for each session, pick whichever version has MORE messages.
    // This prevents data loss when localStorage quota caused a stale write.
    const localMap = new Map(localSessions.map((s) => [s.id, s]));
    const merged = serverMerged.map((serverSession: Session) => {
      const local = localMap.get(serverSession.id);
      const normalizedServer = normalizeSessionAgentId(serverSession);
      if (!local) return normalizedServer; // new from server
      const localCount = local.messages?.length ?? 0;
      const serverCount = normalizedServer.messages?.length ?? 0;
      // Prefer the version with more messages (data wins over timestamps)
      if (localCount > serverCount) return local;
      return normalizedServer;
    });
    // Also include local-only sessions not on server yet
    for (const local of localSessions) {
      if (!serverMerged.some((s: Session) => s.id === local.id)) {
        merged.push(normalizeSessionAgentId(local));
      }
    }

    // Persist merged result to localStorage (may trim if large)
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));
    } catch {
      /* quota — server has the data */
    }
    return merged;
  } catch {
    return localSessions; // offline — use local
  }
}

/** Track which session IDs need syncing */
const _dirtySessionIds = new Set<string>();
let _serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Mark a session as dirty — synced to server within 500ms (was 2s).
 *  Retries once on failure after 3s. */
export function markSessionDirty(sessionId: string): void {
  if (isDevSafeMode()) return;
  _dirtySessionIds.add(sessionId);
  if (_serverSyncTimer !== null) return; // already scheduled
  _serverSyncTimer = setTimeout(async () => {
    _serverSyncTimer = null;
    const sessions = loadSessions();
    const failedIds: string[] = [];
    for (const id of _dirtySessionIds) {
      const s = sessions.find((s) => s.id === id);
      if (s) {
        const ok = await syncSessionToServer(s);
        if (!ok) failedIds.push(id);
      }
    }
    _dirtySessionIds.clear();
    // Retry failed syncs once after 3s
    if (failedIds.length > 0) {
      setTimeout(() => {
        const retry = loadSessions();
        for (const id of failedIds) {
          const s = retry.find((s) => s.id === id);
          if (s) syncSessionToServer(s); // best-effort retry
        }
      }, 3000);
    }
  }, 500);
}

/** Flush dirty sessions to server immediately (call on beforeunload) */
export function flushServerSync(): void {
  if (isDevSafeMode()) return;
  if (_serverSyncTimer !== null) {
    clearTimeout(_serverSyncTimer);
    _serverSyncTimer = null;
  }
  if (_dirtySessionIds.size === 0) return;
  const sessions = loadSessions();
  for (const id of _dirtySessionIds) {
    const s = sessions.find((s) => s.id === id);
    if (s) {
      // Use sendBeacon for reliability on page unload
      try {
        navigator.sendBeacon(
          '/api/chat-sessions/' + encodeURIComponent(s.id),
          new Blob([JSON.stringify(s)], { type: 'application/json' }),
        );
      } catch {
        syncSessionToServer(s); // fallback
      }
    }
  }
  _dirtySessionIds.clear();
}

/** Save a session to BOTH localStorage and server immediately (no debounce).
 *  Call after every user/assistant message to guarantee crash-proof persistence.
 *  Server sync is the primary durable store; localStorage is a fast cache. */
export function saveSessionImmediate(session: Session): void {
  if (isDevSafeMode()) {
    const sessions = loadSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.push(session);
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      _trimLocalStorage(sessions, session.id);
    }
    if (isIdbReady()) idbSaveSessions(sessions).catch(() => {});
    return;
  }
  // 1. localStorage (sync, instant) — may fail on quota (~5MB)
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  try {
    localStorage.setItem(scopedDataKey(SESSIONS_KEY), JSON.stringify(sessions));
  } catch {
    // Quota exceeded — trim older sessions from localStorage to free space
    _trimLocalStorage(sessions, session.id);
  }
  if (isIdbReady()) idbSaveSessions(sessions).catch(() => {});

  // 2. Server (async, fire-and-retry) — primary durable store
  _dirtySessionIds.delete(session.id); // no need for debounced sync
  syncSessionToServer(session).then((ok) => {
    if (!ok) {
      // Retry once after 2s
      setTimeout(() => syncSessionToServer(session), 2000);
    }
  });
}

/** Trim older sessions' messages from localStorage to free quota.
 *  Keeps the active session intact, strips messages from oldest sessions first. */
function _trimLocalStorage(sessions: Session[], keepId: string): void {
  const sorted = [...sessions].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const s of sorted) {
    if (s.id === keepId) continue;
    if (s.messages.length > 2) {
      // Strip messages from oldest sessions first (server has the full copy)
      s.messages = s.messages.slice(-2); // keep last 2 as preview
      s.trimmed = true; // flag for restore on next access
    }
  }
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
  } catch {
    /* still too big — give up, server is the backup */
  }
}

/** Fetch full session messages from the server (for restoring trimmed sessions). */
export async function fetchFullSessionMessages(sessionId: string): Promise<ChatMessage[] | null> {
  try {
    const res = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.messages) ? data.messages : null;
  } catch {
    return null;
  }
}

/** Debounced saveSessions — delays write by 500ms, coalescing rapid calls.
 *  Use for routine saves (message adds, edits). Call saveSessions() directly
 *  for critical saves (beforeunload). */
let _debounceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingSessions: Session[] | null = null;

export function debouncedSaveSessions(sessions: Session[]) {
  _pendingSessions = sessions;
  if (_debounceSaveTimer !== null) clearTimeout(_debounceSaveTimer);
  _debounceSaveTimer = setTimeout(() => {
    if (_pendingSessions !== null) {
      saveSessions(_pendingSessions);
      _pendingSessions = null;
    }
    _debounceSaveTimer = null;
  }, 500);
}

/** Flush any pending debounced save immediately (call on beforeunload). */
export function flushPendingSave() {
  if (_debounceSaveTimer !== null) {
    clearTimeout(_debounceSaveTimer);
    _debounceSaveTimer = null;
  }
  if (_pendingSessions !== null) {
    saveSessions(_pendingSessions);
    _pendingSessions = null;
  }
  flushServerSync(); // also push dirty sessions to server
}

export function loadActivity(): ActivityEvent[] {
  return loadFromScopedArray<ActivityEvent>(ACTIVITY_KEY, ACTIVITY_KEY);
}

export function saveActivity(events: ActivityEvent[]) {
  const capped = events.slice(-200);
  try {
    localStorage.setItem(scopedDataKey(ACTIVITY_KEY), JSON.stringify(capped));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveActivity(capped).catch(() => {});
}

export function loadFeed(): FeedEntry[] {
  return loadFromScopedArray<FeedEntry>(FEED_KEY, FEED_KEY);
}

export function saveFeed(entries: FeedEntry[]) {
  const capped = entries.slice(-MAX_FEED_ENTRIES);
  try {
    localStorage.setItem(scopedDataKey(FEED_KEY), JSON.stringify(capped));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveFeed(capped).catch(() => {});
}

export function loadFiles(): UploadedFile[] {
  return loadFromScopedArray<UploadedFile>(FILES_KEY, FILES_KEY);
}

export function saveFiles(files: UploadedFile[]) {
  const capped = files.length > MAX_FILES ? files.slice(-MAX_FILES) : files;
  try {
    localStorage.setItem(scopedDataKey(FILES_KEY), JSON.stringify(capped));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveFiles(capped).catch(() => {});
}

export function loadTabs(): string[] {
  return loadFromScopedArray<string>(TABS_KEY, TABS_KEY);
}

export function saveTabs(tabs: string[]) {
  try {
    localStorage.setItem(scopedDataKey(TABS_KEY), JSON.stringify(tabs));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveTabs(tabs).catch(() => {});
}

export function loadActiveSession(): string | null {
  return loadFromScopedValue(ACTIVE_KEY, ACTIVE_KEY);
}

export function saveActiveSession(id: string | null) {
  const key = scopedDataKey(ACTIVE_KEY);
  if (id) localStorage.setItem(key, id);
  else localStorage.removeItem(key);
  if (isIdbReady()) idbSaveActiveSession(id).catch(() => {});
}

export function loadQueue(): QueuedMessage[] {
  return loadFromScopedArray<QueuedMessage>(QUEUE_KEY, QUEUE_KEY);
}

export function saveQueue(queue: QueuedMessage[]) {
  try {
    localStorage.setItem(scopedDataKey(QUEUE_KEY), JSON.stringify(queue));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveQueue(queue).catch(() => {});
}

export function loadDrafts(): Record<string, string> {
  return loadFromScopedRecord<Record<string, string>>(DRAFTS_KEY, DRAFTS_KEY, {});
}

export function saveDrafts(drafts: Record<string, string>) {
  try {
    localStorage.setItem(scopedDataKey(DRAFTS_KEY), JSON.stringify(drafts));
  } catch {
    /* quota */
  }
}

const SCROLL_POS_KEY = 'shre-scroll-positions';

export function loadScrollPositions(): Record<string, number> {
  return loadFromScopedRecord<Record<string, number>>(SCROLL_POS_KEY, SCROLL_POS_KEY, {});
}

export function saveScrollPositions(positions: Record<string, number>) {
  // Keep only the 50 most recent entries to avoid unbounded growth
  const entries = Object.entries(positions);
  const capped = entries.length > 50 ? Object.fromEntries(entries.slice(-50)) : positions;
  try {
    localStorage.setItem(scopedDataKey(SCROLL_POS_KEY), JSON.stringify(capped));
  } catch {
    /* quota */
  }
  if (isIdbReady()) idbSaveScrollPositions(capped).catch(() => {});
}

export function createSession(title?: string, agentId?: string): Session {
  const normalizedAgentId = agentId === 'nova' ? 'ellie' : agentId;
  return {
    id: uid(),
    title: title || 'New chat',
    agentId: normalizedAgentId || 'main',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function findSessionByTag(sessions: Session[], tag: string): Session | null {
  return sessions.find((session) => session.tags?.includes(tag)) ?? null;
}

export function createVoiceSession(agentId?: string): Session {
  const normalizedAgentId = agentId === 'nova' ? 'ellie' : agentId;
  return {
    id: uid(),
    title: 'Voice session',
    agentId: normalizedAgentId || 'main',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    type: 'voice',
    tags: ['voice'],
  };
}

export function generateTitle(message: string): string {
  const cleaned = message.replace(/\n/g, ' ').trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned;
}

// ── Session Export / Import ──────────────────────────────────────────

export function exportSessions(sessions: Session[]) {
  const json = JSON.stringify(sessions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shre-chat-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importSessions(
  file: File,
  existingSessions: Session[],
  onDone: (merged: Session[]) => void,
  onError?: (msg: string) => void,
) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported: Session[] = JSON.parse(reader.result as string);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      const existingIds = new Set(existingSessions.map((s) => s.id));
      const newSessions = imported
        .filter((s) => s.id && !existingIds.has(s.id))
        .map(normalizeSessionAgentId);
      const merged = [...existingSessions.map(normalizeSessionAgentId), ...newSessions];
      saveSessions(merged);
      onDone(merged);
    } catch {
      onError?.('Failed to import: invalid session backup file.');
    }
  };
  reader.readAsText(file);
}

// ── Share via link ───────────────────────────────────────────────────

/** Create a shareable snapshot of a session and return the share URL */
export async function shareSession(sessionId: string): Promise<string> {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Session not found');

  const agent = getAgent(session.agentId || 'main');
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `${agent.name} — ${session.title}`,
      messages: session.messages,
      model: agent.model,
    }),
  });

  if (!res.ok) throw new Error('Failed to create share link');
  const data = await res.json();
  return data.url as string;
}

// ── Context (provided by App) ────────────────────────────────────────

export interface AppActions {
  newSession: () => string;
  openWorkspaceChannel: (channelId: string, opts?: { focus?: boolean; agentId?: string }) => string;
  switchSession: (id: string) => void;
  closeTab: (id: string) => void;
  deleteSession: (id: string) => void;
  setView: (v: View) => void;
  switchView: (v: View) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  addActivity: (sessionId: string, status: ActivityStatus, summary: string) => void;
  addFeed: (
    sessionId: string,
    type: FeedEntry['type'],
    message: string,
    meta?: Record<string, string>,
  ) => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (id: string) => void;
  enqueue: (msg: QueuedMessage) => void;
  dequeue: () => QueuedMessage | undefined;
  setStreaming: (v: boolean) => void;
  setStreamText: (v: string) => void;
  setStatusLine: (v: string | null) => void;
  setGatewayUp: (v: boolean | null) => void;
  setSidebarOpen: (v: boolean) => void;
  setActiveAgent: (agentId: string) => void;
  setSyncing: (v: boolean) => void;
  toggleTheme: () => void;
  replaceSessionMessages: (sessionId: string, msgs: ChatMessage[]) => void;
  setMessageFeedback: (
    sessionId: string,
    msgIndex: number,
    feedback: 'like' | 'dislike' | null,
  ) => void;
  setAnnotation: (sessionId: string, messageIndex: number, text: string) => void;
  toggleReaction: (sessionId: string, messageIndex: number, emoji: string) => void;
  togglePin: (sessionId: string) => void;
  addSessionTag: (sessionId: string, tag: string) => void;
  removeSessionTag: (sessionId: string, tag: string) => void;
  toggleCompact: () => void;
  toggleWriteEnabled: () => void;
  setSystemPrompt: (sessionId: string, prompt: string) => void;
  setThemeCustom: (custom: ThemeCustom) => void;
  branchFrom: (sessionId: string, messageIndex: number) => string | null;
  setDraft: (sessionId: string, text: string) => void;
  getDraft: (sessionId: string) => string;
  setReplyTo: (index: number | null) => void;
  getOrCreateVoiceSession: (agentId: string) => string;
  setClaudeCliMode: (on: boolean) => void;
  setCliLedgerSessionId: (id: string | null) => void;
  toggleCliSummaryMode: (messageId: string) => void;
  getCliSummaryMode: (messageId: string) => 'full' | 'summary';
  logout?: () => void;
}

export const AppContext = createContext<{ state: AppState; actions: AppActions } | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}

// ── IndexedDB initialization ─────────────────────────────────────────

/** Initialize IndexedDB storage. Call once on app mount.
 *  Migrates existing localStorage data to IDB on first run,
 *  then enables dual-write (LS + IDB) for all future saves. */
export async function initStorage(): Promise<void> {
  await initIdb();
}
