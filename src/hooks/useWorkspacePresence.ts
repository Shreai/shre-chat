import { useEffect, useMemo, useRef, useState } from 'react';

export type WorkspacePresenceState = 'active' | 'away';

interface UseWorkspacePresenceOptions {
  userId: string;
}

const PRESENCE_KEY = 'shre-live-presence';
const PRESENCE_CHANNEL = 'shre-chat-presence';
const AWAY_AFTER_MS = 2 * 60_000;
const ACTIVE_BEATS_MS = 15_000;

export function useWorkspacePresence({ userId }: UseWorkspacePresenceOptions): WorkspacePresenceState {
  const [presence, setPresence] = useState<WorkspacePresenceState>('active');
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channel = useMemo(
    () => (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PRESENCE_CHANNEL) : null),
    [],
  );

  const publish = (next: WorkspacePresenceState) => {
    const payload = { userId, presence: next, ts: Date.now() };
    try {
      localStorage.setItem(PRESENCE_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
    channel?.postMessage(payload);
  };

  useEffect(() => {
    publish('active');

    const bumpActivity = () => {
      lastActivityRef.current = Date.now();
      if (presence !== 'active') setPresence('active');
      publish('active');
    };

    const goAwayIfIdle = () => {
      const idle = Date.now() - lastActivityRef.current;
      if (!document.hidden && idle < AWAY_AFTER_MS) {
        if (presence !== 'active') setPresence('active');
        publish('active');
        return;
      }
      if (presence !== 'away') setPresence('away');
      publish('away');
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PRESENCE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as { userId?: string; presence?: WorkspacePresenceState };
        if (parsed.userId === userId && parsed.presence) {
          setPresence(parsed.presence);
        }
      } catch {
        /* ignore */
      }
    };

    const onMessage = (event: MessageEvent) => {
      const parsed = event.data as { userId?: string; presence?: WorkspacePresenceState } | null;
      if (parsed?.userId === userId && parsed.presence) {
        setPresence(parsed.presence);
      }
    };

    const syncPresence = () => {
      if (document.hidden) {
        if (presence !== 'away') setPresence('away');
        publish('away');
        return;
      }
      goAwayIfIdle();
    };

    window.addEventListener('pointerdown', bumpActivity, { passive: true });
    window.addEventListener('keydown', bumpActivity, { passive: true });
    window.addEventListener('focus', bumpActivity);
    document.addEventListener('visibilitychange', syncPresence);
    window.addEventListener('storage', onStorage);
    channel?.addEventListener('message', onMessage);

    heartbeatRef.current = window.setInterval(() => {
      goAwayIfIdle();
    }, ACTIVE_BEATS_MS);

    return () => {
      window.removeEventListener('pointerdown', bumpActivity);
      window.removeEventListener('keydown', bumpActivity);
      window.removeEventListener('focus', bumpActivity);
      document.removeEventListener('visibilitychange', syncPresence);
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [channel, presence, userId]);

  return presence;
}
