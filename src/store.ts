import { createContext, useContext } from "react";
import type { ActivityStatus, ChatMessage } from "./openclaw";

// ── Structured logging (browser-compatible shre-sdk/logger equivalent) ──
export function createLogger(service: string) {
  const fmt = (level: string, msg: string, meta?: Record<string, unknown>) =>
    JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...meta });
  return {
    info: (msg: string, meta?: Record<string, unknown>) => console.log(fmt("info", msg, meta)),
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(fmt("warn", msg, meta)),
    error: (msg: string, meta?: Record<string, unknown>, err?: unknown) =>
      console.error(fmt("error", msg, { ...meta, error: String(err) })),
    debug: (msg: string, meta?: Record<string, unknown>) => console.debug(fmt("debug", msg, meta)),
  };
}

export const log = createLogger("shre-chat");
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
} from "./idb";

// ── Agent Registry ───────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  group: "core" | "department" | "council";
}

// Agent UI metadata — models are fetched dynamically from shre-router config API
const AGENT_META: Omit<Agent, "model">[] = [
  // Core
  { id: "main", name: "Ellie", emoji: "✨", group: "core" },
  { id: "shre", name: "Shre", emoji: "🤖", group: "core" },
  { id: "nova", name: "Nova", emoji: "🌟", group: "core" },
  { id: "president", name: "President", emoji: "🏛️", group: "core" },
  { id: "storepulse", name: "StorePulse", emoji: "🛍️", group: "core" },
  // Department heads
  { id: "engineering-manager", name: "Engineering", emoji: "⚙️", group: "department" },
  { id: "founding-engineer", name: "Forge", emoji: "🔧", group: "department" },
  { id: "product-manager", name: "Product", emoji: "🎯", group: "department" },
  { id: "ops-manager", name: "Operations", emoji: "🔄", group: "department" },
  { id: "devops-manager", name: "DevOps", emoji: "🖥️", group: "department" },
  { id: "qa-manager", name: "QA", emoji: "🔍", group: "department" },
  { id: "finance-manager", name: "Finance", emoji: "💰", group: "department" },
  { id: "hr-manager", name: "HR", emoji: "🤝", group: "department" },
  { id: "sales-manager", name: "Sales", emoji: "📈", group: "department" },
  { id: "marketing-manager", name: "Marketing", emoji: "📣", group: "department" },
  { id: "mailroom", name: "Mailroom", emoji: "📬", group: "department" },
  // Council
  { id: "council-eagle", name: "Eagle", emoji: "🦅", group: "council" },
  { id: "council-viper", name: "Viper", emoji: "🐍", group: "council" },
  { id: "council-spike", name: "Spike", emoji: "🦔", group: "council" },
  { id: "council-crane", name: "Crane", emoji: "🏗️", group: "council" },
  { id: "council-shark", name: "Shark", emoji: "🦈", group: "council" },
  { id: "council-sentinel", name: "Sentinel", emoji: "🔐", group: "council" },
  { id: "council-argus", name: "Argus", emoji: "👁️", group: "council" },
  { id: "council-compass", name: "Compass", emoji: "🧭", group: "council" },
  { id: "council-panther", name: "Panther", emoji: "🐈‍⬛", group: "council" },
  { id: "council-oracle", name: "Oracle", emoji: "🔮", group: "council" },
  { id: "council-octavius", name: "Octavius", emoji: "🐙", group: "council" },
  { id: "council-whale", name: "Whale", emoji: "🐋", group: "council" },
  { id: "council-fox", name: "Fox", emoji: "🦊", group: "council" },
  { id: "council-owl", name: "Owl", emoji: "🦉", group: "council" },
  { id: "council-sage", name: "Sage", emoji: "🌿", group: "council" },
  { id: "council-raven", name: "Raven", emoji: "🐦‍⬛", group: "council" },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

const ROUTER_URL = import.meta.env.VITE_ROUTER_URL ?? "https://127.0.0.1:5497";

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

// Merged AGENTS array — models come from config, fallback to default
export const AGENTS: Agent[] = AGENT_META.map((a) => ({
  ...a,
  model: DEFAULT_MODEL,
}));

export function getAgent(id: string): Agent {
  return AGENTS.find((a) => a.id === id) || { id, name: id, emoji: "●", model: getAgentModelFromConfig(id), group: "core" as const };
}

// ── User Profile & Identity ──────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  role: string;                    // their title/role
  bio: string;                     // short about me
  timezone: string;
  language: string;
  avatar?: string;                 // emoji or URL
  onboardedAt: number;
  // Business context
  business: {
    name: string;
    industry: string;
    size: string;                  // solo, small, medium, large
    goals: string[];               // top 3 goals
    challenges: string[];          // pain points
    tools: string[];               // tools they use (e.g., "RapidRMS", "Clover")
  };
  // Preferences
  preferences: {
    communicationStyle: "concise" | "detailed" | "balanced";
    notifyOnComplete: boolean;
    showTasksOnGreeting: boolean;
    floatingChat: boolean;
  };
  // Learned over time
  skills: string[];                // user's skills/expertise
  interests: string[];             // topics they engage with
  memories: Array<{ key: string; value: string; learnedAt: number }>;
}

