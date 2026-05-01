import { useEffect, useMemo, useRef, useState } from 'react';

export type WorkspacePresenceState = 'active' | 'away';

export interface WorkspacePresencePeer {
  userId: string;
  presence: WorkspacePresenceState | 'offline';
  displayName?: string;
  lastSeenAt: number;
  updatedAt: number;
}

export interface WorkspacePresenceSnapshot {
  self: WorkspacePresencePeer | null;
  peers: Record<string, WorkspacePresencePeer>;
}

export interface UseWorkspacePresenceOptions {
  userId: string;
  displayName?: string;
  agentId?: string;
  sessionId?: string | null;
}

export interface UseWorkspacePresenceResult {
  presence: WorkspacePresenceState;
  workspacePresenceByUserId: Record<string, WorkspacePresencePeer>;
  refreshWorkspacePresence: () => Promise<void>;
}

const PRESENCE_KEY = 'shre-live-presence';
const PRESENCE_SNAPSHOT_KEY = 'shre-workspace-presence-snapshot';
const PRESENCE_CHANNEL = 'shre-chat-presence';
const CLIENT_ID_KEY = 'shre-workspace-presence-client-id';
const AWAY_AFTER_MS = 2 * 60_000;
const HEARTBEAT_MS = 15_000;
const POLL_MS = 12_000;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getClientId(): string {
  if (!canUseStorage()) return 'server';
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return 'server';
  }
}

function readPresenceSnapshot(): WorkspacePresenceSnapshot {
  if (!canUseStorage()) return { self: null, peers: {} };
  try {
    const raw = localStorage.getItem(PRESENCE_SNAPSHOT_KEY);
    if (!raw) return { self: null, peers: {} };
    const parsed = JSON.parse(raw) as Partial<WorkspacePresenceSnapshot>;
    return {
      self: parsed.self ?? null,
      peers:
        parsed.peers && typeof parsed.peers === 'object' && !Array.isArray(parsed.peers)
          ? (parsed.peers as Record<string, WorkspacePresencePeer>)
          : {},
    };
  } catch {
    return { self: null, peers: {} };
  }
}

function writePresenceSnapshot(snapshot: WorkspacePresenceSnapshot): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(PRESENCE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

function emitPresenceSnapshotChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('shre-workspace-presence-snapshot-changed'));
}

export function loadWorkspacePresenceSnapshot(): WorkspacePresenceSnapshot {
  return readPresenceSnapshot();
}

function normalizePresence(value: unknown): WorkspacePresenceState {
  return value === 'away' ? 'away' : 'active';
}

function nowPeer(
  userId: string,
  presence: WorkspacePresenceState,
  displayName?: string,
): WorkspacePresencePeer {
  const now = Date.now();
  return {
    userId,
    presence,
    displayName,
    lastSeenAt: now,
    updatedAt: now,
  };
}

