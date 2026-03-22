import { useState, useRef, useCallback, useEffect } from "react";
import { useApp } from "./store";

// ── Preview Library ──────────────────────────────────────────────────

const LIBRARY_KEY = "shre-preview-library";
const MAX_LIBRARY = 20;

export interface PreviewEntry {
  id: string;
  title: string;
  html: string;
  savedAt: number; // unix ms
}

function loadLibrary(): PreviewEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLibrary(entries: PreviewEntry[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, MAX_LIBRARY)));
  } catch {
    // storage full — skip
  }
}

export function addToPreviewLibrary(html: string, title?: string): PreviewEntry {
  const entries = loadLibrary();
  // Derive title: try <title> tag, fallback to timestamp
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const resolvedTitle = title || titleMatch?.[1]?.trim() || `Preview ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const entry: PreviewEntry = {
    id: `prev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: resolvedTitle,
    html,
    savedAt: Date.now(),
  };
  // Deduplicate by html content
  const deduped = entries.filter((e) => e.html !== html);
  saveLibrary([entry, ...deduped]);
  return entry;
}

// ── PreviewView ──────────────────────────────────────────────────────

/**
 * PreviewView — renders HTML content in a sandboxed iframe.
 * Agents can output HTML blocks that get rendered here for interactive previews.
 * Also supports loading URLs from the local network.
 * Includes a Preview Library that persists across sessions (localStorage).
 */