const USER_PROFILE_KEY = "shre-user-profile";

export function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveUserProfile(profile: UserProfile): void {
  try { localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile)); } catch { /* quota */ }
}

export function createDefaultProfile(user: { username: string; name: string; role: string }): UserProfile {
  return {
    id: user.username,
    name: user.name,
    role: user.role,
    bio: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || "en",
    onboardedAt: 0,
    business: { name: "", industry: "", size: "", goals: [], challenges: [], tools: [] },
    preferences: {
      communicationStyle: "balanced",
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
  type: "sent" | "routed" | "streaming" | "received" | "error" | "fallback" | "gateway" | "system";
  message: string;
  meta?: Record<string, string>; // model, confidence, tokens, etc.
  timestamp: number;
}

export type View = "chat" | "activity" | "files" | "cron" | "feed" | "agent-feed" | "preview" | "spend" | "briefing" | "reminders" | "cost-dashboard" | "marketplace" | "admin" | "feed-analytics" | "task-timeline" | "finetune" | "reports";

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

const BOOKMARKS_KEY = "shre-bookmarks";

export function loadBookmarks(): Map<string, Bookmark> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return new Map();
    const arr: [string, Bookmark][] = JSON.parse(raw);
    return new Map(arr);
  } catch { return new Map(); }
}

export function saveBookmarks(bookmarks: Map<string, Bookmark>): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarks.entries())));
  } catch { /* quota */ }
}

export function addBookmark(sessionId: string, messageIndex: number, sessions: Session[], note?: string): Bookmark | null {
  const session = sessions.find(s => s.id === sessionId);
  if (!session || !session.messages[messageIndex]) return null;
  const msg = session.messages[messageIndex];
  const id = uid();
  const bookmark: Bookmark = {
    id,
    messageIndex,
    sessionId,
    agentId: session.agentId || "main",
    preview: msg.content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim().slice(0, 100),
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

export type Theme = "dark" | "light";

export interface ThemeCustom {
  accentColor?: string;
  fontSize?: "sm" | "md" | "lg";
  fontFamily?: string;
  borderRadius?: "sharp" | "normal" | "round";
}

const THEME_CUSTOM_KEY = "shre-theme-custom";

export function loadThemeCustom(): ThemeCustom {
  try { return JSON.parse(localStorage.getItem(THEME_CUSTOM_KEY) || "{}"); } catch { return {}; }
}

export function saveThemeCustom(custom: ThemeCustom) {
  try { localStorage.setItem(THEME_CUSTOM_KEY, JSON.stringify(custom)); } catch { /* quota */ }
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
  syncing: boolean; // true while loading OpenClaw history
  theme: Theme;
  themeCustom: ThemeCustom;
  compact: boolean; // compact message display mode
  writeEnabled: boolean; // false = read-only (default), true = can send messages/delete/etc
  replyToIndex: number | null;
  userProfile: UserProfile | null;
  // drafts now live in a ref (App.tsx) — no re-render on keystrokes
}

// ── Helpers ──────────────────────────────────────────────────────────

const SESSIONS_KEY = "shre-sessions";
const ACTIVITY_KEY = "shre-activity";
const FEED_KEY = "shre-feed";
const FILES_KEY = "shre-files";
const TABS_KEY = "shre-open-tabs";
const ACTIVE_KEY = "shre-active-session";
const QUEUE_KEY = "shre-queue";
const DRAFTS_KEY = "shre-drafts";

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); } catch { return []; }
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
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(toSave)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveSessions(toSave).catch(() => {});
}

