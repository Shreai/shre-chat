import { useState, useEffect } from 'react';
export function useGatewayConnection(subscribeStreamStall) {
    const [wsConnected, setWsConnected] = useState(false);
    const [wsFailed, setWsFailed] = useState(false);
    const [wsStateInfo, setWsStateInfo] = useState({ state: 'disconnected' });
    const [wsReconnecting, setWsReconnecting] = useState(false);
    const [wsBannerFlash, setWsBannerFlash] = useState(null);
    const [offlineQueue, setOfflineQueue] = useState([]);
    // Gateway WS disabled — all chat routes through shre-router via HTTP/SSE.
    // Only subscribe to stream stall events (HTTP-based).
    useEffect(() => {
        const unsubStall = subscribeStreamStall();
        return () => {
            unsubStall();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return {
        wsConnected,
        setWsConnected,
        wsFailed,
        setWsFailed,
        wsStateInfo,
        setWsStateInfo,
        wsReconnecting,
        setWsReconnecting,
        wsBannerFlash,
        setWsBannerFlash,
        offlineQueue,
        setOfflineQueue,
    };
}
