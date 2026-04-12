import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { getSpeechLocale } from './i18n';

// ── Voice-to-text input for terminal (mobile-friendly) ────────────
// Dual-path STT: browser SpeechRecognition (live interim) + MediaRecorder→Whisper (fallback)
const SpeechRec =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const PREFERRED_MIME = (() => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
})();

type VoicePhase = 'idle' | 'recording' | 'transcribing' | 'error';

function TerminalVoiceInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const recRef = useRef<SpeechRecognition | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveTextRef = useRef('');
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const cleanup = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.abort(); } catch (_) { void _; }
      recRef.current = null;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop(); } catch (_) { void _; }
    }
    mediaRecRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    liveTextRef.current = '';
  }, []);

  const transcribeViaWhisper = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append('file', blob, 'recording.webm');
    form.append('model', 'whisper-1');
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return (data.text || '').trim();
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const hadLiveText = liveTextRef.current.trim();
    const recorder = mediaRecRef.current;

    // Stop browser SpeechRecognition
    if (recRef.current) {
      try { recRef.current.stop(); } catch (_) { void _; }
      recRef.current = null;
    }

    // If we got good live text from SpeechRecognition, use it directly
    if (hadLiveText && !isAndroid) {
      cleanup();
      setPhase('idle');
      return;
    }

    // Otherwise fall back to Whisper via MediaRecorder
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setPhase('idle');
      return;
    }

    setPhase('transcribing');

    // Wait for MediaRecorder to flush its final chunk
    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: PREFERRED_MIME || 'audio/webm' }));
      };
      recorder.stop();
    });

    // Stop mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (blob.size < 1000) {
      // Too short — no audio captured
      setPhase('idle');
      chunksRef.current = [];
      return;
    }

    try {
      const whisperText = await transcribeViaWhisper(blob);
      if (whisperText) {
        setText((prev) => (prev ? prev + ' ' + whisperText : whisperText));
      }
      setPhase('idle');
    } catch (err) {
      console.error('[terminal-voice] Whisper fallback failed:', err);
      setErrorMsg('Transcription failed');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 2000);
    }
    chunksRef.current = [];
  }, [cleanup, isAndroid, transcribeViaWhisper]);

  const startRecording = useCallback(async () => {
    setErrorMsg('');
    setPhase('recording');
    liveTextRef.current = '';
    chunksRef.current = [];

    // Acquire microphone
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err: any) {
      // Fallback to basic constraints (Android OverconstrainedError)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err2: any) {
        const msg = err2.name === 'NotAllowedError' ? 'Microphone blocked'
          : err2.name === 'NotFoundError' ? 'No microphone found'
          : 'Mic access failed';
        setErrorMsg(msg);
        setPhase('error');
        setTimeout(() => setPhase('idle'), 3000);
        return;
      }
    }
    streamRef.current = stream;

    // Start MediaRecorder (Whisper fallback path)
    if (PREFERRED_MIME) {
      try {
        const mr = new MediaRecorder(stream, { mimeType: PREFERRED_MIME });
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.start(500); // collect chunks every 500ms
        mediaRecRef.current = mr;
      } catch (_) { void _; }
    }

    // Start browser SpeechRecognition for live interim text (skip on Android — unreliable)
    if (SpeechRec && !isAndroid) {
      try {
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = getSpeechLocale();
        rec.onresult = (e: SpeechRecognitionEvent) => {
          let final = '';
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
            else interim += e.results[i][0].transcript;
          }
          liveTextRef.current = (liveTextRef.current + final).trim();
          setText(() => (liveTextRef.current + (interim ? ' ' + interim : '')).trim());
        };
        rec.onerror = () => { /* Whisper fallback will handle it */ };
        rec.onend = () => { recRef.current = null; };
        rec.start();
        recRef.current = rec;
      } catch (_) { void _; }
    }
  }, [isAndroid]);

  const toggleVoice = useCallback(() => {
    if (phase === 'recording') {
      stopAndTranscribe();
    } else if (phase === 'idle' || phase === 'error') {
      startRecording();
    }
    // ignore clicks during 'transcribing'
  }, [phase, stopAndTranscribe, startRecording]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitGuardRef = useRef(0);
  const handleSubmit = () => {
    if (!text.trim()) return;
    // Debounce: prevent duplicate sends from Android keyboard firing Enter twice
    const now = Date.now();
    if (now - submitGuardRef.current < 300) return;
    submitGuardRef.current = now;

    if (phase === 'recording') {
      cleanup();
      setPhase('idle');
    }
    onSubmit(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = '36px';
  };

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  const hasMic = !!(SpeechRec || PREFERRED_MIME);

  const micColor = phase === 'recording' ? '#f87171'
    : phase === 'transcribing' ? '#facc15'
    : phase === 'error' ? '#ef4444'
    : 'var(--c-text-3, rgba(255,255,255,0.4))';

  const placeholder = phase === 'recording' ? 'Listening... tap mic to stop'
    : phase === 'transcribing' ? 'Transcribing...'
    : phase === 'error' ? errorMsg || 'Voice error'
    : 'Type or speak a command...';

  return (
    <div
      className="flex items-end gap-2 px-3 py-2 shrink-0"
      style={{
        background: 'var(--c-bg-2, rgba(255,255,255,0.03))',
        borderTop: '1px solid var(--c-border, rgba(255,255,255,0.08))',
      }}
    >
      {hasMic && (
        <button
          onClick={toggleVoice}
          disabled={phase === 'transcribing'}
          className={`h-8 w-8 mb-0.5 rounded-lg flex items-center justify-center shrink-0 transition-all ${phase === 'recording' ? 'bg-red-500/20' : ''}`}
          style={{
            color: micColor,
            animation: phase === 'recording' ? 'pulse-ring 1.2s ease-out infinite' : 'none',
            opacity: phase === 'transcribing' ? 0.5 : 1,
            cursor: phase === 'transcribing' ? 'wait' : 'pointer',
          }}
          title={
            phase === 'recording' ? 'Stop & transcribe'
            : phase === 'transcribing' ? 'Transcribing...'
            : 'Voice input'
          }
        >
          {phase === 'transcribing' ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = '36px';
          const maxH = window.innerWidth <= 768 ? 120 : 160;
          el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
        }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 bg-transparent text-[13px] outline-none resize-none overflow-y-auto"
        autoCapitalize="off"
        style={{
          color: 'var(--c-text-1, rgba(255,255,255,0.8))',
          fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
          minHeight: '36px',
          maxHeight: window.innerWidth <= 768 ? '120px' : '160px',
        }}
      />
      <button
        onClick={handleSubmit}
        className="h-8 mb-0.5 px-3 rounded-lg text-[11px] font-medium transition-all shrink-0"
        style={{
          background: text.trim() ? 'rgba(59,130,246,0.2)' : 'transparent',
          color: text.trim() ? '#60a5fa' : 'var(--c-text-3, rgba(255,255,255,0.2))',
          border:
            '1px solid ' +
            (text.trim() ? 'rgba(59,130,246,0.3)' : 'var(--c-border, rgba(255,255,255,0.08))'),
        }}
      >
        Run
      </button>
    </div>
  );
}

interface TerminalViewProps {
  visible: boolean;
  onClose: () => void;
  onBackToChat?: () => void;
}

export interface TerminalHandle {
  sendCommand: (cmd: string) => void;
  isConnected: () => boolean;
  openTab: (opts?: { title?: string; cmd?: string }) => void;
}

interface TabState {
  id: string;
  title: string;
  initialCmd?: string;
  term: Terminal | null;
  ws: WebSocket | null;
  fit: FitAddon | null;
  observer: ResizeObserver | null;
}

let tabCounter = 0;

// ── Daemon Process Controls ─────────────────────────────────────────────────

const DAEMON_URL = '/api/daemon';

type DaemonStatus = 'online' | 'offline' | 'busy' | 'loading';

function DaemonControls({ isMobile }: { isMobile: boolean }) {
  const [status, setStatus] = useState<DaemonStatus>('loading');
  const [sessions, setSessions] = useState(0);
  const [queue, setQueue] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) { setStatus('offline'); return; }
      const data = await res.json();
      setStatus(data.sessions?.busy > 0 ? 'busy' : 'online');
      setSessions(data.sessions?.active || 0);
      setQueue(data.queue || 0);
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 10_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const killAllSessions = async () => {
    if (!confirm('Kill all daemon sessions?')) return;
    try {
      const listRes = await fetch(`${DAEMON_URL}/v1/sessions`);
      const listData = await listRes.json();
      for (const s of listData.sessions || []) {
        await fetch(`${DAEMON_URL}/v1/sessions/${s.id}`, { method: 'DELETE' });
      }
      fetchStatus();
    } catch { /* best effort */ }
  };

  const restartDaemon = async () => {
    // Create a new default session (effectively restart)
    try {
      await fetch(`${DAEMON_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default' }),
      });
      fetchStatus();
    } catch { /* best effort */ }
  };

  const statusColor = {
    online: '#22c55e',
    busy: '#eab308',
    offline: '#ef4444',
    loading: '#6b7280',
  }[status];

  const btnStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: isMobile ? '1px 4px' : '2px 6px',
    fontSize: isMobile ? 9 : 10,
    fontFamily: "'SF Mono', Menlo, monospace",
    borderRadius: 4,
    transition: 'background 0.15s',
  };

  return (
    <div className="flex items-center gap-1" title={`Daemon: ${status} | ${sessions} sessions | ${queue} queued`}>
      {/* Status dot */}
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: statusColor,
          boxShadow: status === 'online' ? `0 0 4px ${statusColor}` : 'none',
          display: 'inline-block',
        }}
      />
      {!isMobile && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
          {status === 'busy' ? `${sessions}s ${queue}q` : status}
        </span>
      )}
      {status !== 'offline' && (
        <button
          onClick={killAllSessions}
          style={{ ...btnStyle, color: '#ef4444' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          title="Kill all daemon sessions"
        >
          Stop
        </button>
      )}
      {status === 'offline' && (
        <button
          onClick={restartDaemon}
          style={{ ...btnStyle, color: '#22c55e' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(34,197,94,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          title="Start daemon session"
        >
          Start
        </button>
      )}
    </div>
  );
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(function TerminalView(
  { visible, onClose, onBackToChat },
  ref,
) {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<TabState[]>([]);

  // Keep ref in sync
  tabsRef.current = tabs;

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const createTab = useCallback((opts?: { title?: string; cmd?: string }) => {
    const id = `term-${++tabCounter}`;
    const title = opts?.title || `Terminal ${tabCounter}`;
    const newTab: TabState = { id, title, initialCmd: opts?.cmd, term: null, ws: null, fit: null, observer: null };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  // Expose sendCommand and openTab to parent
  useImperativeHandle(
    ref,
    () => ({
      sendCommand(cmd: string) {
        const tab = tabsRef.current.find((t) => t.id === activeTabId);
        if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(cmd + '\r');
        }
      },
      isConnected() {
        const tab = tabsRef.current.find((t) => t.id === activeTabId);
        return tab?.ws?.readyState === WebSocket.OPEN;
      },
      openTab(opts?: { title?: string; cmd?: string }) {
        createTab(opts);
      },
    }),
    [activeTabId, createTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (tab) {
          (tab as any)._cleanup?.(); // stop auto-reconnect before closing
          tab.observer?.disconnect();
          tab.ws?.close();
          tab.term?.dispose();
        }
        const remaining = prev.filter((t) => t.id !== tabId);
        // If closing active tab, switch to last remaining
        if (tabId === activeTabId) {
          const next = remaining[remaining.length - 1];
          setActiveTabId(next?.id || null);
        }
        if (remaining.length === 0) onClose();
        return remaining;
      });
    },
    [activeTabId, onClose],
  );

  // Create first tab when becoming visible
  useEffect(() => {
    if (visible && tabs.length === 0) {
      createTab();
    }
  }, [visible, tabs.length, createTab]);

  // Initialize terminal for the active tab when container is ready
  useEffect(() => {
    if (!visible || !containerRef.current || !activeTab) return;
    if (activeTab.term) {
      // Tab already initialized — re-attach (no new WS or onData)
      containerRef.current.innerHTML = '';
      activeTab.term.open(containerRef.current);
      setTimeout(() => activeTab.fit?.fit(), 20);
      return;
    }

    // Initialize new terminal
    const el = containerRef.current;
    el.innerHTML = '';

    const isMobile = window.innerWidth <= 768;
    const term = new Terminal({
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontSize: isMobile ? 11 : 13,
      lineHeight: isMobile ? 1.2 : 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: 'var(--c-bg-1, #0a1628)',
        foreground: '#c8d6e5',
        cursor: '#6cb4ee',
        selectionBackground: '#2a4a7f80',
        black: '#0a1628',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#c8d6e5',
        brightBlack: '#4a5568',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f1f5f9',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    fit.fit();

    // ── Auto-reconnecting WebSocket for terminal ──────────────
    // Each tab gets its own unique PTY session — no session sharing between tabs
    const termSessionId = activeTab.initialCmd
      ? `cli-${activeTab.id}`
      : `tab-${activeTab.id}`;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${proto}//${location.host}/ws/terminal?session=${termSessionId}`;
    if (activeTab.initialCmd) {
      wsUrl += `&cmd=${encodeURIComponent(activeTab.initialCmd)}`;
    }
    let currentWs: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let intentionallyClosed = false;
    const MAX_RECONNECT_DELAY = 8_000;

    function connectWs() {
      if (intentionallyClosed) return;
      const ws = new WebSocket(wsUrl);
      currentWs = ws;

      ws.onopen = () => {
        reconnectAttempt = 0;
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        // Update tab ref so sendCommand works
        setTabs((prev) => prev.map((t) => (t.id === activeTab?.id ? { ...t, ws } : t)));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onclose = () => {
        if (intentionallyClosed) {
          term.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n');
          return;
        }
        // Auto-reconnect with backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
        reconnectAttempt++;
        term.write(
          `\r\n\x1b[33m[Connection lost — reconnecting in ${(delay / 1000).toFixed(0)}s...]\x1b[0m\r\n`,
        );
        reconnectTimer = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        // onclose will fire after this — reconnect handled there
      };
    }

    connectWs();

    const dataDisposable = term.onData((data) => {
      if (currentWs?.readyState === WebSocket.OPEN) {
        currentWs.send(data);
      }
    });

    // Reconnect on visibility restore (tab switch / screen wake)
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        currentWs?.readyState !== WebSocket.OPEN &&
        !intentionallyClosed
      ) {
        // Clear any pending reconnect and connect immediately
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectAttempt = 0;
        term.write('\r\n\x1b[36m[Reconnecting...]\x1b[0m\r\n');
        connectWs();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const onResize = () => {
      fit.fit();
      if (currentWs?.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(el);

    // Window resize listener for mobile orientation/keyboard changes
    window.addEventListener('resize', onResize);

    // Visual viewport resize (mobile keyboard show/hide)
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onResize);

    // Store cleanup function on tab for closeTab to use
    const cleanup = () => {
      intentionallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentWs) {
        currentWs.onclose = null; // prevent reconnect on intentional close
        currentWs.close();
      }
      dataDisposable.dispose();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
      observer.disconnect();
    };

    // Update tab state
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? ({ ...t, term, ws: currentWs, fit, observer, _cleanup: cleanup } as any)
          : t,
      ),
    );

    // Return cleanup so React can tear down on unmount/re-run (fixes StrictMode double-mount)
    return cleanup;
  }, [visible, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit on tab switch
  useEffect(() => {
    if (visible && activeTab?.fit) {
      setTimeout(() => activeTab.fit?.fit(), 50);
    }
  }, [visible, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect mobile / foldable viewport
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const checkViewport = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileView(mobile);
      // Re-fit terminal on viewport change (fold/unfold, orientation)
      // Two-phase fit: immediate (100ms) for same-layout resize,
      // deferred (350ms) for parent re-render after mobile/desktop toggle
      if (activeTab?.fit) {
        setTimeout(() => activeTab.fit?.fit(), 100);
        setTimeout(() => activeTab.fit?.fit(), 350);
      }
    };
    window.addEventListener('resize', checkViewport);
    // Foldable phone: visualViewport fires on fold/unfold
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', checkViewport);
    return () => {
      window.removeEventListener('resize', checkViewport);
      if (vv) vv.removeEventListener('resize', checkViewport);
    };
  }, [activeTab?.fit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  // On mobile, show fewer shortcut keys to save vertical space
  const shortcutKeys = isMobileView
    ? [
        { label: 'Esc', seq: '\x1b' },
        { label: 'Tab', seq: '\t' },
        { label: 'Ctrl+C', seq: '\x03' },
        { label: 'Ctrl+D', seq: '\x04' },
        { label: 'Ctrl+L', seq: '\x0c' },
        { label: '↑', seq: '\x1b[A' },
        { label: '↓', seq: '\x1b[B' },
      ]
    : [
        { label: 'Esc', seq: '\x1b' },
        { label: 'Tab', seq: '\t' },
        { label: '⇧Tab', seq: '\x1b[Z' },
        { label: 'Ctrl+C', seq: '\x03' },
        { label: 'Ctrl+D', seq: '\x04' },
        { label: 'Ctrl+Z', seq: '\x1a' },
        { label: 'Ctrl+L', seq: '\x0c' },
        { label: 'Ctrl+A', seq: '\x01' },
        { label: 'Ctrl+E', seq: '\x05' },
        { label: '↑', seq: '\x1b[A' },
        { label: '↓', seq: '\x1b[B' },
      ];

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'var(--c-bg-1, #0a1628)',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Tab bar — compact on mobile, sticky so it never scrolls behind xterm */}
      <div
        className="flex items-center shrink-0"
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: isMobileView ? 32 : 36,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Back to Chat — visible on mobile */}
        {isMobileView && onBackToChat && (
          <button
            onClick={onBackToChat}
            className="flex items-center gap-1 shrink-0 px-2 py-2"
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 11,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              minHeight: 32,
            }}
            title="Back to Chat"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Chat
          </button>
        )}
        {/* Tabs */}
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1 shrink-0 transition-colors ${isMobileView ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-1.5 text-[11px]'}`}
              style={{
                color: tab.id === activeTabId ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                background: tab.id === activeTabId ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderBottom:
                  tab.id === activeTabId ? '1px solid #6cb4ee' : '1px solid transparent',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: isMobileView ? 8 : 10,
                  color: tab.id === activeTabId ? '#6cb4ee' : 'inherit',
                }}
              >
                &#9658;
              </span>
              <span>{tab.title}</span>
              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{ cursor: 'pointer', opacity: 0.4, fontSize: 10, marginLeft: 4 }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
                >
                  &#x2715;
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Daemon controls + New tab + close */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <DaemonControls isMobile={isMobileView} />
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <button
            onClick={() => createTab()}
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontSize: isMobileView ? 14 : 16,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
            title="New terminal"
          >
            +
          </button>
          <button
            onClick={onClose}
            style={{
              color: 'var(--c-danger)',
              fontSize: 13,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            title="Close all terminals"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Terminal container — takes all remaining space */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{
          padding: isMobileView ? '2px 4px' : '4px 8px',
          overflow: 'hidden',
        }}
      />

      {/* Shortcut keys bar — fewer keys on mobile */}
      <div
        className="flex items-center gap-1 px-2 shrink-0 overflow-x-auto scrollbar-none"
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: isMobileView ? '2px 4px' : '4px 8px',
        }}
      >
        {shortcutKeys.map(({ label, seq }) => (
          <button
            key={label}
            onClick={() => {
              const tab = tabsRef.current.find((t) => t.id === activeTabId);
              if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
                tab.ws.send(seq);
              }
              tab?.term?.focus();
            }}
            className="rounded font-medium shrink-0 transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: "'SF Mono', Menlo, monospace",
              cursor: 'pointer',
              padding: isMobileView ? '1px 6px' : '2px 8px',
              fontSize: isMobileView ? 9 : 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Voice/text input bar — type or speak commands */}
      <TerminalVoiceInput
        onSubmit={(cmd) => {
          const tab = tabsRef.current.find((t) => t.id === activeTabId);
          if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
            tab.ws.send(cmd + '\r');
          }
        }}
      />
    </div>
  );
});
