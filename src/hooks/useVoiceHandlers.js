import { useState, useRef, useCallback, useEffect } from 'react';
import { playVoiceCue, MAX_RECORDING_SECONDS } from '../chat-utils';
import { getOrRequestStream, releaseCachedStream } from './useVoiceRecording';
import { getSpeechLocale } from '../i18n';
export function useVoiceHandlers(params) {
    const { setInput, setIsRecording, setVoicePhase, setInterimTranscript, setAudioLevel, setRecordingDuration, setIsSpeaking, voiceSessionIdRef, voiceFinalTranscriptRef, audioCtxRef, analyserRef, levelRafRef, recordingTimerRef, interimTranscriptRef, audioLevelRawRef, levelThrottleRef, silenceStartRef, lastSpokenMsgRef, isHandsFreeRef, SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS, clearInterimAfter, cleanupAudioLevel, isHandsFree, isRecording, voiceMode, setVoiceMode, ttsVoice, ttsProvider, streaming, messages, handleSendRef, } = params;
    const [voicePendingSend, setVoicePendingSend] = useState('');
    const recognitionRef = useRef(null);
    const wakeListenerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const stopRecordingRef = useRef(null);
    const skipWakeRef = useRef(false);
    const ttsAbortRef = useRef(null);
    const ttsAudioRef = useRef(null);
    const recordingInProgressRef = useRef(false);
    const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Microphone access is not available in this browser.');
            return;
        }
        // Prevent concurrent startRecording calls (double-tap race)
        if (recordingInProgressRef.current)
            return;
        recordingInProgressRef.current = true;
        // Clean up previous sessions
        if (recognitionRef.current) {
            try {
                recognitionRef.current.abort();
            }
            catch (_) {
                void _;
            }
            recognitionRef.current = null;
        }
        if (wakeListenerRef.current) {
            try {
                wakeListenerRef.current.abort();
            }
            catch (_) {
                void _;
            }
            wakeListenerRef.current = null;
        }
        if (mediaRecorderRef.current) {
            try {
                mediaRecorderRef.current.stop();
            }
            catch (_) {
                void _;
            }
            mediaRecorderRef.current = null;
        }
        audioChunksRef.current = [];
        // Clear ALL voice state for a completely fresh recording
        voiceSessionIdRef.current += 1;
        voiceFinalTranscriptRef.current = '';
        setInput('');
        setInterimTranscript('');
        setVoicePendingSend('');
        setIsRecording(true);
        // On Android, SpeechRecognition is unreliable (garbled results, cuts off early).
        // Skip it entirely and use Whisper via MediaRecorder for clean transcription.
        const isAndroid = /Android/i.test(navigator.userAgent);
        const SpeechRec = isAndroid
            ? null
            : window.SpeechRecognition || window.webkitSpeechRecognition;
        // Haptic feedback
        if (navigator.vibrate)
            navigator.vibrate(50);
        const wakeAlreadyDetected = skipWakeRef.current;
        skipWakeRef.current = false;
        // Always skip wake word on manual mic press — wake word is only for hands-free mode
        if (wakeAlreadyDetected || !SpeechRec || !isHandsFreeRef.current) {
            setVoicePhase('recording');
            setInterimTranscript('Recording...');
            beginCapture();
            return;
        }
        setVoicePhase('waiting');
        setInterimTranscript('Say "shre shre" to start...');
        const wakeRec = new SpeechRec();
        wakeRec.continuous = true;
        wakeRec.interimResults = true;
        wakeRec.lang = getSpeechLocale();
        let wakeDetected = false;
        wakeRec.onresult = (e) => {
            if (wakeDetected)
                return;
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const text = e.results[i][0].transcript.toLowerCase().trim();
                if (text.includes('shre shre') ||
                    text.includes('shrey shrey') ||
                    text.includes('shray shray') ||
                    text.includes('shree shree') ||
                    text.includes('shri shri')) {
                    wakeDetected = true;
                    playVoiceCue('wake');
                    try {
                        wakeRec.stop();
                    }
                    catch (_) {
                        void _;
                    }
                    recognitionRef.current = null;
                    beginCapture();
                    return;
                }
            }
        };
        wakeRec.onend = () => {
            if (!wakeDetected && recognitionRef.current === wakeRec) {
                try {
                    wakeRec.start();
                }
                catch {
                    recognitionRef.current = null;
                }
            }
        };
        wakeRec.onerror = () => {
            if (!wakeDetected && recognitionRef.current === wakeRec) {
                setTimeout(() => {
                    try {
                        wakeRec.start();
                    }
                    catch {
                        recognitionRef.current = null;
                    }
                }, 500);
            }
        };
        try {
            wakeRec.start();
            recognitionRef.current = wakeRec;
        }
        catch {
            beginCapture();
        }
        async function beginCapture() {
            playVoiceCue('start');
            if (navigator.vibrate)
                navigator.vibrate([50, 30, 50]);
            setVoicePhase('recording');
            setInterimTranscript('');
            setRecordingDuration(0);
            let stream;
            try {
                stream = await getOrRequestStream();
            }
            catch (err) {
                const msg = err?.name === 'NotAllowedError'
                    ? "Microphone blocked — tap the lock icon in your browser's address bar to allow mic access, then try again."
                    : err?.name === 'NotFoundError'
                        ? 'No microphone found. Please connect a microphone and try again.'
                        : 'Microphone error: ' + (err?.message || 'unknown');
                setInterimTranscript(msg);
                clearInterimAfter(4000);
                setIsRecording(false);
                setVoicePhase('idle');
                recordingInProgressRef.current = false;
                return;
            }
            // Audio level analyser
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.6;
                source.connect(analyser);
                audioCtxRef.current = ctx;
                analyserRef.current = analyser;
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                silenceStartRef.current = 0;
                function tick() {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < 32; i++)
                        sum += dataArray[i] * dataArray[i];
                    audioLevelRawRef.current = Math.sqrt(sum / 32) / 255;
                    const now = performance.now();
                    if (now - levelThrottleRef.current > 66) {
                        levelThrottleRef.current = now;
                        setAudioLevel(audioLevelRawRef.current);
                    }
                    if (audioLevelRawRef.current < SILENCE_THRESHOLD) {
                        if (!silenceStartRef.current)
                            silenceStartRef.current = now;
                        else if (now - silenceStartRef.current > SILENCE_TIMEOUT_MS &&
                            Date.now() - startTime > 2000) {
                            stopRecordingRef.current?.();
                            return;
                        }
                    }
                    else {
                        silenceStartRef.current = 0;
                    }
                    levelRafRef.current = requestAnimationFrame(tick);
                }
                levelRafRef.current = requestAnimationFrame(tick);
            }
            catch {
                /* audio level is best-effort */
            }
            const startTime = Date.now();
            recordingTimerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                setRecordingDuration(elapsed);
                if (elapsed >= MAX_RECORDING_SECONDS) {
                    stopRecordingRef.current?.();
                }
            }, 1000);
            const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : isSafari
                        ? 'audio/mp4'
                        : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            audioChunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0)
                    audioChunksRef.current.push(e.data);
            };
            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            if (SpeechRec) {
                const rec = new SpeechRec();
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = getSpeechLocale();
                voiceFinalTranscriptRef.current = '';
                let hasStarted = false;
                let stopped = false;
                rec.onstart = () => {
                    hasStarted = true;
                };
                rec.onresult = (e) => {
                    if (stopped)
                        return;
                    let interim = '';
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        if (e.results[i].isFinal)
                            voiceFinalTranscriptRef.current += e.results[i][0].transcript + ' ';
                        else
                            interim += e.results[i][0].transcript;
                    }
                    const combined = (voiceFinalTranscriptRef.current + interim).toLowerCase();
                    if (combined.includes('shre send') ||
                        combined.includes('shrey send') ||
                        combined.includes('shray send')) {
                        voiceFinalTranscriptRef.current = voiceFinalTranscriptRef.current
                            .replace(/\b(shre|shrey|shray)\s+send\b/gi, '')
                            .trim();
                        stopped = true;
                        setInput(voiceFinalTranscriptRef.current);
                        stopRecordingRef.current?.();
                        return;
                    }
                    const live = (voiceFinalTranscriptRef.current + interim).trim();
                    setInput(live);
                };
                rec.onerror = (e) => {
                    // Show user that browser speech failed but Whisper is still capturing
                    const errType = e?.error || 'unknown';
                    if (errType === 'no-speech' || errType === 'network' || errType === 'audio-capture') {
                        if (!voiceFinalTranscriptRef.current) {
                            setInterimTranscript('Recording audio for transcription...');
                        }
                    }
                };
                let restartCount = 0;
                const MAX_SR_RESTARTS = 20; // prevent infinite restart loops
                rec.onend = () => {
                    // Never restart if recording was stopped or recognition was cleared
                    if (!hasStarted || stopped || recognitionRef.current !== rec) {
                        if (recognitionRef.current === rec)
                            recognitionRef.current = null;
                        return;
                    }
                    // Only restart if we're still actively recording (MediaRecorder is active)
                    // Guard against infinite restart loop if MediaRecorder is in a bad state
                    if (mediaRecorderRef.current &&
                        mediaRecorderRef.current.state === 'recording' &&
                        restartCount < MAX_SR_RESTARTS) {
                        restartCount++;
                        try {
                            rec.start();
                            return;
                        }
                        catch (_) {
                            void _;
                        }
                    }
                    recognitionRef.current = null;
                };
                const origStop = rec.stop.bind(rec);
                rec.stop = () => {
                    stopped = true;
                    origStop();
                };
                try {
                    rec.start();
                    recognitionRef.current = rec;
                }
                catch {
                    /* Whisper handles it */
                }
                // If SpeechRecognition produces nothing after 3s, show feedback so user knows audio is still capturing
                setTimeout(() => {
                    if (recognitionRef.current === rec &&
                        !voiceFinalTranscriptRef.current &&
                        !interimTranscriptRef.current) {
                        setInterimTranscript('Capturing audio...');
                    }
                }, 3000);
            }
        }
    }, []);
    const stopRecording = useCallback(async () => {
        playVoiceCue('stop');
        if (navigator.vibrate)
            navigator.vibrate(30);
        cleanupAudioLevel();
        // Stop SpeechRecognition — text is already live in the textarea
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            }
            catch (_) {
                void _;
            }
            recognitionRef.current = null;
        }
        // Stop MediaRecorder and collect audio chunks for Whisper fallback
        const recorder = mediaRecorderRef.current;
        let audioChunks = [...audioChunksRef.current];
        if (recorder && recorder.state !== 'inactive') {
            try {
                recorder.stop();
            }
            catch (_) {
                void _;
            }
            mediaRecorderRef.current = null;
        }
        // Clean wake word artifacts from whatever text is already in the input
        let currentText = voiceFinalTranscriptRef.current.trim();
        if (currentText) {
            currentText = currentText
                .replace(/\b(shre|shrey|shray)\s+(shre|shrey|shray)\b/gi, '')
                .replace(/\b(shre|shrey|shray)\s+send\b/gi, '')
                .trim();
            setInput(currentText);
            setInterimTranscript('');
        }
        // Whisper fallback: ONLY when SpeechRecognition produced NO text (e.g. iOS Safari).
        // If SR already filled currentText, this block is skipped — no double-processing.
        if (!currentText && audioChunks.length > 0) {
            setVoicePhase('transcribing');
            setInterimTranscript('Transcribing...');
            try {
                const mimeType = audioChunks[0]?.type || 'audio/webm';
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const blob = new Blob(audioChunks, { type: mimeType });
                const formData = new FormData();
                formData.append('file', blob, `voice.${ext}`);
                const res = await fetch('/api/transcribe', {
                    method: 'POST',
                    body: formData,
                });
                if (res.ok) {
                    const data = await res.json();
                    currentText = (data.text || '').trim();
                    if (currentText) {
                        setInput(currentText);
                    }
                }
            }
            catch {
                /* Whisper unavailable — no transcript */
            }
            setInterimTranscript('');
        }
        audioChunksRef.current = [];
        setIsRecording(false);
        setVoicePhase('idle');
        recordingInProgressRef.current = false;
        if (!currentText) {
            setInterimTranscript('');
        }
        // Auto-send: if we have text after recording, send it automatically
        if (currentText) {
            setVoicePendingSend(currentText);
        }
    }, [cleanupAudioLevel]);
    // Keep ref in sync
    stopRecordingRef.current = stopRecording;
    // Auto-send after voice transcription completes
    useEffect(() => {
        if (!voicePendingSend)
            return;
        const sessionAtSend = voiceSessionIdRef.current;
        setVoicePendingSend('');
        const timer = setTimeout(() => {
            if (voiceSessionIdRef.current !== sessionAtSend)
                return;
            const textarea = document.getElementById('shre-chat-textarea');
            if (textarea && textarea.value.trim()) {
                handleSendRef.current();
            }
        }, 50);
        return () => clearTimeout(timer);
    }, [voicePendingSend]);
    // Cleanup speech recognition + audio analyser on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                }
                catch (_) {
                    void _;
                }
                recognitionRef.current = null;
            }
            if (wakeListenerRef.current) {
                try {
                    wakeListenerRef.current.abort();
                }
                catch (_) {
                    void _;
                }
                wakeListenerRef.current = null;
            }
            if (levelRafRef.current)
                cancelAnimationFrame(levelRafRef.current);
            if (audioCtxRef.current)
                audioCtxRef.current.close().catch(() => { });
            if (recordingTimerRef.current)
                clearInterval(recordingTimerRef.current);
            // Release the cached MediaStream on full unmount to free hardware
            // The page-level beforeunload listener also handles this as a safety net
            releaseCachedStream();
        };
    }, []);
    // Hands-free wake word listener — "shre shre"
    useEffect(() => {
        if (!isHandsFree) {
            if (wakeListenerRef.current) {
                try {
                    wakeListenerRef.current.abort();
                }
                catch (_) {
                    void _;
                }
                wakeListenerRef.current = null;
            }
            return;
        }
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            // iOS Safari doesn't support SpeechRecognition — use silence-based auto-listen instead.
            // Start recording immediately when hands-free is enabled (user taps to talk, silence auto-stops).
            setInterimTranscript('Hands-free: tap mic or start speaking');
            return;
        }
        let active = true;
        function startWakeListener() {
            if (!active)
                return;
            if (recognitionRef.current || mediaRecorderRef.current)
                return;
            const w = new SpeechRec();
            w.continuous = false;
            w.interimResults = true;
            w.lang = getSpeechLocale();
            w.onresult = (e) => {
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const text = e.results[i][0].transcript.toLowerCase().trim();
                    if (text.includes('shre shre') ||
                        text.includes('shrey shrey') ||
                        text.includes('shray shray')) {
                        try {
                            w.stop();
                        }
                        catch (_) {
                            void _;
                        }
                        wakeListenerRef.current = null;
                        skipWakeRef.current = true;
                        startRecording();
                        return;
                    }
                }
            };
            w.onend = () => {
                if (active && wakeListenerRef.current === w) {
                    wakeListenerRef.current = null;
                    setTimeout(startWakeListener, 300);
                }
            };
            w.onerror = () => {
                if (active && wakeListenerRef.current === w) {
                    wakeListenerRef.current = null;
                    setTimeout(startWakeListener, 1000);
                }
            };
            try {
                w.start();
                wakeListenerRef.current = w;
            }
            catch {
                setTimeout(startWakeListener, 1000);
            }
        }
        setTimeout(startWakeListener, 200);
        return () => {
            active = false;
            if (wakeListenerRef.current) {
                try {
                    wakeListenerRef.current.abort();
                }
                catch (_) {
                    void _;
                }
                wakeListenerRef.current = null;
            }
        };
    }, [isHandsFree, isRecording, startRecording]);
    // Auto-speak: when voice mode is on, auto-TTS the latest assistant response
    useEffect(() => {
        if (!voiceMode || streaming)
            return;
        if (messages.length === 0)
            return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant' || !lastMsg.content)
            return;
        const msgKey = `${lastMsg.timestamp}-${lastMsg.content.length}`;
        if (lastSpokenMsgRef.current === msgKey)
            return;
        lastSpokenMsgRef.current = msgKey;
        // Extract spoken portion only (before --- separator, if voice mode added one)
        let spokenContent = lastMsg.content;
        const separatorIdx = spokenContent.indexOf('\n---\n');
        if (separatorIdx !== -1) {
            spokenContent = spokenContent.slice(0, separatorIdx);
        }
        const plainText = spokenContent
            .replace(/```[\s\S]*?```/g, ' code block omitted ')
            .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/#{1,6}\s+/g, '')
            .replace(/[*_~]{1,3}/g, '')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 4096);
        if (!plainText)
            return;
        ttsAbortRef.current?.abort();
        const controller = new AbortController();
        ttsAbortRef.current = controller;
        setIsSpeaking(true);
        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: plainText, voice: ttsVoice, provider: ttsProvider || 'auto' }),
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('TTS failed'))))
            .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            ttsAudioRef.current = audio;
            audio.onended = () => {
                URL.revokeObjectURL(url);
                setIsSpeaking(false);
                ttsAudioRef.current = null;
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                setIsSpeaking(false);
                ttsAudioRef.current = null;
            };
            audio.play().catch(() => {
                URL.revokeObjectURL(url);
                setIsSpeaking(false);
            });
        })
            .catch((err) => {
            if (err.name === 'AbortError')
                return;
            setIsSpeaking(false);
            if (window.speechSynthesis) {
                const utter = new SpeechSynthesisUtterance(plainText.slice(0, 1000));
                utter.rate = 1.0;
                utter.onend = () => setIsSpeaking(false);
                utter.onerror = () => setIsSpeaking(false);
                setIsSpeaking(true);
                window.speechSynthesis.speak(utter);
            }
        });
        return () => {
            controller.abort();
        };
    }, [voiceMode, streaming, messages, ttsVoice, ttsProvider]);
    // Auto-enable voice mode when user uses voice input
    useEffect(() => {
        if (voicePendingSend && !voiceMode) {
            setVoiceMode(true);
        }
    }, [voicePendingSend, voiceMode]);
    return {
        startRecording,
        stopRecording,
        voicePendingSend,
        setVoicePendingSend,
        recognitionRef,
        wakeListenerRef,
        mediaRecorderRef,
        audioChunksRef,
        stopRecordingRef,
        skipWakeRef,
        ttsAbortRef,
        ttsAudioRef,
    };
}
