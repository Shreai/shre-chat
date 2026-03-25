import { useState, useEffect } from "react";

export interface UseWakeWordReturn {
  wakeListenerReady: boolean;
}

export function useWakeWord(
  voiceAssistantOpen: boolean,
  isRecording: boolean,
  setVoiceAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>,
): UseWakeWordReturn {
  const [wakeListenerReady, setWakeListenerReady] = useState(false);

  // Activate after first user interaction (tap/click) to satisfy iOS gesture requirement
  useEffect(() => {
    if (wakeListenerReady) return;
    const activate = () => {
      setWakeListenerReady(true);
      document.removeEventListener("click", activate);
      document.removeEventListener("touchstart", activate);
    };
    document.addEventListener("click", activate, { once: true });
    document.addEventListener("touchstart", activate, { once: true });
    return () => {
      document.removeEventListener("click", activate);
      document.removeEventListener("touchstart", activate);
    };
  }, [wakeListenerReady]);

  // SpeechRecognition wake word detection ("shre shre", "hey shre", etc.)
  useEffect(() => {
    if (!wakeListenerReady || voiceAssistantOpen || isRecording) return;
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    let active = true;
    let wake: SpeechRecognition | null = null;
    let retryCount = 0;

    function startWake() {
      if (!active) return;
      const w = new SR();
      w.continuous = false;
      w.interimResults = true;
      w.lang = "en-US";
      w.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.toLowerCase();
          if (t.includes("shre shre") || t.includes("shrey shrey") || t.includes("hey shre") || t.includes("shray shray")) {
            try { w.stop(); } catch (_) { void _; }
            wake = null;
            setVoiceAssistantOpen(true);
            return;
          }
        }
      };
      w.onend = () => { if (active) { retryCount = 0; setTimeout(startWake, 300); } };
      w.onerror = (e: any) => {
        if (!active) return;
        if (e.error === "not-allowed" || retryCount > 5) return;
        retryCount++;
        setTimeout(startWake, 2000);
      };
      try { w.start(); wake = w; retryCount = 0; } catch { /* gesture required */ }
    }
    startWake();
    return () => { active = false; if (wake) { try { wake.abort(); } catch (_) { void _; } } };
  }, [wakeListenerReady, voiceAssistantOpen, isRecording, setVoiceAssistantOpen]);

  return { wakeListenerReady };
}
