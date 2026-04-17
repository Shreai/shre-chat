/**
 * useAnomalyStream
 *
 * Connects to the RapidRMS live anomaly SSE stream and surfaces critical anomalies
 * as browser notifications / toast banners.
 *
 * Features:
 * - Connects to GET /v1/anomalies/stream?workspaceId=X
 * - Re-connects on disconnect with exponential backoff (max 60s)
 * - Shows a toast/banner on critical anomalies via anomaly state
 * - Exposes { anomalies, criticalCount, dismiss } for UI consumption
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export interface Anomaly {
  type: 'low_stock' | 'labor_overrun' | 'sales_drop' | 'high_voids' | 'clear';
  severity: 'warning' | 'critical' | 'info';
  message: string;
  data?: Record<string, unknown>;
  detectedAt?: string;
}

interface UseAnomalyStreamOptions {
  /** Workspace ID (e.g. "store-RapidRMS2"). If falsy, stream is disabled. */
  workspaceId?: string | null;
  /** Base URL for the rapidrms live server. Defaults to localhost:8899. */
  baseUrl?: string;
  /** Called when a critical anomaly arrives (for custom toast/notification logic). */
  onCritical?: (anomaly: Anomaly) => void;
}

interface UseAnomalyStreamResult {
  /** Current active anomalies (empty when all clear). */
  anomalies: Anomaly[];
  /** Number of critical-severity anomalies. */
  criticalCount: number;
  /** Whether we're currently connected to the SSE stream. */
  connected: boolean;
  /** Dismiss (hide) all current anomalies from the UI (does not clear server state). */
  dismiss: () => void;
}

const RAPIDRMS_SSE_BASE =
  typeof window !== 'undefined'
    ? (window as Window & { __RAPIDRMS_URL__?: string }).__RAPIDRMS_URL__ ||
      (import.meta as { env?: { VITE_RAPIDRMS_URL?: string } }).env?.VITE_RAPIDRMS_URL ||
      `${window.location.origin}/api/rapidrms`
    : '';

/**
 * Try to discover the active workspace from the RapidRMS session endpoint.
 * Falls back gracefully if the server is unreachable.
 */
async function discoverWorkspaceId(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/session`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { companyId?: string; ok?: boolean };
    return data.companyId ?? null;
  } catch {
    return null;
  }
}

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

export function useAnomalyStream({
  workspaceId: workspaceIdProp,
  baseUrl = RAPIDRMS_SSE_BASE,
  onCritical,
}: UseAnomalyStreamOptions = {}): UseAnomalyStreamResult {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [connected, setConnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Resolved workspace: prop > localStorage > discovered from session endpoint
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    workspaceIdProp ?? localStorage.getItem('rapidrms-workspace'),
  );

  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onCriticalRef = useRef(onCritical);
  onCriticalRef.current = onCritical;

  // Auto-discover workspaceId from RapidRMS session if not provided
  useEffect(() => {
    if (workspaceId) return; // already have it
    discoverWorkspaceId(baseUrl).then((id) => {
      if (id && mountedRef.current) {
        setWorkspaceId(id);
        localStorage.setItem('rapidrms-workspace', id);
      }
    });
  }, [baseUrl, workspaceId]);

  const connect = useCallback(() => {
    if (!workspaceId || !mountedRef.current) return;

    // Clean up previous connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const url = `${baseUrl}/v1/anomalies/stream?workspaceId=${encodeURIComponent(workspaceId)}`;

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch (err) {
      // EventSource not available (SSR or old browser) — silently bail
      return;
    }

    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      backoffRef.current = MIN_BACKOFF_MS; // reset backoff on success
      setConnected(true);
    };

    es.onmessage = (event) => {
      if (!mountedRef.current) return;
      let anomaly: Anomaly;
      try {
        anomaly = JSON.parse(event.data) as Anomaly;
      } catch {
        return;
      }

      if (anomaly.type === 'clear') {
        setAnomalies([]);
        setDismissed(false);
        return;
      }

      setDismissed(false);
      setAnomalies((prev) => {
        // Dedup: replace existing entry with same type+severity
        const key = `${anomaly.type}:${anomaly.severity}`;
        const filtered = prev.filter((a) => `${a.type}:${a.severity}` !== key);
        return [...filtered, anomaly];
      });

      if (anomaly.severity === 'critical' && onCriticalRef.current) {
        onCriticalRef.current(anomaly);
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [workspaceId, baseUrl]);

  useEffect(() => {
    mountedRef.current = true;
    if (workspaceId) connect();

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [connect, workspaceId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const visibleAnomalies = dismissed ? [] : anomalies;
  const criticalCount = visibleAnomalies.filter((a) => a.severity === 'critical').length;

  return { anomalies: visibleAnomalies, criticalCount, connected, dismiss };
}