export function PreviewView() {
  const { state, actions } = useApp();
  const [url, setUrl] = useState("");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [library, setLibrary] = useState<PreviewEntry[]>(() => loadLibrary());
  const [libOpen, setLibOpen] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Extract HTML blocks from the most recent assistant message
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  const lastAssistantMsg = session?.messages
    .filter((m) => m.role === "assistant")
    .pop();

  const extractHtml = useCallback(() => {
    if (!lastAssistantMsg?.content) return null;
    const match = lastAssistantMsg.content.match(/```html\s*([\s\S]*?)```/);
    if (match) return match[1].trim();
    if (lastAssistantMsg.content.includes("<!DOCTYPE") || lastAssistantMsg.content.includes("<html")) {
      return lastAssistantMsg.content;
    }
    return null;
  }, [lastAssistantMsg]);

  // Listen for preview requests from MessageBubble (custom event)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ html: string; title?: string }>).detail;
      if (!detail?.html) return;
      const entry = addToPreviewLibrary(detail.html, detail.title);
      setLibrary(loadLibrary());
      loadEntry(entry);
    };
    window.addEventListener("shre:open-preview", handler);
    return () => window.removeEventListener("shre:open-preview", handler);
  }, []);

  const loadEntry = (entry: PreviewEntry) => {
    setHtmlContent(entry.html);
    setActiveEntryId(entry.id);
    setUrl("");
  };

  const loadFromChat = () => {
    const html = extractHtml();
    if (!html) return;
    const entry = addToPreviewLibrary(html);
    setLibrary(loadLibrary());
    loadEntry(entry);
  };

  const loadUrl = () => {
    if (url.trim()) {
      setHtmlContent(null);
      setActiveEntryId(null);
    }
  };

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = library.filter((en) => en.id !== id);
    saveLibrary(updated);
    setLibrary(updated);
    if (activeEntryId === id) {
      setHtmlContent(null);
      setActiveEntryId(null);
    }
  };

  // Use blob URL for HTML content to avoid MIME type issues with srcDoc + allow-scripts
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (htmlContent) {
      const blob = new Blob([htmlContent], { type: "text/html" });
      const u = URL.createObjectURL(blob);
      setBlobUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setBlobUrl(null);
  }, [htmlContent]);

  const src = blobUrl || (!htmlContent && url.trim() ? url.trim() : undefined);
  const canLoadFromChat = !!extractHtml();

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: "var(--c-bg-1)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-1)" }}>
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
          style={{ color: "var(--c-text-4)" }}
          className="md:hidden p-1 rounded"
          title="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        {/* Back to Chat */}
        <button
          onClick={() => actions.switchView("chat")}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:opacity-80"
          style={{ color: "var(--c-accent)", background: "var(--c-bg-2)" }}
          title="Back to Chat"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Chat
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--c-text-2)" }}>Preview</span>
        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUrl()}
            placeholder="Enter URL or load from chat…"
            className="flex-1 px-3 py-1.5 rounded text-sm"
            style={{
              background: "var(--c-bg-2)",
              border: "1px solid var(--c-border-2)",
              color: "var(--c-text-1)",
            }}
          />
          <button
            onClick={loadUrl}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "var(--c-accent)", color: "white" }}
          >
            Go
          </button>
          <button
            onClick={loadFromChat}
            className="px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
            style={{
              background: canLoadFromChat ? "var(--c-accent)" : "var(--c-bg-3)",
              color: canLoadFromChat ? "white" : "var(--c-text-4)",
              opacity: canLoadFromChat ? 1 : 0.5,
            }}
            disabled={!canLoadFromChat}
            title={canLoadFromChat ? "Load HTML from last assistant message" : "No HTML found in chat"}
          >
            Load from Chat
          </button>
        </div>
        {(htmlContent || src) && (
          <button
            onClick={() => { setHtmlContent(null); setUrl(""); setActiveEntryId(null); }}
            className="px-2 py-1 rounded text-xs"
            style={{ color: "var(--c-text-3)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Body: library sidebar + iframe */}
      <div className="flex flex-1 min-h-0">
        {/* Preview Library */}
        <div
          className="flex flex-col shrink-0 overflow-hidden transition-all"
          style={{
            width: libOpen ? "200px" : "32px",
            borderRight: "1px solid var(--c-border-1)",
            background: "var(--c-bg-2)",
          }}
        >
          {/* Library header / toggle */}
          <button
            onClick={() => setLibOpen((v) => !v)}
            className="flex items-center gap-1.5 w-full px-2 py-2 text-xs font-semibold shrink-0 hover:opacity-80"
            style={{ color: "var(--c-text-3)", borderBottom: "1px solid var(--c-border-1)" }}
            title={libOpen ? "Collapse library" : "Expand library"}
          >
            {libOpen ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                <span>Library</span>
                {library.length > 0 && (
                  <span
                    className="ml-auto px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: "var(--c-bg-3)", color: "var(--c-text-4)" }}
                  >
                    {library.length}
                  </span>
                )}
              </>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: "0 auto" }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            )}
          </button>

          {/* Library entries */}
          {libOpen && (
            <div className="flex-1 overflow-y-auto">
              {library.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-center" style={{ color: "var(--c-text-5)" }}>
                  No previews yet.<br />Ask an agent to generate HTML, then click&nbsp;<strong>Load&nbsp;from&nbsp;Chat</strong>.
                </div>
              ) : (
                <ul className="py-1">
                  {library.map((entry) => (
                    <li key={entry.id}>
                      <button
                        onClick={() => loadEntry(entry)}
                        className="group/entry w-full flex items-start gap-1 px-2 py-2 text-left hover:opacity-90 transition-colors"
                        style={{
                          background: activeEntryId === entry.id ? "var(--c-bg-hover)" : "transparent",
                          borderLeft: activeEntryId === entry.id ? "2px solid var(--c-accent)" : "2px solid transparent",
                        }}
                        title={entry.title}
                      >
                        <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "var(--c-accent)" }}>&#128065;</span>
                        <span className="flex-1 min-w-0">
                          <span
                            className="block text-[11px] font-medium truncate leading-snug"
                            style={{ color: activeEntryId === entry.id ? "var(--c-text-1)" : "var(--c-text-2)" }}
                          >
                            {entry.title}
                          </span>
                          <span className="block text-[9px]" style={{ color: "var(--c-text-5)" }}>
                            {new Date(entry.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                        <button
                          onClick={(e) => deleteEntry(entry.id, e)}
                          className="opacity-0 group-hover/entry:opacity-100 shrink-0 p-0.5 rounded hover:text-red-400 transition-all"
                          style={{ color: "var(--c-text-5)" }}
                          title="Remove from library"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Preview Area */}
        <div className="flex-1 relative min-w-0">
          {src ? (
            <iframe
              ref={iframeRef}
              src={src}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className="w-full h-full border-0"
              style={{ background: "white" }}
              title="Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--c-text-4)" }}>
              <div className="text-center">
                <div className="text-4xl mb-4">&#128065;</div>
                <div className="text-sm mb-2">HTML Preview</div>
                <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
                  {library.length > 0
                    ? "Select a preview from the library, or ask an agent to generate HTML."
                    : <>Enter a URL above or ask an agent to generate HTML,<br />then click <strong>Load from Chat</strong> to render it here.</>
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
