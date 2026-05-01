import { useEffect, useRef, useState } from 'react';
import type { CustomWorkspaceChannel } from '../workspace-custom-channels';

export interface UseWorkspaceCustomChannelsResult {
  customChannels: CustomWorkspaceChannel[];
  refreshWorkspaceCustomChannels: () => Promise<void>;
}

const CUSTOM_CHANNELS_WS_PATH = '/ws/notifications';
const CUSTOM_CHANNELS_SNAPSHOT_KEY = 'shre-workspace-custom-channels-snapshot';
const CUSTOM_CHANNELS_CHANGE_EVENT = 'shre-workspace-custom-channels-changed';
const POLL_MS = 30_000;

function normalizeChannels(channels: unknown): CustomWorkspaceChannel[] {
  if (!Array.isArray(channels)) return [];
  return channels
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<CustomWorkspaceChannel> & { channelId?: unknown };
      const channelId =
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim()
          : typeof row.channelId === 'string' && row.channelId.trim()
            ? row.channelId.trim()
            : '';
      const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : '';
      if (!channelId || !label) return null;
      return {
        id: channelId,
        label,
        description:
          typeof row.description === 'string' && row.description.trim()
            ? row.description.trim()
            : 'Custom workspace channel',
        mode:
          row.mode === 'code' ||
          row.mode === 'apps' ||
          row.mode === 'ops' ||
          row.mode === 'strategy'
            ? row.mode
            : 'assistant',
        accent: typeof row.accent === 'string' && row.accent.trim() ? row.accent.trim() : '#60a5fa',
        custom: true,
      } satisfies CustomWorkspaceChannel;
    })
    .filter((item): item is CustomWorkspaceChannel => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readSnapshot(): CustomWorkspaceChannel[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CHANNELS_SNAPSHOT_KEY);
    if (!raw) return [];
    return normalizeChannels(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeSnapshot(channels: CustomWorkspaceChannel[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(CUSTOM_CHANNELS_SNAPSHOT_KEY, JSON.stringify(channels));
  } catch {
    /* quota */
  }
}

function emitSnapshotChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CUSTOM_CHANNELS_CHANGE_EVENT));
}

export function loadWorkspaceCustomChannelsSnapshot(): CustomWorkspaceChannel[] {
  return readSnapshot();
}

export function useWorkspaceCustomChannels(): UseWorkspaceCustomChannelsResult {
  const [customChannels, setCustomChannels] = useState<CustomWorkspaceChannel[]>(() =>
    readSnapshot(),
  );
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const applyChannels = (channels: CustomWorkspaceChannel[]) => {
    const next = [...channels].sort((a, b) => a.label.localeCompare(b.label));
    setCustomChannels(next);
    writeSnapshot(next);
    emitSnapshotChange();
  };

  const refreshWorkspaceCustomChannels = async () => {
    try {
      const res = await fetch('/api/chat-custom-channels', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { channels?: unknown };
      applyChannels(normalizeChannels(data.channels || []));
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const snapshot = readSnapshot();
    if (snapshot.length > 0) {
      setCustomChannels(snapshot);
    }
    void refreshWorkspaceCustomChannels();

    const connectSocket = () => {
      if (!mountedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}${CUSTOM_CHANNELS_WS_PATH}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
            channels?: unknown;
          };
          if (parsed.type !== 'workspace.custom_channels.updated') return;
          applyChannels(normalizeChannels(parsed.channels || []));
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
            void refreshWorkspaceCustomChannels();
            connectSocket();
          }
        }, 5000);
      };
    };

    connectSocket();

    pollRef.current = window.setInterval(() => {
      void refreshWorkspaceCustomChannels();
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setCustomChannels(readSnapshot());
    };
    window.addEventListener('storage', handler);
    window.addEventListener(CUSTOM_CHANNELS_CHANGE_EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(CUSTOM_CHANNELS_CHANGE_EVENT, handler);
    };
  }, []);

  return { customChannels, refreshWorkspaceCustomChannels };
}
