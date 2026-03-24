import { useState, useRef, useEffect, useCallback } from "react";
import { playVoiceCue, MAX_RECORDING_SECONDS } from "../chat-utils";
import { usePreferences } from "../preferences-store";

export interface UseVoiceRecordingReturn {
  isRecording: boolean;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  voicePhase: "idle" | "waiting" | "recording" | "transcribing";
  setVoicePhase: React.Dispatch<React.SetStateAction<"idle" | "waiting" | "recording" | "transcribing">>;
  interimTranscript: string;
  setInterimTranscript: React.Dispatch<React.SetStateAction<string>>;
  audioLevel: number;
  setAudioLevel: React.Dispatch<React.SetStateAction<number>>;
  recordingDuration: number;
  setRecordingDuration: React.Dispatch<React.SetStateAction<number>>;
  isSpeaking: boolean;
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  voiceAnnouncement: string;
  setVoiceAnnouncement: React.Dispatch<React.SetStateAction<string>>;
  voiceAssistantOpen: boolean;
  setVoiceAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isHandsFree: boolean;
  setIsHandsFree: React.Dispatch<React.SetStateAction<boolean>>;
  voiceMode: boolean;
  setVoiceMode: React.Dispatch<React.SetStateAction<boolean>>;
  ttsVoice: string;
  setTtsVoice: React.Dispatch<React.SetStateAction<string>>;
  speechSupported: boolean;
  // Refs
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  audioCtxRef: React.MutableRefObject<AudioContext | null>;
  levelRafRef: React.MutableRefObject<number>;
  recordingTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  interimTranscriptRef: React.MutableRefObject<string>;
  audioLevelRawRef: React.MutableRefObject<number>;
  voiceSessionIdRef: React.MutableRefObject<number>;
  voiceFinalTranscriptRef: React.MutableRefObject<string>;
  levelThrottleRef: React.MutableRefObject<number>;
  silenceStartRef: React.MutableRefObject<number>;
  isHandsFreeRef: React.MutableRefObject<boolean>;
  lastSpokenMsgRef: React.MutableRefObject<string>;
  // Constants
  SILENCE_THRESHOLD: number;
  SILENCE_TIMEOUT_MS: number;
  hasSpeechRecognition: boolean;
  // Helpers
  clearInterimAfter: (ms: number) => void;
  cleanupAudioLevel: () => void;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"idle" | "waiting" | "recording" | "transcribing">("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceAnnouncement, setVoiceAnnouncement] = useState("");
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const voiceMode = usePreferences((s) => s.voiceMode);
  const setVoiceMode = usePreferences((s) => s.setVoiceMode);
  const ttsVoice = usePreferences((s) => s.ttsVoice);
  const setTtsVoice = usePreferences((s) => s.setTtsVoice);
  const hasSpeechRecognition = !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
  const [speechSupported] = useState(() => hasSpeechRecognition || !!navigator.mediaDevices?.getUserMedia);

  // Refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number>(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interimTranscriptRef = useRef("");
  interimTranscriptRef.current = interimTranscript;
  const audioLevelRawRef = useRef(0);
  const voiceSessionIdRef = useRef(0);
  const voiceFinalTranscriptRef = useRef("");
  const levelThrottleRef = useRef(0);
  const silenceStartRef = useRef(0);
  const isHandsFreeRef = useRef(false);
  isHandsFreeRef.current = isHandsFree;
  const lastSpokenMsgRef = useRef<string>("");

  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_TIMEOUT_MS = 5000;

  // Voice start/stop event listeners
  useEffect(() => {
    const onStart = () => setVoiceAssistantOpen(true);
    const onStop = () => setVoiceAssistantOpen(false);
    window.addEventListener("shre-voice-start", onStart);
    window.addEventListener("shre-voice-stop", onStop);
    return () => {
      window.removeEventListener("shre-voice-start", onStart);
      window.removeEventListener("shre-voice-stop", onStop);
    };
  }, []);

  // ARIA live region announcements for voice phase changes
  useEffect(() => {
    const announcements: Record<string, string> = {
      idle: "",
      waiting: "Ready. Tap to talk.",
      recording: "Recording. Tap to send.",
      transcribing: "Processing your voice.",
    };
    setVoiceAnnouncement(announcements[voicePhase] || "");
  }, [voicePhase]);

  useEffect(() => {
    if (isSpeaking) setVoiceAnnouncement("Speaking response.");
  }, [isSpeaking]);

  // Clear interim transcript after delay
  const clearInterimAfter = useCallback((ms: number) => {
    const sid = voiceSessionIdRef.current;
    setTimeout(() => {
      if (voiceSessionIdRef.current === sid) setInterimTranscript("");
    }, ms);
  }, []);

  // Clean up audio analyser + timer
  const cleanupAudioLevel = useCallback(() => {
    if (levelRafRef.current) { cancelAnimationFrame(levelRafRef.current); levelRafRef.current = 0; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    analyserRef.current = null;
    setAudioLevel(0);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setRecordingDuration(0);
  }, []);

  return {
    isRecording, setIsRecording,
    voicePhase, setVoicePhase,
    interimTranscript, setInterimTranscript,
    audioLevel, setAudioLevel,
    recordingDuration, setRecordingDuration,
    isSpeaking, setIsSpeaking,
    voiceAnnouncement, setVoiceAnnouncement,
    voiceAssistantOpen, setVoiceAssistantOpen,
    isHandsFree, setIsHandsFree,
    voiceMode, setVoiceMode,
    ttsVoice, setTtsVoice,
    speechSupported,
    analyserRef, audioCtxRef, levelRafRef, recordingTimerRef,
    interimTranscriptRef, audioLevelRawRef, voiceSessionIdRef,
    voiceFinalTranscriptRef, levelThrottleRef, silenceStartRef,
    isHandsFreeRef, lastSpokenMsgRef,
    SILENCE_THRESHOLD, SILENCE_TIMEOUT_MS, hasSpeechRecognition,
    clearInterimAfter, cleanupAudioLevel,
  };
}
