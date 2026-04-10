/**
 * useRealtimeVoice — Full-duplex voice conversation via WebRTC
 *
 * Connects to shre-router /v1/voice/session which returns:
 * - PersonaPlex WebSocket URL (if Shadow PC available, 70ms latency)
 * - OpenAI Realtime ephemeral token (fallback, ~300ms latency)
 *
 * This replaces the turn-based record→transcribe→send→TTS flow
 * with a single continuous audio stream (like talking to a human).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
const ROUTER_BASE = import.meta.env.VITE_ROUTER_URL || '';
export function useRealtimeVoice() {
    const [state, setState] = useState('idle');
    const [provider, setProvider] = useState(null);
    const [transcript, setTranscript] = useState('');
    const [aiTranscript, setAiTranscript] = useState('');
    const [latency, setLatency] = useState('');
    const pcRef = useRef(null);
    const dcRef = useRef(null);
    const audioRef = useRef(null);
    const streamRef = useRef(null);
    const cleanup = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioRef.current) {
            audioRef.current.srcObject = null;
        }
        dcRef.current = null;
        setState('idle');
        setProvider(null);
    }, []);
    // Cleanup on unmount
    useEffect(() => cleanup, [cleanup]);
    const startRealtime = useCallback(async (persona = 'shre') => {
        try {
            setState('connecting');
            // 1. Request voice session from shre-router
            const res = await fetch(`${ROUTER_BASE}/v1/voice/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ persona }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error || `Voice session failed: ${res.status}`);
            }
            const session = await res.json();
            setProvider(session.provider);
            setLatency(session.latencyEstimate || '');
            if (session.provider === 'personaplex' && session.websocketUrl) {
                // PersonaPlex: direct WebSocket full-duplex (Shadow PC)
                await connectPersonaPlex(session.websocketUrl);
            }
            else if (session.client_secret?.value) {
                // OpenAI Realtime: WebRTC with ephemeral token
                await connectOpenAIRealtime(session.client_secret.value);
            }
            else {
                throw new Error('No valid voice session returned');
            }
        }
        catch (error) {
            console.error('[RealtimeVoice] Start failed:', error);
            setState('error');
            setTimeout(() => setState('idle'), 3000);
        }
    }, []);
    /** Connect to PersonaPlex via WebSocket (full-duplex, 70ms) */
    const connectPersonaPlex = async (wsUrl) => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            setState('listening');
            console.log('[RealtimeVoice] Connected to PersonaPlex');
            // Set up audio capture → send PCM to PersonaPlex
            const audioCtx = new AudioContext({ sampleRate: 16000 });
            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
                if (ws.readyState === WebSocket.OPEN) {
                    const pcmData = e.inputBuffer.getChannelData(0);
                    const int16 = new Int16Array(pcmData.length);
                    for (let i = 0; i < pcmData.length; i++) {
                        int16[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
                    }
                    ws.send(int16.buffer);
                }
            };
            source.connect(processor);
            processor.connect(audioCtx.destination);
        };
        ws.onmessage = (event) => {
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                // Audio data from PersonaPlex — play it
                setState('speaking');
                const audioBlob = event.data instanceof Blob ? event.data : new Blob([event.data]);
                const url = URL.createObjectURL(audioBlob);
                const audio = new Audio(url);
                audio.play().then(() => {
                    audio.onended = () => {
                        URL.revokeObjectURL(url);
                        setState('listening');
                    };
                });
            }
            else {
                // JSON events (transcripts, status)
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'transcript' && msg.speaker === 'user') {
                        setTranscript(msg.text);
                    }
                    if (msg.type === 'transcript' && msg.speaker === 'agent') {
                        setAiTranscript(msg.text);
                    }
                }
                catch { /* binary data */ }
            }
        };
        ws.onerror = () => {
            setState('error');
            cleanup();
        };
        ws.onclose = () => {
            cleanup();
        };
    };
    /** Connect to OpenAI Realtime via WebRTC (fallback, ~300ms) */
    const connectOpenAIRealtime = async (ephemeralKey) => {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        // AI audio output
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        pc.ontrack = (event) => {
            audio.srcObject = event.streams[0];
        };
        // Microphone input
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        // Data channel for transcripts
        const dc = pc.createDataChannel('oai-events');
        dcRef.current = dc;
        dc.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'conversation.item.input_audio_transcription.completed') {
                    setTranscript(msg.transcript || '');
                }
                if (msg.type === 'response.audio_transcript.done') {
                    setAiTranscript(msg.transcript || '');
                }
                if (msg.type === 'input_audio_buffer.speech_started') {
                    setState('listening');
                }
                if (msg.type === 'response.audio.delta') {
                    setState('speaking');
                }
            }
            catch { /* ignore */ }
        };
        dc.onopen = () => setState('listening');
        // WebRTC offer/answer via OpenAI
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ephemeralKey}`,
                'Content-Type': 'application/sdp',
            },
            body: offer.sdp,
        });
        if (!sdpRes.ok)
            throw new Error('WebRTC negotiation failed');
        await pc.setRemoteDescription({
            type: 'answer',
            sdp: await sdpRes.text(),
        });
    };
    const stopRealtime = useCallback(() => {
        cleanup();
    }, [cleanup]);
    return {
        state,
        provider,
        transcript,
        aiTranscript,
        latency,
        startRealtime,
        stopRealtime,
        isActive: state !== 'idle' && state !== 'error',
    };
}
