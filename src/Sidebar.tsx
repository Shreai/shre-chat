import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp, AGENTS, getAgent, DOMAIN_META, type Session } from './store';
import { getStoredAuth } from './AppAuth';
import { fetchAllAgentMessages } from './router-client';
import { onStreamChange, type ActiveStream } from './gateway-ws';
import { PoweredByNirlab } from '@shre/ui-kit';
import { BookmarkPanel } from './components/BookmarkPanel';
import { SharedSkillResumeCard } from './components/SharedSkillResumeCard';
import { getBookmarks } from './store';
import { usePreferences } from './preferences-store';

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  work: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  personal: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  debug: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
  urgent: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  idea: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  research: { bg: 'rgba(14,165,233,0.15)', text: '#38bdf8', border: 'rgba(14,165,233,0.3)' },
  bug: { bg: 'rgba(220,38,38,0.15)', text: '#ef4444', border: 'rgba(220,38,38,0.3)' },
  feature: { bg: 'rgba(34,211,238,0.15)', text: '#22d3ee', border: 'rgba(34,211,238,0.3)' },
  archive: { bg: 'rgba(161,161,170,0.15)', text: '#a1a1aa', border: 'rgba(161,161,170,0.3)' },
};

const DEFAULT_TAG_COLOR = {
  bg: 'rgba(161,161,170,0.12)',
  text: 'var(--c-text-3)',
  border: 'rgba(161,161,170,0.25)',
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
}

interface MinimumFleetRole {
  id: string;
  name: string;
  agentId: string;
  purpose: string;
  topSkills: string[];
}

