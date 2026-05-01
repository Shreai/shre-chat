import { useEffect, useMemo, useRef, useState } from 'react';
import { buildThreadSummaries, type ThreadSummary } from '../workspace-social';
import type { Session } from '../store';

export interface UseWorkspaceThreadsOptions {
  sessions: Session[];
}

export interface UseWorkspaceThreadsResult {
  threads: ThreadSummary[];
  refreshWorkspaceThreads: () => Promise<void>;
}

const THREAD_SNAPSHOT_KEY = 'shre-workspace-thread-snapshot';
const THREAD_CHANGE_EVENT = 'shre-workspace-thread-changed';
const THREAD_WS_PATH = '/ws/notifications';
const POLL_MS = 25_000;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readThreadSnapshot(): ThreadSummary[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(THREAD_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ThreadSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeThreadSnapshot(threads: ThreadSummary[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(THREAD_SNAPSHOT_KEY, JSON.stringify(threads));
  } catch {
    /* quota */
  }
}

function emitThreadSnapshotChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(THREAD_CHANGE_EVENT));
}

export function loadWorkspaceThreadSnapshot(): ThreadSummary[] {
  return readThreadSnapshot();
}

export function useWorkspaceThreads({
  sessions,
}: UseWorkspaceThreadsOptions): UseWorkspaceThreadsResult {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const refreshWorkspaceThreads = async () => {
    try {
      const res = await fetch('/api/chat-threads', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: ThreadSummary[] };
      const next = Array.isArray(data.threads) ? data.threads : buildThreadSummaries(sessions);
      setThreads(next);
      writeThreadSnapshot(next);
      emitThreadSnapshotChange();
    } catch {
      const fallback = buildThreadSummaries(sessions);
      setThreads(fallback);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const snapshot = readThreadSnapshot();
    if (snapshot.length > 0) setThreads(snapshot);
    void refreshWorkspaceThreads();

    const connect = () => {
      if (!mountedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}${THREAD_WS_PATH}`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
          };
          if (parsed.type !== 'workspace.threads.updated') return;
          void refreshWorkspaceThreads();
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
            void refreshWorkspaceThreads();
            connect();
          }
        }, 5000);
      };
    };

    connect();
    pollRef.current = window.setInterval(() => {
      void refreshWorkspaceThreads();
    }, POLL_MS);
    const handleSnapshot = () => setThreads(loadWorkspaceThreadSnapshot());
    window.addEventListener(THREAD_CHANGE_EVENT, handleSnapshot);

    return () => {
      mountedRef.current = false;
      window.removeEventListener(THREAD_CHANGE_EVENT, handleSnapshot);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessions]);

  return useMemo(
    () => ({
      threads,
      refreshWorkspaceThreads,
    }),
    [threads],
  );
}