export function useWorkspacePresence({
  userId,
  displayName,
  agentId,
  sessionId,
}: UseWorkspacePresenceOptions): UseWorkspacePresenceResult {
  const [presence, setPresence] = useState<WorkspacePresenceState>('active');
  const [workspacePresenceByUserId, setWorkspacePresenceByUserId] = useState<
    Record<string, WorkspacePresencePeer>
  >({});
  const lastActivityRef = useRef(Date.now());
  const presenceRef = useRef<WorkspacePresenceState>('active');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshWorkspacePresenceRef = useRef<() => Promise<void>>(async () => {});
  const clientId = useMemo(() => getClientId(), []);

  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PRESENCE_CHANNEL) : null;
    let disposed = false;

    const persistSnapshot = (
      selfPresence: WorkspacePresenceState,
      peers?: Record<string, WorkspacePresencePeer>,
    ) => {
      const self = nowPeer(userId, selfPresence, displayName);
      const snapshot: WorkspacePresenceSnapshot = {
        self,
        peers: peers || readPresenceSnapshot().peers,
      };
      writePresenceSnapshot(snapshot);
      emitPresenceSnapshotChange();
      channel?.postMessage({ userId, presence: selfPresence, snapshot, ts: Date.now() });
    };

    const publish = async (next: WorkspacePresenceState) => {
      const payload = {
        state: next,
        displayName,
        agentId,
        sessionId: sessionId || undefined,
        clientId,
        lastSeenAt: Date.now(),
      };
      persistSnapshot(next);
      try {
        localStorage.setItem(
          PRESENCE_KEY,
          JSON.stringify({ userId, presence: next, ts: Date.now() }),
        );
      } catch {
        /* quota */
      }
      try {
        await fetch('/api/chat-presence/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } catch {
        /* offline */
      }
    };

    const setPresenceIfNeeded = (next: WorkspacePresenceState) => {
      if (presenceRef.current !== next) {
        presenceRef.current = next;
        setPresence(next);
      }
    };

    const applySnapshot = (snapshot: WorkspacePresenceSnapshot) => {
      const selfState = normalizePresence(snapshot.self?.presence || presenceRef.current);
      setPresenceIfNeeded(selfState);
      const nextPeers = { ...(snapshot.peers || {}) };
      nextPeers[userId] = nowPeer(userId, selfState, displayName);
      setWorkspacePresenceByUserId(nextPeers);
      writePresenceSnapshot({ self: nextPeers[userId], peers: nextPeers });
      emitPresenceSnapshotChange();
    };

    const applyPresenceRows = (rows: WorkspacePresencePeer[]) => {
      const peers: Record<string, WorkspacePresencePeer> = {};
      for (const item of rows) {
        if (!item?.userId) continue;
        peers[item.userId] = {
          ...item,
          presence: item.presence === 'offline' ? 'offline' : normalizePresence(item.presence),
        };
      }
      const self = peers[userId] || nowPeer(userId, presenceRef.current, displayName);
      peers[userId] = self;
      applySnapshot({ self, peers });
    };

    const refreshWorkspacePresence = async () => {
      try {
        const res = await fetch('/api/chat-presence', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { presence?: WorkspacePresencePeer[] };
        applyPresenceRows(data.presence || []);
      } catch {
        // fall back to current snapshot
        const snapshot = readPresenceSnapshot();
        if (snapshot.self || Object.keys(snapshot.peers).length > 0) {
          applySnapshot(snapshot);
        }
      }
    };
    refreshWorkspacePresenceRef.current = refreshWorkspacePresence;

    const goActive = () => {
      lastActivityRef.current = Date.now();
      setPresenceIfNeeded('active');
      void publish('active');
    };

    const goAwayIfIdle = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (document.hidden || idleMs >= AWAY_AFTER_MS) {
        setPresenceIfNeeded('away');
        void publish('away');
      } else {
        setPresenceIfNeeded('active');
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === PRESENCE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as {
            userId?: string;
            presence?: WorkspacePresenceState;
          };
          if (parsed.userId === userId && parsed.presence) {
            setPresenceIfNeeded(normalizePresence(parsed.presence));
          }
        } catch {
          /* ignore */
        }
      }
      if (event.key === PRESENCE_SNAPSHOT_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as WorkspacePresenceSnapshot;
          if (parsed?.peers) {
            setWorkspacePresenceByUserId(parsed.peers);
            if (parsed.self?.presence) {
              setPresenceIfNeeded(normalizePresence(parsed.self.presence));
            }
          }
        } catch {
          /* ignore */
        }
      }
    };

    const onMessage = (event: MessageEvent) => {
      const parsed = event.data as {
        userId?: string;
        presence?: WorkspacePresenceState;
        snapshot?: WorkspacePresenceSnapshot;
      } | null;
      if (parsed?.userId === userId && parsed.presence) {
        setPresenceIfNeeded(normalizePresence(parsed.presence));
      }
      if (parsed?.snapshot?.peers) {
        setWorkspacePresenceByUserId(parsed.snapshot.peers);
      }
    };

    const connectPresenceSocket = () => {
      if (disposed || typeof WebSocket === 'undefined') return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws/notifications`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
            tenantId?: string;
            presence?: WorkspacePresencePeer[];
          };
          if (parsed?.type !== 'presence.updated' || !Array.isArray(parsed.presence)) return;
          applyPresenceRows(parsed.presence);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
        wsReconnectRef.current = window.setTimeout(() => {
          if (!disposed && !wsRef.current) connectPresenceSocket();
        }, 5000);
      };
    };

    const handleVisibility = () => {
      if (document.hidden) {
        setPresenceIfNeeded('away');
        void publish('away');
      } else {
        goActive();
      }
    };

    void refreshWorkspacePresence();
    void publish('active');

    window.addEventListener('pointerdown', goActive, { passive: true });
    window.addEventListener('keydown', goActive, { passive: true });
    window.addEventListener('focus', goActive);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', onStorage);
    channel?.addEventListener('message', onMessage);
    connectPresenceSocket();

    heartbeatRef.current = window.setInterval(goAwayIfIdle, HEARTBEAT_MS);
    pollRef.current = window.setInterval(() => {
      void refreshWorkspacePresence();
    }, POLL_MS);

    return () => {
      disposed = true;
      window.removeEventListener('pointerdown', goActive);
      window.removeEventListener('keydown', goActive);
      window.removeEventListener('focus', goActive);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [agentId, clientId, displayName, sessionId, userId]);

  return {
    presence,
    workspacePresenceByUserId,
    refreshWorkspacePresence: () => refreshWorkspacePresenceRef.current(),
  };
}
