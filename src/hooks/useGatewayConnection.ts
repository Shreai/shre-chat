import { useState, useEffect } from "react";
import { connectGateway, onStateChange, onQueueChange, type WSStateInfo, type QueuedMessage } from "../gateway-ws";

export interface UseGatewayConnectionReturn {
  wsConnected: boolean;
  setWsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  wsFailed: boolean;
  setWsFailed: React.Dispatch<React.SetStateAction<boolean>>;
  wsStateInfo: WSStateInfo;
  setWsStateInfo: React.Dispatch<React.SetStateAction<WSStateInfo>>;
  wsReconnecting: boolean;
  setWsReconnecting: React.Dispatch<React.SetStateAction<boolean>>;
  wsBannerFlash: "connected" | null;
  setWsBannerFlash: React.Dispatch<React.SetStateAction<"connected" | null>>;
  offlineQueue: QueuedMessage[];
  setOfflineQueue: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
}

export function useGatewayConnection(
  subscribeStreamStall: () => () => void,
): UseGatewayConnectionReturn {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsFailed, setWsFailed] = useState(false);
  const [wsStateInfo, setWsStateInfo] = useState<WSStateInfo>({ state: "disconnected" });
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsBannerFlash, setWsBannerFlash] = useState<"connected" | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<QueuedMessage[]>([]);

  // Connect to OpenClaw WebSocket on mount + listen for state changes
  useEffect(() => {
    connectGateway()
      .then(() => setWsConnected(true))
      .catch(() => setWsConnected(false));

    const unsub = onStateChange((state, info) => {
      setWsConnected((prev) => { const next = state === "connected"; return prev === next ? prev : next; });
      setWsFailed((prev) => { const next = state === "failed"; return prev === next ? prev : next; });
      setWsStateInfo(info);
      setWsReconnecting(state === "connecting");

      // Flash "Connected" banner briefly on reconnect success
      if (state === "connected") {
        setWsBannerFlash("connected");
        setTimeout(() => setWsBannerFlash(null), 2000);
      }
    });

    // Subscribe to offline message queue changes
    const unsubQueue = onQueueChange((q) => setOfflineQueue(q));

    // Subscribe to stream stall/retry events
    const unsubStall = subscribeStreamStall();

    return () => { unsub(); unsubQueue(); unsubStall(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    wsConnected, setWsConnected,
    wsFailed, setWsFailed,
    wsStateInfo, setWsStateInfo,
    wsReconnecting, setWsReconnecting,
    wsBannerFlash, setWsBannerFlash,
    offlineQueue, setOfflineQueue,
  };
}