export function Sidebar() {
  const { state, actions } = useApp();
  const { sessions, activeSessionId, activeAgentId, view, sidebarOpen, theme } = state;
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [groupByMode, setGroupByMode] = useState<'role' | 'domain'>('role');
  const agentSearchRef = useRef<HTMLInputElement>(null);

  const currentAgent = getAgent(activeAgentId);
  const preloadedAgents = useRef(new Set<string>());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagEditorSessionId, setTagEditorSessionId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const touchStartRef = useRef(0);
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
  const bookmarkCount = useMemo(() => getBookmarks().length, [sessions]);
  const features = usePreferences((s) => s.features);

  const [streamingAgents, setStreamingAgents] = useState<Map<string, string>>(new Map());
  const [minimumFleet, setMinimumFleet] = useState<MinimumFleetRole[]>([]);
  useEffect(() => {
    const update = (streams: ActiveStream[]) => {
      const map = new Map<string, string>();
      for (const s of streams) map.set(s.agentId, s.status);
      setStreamingAgents(map);
    };
    return onStreamChange(update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agents/minimum-fleet')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { fleet?: MinimumFleetRole[] } | null) => {
        if (cancelled || !data?.fleet) return;
        setMinimumFleet(data.fleet);
      })
      .catch(() => {
        void 0;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showAgentPicker) {
      setAgentSearch('');
      setTimeout(() => agentSearchRef.current?.focus(), 150);
    }
  }, [showAgentPicker]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth <= 768;
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [sidebarOpen]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    sessions.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [sessions]);

  const preloadAgents = () => {
    if (!getStoredAuth()) return;
    const coreAgents = AGENTS.filter((a) => a.group === 'core');
    for (const agent of coreAgents) {
      if (preloadedAgents.current.has(agent.id)) continue;
      preloadedAgents.current.add(agent.id);
      fetchAllAgentMessages(agent.id, 0).catch(() => {});
    }
  };

  const activeSessions = sessions
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

  const agentSessions = sessions.filter((s) => (s.agentId || 'main') === activeAgentId);

  const agentActivity = state.activity.filter((a) => (a.agentId || 'main') === activeAgentId);
  const agentFiles = state.files.filter((f) => (f.agentId || 'main') === activeAgentId);

  const renderSession = (s: Session) => {
    const agent = getAgent(s.agentId || 'main');
    const isActive = activeSessionId === s.id && view === 'chat';
    const lastMsg = s.messages[s.messages.length - 1];
    const preview = lastMsg
      ? lastMsg.content
          .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
          .trim()
          .slice(0, 50)
      : '';
    const timeStr = s.updatedAt
      ? new Date(s.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '';
    return (
      <SwipeableRow
        key={`swipe-${s.id}`}
        enabled={state.writeEnabled}
        onDelete={() => actions.deleteSession(s.id)}
        onPin={() => actions.togglePin(s.id)}
        pinned={s.pinned}
      >
        <div
          key={s.id}
          onClick={() => {
            if (editingId !== s.id) {
              actions.setActiveAgent(s.agentId || 'main');
              actions.switchSession(s.id);
              actions.setView('chat');
              if (window.innerWidth < 768) actions.setSidebarOpen(false);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingId(s.id);
            setEditText(s.title);
          }}
          className="w-full text-left px-2 py-2 rounded-lg transition-colors group cursor-pointer mb-0.5"
          style={{
            background: isActive ? 'var(--c-bg-active)' : 'transparent',
            color: 'var(--c-text-1)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">{s.type === 'voice' ? '🎙️' : agent.emoji}</span>
            <div className="flex-1 min-w-0">
              {editingId === s.id ? (
                <InlineEdit
                  value={editText}
                  onChange={setEditText}
                  onCommit={() => {
                    if (editText.trim()) actions.updateSessionTitle(s.id, editText.trim());
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium truncate">{agent.name}</span>
                    <span
                      className="text-[10px] shrink-0 ml-1"
                      style={{ color: 'var(--c-text-5)' }}
                    >
                      {timeStr}
                    </span>
                  </div>
                  {s.title !== 'New chat' && s.title !== agent.name && (
                    <div
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: 'var(--c-text-3)' }}
                    >
                      {s.title}
                    </div>
                  )}
                  {preview && (
                    <div
                      className="text-[10px] truncate mt-0.5"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      {preview}
                    </div>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {s.tags.map((tag) => {
                        const color = getTagColor(tag);
                        return (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded-sm leading-tight"
                            style={{
                              background: color.bg,
                              color: color.text,
                              border: `1px solid ${color.border}`,
                            }}
                          >
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
                {s.pinned && (
                  <span
                    className="text-[10px] group-hover:hidden"
                    style={{ color: 'var(--c-text-4)' }}
                  >
                    📌
                  </span>
                )}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.togglePin(s.id);
                  }}
                  className="hidden group-hover:block text-[10px] cursor-pointer"
                  style={{ color: 'var(--c-text-4)', opacity: s.pinned ? 1 : 0.5 }}
                  title={s.pinned ? 'Unpin' : 'Pin'}
                >
                  📌
                </span>
                {state.writeEnabled && (
                  <span
                    role="button"
                    aria-label="Delete session"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        actions.deleteSession(s.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.deleteSession(s.id);
                    }}
                    className="hidden group-hover:block text-red-400/60 hover:text-red-400 text-xs"
                  >
                    x
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </SwipeableRow>
    );
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-backdrop md:hidden ${sidebarOpen ? 'sidebar-backdrop-visible' : ''}`}
        onClick={() => actions.setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`${sidebarOpen ? 'w-[min(16rem,90vw)] md:w-64' : 'w-0'} shrink-0 transition-[width] duration-150 overflow-hidden flex flex-col h-full fixed md:relative z-[55] md:z-auto sidebar-mobile-slide ${!sidebarOpen ? 'sidebar-hidden' : ''}`}
        style={{
          background: 'var(--c-bg-sidebar, var(--c-bg-2))',
          borderRight: '1px solid var(--c-border-2)',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartRef.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchStartRef.current;
          const swipeThreshold = Math.min(80, window.innerWidth * 0.2);
          if (dx < -swipeThreshold) {
            actions.setSidebarOpen(false);
          }
        }}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Agent Picker trigger + mobile close */}
          <div
            className="p-3 flex items-center gap-1"
            style={{ borderBottom: '1px solid var(--c-border-2)' }}
          >
            <button
              onClick={() => {
                setShowAgentPicker(!showAgentPicker);
                if (!showAgentPicker) preloadAgents();
              }}
              className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors min-w-0"
              style={{ color: 'var(--c-text-1)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="text-lg relative">
                {currentAgent.emoji}
                {streamingAgents.has(activeAgentId) && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                    style={{
                      background: 'var(--c-success)',
                      boxShadow: '0 0 6px var(--c-success)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                  />
                )}
              </span>
              <div className="flex-1 text-left min-w-0">
                <div
                  className="text-sm font-semibold flex items-center gap-1.5"
                  style={{ color: 'var(--c-text-1)' }}
                >
                  {currentAgent.name}
                  {streamingAgents.size > 0 && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(52,211,153,0.15)',
                        color: 'var(--c-success)',
                        border: '1px solid rgba(52,211,153,0.3)',
                      }}
                    >
                      {streamingAgents.size} active
                    </span>
                  )}
                </div>
                <div
                  className="text-[11px] font-mono truncate"
                  style={{ color: 'var(--c-text-4)' }}
                >
                  {currentAgent.id}
                </div>
              </div>
              <svg
                className="h-4 w-4 hidden md:block"
                style={{ color: 'var(--c-text-4)' }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              onClick={() => actions.setSidebarOpen(false)}
              className="md:hidden h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--c-text-3)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Close sidebar"
            >
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <SharedSkillResumeCard agentId={activeAgentId} />

          {/* Agent Picker slide-out panel */}
          {showAgentPicker && (
            <>
              <div
                className="fixed inset-0 z-[70]"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
                onClick={() => setShowAgentPicker(false)}
              />
              <div
                className="fixed top-0 left-0 h-full z-[71] flex flex-col"
                style={{
                  width: 'min(280px, 90vw)',
                  background: 'var(--c-bg-2)',
                  borderRight: '1px solid var(--c-border-2)',
                  boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
                  animation: 'slide-in-left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                }}
              >
                <div
                  className="px-4 py-3 shrink-0"
                  style={{ borderBottom: '1px solid var(--c-border-2)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                      Select Agent
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setGroupByMode(groupByMode === 'role' ? 'domain' : 'role');
                          setDomainFilter(null);
                        }}
                        className="h-7 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium transition-colors"
                        style={{
                          color: 'var(--c-text-3)',
                          background: 'var(--c-bg-3)',
                          border: '1px solid var(--c-border-2)',
                        }}
                        title={groupByMode === 'role' ? 'Group by capability' : 'Group by role'}
                      >
                        {groupByMode === 'role' ? 'By Role' : 'By Capability'}
                      </button>
                      <button
                        onClick={() => setShowAgentPicker(false)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                        style={{ color: 'var(--c-text-3)' }}
                        aria-label="Close"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <svg
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                      style={{ color: 'var(--c-text-4)' }}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      ref={agentSearchRef}
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search agents or capabilities..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg text-[12px] outline-none transition-colors"
                      style={{
                        background: 'var(--c-bg-3)',
                        color: 'var(--c-text-1)',
                        border: '1px solid var(--c-border-2)',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-accent)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                      }}
                    />
                  </div>
                  {/* Domain filter chips — shown in domain mode */}
                  {groupByMode === 'domain' && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(() => {
                        const allDomains = new Set<string>();
                        AGENTS.forEach((a) => (a.domains || []).forEach((d) => allDomains.add(d)));
                        return [...allDomains].sort().map((domain) => {
                          const meta = DOMAIN_META[domain] || { label: domain, color: '#94a3b8' };
                          const isActive = domainFilter === domain;
                          return (
                            <button
                              key={domain}
                              onClick={() => setDomainFilter(isActive ? null : domain)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                              style={{
                                background: isActive ? meta.color + '30' : 'var(--c-bg-3)',
                                color: isActive ? meta.color : 'var(--c-text-4)',
                                border: `1px solid ${isActive ? meta.color + '60' : 'var(--c-border-2)'}`,
                              }}
                            >
                              {meta.label}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {groupByMode === 'role'
                    ? (() => {
                        const q = agentSearch.trim().toLowerCase();
                        const filteredMinimumFleet = minimumFleet.filter((role) => {
                          if (!q) return true;
                          const agent = getAgent(role.agentId);
                          return (
                            role.name.toLowerCase().includes(q) ||
                            role.agentId.toLowerCase().includes(q) ||
                            role.purpose.toLowerCase().includes(q) ||
                            role.topSkills.some((skill) => skill.toLowerCase().includes(q)) ||
                            agent.name.toLowerCase().includes(q)
                          );
                        });

                        const groupedAgents = (['core', 'department', 'council'] as const)
                          .map((group) => {
                            const allGroupAgents = AGENTS.filter((a) => a.group === group);
                            const groupAgents = q
                              ? allGroupAgents.filter(
                                  (a) =>
                                    a.name.toLowerCase().includes(q) ||
                                    a.id.toLowerCase().includes(q) ||
                                    a.model.toLowerCase().includes(q) ||
                                    (a.domains || []).some((d) => d.toLowerCase().includes(q)) ||
                                    (a.description || '').toLowerCase().includes(q),
                                )
                              : allGroupAgents;
                            return groupAgents.length > 0 ? { group, groupAgents } : null;
                          })
                          .filter(
                            (
                              item,
                            ): item is {
                              group: 'core' | 'department' | 'council';
                              groupAgents: typeof AGENTS;
                            } => !!item,
                          );

                        return (
                          <>
                            {filteredMinimumFleet.length > 0 && (
                              <div>
                                <div
                                  className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2"
                                  style={{ color: 'var(--c-accent)', background: 'var(--c-bg-3)' }}
                                >
                                  Minimum Fleet
                                </div>
                                {filteredMinimumFleet.map((role) => (
                                  <MinimumFleetRow
                                    key={role.id}
                                    role={role}
                                    agent={getAgent(role.agentId)}
                                    activeAgentId={activeAgentId}
                                    streamingAgents={streamingAgents}
                                    onSelect={() => {
                                      actions.setActiveAgent(role.agentId);
                                      setShowAgentPicker(false);
                                      if (window.innerWidth < 768) actions.setSidebarOpen(false);
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                            {groupedAgents.map(({ group, groupAgents }) => (
                              <div key={group}>
                                <div
                                  className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2"
                                  style={{ color: 'var(--c-text-4)', background: 'var(--c-bg-3)' }}
                                >
                                  {group === 'core'
                                    ? 'Core'
                                    : group === 'department'
                                      ? 'Department'
                                      : 'Council'}
                                </div>
                                {groupAgents.map((agent) => (
                                  <AgentPickerRow
                                    key={agent.id}
                                    agent={agent}
                                    activeAgentId={activeAgentId}
                                    streamingAgents={streamingAgents}
                                    onSelect={() => {
                                      actions.setActiveAgent(agent.id);
                                      setShowAgentPicker(false);
                                      if (window.innerWidth < 768) actions.setSidebarOpen(false);
                                    }}
                                  />
                                ))}
                              </div>
                            ))}
                          </>
                        );
                      })()
                    : /* ── Domain-based grouping ── */
                      (() => {
                        const domainAgentsMap = new Map<string, typeof AGENTS>();
                        for (const agent of AGENTS) {
                          for (const d of agent.domains || ['general']) {
                            if (!domainAgentsMap.has(d)) domainAgentsMap.set(d, []);
                            domainAgentsMap.get(d)!.push(agent);
                          }
                        }
                        const sortedDomains = [...domainAgentsMap.keys()].sort((a, b) => {
                          if (a === 'all') return -1;
                          if (b === 'all') return 1;
                          return a.localeCompare(b);
                        });
                        // If a domain filter is active, only show that domain
                        const domainsToShow = domainFilter ? [domainFilter] : sortedDomains;
                        return domainsToShow.map((domain) => {
                          const domainAgents = (domainAgentsMap.get(domain) || []).filter((a) => {
                            if (!agentSearch.trim()) return true;
                            const q = agentSearch.toLowerCase();
                            return (
                              a.name.toLowerCase().includes(q) ||
                              a.id.toLowerCase().includes(q) ||
                              (a.description || '').toLowerCase().includes(q)
                            );
                          });
                          if (domainAgents.length === 0) return null;
                          const meta = DOMAIN_META[domain] || { label: domain, color: '#94a3b8' };
                          return (
                            <div key={domain}>
                              <div
                                className="flex items-center gap-2 px-4 py-2"
                                style={{ background: 'var(--c-bg-3)' }}
                              >
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ background: meta.color }}
                                />
                                <span
                                  className="text-[10px] font-semibold uppercase tracking-wider"
                                  style={{ color: meta.color }}
                                >
                                  {meta.label}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                                  ({domainAgents.length})
                                </span>
                              </div>
                              {domainAgents.map((agent) => (
                                <AgentPickerRow
                                  key={`${domain}-${agent.id}`}
                                  agent={agent}
                                  activeAgentId={activeAgentId}
                                  streamingAgents={streamingAgents}
                                  onSelect={() => {
                                    actions.setActiveAgent(agent.id);
                                    setShowAgentPicker(false);
                                    if (window.innerWidth < 768) actions.setSidebarOpen(false);
                                  }}
                                />
                              ))}
                            </div>
                          );
                        });
                      })()}
                  {agentSearch.trim() &&
                    AGENTS.filter(
                      (a) =>
                        a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
                        a.id.toLowerCase().includes(agentSearch.toLowerCase()) ||
                        a.model.toLowerCase().includes(agentSearch.toLowerCase()) ||
                        (a.domains || []).some((d) =>
                          d.toLowerCase().includes(agentSearch.toLowerCase()),
                        ) ||
                        (a.description || '').toLowerCase().includes(agentSearch.toLowerCase()),
                    ).length === 0 && (
                      <div
                        className="px-4 py-8 text-center text-[12px]"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        No agents match "{agentSearch}"
                      </div>
                    )}
                </div>
              </div>
            </>
          )}

          {/* New Chat button — ChatGPT-style prominent action */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
            <button
              onClick={() => {
                if (!state.writeEnabled) return;
                const id = actions.newSession();
                actions.switchSession(id);
                actions.setView('chat');
                if (window.innerWidth < 768) actions.setSidebarOpen(false);
              }}
              disabled={!state.writeEnabled}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{
                border: '1px solid var(--c-border-1)',
                color: 'var(--c-text-1)',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!state.writeEnabled) return;
                e.currentTarget.style.background = 'var(--c-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              title={
                !state.writeEnabled
                  ? 'Enable Write mode in settings to create new chats'
                  : 'New chat'
              }
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
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
                        background: isActive ? color.bg : 'transparent',
                        color: isActive ? color.text : 'var(--c-text-4)',
                        border: `1px solid ${isActive ? color.border : 'var(--c-border-1)'}`,
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
                    style={{ color: 'var(--c-text-5)' }}
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
                  background: 'var(--c-bg-card)',
                  color: 'var(--c-text-2)',
                  border: '1px solid var(--c-border-1)',
                }}
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] leading-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ color: 'var(--c-text-4)' }}
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
                filtered = filtered.filter(
                  (s) =>
                    s.title.toLowerCase().includes(term) ||
                    s.messages.some((m) => m.content.toLowerCase().includes(term)),
                );
              }
              // Group by date (ChatGPT-style)
              const groups = groupSessionsByDate(filtered);
              return groups.map((group) => (
                <div key={group.label}>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-1 mt-2.5"
                    style={{ color: 'var(--c-text-5)' }}
                  >
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
              <p className="text-[11px] text-center mt-8" style={{ color: 'var(--c-text-3)' }}>
                No conversations yet
              </p>
            )}
            {(sidebarSearch || activeTagFilter) &&
              (() => {
                let filtered = activeSessions;
                if (activeTagFilter)
                  filtered = filtered.filter((s) => s.tags?.includes(activeTagFilter));
                if (sidebarSearch) {
                  const term = sidebarSearch.toLowerCase();
                  filtered = filtered.filter(
                    (s) =>
                      s.title.toLowerCase().includes(term) ||
                      s.messages.some((m) => m.content.toLowerCase().includes(term)),
                  );
                }
                return filtered.length === 0;
              })() && (
                <p className="text-[11px] text-center mt-4" style={{ color: 'var(--c-text-3)' }}>
                  No matches
                </p>
              )}
          </div>

          {/* Nav links — compact row at bottom */}
          <div
            className="px-3 py-1.5 flex items-center justify-around"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            <NavIconBtn
              active={view === 'chat'}
              onClick={() => actions.setView('chat')}
              title="Chat"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
            <NavIconBtn
              active={view === 'activity'}
              onClick={() => actions.setView('activity')}
              title="Activity"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              }
            />
            {features['bookmarks'] && (
              <div style={{ position: 'relative' }}>
                <NavIconBtn
                  active={false}
                  onClick={() => setBookmarkPanelOpen(true)}
                  title="Bookmarks"
                  icon={
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  }
                />
                {bookmarkCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      minWidth: 12,
                      height: 12,
                      borderRadius: 6,
                      background: 'var(--c-accent, #638dff)',
                      color: '#fff',
                      fontSize: 8,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 2px',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    {bookmarkCount > 99 ? '99+' : bookmarkCount}
                  </span>
                )}
              </div>
            )}
            <NavIconBtn
              active={view === 'employee-activity'}
              onClick={() => actions.setView('employee-activity')}
              title="Employee Activity"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              }
            />
            <NavIconBtn
              active={view === 'briefing'}
              onClick={() => actions.setView('briefing')}
              title="Briefing"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            />
            <NavIconBtn
              active={view === 'agent-trace'}
              onClick={() => actions.setView('agent-trace')}
              title="Agent Trace"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="19" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                  <line x1="7" y1="12" x2="10" y2="7" />
                  <line x1="14" y1="7" x2="17" y2="12" />
                  <line x1="17" y1="14" x2="14" y2="17" />
                  <line x1="10" y1="17" x2="7" y2="14" />
                </svg>
              }
            />
            <NavIconBtn
              active={view === 'agent-social'}
              onClick={() => actions.setView('agent-social')}
              title="Agent Social"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              }
            />
            {features['marketplace'] && (
              <NavIconBtn
                active={view === 'marketplace'}
                onClick={() => actions.setView('marketplace')}
                title="Marketplace"
                icon={
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" />
                    <line x1="3" y1="7" x2="21" y2="7" />
                  </svg>
                }
              />
            )}
            {features['billing'] && (
              <NavIconBtn
                active={view === 'billing'}
                onClick={() => actions.setView('billing')}
                title="Billing"
                icon={
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                }
              />
            )}
          </div>

          {/* Footer — minimal */}
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  actions.toggleWriteEnabled();
                }}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: state.writeEnabled ? 'var(--c-accent)' : 'var(--c-text-3)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title={
                  state.writeEnabled
                    ? 'Write mode ON (click to go read-only)'
                    : 'Read-only mode (click to enable write)'
                }
              >
                {state.writeEnabled ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => actions.toggleTheme()}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--c-text-3)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <PoweredByNirlab variant="badge" />
              {actions.logout && (
                <button
                  onClick={actions.logout}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--c-text-3)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                    e.currentTarget.style.color = 'var(--c-danger)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--c-text-3)';
                  }}
                  title="Sign out"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
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
          actions.setView('chat');
          if (window.innerWidth < 768) actions.setSidebarOpen(false);
          setTimeout(() => {
            const msgEl = document.querySelector(`[data-msg-index="${_messageIndex}"]`);
            if (msgEl) msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }}
      />
    </>
  );
}

/** Swipeable wrapper for session rows — swipe left to reveal Delete/Pin actions. */
function SwipeableRow({
  onDelete,
  onPin,
  pinned,
  enabled,
  children,
}: {
  onDelete: () => void;
  onPin: () => void;
  pinned?: boolean;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [tx, setTx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dirLocked = useRef<'h' | 'v' | null>(null);

  if (!enabled) return <>{children}</>;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}>
      {/* Action buttons behind */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 100,
          display: 'flex',
          alignItems: 'stretch',
          opacity: Math.min(1, Math.abs(tx) / 40),
          transition: swiping ? 'none' : 'opacity 200ms',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin();
            setTx(0);
          }}
          style={{
            flex: 1,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: pinned ? 'rgba(251,191,36,0.2)' : 'rgba(99,102,241,0.2)',
            color: pinned ? '#fbbf24' : '#818cf8',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            flex: 1,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Delete
        </button>
      </div>
      {/* Content — translateX on swipe */}
      <div
        style={{
          transform: `translateX(${tx}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease-out',
          position: 'relative',
          zIndex: 1,
          background: 'inherit',
        }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
          startY.current = e.touches[0].clientY;
          dirLocked.current = null;
          setSwiping(false);
        }}
        onTouchMove={(e) => {
          const dx = e.touches[0].clientX - startX.current;
          const dy = e.touches[0].clientY - startY.current;
          if (!dirLocked.current) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
              dirLocked.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
            }
            return;
          }
          if (dirLocked.current === 'v') return; // vertical scroll — don't swipe
          setSwiping(true);
          setTx(Math.max(-100, Math.min(0, dx)));
        }}
        onTouchEnd={() => {
          setSwiping(false);
          dirLocked.current = null;
          setTx(tx < -50 ? -100 : 0);
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InlineEdit({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Edit session title"
      className="w-full bg-transparent outline-none text-xs rounded px-0.5"
      style={{ color: 'var(--c-text-1)', border: '1px solid var(--c-border-1)' }}
    />
  );
}

function NavIconBtn({
  active,
  onClick,
  title,
  icon,
  external,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  external?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      className="p-2 rounded-lg transition-colors relative"
      style={{
        background: active ? 'var(--c-bg-active)' : 'transparent',
        color: active ? 'var(--c-text-1)' : 'var(--c-text-3)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--c-bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      {external && (
        <span
          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--c-accent, #60a5fa)' }}
        />
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
    'Last 7 days': [],
    'Last 30 days': [],
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
    else if (t >= last7) groups['Last 7 days'].push(s);
    else if (t >= last30) groups['Last 30 days'].push(s);
    else groups.Older.push(s);
  }

  const order = ['Pinned', 'Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, sessions: groups[label] }));
}

// ── Agent Picker Row (extracted for reuse in both role and domain views) ──
function AgentPickerRow({
  agent,
  activeAgentId,
  streamingAgents,
  onSelect,
}: {
  agent: import('./store').Agent;
  activeAgentId: string;
  streamingAgents: Map<string, string>;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
      style={{
        background: agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent',
        color: agent.id === activeAgentId ? 'var(--c-accent)' : 'var(--c-text-2)',
      }}
      onMouseEnter={(e) => {
        if (agent.id !== activeAgentId) e.currentTarget.style.background = 'var(--c-bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (agent.id !== activeAgentId)
          e.currentTarget.style.background =
            agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent';
      }}
    >
      <span className="text-lg relative">
        {agent.emoji}
        {streamingAgents.has(agent.id) && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            style={{
              background:
                streamingAgents.get(agent.id) === 'thinking'
                  ? 'var(--c-warning)'
                  : 'var(--c-success)',
              boxShadow: `0 0 6px ${streamingAgents.get(agent.id) === 'thinking' ? 'var(--c-warning)' : 'var(--c-success)'}`,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{agent.name}</div>
        {agent.description ? (
          <div className="text-[10px] truncate" style={{ color: 'var(--c-text-4)' }}>
            {agent.description}
          </div>
        ) : streamingAgents.has(agent.id) ? (
          <div
            className="text-[10px] font-mono"
            style={{
              color:
                streamingAgents.get(agent.id) === 'thinking'
                  ? 'var(--c-warning)'
                  : 'var(--c-success)',
            }}
          >
            {streamingAgents.get(agent.id)}
          </div>
        ) : (
          <div className="text-[10px] font-mono truncate" style={{ color: 'var(--c-text-4)' }}>
            {agent.model.split('/')[1]?.split('-').slice(0, 2).join('-') || agent.model}
          </div>
        )}
        {/* Domain badges */}
        {(agent.domains || []).length > 0 && !(agent.domains || []).includes('all') && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(agent.domains || []).slice(0, 3).map((d) => {
              const meta = DOMAIN_META[d] || { label: d, color: '#94a3b8' };
              return (
                <span
                  key={d}
                  className="inline-block px-1.5 py-px rounded text-[8px] font-medium"
                  style={{
                    background: meta.color + '20',
                    color: meta.color,
                    border: `1px solid ${meta.color}30`,
                  }}
                >
                  {meta.label}
                </span>
              );
            })}
            {(agent.domains || []).length > 3 && (
              <span className="text-[8px]" style={{ color: 'var(--c-text-4)' }}>
                +{(agent.domains || []).length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      {agent.id === activeAgentId && (
        <svg
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--c-accent)' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function MinimumFleetRow({
  role,
  agent,
  activeAgentId,
  streamingAgents,
  onSelect,
}: {
  role: {
    id: string;
    name: string;
    agentId: string;
    purpose: string;
    topSkills: string[];
  };
  agent: import('./store').Agent;
  activeAgentId: string;
  streamingAgents: Map<string, string>;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
      style={{
        background: agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent',
        color: agent.id === activeAgentId ? 'var(--c-accent)' : 'var(--c-text-2)',
      }}
      onMouseEnter={(e) => {
        if (agent.id !== activeAgentId) e.currentTarget.style.background = 'var(--c-bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (agent.id !== activeAgentId)
          e.currentTarget.style.background =
            agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent';
      }}
    >
      <span className="text-lg relative shrink-0">
        {agent.emoji}
        {streamingAgents.has(agent.id) && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            style={{
              background:
                streamingAgents.get(agent.id) === 'thinking'
                  ? 'var(--c-warning)'
                  : 'var(--c-success)',
              boxShadow: `0 0 6px ${streamingAgents.get(agent.id) === 'thinking' ? 'var(--c-warning)' : 'var(--c-success)'}`,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{role.name}</div>
          <div
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
            style={{
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-4)',
              border: '1px solid var(--c-border-2)',
            }}
          >
            {role.agentId}
          </div>
        </div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--c-text-4)' }}>
          {role.purpose}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {role.topSkills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="inline-block px-1.5 py-px rounded text-[8px] font-medium"
              style={{
                background: 'rgba(99,141,255,0.14)',
                color: 'var(--c-accent)',
                border: '1px solid rgba(99,141,255,0.22)',
              }}
            >
              {skill}
            </span>
          ))}
          {role.topSkills.length > 4 && (
            <span className="text-[8px]" style={{ color: 'var(--c-text-4)' }}>
              +{role.topSkills.length - 4}
            </span>
          )}
        </div>
      </div>
      {agent.id === activeAgentId && (
        <svg
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--c-accent)' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
