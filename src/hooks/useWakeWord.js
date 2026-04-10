import { useState, useEffect } from 'react';
import { getSpeechLocale } from '../i18n';
export function useWakeWord(voiceAssistantOpen, isRecording, setVoiceAssistantOpen) {
    const [wakeListenerReady, setWakeListenerReady] = useState(false);
    // Activate after first user interaction (tap/click) to satisfy iOS gesture requirement
    useEffect(() => {
        if (wakeListenerReady)
            return;
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
    }, [wakeListenerReady]);
    // SpeechRecognition wake word detection ("shre shre", "hey shre", etc.)
    useEffect(() => {
        if (!wakeListenerReady || voiceAssistantOpen || isRecording)
            return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            // iOS Safari doesn't support SpeechRecognition — wake word unavailable.
            // Users can still tap the mic button to start voice input.
            setWakeListenerReady(false);
            return;
        }
        let active = true;
        let wake = null;
        let retryCount = 0;
        function startWake() {
            if (!active)
                return;
            const w = new SR();
            w.continuous = false;
            w.interimResults = true;
            w.lang = getSpeechLocale();
            w.onresult = (e) => {
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const t = e.results[i][0].transcript.toLowerCase();
                    if (t.includes('shre shre') ||
                        t.includes('shrey shrey') ||
                        t.includes('hey shre') ||
                        t.includes('shray shray')) {
                        try {
                            w.stop();
                        }
                        catch (_) {
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
            w.onerror = (e) => {
                if (!active)
                    return;
                if (e.error === 'not-allowed' || retryCount > 5)
                    return;
                retryCount++;
                setTimeout(startWake, 2000);
            };
            try {
                w.start();
                wake = w;
                retryCount = 0;
            }
            catch {
                /* gesture required */
            }
        }
        startWake();
        return () => {
            active = false;
            if (wake) {
                try {
                    wake.abort();
                }
                catch (_) {
                    void _;
                }
            }
        };
    }, [wakeListenerReady, voiceAssistantOpen, isRecording, setVoiceAssistantOpen]);
    return { wakeListenerReady };
}
