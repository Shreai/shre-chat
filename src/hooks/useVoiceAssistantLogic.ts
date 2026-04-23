import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { voiceReducer, initialVoiceState } from '../voiceStateMachine';
import type { VoicePhase } from '../voiceStateMachine';
import { useVAD } from '../useVAD';
import { useProactiveNotifications } from './useProactiveNotifications';
import { getSpeechLocale } from '../i18n';
import {
  sendMessage as sendChatMessage,
  type ChatMessage,
  type StreamCallbacks,
} from '../router-client';

// ── Extracted modules ──
import {
  stripMd,
  detectCmd,
  detectAgentSwitch,
  type AgentOption,
  type Turn,
  type VoiceShortcut,
} from '../voice/voice-utils';
import { createSpeak } from '../voice/voice-tts';
import { getOrRequestStream, releaseCachedStream } from './useVoiceRecording';

export interface UseVoiceAssistantLogicParams {
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
}

export function useVoiceAssistantLogic(params: UseVoiceAssistantLogicParams) {
  const {
    open,
    onClose,
    messages,
    agentName,
    agentId,
    ttsVoice,
    ttsProvider,
    agents,
    onSwitchAgent,
    onVoiceTurn,
    routerMode,
  } = params;

  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [shortcuts, setShortcuts] = useState<VoiceShortcut[]>([]);
  const [proactiveMode, setProactiveMode] = useState(false);

  const {
    pendingNotifs,
    speakNext,
    clearQueue,
    isConnected: notifConnected,
  } = useProactiveNotifications(open && proactiveMode);

  const activeRef = useRef(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
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
            const serverTurns: Turn[] = data.turns.map(
              (t: { role: string; content?: string; text?: string }) => ({
                role: (t.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                text: t.content || t.text || '',
              }),
            );
            setTurns(serverTurns.slice(-20));
            turnHistoryRef.current = serverTurns.slice(-20);
          }
        })
        .catch(() => {
          void 0;
        });
    }
  }, []);

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

  const acquireMic = useCallback(async (): Promise<MediaStream | null> => {
    if (mediaStreamRef.current?.active) return mediaStreamRef.current;
    try {
      const stream = await getOrRequestStream();
      mediaStreamRef.current = stream;
      return stream;
    } catch (err: unknown) {
      console.debug('mic acquire failed', err);
      const error = err as Error;
      if (error?.name === 'NotAllowedError') {
        dispatch({ type: 'ERROR', message: 'Microphone access denied' });
      } else if (error?.name === 'NotFoundError') {
        dispatch({ type: 'ERROR', message: 'No microphone found' });
      }
      return null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    mediaStreamRef.current = null;
    releaseCachedStream();
  }, []);

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
    audioChunksRef.current = [];
    releaseMic();
    window.speechSynthesis?.cancel();
    dispatch({ type: 'CLOSE' });
  }, [vad, releaseMic]);

  const stopListeningHardware = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }
    try {
      vad.stop();
    } catch {
      /* ok */
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ok */
      }
    }
  }, [vad]);

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
    [ttsVoice, ttsProvider, vad, stopListeningHardware],
  );

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
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return '';
        console.error('[voice-chat]', err);
        return "Sorry, I couldn't process that right now. Try again.";
      }
    },
    [agentId, agentName, messages, routerMode],
  );

  const transcribeWithWhisper = useCallback(async (audioBlob: Blob): Promise<string> => {
    if (whisperAbortRef.current) {
      whisperAbortRef.current.abort();
      whisperAbortRef.current = null;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const ctrl = new AbortController();
      whisperAbortRef.current = ctrl;
      timeout = setTimeout(() => ctrl.abort(), 30_000);
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
      if (timeout) clearTimeout(timeout);
      console.debug('whisper transcription failed', err);
      whisperAbortRef.current = null;
      return '';
    }
  }, []);

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

  const clarifyContextRef = useRef<string | null>(null);

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
            if (activeRef.current && (phaseRef.current as VoicePhase) === 'thinking')
              dispatch({ type: 'INTERRUPT' });
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
              if ((phaseRef.current as VoicePhase) === 'thinking') dispatch({ type: 'INTERRUPT' });
              return;
            }
            if (!response)
              response = "Hmm, I didn't get a response back. Could you try that again?";
          }
        }

        if (!activeRef.current) {
          const p = phaseRef.current as VoicePhase;
          if (p === 'thinking' || p === 'speaking' || p === 'transcribing')
            dispatch({ type: 'INTERRUPT' });
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
  );

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
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

      const SR =
        window.SpeechRecognition ||
        (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition })
          .webkitSpeechRecognition;
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
          const currentPhase = phaseRef.current;
          if (activeRef.current && currentPhase === 'listening') {
            try {
              rec.start();
            } catch (err) {
              console.debug('SR restart failed', err);
            }
          }
        };
        rec.onerror = (e: SpeechRecognitionErrorEvent) => {
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
        const p = phaseRef.current as VoicePhase;
        if (p === 'transcribing' || p === 'thinking') dispatch({ type: 'INTERRUPT' });
      }
    }
  }, [vad, stopRecording, transcribeWithWhisper, processUserInput]);

  // Handle barge-in from VAD or programmatic events
  useEffect(() => {
    const handleBargeIn = () => {
      if (phaseRef.current === 'speaking' || phaseRef.current === 'thinking') {
        console.debug('[voice] Barge-in detected, interrupting...');
        ttsAbortRef.current?.abort();
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.src = '';
          ttsAudioRef.current = null;
        }
        window.speechSynthesis?.cancel();
        aiAbortRef.current?.abort();
        dispatch({ type: 'INTERRUPT' });
        setTimeout(() => {
          if (activeRef.current && phaseRef.current === 'ready') {
            startListening();
          }
        }, 100);
      }
    };
    window.addEventListener('shre-barge-in', handleBargeIn);
    return () => window.removeEventListener('shre-barge-in', handleBargeIn);
  }, [startListening]);

  // Monitor for barge-in speech while AI is speaking
  useEffect(() => {
    if (state.phase !== 'speaking' || !activeRef.current) return;

    let monitorActive = true;
    const checkBargeIn = async () => {
      const stream = await acquireMic();
      if (!stream || !monitorActive) return;

      vad.startBargeInMonitor(stream, () => {
        if (monitorActive && phaseRef.current === 'speaking') {
          window.dispatchEvent(new CustomEvent('shre-barge-in'));
        }
      });
    };

    checkBargeIn();
    return () => {
      monitorActive = false;
    };
  }, [state.phase, acquireMic, vad]);

  // Save voice session on close
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

  // Initialize on open
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
  }, [open, cleanup, acquireMic]);

  // Auto-listen after speaking
  const prevPhaseRef = useRef<VoicePhase>('idle');
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase as VoicePhase;
    if (
      state.phase === 'ready' &&
      (prev === 'speaking' || prev === 'thinking') &&
      activeRef.current &&
      open
    ) {
      const timer = setTimeout(() => {
        if (activeRef.current && phaseRef.current === 'ready') {
          startListening();
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [state.phase, open, startListening]);

  // Stuck-phase watchdog
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
    checkStuck();
    const interval = setInterval(checkStuck, 5_000);
    return () => {
      if (stuckTimer) clearTimeout(stuckTimer);
      clearInterval(interval);
    };
  }, [open, state.phase]);

  const handleOrbTap = useCallback(() => {
    const phase = phaseRef.current;
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

  const handleProactiveTurn = useCallback(
    (text: string) => {
      const notifTurn: Turn = { role: 'assistant', text };
      setTurns((prev) => [...prev, notifTurn]);
      turnHistoryRef.current = [...turnHistoryRef.current, notifTurn];
      onVoiceTurn?.({ role: 'assistant', content: text });
      speak(text)
        .then(() => {
          if (activeRef.current && phaseRef.current === 'speaking')
            dispatch({ type: 'SPEAK_DONE' });
        })
        .catch(() => {
          if (activeRef.current && phaseRef.current === 'speaking') dispatch({ type: 'INTERRUPT' });
        });
    },
    [speak, onVoiceTurn],
  );

  return {
    state,
    turns,
    setTurns,
    shortcuts,
    setShortcuts,
    proactiveMode,
    setProactiveMode,
    notifConnected,
    pendingNotifs,
    speakNext,
    clearQueue,
    handleOrbTap,
    cleanup,
    startListening,
    finishListening,
    handleProactiveTurn,
    voiceSessionId: voiceSessionIdRef.current,
  };
}
