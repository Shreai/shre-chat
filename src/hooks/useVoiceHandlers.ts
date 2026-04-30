import { useState, useRef, useCallback, useEffect } from 'react';
import { playVoiceCue, MAX_RECORDING_SECONDS } from '../chat-utils';
import { getOrRequestStream } from './useVoiceRecording';
import type { TTSProvider } from '../preferences-store';
import { getSpeechLocale } from '../i18n';
import { pickBrowserVoice, prepareSpeechText } from '../voice/voice-utils';
import { isDevSafeMode } from '../env';

export interface UseVoiceHandlersParams {
  setInput: (v: string) => void;
  setIsRecording: (v: boolean) => void;
  setVoicePhase: React.Dispatch<
    React.SetStateAction<'idle' | 'waiting' | 'recording' | 'transcribing'>
  >;
  setInterimTranscript: (v: string) => void;
  setAudioLevel: (v: number) => void;
  setRecordingDuration: (v: number) => void;
  setIsSpeaking: (v: boolean) => void;
  isSpeaking: boolean;
  voiceSessionIdRef: React.MutableRefObject<number>;
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  audioCtxRef: React.MutableRefObject<AudioContext | null>;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  levelRafRef: React.MutableRefObject<number | null>;
  recordingTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  interimTranscriptRef: React.MutableRefObject<string>;
  audioLevelRawRef: React.MutableRefObject<number>;
  levelThrottleRef: React.MutableRefObject<number>;
  silenceStartRef: React.MutableRefObject<number>;
  lastSpokenMsgRef: React.MutableRefObject<string>;
  SILENCE_THRESHOLD: number;
  SILENCE_TIMEOUT_MS: number;
  clearInterimAfter: (ms: number) => void;
  cleanupAudioLevel: () => void;
  releaseCachedStream: () => void;
  isHandsFreeRef?: React.MutableRefObject<boolean>;
  isHandsFree: boolean;
  isRecording: boolean;
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  ttsVoice: string;
  ttsProvider: TTSProvider;
  streaming: boolean;
  messages: { role: string; content: string; timestamp?: number; meta?: Record<string, string> }[];
  handleSendRef: React.MutableRefObject<() => void>;
}

export interface UseVoiceHandlersReturn {
  startRecording: () => Promise<void>;
  stopRecording: (forceRelease?: boolean) => Promise<void>;
  voicePendingSend: string;
  setVoicePendingSend: (v: string) => void;
  recognitionRef: React.MutableRefObject<SpeechRecognition | null>;
  wakeListenerRef: React.MutableRefObject<SpeechRecognition | null>;
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  audioChunksRef: React.MutableRefObject<Blob[]>;
  stopRecordingRef: React.MutableRefObject<(() => void) | null>;
  skipWakeRef: React.MutableRefObject<boolean>;
  ttsAbortRef: React.MutableRefObject<AbortController | null>;
  ttsAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

export function useVoiceHandlers(params: UseVoiceHandlersParams): UseVoiceHandlersReturn {
  if (isDevSafeMode()) {
    return {
      startRecording: async () => void 0,
      stopRecording: async () => void 0,
      voicePendingSend: '',
      setVoicePendingSend: () => void 0,
      recognitionRef: { current: null },
      wakeListenerRef: { current: null },
      mediaRecorderRef: { current: null },
      audioChunksRef: { current: [] },
      stopRecordingRef: { current: null },
      skipWakeRef: { current: false },
      ttsAbortRef: { current: null },
      ttsAudioRef: { current: null },
    };
  }
  const {
    setInput,
    setIsRecording,
    setVoicePhase,
    setInterimTranscript,
    setAudioLevel,
    setRecordingDuration,
    setIsSpeaking,
    isSpeaking,
    voiceSessionIdRef,
    voiceFinalTranscriptRef,
    audioCtxRef,
    analyserRef,
    levelRafRef,
    recordingTimerRef,
    interimTranscriptRef,
    audioLevelRawRef,
    levelThrottleRef,
    silenceStartRef,
    lastSpokenMsgRef,
    SILENCE_THRESHOLD,
    SILENCE_TIMEOUT_MS,
    clearInterimAfter,
    cleanupAudioLevel,
    releaseCachedStream,
    isHandsFree,
    isRecording,
    voiceMode,
    setVoiceMode,
    ttsVoice,
    ttsProvider,
    streaming,
    messages,
    handleSendRef,
  } = params;

  const [voicePendingSend, setVoicePendingSend] = useState('');
  const lastVoiceSentRef = useRef<number>(0); // track session ID of last voice-sent msg
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeListenerRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const skipWakeRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const recordingInProgressRef = useRef(false);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Microphone access is not available in this browser.');
      return;
    }

