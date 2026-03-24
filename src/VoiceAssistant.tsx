import { useReducer, useEffect, useRef, useCallback, useState, lazy, Suspense, memo } from "react";
import { voiceReducer, initialVoiceState } from "./voiceStateMachine";
import type { VoiceAction, VoicePhase } from "./voiceStateMachine";
import { useVAD } from "./useVAD";
import { useProactiveNotifications } from "./hooks/useProactiveNotifications";
import { sendMessage as sendChatMessage, type ChatMessage, type StreamCallbacks } from "./openclaw";

// Lazy-load rich rendering — keeps initial voice chunk small
const Markdown = lazy(() => import("react-markdown"));
const DataCard = lazy(() => import("./components/DataCard"));
const remarkGfmPromise = import("remark-gfm").then(m => m.default);
let remarkGfmPlugin: any = null;
remarkGfmPromise.then(p => { remarkGfmPlugin = p; });

/**
 * VoiceAssistant v4 — full-screen conversational voice overlay.
 *
 * Architecture:
 *   - State machine (useReducer) — explicit phases and transitions
 *   - Whisper-primary STT — MediaRecorder captures, Whisper transcribes
 *   - Browser SR for live interim preview only
 *   - VAD (energy-threshold) — replaces fixed silence timer
 *   - Streaming TTS — chunked audio playback via fetch stream
 *   - Barge-in — user speech during TTS auto-interrupts
 *   - Voice turns persisted to parent chat session
 */

interface AgentOption { id: string; name: string; emoji: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  agentName: string;
  agentEmoji: string;
  agentId: string;
  ttsVoice: string;
  agents?: AgentOption[];
  onSwitchAgent?: (agentId: string) => void;
  onVoiceTurn?: (turn: { role: "user" | "assistant"; content: string }) => void;
  openclawMode?: boolean;
}

interface Turn { role: "user" | "assistant"; text: string; mib007Link?: string; }
interface VoiceShortcut { id: string; pattern: string; intent: string; hit_count: number; lastUsed: number; }

/** Strip markdown for TTS — converts tables to spoken form, removes formatting */
function stripMd(t: string): string {
  let s = t.replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking>[\s\S]*$/gi, "")
    .replace(/<\/?think(?:ing)?>/gi, "")
    .replace(/<thinking_mode>[\s\S]*?<\/thinking_mode>/gi, "")
    .replace(/<reasoning_effort>[\s\S]*?<\/reasoning_effort>/gi, "");
  // Convert markdown tables to spoken-friendly form before stripping
  // "| Item | Qty | Revenue |" rows → "Item: Qty, Revenue" or similar
  s = s.replace(/(?:^\|.+\|\s*\n\|[-:\s|]+\|\s*\n)((?:^\|.+\|\s*\n?)+)/gm, (block) => {
    const rows = block.trim().split("\n").filter(r => r.includes("|") && !/^[\s|:-]+$/.test(r));
    if (rows.length === 0) return block;
    // Parse header row for column names
    const headerCells = rows[0].split("|").map(c => c.trim()).filter(Boolean);
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) return block;
    // Speak first few rows: "Column1 Value1, Column2 Value2"
    const spoken = dataRows.slice(0, 5).map(row => {
      const cells = row.split("|").map(c => c.trim()).filter(Boolean);
      return cells.map((c, i) => headerCells[i] ? `${headerCells[i]}: ${c}` : c).join(", ");
    }).join(". ");
    const extra = dataRows.length > 5 ? `. And ${dataRows.length - 5} more rows.` : "";
    return spoken + extra + " ";
  });
  return s.replace(/```[\s\S]*?```/g, " code block omitted ").replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/#{1,6}\s+/g, "").replace(/[*_~]{1,3}/g, "").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").trim().slice(0, 4096);
}

function detectCmd(text: string): "summarize" | "read_last" | "goodbye" | null {
  const l = text.toLowerCase().trim();
  if (/\b(summarize|summary|summarise)\b/.test(l)) return "summarize";
  if (/\b(read last|read the last|last message)\b/.test(l)) return "read_last";
  if (/\b(goodbye|good bye|bye bye|bye|exit|close|stop talking|thanks|thank you|that's all|thats all|i'm done|im done|see you|later|good night|goodnight)\b/.test(l)) return "goodbye";
  return null;
}

function detectAgentSwitch(text: string, agents?: AgentOption[]): string | null {
  if (!agents?.length) return null;
  const l = text.toLowerCase().trim();
  const m = l.match(/\b(?:switch to|talk to|connect me to|let me talk to|get me|bring|put on)\s+(.+?)(?:\s+please)?$/i);
  if (!m) return null;
  const target = m[1].toLowerCase();
  return agents.find((a) => a.name.toLowerCase() === target || a.id.toLowerCase() === target)?.id || null;
}

