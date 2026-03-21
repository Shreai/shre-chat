import { useState, useRef, useCallback, useEffect } from "react";
import { playVoiceCue, MAX_RECORDING_SECONDS } from "../chat-utils";

export interface UseVoiceHandlersParams {
  setInput: (v: string) => void;
  setIsRecording: (v: boolean) => void;
  setVoicePhase: (v: string) => void;
  setInterimTranscript: (v: string) => void;
  setAudioLevel: (v: number) => void;
  setRecordingDuration: (v: number) => void;
  setIsSpeaking: (v: boolean) => void;
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
  isHandsFreeRef: React.MutableRefObject<boolean>;
  SILENCE_THRESHOLD: number;
  SILENCE_TIMEOUT_MS: number;
  clearInterimAfter: (ms: number) => void;
  cleanupAudioLevel: () => void;
  isHandsFree: boolean;
  isRecording: boolean;
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  ttsVoice: string;
  streaming: boolean;
  messages: { role: string; content: string; timestamp?: number }[];
  handleSendRef: React.MutableRefObject<() => void>;
}

export interface UseVoiceHandlersReturn {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
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
  const {
    setInput, setIsRecording, setVoicePhase, setInterimTranscript,
    setAudioLevel, setRecordingDuration, setIsSpeaking,
    voiceSessionIdRef, voiceFinalTranscriptRef,
    audioCtxRef, analyserRef, levelRafRef, recordingTimerRef,
    interimTranscriptRef, audioLevelRawRef, levelThrottleRef, silenceStartRef,
    lastSpokenMsgRef, isHandsFreeRef,
    SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS,
    clearInterimAfter, cleanupAudioLevel,
    isHandsFree, isRecording, voiceMode, setVoiceMode, ttsVoice,
    streaming, messages, handleSendRef,
  } = params;