    // Barge-in: if user starts speaking (manually or via wake/VAD), stop current AI speech
    if (isSpeaking || ttsAudioRef.current) {
      window.dispatchEvent(new CustomEvent('shre-barge-in'));
    }

    // Prevent concurrent startRecording calls (double-tap race)
    if (recordingInProgressRef.current) return;
    recordingInProgressRef.current = true;

    // ... existing startRecording logic ...

    // Clean up previous sessions
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {
        void _;
      }
      recognitionRef.current = null;
    }
    if (wakeListenerRef.current) {
      try {
        wakeListenerRef.current.abort();
      } catch (_) {
        void _;
      }
      wakeListenerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {
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
      : window.SpeechRecognition ||
        ((window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition as
          | { new (): SpeechRecognition }
          | undefined);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // Skip wake-word listener and begin capture immediately
    setVoicePhase('recording');
    setInterimTranscript('Recording...');
    window.dispatchEvent(new CustomEvent('shre-voice-start'));
    beginCapture();

    async function beginCapture() {
      playVoiceCue('start');
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      setVoicePhase('recording');
      setInterimTranscript('');
      setRecordingDuration(0);

      let stream: MediaStream;
      try {
        stream = await getOrRequestStream();
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        const msg =
          e.name === 'NotAllowedError'
            ? "Microphone blocked — tap the lock icon in your browser's address bar to allow mic access, then try again."
            : e.name === 'NotFoundError'
              ? 'No microphone found. Please connect a microphone and try again.'
              : 'Microphone error: ' + (e.message || 'unknown');
        setInterimTranscript(msg);
        clearInterimAfter(4000);
        setIsRecording(false);
        setVoicePhase('idle');
        recordingInProgressRef.current = false;
        return;
      }

      // Audio level analyser
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
          for (let i = 0; i < 32; i++) sum += dataArray[i] * dataArray[i];
          audioLevelRawRef.current = Math.sqrt(sum / 32) / 255;
          const now = performance.now();
          if (now - levelThrottleRef.current > 66) {
            levelThrottleRef.current = now;
            setAudioLevel(audioLevelRawRef.current);
          }
          if (audioLevelRawRef.current < SILENCE_THRESHOLD) {
            if (!silenceStartRef.current) silenceStartRef.current = now;
            else if (
              now - silenceStartRef.current > SILENCE_TIMEOUT_MS &&
              Date.now() - startTime > 2000
            ) {
              stopRecordingRef.current?.();
              return;
            }
          } else {
            silenceStartRef.current = 0;
          }
          levelRafRef.current = requestAnimationFrame(tick);
        }
        levelRafRef.current = requestAnimationFrame(tick);
      } catch {
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
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      // Mark tracks as active for the visibilitychange backup listener
      stream.getTracks().forEach((t) => {
        (t as MediaStreamTrack & { _shreRecording?: boolean })._shreRecording = true;
      });

      if (SpeechRec) {
        const rec = new SpeechRec() as SpeechRecognition & {
          onstart: (() => void) | null;
        };
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = getSpeechLocale();
        voiceFinalTranscriptRef.current = '';
        let hasStarted = false;
        let stopped = false;

        rec.onstart = () => {
          hasStarted = true;
        };
        rec.onresult = (e: SpeechRecognitionEvent) => {
          if (stopped) return;
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal)
              voiceFinalTranscriptRef.current += e.results[i][0].transcript + ' ';
            else interim += e.results[i][0].transcript;
          }
          const combined = (voiceFinalTranscriptRef.current + interim).toLowerCase();
          if (
            combined.includes('shre send') ||
            combined.includes('shrey send') ||
            combined.includes('shray send')
          ) {
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
        rec.onerror = (e: Event & { error?: string }) => {
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
            if (recognitionRef.current === rec) recognitionRef.current = null;
            return;
          }
          // Only restart if we're still actively recording (MediaRecorder is active)
          // Guard against infinite restart loop if MediaRecorder is in a bad state
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording' &&
            restartCount < MAX_SR_RESTARTS
          ) {
            restartCount++;
            setTimeout(() => {
              try {
                if (!stopped && mediaRecorderRef.current?.state === 'recording') {
                  rec.start();
                }
              } catch (_) {
                void _;
              }
            }, 100);
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
        } catch {
          /* Whisper handles it */
        }
        // If SpeechRecognition produces nothing after 3s, show feedback so user knows audio is still capturing
        setTimeout(() => {
          if (
            recognitionRef.current === rec &&
            !voiceFinalTranscriptRef.current &&
            !interimTranscriptRef.current
          ) {
            setInterimTranscript('Capturing audio...');
          }
        }, 3000);
      }
    }
  }, [
    voiceSessionIdRef,
    voiceFinalTranscriptRef,
    setInput,
    setInterimTranscript,
    setVoicePendingSend,
    setIsRecording,
    setVoicePhase,
    setRecordingDuration,
    audioCtxRef,
    analyserRef,
    silenceStartRef,
    audioLevelRawRef,
    levelThrottleRef,
    setAudioLevel,
    levelRafRef,
    recordingTimerRef,
    interimTranscriptRef,
    clearInterimAfter,
    SILENCE_THRESHOLD,
    SILENCE_TIMEOUT_MS,
    isSpeaking,
    ttsAudioRef,
  ]);

  const stopRecording = useCallback(
    async (forceRelease?: boolean) => {
      playVoiceCue('stop');
      if (navigator.vibrate) navigator.vibrate(30);
      cleanupAudioLevel();

      // Stop SpeechRecognition — text is already live in the textarea
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {
          void _;
        }
        recognitionRef.current = null;
      }

      // Stop MediaRecorder and collect audio chunks for Whisper fallback
      const recorder = mediaRecorderRef.current;
      const audioChunks = [...audioChunksRef.current];
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (_) {
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
      } else if (audioChunks.length > 0) {
        // If we're about to transcribe from audio chunks, clear input immediately
        // so the user sees "Processing..." or empty state instead of stale text.
        setInput('');
        setInterimTranscript('Processing...');
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
          formData.append('model', 'whisper-1');
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
        } catch {
          /* Whisper unavailable — no transcript */
        }
        setInterimTranscript('');
      }
      audioChunksRef.current = [];

      setIsRecording(false);
      setVoicePhase('idle');
      recordingInProgressRef.current = false;
      window.dispatchEvent(new CustomEvent('shre-voice-stop'));

      // Clear active recording flag on cached stream tracks
      const tracks = (mediaRecorderRef.current?.stream || recorder?.stream)?.getTracks();
      tracks?.forEach((t) => {
        (t as MediaStreamTrack & { _shreRecording?: boolean })._shreRecording = false;
      });

      if (!currentText) {
        setInterimTranscript('');
      }
      // Release the cached MediaStream when not in hands-free mode or if forced
      if (!voiceMode || forceRelease) {
        releaseCachedStream();
      }

      // Auto-send: if we have text after recording, send it automatically
      if (currentText) {
        setVoicePendingSend(currentText);
      }
    },
    [
      cleanupAudioLevel,
      releaseCachedStream,
      voiceMode,
      voiceFinalTranscriptRef,
      setInput,
      setInterimTranscript,
      setVoicePhase,
      setIsRecording,
      setVoicePendingSend,
    ],
  );

  // Keep ref in sync
  stopRecordingRef.current = stopRecording;

  // Auto-send after voice transcription completes
  useEffect(() => {
    if (!voicePendingSend) return;
    const sessionAtSend = voiceSessionIdRef.current;
    setVoicePendingSend('');
    const timer = setTimeout(() => {
      if (voiceSessionIdRef.current !== sessionAtSend) return;
      const textarea = document.getElementById('shre-chat-textarea') as HTMLTextAreaElement;
      if (textarea && textarea.value.trim()) {
        lastVoiceSentRef.current = sessionAtSend;
        handleSendRef.current();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [voicePendingSend, handleSendRef, voiceSessionIdRef]);

  // Auto-restart recording when AI finishes speaking if voiceMode is active
  useEffect(() => {
    if (voiceMode && !isSpeaking && !isRecording && !streaming) {
      // Check if the last assistant message ended with a question
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      const isQuestion = lastMsg?.role === 'assistant' && /[?¿]\s*$/.test(lastMsg.content || '');

      const timer = setTimeout(() => {
        if (voiceMode && !isSpeaking && !isRecording && !streaming) {
          if (isQuestion) {
            setVoicePhase('waiting'); // Visually invite the user to speak
          }
          startRecording();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [voiceMode, isSpeaking, isRecording, streaming, startRecording, messages, setVoicePhase]);

  // Cleanup speech recognition + audio analyser on unmount
  useEffect(() => {
    const ctxRef = audioCtxRef;
    const rafRef = levelRafRef;
    const timerRef = recordingTimerRef;
    const recRef = recognitionRef;
    const wakeRef = wakeListenerRef;

    return () => {
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch (_) {
          void _;
        }
        recRef.current = null;
      }
      if (wakeRef.current) {
        try {
          wakeRef.current.abort();
        } catch (_) {
          void _;
        }
        wakeRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
      // Release the cached MediaStream on full unmount to free hardware
      // The page-level beforeunload listener also handles this as a safety net
      releaseCachedStream();
    };
  }, [
    audioCtxRef,
    levelRafRef,
    recordingTimerRef,
    recognitionRef,
    wakeListenerRef,
    releaseCachedStream,
  ]);

  // Hands-free wake word listener — "shre shre"
  useEffect(() => {
    if (!isHandsFree) {
      if (wakeListenerRef.current) {
        try {
          wakeListenerRef.current.abort();
        } catch (_) {
          void _;
        }
        wakeListenerRef.current = null;
      }
      return;
    }
    const SpeechRec =
      window.SpeechRecognition ||
      ((window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition as
        | typeof window.SpeechRecognition
        | undefined);
    if (!SpeechRec) {
      // iOS Safari doesn't support SpeechRecognition — use silence-based auto-listen instead.
      // Start recording immediately when hands-free is enabled (user taps to talk, silence auto-stops).
      setInterimTranscript('Hands-free: tap mic or start speaking');
      return;
    }
    let active = true;

    function startWakeListener() {
      if (!active) return;
      if (recognitionRef.current || mediaRecorderRef.current) return;
      const w = new SpeechRec!() as SpeechRecognition;
      w.continuous = false;
      w.interimResults = true;
      w.lang = getSpeechLocale();
      w.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.toLowerCase().trim();
          if (
            text.includes('shre shre') ||
            text.includes('shrey shrey') ||
            text.includes('shray shray')
          ) {
            try {
              w.stop();
            } catch (_) {
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
      } catch {
        setTimeout(startWakeListener, 1000);
      }
    }
    setTimeout(startWakeListener, 200);
    return () => {
      active = false;
      if (wakeListenerRef.current) {
        try {
          wakeListenerRef.current.abort();
        } catch (_) {
          void _;
        }
        wakeListenerRef.current = null;
      }
    };
  }, [
    isHandsFree,
    isRecording,
    startRecording,
    setInterimTranscript,
    recognitionRef,
    mediaRecorderRef,
    wakeListenerRef,
    skipWakeRef,
  ]);

  // Auto-speak: when voice mode is on, auto-TTS the latest assistant response
  useEffect(() => {
    if (streaming || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant' || !lastMsg.content) return;

    // Trigger TTS if in voiceMode OR if this assistant message is a response to a voice-sent input
    // We check both the ref and optional metadata for robustness.
    const isVoiceTurn =
      voiceMode ||
      lastVoiceSentRef.current === voiceSessionIdRef.current ||
      lastMsg.meta?.voice === 'true';
    if (!isVoiceTurn) return;

    const msgKey = `${lastMsg.timestamp}-${lastMsg.content.length}`;
    if (lastSpokenMsgRef.current === msgKey) return;
    lastSpokenMsgRef.current = msgKey;

    // Extract spoken portion only (before --- separator, if voice mode added one)
    let spokenContent = lastMsg.content;
    const separatorIdx = spokenContent.indexOf('\n---\n');
    if (separatorIdx !== -1) {
      spokenContent = spokenContent.slice(0, separatorIdx);
    }
    const plainText = prepareSpeechText(spokenContent);
    if (!plainText) return;

    const abortCtrl = ttsAbortRef;
    abortCtrl.current?.abort();
    const controller = new AbortController();
    abortCtrl.current = controller;
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
        if (err.name === 'AbortError') return;
        setIsSpeaking(false);
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(plainText.slice(0, 1000));
          utter.rate = 0.95;
          utter.pitch = 1.0;
          utter.lang = 'en-US';
          const browserVoice = pickBrowserVoice();
          if (browserVoice) utter.voice = browserVoice;
          utter.onend = () => setIsSpeaking(false);
          utter.onerror = () => setIsSpeaking(false);
          setIsSpeaking(true);
          window.speechSynthesis.speak(utter);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    voiceMode,
    streaming,
    messages,
    ttsVoice,
    ttsProvider,
    setIsSpeaking,
    lastSpokenMsgRef,
    voiceSessionIdRef,
    ttsAbortRef,
    ttsAudioRef,
  ]);

  // Handle barge-in events (interruption)
  useEffect(() => {
    const handleBargeIn = () => {
      // 1. Stop current TTS
      ttsAbortRef.current?.abort();
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);

      // 2. Abort current AI generation
      handleSendRef.current?.(); // Note: we should actually have an 'abort' function here
      // But based on available props, we'll dispatch a stop event
      window.dispatchEvent(new CustomEvent('shre-stop-generation'));
    };

    window.addEventListener('shre-barge-in', handleBargeIn);
    return () => window.removeEventListener('shre-barge-in', handleBargeIn);
  }, [setIsSpeaking, handleSendRef, ttsAbortRef, ttsAudioRef]);

  // Monitor for barge-in speech while AI is speaking
  useEffect(() => {
    if (!isSpeaking || !voiceMode || isRecording) return;

    let active = true;
    let monitorStream: MediaStream | null = null;

    async function setupBargeInMonitor() {
      try {
        monitorStream = await getOrRequestStream();
        if (!active) return;

        const bargeThreshold = SILENCE_THRESHOLD * 2;
        let consecutiveFrames = 0;
        const REQUIRED_FRAMES = 3;

        const AudioCtx =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) throw new Error('AudioContext not supported');
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(monitorStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const poll = () => {
          if (!active || !isSpeaking) {
            ctx.close().catch(() => {});
            return;
          }
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < 32; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / 32) / 255;

          if (rms >= bargeThreshold) {
            consecutiveFrames++;
            if (consecutiveFrames >= REQUIRED_FRAMES) {
              window.dispatchEvent(new CustomEvent('shre-barge-in'));
              // Immediately start recording to catch the interruption
              startRecording();
              return;
            }
          } else {
            consecutiveFrames = 0;
          }
          requestAnimationFrame(poll);
        };
        poll();
      } catch (err) {
        console.warn('[barge-in] monitor setup failed:', err);
      }
    }

    setupBargeInMonitor();
    return () => {
      active = false;
    };
  }, [isSpeaking, voiceMode, isRecording, SILENCE_THRESHOLD, startRecording]);

  // Auto-enable voice mode when user uses voice input
  useEffect(() => {
    if (voicePendingSend && !voiceMode) {
      setVoiceMode(true);
    }
  }, [voicePendingSend, voiceMode, setVoiceMode]);

  // Ensure mic hardware is released when hands-free mode is turned off and not recording
  useEffect(() => {
    if (!voiceMode && !isRecording) {
      releaseCachedStream();
    }
  }, [voiceMode, isRecording, releaseCachedStream]);

  useEffect(() => {
    (window as Window & { isSpeaking?: boolean }).isSpeaking = isSpeaking;
  }, [isSpeaking]);

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
