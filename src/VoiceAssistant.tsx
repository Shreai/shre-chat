import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { voiceReducer, initialVoiceState } from './voiceStateMachine';
import type { VoiceAction, VoicePhase } from './voiceStateMachine';
import { useVAD } from './useVAD';
import { useProactiveNotifications } from './hooks/useProactiveNotifications';
import { getSpeechLocale } from './i18n';
import { sendMessage as sendChatMessage, type ChatMessage, type StreamCallbacks } from './router-client';

// ── Extracted modules ──
import {
  stripMd,
  detectCmd,
  detectAgentSwitch,
  type AgentOption,
  type Turn,
  type VoiceShortcut,
} from './voice/voice-utils';
import { VoiceTurnContent } from './voice/VoiceTurnContent';
import { createSpeak } from './voice/voice-tts';
import { getOrRequestStream, releaseCachedStream } from './hooks/useVoiceRecording';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  agentName: string;
  agentEmoji: string;
  agentId: string;
  ttsVoice: string;
  ttsProvider?: string;
  agents?: AgentOption[];
  onSwitchAgent?: (agentId: string) => void;
  onVoiceTurn?: (turn: { role: 'user' | 'assistant'; content: string }) => void;
  routerMode?: boolean;
  models?: ModelOption[];
  selectedModel?: string | null;
  onSelectModel?: (id: string | null) => void;
  onSetTtsProvider?: (v: string) => void;
}

