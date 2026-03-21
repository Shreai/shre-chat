import { useEffect, useRef } from "react";
import { useApp, getAgent, type FeedEntry } from "./store";
import { fetchFeed } from "./openclaw";

const TYPE_CONFIG: Record<FeedEntry["type"], { icon: string; color: string; label: string }> = {
  sent: { icon: "↑", color: "text-blue-400", label: "Sent" },
  routed: { icon: "⇢", color: "text-amber-400", label: "Routed" },
  gateway: { icon: "◇", color: "text-purple-400", label: "Gateway" },
  streaming: { icon: "▸", color: "text-cyan-400", label: "Streaming" },
  received: { icon: "✓", color: "text-emerald-400", label: "Received" },
  fallback: { icon: "↺", color: "text-orange-400", label: "Fallback" },
  error: { icon: "✗", color: "text-red-400", label: "Error" },
  system: { icon: "⚙", color: "text-gray-400", label: "System" },
};

export function FeedView() {
  const { state, actions } = useApp();
  const { feed } = state;
  const lastFeedSync = useRef(0);

  useEffect(() => {
    if (lastFeedSync.current === 0) {
      lastFeedSync.current = Date.now() - 24 * 60 * 60 * 1000;
    }

    async function syncFeed() {
      const entries = await fetchFeed(lastFeedSync.current);
      if (entries.length === 0) return;
      for (const entry of entries) {
        const agent = getAgent(entry.agentId);
        actions.addFeed(
          entry.sessionKey || "openclaw",
          entry.role === "user" ? "sent" : "received",
          entry.content?.slice(0, 120) + (entry.content?.length > 120 ? "…" : ""),
          { source: "openclaw", agent: `${agent.emoji} ${agent.name}`, model: entry.model || "" }
        );
      }
      lastFeedSync.current = Date.now();
    }

    syncFeed();
    const iv = setInterval(syncFeed, 5000);
    return () => clearInterval(iv);
  }, [actions]);

  const grouped = new Map<string, { title: string; entries: FeedEntry[] }>();
  for (const entry of [...feed].reverse()) {
    if (!grouped.has(entry.sessionId)) {
      grouped.set(entry.sessionId, { title: entry.sessionTitle, entries: [] });
    }
    grouped.get(entry.sessionId)!.entries.push(entry);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <header className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm"
        style={{ background: "var(--c-bg-glass)", borderBottom: "1px solid var(--c-border-1)" }}>
        <div className="flex items-center gap-2">
          <button onClick={() => actions.setSidebarOpen(!state.sidebarOpen)} style={{ color: "var(--c-text-4)" }}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <h1 className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Feed</h1>
          <span className="text-[10px]" style={{ color: "var(--c-text-5)" }}>{feed.length} entries</span>
        </div>
        {feed.length > 0 && (
          <button
            onClick={() => { localStorage.removeItem("shre-feed"); window.location.reload(); }}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: "var(--c-text-4)" }}
          >
            Clear
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {feed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-20">
            <svg className="h-10 w-10" style={{ color: "var(--c-text-5)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>
            <p className="text-xs" style={{ color: "var(--c-text-4)" }}>No feed entries yet</p>
            <p className="text-[10px]" style={{ color: "var(--c-text-5)" }}>Send a message to see the pipeline trace</p>
          </div>
        )}

        <div className="space-y-6 max-w-3xl mx-auto">
          {Array.from(grouped.entries()).map(([sessionId, group]) => (
            <div key={sessionId}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold" style={{ color: "var(--c-text-2)" }}>{group.title}</span>
                <button
                  onClick={() => { actions.switchSession(sessionId); actions.setView("chat"); }}
                  className="text-[10px] text-shre-400/70 hover:text-shre-400"
                >
                  Open chat →
                </button>
              </div>

              <div className="relative pl-4" style={{ borderLeft: "1px solid var(--c-border-2)" }}>
                {group.entries.map((entry) => {
                  const cfg = TYPE_CONFIG[entry.type];
                  return (
                    <div key={entry.id} className="relative mb-2">
                      <div className={`absolute -left-[21px] top-1.5 h-3 w-3 rounded-full flex items-center justify-center text-[7px] ${cfg.color}`}
                        style={{ borderWidth: 2, borderColor: "var(--c-bg-1)" }}>
                        <span className="font-bold">{cfg.icon}</span>
                      </div>

                      <div className="flex items-start gap-2 pl-2 py-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-[9px]" style={{ color: "var(--c-text-5)" }}>{formatTime(entry.timestamp)}</span>
                          </div>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--c-text-3)" }}>{entry.message}</p>

                          {entry.meta && Object.keys(entry.meta).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.meta.ttft_ms && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                  style={{ background: "rgba(56,189,248,0.12)", color: "rgb(56,189,248)" }}>
                                  TTFT: {(Number(entry.meta.ttft_ms) / 1000).toFixed(1)}s
                                </span>
                              )}
                              {entry.meta.total_ms && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                  style={{ background: "rgba(52,211,153,0.12)", color: "rgb(52,211,153)" }}>
                                  Total: {(Number(entry.meta.total_ms) / 1000).toFixed(1)}s
                                </span>
                              )}
                              {Object.entries(entry.meta)
                                .filter(([k]) => k !== "ttft_ms" && k !== "total_ms")
                                .map(([k, v]) => (
                                <span key={k} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                  style={{ background: "var(--c-bg-card)", color: "var(--c-text-4)" }}>
                                  {k}: {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