// ── Server-side session persistence ──────────────────────────────────

/** Fire-and-forget: push a single session to the server */
export function syncSessionToServer(session: Session): void {
  fetch("/api/chat-sessions/" + encodeURIComponent(session.id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  }).catch(() => {}); // never block UI
}

/** Fire-and-forget: delete a session from the server */
export function syncDeleteToServer(id: string): void {
  fetch("/api/chat-sessions/" + encodeURIComponent(id), { method: "DELETE" }).catch(() => {});
}

/** Full sync: push local sessions, receive merged result from server.
 *  Server wins on conflicts (higher updatedAt). Returns merged list. */
export async function syncWithServer(localSessions: Session[]): Promise<Session[]> {
  try {
    const res = await fetch("/api/chat-sessions/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: localSessions }),
    });
    if (!res.ok) return localSessions; // server down — use local
    const { sessions: merged } = await res.json();
    if (Array.isArray(merged) && merged.length > 0) {
      // Persist merged result to localStorage
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged)); } catch { /* quota */ }
      return merged;
    }
    return localSessions;
  } catch {
    return localSessions; // offline — use local
  }
}

/** Track which session IDs need syncing */
const _dirtySessionIds = new Set<string>();
let _serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Mark a session as dirty — will be synced to server within 2s */
export function markSessionDirty(sessionId: string): void {
  _dirtySessionIds.add(sessionId);
  if (_serverSyncTimer !== null) return; // already scheduled
  _serverSyncTimer = setTimeout(() => {
    _serverSyncTimer = null;
    const sessions = loadSessions();
    for (const id of _dirtySessionIds) {
      const s = sessions.find((s) => s.id === id);
      if (s) syncSessionToServer(s);
    }
    _dirtySessionIds.clear();
  }, 2000);
}

/** Flush dirty sessions to server immediately (call on beforeunload) */
export function flushServerSync(): void {
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
          "/api/chat-sessions/" + encodeURIComponent(s.id),
          new Blob([JSON.stringify(s)], { type: "application/json" })
        );
      } catch {
        syncSessionToServer(s); // fallback
      }
    }
  }
  _dirtySessionIds.clear();
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
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}

export function saveActivity(events: ActivityEvent[]) {
  const capped = events.slice(-200);
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(capped)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveActivity(capped).catch(() => {});
}

export function loadFeed(): FeedEntry[] {
  try { return JSON.parse(localStorage.getItem(FEED_KEY) || "[]"); } catch { return []; }
}

