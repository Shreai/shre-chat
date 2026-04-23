import { useState, useEffect } from 'react';
import { getSpeechLocale } from '../i18n';
import { usePreferences } from '../preferences-store';

export interface UseWakeWordReturn {
  wakeListenerReady: boolean;
}

export function useWakeWord(
  voiceAssistantOpen: boolean,
  isRecording: boolean,
  setVoiceAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>,
  voiceMode?: boolean,
): UseWakeWordReturn {
  const [wakeListenerReady, setWakeListenerReady] = useState(false);
  // Wake word grabs the audio session (continuous SpeechRecognition on macOS
  // Chrome can interrupt background media). Opt-in only — keyed off the same
  // micEnabled preference that gates explicit voice features.
  const micEnabled = usePreferences((s) => s.micEnabled);

  // Activate after first user interaction (tap/click) to satisfy iOS gesture requirement
  useEffect(() => {
    if (wakeListenerReady || !micEnabled) return;
    const activate = () => {
      setWakeListenerReady(true);
      document.removeEventListener('click', activate);
      document.removeEventListener('touchstart', activate);
    };
    document.addEventListener('click', activate, { once: true });
    document.addEventListener('touchstart', activate, { once: true });
    return () => {
      document.removeEventListener('click', activate);
      document.removeEventListener('touchstart', activate);
    };
  }, [wakeListenerReady, micEnabled]);

  // When the user turns the mic off, tear the wake listener down so it can't
  // keep restarting via the 300ms onend loop below.
  useEffect(() => {
    if (!micEnabled && wakeListenerReady) {
      setWakeListenerReady(false);
    }
  }, [micEnabled, wakeListenerReady]);

  // SpeechRecognition wake word detection ("shre shre", "hey shre", etc.)
  useEffect(() => {
    if (!wakeListenerReady || !micEnabled || voiceAssistantOpen || isRecording || voiceMode) return;
    const SR =
      window.SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition })
        .webkitSpeechRecognition;
    if (!SR) {
      // iOS Safari doesn't support SpeechRecognition — wake word unavailable.
      // Users can still tap the mic button to start voice input.
      setWakeListenerReady(false);
      return;
    }
    let active = true;
    let wake: SpeechRecognition | null = null;
    let retryCount = 0;

    function startWake() {
      if (!active) return;
      const w = new SR();
      w.continuous = false;
      w.interimResults = true;
      w.lang = getSpeechLocale();
      w.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.toLowerCase();
          if (
            t.includes('shre shre') ||
            t.includes('shrey shrey') ||
            t.includes('hey shre') ||
            t.includes('shray shray')
          ) {
            try {
              w.stop();
            } catch (_) {
              void _;
            }
            wake = null;
            setVoiceAssistantOpen(true);
            return;
          }
        }
      };
      w.onend = () => {
        if (active) {
          retryCount = 0;
          setTimeout(startWake, 300);
        }
      };
      w.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (!active) return;
        if (e.error === 'not-allowed' || retryCount > 5) return;
        retryCount++;
        setTimeout(startWake, 2000);
      };
      try {
        w.start();
        wake = w;
        retryCount = 0;
      } catch {
        /* gesture required */
      }
    }
    startWake();
    return () => {
      active = false;
      if (wake) {
        try {
          wake.abort();
        } catch (_) {
          void _;
        }
      }
    };
  }, [
    wakeListenerReady,
    micEnabled,
    voiceAssistantOpen,
    isRecording,
    voiceMode,
    setVoiceAssistantOpen,
  ]);

  return { wakeListenerReady };
}
