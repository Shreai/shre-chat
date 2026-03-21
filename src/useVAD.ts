/**
 * useVAD — Voice Activity Detection hook using AudioContext AnalyserNode.
 *
 * Computes RMS energy from the mic stream and fires callbacks when speech
 * starts/stops. Replaces the fixed 5s silence timer with adaptive detection.
 */

import { useRef, useCallback } from "react";

interface VADOptions {
  /** RMS threshold to consider as speech. Default 0.015. */
  speechThreshold?: number;
  /** Milliseconds of silence before firing onSilence. Default 4000. */
  silenceDuration?: number;
  /** Called when sustained silence detected after speech. */
  onSilence?: () => void;
  /** Called when speech energy detected (first frame above threshold). */
  onSpeechStart?: () => void;
  /** Called when speech energy drops below threshold. */
  onSpeechEnd?: () => void;
}

export function useVAD(options: VADOptions = {}) {
  const {
    speechThreshold = 0.015,
    silenceDuration = 4000,
    onSilence,
    onSpeechStart,
    onSpeechEnd,
  } = options;

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef<number>(0);
  const hadSpeechRef = useRef(false);
  const activeRef = useRef(false);
  const dataRef = useRef<Uint8Array | null>(null);

  // Store latest callbacks in refs so the animation frame loop sees current values
  const onSilenceRef = useRef(onSilence);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onSilenceRef.current = onSilence;
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  const start = useCallback((stream: MediaStream) => {
    if (activeRef.current) return;
    activeRef.current = true;
    hadSpeechRef.current = false;
    isSpeakingRef.current = false;
    silenceStartRef.current = 0;

    // Reuse or create AudioContext
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufLen = analyser.fftSize;
    const data = new Uint8Array(bufLen);
    dataRef.current = data;

    const tick = () => {
      if (!activeRef.current) return;

      analyser.getByteTimeDomainData(data);

      // Compute RMS energy (0-1 range)
      let sum = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bufLen);

      const now = Date.now();
      if (rms >= speechThreshold) {
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          hadSpeechRef.current = true;
          onSpeechStartRef.current?.();
        }
        silenceStartRef.current = 0;
      } else {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false;
          onSpeechEndRef.current?.();
          silenceStartRef.current = now;
        } else if (silenceStartRef.current === 0 && hadSpeechRef.current) {
          silenceStartRef.current = now;
        }

        // Fire silence callback if enough quiet time after speech
        if (hadSpeechRef.current && silenceStartRef.current > 0 && now - silenceStartRef.current >= silenceDuration) {
          activeRef.current = false; // stop polling
          onSilenceRef.current?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [speechThreshold, silenceDuration]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* already disconnected */ }
      sourceRef.current = null;
    }
    analyserRef.current = null;
    dataRef.current = null;
    // Suspend AudioContext to free resources (cheaper than close, allows resume)
    if (ctxRef.current && ctxRef.current.state === "running") {
      ctxRef.current.suspend().catch(() => {});
    }
  }, []);

  /** Check if speech energy is currently above threshold (for barge-in detection) */
  const checkEnergy = useCallback((): boolean => {
    if (!analyserRef.current || !dataRef.current) return false;
    analyserRef.current.getByteTimeDomainData(dataRef.current);
    const bufLen = analyserRef.current.fftSize;
    let sum = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = (dataRef.current[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / bufLen) >= speechThreshold;
  }, [speechThreshold]);

  /** Get the shared AudioContext (for TTS playback to reuse) */
  const getAudioContext = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  /** Start barge-in monitoring — polls energy during speaking phase */
  const startBargeInMonitor = useCallback((stream: MediaStream, onBargeIn: () => void) => {
    if (!activeRef.current) {
      // Set up analyser if not already connected
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const bufLen = analyser.fftSize;
      dataRef.current = new Uint8Array(bufLen);
    }

    // Higher threshold for barge-in to avoid TTS speaker output triggering it
    const bargeThreshold = speechThreshold * 2.5;
    let consecutiveFrames = 0;
    const REQUIRED_FRAMES = 5; // ~80ms of sustained speech

    const poll = () => {
      if (!analyserRef.current || !dataRef.current) return;
      analyserRef.current.getByteTimeDomainData(dataRef.current);
      const bufLen = analyserRef.current.fftSize;
      let sum = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = (dataRef.current[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bufLen);
      if (rms >= bargeThreshold) {
        consecutiveFrames++;
        if (consecutiveFrames >= REQUIRED_FRAMES) {
          onBargeIn();
          return;
        }
      } else {
        consecutiveFrames = 0;
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
  }, [speechThreshold]);

  /** Fully close AudioContext — call on component unmount to prevent memory leaks */
  const destroy = useCallback(() => {
    stop();
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, [stop]);

  return { start, stop, destroy, checkEnergy, getAudioContext, startBargeInMonitor };
}
