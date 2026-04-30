/**
 * Unit tests for store.ts — session CRUD, localStorage helpers,
 * debounced save, queue operations, and pure utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock idb module (imported by store.ts) before importing store ────
vi.mock('../idb', () => ({
  isIdbReady: () => false,
  initIdb: vi.fn().mockResolvedValue(undefined),
  idbSaveSessions: vi.fn().mockResolvedValue(undefined),
  idbSaveActivity: vi.fn().mockResolvedValue(undefined),
  idbSaveFeed: vi.fn().mockResolvedValue(undefined),
  idbSaveFiles: vi.fn().mockResolvedValue(undefined),
  idbSaveQueue: vi.fn().mockResolvedValue(undefined),
  idbSaveTabs: vi.fn().mockResolvedValue(undefined),
  idbSaveActiveSession: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock localStorage ────────────────────────────────────────────────
const localStorageMap = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageMap.delete(key);
  }),
  clear: vi.fn(() => localStorageMap.clear()),
  get length() {
    return localStorageMap.size;
  },
  key: vi.fn((i: number) => Array.from(localStorageMap.keys())[i] ?? null),
};

vi.stubGlobal('localStorage', localStorageMock);

// ── Mock React (createContext / useContext used at module level) ──────
vi.mock('react', () => ({
  createContext: vi.fn(() => ({})),
  useContext: vi.fn(() => null),
}));

// Now import the module under test
import {
  uid,
  createSession,
  generateTitle,
  loadSessions,
  saveSessions,
  loadActiveSession,
  saveActiveSession,
  loadQueue,
  saveQueue,
  loadActivity,
  saveActivity,
  loadFeed,
  saveFeed,
  loadFiles,
  saveFiles,
  loadTabs,
  saveTabs,
  debouncedSaveSessions,
  flushPendingSave,
  loadThemeCustom,
  saveThemeCustom,
  loadDeploymentRequests,
  saveDeploymentRequests,
  upsertDeploymentRequest,
  getAgent,
  getMinimumFleetRoleLabel,
  AGENTS,
  type Session,
} from '../store';
import { getProductShellForHost } from '../workspace-context';

// ── Setup / Teardown ─────────────────────────────────────────────────

beforeEach(() => {
  localStorageMap.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── uid() ────────────────────────────────────────────────────────────

describe('uid', () => {
  it('returns a non-empty string', () => {
    const id = uid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });
});

// ── createSession ────────────────────────────────────────────────────

describe('createSession', () => {
  it('creates a session with default values', () => {
    const s = createSession();
    expect(s.title).toBe('New chat');
    expect(s.agentId).toBe('main');
    expect(s.messages).toEqual([]);
    expect(typeof s.id).toBe('string');
    expect(typeof s.createdAt).toBe('number');
    expect(typeof s.updatedAt).toBe('number');
  });

  it('accepts a custom title and agentId', () => {
    const s = createSession('My Chat', 'nova');
    expect(s.title).toBe('My Chat');
    expect(s.agentId).toBe('ellie');
  });
});

// ── generateTitle ────────────────────────────────────────────────────

describe('generateTitle', () => {
  it('returns the message itself when short', () => {
    expect(generateTitle('Hello world')).toBe('Hello world');
  });

  it('truncates long messages to 40 chars plus ellipsis', () => {
    const long = 'a'.repeat(60);
    const title = generateTitle(long);
    // 40 chars + ellipsis character
    expect(title.length).toBe(41);
    expect(title.endsWith('\u2026')).toBe(true);
  });

  it('replaces newlines with spaces', () => {
    expect(generateTitle('line1\nline2\nline3')).toBe('line1 line2 line3');
  });
});

// ── loadSessions / saveSessions ──────────────────────────────────────

describe('loadSessions / saveSessions', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadSessions()).toEqual([]);
  });

  it('round-trips sessions through localStorage', () => {
    const sessions: Session[] = [createSession('A'), createSession('B')];
    saveSessions(sessions);
    const loaded = loadSessions();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].title).toBe('A');
    expect(loaded[1].title).toBe('B');
  });

  it('returns empty array on corrupted JSON', () => {
    localStorageMap.set('shre-sessions', '{broken json');
    expect(loadSessions()).toEqual([]);
  });

  it('normalizes legacy nova sessions to ellie on load', () => {
    localStorageMap.set(
      'shre-sessions',
      JSON.stringify([{ id: 's1', title: 'Legacy', agentId: 'nova', messages: [] }]),
    );
    const loaded = loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].agentId).toBe('ellie');
  });

  it('caps sessions at 100 — keeps pinned, drops oldest unpinned', () => {
    const sessions: Session[] = [];
    for (let i = 0; i < 110; i++) {
      const s = createSession(`Session ${i}`);
      s.updatedAt = i;
      if (i < 5) s.pinned = true;
      sessions.push(s);
    }
    saveSessions(sessions);
    const loaded = loadSessions();
    expect(loaded.length).toBeLessThanOrEqual(100);
    // All pinned sessions are preserved
    const pinnedCount = loaded.filter((s) => s.pinned).length;
    expect(pinnedCount).toBe(5);
  });
});

// ── loadActiveSession / saveActiveSession ─────────────────────────────

describe('loadActiveSession / saveActiveSession', () => {
  it('returns null when nothing stored', () => {
    expect(loadActiveSession()).toBeNull();
  });

  it('round-trips an active session id', () => {
    saveActiveSession('abc123');
    expect(loadActiveSession()).toBe('abc123');
  });

  it('removes key when passed null', () => {
    saveActiveSession('abc123');
    saveActiveSession(null);
    expect(loadActiveSession()).toBeNull();
  });
});

// ── loadQueue / saveQueue ────────────────────────────────────────────

describe('loadQueue / saveQueue', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('round-trips queued messages', () => {
    const queue = [
      { id: 'q1', sessionId: 's1', text: 'Hello', files: [] },
      { id: 'q2', sessionId: 's2', text: 'World', files: [] },
    ];
    saveQueue(queue);
    expect(loadQueue()).toEqual(queue);
  });
});

// ── Activity, Feed, Files, Tabs ──────────────────────────────────────

describe('loadActivity / saveActivity', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadActivity()).toEqual([]);
  });

  it('caps activity to 200 entries', () => {
    const events = Array.from({ length: 250 }, (_, i) => ({
      id: `a${i}`,
      sessionId: 's1',
      sessionTitle: 'Test',
      agentId: 'main',
      status: 'done' as const,
      summary: `Event ${i}`,
      timestamp: i,
    }));
    saveActivity(events);
    const loaded = loadActivity();
    expect(loaded.length).toBe(200);
    // Should keep the last 200 (most recent)
    expect(loaded[0].summary).toBe('Event 50');
  });
});

describe('loadFeed / saveFeed', () => {
  it('caps feed to 300 entries', () => {
    const entries = Array.from({ length: 350 }, (_, i) => ({
      id: `f${i}`,
      sessionId: 's1',
      sessionTitle: 'Test',
      type: 'sent' as const,
      message: `Feed ${i}`,
      timestamp: i,
    }));
    saveFeed(entries);
    const loaded = loadFeed();
    expect(loaded.length).toBe(300);
  });
});

describe('loadFiles / saveFiles', () => {
  it('caps files to 50', () => {
    const files = Array.from({ length: 60 }, (_, i) => ({
      id: `file${i}`,
      name: `file${i}.txt`,
      size: 100,
      type: 'text/plain',
      sessionId: 's1',
      sessionTitle: 'Test',
      agentId: 'main',
      uploadedAt: i,
      dataUrl: 'data:text/plain;base64,dGVzdA==',
    }));
    saveFiles(files);
    const loaded = loadFiles();
    expect(loaded.length).toBe(50);
  });
});

describe('loadTabs / saveTabs', () => {
  it('round-trips tab IDs', () => {
    saveTabs(['s1', 's2', 's3']);
    expect(loadTabs()).toEqual(['s1', 's2', 's3']);
  });
});

// ── debouncedSaveSessions / flushPendingSave ─────────────────────────

describe('debouncedSaveSessions', () => {
  it('does not save immediately', () => {
    const sessions = [createSession('Debounced')];
    debouncedSaveSessions(sessions);
    // Should NOT have written yet
    expect(localStorageMap.has('shre-sessions')).toBe(false);
  });

  it('saves after 500ms', () => {
    const sessions = [createSession('Debounced')];
    debouncedSaveSessions(sessions);
    vi.advanceTimersByTime(500);
    const loaded = loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Debounced');
  });

  it('coalesces multiple calls within 500ms', () => {
    debouncedSaveSessions([createSession('First')]);
    vi.advanceTimersByTime(200);
    debouncedSaveSessions([createSession('Second')]);
    vi.advanceTimersByTime(500);
    const loaded = loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Second');
  });

  it('flushPendingSave writes immediately', () => {
    debouncedSaveSessions([createSession('Flush')]);
    flushPendingSave();
    const loaded = loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Flush');
  });

  it('flushPendingSave is a no-op when nothing is pending', () => {
    flushPendingSave(); // Should not throw
    expect(loadSessions()).toEqual([]);
  });
});

// ── Theme custom ─────────────────────────────────────────────────────

describe('loadThemeCustom / saveThemeCustom', () => {
  it('returns empty object when nothing stored', () => {
    expect(loadThemeCustom()).toEqual({});
  });

  it('round-trips theme customization', () => {
    saveThemeCustom({ accentColor: '#ff0000', fontSize: 'lg', themePack: 'aros' });
    const loaded = loadThemeCustom();
    expect(loaded.accentColor).toBe('#ff0000');
    expect(loaded.fontSize).toBe('lg');
    expect(loaded.themePack).toBe('aros');
  });
});

// ── Deployment requests ─────────────────────────────────────────────

describe('deployment request helpers', () => {
  it('round-trips deployment requests', () => {
    expect(loadDeploymentRequests()).toEqual([]);
    const request = {
      id: 'req-1',
      projectName: 'AROS',
      owner: 'AROS',
      productShell: 'aros',
      requestType: 'client',
      targetNodes: 'Mac 2',
      environment: 'workspace-first',
      hosting: 'Customer VPS',
      database: 'Supabase',
      frontend: 'Shared shell',
      backend: 'Node',
      themePack: 'aros',
      agents: 'tech stack expert, qa',
      notes: 'test',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    } as const;
    saveDeploymentRequests([request]);
    expect(loadDeploymentRequests()).toHaveLength(1);
    const updated = upsertDeploymentRequest({ ...request, notes: 'updated', updatedAt: 2 });
    expect(updated[0].notes).toBe('updated');
    expect(loadDeploymentRequests()[0].notes).toBe('updated');
  });
});

describe('getProductShellForHost', () => {
  it('maps known hosts to the right product shell', () => {
    expect(getProductShellForHost('mib.nirtek.net')).toBe('shre-os');
    expect(getProductShellForHost('aros.live')).toBe('aros');
    expect(getProductShellForHost('example.com')).toBe('workspace');
  });
});

// ── getAgent ─────────────────────────────────────────────────────────

describe('getAgent', () => {
  it('returns known agent by id', () => {
    const agent = getAgent('main');
    expect(agent.name).toBe('Ellie');
    expect(agent.emoji).toBe('\u2728');
    expect(agent.group).toBe('core');
  });

  it('returns fallback for unknown agent id', () => {
    const agent = getAgent('unknown-agent');
    expect(agent.id).toBe('unknown-agent');
    expect(agent.name).toBe('unknown-agent');
  });

  it('attaches minimum fleet role labels when known', () => {
    const agent = getAgent('guardian');
    expect(agent.fleetRoleLabel).toBe('Guardian');
    expect(getMinimumFleetRoleLabel('guardian')).toBe('Guardian');
  });
});

// ── AGENTS registry ──────────────────────────────────────────────────

describe('AGENTS', () => {
  it('contains core, department, and council agents', () => {
    const groups = new Set(AGENTS.map((a) => a.group));
    expect(groups.has('core')).toBe(true);
    expect(groups.has('department')).toBe(true);
    expect(groups.has('council')).toBe(true);
  });

  it('all agents have required fields', () => {
    for (const agent of AGENTS) {
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.emoji).toBe('string');
      expect(typeof agent.model).toBe('string');
    }
  });
});