// ── Rich content renderer for assistant voice turns ──
const VoiceTurnContent = memo(({ text, role }: { text: string; role: string }) => {
  if (role === "user") return <>{text}</>;

  // Assistant turns get markdown + data cards
  return (
    <Suspense fallback={<span>{text}</span>}>
      <DataCard content={text} />
      <Markdown
        remarkPlugins={remarkGfmPlugin ? [remarkGfmPlugin] : []}
        components={{
          // Tables: styled for dark voice theme
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", margin: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead style={{ background: "rgba(255,255,255,0.06)" }}>{children}</thead>;
          },
          th({ children }) {
            return (
              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{ padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontFamily: "'SF Mono', monospace", fontSize: 12 }}>
                {children}
              </td>
            );
          },
          // Strong: accent color
          strong({ children }) {
            return <strong style={{ color: "rgba(255,255,255,0.95)", fontWeight: 600 }}>{children}</strong>;
          },
          // Links
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(96,165,250,0.9)", textDecoration: "underline" }}>{children}</a>;
          },
          // Lists: tighter spacing for voice context
          ul({ children }) {
            return <ul style={{ paddingLeft: 16, margin: "4px 0", listStyleType: "disc" }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 16, margin: "4px 0", listStyleType: "decimal" }}>{children}</ol>;
          },
          li({ children }) {
            return <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>;
          },
          // Code: inline only in voice (no big code blocks expected)
          code({ className, children }) {
            const isBlock = Boolean(className) || String(children).includes("\n");
            if (isBlock) {
              return (
                <pre style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 10px", margin: "6px 0", overflowX: "auto", fontSize: 11, lineHeight: 1.4 }}>
                  <code style={{ fontFamily: "'SF Mono', monospace", color: "rgba(255,255,255,0.8)" }}>{children}</code>
                </pre>
              );
            }
            return <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em", fontFamily: "'SF Mono', monospace" }}>{children}</code>;
          },
          // Paragraphs: compact
          p({ children }) {
            return <p style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</p>;
          },
          // Headers: scaled down for voice bubbles
          h1({ children }) { return <div style={{ fontSize: 16, fontWeight: 700, margin: "8px 0 4px", color: "rgba(255,255,255,0.95)" }}>{children}</div>; },
          h2({ children }) { return <div style={{ fontSize: 15, fontWeight: 600, margin: "6px 0 3px", color: "rgba(255,255,255,0.9)" }}>{children}</div>; },
          h3({ children }) { return <div style={{ fontSize: 14, fontWeight: 600, margin: "4px 0 2px", color: "rgba(255,255,255,0.85)" }}>{children}</div>; },
          // Horizontal rule
          hr() { return <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />; },
        }}
      >
        {text}
      </Markdown>
    </Suspense>
  );
});

