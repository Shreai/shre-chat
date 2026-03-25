import { useState, useRef, useEffect } from "react";
import { useApp } from "./store";

// ── Preview data bridge ─────────────────────────────────────────────
// sessionStorage is the data bus — no events, no race conditions.
// MessageBubble writes here before switching to "preview" view.

const PREVIEW_KEY = "shre-preview-html";
const LIBRARY_KEY = "shre-preview-library";
const MAX_LIBRARY = 20;

export interface PreviewEntry {
  id: string;
  title: string;
  html: string;
  savedAt: number;
}

function loadLibrary(): PreviewEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
  } catch (_) { void _;
    return [];
  }
}

function saveLibrary(entries: PreviewEntry[]) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, MAX_LIBRARY)));
  } catch (_) { void _; }
}

function deriveTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() || `Preview ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/** Called from MessageBubble — stores HTML and returns the entry */
export function queuePreview(html: string, title?: string): PreviewEntry {
  const entry: PreviewEntry = {
    id: `prev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: title || deriveTitle(html),
    html,
    savedAt: Date.now(),
  };
  // Write to sessionStorage for immediate pickup
  sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(entry));
  // Also persist to library
  const lib = loadLibrary().filter((e) => e.html !== html);
  saveLibrary([entry, ...lib]);
  return entry;
}

// ── PreviewView ─────────────────────────────────────────────────────

export function PreviewView() {
  const { state, actions } = useApp();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [library, setLibrary] = useState<PreviewEntry[]>(loadLibrary);
  const [active, setActive] = useState<PreviewEntry | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // On mount: check sessionStorage for queued preview
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      if (raw) {
        const entry = JSON.parse(raw) as PreviewEntry;
        setActive(entry);
        setLibrary(loadLibrary());
        sessionStorage.removeItem(PREVIEW_KEY);
      }
    } catch (_) { void _; }
  }, []);

  // Create blob URL when active entry changes
  useEffect(() => {
    if (!active?.html) { setBlobUrl(null); return; }
    const blob = new Blob([active.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [active?.id]);

  const selectEntry = (entry: PreviewEntry) => setActive(entry);

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = library.filter((en) => en.id !== id);
    saveLibrary(updated);
    setLibrary(updated);
    if (active?.id === id) { setActive(null); setBlobUrl(null); }
  };

  const openInNewTab = () => {
    if (!active?.html) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(active.html); w.document.close(); }
  };

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: "var(--c-bg-1)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border-1)" }}>
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
        <div className="flex-1" />
        {active && (
          <div className="flex items-center gap-2">
            <span className="text-xs truncate max-w-[200px]" style={{ color: "var(--c-text-3)" }}>{active.title}</span>
            <button
              onClick={openInNewTab}
              className="px-2 py-1 rounded text-xs hover:opacity-80"
              style={{ background: "var(--c-bg-2)", color: "var(--c-text-2)", border: "1px solid var(--c-border-2)" }}
              title="Open in new browser tab"
            >
              Open in Tab
            </button>
            <button
              onClick={() => { setActive(null); setBlobUrl(null); }}
              className="px-2 py-1 rounded text-xs"
              style={{ color: "var(--c-text-4)" }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Library sidebar */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{ width: 200, borderRight: "1px solid var(--c-border-1)", background: "var(--c-bg-2)" }}
        >
          <div className="px-2 py-2 text-xs font-semibold shrink-0" style={{ color: "var(--c-text-3)", borderBottom: "1px solid var(--c-border-1)" }}>
            Library {library.length > 0 && <span style={{ color: "var(--c-text-5)" }}>({library.length})</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {library.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-center" style={{ color: "var(--c-text-5)" }}>
                No previews yet. Ask an agent to generate HTML, then click Preview.
              </div>
            ) : (
              <ul className="py-1">
                {library.map((entry) => (
                  <li key={entry.id}>
                    <button
                      onClick={() => selectEntry(entry)}
                      className="group/entry w-full flex items-start gap-1.5 px-2 py-2 text-left hover:opacity-90 transition-colors"
                      style={{
                        background: active?.id === entry.id ? "var(--c-bg-hover)" : "transparent",
                        borderLeft: active?.id === entry.id ? "2px solid var(--c-accent)" : "2px solid transparent",
                      }}
                    >
                      <span className="flex-1 min-w-0">
                        <span
                          className="block text-[11px] font-medium truncate leading-snug"
                          style={{ color: active?.id === entry.id ? "var(--c-text-1)" : "var(--c-text-2)" }}
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
                        title="Delete"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative min-w-0">
          {blobUrl ? (
            <iframe
              ref={iframeRef}
              src={blobUrl}
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
                <div className="text-xs" style={{ color: "var(--c-text-5)" }}>
                  {library.length > 0
                    ? "Select a preview from the library."
                    : "Ask an agent to generate HTML, then click the Preview button on the code block."}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
