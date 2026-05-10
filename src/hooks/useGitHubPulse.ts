/**
 * useGitHubPulse — listens to the /api/agent-trace/pulse SSE stream and
 * surfaces github.notification events to the UI.
 *
 * The pulse stream is already proxied by serve.js → shre-router /v1/pulse.
 * Each GitHub CI event (ai_review, promote, deploy) arrives as:
 *   { type: 'github.notification', ts: string, data: GitHubNotification }
 */
import { useEffect, useCallback, useRef } from 'react';

export interface GitHubNotification {
  event: 'ai_review' | 'promote' | 'deploy';
  status: 'success' | 'failure' | 'warning' | 'info';
  title: string;
  body?: string;
  url?: string;
  env?: string;
  branch?: string;
  verdict?: string;
  actor?: string;
  repo?: string;
  ts: string;
}

type NotificationHandler = (n: GitHubNotification) => void;

export function useGitHubPulse(onNotification: NotificationHandler): void {
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource('/api/agent-trace/pulse');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as { type: string; data: GitHubNotification };
        if (evt.type === 'github.notification' && evt.data?.event) {
          handlerRef.current(evt.data);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectTimer.current = setTimeout(connect, 8000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}
