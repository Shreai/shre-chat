import { createContext, useContext } from 'react';
// ── Structured logging (browser-compatible shre-sdk/logger equivalent) ──
export function createLogger(service) {
    const fmt = (level, msg, meta) => JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...meta });
    return {
        info: (msg, meta) => console.log(fmt('info', msg, meta)),
        warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
        error: (msg, meta, err) => console.error(fmt('error', msg, { ...meta, error: String(err) })),
        debug: (msg, meta) => console.debug(fmt('debug', msg, meta)),
    };
}
export const log = createLogger('shre-chat');
import { isIdbReady, initIdb, idbSaveSessions, idbSaveActivity, idbSaveFeed, idbSaveFiles, idbSaveQueue, idbSaveTabs, idbSaveActiveSession, idbSaveScrollPositions, } from './idb';
// Agent UI metadata — models are fetched dynamically from shre-router config API
const AGENT_META = [
    // Core
    {
        id: 'main',
        name: 'Ellie',
        emoji: '✨',
        group: 'core',
        domains: ['all'],
        description: 'Company president — full platform access',
    },
    {
        id: 'shre',
        name: 'Shre',
        emoji: '🤖',
        group: 'core',
        domains: ['all'],
        description: 'Platform Brain — full platform access',
    },
    {
        id: 'nova',
        name: 'Nova',
        emoji: '🌟',
        group: 'core',
        domains: ['research', 'analytics'],
        description: 'Public assistant — general queries and research',
    },
    {
        id: 'ellie',
        name: 'Ellie',
        emoji: '✨',
        group: 'core',
        domains: ['all'],
        description: 'Company President — all agents report to Ellie',
    },
    {
        id: 'storepulse',
        name: 'StorePulse',
        emoji: '🛍️',
        group: 'core',
        domains: ['pos', 'analytics'],
        description: 'Retail analytics dashboard',
    },
    // Department heads
    {
        id: 'engineering-manager',
        name: 'Engineering',
        emoji: '⚙️',
        group: 'department',
        domains: ['code', 'infra'],
        description: 'Engineering management and planning',
    },
    {
        id: 'founding-engineer',
        name: 'Forge',
        emoji: '🔧',
        group: 'department',
        domains: ['code', 'infra'],
        description: 'Code generation, debugging, architecture',
    },
    {
        id: 'product-manager',
        name: 'Product',
        emoji: '🎯',
        group: 'department',
        domains: ['analytics', 'research'],
        description: 'Product strategy and requirements',
    },
    {
        id: 'ops-manager',
        name: 'Operations',
        emoji: '🔄',
        group: 'department',
        domains: ['infra'],
        description: 'Operational management and workflows',
    },
    {
        id: 'devops-manager',
        name: 'DevOps',
        emoji: '🖥️',
        group: 'department',
        domains: ['infra', 'code'],
        description: 'CI/CD, deployments, infrastructure',
    },
    {
        id: 'qa-manager',
        name: 'QA',
        emoji: '🔍',
        group: 'department',
        domains: ['code'],
        description: 'Testing, quality assurance, validation',
    },
    {
        id: 'finance-manager',
        name: 'Finance',
        emoji: '💰',
        group: 'department',
        domains: ['finance'],
        description: 'Budgets, costs, financial analysis',
    },
    {
        id: 'hr-manager',
        name: 'HR',
        emoji: '🤝',
        group: 'department',
        domains: ['hr'],
        description: 'Hiring, team management, HR operations',
    },
    {
        id: 'sales-manager',
        name: 'Sales',
        emoji: '📈',
        group: 'department',
        domains: ['sales'],
        description: 'Leads, deals, pipeline management',
    },
    {
        id: 'marketing-manager',
        name: 'Marketing',
        emoji: '📣',
        group: 'department',
        domains: ['marketing'],
        description: 'Campaigns, content, brand management',
    },
    {
        id: 'mailroom',
        name: 'Mailroom',
        emoji: '📬',
        group: 'department',
        domains: ['infra'],
        description: 'Message routing and notifications',
    },
    // Council
    {
        id: 'council-eagle',
        name: 'Eagle',
        emoji: '🦅',
        group: 'council',
        domains: ['code', 'security'],
        description: 'Architecture review and oversight',
    },
    {
        id: 'council-viper',
        name: 'Viper',
        emoji: '🐍',
        group: 'council',
        domains: ['security'],
        description: 'Security review and threat assessment',
    },
    {
        id: 'council-spike',
        name: 'Spike',
        emoji: '🦔',
        group: 'council',
        domains: ['code'],
        description: 'Performance and optimization review',
    },
    {
        id: 'council-crane',
        name: 'Crane',
        emoji: '🏗️',
        group: 'council',
        domains: ['code', 'infra'],
        description: 'Infrastructure architecture review',
    },
    {
        id: 'council-shark',
        name: 'Shark',
        emoji: '🦈',
        group: 'council',
        domains: ['finance', 'analytics'],
        description: 'Business and cost efficiency review',
    },
    {
        id: 'council-sentinel',
        name: 'Sentinel',
        emoji: '🔐',
        group: 'council',
        domains: ['security'],
        description: 'Security operations lead',
    },
    {
        id: 'council-argus',
        name: 'Argus',
        emoji: '👁️',
        group: 'council',
        domains: ['infra'],
        description: 'Monitoring and observability review',
    },
    {
        id: 'council-compass',
        name: 'Compass',
        emoji: '🧭',
        group: 'council',
        domains: ['analytics', 'research'],
        description: 'Strategic direction and planning',
    },
    {
        id: 'council-panther',
        name: 'Panther',
        emoji: '🐈‍⬛',
        group: 'council',
        domains: ['code'],
        description: 'Stealth operations and automation',
    },
    {
        id: 'council-oracle',
        name: 'Oracle',
        emoji: '🔮',
        group: 'council',
        domains: ['research', 'analytics'],
        description: 'Predictive analysis and forecasting',
    },
    {
        id: 'council-octavius',
        name: 'Octavius',
        emoji: '🐙',
        group: 'council',
        domains: ['code', 'infra'],
        description: 'Multi-system integration review',
    },
    {
        id: 'council-whale',
        name: 'Whale',
        emoji: '🐋',
        group: 'council',
        domains: ['analytics'],
        description: 'Large-scale data analysis',
    },
    {
        id: 'council-fox',
        name: 'Fox',
        emoji: '🦊',
        group: 'council',
        domains: ['research'],
        description: 'Investigation and discovery',
    },
    {
        id: 'council-owl',
        name: 'Owl',
        emoji: '🦉',
        group: 'council',
        domains: ['code', 'security'],
        description: 'Wisdom and deep code review',
    },
    {
        id: 'council-sage',
        name: 'Sage',
        emoji: '🌿',
        group: 'council',
        domains: ['research', 'analytics'],
        description: 'Knowledge synthesis and advice',
    },
    {
        id: 'council-raven',
        name: 'Raven',
        emoji: '🐦‍⬛',
        group: 'council',
        domains: ['infra', 'security'],
        description: 'Dark ops, incident response',
    },
];
// ── Domain labels + colors for capability badges ────────────────────
export const DOMAIN_META = {
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
export async function fetchAgentRegistry() {
    try {
        const res = await fetch('/api/registry/agents', { signal: AbortSignal.timeout(5000) });
        if (!res.ok)
            return;
        const data = (await res.json());
        if (!data.agents?.length)
            return;
        // Map platform-registry group names to shre-chat group type
        const mapGroup = (g) => g === 'council' ? 'council' : g === 'department' || g === 'business' ? 'department' : 'core';
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
        }));
        // Preserve any agents in AGENTS not in registry (runtime-added)
        const registryIds = new Set(registryAgents.map((a) => a.id));
        const preserved = AGENTS.filter((a) => !registryIds.has(a.id) && !INFRA_AGENTS.has(a.id));
        AGENTS.length = 0;
        AGENTS.push(...registryAgents, ...preserved);
        log.info('Agent registry loaded from platform-registry', { count: AGENTS.length });
    }
    catch {
        // MIB007 unreachable — keep using hardcoded AGENT_META fallback
    }
}
/** Fetch agent capabilities from shre-router and merge domains into AGENTS */
export async function fetchAgentCapabilities() {
    try {
        const res = await fetch('/api/agents/capabilities');
        if (!res.ok)
            return;
        const data = (await res.json());
        for (const remote of data.agents) {
            const local = AGENTS.find((a) => a.id === remote.id);
            if (local && remote.domains.length > 0) {
                // Merge: keep local domains as fallback, add remote domains
                const merged = new Set([...(local.domains || []), ...remote.domains]);
                local.domains = [...merged];
            }
            // If an agent exists in router but not in local AGENT_META, add it dynamically
            if (!local && remote.id !== 'shre-fleet' && remote.id !== 'shre-voice') {
                AGENTS.push({
                    id: remote.id,
                    name: remote.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                    emoji: remote.tier === 'child-company'
                        ? '\uD83C\uDFEA'
                        : remote.tier === 'execution'
                            ? '\u2699\uFE0F'
                            : '\u25CF',
                    model: DEFAULT_MODEL,
                    group: remote.tier === 'council'
                        ? 'council'
                        : remote.tier === 'c-suite'
                            ? 'department'
                            : 'core',
                    domains: remote.domains,
                });
            }
        }
    }
    catch {
        // shre-router unavailable — keep using static domains
    }
}
const DEFAULT_MODEL = 'ollama/qwen3:8b';
const ROUTER_URL = import.meta.env.VITE_ROUTER_URL ?? 'https://127.0.0.1:5497';
// Cached agent model assignments from shre-router config API
let agentModelMap = {};
/** Fetch agent model assignments from shre-router central config */
export async function fetchAgentModels() {
    try {
        const res = await fetch(`${ROUTER_URL}/v1/config/agents`);
        if (res.ok) {
            agentModelMap = await res.json();
            // Rebuild AGENTS with fresh models
            for (const agent of AGENTS) {
                agent.model = agentModelMap[agent.id] ?? agentModelMap._default ?? DEFAULT_MODEL;
            }
        }
    }
    catch {
        // shre-router unavailable — keep using defaults
    }
}
function getAgentModelFromConfig(agentId) {
    return agentModelMap[agentId] ?? agentModelMap._default ?? DEFAULT_MODEL;
}
// Merged AGENTS array — models come from config, fallback to default
export const AGENTS = AGENT_META.map((a) => ({
    ...a,
    model: DEFAULT_MODEL,
}));
export function getAgent(id) {
    return (AGENTS.find((a) => a.id === id) || {
        id,
        name: id,
        emoji: '●',
        model: getAgentModelFromConfig(id),
        group: 'core',
    });
}
const USER_PROFILE_KEY = 'shre-user-profile';
export function loadUserProfile() {
    try {
        const raw = localStorage.getItem(USER_PROFILE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function saveUserProfile(profile) {
    try {
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    }
    catch {
        /* quota */
    }
}
export function createDefaultProfile(user) {
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
const BOOKMARKS_KEY = 'shre-bookmarks';
export function loadBookmarks() {
    try {
        const raw = localStorage.getItem(BOOKMARKS_KEY);
        if (!raw)
            return new Map();
        const arr = JSON.parse(raw);
        return new Map(arr);
    }
    catch {
        return new Map();
    }
}
export function saveBookmarks(bookmarks) {
    try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarks.entries())));
    }
    catch {
        /* quota */
    }
}
export function addBookmark(sessionId, messageIndex, sessions, note) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || !session.messages[messageIndex])
        return null;
    const msg = session.messages[messageIndex];
    const id = uid();
    const bookmark = {
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
export function removeBookmark(id) {
    const bookmarks = loadBookmarks();
    bookmarks.delete(id);
    saveBookmarks(bookmarks);
}
export function updateBookmarkNote(id, note) {
    const bookmarks = loadBookmarks();
    const bm = bookmarks.get(id);
    if (!bm)
        return;
    bm.note = note || undefined;
    bookmarks.set(id, bm);
    saveBookmarks(bookmarks);
}
export function getBookmarks() {
    const bookmarks = loadBookmarks();
    return Array.from(bookmarks.values()).sort((a, b) => b.createdAt - a.createdAt);
}
export function isMessageBookmarked(sessionId, messageIndex) {
    const bookmarks = loadBookmarks();
    for (const [id, bm] of bookmarks) {
        if (bm.sessionId === sessionId && bm.messageIndex === messageIndex)
            return id;
    }
    return null;
}
const THEME_CUSTOM_KEY = 'shre-theme-custom';
export function loadThemeCustom() {
    try {
        return JSON.parse(localStorage.getItem(THEME_CUSTOM_KEY) || '{}');
    }
    catch {
        return {};
    }
}
export function saveThemeCustom(custom) {
    try {
        localStorage.setItem(THEME_CUSTOM_KEY, JSON.stringify(custom));
    }
    catch {
        /* quota */
    }
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
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function loadSessions() {
    try {
        return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    }
    catch {
        return [];
    }
}
const MAX_SESSIONS = 100;
const MAX_FEED_ENTRIES = 300;
const MAX_FILES = 50;
export function saveSessions(sessions) {
    // Cap sessions — always keep pinned, then most recently updated unpinned
    let toSave = sessions;
    if (sessions.length > MAX_SESSIONS) {
        const pinned = sessions.filter((s) => s.pinned);
        const unpinned = sessions.filter((s) => !s.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
        const unpinnedSlots = Math.max(0, MAX_SESSIONS - pinned.length);
        toSave = [...pinned, ...unpinned.slice(0, unpinnedSlots)];
    }
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(toSave));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveSessions(toSave).catch(() => { });
}
// ── Server-side session persistence ──────────────────────────────────
/** Push a single session to the server. Returns true on success. */
export async function syncSessionToServer(session) {
    try {
        const res = await fetch('/api/chat-sessions/' + encodeURIComponent(session.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/** Fire-and-forget: delete a session from the server */
export function syncDeleteToServer(id) {
    fetch('/api/chat-sessions/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => { });
}
/** Full sync: push local sessions, receive merged result from server.
 *  Server wins on conflicts (higher updatedAt). Returns merged list. */
export async function syncWithServer(localSessions) {
    try {
        const res = await fetch('/api/chat-sessions/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessions: localSessions }),
        });
        if (!res.ok)
            return localSessions; // server down — use local
        const { sessions: serverMerged } = await res.json();
        if (!Array.isArray(serverMerged) || serverMerged.length === 0)
            return localSessions;
        // Merge: for each session, pick whichever version has MORE messages.
        // This prevents data loss when localStorage quota caused a stale write.
        const localMap = new Map(localSessions.map((s) => [s.id, s]));
        const merged = serverMerged.map((serverSession) => {
            const local = localMap.get(serverSession.id);
            if (!local)
                return serverSession; // new from server
            const localCount = local.messages?.length ?? 0;
            const serverCount = serverSession.messages?.length ?? 0;
            // Prefer the version with more messages (data wins over timestamps)
            if (localCount > serverCount)
                return local;
            return serverSession;
        });
        // Also include local-only sessions not on server yet
        for (const local of localSessions) {
            if (!serverMerged.some((s) => s.id === local.id)) {
                merged.push(local);
            }
        }
        // Persist merged result to localStorage (may trim if large)
        try {
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));
        }
        catch {
            /* quota — server has the data */
        }
        return merged;
    }
    catch {
        return localSessions; // offline — use local
    }
}
/** Track which session IDs need syncing */
const _dirtySessionIds = new Set();
let _serverSyncTimer = null;
/** Mark a session as dirty — synced to server within 500ms (was 2s).
 *  Retries once on failure after 3s. */
export function markSessionDirty(sessionId) {
    _dirtySessionIds.add(sessionId);
    if (_serverSyncTimer !== null)
        return; // already scheduled
    _serverSyncTimer = setTimeout(async () => {
        _serverSyncTimer = null;
        const sessions = loadSessions();
        const failedIds = [];
        for (const id of _dirtySessionIds) {
            const s = sessions.find((s) => s.id === id);
            if (s) {
                const ok = await syncSessionToServer(s);
                if (!ok)
                    failedIds.push(id);
            }
        }
        _dirtySessionIds.clear();
        // Retry failed syncs once after 3s
        if (failedIds.length > 0) {
            setTimeout(() => {
                const retry = loadSessions();
                for (const id of failedIds) {
                    const s = retry.find((s) => s.id === id);
                    if (s)
                        syncSessionToServer(s); // best-effort retry
                }
            }, 3000);
        }
    }, 500);
}
/** Flush dirty sessions to server immediately (call on beforeunload) */
export function flushServerSync() {
    if (_serverSyncTimer !== null) {
        clearTimeout(_serverSyncTimer);
        _serverSyncTimer = null;
    }
    if (_dirtySessionIds.size === 0)
        return;
    const sessions = loadSessions();
    for (const id of _dirtySessionIds) {
        const s = sessions.find((s) => s.id === id);
        if (s) {
            // Use sendBeacon for reliability on page unload
            try {
                navigator.sendBeacon('/api/chat-sessions/' + encodeURIComponent(s.id), new Blob([JSON.stringify(s)], { type: 'application/json' }));
            }
            catch {
                syncSessionToServer(s); // fallback
            }
        }
    }
    _dirtySessionIds.clear();
}
/** Save a session to BOTH localStorage and server immediately (no debounce).
 *  Call after every user/assistant message to guarantee crash-proof persistence.
 *  Server sync is the primary durable store; localStorage is a fast cache. */
export function saveSessionImmediate(session) {
    // 1. localStorage (sync, instant) — may fail on quota (~5MB)
    const sessions = loadSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0)
        sessions[idx] = session;
    else
        sessions.push(session);
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
    catch {
        // Quota exceeded — trim older sessions from localStorage to free space
        _trimLocalStorage(sessions, session.id);
    }
    if (isIdbReady())
        idbSaveSessions(sessions).catch(() => { });
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
function _trimLocalStorage(sessions, keepId) {
    const sorted = [...sessions].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    for (const s of sorted) {
        if (s.id === keepId)
            continue;
        if (s.messages.length > 2) {
            // Strip messages from oldest sessions first (server has the full copy)
            s.messages = s.messages.slice(-2); // keep last 2 as preview
            s.trimmed = true; // flag for restore on next access
        }
    }
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
    }
    catch {
        /* still too big — give up, server is the backup */
    }
}
/** Fetch full session messages from the server (for restoring trimmed sessions). */
export async function fetchFullSessionMessages(sessionId) {
    try {
        const res = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages?limit=200`);
        if (!res.ok)
            return null;
        const data = await res.json();
        return Array.isArray(data.messages) ? data.messages : null;
    }
    catch {
        return null;
    }
}
/** Debounced saveSessions — delays write by 500ms, coalescing rapid calls.
 *  Use for routine saves (message adds, edits). Call saveSessions() directly
 *  for critical saves (beforeunload). */
let _debounceSaveTimer = null;
let _pendingSessions = null;
export function debouncedSaveSessions(sessions) {
    _pendingSessions = sessions;
    if (_debounceSaveTimer !== null)
        clearTimeout(_debounceSaveTimer);
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
export function loadActivity() {
    try {
        return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    }
    catch {
        return [];
    }
}
export function saveActivity(events) {
    const capped = events.slice(-200);
    try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(capped));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveActivity(capped).catch(() => { });
}
export function loadFeed() {
    try {
        return JSON.parse(localStorage.getItem(FEED_KEY) || '[]');
    }
    catch {
        return [];
    }
}
export function saveFeed(entries) {
    const capped = entries.slice(-MAX_FEED_ENTRIES);
    try {
        localStorage.setItem(FEED_KEY, JSON.stringify(capped));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveFeed(capped).catch(() => { });
}
export function loadFiles() {
    try {
        return JSON.parse(localStorage.getItem(FILES_KEY) || '[]');
    }
    catch {
        return [];
    }
}
export function saveFiles(files) {
    const capped = files.length > MAX_FILES ? files.slice(-MAX_FILES) : files;
    try {
        localStorage.setItem(FILES_KEY, JSON.stringify(capped));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveFiles(capped).catch(() => { });
}
export function loadTabs() {
    try {
        return JSON.parse(localStorage.getItem(TABS_KEY) || '[]');
    }
    catch {
        return [];
    }
}
export function saveTabs(tabs) {
    try {
        localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveTabs(tabs).catch(() => { });
}
export function loadActiveSession() {
    return localStorage.getItem(ACTIVE_KEY);
}
export function saveActiveSession(id) {
    if (id)
        localStorage.setItem(ACTIVE_KEY, id);
    else
        localStorage.removeItem(ACTIVE_KEY);
    if (isIdbReady())
        idbSaveActiveSession(id).catch(() => { });
}
export function loadQueue() {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    }
    catch {
        return [];
    }
}
export function saveQueue(queue) {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveQueue(queue).catch(() => { });
}
export function loadDrafts() {
    try {
        return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
    }
    catch {
        return {};
    }
}
export function saveDrafts(drafts) {
    try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    }
    catch {
        /* quota */
    }
}
const SCROLL_POS_KEY = 'shre-scroll-positions';
export function loadScrollPositions() {
    try {
        return JSON.parse(localStorage.getItem(SCROLL_POS_KEY) || '{}');
    }
    catch {
        return {};
    }
}
export function saveScrollPositions(positions) {
    // Keep only the 50 most recent entries to avoid unbounded growth
    const entries = Object.entries(positions);
    const capped = entries.length > 50 ? Object.fromEntries(entries.slice(-50)) : positions;
    try {
        localStorage.setItem(SCROLL_POS_KEY, JSON.stringify(capped));
    }
    catch {
        /* quota */
    }
    if (isIdbReady())
        idbSaveScrollPositions(capped).catch(() => { });
}
export function createSession(title, agentId) {
    return {
        id: uid(),
        title: title || 'New chat',
        agentId: agentId || 'main',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
export function createVoiceSession(agentId) {
    return {
        id: uid(),
        title: 'Voice session',
        agentId: agentId || 'main',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        type: 'voice',
        tags: ['voice'],
    };
}
export function generateTitle(message) {
    const cleaned = message.replace(/\n/g, ' ').trim();
    return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned;
}
// ── Session Export / Import ──────────────────────────────────────────
export function exportSessions(sessions) {
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
export function importSessions(file, existingSessions, onDone, onError) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            if (!Array.isArray(imported))
                throw new Error('Invalid format');
            const existingIds = new Set(existingSessions.map((s) => s.id));
            const newSessions = imported.filter((s) => s.id && !existingIds.has(s.id));
            const merged = [...existingSessions, ...newSessions];
            saveSessions(merged);
            onDone(merged);
        }
        catch {
            onError?.('Failed to import: invalid session backup file.');
        }
    };
    reader.readAsText(file);
}
// ── Share via link ───────────────────────────────────────────────────
/** Create a shareable snapshot of a session and return the share URL */
export async function shareSession(sessionId) {
    const sessions = loadSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session)
        throw new Error('Session not found');
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
    if (!res.ok)
        throw new Error('Failed to create share link');
    const data = await res.json();
    return data.url;
}
export const AppContext = createContext(null);
export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx)
        throw new Error('useApp outside provider');
    return ctx;
}
// ── IndexedDB initialization ─────────────────────────────────────────
/** Initialize IndexedDB storage. Call once on app mount.
 *  Migrates existing localStorage data to IDB on first run,
 *  then enables dual-write (LS + IDB) for all future saves. */
export async function initStorage() {
    await initIdb();
}
