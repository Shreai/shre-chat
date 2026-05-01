import { useEffect, useMemo, useRef, useState } from 'react';

export interface WorkspaceTyper {
  userId: string;
  displayName: string;
  state: 'typing' | 'idle';
  lastSeenAt: number;
  updatedAt: number;
}

export type WorkspaceTypersBySessionId = Record<string, WorkspaceTyper[]>;

export interface UseWorkspaceTypingOptions {
  sessionId: string | null;
  userId: string;
  displayName?: string;
  draftText: string;
}

export interface UseWorkspaceTypingResult {
  typers: WorkspaceTyper[];
  typingLabel: string | null;
}

const TYPING_WS_PATH = '/ws/notifications';
const TYPING_SNAPSHOT_KEY = 'shre-workspace-typing-snapshot';
const TYPING_CHANGE_EVENT = 'shre-workspace-typing-changed';
const HEARTBEAT_MS = 4_000;
const STOP_DELAY_MS = 1_500;
const POLL_MS = 10_000;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readTypingSnapshot(): WorkspaceTypersBySessionId {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(TYPING_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkspaceTypersBySessionId;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTypingSnapshot(snapshot: WorkspaceTypersBySessionId): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(TYPING_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

function emitTypingSnapshotChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TYPING_CHANGE_EVENT));
}

function normalizeTypers(value: unknown): WorkspaceTyper[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<WorkspaceTyper>;
      const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
      if (!userId) return null;
      return {
        userId,
        displayName:
          typeof row.displayName === 'string' && row.displayName.trim()
            ? row.displayName.trim()
            : userId,
        state: row.state === 'typing' ? 'typing' : 'idle',
        lastSeenAt: typeof row.lastSeenAt === 'number' ? row.lastSeenAt : Date.now(),
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : Date.now(),
      };
    })
    .filter((item): item is WorkspaceTyper => Boolean(item));
}

export function loadWorkspaceTypingSnapshot(): WorkspaceTypersBySessionId {
  return readTypingSnapshot();
}

export function useWorkspaceTyping({
  sessionId,
  userId,
  displayName,
  draftText,
}: UseWorkspaceTypingOptions): UseWorkspaceTypingResult {
  const [typers, setTypers] = useState<WorkspaceTyper[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);
  const lastSentStateRef = useRef<'typing' | 'idle' | null>(null);
  const draftTextRef = useRef(draftText);

  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  const refreshTyping = async (id = sessionId) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/chat-typing?sessionId=${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { typers?: WorkspaceTyper[] };
      const next = normalizeTypers(data.typers || []);
      setTypers(next);
      const snapshot = readTypingSnapshot();
      const nextSnapshot = { ...snapshot, [id]: next };
      writeTypingSnapshot(nextSnapshot);
      emitTypingSnapshotChange();
    } catch {
      /* offline */
    }
  };

  const publish = async (state: 'typing' | 'idle') => {
    if (!sessionId) return;
    if (lastSentStateRef.current === state) return;
    lastSentStateRef.current = state;
    try {
      await fetch('/api/chat-typing/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          state,
          displayName,
          lastSeenAt: Date.now(),
        }),
      });
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setTypers([]);
      return () => void 0;
    }
    mountedRef.current = true;
    const snapshot = readTypingSnapshot();
    if (sessionId && snapshot[sessionId]) {
      setTypers(snapshot[sessionId]);
    }
    void refreshTyping();

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${TYPING_WS_PATH}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          sessionId?: string;
          typers?: unknown;
        };
        if (parsed.type !== 'workspace.typing.updated' || parsed.sessionId !== sessionId) return;
        const next = normalizeTypers(parsed.typers || []);
        setTypers(next);
        const snapshot = readTypingSnapshot();
        const nextSnapshot = { ...snapshot, [parsed.sessionId]: next };
        writeTypingSnapshot(nextSnapshot);
        emitTypingSnapshotChange();
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
      if (!mountedRef.current) return;
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = window.setTimeout(() => {
        if (mountedRef.current && !wsRef.current) {
          void refreshTyping();
        }
      }, 5000);
    };

    pollRef.current = window.setInterval(() => {
      void refreshTyping();
    }, POLL_MS);

    heartbeatRef.current = window.setInterval(() => {
      if (!sessionId) return;
      if (draftTextRef.current.trim().length > 0) {
        void publish('typing');
      }
    }, HEARTBEAT_MS);

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [displayName, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    if (draftText.trim().length === 0) {
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      typingStopRef.current = window.setTimeout(() => {
        void publish('idle');
        setTypers((prev) => prev.filter((typer) => typer.userId !== userId));
      }, STOP_DELAY_MS);
      return;
    }

    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    void publish('typing');
    void refreshTyping(sessionId);
  }, [draftText, sessionId, userId]);

  const typingLabel = useMemo(() => {
    const others = typers.filter((typer) => typer.userId !== userId && typer.state === 'typing');
    if (others.length === 0) return null;
    if (others.length === 1) return `${others[0].displayName} is typing...`;
    if (others.length === 2)
      return `${others[0].displayName} and ${others[1].displayName} are typing...`;
    return `${others[0].displayName} and ${others.length - 1} others are typing...`;
  }, [typers, userId]);

  return { typers, typingLabel };
}
