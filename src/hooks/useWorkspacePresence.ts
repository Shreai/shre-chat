import { useEffect, useRef, useState } from 'react';

export type WorkspacePresenceState = 'active' | 'away';

interface UseWorkspacePresenceOptions {
  userId: string;
}

const PRESENCE_KEY = 'shre-live-presence';
const PRESENCE_CHANNEL = 'shre-chat-presence';
const AWAY_AFTER_MS = 2 * 60_000;
const HEARTBEAT_MS = 15_000;

export function useWorkspacePresence({ userId }: UseWorkspacePresenceOptions): WorkspacePresenceState {
  const [presence, setPresence] = useState<WorkspacePresenceState>('active');
  const lastActivityRef = useRef(Date.now());
  const presenceRef = useRef<WorkspacePresenceState>('active');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PRESENCE_CHANNEL) : null;

    const publish = (next: WorkspacePresenceState) => {
      const payload = { userId, presence: next, ts: Date.now() };
      try {
        localStorage.setItem(PRESENCE_KEY, JSON.stringify(payload));
      } catch {
        /* quota */
      }
      channel?.postMessage(payload);
    };

    const setPresenceIfNeeded = (next: WorkspacePresenceState) => {
      if (presenceRef.current !== next) {
        presenceRef.current = next;
        setPresence(next);
      }
    };

    const goActive = () => {
      lastActivityRef.current = Date.now();
      setPresenceIfNeeded('active');
      publish('active');
    };

    const goAwayIfIdle = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (document.hidden || idleMs >= AWAY_AFTER_MS) {
        setPresenceIfNeeded('away');
        publish('away');
      } else {
        setPresenceIfNeeded('active');
        publish('active');
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PRESENCE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as { userId?: string; presence?: WorkspacePresenceState };
        if (parsed.userId === userId && parsed.presence) {
          setPresenceIfNeeded(parsed.presence);
        }
      } catch {
        /* ignore */
      }
    };

    const onMessage = (event: MessageEvent) => {
      const parsed = event.data as { userId?: string; presence?: WorkspacePresenceState } | null;
      if (parsed?.userId === userId && parsed.presence) {
        setPresenceIfNeeded(parsed.presence);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        setPresenceIfNeeded('away');
        publish('away');
      } else {
        goActive();
      }
    };

    publish('active');

    window.addEventListener('pointerdown', goActive, { passive: true });
    window.addEventListener('keydown', goActive, { passive: true });
    window.addEventListener('focus', goActive);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', onStorage);
    channel?.addEventListener('message', onMessage);

    heartbeatRef.current = window.setInterval(goAwayIfIdle, HEARTBEAT_MS);

    return () => {
      window.removeEventListener('pointerdown', goActive);
      window.removeEventListener('keydown', goActive);
      window.removeEventListener('focus', goActive);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [userId]);

  return presence;
}