export default function VoiceAssistant({
  open,
  onClose,
  messages,
  agentName,
  agentEmoji,
  agentId,
  ttsVoice,
  ttsProvider,
  agents,
  onSwitchAgent,
  onVoiceTurn,
  routerMode,
  models,
  selectedModel,
  onSelectModel,
  onSetTtsProvider,
}: Props) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<VoiceShortcut[]>([]);
  const [briefingPlaying, setBriefingPlaying] = useState(false);
  const [proactiveMode, setProactiveMode] = useState(false);
  const {
    pendingNotifs,
    speakNext,
    clearQueue,
    isConnected: notifConnected,
  } = useProactiveNotifications(open && proactiveMode);
  const briefingSkippedRef = useRef(false);

  const activeRef = useRef(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnHistoryRef = useRef<Turn[]>([]);

  // ── Persist voice turns to sessionStorage + server ──
  const voiceSessionIdRef = useRef<string>(sessionStorage.getItem('shre-voice-session-id') || '');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore turns on mount
  useEffect(() => {
    let restored = false;
    try {
      const saved = sessionStorage.getItem('shre-voice-turns');
      if (saved) {
        const parsed = JSON.parse(saved) as Turn[];
        const lastSaved = Number(sessionStorage.getItem('shre-voice-turns-ts') || '0');
        if (Date.now() - lastSaved < 30 * 60 * 1000 && parsed.length > 0) {
          setTurns(parsed);
          turnHistoryRef.current = parsed;
          restored = true;
        } else {
          sessionStorage.removeItem('shre-voice-turns');
          sessionStorage.removeItem('shre-voice-turns-ts');
        }
      }
    } catch (err) {
      console.debug('voice turn restore from sessionStorage', err);
    }

    if (!restored && voiceSessionIdRef.current) {
      fetch(`/api/voice-turns/${voiceSessionIdRef.current}`, { signal: AbortSignal.timeout(3000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.turns?.length) {
            const serverTurns: Turn[] = data.turns.map((t: any) => ({
              role: t.role as 'user' | 'assistant',
              text: t.content || '',
            }));
            setTurns(serverTurns.slice(-20));
            turnHistoryRef.current = serverTurns.slice(-20);
          }
        })
        .catch(() => {
          void 0;
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist turns to sessionStorage + debounced server sync
  useEffect(() => {
    if (turns.length > 0) {
      try {
        sessionStorage.setItem('shre-voice-turns', JSON.stringify(turns.slice(-20)));
        sessionStorage.setItem('shre-voice-turns-ts', String(Date.now()));
      } catch (err) {
        console.debug('voice turn persist to sessionStorage', err);
      }

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        const sid = voiceSessionIdRef.current;
        if (!sid) return;
        fetch('/api/voice-turns/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, turns: turns.slice(-20) }),
        }).catch(() => {
          void 0;
        });
      }, 5000);
    }
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [turns]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const whisperAbortRef = useRef<AbortController | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, state.transcript]);

  // ── VAD setup ──
  const vad = useVAD({
    speechThreshold: 0.025,
    silenceDuration: 4000,
    onSilence: useCallback(() => {}, []),
    onSpeechStart: useCallback(() => {
      dispatchRef.current({ type: 'SPEECH_DETECTED' });
    }, []),
    onSpeechEnd: useCallback(() => {
      dispatchRef.current({ type: 'SPEECH_ENDED' });
    }, []),
  });

  // ── Mic stream (uses shared cached stream to avoid repeated permission prompts) ──
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const acquireMic = useCallback(async (): Promise<MediaStream | null> => {
    if (mediaStreamRef.current?.active) return mediaStreamRef.current;
    try {
      const stream = await getOrRequestStream();
      mediaStreamRef.current = stream;
      setMicPermissionDenied(false);
      return stream;
    } catch (err: any) {
      console.debug('mic acquire failed', err);
      if (err?.name === 'NotAllowedError') {
        setMicPermissionDenied(true);
        dispatch({ type: 'ERROR', message: 'Microphone access denied' });
      } else if (err?.name === 'NotFoundError') {
        dispatch({ type: 'ERROR', message: 'No microphone found' });
      }
      return null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    mediaStreamRef.current = null;
    // Release the shared cached stream when VoiceAssistant closes to free hardware
    releaseCachedStream();
  }, []);

  // ── Cleanup ──
  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch (err) {
        console.debug('rec abort cleanup', err);
      }
      recRef.current = null;
    }
    vad.destroy();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    whisperAbortRef.current?.abort();
    whisperAbortRef.current = null;
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = '';
      ttsAudioRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.debug('mediaRecorder stop cleanup', err);
        }
      }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = []; // prevent stale chunks from accumulating
    releaseMic();
    window.speechSynthesis?.cancel();
    dispatch({ type: 'CLOSE' });
  }, [vad, releaseMic]);

  // ── Stop listening hardware (SR + VAD + MediaRecorder) ──
  // Called before TTS playback to prevent mic picking up speaker output
  const stopListeningHardware = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* already stopped */ }
      recRef.current = null;
    }
    try { vad.stop(); } catch { /* ok */ }
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* ok */ }
    }
  }, [vad]);

  // ── Streaming TTS (extracted) ──
  const speak = useCallback(
    createSpeak({
      ttsVoice,
      ttsProvider,
      activeRef,
      ttsAbortRef,
      ttsAudioRef,
      mediaStreamRef,
      phaseRef,
      dispatch,
      vad,
      stopListeningHardware,
    }),
    [ttsVoice, ttsProvider, vad, stopListeningHardware], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── AI request ──
  const askAI = useCallback(
    async (prompt: string, signal?: AbortSignal): Promise<string> => {
      try {
        const voiceTurns = turnHistoryRef.current.slice(-10).map(
          (t): ChatMessage => ({
            role: t.role,
            content: t.text.slice(0, 1500),
          }),
        );
        const recentChat = messages.slice(-10).map(
          (m): ChatMessage => ({
            role: m.role as 'user' | 'assistant',
            content: m.content.slice(0, 1500),
          }),
        );
        const history: ChatMessage[] = [...recentChat, ...voiceTurns];

        return await new Promise<string>((resolve) => {
          let fullText = '';
          const timeoutId = setTimeout(
            () => resolve(fullText || 'Sorry, the request timed out. Try again.'),
            30_000,
          );

          const callbacks: StreamCallbacks = {
            onToken: (token) => {
              fullText += token;
            },
            onDone: (text) => {
              clearTimeout(timeoutId);
              const raw = text || fullText;
              resolve(raw || "I didn't catch that. Could you try again?");
            },
            onError: (err) => {
              clearTimeout(timeoutId);
              console.error('[voice-chat] error:', err);
              resolve(fullText || "Sorry, I couldn't process that right now. Try again.");
            },
            onStatus: (status) => {
              if (status === 'thinking') dispatch({ type: 'SET_STATUS', text: 'Thinking...' });
              else if (status === 'writing') dispatch({ type: 'SET_STATUS', text: '' });
            },
          };

          sendChatMessage(
            prompt,
            history,
            `You are ${agentName}, a voice assistant. Keep responses concise. When the user asks for data (sales, invoices, inventory, top items, etc.), use markdown tables and formatting — the UI renders them visually. For conversational responses, be natural and brief. Always prefer structured data presentation (tables, bullet points) for data-heavy answers.`,
            callbacks,
            signal,
            voiceSessionIdRef.current || undefined,
            undefined,
            undefined,
            routerMode,
          ).catch((err) => {
            clearTimeout(timeoutId);
            if (err?.name === 'AbortError') {
              resolve('');
              return;
            }
            resolve(fullText || "Sorry, I couldn't process that right now. Try again.");
          });
        });
      } catch (err: any) {
        if (err.name === 'AbortError') return '';
        console.error('[voice-chat]', err);
        return "Sorry, I couldn't process that right now. Try again.";
      }
    },
    [agentId, agentName, messages, routerMode],
  );

  // ── Whisper transcription ──
  const transcribeWithWhisper = useCallback(async (audioBlob: Blob): Promise<string> => {
    // Abort any previous in-flight Whisper request to prevent stacking
    if (whisperAbortRef.current) {
      whisperAbortRef.current.abort();
      whisperAbortRef.current = null;
    }
    try {
      const ctrl = new AbortController();
      whisperAbortRef.current = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), 10_000);
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.webm');
      formData.append('model', 'whisper-1');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      whisperAbortRef.current = null;
      if (!res.ok) return '';
      const data = await res.json();
      return (data.text || '').trim();
    } catch (err) {
      console.debug('whisper transcription failed', err);
      whisperAbortRef.current = null;
      return '';
    }
  }, []);

  // ── Audio recording ──
  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.debug('mediaRecorder stop before restart', err);
      }
      mediaRecorderRef.current = null;
    }
    const stream = await acquireMic();
    if (!stream) return;
    try {
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
    } catch (err) {
      console.debug('mediaRecorder create failed', err);
      mediaRecorderRef.current = null;
    }
  }, [acquireMic]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
          : null;
        audioChunksRef.current = [];
        resolve(blob);
        return;
      }
      mr.onstop = () => {
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: mr.mimeType })
          : null;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  // ── Clarification context ──
  const clarifyContextRef = useRef<string | null>(null);

  // ── Voice command ──
  const tryVoiceCommand = useCallback(
    async (
      text: string,
    ): Promise<{ spoken: string; mib007Link?: string; action?: string } | null> => {
      try {
        const prompt = clarifyContextRef.current
          ? `Context: user previously said "${clarifyContextRef.current}" and was asked to clarify. They responded: "${text}"`
          : text;
        clarifyContextRef.current = null;
        const res = await fetch('/api/voice-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.action === 'clarify' && data.spoken)
          return { spoken: data.spoken, action: 'clarify' };
        if (data.action && data.spoken)
          return { spoken: data.spoken, mib007Link: data.mib007Link, action: data.action };
        return null;
      } catch (err) {
        console.debug('voice command fetch failed', err);
        return null;
      }
    },
    [],
  );

  // ── Process user input → AI → TTS → loop ──
  const processingRef = useRef(false);
  const processUserInput = useCallback(
    async (text: string) => {
      if (!activeRef.current) return;
      if (processingRef.current) return;
      if (phaseRef.current === 'thinking' || phaseRef.current === 'speaking') return;
      processingRef.current = true;
      try {
        const userTurn: Turn = { role: 'user', text };
        setTurns((prev) => [...prev, userTurn]);
        turnHistoryRef.current = [...turnHistoryRef.current, userTurn];
        onVoiceTurn?.({ role: 'user', content: text });
        dispatch({ type: 'CLEAR_TRANSCRIPT' });

        const switchTarget = detectAgentSwitch(text, agents);
        if (switchTarget && onSwitchAgent) {
          const target = agents?.find((a) => a.id === switchTarget);
          const response = `Switching you to ${target?.name || switchTarget}. One moment.`;
          setTurns((prev) => [...prev, { role: 'assistant', text: response }]);
          onVoiceTurn?.({ role: 'assistant', content: response });
          await speak(response);
          onSwitchAgent(switchTarget);
          // Always dispatch SPEAK_DONE to avoid black hole in speaking phase
          if ((phaseRef.current as VoicePhase) === 'speaking') dispatch({ type: 'SPEAK_DONE' });
          return;
        }

        const cmd = detectCmd(text);
        let response: string;
        let responseMib007Link: string | undefined;

        if (cmd === 'goodbye') {
          dispatch({ type: 'SET_STATUS', text: 'Ending conversation...' });
          response = 'Thanks for chatting! Talk to you later.';
          setTurns((prev) => [...prev, { role: 'assistant', text: response }]);
          onVoiceTurn?.({ role: 'assistant', content: response });
          await speak(response);
          onClose();
          return;
        } else if (cmd === 'read_last') {
          dispatch({ type: 'TRANSCRIPTION_DONE' });
          dispatch({ type: 'SET_STATUS', text: 'Reading last message...' });
          const last = [...messages].reverse().find((m) => m.role === 'assistant');
          response = last
            ? stripMd(last.content).slice(0, 500)
            : 'There are no previous messages to read.';
        } else if (cmd === 'summarize') {
          dispatch({ type: 'TRANSCRIPTION_DONE' });
          dispatch({ type: 'SET_STATUS', text: 'Summarizing...' });
          const ctrl = new AbortController();
          aiAbortRef.current = ctrl;
          response = await askAI(
            'Please provide a brief verbal summary of this conversation so far. Be concise — this will be read aloud.',
            ctrl.signal,
          );
          if (!response || !activeRef.current) {
            // Prevent black hole: recover from thinking phase if AI returned nothing
            if (activeRef.current && (phaseRef.current as VoicePhase) === 'thinking') dispatch({ type: 'INTERRUPT' });
            return;
          }
        } else {
          dispatch({ type: 'TRANSCRIPTION_DONE' });
          dispatch({ type: 'SET_STATUS', text: 'Processing...' });
          const cmdResult = await tryVoiceCommand(text);
          if (cmdResult?.action === 'clarify') {
            clarifyContextRef.current = text;
            response = cmdResult.spoken;
          } else if (cmdResult) {
            response = cmdResult.spoken;
            responseMib007Link = cmdResult.mib007Link;
          } else {
            dispatch({ type: 'SET_STATUS', text: 'Thinking...' });
            const ctrl = new AbortController();
            aiAbortRef.current = ctrl;
            response = await askAI(text, ctrl.signal);
            if (!activeRef.current) {
              // Prevent black hole: reset to ready if voice was closed mid-request
              if ((phaseRef.current as VoicePhase) === 'thinking') dispatch({ type: 'INTERRUPT' });
              return;
            }
            if (!response)
              response = "Hmm, I didn't get a response back. Could you try that again?";
          }
        }

        if (!activeRef.current) {
          // Prevent black hole: recover from thinking/speaking if voice closed mid-flow
          const p = phaseRef.current as VoicePhase;
          if (p === 'thinking' || p === 'speaking' || p === 'transcribing') dispatch({ type: 'INTERRUPT' });
          return;
        }

        const assistTurn: Turn = {
          role: 'assistant',
          text: response,
          mib007Link: responseMib007Link,
        };
        setTurns((prev) => [...prev, assistTurn]);
        turnHistoryRef.current = [...turnHistoryRef.current, assistTurn];
        onVoiceTurn?.({ role: 'assistant', content: response });

        dispatch({ type: 'AI_RESPONSE' });
        // stripMd removes <think>...</think> blocks before TTS to avoid speaking internal reasoning
        await speak(stripMd(response));

        if (activeRef.current) {
          if ((phaseRef.current as VoicePhase) === 'speaking') {
            dispatch({ type: 'SPEAK_DONE' });
          }
        }
      } catch (err) {
        console.error('[voice] processUserInput crashed:', err);
        if (activeRef.current) {
          dispatch({
            type: 'ERROR',
            message: `Voice error: ${(err as Error)?.message || 'Unknown error'}. Tap to retry.`,
          });
        }
      } finally {
        processingRef.current = false;
      }
    },
    [speak, askAI, messages, onClose, agents, onSwitchAgent, onVoiceTurn, tryVoiceCommand],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start listening ──
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    // Don't start listening during speaking/thinking/transcribing
    const p = phaseRef.current;
    if (p === 'speaking' || p === 'thinking' || p === 'transcribing') return;
    dispatch({ type: 'START_LISTENING' });
    try {
      const stream = await acquireMic();
      if (!stream) {
        dispatch({
          type: 'ERROR',
          message: 'Microphone access denied. Allow mic access in browser settings.',
        });
        return;
      }
      await startRecording();
      try {
        vad.start(stream);
      } catch (e) {
        console.warn('[voice] VAD start failed:', e);
      }

      const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        if (recRef.current) {
          try {
            recRef.current.abort();
          } catch (err) {
            console.debug('rec abort before new', err);
          }
        }
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = getSpeechLocale();
        rec.maxAlternatives = 3;
        rec.onresult = (e: SpeechRecognitionEvent) => {
          let interim = '';
          let final = '';
          for (let i = 0; i < e.results.length; i++) {
            const result = e.results[i];
            if (result.isFinal) {
              let best = result[0];
              for (let j = 1; j < result.length; j++) {
                if (result[j].confidence > best.confidence) best = result[j];
              }
              final += best.transcript + ' ';
            } else {
              interim += result[0].transcript;
            }
          }
          dispatch({ type: 'TRANSCRIPT_UPDATE', final: final.trim(), interim: interim.trim() });
        };
        rec.onend = () => {
          // Only auto-restart SR if we're still in listening phase
          // Never restart during speaking/thinking/transcribing — TTS audio would be captured
          const currentPhase = phaseRef.current;
          if (activeRef.current && currentPhase === 'listening') {
            try {
              rec.start();
            } catch (err) {
              console.debug('SR restart failed', err);
            }
          }
        };
        rec.onerror = (e: any) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          if (e.error === 'not-allowed') {
            dispatch({
              type: 'ERROR',
              message: 'Microphone access denied. Allow mic access in browser settings.',
            });
          }
        };
        try {
          rec.start();
          recRef.current = rec;
        } catch (err) {
          console.debug('SR start failed, Whisper still active', err);
        }
      }
    } catch (err) {
      console.error('[voice] startListening failed:', err);
      dispatch({ type: 'ERROR', message: 'Failed to start voice input. Tap to retry.' });
    }
  }, [acquireMic, startRecording, vad]);

  // ── Finish listening ──
  const finishListening = useCallback(async () => {
    if (phaseRef.current !== 'listening') return;
    try {
      dispatch({ type: 'FINISH_LISTENING' });
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch (err) {
          console.debug('rec abort on stop', err);
        }
        recRef.current = null;
      }
      try {
        vad.stop();
      } catch (err) {
        console.debug('VAD stop', err);
      }
      const audioBlob = await stopRecording();
      if (!audioBlob || audioBlob.size < 3000) {
        if (activeRef.current) dispatch({ type: 'INTERRUPT' });
        return;
      }
      dispatch({ type: 'SET_STATUS', text: 'Transcribing...' });
      const whisperText = await transcribeWithWhisper(audioBlob);
      if (
        !whisperText ||
        !activeRef.current ||
        (phaseRef.current as VoicePhase) !== 'transcribing'
      ) {
        if (activeRef.current && (phaseRef.current as VoicePhase) === 'transcribing')
          dispatch({ type: 'INTERRUPT' });
        return;
      }
      processUserInput(whisperText);
    } catch (err) {
      console.error('[voice] finishListening crashed:', err);
      if (activeRef.current) {
        dispatch({ type: 'ERROR', message: 'Voice processing error. Tap to retry.' });
      } else {
        // Prevent black hole: if voice closed during crash, force back to ready
        const p = phaseRef.current as VoicePhase;
        if (p === 'transcribing' || p === 'thinking') dispatch({ type: 'INTERRUPT' });
      }
    }
  }, [vad, stopRecording, transcribeWithWhisper, processUserInput]);

  // ── Save voice session on close ──
  useEffect(() => {
    if (open) return;
    const allTurns = turnHistoryRef.current;
    if (allTurns.length >= 4) {
      fetch('/api/voice-session-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: allTurns.map((t) => ({ role: t.role, text: t.text })),
          agentId,
        }),
      }).catch(() => {
        void 0;
      });
    }
  }, [open, agentId]);

  // ── Proactive notifications ──
  useEffect(() => {
    if (!proactiveMode || !open || pendingNotifs.length === 0) return;
    if (phaseRef.current !== 'ready') return;
    const notif = speakNext();
    if (!notif) return;
    const text = `${notif.severity === 'critical' ? 'Urgent: ' : ''}${notif.title}${notif.body ? '. ' + notif.body : ''}`;
    const notifTurn: Turn = { role: 'assistant', text: `[${notif.source}] ${text}` };
    setTurns((prev) => [...prev, notifTurn]);
    turnHistoryRef.current = [...turnHistoryRef.current, notifTurn];
    onVoiceTurn?.({ role: 'assistant', content: text });
    speak(text)
      .then(() => {
        if (activeRef.current && phaseRef.current === 'speaking') dispatch({ type: 'SPEAK_DONE' });
      })
      .catch(() => {
        // Prevent black hole: recover from speaking if TTS fails
        if (activeRef.current && phaseRef.current === 'speaking') dispatch({ type: 'INTERRUPT' });
      });
  }, [proactiveMode, open, pendingNotifs, speakNext, speak, onVoiceTurn]);

  // ── Initialize on open ──
  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    if (!voiceSessionIdRef.current) {
      voiceSessionIdRef.current = crypto.randomUUID();
      sessionStorage.setItem('shre-voice-session-id', voiceSessionIdRef.current);
    }
    activeRef.current = true;
    try {
      const saved = sessionStorage.getItem('shre-voice-turns');
      const lastSaved = Number(sessionStorage.getItem('shre-voice-turns-ts') || '0');
      if (saved && Date.now() - lastSaved < 30 * 60 * 1000) {
        const parsed = JSON.parse(saved) as Turn[];
        if (parsed.length > 0) {
          setTurns(parsed);
          turnHistoryRef.current = parsed;
        } else {
          setTurns([]);
          turnHistoryRef.current = [];
        }
      } else {
        setTurns([]);
        turnHistoryRef.current = [];
      }
    } catch (err) {
      console.debug('voice session restore failed', err);
      setTurns([]);
      turnHistoryRef.current = [];
    }
    dispatch({ type: 'OPEN' });
    fetch('/api/voice-shortcuts')
      .then((r) => (r.ok ? r.json() : { shortcuts: [] }))
      .then((data) => {
        if (data?.shortcuts?.length) setShortcuts(data.shortcuts);
      })
      .catch(() => {
        void 0;
      });
    if (activeRef.current) {
      dispatch({ type: 'GREETING_DONE' });
      acquireMic().catch(() => {
        void 0;
      });
    }
    return cleanup;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipBriefing = useCallback(() => {
    if (briefingPlaying) {
      briefingSkippedRef.current = true;
      setBriefingPlaying(false);
      window.speechSynthesis?.cancel();
      sessionStorage.setItem('shre-voice-briefing-date', new Date().toISOString().slice(0, 10));
    }
  }, [briefingPlaying]);

  // ── Stuck-phase watchdog ──
  // Recovers from black holes: if phase stays in thinking/transcribing/speaking for 30s, reset to ready
  useEffect(() => {
    if (!open) return;
    const STUCK_TIMEOUT = 30_000;
    let stuckTimer: ReturnType<typeof setTimeout> | null = null;
    const checkStuck = () => {
      const p = phaseRef.current;
      if (p === 'thinking' || p === 'transcribing') {
        stuckTimer = setTimeout(() => {
          if (phaseRef.current === p && activeRef.current) {
            console.warn(`[voice] Stuck in ${p} for ${STUCK_TIMEOUT}ms — recovering to ready`);
            dispatch({ type: 'INTERRUPT' });
          }
        }, STUCK_TIMEOUT);
      } else if (p === 'speaking') {
        stuckTimer = setTimeout(() => {
          if (phaseRef.current === 'speaking' && activeRef.current) {
            console.warn(`[voice] Stuck in speaking for ${STUCK_TIMEOUT}ms — recovering to ready`);
            ttsAbortRef.current?.abort();
            if (ttsAudioRef.current) {
              ttsAudioRef.current.pause();
              ttsAudioRef.current.src = '';
              ttsAudioRef.current = null;
            }
            window.speechSynthesis?.cancel();
            dispatch({ type: 'INTERRUPT' });
          }
        }, STUCK_TIMEOUT);
      } else {
        if (stuckTimer) clearTimeout(stuckTimer);
        stuckTimer = null;
      }
    };
    // Check on every phase change
    checkStuck();
    // Re-check periodically
    const interval = setInterval(checkStuck, 5_000);
    return () => {
      if (stuckTimer) clearTimeout(stuckTimer);
      clearInterval(interval);
    };
  }, [open, state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Orb tap (push-to-talk) ──
  const handleOrbTap = useCallback(() => {
    const { phase } = { phase: phaseRef.current };
    if (phase === 'ready') {
      startListening();
    } else if (phase === 'listening') {
      finishListening();
    } else if (phase === 'speaking') {
      ttsAbortRef.current?.abort();
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
        ttsAudioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      vad.stop();
      dispatch({ type: 'INTERRUPT' });
    } else if (phase === 'transcribing') {
      whisperAbortRef.current?.abort();
      dispatch({ type: 'INTERRUPT' });
    } else if (phase === 'thinking') {
      aiAbortRef.current?.abort();
      dispatch({ type: 'INTERRUPT' });
    } else if (phase === 'error') {
      dispatch({ type: 'RETRY' });
    }
  }, [finishListening, startListening, vad]);

  if (!open) return null;

  const { phase, transcript, statusText, errorMsg, speechActive } = state;

  const phaseLabel =
    statusText ||
    (phase === 'greeting'
      ? 'Starting up...'
      : phase === 'ready'
        ? ''
        : phase === 'listening'
          ? transcript
            ? ''
            : 'Recording...'
          : phase === 'transcribing'
            ? 'Transcribing...'
            : phase === 'thinking'
              ? 'Processing...'
              : phase === 'speaking'
                ? 'Speaking...'
                : '');

  const orbScale = phase === 'listening' && speechActive ? 1.08 : 1;
  const orbGlow =
    phase === 'ready'
      ? '0 0 20px 8px rgba(255, 255, 255, 0.1)'
      : phase === 'listening'
        ? speechActive
          ? '0 0 50px 15px rgba(239, 68, 68, 0.5)'
          : '0 0 25px 8px rgba(239, 68, 68, 0.25)'
        : phase === 'speaking'
          ? '0 0 30px 10px rgba(34, 197, 94, 0.25)'
          : phase === 'thinking' || phase === 'transcribing'
            ? '0 0 25px 8px rgba(59, 130, 246, 0.2)'
            : '0 0 15px 5px rgba(107, 114, 128, 0.15)';

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pt-5 pb-2"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          className="flex items-center gap-2 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
          style={{
            background: agents && agents.length > 1 ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onClick={() => agents && agents.length > 1 && setAgentPickerOpen((v) => !v)}
          aria-label="Switch agent"
        >
          <span className="text-lg">{agentEmoji}</span>
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {agentName}
          </span>
          {agents && agents.length > 1 && (
            <svg
              className="h-3.5 w-3.5"
              style={{
                color: 'rgba(255,255,255,0.4)',
                transform: agentPickerOpen ? 'rotate(180deg)' : '',
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-2">
          {/* Settings toggle */}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{
              background: settingsOpen ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.08)',
              color: settingsOpen ? 'rgba(96, 165, 250, 0.9)' : 'rgba(255,255,255,0.4)',
            }}
            aria-label="Voice settings"
            title="Model, agent & voice settings"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={() => setProactiveMode((v) => !v)}
            className="h-10 px-3 rounded-full flex items-center gap-1.5 active:scale-95 transition-transform text-[11px] font-medium"
            style={{
              background: proactiveMode ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
              color: proactiveMode ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${proactiveMode ? 'rgba(74, 222, 128, 0.3)' : 'transparent'}`,
            }}
            aria-label={
              proactiveMode ? 'Disable proactive notifications' : 'Enable proactive notifications'
            }
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {proactiveMode ? 'Live' : 'Alerts'}
            {proactiveMode && notifConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
            {proactiveMode && pendingNotifs.length > 0 && (
              <span className="ml-0.5 text-[9px] bg-red-500 text-white rounded-full px-1">
                {pendingNotifs.length}
              </span>
            )}
          </button>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Agent picker */}
      {agentPickerOpen && agents && agents.length > 1 && (
        <div
          className="mx-5 mb-2 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {agents
            .filter((a) => a.id !== agentId)
            .slice(0, 8)
            .map((a) => (
              <button
                key={a.id}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/10 transition-colors"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onClick={() => {
                  setAgentPickerOpen(false);
                  onSwitchAgent?.(a.id);
                }}
              >
                <span className="text-base">{a.emoji}</span>
                <span className="text-sm">{a.name}</span>
              </button>
            ))}
        </div>
      )}

      {/* Settings panel — model, agent, voice */}
      {settingsOpen && (
        <div
          className="mx-5 mb-2 rounded-xl p-4 space-y-3 animate-fadeIn"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Model selector */}
          {models && models.length > 0 && (
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Model
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onSelectModel?.(null)}
                  className="px-3 py-1.5 rounded-full text-[11px] active:scale-95 transition-all"
                  style={{
                    background: !selectedModel ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                    color: !selectedModel ? 'rgba(96,165,250,0.95)' : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${!selectedModel ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  Auto
                </button>
                {models.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelectModel?.(m.id)}
                    className="px-3 py-1.5 rounded-full text-[11px] active:scale-95 transition-all"
                    style={{
                      background: selectedModel === m.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                      color: selectedModel === m.id ? 'rgba(96,165,250,0.95)' : 'rgba(255,255,255,0.5)',
                      border: `1px solid ${selectedModel === m.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agent selector */}
          {agents && agents.length > 1 && (
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Agent
              </label>
              <div className="flex flex-wrap gap-1.5">
                {agents.slice(0, 8).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { onSwitchAgent?.(a.id); }}
                    className="px-3 py-1.5 rounded-full text-[11px] active:scale-95 transition-all"
                    style={{
                      background: a.id === agentId ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)',
                      color: a.id === agentId ? 'rgba(192,132,252,0.95)' : 'rgba(255,255,255,0.5)',
                      border: `1px solid ${a.id === agentId ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    {a.emoji} {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice engine selector */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Voice Engine
            </label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'auto', label: 'Auto', color: '255,255,255' },
                { id: 'elevenlabs', label: 'ElevenLabs', color: '99,102,241' },
                { id: 'personaplex', label: 'PersonaPlex', color: '118,185,0' },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSetTtsProvider?.(v.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] active:scale-95 transition-all"
                  style={{
                    background: ttsProvider === v.id ? `rgba(${v.color},0.2)` : 'rgba(255,255,255,0.06)',
                    color: ttsProvider === v.id ? `rgba(${v.color},0.95)` : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${ttsProvider === v.id ? `rgba(${v.color},0.3)` : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Microphone permission denied banner */}
      {micPermissionDenied && (
        <div
          className="mx-5 mb-2 rounded-xl p-4 flex items-start gap-3"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <svg className="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <div>
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Microphone access blocked
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
                ? 'Open Settings \u2192 Safari \u2192 Microphone and allow for this site.'
                : /Android/i.test(navigator.userAgent)
                  ? 'Tap the lock icon in the address bar \u2192 Permissions \u2192 Microphone \u2192 Allow.'
                  : 'Click the lock icon in the address bar \u2192 Site settings \u2192 Microphone \u2192 Allow.'}
            </p>
            <button
              className="mt-2 text-xs px-3 py-1 rounded-full active:scale-95 transition-transform"
              style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
              onClick={async () => {
                setMicPermissionDenied(false);
                const stream = await acquireMic();
                if (stream) {
                  dispatch({ type: 'GREETING_DONE' });
                }
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Conversation log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-3 space-y-3"
        style={{ minHeight: 0 }}
      >
        {turns.map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
          >
            <div
              className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
              style={{
                background:
                  t.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.06)',
                color: t.role === 'user' ? 'rgba(147, 197, 253, 0.95)' : 'rgba(255,255,255,0.85)',
                border: `1px solid ${t.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <VoiceTurnContent text={t.text} role={t.role} />
              {t.mib007Link && (
                <button
                  onClick={() =>
                    window.open(
                      `${window.location.hostname !== 'localhost' ? 'https://app.nirtek.net' : 'https://localhost:5520'}${t.mib007Link}`,
                      '_blank',
                    )
                  }
                  className="block mt-1.5 text-[12px] opacity-70 hover:opacity-100 transition-opacity underline"
                  style={{ color: 'rgba(96, 165, 250, 0.9)' }}
                >
                  View in MIB007 &rarr;
                </button>
              )}
            </div>
          </div>
        ))}
        {(phase === 'thinking' || phase === 'transcribing') && (
          <div className="flex justify-start animate-fadeIn">
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skip briefing overlay */}
      {briefingPlaying && (
        <div
          className="absolute inset-0 z-10 flex items-end justify-center pb-8 cursor-pointer"
          onClick={skipBriefing}
          role="button"
          aria-label="Skip briefing"
        >
          <span
            className="text-[11px] px-4 py-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            Tap anywhere to skip briefing
          </span>
        </div>
      )}

      {/* Voice shortcuts */}
      {shortcuts.length > 0 && state.phase === 'ready' && (
        <div className="px-5 py-1.5 flex flex-wrap gap-2 justify-center">
          {shortcuts.map((s) => (
            <button
              key={s.id}
              className="text-[11px] px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onClick={() => processUserInput(s.pattern)}
            >
              {s.pattern.length > 30 ? s.pattern.slice(0, 28) + '...' : s.pattern}
            </button>
          ))}
        </div>
      )}

      {/* Live transcript */}
      <div className="px-5 min-h-[3rem] flex items-center justify-center">
        {transcript && phase === 'listening' ? (
          <p
            className="text-sm text-center max-w-md leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            &ldquo;{transcript}&rdquo;
          </p>
        ) : phase === 'error' ? (
          <p className="text-xs text-center text-red-400 max-w-sm">{errorMsg}</p>
        ) : null}
      </div>

      {/* Orb */}
      <div
        className="flex flex-col items-center pb-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={handleOrbTap}
          className="relative h-24 w-24 rounded-full flex items-center justify-center active:scale-90"
          style={{
            background:
              phase === 'ready'
                ? 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)'
                : phase === 'listening'
                  ? 'radial-gradient(circle, rgba(239,68,68,0.85) 0%, rgba(220,38,38,0.95) 100%)'
                  : phase === 'speaking'
                    ? 'radial-gradient(circle, rgba(34,197,94,0.8) 0%, rgba(22,163,74,0.9) 100%)'
                    : phase === 'thinking' || phase === 'transcribing'
                      ? 'radial-gradient(circle, rgba(59,130,246,0.8) 0%, rgba(37,99,235,0.9) 100%)'
                      : phase === 'error'
                        ? 'radial-gradient(circle, rgba(239,68,68,0.6) 0%, rgba(185,28,28,0.8) 100%)'
                        : 'radial-gradient(circle, rgba(107,114,128,0.6) 0%, rgba(75,85,99,0.8) 100%)',
            boxShadow: orbGlow,
            transform: `scale(${orbScale})`,
            transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
          }}
          aria-label={
            phase === 'ready'
              ? 'Tap to talk'
              : phase === 'listening'
                ? 'Tap to send'
                : phase === 'transcribing'
                  ? 'Tap to cancel'
                  : phase === 'speaking'
                    ? 'Tap to interrupt'
                    : phase === 'thinking'
                      ? 'Tap to cancel'
                      : phase === 'error'
                        ? 'Tap to retry'
                        : ''
          }
        >
          {phase === 'ready' ? (
            <svg
              className="h-10 w-10 text-white/80 drop-shadow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : phase === 'listening' ? (
            <svg className="h-9 w-9 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : phase === 'speaking' ? (
            <svg
              className="h-9 w-9 text-white drop-shadow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : phase === 'error' ? (
            <svg
              className="h-9 w-9 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <div className="flex gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full bg-white animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full bg-white animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full bg-white animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          )}
          {phase === 'listening' && (
            <span
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                border: `2px solid rgba(255,255,255,${speechActive ? 0.5 : 0.15})`,
                transform: `scale(${speechActive ? 1.2 : 1.05})`,
                transition: 'transform 150ms ease-out, border-color 150ms ease-out',
              }}
            />
          )}
        </button>
        <span
          className="text-[11px] mt-3 font-medium tracking-wide"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {phaseLabel}
        </span>
        {phase === 'ready' && (
          <p
            className="text-[10px] mt-1.5 text-center max-w-[220px] leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Tap to talk
          </p>
        )}
        {phase === 'listening' && (
          <p
            className="text-[10px] mt-1.5 text-center max-w-[220px] leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Tap to send
          </p>
        )}
        {phase === 'transcribing' && (
          <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Tap to cancel
          </p>
        )}
        {phase === 'speaking' && (
          <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Tap to interrupt
          </p>
        )}
        {phase === 'thinking' && (
          <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Tap to cancel
          </p>
        )}
        {phase === 'error' && (
          <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Tap to retry
          </p>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