  const [voicePendingSend, setVoicePendingSend] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeListenerRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const skipWakeRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Microphone access is not available in this browser.");
      return;
    }

    // Clean up previous sessions
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* */ } recognitionRef.current = null; }
    if (wakeListenerRef.current) { try { wakeListenerRef.current.abort(); } catch { /* */ } wakeListenerRef.current = null; }
    if (mediaRecorderRef.current) { try { mediaRecorderRef.current.stop(); } catch { /* */ } mediaRecorderRef.current = null; }
    audioChunksRef.current = [];

    // Clear ALL voice state for a completely fresh recording
    voiceSessionIdRef.current += 1;
    voiceFinalTranscriptRef.current = "";
    setInput("");
    setInterimTranscript("");
    setVoicePendingSend("");
    setIsRecording(true);

    const SpeechRec = window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    const wakeAlreadyDetected = skipWakeRef.current;
    skipWakeRef.current = false;

    if (wakeAlreadyDetected || !SpeechRec) {
      setVoicePhase("recording");
      setInterimTranscript("Recording...");
      beginCapture();
      return;
    }

    setVoicePhase("waiting");
    setInterimTranscript('Say "shre shre" to start...');

    const wakeRec = new SpeechRec();
    wakeRec.continuous = true;
    wakeRec.interimResults = true;
    wakeRec.lang = "en-US";
    let wakeDetected = false;

    wakeRec.onresult = (e: SpeechRecognitionEvent) => {
      if (wakeDetected) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.toLowerCase().trim();
        if (text.includes("shre shre") || text.includes("shrey shrey") || text.includes("shray shray")
          || text.includes("shree shree") || text.includes("shri shri")) {
          wakeDetected = true;
          playVoiceCue("wake");
          try { wakeRec.stop(); } catch { /* */ }
          recognitionRef.current = null;
          beginCapture();
          return;
        }
      }
    };
    wakeRec.onend = () => {
      if (!wakeDetected && recognitionRef.current === wakeRec) {
        try { wakeRec.start(); } catch { recognitionRef.current = null; }
      }
    };
    wakeRec.onerror = () => {
      if (!wakeDetected && recognitionRef.current === wakeRec) {
        setTimeout(() => { try { wakeRec.start(); } catch { recognitionRef.current = null; } }, 500);
      }
    };
    try { wakeRec.start(); recognitionRef.current = wakeRec; } catch { beginCapture(); }

    async function beginCapture() {
      playVoiceCue("start");
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      setVoicePhase("recording");
      setInterimTranscript("");
      setRecordingDuration(0);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError"
          ? "Microphone blocked — tap the lock icon in your browser's address bar to allow mic access, then try again."
          : err?.name === "NotFoundError"
            ? "No microphone found. Please connect a microphone and try again."
            : "Microphone error: " + (err?.message || "unknown");
        setInterimTranscript(msg);
        clearInterimAfter(4000);
        setIsRecording(false);
        setVoicePhase("idle");
        return;
      }

      // Audio level analyser
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
            else if (now - silenceStartRef.current > SILENCE_TIMEOUT_MS && (Date.now() - startTime) > 2000) {
              stopRecordingRef.current?.();
              return;
            }
          } else {
            silenceStartRef.current = 0;
          }
          levelRafRef.current = requestAnimationFrame(tick);
        }
        levelRafRef.current = requestAnimationFrame(tick);
      } catch { /* audio level is best-effort */ }

      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) {
          stopRecordingRef.current?.();
        }
      }, 1000);

      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : isSafari ? "audio/mp4" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      if (SpeechRec) {
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        voiceFinalTranscriptRef.current = "";
        let hasStarted = false;
        let stopped = false;

        rec.onstart = () => { hasStarted = true; };
        rec.onresult = (e: SpeechRecognitionEvent) => {
          if (stopped) return;
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) voiceFinalTranscriptRef.current += e.results[i][0].transcript + " ";
            else interim += e.results[i][0].transcript;
          }
          const combined = (voiceFinalTranscriptRef.current + interim).toLowerCase();
          if (combined.includes("shre send") || combined.includes("shrey send") || combined.includes("shray send")) {
            voiceFinalTranscriptRef.current = voiceFinalTranscriptRef.current.replace(/\b(shre|shrey|shray)\s+send\b/gi, "").trim();
            stopped = true;
            setInput(voiceFinalTranscriptRef.current);
            stopRecordingRef.current?.();
            return;
          }
          const live = (voiceFinalTranscriptRef.current + interim).trim();
          setInput(live);
        };
        rec.onerror = () => { /* non-fatal */ };
        rec.onend = () => {
          if (!hasStarted || stopped) { recognitionRef.current = null; return; }
          if (recognitionRef.current === rec) {
            try { rec.start(); return; } catch { /* */ }
          }
          recognitionRef.current = null;
        };
        const origStop = rec.stop.bind(rec);
        rec.stop = () => { stopped = true; origStop(); };
        try { rec.start(); recognitionRef.current = rec; } catch { /* Whisper handles it */ }
      }
    }
  }, []);

  const stopRecording = useCallback(async () => {
    playVoiceCue("stop");
    if (navigator.vibrate) navigator.vibrate(30);
    cleanupAudioLevel();

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* */ }
      recognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setVoicePhase("transcribing");
      setInterimTranscript("Transcribing your voice...");

      await new Promise<void>((resolve) => {
        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          audioChunksRef.current = [];
          recorder.stream.getTracks().forEach((t) => t.stop());

          if (audioBlob.size < 5000) {
            setInterimTranscript("Recording too short — try again");
            clearInterimAfter(2000);
            setIsRecording(false);
            setVoicePhase("idle");
            setInput("");
            resolve();
            return;
          }

          let transcribedText = "";
          try {
            const ext = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
            const form = new FormData();
            form.append("file", audioBlob, `recording.${ext}`);
            form.append("model", "whisper-1");
            form.append("language", "en");
            const res = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
            const data = await res.json();
            if (data.text && data.text.trim()) {
              transcribedText = data.text.trim();
            }
          } catch (err: any) {
            console.warn("[voice] Whisper transcription failed, keeping browser transcript:", err);
            const msg = err?.name === "TimeoutError" ? "Transcription timed out — try a shorter recording" : "Transcription failed — check connection";
            setInterimTranscript(msg);
            clearInterimAfter(3000);
          }

          setIsRecording(false);
          setVoicePhase("idle");

          let finalText = transcribedText || (document.getElementById("shre-chat-textarea") as HTMLTextAreaElement)?.value?.trim() || "";
          finalText = finalText.replace(/\b(shre|shrey|shray)\s+(shre|shrey|shray)\b/gi, "").replace(/\b(shre|shrey|shray)\s+send\b/gi, "").trim();
          if (finalText) {
            setInterimTranscript("");
            setInput(finalText);
            setVoicePendingSend(finalText);
          } else {
            if (!interimTranscriptRef.current.includes("failed") && !interimTranscriptRef.current.includes("timed out")) {
              setInterimTranscript("No speech detected — try again");
            }
            clearInterimAfter(3000);
            setInput("");
          }
          resolve();
        };
        recorder.stop();
      });
      mediaRecorderRef.current = null;
      return;
    }

    setIsRecording(false);
    setVoicePhase("idle");
    setInterimTranscript("");
    setInput("");
  }, [cleanupAudioLevel]);

  // Keep ref in sync
  stopRecordingRef.current = stopRecording;

  // Auto-send after voice transcription completes
  useEffect(() => {
    if (!voicePendingSend) return;
    const sessionAtSend = voiceSessionIdRef.current;
    setVoicePendingSend("");
    const timer = setTimeout(() => {
      if (voiceSessionIdRef.current !== sessionAtSend) return;
      const textarea = document.getElementById("shre-chat-textarea") as HTMLTextAreaElement;
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
        try { recognitionRef.current.abort(); } catch { /* */ }
        recognitionRef.current = null;
      }
      if (wakeListenerRef.current) {
        try { wakeListenerRef.current.abort(); } catch { /* */ }
        wakeListenerRef.current = null;
      }
      if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Hands-free wake word listener — "shre shre"
  useEffect(() => {
    if (!isHandsFree) {
      if (wakeListenerRef.current) { try { wakeListenerRef.current.abort(); } catch { /* */ } wakeListenerRef.current = null; }
      return;
    }
    const SpeechRec = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    let active = true;

    function startWakeListener() {
      if (!active) return;
      if (recognitionRef.current || mediaRecorderRef.current) return;
      const w = new SpeechRec() as SpeechRecognition;
      w.continuous = false;
      w.interimResults = true;
      w.lang = "en-US";
      w.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.toLowerCase().trim();
          if (text.includes("shre shre") || text.includes("shrey shrey") || text.includes("shray shray")) {
            try { w.stop(); } catch { /* */ }
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
      if (wakeListenerRef.current) { try { wakeListenerRef.current.abort(); } catch { /* */ } wakeListenerRef.current = null; }
    };
  }, [isHandsFree, isRecording, startRecording]);

  // Auto-speak: when voice mode is on, auto-TTS the latest assistant response
  useEffect(() => {
    if (!voiceMode || streaming) return;
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant" || !lastMsg.content) return;
    const msgKey = `${lastMsg.timestamp}-${lastMsg.content.length}`;
    if (lastSpokenMsgRef.current === msgKey) return;
    lastSpokenMsgRef.current = msgKey;

    const plainText = lastMsg.content
      .replace(/```[\s\S]*?```/g, " code block omitted ")
      .replace(/`[^`]+`/g, (m: string) => m.slice(1, -1))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/[*_~]{1,3}/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, 4096);
    if (!plainText) return;

    ttsAbortRef.current?.abort();
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    setIsSpeaking(true);

    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: plainText, voice: ttsVoice }),
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.blob() : Promise.reject(new Error("TTS failed")))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); setIsSpeaking(false); ttsAudioRef.current = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); setIsSpeaking(false); ttsAudioRef.current = null; };
        audio.play().catch(() => { URL.revokeObjectURL(url); setIsSpeaking(false); });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
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

    return () => { controller.abort(); };
  }, [voiceMode, streaming, messages, ttsVoice]);

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
