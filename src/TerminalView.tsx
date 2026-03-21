import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";

// ── Voice-to-text input for terminal (mobile-friendly) ────────────
const SpeechRec = typeof window !== "undefined" ? (window.SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

function TerminalVoiceInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);

  const toggleVoice = useCallback(() => {
    if (listening && recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalText = "";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setText((finalText + interim).trim());
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [listening]);

  const handleSubmit = () => {
    if (!text.trim()) return;
    if (recRef.current) { recRef.current.stop(); recRef.current = null; setListening(false); }
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      {SpeechRec && (
        <button
          onClick={toggleVoice}
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${listening ? "bg-red-500/20" : ""}`}
          style={{ color: listening ? "#f87171" : "rgba(255,255,255,0.4)", animation: listening ? "pulse-ring 1.2s ease-out infinite" : "none" }}
          title={listening ? "Stop listening" : "Voice input"}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </button>
      )}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        placeholder={listening ? "Listening..." : "Type or speak a command..."}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: "rgba(255,255,255,0.8)", fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace" }}
      />
      <button
        onClick={handleSubmit}
        className="h-8 px-3 rounded-lg text-[11px] font-medium transition-all"
        style={{ background: text.trim() ? "rgba(59,130,246,0.2)" : "transparent", color: text.trim() ? "#60a5fa" : "rgba(255,255,255,0.2)", border: "1px solid " + (text.trim() ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)") }}
      >
        Run
      </button>
    </div>
  );
}

interface TerminalViewProps {
  visible: boolean;
  onClose: () => void;
}

export interface TerminalHandle {
  sendCommand: (cmd: string) => void;
  isConnected: () => boolean;
}

interface TabState {
  id: string;
  title: string;
  term: Terminal | null;
  ws: WebSocket | null;
  fit: FitAddon | null;
  observer: ResizeObserver | null;
}

let tabCounter = 0;

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  function TerminalView({ visible, onClose }, ref) {
    const [tabs, setTabs] = useState<TabState[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<TabState[]>([]);

    // Keep ref in sync
    tabsRef.current = tabs;

    const activeTab = tabs.find((t) => t.id === activeTabId) || null;

    // Expose sendCommand to parent — sends to active tab
    useImperativeHandle(ref, () => ({
      sendCommand(cmd: string) {
        const tab = tabsRef.current.find((t) => t.id === activeTabId);
        if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(cmd + "\r");
        }
      },
      isConnected() {
        const tab = tabsRef.current.find((t) => t.id === activeTabId);
        return tab?.ws?.readyState === WebSocket.OPEN;
      },
    }), [activeTabId]);

    const createTab = useCallback(() => {
      const id = `term-${++tabCounter}`;
      const title = `Terminal ${tabCounter}`;
      const newTab: TabState = { id, title, term: null, ws: null, fit: null, observer: null };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      return id;
    }, []);

    const closeTab = useCallback((tabId: string) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (tab) {
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
    }, [activeTabId, onClose]);

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
        // Tab already initialized — re-attach
        containerRef.current.innerHTML = "";
        activeTab.term.open(containerRef.current);
        setTimeout(() => activeTab.fit?.fit(), 20);
        return;
      }

      // Initialize new terminal
      const el = containerRef.current;
      el.innerHTML = "";

      const term = new Terminal({
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.3,
        cursorBlink: true,
        cursorStyle: "bar",
        theme: {
          background: "var(--c-bg-1, #0a1628)",
          foreground: "#c8d6e5",
          cursor: "#6cb4ee",
          selectionBackground: "#2a4a7f80",
          black: "#0a1628",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#c8d6e5",
          brightBlack: "#4a5568",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#f1f5f9",
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(el);
      fit.fit();

      // Connect WebSocket
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws/terminal`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[90m[Disconnected]\x1b[0m\r\n");
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const onResize = () => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      };

      const observer = new ResizeObserver(onResize);
      observer.observe(el);

      // Update tab state
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, term, ws, fit, observer } : t,
        ),
      );
    }, [visible, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-fit on tab switch
    useEffect(() => {
      if (visible && activeTab?.fit) {
        setTimeout(() => activeTab.fit?.fit(), 50);
      }
    }, [visible, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!visible) return null;

    return (
      <div className="flex flex-col h-full" style={{ background: "var(--c-bg-1, #0a1628)" }}>
        {/* Tab bar */}
        <div className="flex items-center shrink-0"
          style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>

          {/* Tabs */}
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] shrink-0 transition-colors"
                style={{
                  color: tab.id === activeTabId ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)",
                  background: tab.id === activeTabId ? "rgba(255,255,255,0.06)" : "transparent",
                  borderBottom: tab.id === activeTabId ? "1px solid #6cb4ee" : "1px solid transparent",
                }}
              >
                <span style={{ fontFamily: "monospace", fontSize: 10, color: tab.id === activeTabId ? "#6cb4ee" : "inherit" }}>&#9658;</span>
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    style={{ cursor: "pointer", opacity: 0.4, fontSize: 10, marginLeft: 4 }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
                  >
                    &#x2715;
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* New tab + close */}
          <div className="flex items-center gap-1 px-2 shrink-0">
            <button
              onClick={createTab}
              style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
              title="New terminal"
            >
              +
            </button>
            <button
              onClick={onClose}
              style={{ color: "var(--c-danger)", fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", opacity: 0.8 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.8"; }}
              title="Close all terminals"
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* Terminal container */}
        <div ref={containerRef} className="flex-1 min-h-0" style={{ padding: "4px 8px" }} />

        {/* Voice/text input bar — type or speak commands */}
        <TerminalVoiceInput onSubmit={(cmd) => {
          const tab = tabsRef.current.find((t) => t.id === activeTabId);
          if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
            tab.ws.send(cmd + "\r");
          }
        }} />
      </div>
    );
  },
);
