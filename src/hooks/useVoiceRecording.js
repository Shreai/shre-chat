import { useState, useRef, useEffect, useCallback } from 'react';
import { usePreferences } from '../preferences-store';
// Module-level cached MediaStream to avoid repeated permission prompts on mobile
let _cachedStream = null;
/** Get or request a MediaStream, reusing the cached one if tracks are still live. */
export async function getOrRequestStream() {
    if (_cachedStream) {
        const alive = _cachedStream.getAudioTracks().some((t) => t.readyState === 'live');
        if (alive)
            return _cachedStream;
        // Tracks died — clean up
        _cachedStream.getTracks().forEach((t) => t.stop());
        _cachedStream = null;
    }
    // Try with preferred constraints first, fall back to basic { audio: true }
    // Some Android devices reject echoCancellation/noiseSuppression constraints
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
    }
    catch (constraintErr) {
        if (constraintErr?.name === 'OverconstrainedError' || constraintErr?.name === 'NotReadableError') {
            console.warn('[mic] Constraint error, retrying with basic audio:', constraintErr.message);
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        else {
            throw constraintErr;
        }
    }
    _cachedStream = stream;
    return stream;
}
/** Release the cached stream (call on full cleanup). */
export function releaseCachedStream() {
    if (_cachedStream) {
        _cachedStream.getTracks().forEach((t) => t.stop());
        _cachedStream = null;
    }
}
// Release cached stream on page unload to free hardware
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => releaseCachedStream(), { once: true });
    // Also release on visibilitychange to 'hidden' (mobile tab close / app switch)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && _cachedStream) {
            // Only release if nobody is actively recording
            const tracks = _cachedStream.getAudioTracks();
            const anyActive = tracks.some((t) => t.readyState === 'live' && t.enabled && t._shreRecording);
            if (!anyActive)
                releaseCachedStream();
        }
    });
}
export function useVoiceRecording() {
    const [isRecording, setIsRecording] = useState(false);
    const [voicePhase, setVoicePhase] = useState('idle');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [audioLevel, setAudioLevel] = useState(0);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voiceAnnouncement, setVoiceAnnouncement] = useState('');
    const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false);
    const [isHandsFree, setIsHandsFree] = useState(false);
    const voiceMode = usePreferences((s) => s.voiceMode);
    const setVoiceMode = usePreferences((s) => s.setVoiceMode);
    const ttsVoice = usePreferences((s) => s.ttsVoice);
    const setTtsVoice = usePreferences((s) => s.setTtsVoice);
    const ttsProvider = usePreferences((s) => s.ttsProvider);
    const setTtsProvider = usePreferences((s) => s.setTtsProvider);
    const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const [speechSupported] = useState(() => hasSpeechRecognition || !!navigator.mediaDevices?.getUserMedia);
    // Refs
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const levelRafRef = useRef(0);
    const recordingTimerRef = useRef(null);
    const interimTranscriptRef = useRef('');
    interimTranscriptRef.current = interimTranscript;
    const audioLevelRawRef = useRef(0);
    const voiceSessionIdRef = useRef(0);
    const voiceFinalTranscriptRef = useRef('');
    const levelThrottleRef = useRef(0);
    const silenceStartRef = useRef(0);
    const isHandsFreeRef = useRef(false);
    isHandsFreeRef.current = isHandsFree;
    const lastSpokenMsgRef = useRef('');
    const SILENCE_THRESHOLD = 0.02;
    const SILENCE_TIMEOUT_MS = 5000;
    // Voice start/stop event listeners
    useEffect(() => {
        const onStart = () => setVoiceAssistantOpen(true);
        const onStop = () => setVoiceAssistantOpen(false);
        window.addEventListener('shre-voice-start', onStart);
        window.addEventListener('shre-voice-stop', onStop);
        return () => {
            window.removeEventListener('shre-voice-start', onStart);
            window.removeEventListener('shre-voice-stop', onStop);
        };
    }, []);
    // ARIA live region announcements for voice phase changes
    useEffect(() => {
        const announcements = {
            idle: '',
            waiting: 'Ready. Tap to talk.',
            recording: 'Recording. Tap to send.',
            transcribing: 'Processing your voice.',
        };
        setVoiceAnnouncement(announcements[voicePhase] || '');
    }, [voicePhase]);
    useEffect(() => {
        if (isSpeaking)
            setVoiceAnnouncement('Speaking response.');
    }, [isSpeaking]);
    // Clear interim transcript after delay
    const clearInterimAfter = useCallback((ms) => {
        const sid = voiceSessionIdRef.current;
        setTimeout(() => {
            if (voiceSessionIdRef.current === sid)
                setInterimTranscript('');
        }, ms);
    }, []);
    // Clean up audio analyser + timer
    const cleanupAudioLevel = useCallback(() => {
        if (levelRafRef.current) {
            cancelAnimationFrame(levelRafRef.current);
            levelRafRef.current = 0;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(0);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        setRecordingDuration(0);
    }, []);
    return {
        isRecording,
        setIsRecording,
        voicePhase,
        setVoicePhase,
        interimTranscript,
        setInterimTranscript,
        audioLevel,
        setAudioLevel,
        recordingDuration,
        setRecordingDuration,
        isSpeaking,
        setIsSpeaking,
        voiceAnnouncement,
        setVoiceAnnouncement,
        voiceAssistantOpen,
        setVoiceAssistantOpen,
        isHandsFree,
        setIsHandsFree,
        voiceMode,
        setVoiceMode,
        ttsVoice,
        setTtsVoice,
        ttsProvider,
        setTtsProvider,
        speechSupported,
        analyserRef,
        audioCtxRef,
        levelRafRef,
        recordingTimerRef,
        interimTranscriptRef,
        audioLevelRawRef,
        voiceSessionIdRef,
        voiceFinalTranscriptRef,
        levelThrottleRef,
        silenceStartRef,
        isHandsFreeRef,
        lastSpokenMsgRef,
        SILENCE_THRESHOLD,
        SILENCE_TIMEOUT_MS,
        hasSpeechRecognition,
        clearInterimAfter,
        cleanupAudioLevel,
    };
}
