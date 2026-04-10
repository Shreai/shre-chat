import { useState, useEffect, useCallback, useRef } from 'react';
const SEVERITY_PRIORITY = { critical: 3, warning: 2, info: 1 };
const MIN_SEVERITY = 2; // warning and above
export function useProactiveNotifications(enabled) {
    const [queue, setQueue] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    useEffect(() => {
        if (!enabled) {
            wsRef.current?.close();
            wsRef.current = null;
            setIsConnected(false);
            return;
        }
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}/ws/notifications`);
        wsRef.current = ws;
        ws.onopen = () => setIsConnected(true);
        ws.onclose = () => {
            setIsConnected(false);
            // Auto-reconnect after 5s
            if (enabled)
                setTimeout(() => {
                    if (wsRef.current === ws)
                        wsRef.current = null;
                }, 5000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const notif = {
                    id: data.id || crypto.randomUUID(),
                    type: data.type || 'unknown',
                    title: data.title || data.type || 'Notification',
                    body: data.body || null,
                    source: data.source || 'system',
                    severity: data.severity || data.type?.includes('failed') ? 'warning' : 'info',
                };
                const priority = SEVERITY_PRIORITY[notif.severity || 'info'] || 0;
                if (priority >= MIN_SEVERITY) {
                    setQueue((prev) => [...prev, notif]);
                }
            }
            catch {
                /* ignore parse errors */
            }
        };
        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [enabled]);
    const speakNext = useCallback(() => {
        let next = null;
        setQueue((prev) => {
            if (prev.length === 0)
                return prev;
            next = prev[0];
            return prev.slice(1);
        });
        return next;
    }, []);
    const clearQueue = useCallback(() => setQueue([]), []);
    return { pendingNotifs: queue, speakNext, clearQueue, isConnected };
}