export function saveFeed(entries: FeedEntry[]) {
  const capped = entries.slice(-MAX_FEED_ENTRIES);
  try { localStorage.setItem(FEED_KEY, JSON.stringify(capped)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveFeed(capped).catch(() => {});
}

export function loadFiles(): UploadedFile[] {
  try { return JSON.parse(localStorage.getItem(FILES_KEY) || "[]"); } catch { return []; }
}

export function saveFiles(files: UploadedFile[]) {
  const capped = files.length > MAX_FILES ? files.slice(-MAX_FILES) : files;
  try { localStorage.setItem(FILES_KEY, JSON.stringify(capped)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveFiles(capped).catch(() => {});
}

export function loadTabs(): string[] {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) || "[]"); } catch { return []; }
}

export function saveTabs(tabs: string[]) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveTabs(tabs).catch(() => {});
}

export function loadActiveSession(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveSession(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
  if (isIdbReady()) idbSaveActiveSession(id).catch(() => {});
}

export function loadQueue(): QueuedMessage[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

export function saveQueue(queue: QueuedMessage[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveQueue(queue).catch(() => {});
}

export function loadDrafts(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}"); } catch { return {}; }
}

export function saveDrafts(drafts: Record<string, string>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* quota */ }
}

const SCROLL_POS_KEY = "shre-scroll-positions";

export function loadScrollPositions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SCROLL_POS_KEY) || "{}"); } catch { return {}; }
}

export function saveScrollPositions(positions: Record<string, number>) {
  // Keep only the 50 most recent entries to avoid unbounded growth
  const entries = Object.entries(positions);
  const capped = entries.length > 50
    ? Object.fromEntries(entries.slice(-50))
    : positions;
  try { localStorage.setItem(SCROLL_POS_KEY, JSON.stringify(capped)); } catch { /* quota */ }
  if (isIdbReady()) idbSaveScrollPositions(capped).catch(() => {});
}

export function createSession(title?: string, agentId?: string): Session {
  return {
    id: uid(),
    title: title || "New chat",
    agentId: agentId || "main",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateTitle(message: string): string {
  const cleaned = message.replace(/\n/g, " ").trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) + "…" : cleaned;
}

// ── Session Export / Import ──────────────────────────────────────────

export function exportSessions(sessions: Session[]) {
  const json = JSON.stringify(sessions, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
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
      if (!Array.isArray(imported)) throw new Error("Invalid format");
      const existingIds = new Set(existingSessions.map((s) => s.id));
      const newSessions = imported.filter((s) => s.id && !existingIds.has(s.id));
      const merged = [...existingSessions, ...newSessions];
      saveSessions(merged);
      onDone(merged);
    } catch {
      onError?.("Failed to import: invalid session backup file.");
    }
  };
  reader.readAsText(file);
}

// ── Share via link ───────────────────────────────────────────────────

/** Create a shareable snapshot of a session and return the share URL */
export async function shareSession(sessionId: string): Promise<string> {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found");

  const agent = getAgent(session.agentId || "main");
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${agent.name} — ${session.title}`,
      messages: session.messages,
      model: agent.model,
    }),
  });

  if (!res.ok) throw new Error("Failed to create share link");
  const data = await res.json();
  return data.url as string;
}

// ── Context (provided by App) ────────────────────────────────────────

export interface AppActions {
  newSession: () => string;
  switchSession: (id: string) => void;
  closeTab: (id: string) => void;
  deleteSession: (id: string) => void;
  setView: (v: View) => void;
  switchView: (v: View) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  addActivity: (sessionId: string, status: ActivityStatus, summary: string) => void;
  addFeed: (sessionId: string, type: FeedEntry["type"], message: string, meta?: Record<string, string>) => void;
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
  setMessageFeedback: (sessionId: string, msgIndex: number, feedback: "like" | "dislike" | null) => void;
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
  logout?: () => void;
}

export const AppContext = createContext<{ state: AppState; actions: AppActions } | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

// ── IndexedDB initialization ─────────────────────────────────────────

/** Initialize IndexedDB storage. Call once on app mount.
 *  Migrates existing localStorage data to IDB on first run,
 *  then enables dual-write (LS + IDB) for all future saves. */
export async function initStorage(): Promise<void> {
  await initIdb();
}
