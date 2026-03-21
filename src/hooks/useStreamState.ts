import { useState, useRef, useEffect } from "react";
import { onStreamStall, type StreamStallState } from "../gateway-ws";

export interface UseStreamStateReturn {
  streamStall: StreamStallState | null;
  setStreamStall: React.Dispatch<React.SetStateAction<StreamStallState | null>>;
  stallCountdown: number;
  setStallCountdown: React.Dispatch<React.SetStateAction<number>>;
  streamElapsed: number;
  setStreamElapsed: React.Dispatch<React.SetStateAction<number>>;
  streamPhase: "connecting" | "thinking" | "planning" | "tool_use" | "writing" | "compacting" | "done" | "attention" | "error";
  setStreamPhase: React.Dispatch<React.SetStateAction<"connecting" | "thinking" | "planning" | "tool_use" | "writing" | "compacting" | "done" | "attention" | "error">>;
  compacting: boolean;
  setCompacting: React.Dispatch<React.SetStateAction<boolean>>;
  activeToolName: string | null;
  setActiveToolName: React.Dispatch<React.SetStateAction<string | null>>;
  pendingApproval: { approvalId: string; tool: string; input: any; reason: string } | null;
  setPendingApproval: React.Dispatch<React.SetStateAction<{ approvalId: string; tool: string; input: any; reason: string } | null>>;
  streamStartRef: React.MutableRefObject<number>;
  sendTimeRef: React.MutableRefObject<number>;
  firstTokenTimeRef: React.MutableRefObject<number>;
  subscribeStreamStall: () => () => void;
}

export function useStreamState(streaming: boolean): UseStreamStateReturn {
  const [streamStall, setStreamStall] = useState<StreamStallState | null>(null);
  const [stallCountdown, setStallCountdown] = useState(0);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [streamPhase, setStreamPhase] = useState<"connecting" | "thinking" | "planning" | "tool_use" | "writing" | "compacting" | "done" | "attention" | "error">("connecting");
  const [compacting, setCompacting] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{ approvalId: string; tool: string; input: any; reason: string } | null>(null);
  const streamStartRef = useRef(0);
  const sendTimeRef = useRef(0);
  const firstTokenTimeRef = useRef(0);

  // Clear stream stall indicator when streaming ends
  useEffect(() => {
    if (!streaming) { setStreamStall(null); setStallCountdown(0); }
  }, [streaming]);

  // Elapsed timer during streaming
  useEffect(() => {
    if (!streaming) { setStreamElapsed(0); return; }
    setStreamElapsed(0);
    const iv = setInterval(() => setStreamElapsed((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [streaming]);

  // Returns unsubscribe function for stream stall listener
  const subscribeStreamStall = (): (() => void) => {
    return onStreamStall((info) => {
      setStreamStall(info.state === "clear" ? null : info.state);
      if (info.state === "stalling" && info.elapsedMs) {
        const remaining = Math.max(0, Math.ceil((90_000 - info.elapsedMs) / 1000));
        setStallCountdown(remaining);
      } else {
        setStallCountdown(0);
      }
    });
  };

  return {
    streamStall, setStreamStall,
    stallCountdown, setStallCountdown,
    streamElapsed, setStreamElapsed,
    streamPhase, setStreamPhase,
    compacting, setCompacting,
    activeToolName, setActiveToolName,
    pendingApproval, setPendingApproval,
    streamStartRef, sendTimeRef, firstTokenTimeRef,
    subscribeStreamStall,
  };
}
