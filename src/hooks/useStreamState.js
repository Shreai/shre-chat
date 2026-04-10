import { useState, useRef, useEffect } from 'react';
import { onStreamStall } from '../gateway-ws';
export function useStreamState(streaming) {
    const [streamStall, setStreamStall] = useState(null);
    const [stallCountdown, setStallCountdown] = useState(0);
    const [streamElapsed, setStreamElapsed] = useState(0);
    const [streamPhase, setStreamPhase] = useState('connecting');
    const [compacting, setCompacting] = useState(false);
    const [activeToolName, setActiveToolName] = useState(null);
    const [pendingApproval, setPendingApproval] = useState(null);
    const streamStartRef = useRef(0);
    const sendTimeRef = useRef(0);
    const firstTokenTimeRef = useRef(0);
    // Clear stream stall indicator when streaming ends
    useEffect(() => {
        if (!streaming) {
            setStreamStall(null);
            setStallCountdown(0);
        }
    }, [streaming]);
    // Elapsed timer during streaming
    useEffect(() => {
        if (!streaming) {
            setStreamElapsed(0);
            return;
        }
        setStreamElapsed(0);
        const iv = setInterval(() => setStreamElapsed((s) => s + 1), 1000);
        return () => clearInterval(iv);
    }, [streaming]);
    // Returns unsubscribe function for stream stall listener
    const subscribeStreamStall = () => {
        return onStreamStall((info) => {
            setStreamStall(info.state === 'clear' ? null : info.state);
            if (info.state === 'stalling' && info.elapsedMs) {
                const remaining = Math.max(0, Math.ceil((90_000 - info.elapsedMs) / 1000));
                setStallCountdown(remaining);
            }
            else {
                setStallCountdown(0);
            }
        });
    };
    return {
        streamStall,
        setStreamStall,
        stallCountdown,
        setStallCountdown,
        streamElapsed,
        setStreamElapsed,
        streamPhase,
        setStreamPhase,
        compacting,
        setCompacting,
        activeToolName,
        setActiveToolName,
        pendingApproval,
        setPendingApproval,
        streamStartRef,
        sendTimeRef,
        firstTokenTimeRef,
        subscribeStreamStall,
    };
}
