import { useState, useEffect } from 'react';
import { type WSStateInfo, type QueuedMessage } from '../gateway-ws';

export interface UseGatewayConnectionReturn {
  wsConnected: boolean;
  setWsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  wsFailed: boolean;
  setWsFailed: React.Dispatch<React.SetStateAction<boolean>>;
  wsStateInfo: WSStateInfo;
  setWsStateInfo: React.Dispatch<React.SetStateAction<WSStateInfo>>;
  wsReconnecting: boolean;
  setWsReconnecting: React.Dispatch<React.SetStateAction<boolean>>;
  wsBannerFlash: 'connected' | null;
  setWsBannerFlash: React.Dispatch<React.SetStateAction<'connected' | null>>;
  offlineQueue: QueuedMessage[];
  setOfflineQueue: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
}

export function useGatewayConnection(
  subscribeStreamStall: () => () => void,
): UseGatewayConnectionReturn {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsFailed, setWsFailed] = useState(false);
  const [wsStateInfo, setWsStateInfo] = useState<WSStateInfo>({ state: 'disconnected' });
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsBannerFlash, setWsBannerFlash] = useState<'connected' | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<QueuedMessage[]>([]);

  // Gateway WS disabled — chat now uses HTTP/SSE, with direct mode able to run locally.
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
