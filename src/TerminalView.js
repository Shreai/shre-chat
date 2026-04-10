import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { getSpeechLocale } from './i18n';
// ── Voice-to-text input for terminal (mobile-friendly) ────────────
const SpeechRec = typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
function TerminalVoiceInput({ onSubmit }) {
    const [text, setText] = useState('');
    const [listening, setListening] = useState(false);
    const recRef = useRef(null);
    const toggleVoice = useCallback(() => {
        if (listening && recRef.current) {
            recRef.current.stop();
            recRef.current = null;
            setListening(false);
            return;
        }
        if (!SpeechRec)
            return;
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = getSpeechLocale();
        let finalText = '';
        rec.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal)
                    finalText += e.results[i][0].transcript + ' ';
                else
                    interim += e.results[i][0].transcript;
            }
            setText((finalText + interim).trim());
        };
        rec.onend = () => {
            setListening(false);
            recRef.current = null;
        };
        rec.onerror = () => {
            setListening(false);
            recRef.current = null;
        };
        rec.start();
        recRef.current = rec;
        setListening(true);
    }, [listening]);
    const handleSubmit = () => {
        if (!text.trim())
            return;
        if (recRef.current) {
            recRef.current.stop();
            recRef.current = null;
            setListening(false);
        }
        onSubmit(text.trim());
        setText('');
    };
    return (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 shrink-0", style: {
            background: 'var(--c-bg-2, rgba(255,255,255,0.03))',
            borderTop: '1px solid var(--c-border, rgba(255,255,255,0.08))',
        }, children: [SpeechRec && (_jsx("button", { onClick: toggleVoice, className: `h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${listening ? 'bg-red-500/20' : ''}`, style: {
                    color: listening ? '#f87171' : 'var(--c-text-3, rgba(255,255,255,0.4))',
                    animation: listening ? 'pulse-ring 1.2s ease-out infinite' : 'none',
                }, title: listening ? 'Stop listening' : 'Voice input', children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }), _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" })] }) })), _jsx("input", { type: "text", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        handleSubmit();
                }, placeholder: listening ? 'Listening...' : 'Type or speak a command...', className: "flex-1 bg-transparent text-[13px] outline-none", autoCapitalize: "off", style: {
                    color: 'var(--c-text-1, rgba(255,255,255,0.8))',
                    fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                } }), _jsx("button", { onClick: handleSubmit, className: "h-8 px-3 rounded-lg text-[11px] font-medium transition-all", style: {
                    background: text.trim() ? 'rgba(59,130,246,0.2)' : 'transparent',
                    color: text.trim() ? '#60a5fa' : 'var(--c-text-3, rgba(255,255,255,0.2))',
                    border: '1px solid ' +
                        (text.trim() ? 'rgba(59,130,246,0.3)' : 'var(--c-border, rgba(255,255,255,0.08))'),
                }, children: "Run" })] }));
}
let tabCounter = 0;
export const TerminalView = forwardRef(function TerminalView({ visible, onClose }, ref) {
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const containerRef = useRef(null);
    const tabsRef = useRef([]);
    // Keep ref in sync
    tabsRef.current = tabs;
    const activeTab = tabs.find((t) => t.id === activeTabId) || null;
    // Expose sendCommand to parent — sends to active tab
    useImperativeHandle(ref, () => ({
        sendCommand(cmd) {
            const tab = tabsRef.current.find((t) => t.id === activeTabId);
            if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
                tab.ws.send(cmd + '\r');
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
        const newTab = { id, title, term: null, ws: null, fit: null, observer: null };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(id);
        return id;
    }, []);
    const closeTab = useCallback((tabId) => {
        setTabs((prev) => {
            const tab = prev.find((t) => t.id === tabId);
            if (tab) {
                tab._cleanup?.(); // stop auto-reconnect before closing
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
            if (remaining.length === 0)
                onClose();
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
        if (!visible || !containerRef.current || !activeTab)
            return;
        if (activeTab.term) {
            // Tab already initialized — re-attach
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
        // Use a stable session ID so reconnects reattach to the same server-side PTY
        // (survives screen changes, tab switches, foldable phone fold/unfold)
        const termSessionId = sessionStorage.getItem('shre-term-session') ||
            (() => {
                const id = `t-${Date.now().toString(36)}`;
                sessionStorage.setItem('shre-term-session', id);
                return id;
            })();
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${location.host}/ws/terminal?session=${termSessionId}`;
        let currentWs = null;
        let reconnectTimer = null;
        let reconnectAttempt = 0;
        let intentionallyClosed = false;
        const MAX_RECONNECT_DELAY = 8_000;
        function connectWs() {
            if (intentionallyClosed)
                return;
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
                term.write(`\r\n\x1b[33m[Connection lost — reconnecting in ${(delay / 1000).toFixed(0)}s...]\x1b[0m\r\n`);
                reconnectTimer = setTimeout(connectWs, delay);
            };
            ws.onerror = () => {
                // onclose will fire after this — reconnect handled there
            };
        }
        connectWs();
        term.onData((data) => {
            if (currentWs?.readyState === WebSocket.OPEN) {
                currentWs.send(data);
            }
        });
        // Reconnect on visibility restore (tab switch / screen wake)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' &&
                currentWs?.readyState !== WebSocket.OPEN &&
                !intentionallyClosed) {
                // Clear any pending reconnect and connect immediately
                if (reconnectTimer)
                    clearTimeout(reconnectTimer);
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
        if (vv)
            vv.addEventListener('resize', onResize);
        // Store cleanup function on tab for closeTab to use
        const cleanup = () => {
            intentionallyClosed = true;
            if (reconnectTimer)
                clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('resize', onResize);
            if (vv)
                vv.removeEventListener('resize', onResize);
        };
        // Update tab state
        setTabs((prev) => prev.map((t) => t.id === activeTab.id
            ? { ...t, term, ws: currentWs, fit, observer, _cleanup: cleanup }
            : t));
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
        if (vv)
            vv.addEventListener('resize', checkViewport);
        return () => {
            window.removeEventListener('resize', checkViewport);
            if (vv)
                vv.removeEventListener('resize', checkViewport);
        };
    }, [activeTab?.fit]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!visible)
        return null;
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
    return (_jsxs("div", { className: "flex flex-col", style: {
            background: 'var(--c-bg-1, #0a1628)',
            height: '100%',
            // On mobile, use dvh to account for browser chrome and virtual keyboard
            ...(isMobileView ? { height: '100dvh', maxHeight: '100dvh' } : {}),
        }, children: [_jsxs("div", { className: "flex items-center shrink-0", style: {
                    background: 'rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    minHeight: isMobileView ? 32 : 36,
                }, children: [_jsx("div", { className: "flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none", children: tabs.map((tab) => (_jsxs("button", { onClick: () => setActiveTabId(tab.id), className: `flex items-center gap-1 shrink-0 transition-colors ${isMobileView ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'}`, style: {
                                color: tab.id === activeTabId ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                                background: tab.id === activeTabId ? 'rgba(255,255,255,0.06)' : 'transparent',
                                borderBottom: tab.id === activeTabId ? '1px solid #6cb4ee' : '1px solid transparent',
                            }, children: [_jsx("span", { style: {
                                        fontFamily: 'monospace',
                                        fontSize: isMobileView ? 8 : 10,
                                        color: tab.id === activeTabId ? '#6cb4ee' : 'inherit',
                                    }, children: "\u25BA" }), _jsx("span", { children: tab.title }), tabs.length > 1 && (_jsx("span", { onClick: (e) => {
                                        e.stopPropagation();
                                        closeTab(tab.id);
                                    }, style: { cursor: 'pointer', opacity: 0.4, fontSize: 10, marginLeft: 4 }, onMouseEnter: (e) => (e.currentTarget.style.opacity = '1'), onMouseLeave: (e) => (e.currentTarget.style.opacity = '0.4'), children: "\u2715" }))] }, tab.id))) }), _jsxs("div", { className: "flex items-center gap-1 px-2 shrink-0", children: [_jsx("button", { onClick: createTab, style: {
                                    color: 'rgba(255,255,255,0.3)',
                                    fontSize: isMobileView ? 14 : 16,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    lineHeight: 1,
                                }, onMouseEnter: (e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)'), onMouseLeave: (e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)'), title: "New terminal", children: "+" }), _jsx("button", { onClick: onClose, style: {
                                    color: 'var(--c-danger)',
                                    fontSize: 13,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    opacity: 0.8,
                                }, onMouseEnter: (e) => {
                                    e.currentTarget.style.opacity = '1';
                                }, onMouseLeave: (e) => {
                                    e.currentTarget.style.opacity = '0.8';
                                }, title: "Close all terminals", children: "\u2715" })] })] }), _jsx("div", { ref: containerRef, className: "flex-1 min-h-0", style: {
                    padding: isMobileView ? '2px 4px' : '4px 8px',
                    overflow: 'hidden',
                } }), _jsx("div", { className: "flex items-center gap-1 px-2 shrink-0 overflow-x-auto scrollbar-none", style: {
                    background: 'rgba(255,255,255,0.03)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: isMobileView ? '2px 4px' : '4px 8px',
                }, children: shortcutKeys.map(({ label, seq }) => (_jsx("button", { onClick: () => {
                        const tab = tabsRef.current.find((t) => t.id === activeTabId);
                        if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
                            tab.ws.send(seq);
                        }
                        tab?.term?.focus();
                    }, className: "rounded font-medium shrink-0 transition-colors", style: {
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: "'SF Mono', Menlo, monospace",
                        cursor: 'pointer',
                        padding: isMobileView ? '1px 6px' : '2px 8px',
                        fontSize: isMobileView ? 9 : 10,
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                    }, children: label }, label))) }), _jsx(TerminalVoiceInput, { onSubmit: (cmd) => {
                    const tab = tabsRef.current.find((t) => t.id === activeTabId);
                    if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
                        tab.ws.send(cmd + '\r');
                    }
                } })] }));
});