export default function VoiceAssistant({ open, onClose, messages, agentName, agentEmoji, agentId, ttsVoice, agents, onSwitchAgent, onVoiceTurn, openclawMode }: Props) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<VoiceShortcut[]>([]);
  const [briefingPlaying, setBriefingPlaying] = useState(false);
  const [proactiveMode, setProactiveMode] = useState(false);
  const { pendingNotifs, speakNext, clearQueue, isConnected: notifConnected } = useProactiveNotifications(open && proactiveMode);
  const briefingSkippedRef = useRef(false);

  const activeRef = useRef(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnHistoryRef = useRef<Turn[]>([]);

  // ── Persist voice turns to sessionStorage + server for context continuity ──
  const voiceSessionIdRef = useRef<string>(sessionStorage.getItem("shre-voice-session-id") || "");
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore turns: try sessionStorage first, then fall back to server
  useEffect(() => {
    let restored = false;
    try {
      const saved = sessionStorage.getItem("shre-voice-turns");
      if (saved) {
        const parsed = JSON.parse(saved) as Turn[];
        const lastSaved = Number(sessionStorage.getItem("shre-voice-turns-ts") || "0");
        if (Date.now() - lastSaved < 30 * 60 * 1000 && parsed.length > 0) {
          setTurns(parsed);
          turnHistoryRef.current = parsed;
          restored = true;
        } else {
          sessionStorage.removeItem("shre-voice-turns");
          sessionStorage.removeItem("shre-voice-turns-ts");
        }
      }
    } catch {}

    // If sessionStorage was empty/expired but we have a session ID, restore from server
    if (!restored && voiceSessionIdRef.current) {
      fetch(`/api/voice-turns/${voiceSessionIdRef.current}`, { signal: AbortSignal.timeout(3000) })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.turns?.length) {
            const serverTurns: Turn[] = data.turns.map((t: any) => ({
              role: t.role as "user" | "assistant",
              text: t.content || "",
            }));
            setTurns(serverTurns.slice(-20));
            turnHistoryRef.current = serverTurns.slice(-20);
          }
        })
        .catch(() => {}); // non-fatal
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist turns to sessionStorage + debounced server sync
  useEffect(() => {
    if (turns.length > 0) {
      try {
        sessionStorage.setItem("shre-voice-turns", JSON.stringify(turns.slice(-20)));
        sessionStorage.setItem("shre-voice-turns-ts", String(Date.now()));
      } catch {}

      // Debounced server sync (every 5 seconds max)
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        const sid = voiceSessionIdRef.current;
        if (!sid) return;
        fetch("/api/voice-turns/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, turns: turns.slice(-20) }),
        }).catch(() => {}); // non-fatal
      }, 5000);
    }
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [turns]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const whisperAbortRef = useRef<AbortController | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Store phase in ref for callbacks that capture stale closures
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, state.transcript]);

  // ── VAD setup (speech detection for visual feedback only — no auto-submit) ──
  const vad = useVAD({
    speechThreshold: 0.015,
    silenceDuration: 4000,
    onSilence: useCallback(() => {
      // Push-to-talk: silence does NOT auto-submit — user taps to finish
    }, []),
    onSpeechStart: useCallback(() => {
      dispatchRef.current({ type: "SPEECH_DETECTED" });
    }, []),
    onSpeechEnd: useCallback(() => {
      dispatchRef.current({ type: "SPEECH_ENDED" });
    }, []),
  });

  // ── Mic stream — acquire once, reuse across turns ──
  const acquireMic = useCallback(async (): Promise<MediaStream | null> => {
    if (mediaStreamRef.current?.active) return mediaStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      return stream;
    } catch {
      return null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  // ── Cleanup ──
  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (recRef.current) { try { recRef.current.abort(); } catch {} recRef.current = null; }
    vad.destroy(); // fully close AudioContext to prevent memory leaks
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    whisperAbortRef.current?.abort();
    whisperAbortRef.current = null;
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current.src = ""; ttsAudioRef.current = null; }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") { try { mediaRecorderRef.current.stop(); } catch {} }
      mediaRecorderRef.current = null;
    }
    releaseMic();
    window.speechSynthesis?.cancel();
    dispatch({ type: "CLOSE" });
  }, [vad, releaseMic]);

  // ── Streaming TTS ──
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const plain = stripMd(text);
      if (!plain) { resolve(); return; }
      dispatch({ type: "START_SPEAKING" });

      // Clean up any previous audio
      ttsAbortRef.current?.abort();
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current.src = ""; ttsAudioRef.current = null; }
      window.speechSynthesis?.cancel();

      const ctrl = new AbortController();
      ttsAbortRef.current = ctrl;
      let resolved = false;
      const safetyTimer = setTimeout(() => { ctrl.abort(); if (!resolved) { resolved = true; resolve(); } }, 25_000);
      const done = () => { if (resolved) return; resolved = true; clearTimeout(safetyTimer); resolve(); };

      // Try streaming TTS first, fall back to buffered
      console.log("[voice-tts] speak:", plain.slice(0, 60));
      fetch("/api/tts/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: plain, voice: ttsVoice }),
        signal: ctrl.signal,
      })
        .then(async (r) => {
          console.log("[voice-tts] stream response:", r.status, r.headers.get("content-type"));
          if (!r.ok || !r.body) throw new Error(`TTS ${r.status}`);

          // Collect chunks and play — MediaSource API has limited browser support for audio/mpeg
          // so we accumulate the stream into a blob but start faster since server streams from provider
          const reader = r.body.getReader();
          const chunks: BlobPart[] = [];
          let streamDone = false;

          while (!streamDone) {
            const { done: readerDone, value } = await reader.read();
            if (readerDone) { streamDone = true; break; }
            if (value) chunks.push(value);
            // Once we have enough data (>8KB), start playing while continuing to buffer
            // This gives us a head start on playback
            if (chunks.length === 1 && value && value.byteLength > 8192) {
              // First chunk is large enough — we can break and start playing
              // Continue reading remaining in background
              break;
            }
          }

          if (!activeRef.current) { done(); return; }

          // If we broke early, continue reading the rest
          if (!streamDone) {
            const readRest = async () => {
              try {
                while (true) {
                  const { done: d, value: v } = await reader.read();
                  if (d) break;
                  if (v) chunks.push(v);
                }
              } catch { /* stream interrupted */ }
            };
            // Start playback immediately with what we have, finish reading in background
            const restPromise = readRest();

            // Wait for all data before creating audio (MP3 needs full data for proper playback)
            await restPromise;
          }

          if (!activeRef.current) { done(); return; }

          // Create blob from all chunks
          const blob = new Blob(chunks, { type: "audio/mpeg" });
          console.log("[voice-tts] blob created:", blob.size, "bytes, chunks:", chunks.length);
          if (!blob.size) { console.warn("[voice-tts] empty blob, skipping"); done(); return; }

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsAudioRef.current = audio;

          // Start barge-in monitoring while speaking
          const stream = mediaStreamRef.current;
          if (stream?.active) {
            vad.startBargeInMonitor(stream, () => {
              if (phaseRef.current === "speaking") {
                audio.pause();
                audio.src = "";
                URL.revokeObjectURL(url);
                ttsAudioRef.current = null;
                ttsAbortRef.current?.abort();
                done();
                dispatch({ type: "BARGE_IN" });
                // Push-to-talk: go to ready, user taps to record next
              }
            });
          }

          const audioCleanup = () => {
            URL.revokeObjectURL(url);
            ttsAudioRef.current = null;
            vad.stop(); // stop barge-in monitor
            done();
          };
          let audioPlaying = false;
          const fallbackToSpeechSynthesis = () => {
            if (audioPlaying) return; // Audio already playing — don't double-speak
            URL.revokeObjectURL(url);
            ttsAudioRef.current = null;
            vad.stop();
            console.log("[voice-tts] falling back to browser speechSynthesis");
            if (window.speechSynthesis) {
              const u = new SpeechSynthesisUtterance(plain.slice(0, 1000));
              u.rate = 1.0;
              const ft = setTimeout(() => { window.speechSynthesis.cancel(); done(); }, 15_000);
              u.onend = () => { clearTimeout(ft); done(); };
              u.onerror = () => { clearTimeout(ft); done(); };
              window.speechSynthesis.speak(u);
            } else {
              done();
            }
          };
          audio.onended = audioCleanup;
          audio.onerror = (e) => { if (audioPlaying) { audioCleanup(); return; } console.error("[voice-tts] audio error:", e); fallbackToSpeechSynthesis(); };
          audio.play().then(() => { audioPlaying = true; console.log("[voice-tts] playing audio"); }).catch((e) => { console.error("[voice-tts] play blocked:", e); fallbackToSpeechSynthesis(); });
        })
        .catch((err) => {
          if (err.name === "AbortError") { done(); return; }
          console.warn("[voice-tts] stream failed, trying buffered:", err.message);
          // Fall back to buffered TTS
          fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: plain, voice: ttsVoice }),
            signal: ctrl.signal,
          })
            .then((r) => r.ok ? r.blob() : Promise.reject(new Error(`TTS ${r.status}`)))
            .then((blob) => {
              if (!activeRef.current || !blob.size) { done(); return; }
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              ttsAudioRef.current = audio;
              const c = () => { URL.revokeObjectURL(url); ttsAudioRef.current = null; done(); };
              audio.onended = c;
              audio.onerror = c;
              audio.play().catch(c);
            })
            .catch(() => {
              // Browser speech fallback
              if (window.speechSynthesis) {
                const u = new SpeechSynthesisUtterance(plain.slice(0, 1000));
                u.rate = 1.0;
                const ft = setTimeout(() => { window.speechSynthesis.cancel(); done(); }, 15_000);
                u.onend = () => { clearTimeout(ft); done(); };
                u.onerror = () => { clearTimeout(ft); done(); };
                window.speechSynthesis.speak(u);
              } else done();
            });
        });
    });
  }, [ttsVoice, vad]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI request — routes through shre-router /v1/chat (same as main chat) ──
  const askAI = useCallback(async (prompt: string, signal?: AbortSignal): Promise<string> => {
    try {
      // Build chat history from voice turns + recent main chat messages for context
      const voiceTurns = turnHistoryRef.current.slice(-10).map((t): ChatMessage => ({
        role: t.role, content: t.text.slice(0, 1500),
      }));
      const recentChat = messages.slice(-10).map((m): ChatMessage => ({
        role: m.role as "user" | "assistant", content: m.content.slice(0, 1500),
      }));
      // Merge: recent chat context first, then voice-specific turns
      const history: ChatMessage[] = [...recentChat, ...voiceTurns];

      console.log("[voice-chat] sending via shre-router:", prompt.slice(0, 60), "history:", history.length);

      return await new Promise<string>((resolve) => {
        let fullText = "";
        const timeoutId = setTimeout(() => resolve(fullText || "Sorry, the request timed out. Try again."), 30_000);

        const callbacks: StreamCallbacks = {
          onToken: (token) => { fullText += token; },
          onDone: (text) => {
            clearTimeout(timeoutId);
            const raw = text || fullText;
            console.log("[voice-chat] response:", raw.slice(0, 80));
            resolve(raw || "I didn't catch that. Could you try again?");
          },
          onError: (err) => {
            clearTimeout(timeoutId);
            console.error("[voice-chat] error:", err);
            resolve(fullText || "Sorry, I couldn't process that right now. Try again.");
          },
          onStatus: (status, detail) => {
            if (status === "thinking") dispatch({ type: "SET_STATUS", text: "Thinking..." });
            else if (status === "writing") dispatch({ type: "SET_STATUS", text: "" });
          },
        };

        sendChatMessage(
          prompt,
          history,
          `You are ${agentName}, a voice assistant. Keep responses concise. When the user asks for data (sales, invoices, inventory, top items, etc.), use markdown tables and formatting — the UI renders them visually. For conversational responses, be natural and brief. Always prefer structured data presentation (tables, bullet points) for data-heavy answers.`,
          callbacks,
          signal,
          voiceSessionIdRef.current || undefined,
          undefined, // modelOverride
          undefined, // attachments
          openclawMode,
        ).catch((err) => {
          clearTimeout(timeoutId);
          if (err?.name === "AbortError") { resolve(""); return; }
          console.error("[voice-chat]", err);
          resolve(fullText || "Sorry, I couldn't process that right now. Try again.");
        });
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[voice-chat] request aborted");
        return "";
      }
      console.error("[voice-chat]", err);
      return "Sorry, I couldn't process that right now. Try again.";
    }
  }, [agentId, agentName, messages, openclawMode]);

  // ── Whisper transcription (primary STT) ──
  const transcribeWithWhisper = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      const ctrl = new AbortController();
      whisperAbortRef.current = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), 15_000);
      const formData = new FormData();
      formData.append("file", audioBlob, "voice.webm");
      formData.append("model", "whisper-1");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      whisperAbortRef.current = null;
      if (!res.ok) return "";
      const data = await res.json();
      return (data.text || "").trim();
    } catch {
      whisperAbortRef.current = null;
      return "";
    }
  }, []);

  // ── Audio recording ──
  const startRecording = useCallback(async () => {
    // Guard: stop any existing recorder before creating a new one
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    const stream = await acquireMic();
    if (!stream) return;
    try {
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(250);
      mediaRecorderRef.current = mr;
    } catch {
      mediaRecorderRef.current = null;
    }
  }, [acquireMic]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        const blob = audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: "audio/webm" }) : null;
        audioChunksRef.current = [];
        resolve(blob);
        return;
      }
      mr.onstop = () => {
        const blob = audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: mr.mimeType }) : null;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  // ── Clarification context — stores context when AI asks a clarifying question ──
  const clarifyContextRef = useRef<string | null>(null);

  // ── Voice command ──
  const tryVoiceCommand = useCallback(async (text: string): Promise<{ spoken: string; mib007Link?: string; action?: string } | null> => {
    try {
      // If we have clarification context, prepend it to give the AI full context
      const prompt = clarifyContextRef.current
        ? `Context: user previously said "${clarifyContextRef.current}" and was asked to clarify. They responded: "${text}"`
        : text;
      // Clear clarification context after use
      clarifyContextRef.current = null;

      const res = await fetch("/api/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.action === "clarify" && data.spoken) {
        return { spoken: data.spoken, action: "clarify" };
      }
      if (data.action && data.spoken) return { spoken: data.spoken, mib007Link: data.mib007Link, action: data.action };
      return null;
    } catch {
      return null;
    }
  }, []);

  // ── Process user input → AI → TTS → loop ──
  const processingRef = useRef(false);
  const processUserInput = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    // Guard against double-processing (race condition: rapid VAD triggers)
    if (processingRef.current) return;
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") return;
    processingRef.current = true;
    try { // outer try-catch for the entire pipeline

    const userTurn: Turn = { role: "user", text };
    setTurns((prev) => [...prev, userTurn]);
    turnHistoryRef.current = [...turnHistoryRef.current, userTurn];
    onVoiceTurn?.({ role: "user", content: text });
    dispatch({ type: "CLEAR_TRANSCRIPT" });

    // Check agent switch
    const switchTarget = detectAgentSwitch(text, agents);
    if (switchTarget && onSwitchAgent) {
      const target = agents?.find((a) => a.id === switchTarget);
      const response = `Switching you to ${target?.name || switchTarget}. One moment.`;
      setTurns((prev) => [...prev, { role: "assistant", text: response }]);
      onVoiceTurn?.({ role: "assistant", content: response });
      await speak(response);
      onSwitchAgent(switchTarget);
      // Push-to-talk: go to ready after agent switch
      if (activeRef.current) dispatch({ type: "SPEAK_DONE" });
      return;
    }

    const cmd = detectCmd(text);
    let response: string;
    let responseMib007Link: string | undefined;

    if (cmd === "goodbye") {
      dispatch({ type: "SET_STATUS", text: "Ending conversation..." });
      response = "Thanks for chatting! Talk to you later.";
      setTurns((prev) => [...prev, { role: "assistant", text: response }]);
      onVoiceTurn?.({ role: "assistant", content: response });
      await speak(response);
      onClose();
      return;
    } else if (cmd === "read_last") {
      dispatch({ type: "TRANSCRIPTION_DONE" });
      dispatch({ type: "SET_STATUS", text: "Reading last message..." });
      const last = [...messages].reverse().find((m) => m.role === "assistant");
      response = last ? stripMd(last.content).slice(0, 500) : "There are no previous messages to read.";
    } else if (cmd === "summarize") {
      dispatch({ type: "TRANSCRIPTION_DONE" });
      dispatch({ type: "SET_STATUS", text: "Summarizing..." });
      const ctrl = new AbortController();
      aiAbortRef.current = ctrl;
      response = await askAI("Please provide a brief verbal summary of this conversation so far. Be concise — this will be read aloud.", ctrl.signal);
      if (!response || !activeRef.current) return;
    } else {
      dispatch({ type: "TRANSCRIPTION_DONE" });
      // Try actionable voice command first
      dispatch({ type: "SET_STATUS", text: "Processing..." });
      const cmdResult = await tryVoiceCommand(text);
      if (cmdResult?.action === "clarify") {
        // AI needs clarification — speak the question and continue listening
        clarifyContextRef.current = text; // Store original query for context
        response = cmdResult.spoken;
      } else if (cmdResult) {
        response = cmdResult.spoken;
        responseMib007Link = cmdResult.mib007Link;
      } else {
        dispatch({ type: "SET_STATUS", text: "Thinking..." });
        const ctrl = new AbortController();
        aiAbortRef.current = ctrl;
        response = await askAI(text, ctrl.signal);
        if (!activeRef.current) return;
        // Ensure we always have a response — never silently bail
        if (!response) response = "Hmm, I didn't get a response back. Could you try that again?";
      }
    }

    if (!activeRef.current) return;

    const assistTurn: Turn = { role: "assistant", text: response, mib007Link: responseMib007Link };
    setTurns((prev) => [...prev, assistTurn]);
    turnHistoryRef.current = [...turnHistoryRef.current, assistTurn];
    onVoiceTurn?.({ role: "assistant", content: response });

    dispatch({ type: "AI_RESPONSE" });
    await speak(stripMd(response));

    // Push-to-talk: go to "ready" after speaking — user taps to start next turn
    if (activeRef.current) {
      if ((phaseRef.current as VoicePhase) === "speaking") {
        dispatch({ type: "SPEAK_DONE" });
      }
    }

    } catch (err) {
      console.error("[voice] processUserInput crashed:", err);
      if (activeRef.current) {
        dispatch({ type: "ERROR", message: `Voice error: ${(err as Error)?.message || "Unknown error"}. Tap to retry.` });
      }
    } finally {
      processingRef.current = false;
    }
  }, [speak, askAI, messages, onClose, agents, onSwitchAgent, onVoiceTurn, tryVoiceCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start listening: Whisper-primary + SR preview + VAD ──
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;

    dispatch({ type: "START_LISTENING" });

    try {
      const stream = await acquireMic();
      if (!stream) {
        dispatch({ type: "ERROR", message: "Microphone access denied. Allow mic access in browser settings." });
        return;
      }

      // Start audio recording for Whisper (primary STT)
      await startRecording();

      // Start VAD for silence detection
      try { vad.start(stream); } catch (e) { console.warn("[voice] VAD start failed:", e); }

      // Start browser SpeechRecognition for live interim preview only
      const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        if (recRef.current) { try { recRef.current.abort(); } catch {} }
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.maxAlternatives = 3;

        rec.onresult = (e: SpeechRecognitionEvent) => {
          let interim = "";
          let final = "";
          for (let i = 0; i < e.results.length; i++) {
            const result = e.results[i];
            if (result.isFinal) {
              let best = result[0];
              for (let j = 1; j < result.length; j++) {
                if (result[j].confidence > best.confidence) best = result[j];
              }
              final += best.transcript + " ";
            } else {
              interim += result[0].transcript;
            }
          }
          dispatch({ type: "TRANSCRIPT_UPDATE", final: final.trim(), interim: interim.trim() });
        };

        rec.onend = () => {
          // Only restart if still in listening phase — SR preview is secondary
          if (activeRef.current && phaseRef.current === "listening") {
            try { rec.start(); } catch { /* */ }
          }
        };

        rec.onerror = (e: any) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          if (e.error === "not-allowed") {
            dispatch({ type: "ERROR", message: "Microphone access denied. Allow mic access in browser settings." });
          }
        };

        try {
          rec.start();
          recRef.current = rec;
        } catch {
          // SR not available — Whisper still works
        }
      }
    } catch (err) {
      console.error("[voice] startListening failed:", err);
      dispatch({ type: "ERROR", message: "Failed to start voice input. Tap to retry." });
    }
  }, [acquireMic, startRecording, vad]);

  // ── Finish listening: stop recording, transcribe with Whisper ──
  const finishListening = useCallback(async () => {
    if (phaseRef.current !== "listening") return;

    try {
    dispatch({ type: "FINISH_LISTENING" });

    // Stop SR preview
    if (recRef.current) { try { recRef.current.abort(); } catch {} recRef.current = null; }

    // Stop VAD
    try { vad.stop(); } catch {}

    // Get the recorded audio
    const audioBlob = await stopRecording();

    if (!audioBlob || audioBlob.size < 3000) {
      // No meaningful audio — go back to ready
      if (activeRef.current) {
        dispatch({ type: "INTERRUPT" });
      }
      return;
    }

    // Transcribe with Whisper (primary)
    dispatch({ type: "SET_STATUS", text: "Transcribing..." });
    const whisperText = await transcribeWithWhisper(audioBlob);

    // Guard: if user interrupted during transcription, abort — don't process stale text
    if (!whisperText || !activeRef.current || (phaseRef.current as VoicePhase) !== "transcribing") {
      if (activeRef.current && (phaseRef.current as VoicePhase) === "transcribing") {
        dispatch({ type: "INTERRUPT" }); // back to ready
      }
      return;
    }

    processUserInput(whisperText);
    } catch (err) {
      console.error("[voice] finishListening crashed:", err);
      if (activeRef.current) {
        dispatch({ type: "ERROR", message: "Voice processing error. Tap to retry." });
      }
    }
  }, [vad, stopRecording, transcribeWithWhisper, processUserInput]);

  // ── Save voice session on close ──
  useEffect(() => {
    if (open) return;
    // When voice closes, save session if meaningful
    const allTurns = turnHistoryRef.current;
    if (allTurns.length >= 4) {
      fetch("/api/voice-session-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: allTurns.map(t => ({ role: t.role, text: t.text })),
          agentId,
        }),
      }).catch(() => {});
    }
  }, [open, agentId]);

  // ── Proactive notifications: auto-speak when idle ──
  useEffect(() => {
    if (!proactiveMode || !open || pendingNotifs.length === 0) return;
    if (phaseRef.current !== "ready") return;

    const notif = speakNext();
    if (!notif) return;

    const text = `${notif.severity === "critical" ? "Urgent: " : ""}${notif.title}${notif.body ? ". " + notif.body : ""}`;
    const notifTurn: Turn = { role: "assistant", text: `[${notif.source}] ${text}` };
    setTurns(prev => [...prev, notifTurn]);
    turnHistoryRef.current = [...turnHistoryRef.current, notifTurn];
    onVoiceTurn?.({ role: "assistant", content: text });

    speak(text).then(() => {
      if (activeRef.current && phaseRef.current === "speaking") {
        dispatch({ type: "SPEAK_DONE" });
        // Push-to-talk: go to ready, not auto-listen
      }
    });
  }, [proactiveMode, open, pendingNotifs, speakNext, speak, onVoiceTurn]);

  // ── Initialize on open ──
  useEffect(() => {
    if (!open) { cleanup(); return; }

    if (!voiceSessionIdRef.current) {
      voiceSessionIdRef.current = crypto.randomUUID();
      sessionStorage.setItem("shre-voice-session-id", voiceSessionIdRef.current);
    }

    activeRef.current = true;
    // Restore persisted turns instead of wiping them
    try {
      const saved = sessionStorage.getItem("shre-voice-turns");
      const lastSaved = Number(sessionStorage.getItem("shre-voice-turns-ts") || "0");
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
    } catch {
      setTurns([]);
      turnHistoryRef.current = [];
    }
    dispatch({ type: "OPEN" });

    // Fetch shortcuts on mount
    fetch("/api/voice-shortcuts").then(r => r.ok ? r.json() : { shortcuts: [] }).then(data => {
      if (data?.shortcuts?.length) setShortcuts(data.shortcuts);
    }).catch(() => {});

    // Push-to-talk: go to "ready" state — user taps orb to start recording
    if (activeRef.current) {
      dispatch({ type: "GREETING_DONE" });
      // Pre-acquire mic permission so first tap is instant
      acquireMic().catch(() => {});
    }

    return cleanup;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Skip briefing handler ──
  const skipBriefing = useCallback(() => {
    if (briefingPlaying) {
      briefingSkippedRef.current = true;
      setBriefingPlaying(false);
      window.speechSynthesis?.cancel();
      sessionStorage.setItem("shre-voice-briefing-date", new Date().toISOString().slice(0, 10));
    }
  }, [briefingPlaying]);

  // ── Orb tap (push-to-talk) ──
  const handleOrbTap = useCallback(() => {
    const { phase } = { phase: phaseRef.current };
    if (phase === "ready") {
      // Tap to start recording — instant activation
      startListening();
    } else if (phase === "listening") {
      // Tap to stop recording → transcribe → submit
      finishListening();
    } else if (phase === "speaking") {
      // Interrupt TTS → back to ready
      ttsAbortRef.current?.abort();
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current.src = ""; ttsAudioRef.current = null; }
      window.speechSynthesis?.cancel();
      vad.stop();
      dispatch({ type: "INTERRUPT" });
    } else if (phase === "transcribing") {
      // Cancel Whisper transcription → back to ready
      whisperAbortRef.current?.abort();
      dispatch({ type: "INTERRUPT" });
    } else if (phase === "thinking") {
      // Cancel AI request → back to ready
      aiAbortRef.current?.abort();
      dispatch({ type: "INTERRUPT" });
    } else if (phase === "error") {
      dispatch({ type: "RETRY" });
    }
  }, [finishListening, startListening, vad]);

  if (!open) return null;

  const { phase, transcript, statusText, errorMsg, speechActive } = state;

  const phaseLabel = statusText
    || (phase === "greeting" ? "Starting up..."
    : phase === "ready" ? ""
    : phase === "listening" ? (transcript ? "" : "Recording...")
    : phase === "transcribing" ? "Transcribing..."
    : phase === "thinking" ? "Processing..."
    : phase === "speaking" ? "Speaking..."
    : "");

  const orbScale = phase === "listening" && speechActive ? 1.08 : 1;
  const orbGlow = phase === "ready"
    ? "0 0 20px 8px rgba(255, 255, 255, 0.1)"
    : phase === "listening"
      ? speechActive
        ? "0 0 50px 15px rgba(239, 68, 68, 0.5)"
        : "0 0 25px 8px rgba(239, 68, 68, 0.25)"
      : phase === "speaking"
        ? "0 0 30px 10px rgba(34, 197, 94, 0.25)"
        : phase === "thinking" || phase === "transcribing"
          ? "0 0 25px 8px rgba(59, 130, 246, 0.2)"
          : "0 0 15px 5px rgba(107, 114, 128, 0.15)";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))" }}>
        <button
          className="flex items-center gap-2 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
          style={{ background: agents && agents.length > 1 ? "rgba(255,255,255,0.08)" : "transparent" }}
          onClick={() => agents && agents.length > 1 && setAgentPickerOpen((v) => !v)}
          aria-label="Switch agent"
        >
          <span className="text-lg">{agentEmoji}</span>
          <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>{agentName}</span>
          {agents && agents.length > 1 && (
            <svg className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.4)", transform: agentPickerOpen ? "rotate(180deg)" : "" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setProactiveMode(v => !v)}
            className="h-10 px-3 rounded-full flex items-center gap-1.5 active:scale-95 transition-transform text-[11px] font-medium"
            style={{
              background: proactiveMode ? "rgba(74, 222, 128, 0.15)" : "rgba(255,255,255,0.08)",
              color: proactiveMode ? "rgba(74, 222, 128, 0.9)" : "rgba(255,255,255,0.4)",
              border: `1px solid ${proactiveMode ? "rgba(74, 222, 128, 0.3)" : "transparent"}`,
            }}
            aria-label={proactiveMode ? "Disable proactive notifications" : "Enable proactive notifications"}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {proactiveMode ? "Live" : "Alerts"}
            {proactiveMode && notifConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
            {proactiveMode && pendingNotifs.length > 0 && (
              <span className="ml-0.5 text-[9px] bg-red-500 text-white rounded-full px-1">{pendingNotifs.length}</span>
            )}
          </button>
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
          aria-label="Close"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        </div>
      </div>

      {/* Agent picker dropdown */}
      {agentPickerOpen && agents && agents.length > 1 && (
        <div className="mx-5 mb-2 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {agents.filter((a) => a.id !== agentId).slice(0, 8).map((a) => (
            <button
              key={a.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/10 transition-colors"
              style={{ color: "rgba(255,255,255,0.85)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
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

      {/* Conversation log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-3" style={{ minHeight: 0 }}>
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
              style={{
                background: t.role === "user" ? "rgba(59, 130, 246, 0.15)" : "rgba(255,255,255,0.06)",
                color: t.role === "user" ? "rgba(147, 197, 253, 0.95)" : "rgba(255,255,255,0.85)",
                border: `1px solid ${t.role === "user" ? "rgba(59, 130, 246, 0.1)" : "rgba(255,255,255,0.04)"}`,
              }}
            >
              <VoiceTurnContent text={t.text} role={t.role} />
              {t.mib007Link && (
                <button
                  onClick={() => window.open(`${window.location.hostname !== "localhost" ? "https://app.nirtek.net" : "https://localhost:5520"}${t.mib007Link}`, "_blank")}
                  className="block mt-1.5 text-[12px] opacity-70 hover:opacity-100 transition-opacity underline"
                  style={{ color: "rgba(96, 165, 250, 0.9)" }}
                >
                  View in MIB007 &rarr;
                </button>
              )}
            </div>
          </div>
        ))}
        {(phase === "thinking" || phase === "transcribing") && (
          <div className="flex justify-start animate-fadeIn">
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
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
          <span className="text-[11px] px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
            Tap anywhere to skip briefing
          </span>
        </div>
      )}

      {/* Voice shortcuts */}
      {shortcuts.length > 0 && state.phase === "ready" && (
        <div className="px-5 py-1.5 flex flex-wrap gap-2 justify-center">
          {shortcuts.map(s => (
            <button
              key={s.id}
              className="text-[11px] px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onClick={() => processUserInput(s.pattern)}
            >
              {s.pattern.length > 30 ? s.pattern.slice(0, 28) + "..." : s.pattern}
            </button>
          ))}
        </div>
      )}

      {/* Live transcript */}
      <div className="px-5 min-h-[3rem] flex items-center justify-center">
        {transcript && phase === "listening" ? (
          <p className="text-sm text-center max-w-md leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            &ldquo;{transcript}&rdquo;
          </p>
        ) : phase === "error" ? (
          <p className="text-xs text-center text-red-400 max-w-sm">{errorMsg}</p>
        ) : null}
      </div>

      {/* Orb */}
      <div className="flex flex-col items-center pb-6" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <button
          onClick={handleOrbTap}
          className="relative h-24 w-24 rounded-full flex items-center justify-center active:scale-90"
          style={{
            background: phase === "ready"
              ? "radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)"
              : phase === "listening"
                ? "radial-gradient(circle, rgba(239,68,68,0.85) 0%, rgba(220,38,38,0.95) 100%)"
                : phase === "speaking"
                  ? "radial-gradient(circle, rgba(34,197,94,0.8) 0%, rgba(22,163,74,0.9) 100%)"
                  : phase === "thinking" || phase === "transcribing"
                    ? "radial-gradient(circle, rgba(59,130,246,0.8) 0%, rgba(37,99,235,0.9) 100%)"
                    : phase === "error"
                      ? "radial-gradient(circle, rgba(239,68,68,0.6) 0%, rgba(185,28,28,0.8) 100%)"
                      : "radial-gradient(circle, rgba(107,114,128,0.6) 0%, rgba(75,85,99,0.8) 100%)",
            boxShadow: orbGlow,
            transform: `scale(${orbScale})`,
            transition: "transform 150ms ease-out, box-shadow 150ms ease-out",
          }}
          aria-label={phase === "ready" ? "Tap to talk" : phase === "listening" ? "Tap to send" : phase === "transcribing" ? "Tap to cancel" : phase === "speaking" ? "Tap to interrupt" : phase === "thinking" ? "Tap to cancel" : phase === "error" ? "Tap to retry" : ""}
        >
          {phase === "ready" ? (
            /* Mic icon — tap to start */
            <svg className="h-10 w-10 text-white/80 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : phase === "listening" ? (
            /* Stop/send icon — recording active */
            <svg className="h-9 w-9 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : phase === "speaking" ? (
            <svg className="h-9 w-9 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : phase === "error" ? (
            <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          )}
          {phase === "listening" && (
            <span className="absolute inset-0 rounded-full pointer-events-none" style={{
              border: `2px solid rgba(255,255,255,${speechActive ? 0.5 : 0.15})`,
              transform: `scale(${speechActive ? 1.2 : 1.05})`,
              transition: "transform 150ms ease-out, border-color 150ms ease-out",
            }} />
          )}
        </button>
        <span className="text-[11px] mt-3 font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>{phaseLabel}</span>
        {phase === "ready" && (
          <p className="text-[10px] mt-1.5 text-center max-w-[220px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
            Tap to talk
          </p>
        )}
        {phase === "listening" && (
          <p className="text-[10px] mt-1.5 text-center max-w-[220px] leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
            Tap to send
          </p>
        )}
        {phase === "transcribing" && (
          <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Tap to cancel</p>
        )}
        {phase === "speaking" && (
          <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Tap to interrupt</p>
        )}
        {phase === "thinking" && (
          <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Tap to cancel</p>
        )}
        {phase === "error" && (
          <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Tap to retry</p>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
