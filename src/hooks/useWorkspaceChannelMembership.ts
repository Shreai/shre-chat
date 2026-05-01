import { useEffect, useMemo, useRef, useState } from 'react';

export interface WorkspaceChannelMember {
  memberId: string;
  displayName: string;
  memberKind: 'agent' | 'user';
  createdAt?: number;
  updatedAt?: number;
}

export type WorkspaceChannelMembersByChannelId = Record<string, WorkspaceChannelMember[]>;

export interface UseWorkspaceChannelMembershipOptions {
  userId: string;
  displayName?: string;
  activeChannelId?: string | null;
}

export interface UseWorkspaceChannelMembershipResult {
  workspaceChannelMembersByChannelId: WorkspaceChannelMembersByChannelId;
  refreshWorkspaceChannelMemberships: () => Promise<void>;
}

const MEMBERSHIP_WS_PATH = '/ws/notifications';
const MEMBERSHIP_SNAPSHOT_KEY = 'shre-workspace-channel-membership-snapshot';
const MEMBERSHIP_CHANGE_EVENT = 'shre-workspace-channel-membership-changed';
const POLL_MS = 30_000;

function normalizeMembers(members: unknown): WorkspaceChannelMember[] {
  if (!Array.isArray(members)) return [];
  return members
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<WorkspaceChannelMember> & {
        memberId?: unknown;
        displayName?: unknown;
      };
      const memberId = typeof row.memberId === 'string' ? row.memberId.trim() : '';
      if (!memberId) return null;
      const displayName =
        typeof row.displayName === 'string' && row.displayName.trim()
          ? row.displayName.trim()
          : memberId;
      return {
        memberId,
        displayName,
        memberKind: row.memberKind === 'user' ? 'user' : 'agent',
        createdAt: typeof row.createdAt === 'number' ? row.createdAt : undefined,
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : undefined,
      } satisfies WorkspaceChannelMember;
    })
    .filter((item): item is WorkspaceChannelMember => Boolean(item))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function normalizeChannelMap(data: unknown): WorkspaceChannelMembersByChannelId {
  const next: WorkspaceChannelMembersByChannelId = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return next;
  for (const [channelId, members] of Object.entries(data as Record<string, unknown>)) {
    next[channelId] = normalizeMembers(members);
  }
  return next;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readMembershipSnapshot(): WorkspaceChannelMembersByChannelId {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(MEMBERSHIP_SNAPSHOT_KEY);
    if (!raw) return {};
    return normalizeChannelMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeMembershipSnapshot(snapshot: WorkspaceChannelMembersByChannelId): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(MEMBERSHIP_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

function emitMembershipSnapshotChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEMBERSHIP_CHANGE_EVENT));
}

export function loadWorkspaceChannelMembershipSnapshot(): WorkspaceChannelMembersByChannelId {
  return readMembershipSnapshot();
}

export function useWorkspaceChannelMembership({
  userId,
  displayName,
  activeChannelId,
}: UseWorkspaceChannelMembershipOptions): UseWorkspaceChannelMembershipResult {
  const [workspaceChannelMembersByChannelId, setWorkspaceChannelMembersByChannelId] =
    useState<WorkspaceChannelMembersByChannelId>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedChannelRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const applyChannelSnapshot = (channelId: string, members: WorkspaceChannelMember[]) => {
    setWorkspaceChannelMembersByChannelId((prev) => {
      const next = {
        ...prev,
        [channelId]: [...members].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      };
      writeMembershipSnapshot(next);
      emitMembershipSnapshotChange();
      return next;
    });
  };

  const refreshWorkspaceChannelMemberships = async () => {
    try {
      const res = await fetch('/api/chat-channel-memberships', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { channels?: Record<string, unknown> };
      const next = normalizeChannelMap(data.channels || {});
      setWorkspaceChannelMembersByChannelId(next);
      writeMembershipSnapshot(next);
      emitMembershipSnapshotChange();
    } catch {
      /* offline */
    }
  };

  const joinWorkspaceChannel = async (channelId: string) => {
    if (!channelId) return;
    if (joinedChannelRef.current === channelId) return;
    joinedChannelRef.current = channelId;
    try {
      const res = await fetch('/api/chat-channel-memberships/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { channelId?: string; members?: unknown };
      if (data.channelId) {
        applyChannelSnapshot(data.channelId, normalizeMembers(data.members || []));
      }
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const snapshot = readMembershipSnapshot();
    if (Object.keys(snapshot).length > 0) {
      setWorkspaceChannelMembersByChannelId(snapshot);
    }
    void refreshWorkspaceChannelMemberships();

    const connectMembershipSocket = () => {
      if (!mountedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}${MEMBERSHIP_WS_PATH}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
            channelId?: string;
            members?: unknown;
          };
          if (parsed.type !== 'workspace.channel.membership.updated' || !parsed.channelId) return;
          applyChannelSnapshot(parsed.channelId, normalizeMembers(parsed.members || []));
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
            void refreshWorkspaceChannelMemberships();
            connectMembershipSocket();
          }
        }, 5000);
      };
    };

    connectMembershipSocket();

    pollRef.current = window.setInterval(() => {
      void refreshWorkspaceChannelMemberships();
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
    if (!activeChannelId) {
      joinedChannelRef.current = null;
      return;
    }
    void joinWorkspaceChannel(activeChannelId);
  }, [activeChannelId, userId]);

  return useMemo(
    () => ({
      workspaceChannelMembersByChannelId,
      refreshWorkspaceChannelMemberships,
    }),
    [workspaceChannelMembersByChannelId],
  );
}
