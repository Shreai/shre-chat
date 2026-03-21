import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useApp, AGENTS, getAgent, exportSessions, importSessions, type Session } from "./store";
import { fetchAllAgentMessages } from "./openclaw";
import { onStreamChange, type ActiveStream } from "./gateway-ws";
import { ThemeCustomizer } from "./ThemeCustomizer";
import { IdentityVerifyButton } from "./IdentityVerifyButton";
import { mib007Link } from "./chat-utils";
import { PoweredByNirlab } from "@shre/ui-kit";
import { BookmarkPanel } from "./components/BookmarkPanel";
import { getBookmarks } from "./store";

// Pre-defined tag color mapping
const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  work:     { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  personal: { bg: "rgba(34,197,94,0.15)",  text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  debug:    { bg: "rgba(239,68,68,0.15)",   text: "#f87171", border: "rgba(239,68,68,0.3)" },
  urgent:   { bg: "rgba(249,115,22,0.15)",  text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  idea:     { bg: "rgba(168,85,247,0.15)",  text: "#c084fc", border: "rgba(168,85,247,0.3)" },
  research: { bg: "rgba(14,165,233,0.15)",  text: "#38bdf8", border: "rgba(14,165,233,0.3)" },
  bug:      { bg: "rgba(220,38,38,0.15)",   text: "#ef4444", border: "rgba(220,38,38,0.3)" },
  feature:  { bg: "rgba(34,211,238,0.15)",  text: "#22d3ee", border: "rgba(34,211,238,0.3)" },
  archive:  { bg: "rgba(161,161,170,0.15)", text: "#a1a1aa", border: "rgba(161,161,170,0.3)" },
};

const DEFAULT_TAG_COLOR = { bg: "rgba(161,161,170,0.12)", text: "var(--c-text-3)", border: "rgba(161,161,170,0.25)" };

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
}

export function Sidebar() {
  const { state, actions } = useApp();
  const { sessions, activeSessionId, activeAgentId, view, sidebarOpen, theme } = state;
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const currentAgent = getAgent(activeAgentId);
  const preloadedAgents = useRef(new Set<string>());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagEditorSessionId, setTagEditorSessionId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef(0);
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const bookmarkCount = useMemo(() => getBookmarks().length, [sessions]); // re-check when sessions change

  // Track which agents are actively streaming (background work indicator)
  const [streamingAgents, setStreamingAgents] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const update = (streams: ActiveStream[]) => {
      const map = new Map<string, string>();
      for (const s of streams) map.set(s.agentId, s.status);
      setStreamingAgents(map);
    };
    return onStreamChange(update);
  }, []);

  useEffect(() => { if (!sidebarOpen) setShowMoreMenu(false); }, [sidebarOpen]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth <= 768;
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [sidebarOpen]);

  // Collect all unique tags across sessions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    sessions.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [sessions]);

  // Background preload: when agent picker opens, preload core agents' histories
  const preloadAgents = () => {
    const coreAgents = AGENTS.filter((a) => a.group === "core");
    for (const agent of coreAgents) {
      if (preloadedAgents.current.has(agent.id)) continue;
      preloadedAgents.current.add(agent.id);
      // Fire-and-forget — preloads into browser cache
      fetchAllAgentMessages(agent.id, 0).catch(() => {});
    }
  };

  // Active conversations — all sessions with messages, pinned first then by most recent
  const activeSessions = sessions
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

  // Agent-filtered sessions for the count badge on Chat nav
  const agentSessions = sessions.filter((s) => (s.agentId || "main") === activeAgentId);

  // Agent-scoped counts
  const agentActivity = state.activity.filter((a) => (a.agentId || "main") === activeAgentId);
  const agentFiles = state.files.filter((f) => (f.agentId || "main") === activeAgentId);

  // Session row renderer (used by date-grouped rendering)
  const renderSession = (s: Session) => {
    const agent = getAgent(s.agentId || "main");
    const isActive = activeSessionId === s.id && view === "chat";
    const lastMsg = s.messages[s.messages.length - 1];
    const preview = lastMsg ? lastMsg.content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim().slice(0, 50) : "";
    const timeStr = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    return (
      <div
        key={s.id}
        onClick={() => {
          if (editingId !== s.id) {
            actions.setActiveAgent(s.agentId || "main");
            actions.switchSession(s.id);
            actions.setView("chat");
            if (window.innerWidth < 768) actions.setSidebarOpen(false);
          }
        }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditText(s.title); }}
        className="w-full text-left px-2 py-2 rounded-lg transition-colors group cursor-pointer mb-0.5"
        style={{
          background: isActive ? "var(--c-bg-active)" : "transparent",
          color: "var(--c-text-1)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base shrink-0">{agent.emoji}</span>
          <div className="flex-1 min-w-0">
            {editingId === s.id ? (
              <InlineEdit
                value={editText}
                onChange={setEditText}
                onCommit={() => { if (editText.trim()) actions.updateSessionTitle(s.id, editText.trim()); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium truncate">{s.title !== "New chat" ? s.title : agent.name}</span>
                  <span className="text-[10px] shrink-0 ml-1" style={{ color: "var(--c-text-5)" }}>{timeStr}</span>
                </div>
                {preview && (
                  <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--c-text-4)" }}>{preview}</div>
                )}
                {s.tags && s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {s.tags.map((tag) => {
                      const color = getTagColor(tag);
                      return (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-sm leading-tight"
                          style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          {editingId !== s.id && (
            <div className="flex items-center shrink-0 ml-1 gap-0.5">
              {s.pinned && <span className="text-[10px] group-hover:hidden" style={{ color: "var(--c-text-4)" }}>📌</span>}
              <span
                onClick={(e) => { e.stopPropagation(); actions.togglePin(s.id); }}
                className="hidden group-hover:block text-[10px] cursor-pointer"
                style={{ color: "var(--c-text-4)", opacity: s.pinned ? 1 : 0.5 }}
                title={s.pinned ? "Unpin" : "Pin"}
              >📌</span>
              {state.writeEnabled && (
              <span
                role="button" aria-label="Delete session" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); actions.deleteSession(s.id); } }}
                onClick={(e) => { e.stopPropagation(); actions.deleteSession(s.id); }}
                className="hidden group-hover:block text-red-400/60 hover:text-red-400 text-xs"
              >x</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    {/* Mobile overlay backdrop */}
    <div
      className={`sidebar-backdrop md:hidden ${sidebarOpen ? "sidebar-backdrop-visible" : ""}`}
      onClick={() => actions.setSidebarOpen(false)}
      aria-hidden="true"
    />
    <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 transition-[width] duration-150 overflow-hidden flex flex-col h-full fixed md:relative z-[55] md:z-auto sidebar-mobile-slide ${!sidebarOpen ? "sidebar-hidden" : ""}`}
      style={{ background: "var(--c-bg-sidebar, var(--c-bg-2))", borderRight: "1px solid var(--c-border-2)" }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => {
        touchStartRef.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchStartRef.current;
        if (dx < -80) {
          actions.setSidebarOpen(false);
        }
      }}
    >
      <div className="w-64 flex flex-col h-full">
        {/* Mobile close button */}
        <div className="md:hidden flex items-center justify-end px-2 pt-2">
          <button
            onClick={() => actions.setSidebarOpen(false)}
            className="h-11 w-11 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--c-text-3)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            aria-label="Close sidebar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {/* Agent Picker trigger */}
        <div className="p-3" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
          <button
            onClick={() => { setShowAgentPicker(!showAgentPicker); if (!showAgentPicker) preloadAgents(); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors"
            style={{ color: "var(--c-text-1)" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--c-bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <span className="text-lg relative">
              {currentAgent.emoji}
              {streamingAgents.has(activeAgentId) && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full" style={{ background: "var(--c-success)", boxShadow: "0 0 6px var(--c-success)", animation: "pulse 1.5s ease-in-out infinite" }} />
              )}
            </span>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--c-text-1)" }}>
                {currentAgent.name}
                {streamingAgents.size > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(52,211,153,0.15)", color: "var(--c-success)", border: "1px solid rgba(52,211,153,0.3)" }}>
                    {streamingAgents.size} active
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono truncate" style={{ color: "var(--c-text-4)" }}>{currentAgent.id}</div>
            </div>
            <svg className="h-4 w-4" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* Agent Picker slide-out panel */}
        {showAgentPicker && (
          <>
          <div
            className="fixed inset-0 z-[70]"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
            onClick={() => setShowAgentPicker(false)}
          />
          <div
            className="fixed top-0 left-0 h-full z-[71] flex flex-col"
            style={{
              width: 280,
              background: "var(--c-bg-2)",
              borderRight: "1px solid var(--c-border-2)",
              boxShadow: "4px 0 24px rgba(0,0,0,0.3)",
              animation: "slide-in-left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
            }}
          >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>Select Agent</span>
            <button
              onClick={() => setShowAgentPicker(false)}
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: "var(--c-text-3)" }}
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {(["core", "department", "council"] as const).map((group) => {
              const groupAgents = AGENTS.filter((a) => a.group === group);
              return (
                <div key={group}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2" style={{ color: "var(--c-text-4)", background: "var(--c-bg-3)" }}>
                    {group === "core" ? "Core" : group === "department" ? "Department" : "Council"}
                  </div>
                  {groupAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        actions.setActiveAgent(agent.id);
                        setShowAgentPicker(false);
                        if (window.innerWidth < 768) actions.setSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        background: agent.id === activeAgentId ? "var(--c-accent-soft)" : "transparent",
                        color: agent.id === activeAgentId ? "var(--c-accent)" : "var(--c-text-2)",
                      }}
                      onMouseEnter={(e) => { if (agent.id !== activeAgentId) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                      onMouseLeave={(e) => { if (agent.id !== activeAgentId) e.currentTarget.style.background = agent.id === activeAgentId ? "var(--c-accent-soft)" : "transparent"; }}
                    >
                      <span className="text-lg relative">
                        {agent.emoji}
                        {streamingAgents.has(agent.id) && (
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                            style={{
                              background: streamingAgents.get(agent.id) === "thinking" ? "var(--c-warning)" : "var(--c-success)",
                              boxShadow: `0 0 6px ${streamingAgents.get(agent.id) === "thinking" ? "var(--c-warning)" : "var(--c-success)"}`,
                              animation: "pulse 1.5s ease-in-out infinite",
                            }}
                          />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{agent.name}</div>
                        {streamingAgents.has(agent.id) ? (
                          <div className="text-[10px] font-mono" style={{ color: streamingAgents.get(agent.id) === "thinking" ? "var(--c-warning)" : "var(--c-success)" }}>
                            {streamingAgents.get(agent.id)}
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono truncate" style={{ color: "var(--c-text-4)" }}>{agent.model.split("/")[1]?.split("-").slice(0, 2).join("-") || agent.model}</div>
                        )}
                      </div>
                      {agent.id === activeAgentId && (
                        <svg className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        </>
        )}

        {/* New Chat button — ChatGPT-style prominent action */}
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
          <button
            onClick={() => {
              if (!state.writeEnabled) return;
              const id = actions.newSession();
              actions.switchSession(id);
              actions.setView("chat");
              if (window.innerWidth < 768) actions.setSidebarOpen(false);
            }}
            disabled={!state.writeEnabled}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{
              border: "1px solid var(--c-border-1)",
              color: "var(--c-text-1)",
              background: "transparent",
            }}
            onMouseEnter={(e) => { if (!state.writeEnabled) return; e.currentTarget.style.background = "var(--c-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            title={!state.writeEnabled ? "Enable Write mode in settings to create new chats" : "New chat"}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New chat
          </button>
        </div>

        {/* Conversations — ChatGPT-style primary navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-1">

          {/* Tag filter pills */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 px-1 mb-1.5">
              {allTags.map((tag) => {
                const color = getTagColor(tag);
                const isActive = activeTagFilter === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTagFilter(isActive ? null : tag)}
                    className="text-[11px] px-2 py-1 rounded-full transition-all"
                    style={{
                      background: isActive ? color.bg : "transparent",
                      color: isActive ? color.text : "var(--c-text-4)",
                      border: `1px solid ${isActive ? color.border : "var(--c-border-1)"}`,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {activeTagFilter && (
                <button
                  onClick={() => setActiveTagFilter(null)}
                  className="text-[11px] px-1.5 py-1 rounded-full"
                  style={{ color: "var(--c-text-5)" }}
                  title="Clear filter"
                >
                  clear
                </button>
              )}
            </div>
          )}

          <div className="relative px-1 mb-1.5">
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full text-base md:text-[13px] px-2.5 py-1.5 rounded-lg outline-none placeholder:opacity-50"
              style={{
                background: "var(--c-bg-card)",
                color: "var(--c-text-2)",
                border: "1px solid var(--c-border-1)",
              }}
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] leading-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{ color: "var(--c-text-4)" }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {(() => {
            let filtered = activeSessions;
            // Apply tag filter
            if (activeTagFilter) {
              filtered = filtered.filter((s) => s.tags?.includes(activeTagFilter));
            }
            // Apply search filter
            if (sidebarSearch) {
              const term = sidebarSearch.toLowerCase();
              filtered = filtered.filter((s) =>
                s.title.toLowerCase().includes(term) ||
                s.messages.some((m) => m.content.toLowerCase().includes(term))
              );
            }
            // Group by date (ChatGPT-style)
            const groups = groupSessionsByDate(filtered);
            return groups.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-1 mt-2.5" style={{ color: "var(--c-text-5)" }}>
                  {group.label}
                </div>
                {group.sessions.map((s) => renderSession(s))}
              </div>
            ));
          })()}
          {(() => {
            // Also render ungrouped for empty states
            return null;
          })()}
          {activeSessions.length === 0 && !sidebarSearch && !activeTagFilter && (
            <p className="text-[11px] text-center mt-8" style={{ color: "var(--c-text-3)" }}>No conversations yet</p>
          )}
          {(sidebarSearch || activeTagFilter) && (() => {
            let filtered = activeSessions;
            if (activeTagFilter) filtered = filtered.filter((s) => s.tags?.includes(activeTagFilter));
            if (sidebarSearch) {
              const term = sidebarSearch.toLowerCase();
              filtered = filtered.filter((s) => s.title.toLowerCase().includes(term) || s.messages.some((m) => m.content.toLowerCase().includes(term)));
            }
            return filtered.length === 0;
          })() && (
            <p className="text-[11px] text-center mt-4" style={{ color: "var(--c-text-3)" }}>No matches</p>
          )}
        </div>

        {/* Nav links — compact row at bottom */}
        <div className="px-3 py-1.5 flex items-center justify-around" style={{ borderTop: "1px solid var(--c-border-2)" }}>
          <NavIconBtn active={view === "chat"} onClick={() => actions.setView("chat")} title="Chat" icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          } />
          <NavIconBtn active={view === "activity"} onClick={() => actions.setView("activity")} title="Activity" icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          } />
          <div style={{ position: "relative" }}>
            <NavIconBtn active={false} onClick={() => setBookmarkPanelOpen(true)} title="Bookmarks" icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            } />
            {bookmarkCount > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2,
                minWidth: 12, height: 12, borderRadius: 6,
                background: "var(--c-accent, #638dff)", color: "#fff",
                fontSize: 8, fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center",
                padding: "0 2px", lineHeight: 1, pointerEvents: "none",
              }}>
                {bookmarkCount > 99 ? "99+" : bookmarkCount}
              </span>
            )}
          </div>
          <NavIconBtn active={view === "briefing"} onClick={() => actions.setView("briefing")} title="Briefing" icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          } />

          <div style={{ position: "relative" }} ref={moreMenuRef}>
            <NavIconBtn
              active={showMoreMenu}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More"
              icon={
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              }
            />

            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowMoreMenu(false)} />
                <div
                  className="fixed z-[61] w-56 rounded-xl shadow-xl"
                  style={{
                    background: "var(--c-bg-2)",
                    border: "1px solid var(--c-border-1)",
                    maxHeight: "min(520px, calc(100dvh - 40px))",
                    overflowY: "auto",
                    ...(() => {
                      const rect = moreMenuRef.current?.getBoundingClientRect();
                      if (!rect) return { bottom: 60, left: 12 };
                      const menuH = 520;
                      const spaceAbove = rect.top;
                      if (spaceAbove >= menuH) {
                        return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
                      }
                      return { top: Math.max(8, rect.top - Math.min(menuH, spaceAbove - 8)), left: rect.left };
                    })(),
                  }}
                >
                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Views</div>
                    <MoreMenuItem label="Feed" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>} active={view === "feed"} onClick={() => { actions.setView("feed"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Feed Analytics" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>} active={view === "feed-analytics"} onClick={() => { actions.setView("feed-analytics"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Cost Dashboard" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>} active={view === "cost-dashboard"} onClick={() => { actions.setView("cost-dashboard"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Reports" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} active={view === "reports"} onClick={() => { actions.setView("reports"); setShowMoreMenu(false); }} />
                  </div>

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "0 12px" }} />

                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Apps</div>
                    <MoreMenuItem label="Marketplace" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z"/><line x1="3" y1="7" x2="21" y2="7"/><path d="M16 11a4 4 0 0 1-8 0"/></svg>} active={view === "marketplace"} onClick={() => { actions.setView("marketplace"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Task Timeline" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>} active={view === "task-timeline"} onClick={() => { actions.setView("task-timeline"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Tasks" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} external onClick={() => { window.open(mib007Link("tasks"), "_blank"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Reminders" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>} external onClick={() => { window.open(mib007Link("reminders"), "_blank"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Projects" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>} external onClick={() => { window.open(mib007Link("projects"), "_blank"); setShowMoreMenu(false); }} />
                  </div>

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "0 12px" }} />

                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Tools</div>
                    <MoreMenuItem label="Admin" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} active={view === "admin"} onClick={() => { actions.setView("admin"); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Fine-Tuning" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} active={view === "finetune"} onClick={() => { actions.setView("finetune"); setShowMoreMenu(false); }} />
                  </div>

                  <div style={{ height: 1, background: "var(--c-border-2)", margin: "0 12px" }} />

                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-4)" }}>Data</div>
                    <MoreMenuItem label="Export Sessions" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>} onClick={() => { exportSessions(sessions); setShowMoreMenu(false); }} />
                    <MoreMenuItem label="Import Sessions" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>} onClick={() => { importInputRef.current?.click(); setShowMoreMenu(false); }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { importSessions(file, sessions, () => window.location.reload(), (msg) => { actions.setStatusLine(msg); setTimeout(() => actions.setStatusLine(null), 3000); }); }
          e.target.value = "";
        }} />

        {/* Footer — minimal */}
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: "1px solid var(--c-border-2)" }}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { actions.toggleWriteEnabled(); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: state.writeEnabled ? "var(--c-accent)" : "var(--c-text-3)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              title={state.writeEnabled ? "Write mode ON (click to go read-only)" : "Read-only mode (click to enable write)"}
            >
              {state.writeEnabled ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              )}
            </button>
            <IdentityVerifyButton />
            <ThemeCustomizer />
            <button
              onClick={() => actions.toggleTheme()}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--c-text-3)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <PoweredByNirlab variant="badge" />
            {actions.logout && (
              <button
                onClick={actions.logout}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--c-text-3)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "var(--c-danger)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--c-text-3)"; }}
                title="Sign out"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    <BookmarkPanel
      open={bookmarkPanelOpen}
      onClose={() => setBookmarkPanelOpen(false)}
      onNavigate={(sessionId, _messageIndex) => {
        actions.switchSession(sessionId);
        actions.setView("chat");
        if (window.innerWidth < 768) actions.setSidebarOpen(false);
        // Scroll to bookmarked message after navigation
        setTimeout(() => {
          const msgEl = document.querySelector(`[data-msg-index="${_messageIndex}"]`);
          if (msgEl) msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }}
    />
    </>
  );
}

function InlineEdit({ value, onChange, onCommit, onCancel }: {
  value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Edit session title"
      className="w-full bg-transparent outline-none text-xs rounded px-0.5"
      style={{ color: "var(--c-text-1)", border: "1px solid var(--c-border-1)" }}
    />
  );
}

function NavIconBtn({ active, onClick, title, icon, external }: {
  active: boolean; onClick: () => void; title: string; icon: React.ReactNode; external?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      className="p-2 rounded-lg transition-colors relative"
      style={{
        background: active ? "var(--c-bg-active)" : "transparent",
        color: active ? "var(--c-text-1)" : "var(--c-text-3)",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {icon}
      {external && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--c-accent, #60a5fa)" }} />}
    </button>
  );
}

function MoreMenuItem({ label, icon, active, external, onClick }: {
  label: string; icon: React.ReactNode; active?: boolean; external?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
      style={{ color: active ? "var(--c-accent)" : "var(--c-text-1)" }}
    >
      <span style={{ color: active ? "var(--c-accent)" : "var(--c-text-3)" }}>{icon}</span>
      {label}
      {external && (
        <svg className="h-3 w-3 ml-auto" style={{ color: "var(--c-text-4)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      )}
    </button>
  );
}

// ── Date grouping for ChatGPT-style sidebar ──────────────────────────

interface DateGroup {
  label: string;
  sessions: Session[];
}

function groupSessionsByDate(sessions: Session[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const last7 = today - 7 * 86400000;
  const last30 = today - 30 * 86400000;

  const groups: Record<string, Session[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    "Last 30 days": [],
    Older: [],
  };

  for (const s of sessions) {
    if (s.pinned) {
      groups.Pinned.push(s);
      continue;
    }
    const t = s.updatedAt;
    if (t >= today) groups.Today.push(s);
    else if (t >= yesterday) groups.Yesterday.push(s);
    else if (t >= last7) groups["Last 7 days"].push(s);
    else if (t >= last30) groups["Last 30 days"].push(s);
    else groups.Older.push(s);
  }

  const order = ["Pinned", "Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, sessions: groups[label] }));
}
