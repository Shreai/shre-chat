import { stripMd } from './voice-utils';
/** Create a speak function bound to the given refs/deps. */
export function createSpeak(deps) {
    const { ttsVoice, ttsProvider, activeRef, ttsAbortRef, ttsAudioRef, mediaStreamRef, phaseRef, dispatch, vad, stopListeningHardware } = deps;
    return function speak(text) {
        return new Promise((resolve) => {
            const plain = stripMd(text);
            if (!plain) {
                resolve();
                return;
            }
            // Stop SR/VAD/MediaRecorder BEFORE speaking to prevent mic picking up TTS audio
            stopListeningHardware?.();
            dispatch({ type: 'START_SPEAKING' });
            ttsAbortRef.current?.abort();
            if (ttsAudioRef.current) {
                ttsAudioRef.current.pause();
                ttsAudioRef.current.src = '';
                ttsAudioRef.current = null;
            }
            window.speechSynthesis?.cancel();
            const ctrl = new AbortController();
            ttsAbortRef.current = ctrl;
            let resolved = false;
            const safetyTimer = setTimeout(() => {
                ctrl.abort();
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }, 25_000);
            const done = () => {
                if (resolved)
                    return;
                resolved = true;
                clearTimeout(safetyTimer);
                // Safety: if we're still in speaking phase after TTS completes, dispatch SPEAK_DONE
                // This prevents the "black hole" where phase gets stuck on speaking
                if (activeRef.current && phaseRef.current === 'speaking') {
                    dispatch({ type: 'SPEAK_DONE' });
                }
                resolve();
            };
            console.log('[voice-tts] speak:', plain.slice(0, 60));
            fetch('/api/tts/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: plain, voice: ttsVoice, provider: ttsProvider || 'auto' }),
                signal: ctrl.signal,
            })
                .then(async (r) => {
                console.log('[voice-tts] stream response:', r.status, r.headers.get('content-type'));
                if (!r.ok || !r.body)
                    throw new Error(`TTS ${r.status}`);
                const reader = r.body.getReader();
                const chunks = [];
                let streamDone = false;
                while (!streamDone) {
                    const { done: readerDone, value } = await reader.read();
                    if (readerDone) {
                        streamDone = true;
                        break;
                    }
                    if (value)
                        chunks.push(value);
                    if (chunks.length === 1 && value && value.byteLength > 8192) {
                        break;
                    }
                }
                if (!activeRef.current) {
                    done();
                    return;
                }
                if (!streamDone) {
                    const readRest = async () => {
                        try {
                            while (true) {
                                const { done: d, value: v } = await reader.read();
                                if (d)
                                    break;
                                if (v)
                                    chunks.push(v);
                            }
                        }
                        catch (err) {
                            console.debug('TTS stream read interrupted', err);
                        }
                    };
                    await readRest();
                }
                if (!activeRef.current) {
                    done();
                    return;
                }
                const blob = new Blob(chunks, { type: 'audio/mpeg' });
                console.log('[voice-tts] blob created:', blob.size, 'bytes, chunks:', chunks.length);
                if (!blob.size) {
                    console.warn('[voice-tts] empty blob, skipping');
                    done();
                    return;
                }
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                ttsAudioRef.current = audio;
                // Start barge-in monitoring while speaking
                const stream = mediaStreamRef.current;
                if (stream?.active) {
                    vad.startBargeInMonitor(stream, () => {
                        if (phaseRef.current === 'speaking') {
                            audio.pause();
                            audio.src = '';
                            URL.revokeObjectURL(url);
                            ttsAudioRef.current = null;
                            ttsAbortRef.current?.abort();
                            done();
                            dispatch({ type: 'BARGE_IN' });
                        }
                    });
                }
                const audioCleanup = () => {
                    URL.revokeObjectURL(url);
                    ttsAudioRef.current = null;
                    vad.stop();
                    done();
                };
                let audioPlaying = false;
                const fallbackToSpeechSynthesis = () => {
                    if (audioPlaying)
                        return;
                    URL.revokeObjectURL(url);
                    ttsAudioRef.current = null;
                    vad.stop();
                    console.log('[voice-tts] falling back to browser speechSynthesis');
                    if (window.speechSynthesis) {
                        const u = new SpeechSynthesisUtterance(plain.slice(0, 1000));
                        u.rate = 1.0;
                        const ft = setTimeout(() => {
                            window.speechSynthesis.cancel();
                            done();
                        }, 15_000);
                        u.onend = () => {
                            clearTimeout(ft);
                            done();
                        };
                        u.onerror = () => {
                            clearTimeout(ft);
                            done();
                        };
                        window.speechSynthesis.speak(u);
                    }
                    else {
                        done();
                    }
                };
                audio.onended = audioCleanup;
                audio.onerror = (e) => {
                    if (audioPlaying) {
                        audioCleanup();
                        return;
                    }
                    console.error('[voice-tts] audio error:', e);
                    fallbackToSpeechSynthesis();
                };
                audio
                    .play()
                    .then(() => {
                    audioPlaying = true;
                    console.log('[voice-tts] playing audio');
                })
                    .catch((e) => {
                    console.error('[voice-tts] play blocked:', e);
                    fallbackToSpeechSynthesis();
                });
            })
                .catch((err) => {
                if (err.name === 'AbortError') {
                    done();
                    return;
                }
                console.warn('[voice-tts] stream failed, trying buffered:', err.message);
                fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ input: plain, voice: ttsVoice, provider: ttsProvider || 'auto' }),
                    signal: ctrl.signal,
                })
                    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`TTS ${r.status}`))))
                    .then((blob) => {
                    if (!activeRef.current || !blob.size) {
                        done();
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    ttsAudioRef.current = audio;
                    const c = () => {
                        URL.revokeObjectURL(url);
                        ttsAudioRef.current = null;
                        done();
                    };
                    audio.onended = c;
                    audio.onerror = c;
                    audio.play().catch(c);
                })
                    .catch(() => {
                    if (window.speechSynthesis) {
                        const u = new SpeechSynthesisUtterance(plain.slice(0, 1000));
                        u.rate = 1.0;
                        const ft = setTimeout(() => {
                            window.speechSynthesis.cancel();
                            done();
                        }, 15_000);
                        u.onend = () => {
                            clearTimeout(ft);
                            done();
                        };
                        u.onerror = () => {
                            clearTimeout(ft);
                            done();
                        };
                        window.speechSynthesis.speak(u);
                    }
                    else
                        done();
                });
            });
        });
    };
}
