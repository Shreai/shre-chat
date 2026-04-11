import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useMemo } from 'react';
import { useApp, AGENTS, getAgent, DOMAIN_META } from './store';
import { fetchAllAgentMessages } from './router-client';
import { onStreamChange } from './gateway-ws';
import { ThemeCustomizer } from './ThemeCustomizer';
import { IdentityVerifyButton } from './IdentityVerifyButton';
import { PoweredByNirlab } from '@shre/ui-kit';
import { BookmarkPanel } from './components/BookmarkPanel';
import { getBookmarks } from './store';
import { usePreferences } from './preferences-store';
// Pre-defined tag color mapping
const TAG_COLORS = {
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
function getTagColor(tag) {
    return TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
}
export function Sidebar() {
    const { state, actions } = useApp();
    const { sessions, activeSessionId, activeAgentId, view, sidebarOpen, theme } = state;
    const [showAgentPicker, setShowAgentPicker] = useState(false);
    const [agentSearch, setAgentSearch] = useState('');
    const [domainFilter, setDomainFilter] = useState(null);
    const [groupByMode, setGroupByMode] = useState('role');
    const agentSearchRef = useRef(null);
    const currentAgent = getAgent(activeAgentId);
    const preloadedAgents = useRef(new Set());
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [activeTagFilter, setActiveTagFilter] = useState(null);
    const [tagEditorSessionId, setTagEditorSessionId] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const touchStartRef = useRef(0);
    const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
    const bookmarkCount = useMemo(() => getBookmarks().length, [sessions]); // re-check when sessions change
    const features = usePreferences((s) => s.features);
    // Track which agents are actively streaming (background work indicator)
    const [streamingAgents, setStreamingAgents] = useState(new Map());
    useEffect(() => {
        const update = (streams) => {
            const map = new Map();
            for (const s of streams)
                map.set(s.agentId, s.status);
            setStreamingAgents(map);
        };
        return onStreamChange(update);
    }, []);
    useEffect(() => {
        if (showAgentPicker) {
            setAgentSearch('');
            setTimeout(() => agentSearchRef.current?.focus(), 150);
        }
    }, [showAgentPicker]);
    // Lock body scroll when sidebar is open on mobile
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        const isMobile = window.innerWidth <= 768;
        if (sidebarOpen && isMobile) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
    }, [sidebarOpen]);
    // Collect all unique tags across sessions
    const allTags = useMemo(() => {
        const tagSet = new Set();
        sessions.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [sessions]);
    // Background preload: when agent picker opens, preload core agents' histories
    const preloadAgents = () => {
        const coreAgents = AGENTS.filter((a) => a.group === 'core');
        for (const agent of coreAgents) {
            if (preloadedAgents.current.has(agent.id))
                continue;
            preloadedAgents.current.add(agent.id);
            // Fire-and-forget — preloads into browser cache
            fetchAllAgentMessages(agent.id, 0).catch(() => { });
        }
    };
    // Active conversations — all sessions with messages, pinned first then by most recent
    const activeSessions = sessions
        .filter((s) => s.messages.length > 0)
        .sort((a, b) => {
        if (a.pinned && !b.pinned)
            return -1;
        if (!a.pinned && b.pinned)
            return 1;
        return b.updatedAt - a.updatedAt;
    });
    // Agent-filtered sessions for the count badge on Chat nav
    const agentSessions = sessions.filter((s) => (s.agentId || 'main') === activeAgentId);
    // Agent-scoped counts
    const agentActivity = state.activity.filter((a) => (a.agentId || 'main') === activeAgentId);
    const agentFiles = state.files.filter((f) => (f.agentId || 'main') === activeAgentId);
    // Session row renderer (used by date-grouped rendering)
    const renderSession = (s) => {
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
        return (_jsx(SwipeableRow, { enabled: state.writeEnabled, onDelete: () => actions.deleteSession(s.id), onPin: () => actions.togglePin(s.id), pinned: s.pinned, children: _jsx("div", { onClick: () => {
                    if (editingId !== s.id) {
                        actions.setActiveAgent(s.agentId || 'main');
                        actions.switchSession(s.id);
                        actions.setView('chat');
                        if (window.innerWidth < 768)
                            actions.setSidebarOpen(false);
                    }
                }, onDoubleClick: (e) => {
                    e.stopPropagation();
                    setEditingId(s.id);
                    setEditText(s.title);
                }, className: "w-full text-left px-2 py-2 rounded-lg transition-colors group cursor-pointer mb-0.5", style: {
                    background: isActive ? 'var(--c-bg-active)' : 'transparent',
                    color: 'var(--c-text-1)',
                }, children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base shrink-0", children: s.type === 'voice' ? '🎙️' : agent.emoji }), _jsx("div", { className: "flex-1 min-w-0", children: editingId === s.id ? (_jsx(InlineEdit, { value: editText, onChange: setEditText, onCommit: () => {
                                    if (editText.trim())
                                        actions.updateSessionTitle(s.id, editText.trim());
                                    setEditingId(null);
                                }, onCancel: () => setEditingId(null) })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[13px] font-medium truncate", children: agent.name }), _jsx("span", { className: "text-[10px] shrink-0 ml-1", style: { color: 'var(--c-text-5)' }, children: timeStr })] }), s.title !== 'New chat' && s.title !== agent.name && (_jsx("div", { className: "text-[11px] truncate mt-0.5", style: { color: 'var(--c-text-3)' }, children: s.title })), preview && (_jsx("div", { className: "text-[10px] truncate mt-0.5", style: { color: 'var(--c-text-4)' }, children: preview })), s.tags && s.tags.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-0.5 mt-1", children: s.tags.map((tag) => {
                                            const color = getTagColor(tag);
                                            return (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded-sm leading-tight", style: {
                                                    background: color.bg,
                                                    color: color.text,
                                                    border: `1px solid ${color.border}`,
                                                }, children: tag }, tag));
                                        }) }))] })) }), editingId !== s.id && (_jsxs("div", { className: "flex items-center shrink-0 ml-1 gap-0.5", children: [s.pinned && (_jsx("span", { className: "text-[10px] group-hover:hidden", style: { color: 'var(--c-text-4)' }, children: "\uD83D\uDCCC" })), _jsx("span", { onClick: (e) => {
                                        e.stopPropagation();
                                        actions.togglePin(s.id);
                                    }, className: "hidden group-hover:block text-[10px] cursor-pointer", style: { color: 'var(--c-text-4)', opacity: s.pinned ? 1 : 0.5 }, title: s.pinned ? 'Unpin' : 'Pin', children: "\uD83D\uDCCC" }), state.writeEnabled && (_jsx("span", { role: "button", "aria-label": "Delete session", tabIndex: 0, onKeyDown: (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            actions.deleteSession(s.id);
                                        }
                                    }, onClick: (e) => {
                                        e.stopPropagation();
                                        actions.deleteSession(s.id);
                                    }, className: "hidden group-hover:block text-red-400/60 hover:text-red-400 text-xs", children: "x" }))] }))] }) }, s.id) }, `swipe-${s.id}`));
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `sidebar-backdrop md:hidden ${sidebarOpen ? 'sidebar-backdrop-visible' : ''}`, onClick: () => actions.setSidebarOpen(false), "aria-hidden": "true" }), _jsx("div", { className: `${sidebarOpen ? 'w-64' : 'w-0'} shrink-0 transition-[width] duration-150 overflow-hidden flex flex-col h-full fixed md:relative z-[55] md:z-auto sidebar-mobile-slide ${!sidebarOpen ? 'sidebar-hidden' : ''}`, style: {
                    background: 'var(--c-bg-sidebar, var(--c-bg-2))',
                    borderRight: '1px solid var(--c-border-2)',
                }, onClick: (e) => e.stopPropagation(), onTouchStart: (e) => {
                    touchStartRef.current = e.touches[0].clientX;
                }, onTouchEnd: (e) => {
                    const dx = e.changedTouches[0].clientX - touchStartRef.current;
                    const swipeThreshold = Math.min(80, window.innerWidth * 0.2);
                    if (dx < -swipeThreshold) {
                        actions.setSidebarOpen(false);
                    }
                }, children: _jsxs("div", { className: "w-64 flex flex-col h-full", children: [_jsxs("div", { className: "p-3 flex items-center gap-1", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("button", { onClick: () => {
                                        setShowAgentPicker(!showAgentPicker);
                                        if (!showAgentPicker)
                                            preloadAgents();
                                    }, className: "flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors min-w-0", style: { color: 'var(--c-text-1)' }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--c-bg-hover)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsxs("span", { className: "text-lg relative", children: [currentAgent.emoji, streamingAgents.has(activeAgentId) && (_jsx("span", { className: "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full", style: {
                                                        background: 'var(--c-success)',
                                                        boxShadow: '0 0 6px var(--c-success)',
                                                        animation: 'pulse 1.5s ease-in-out infinite',
                                                    } }))] }), _jsxs("div", { className: "flex-1 text-left min-w-0", children: [_jsxs("div", { className: "text-sm font-semibold flex items-center gap-1.5", style: { color: 'var(--c-text-1)' }, children: [currentAgent.name, streamingAgents.size > 0 && (_jsxs("span", { className: "text-[10px] font-mono px-1.5 py-0.5 rounded-full", style: {
                                                                background: 'rgba(52,211,153,0.15)',
                                                                color: 'var(--c-success)',
                                                                border: '1px solid rgba(52,211,153,0.3)',
                                                            }, children: [streamingAgents.size, " active"] }))] }), _jsx("div", { className: "text-[11px] font-mono truncate", style: { color: 'var(--c-text-4)' }, children: currentAgent.id })] }), _jsx("svg", { className: "h-4 w-4 hidden md:block", style: { color: 'var(--c-text-4)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "9 18 15 12 9 6" }) })] }), _jsx("button", { onClick: () => actions.setSidebarOpen(false), className: "md:hidden h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-colors", style: { color: 'var(--c-text-3)' }, onMouseEnter: (e) => {
                                        e.currentTarget.style.background = 'var(--c-bg-hover)';
                                    }, onMouseLeave: (e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }, "aria-label": "Close sidebar", children: _jsxs("svg", { className: "h-4.5 w-4.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), showAgentPicker && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-[70]", style: { background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }, onClick: () => setShowAgentPicker(false) }), _jsxs("div", { className: "fixed top-0 left-0 h-full z-[71] flex flex-col", style: {
                                        width: 280,
                                        background: 'var(--c-bg-2)',
                                        borderRight: '1px solid var(--c-border-2)',
                                        boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
                                        animation: 'slide-in-left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                                    }, children: [_jsxs("div", { className: "px-4 py-3 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Select Agent" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => {
                                                                        setGroupByMode(groupByMode === 'role' ? 'domain' : 'role');
                                                                        setDomainFilter(null);
                                                                    }, className: "h-7 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium transition-colors", style: {
                                                                        color: 'var(--c-text-3)',
                                                                        background: 'var(--c-bg-3)',
                                                                        border: '1px solid var(--c-border-2)',
                                                                    }, title: groupByMode === 'role' ? 'Group by capability' : 'Group by role', children: groupByMode === 'role' ? 'By Role' : 'By Capability' }), _jsx("button", { onClick: () => setShowAgentPicker(false), className: "h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)' }, "aria-label": "Close", children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsxs("div", { className: "relative", children: [_jsxs("svg", { className: "absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5", style: { color: 'var(--c-text-4)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { ref: agentSearchRef, value: agentSearch, onChange: (e) => setAgentSearch(e.target.value), placeholder: "Search agents or capabilities...", className: "w-full h-8 pl-8 pr-3 rounded-lg text-[12px] outline-none transition-colors", style: {
                                                                background: 'var(--c-bg-3)',
                                                                color: 'var(--c-text-1)',
                                                                border: '1px solid var(--c-border-2)',
                                                            }, onFocus: (e) => {
                                                                e.currentTarget.style.borderColor = 'var(--c-accent)';
                                                            }, onBlur: (e) => {
                                                                e.currentTarget.style.borderColor = 'var(--c-border-2)';
                                                            } })] }), groupByMode === 'domain' && (_jsx("div", { className: "flex flex-wrap gap-1 mt-2", children: (() => {
                                                        const allDomains = new Set();
                                                        AGENTS.forEach((a) => (a.domains || []).forEach((d) => allDomains.add(d)));
                                                        return [...allDomains].sort().map((domain) => {
                                                            const meta = DOMAIN_META[domain] || { label: domain, color: '#94a3b8' };
                                                            const isActive = domainFilter === domain;
                                                            return (_jsx("button", { onClick: () => setDomainFilter(isActive ? null : domain), className: "px-2 py-0.5 rounded-full text-[10px] font-medium transition-all", style: {
                                                                    background: isActive ? meta.color + '30' : 'var(--c-bg-3)',
                                                                    color: isActive ? meta.color : 'var(--c-text-4)',
                                                                    border: `1px solid ${isActive ? meta.color + '60' : 'var(--c-border-2)'}`,
                                                                }, children: meta.label }, domain));
                                                        });
                                                    })() }))] }), _jsxs("div", { className: "flex-1 overflow-y-auto", children: [groupByMode === 'role'
                                                    ? /* ── Role-based grouping (original) ── */
                                                        ['core', 'department', 'council'].map((group) => {
                                                            const allGroupAgents = AGENTS.filter((a) => a.group === group);
                                                            const groupAgents = agentSearch.trim()
                                                                ? allGroupAgents.filter((a) => a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                                    a.id.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                                    a.model.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                                    (a.domains || []).some((d) => d.toLowerCase().includes(agentSearch.toLowerCase())) ||
                                                                    (a.description || '')
                                                                        .toLowerCase()
                                                                        .includes(agentSearch.toLowerCase()))
                                                                : allGroupAgents;
                                                            if (groupAgents.length === 0)
                                                                return null;
                                                            return (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider px-4 py-2", style: { color: 'var(--c-text-4)', background: 'var(--c-bg-3)' }, children: group === 'core'
                                                                            ? 'Core'
                                                                            : group === 'department'
                                                                                ? 'Department'
                                                                                : 'Council' }), groupAgents.map((agent) => (_jsx(AgentPickerRow, { agent: agent, activeAgentId: activeAgentId, streamingAgents: streamingAgents, onSelect: () => {
                                                                            actions.setActiveAgent(agent.id);
                                                                            setShowAgentPicker(false);
                                                                            if (window.innerWidth < 768)
                                                                                actions.setSidebarOpen(false);
                                                                        } }, agent.id)))] }, group));
                                                        })
                                                    : /* ── Domain-based grouping ── */
                                                        (() => {
                                                            // Collect all domains present in agents
                                                            const domainAgentsMap = new Map();
                                                            for (const agent of AGENTS) {
                                                                for (const d of agent.domains || ['general']) {
                                                                    if (!domainAgentsMap.has(d))
                                                                        domainAgentsMap.set(d, []);
                                                                    domainAgentsMap.get(d).push(agent);
                                                                }
                                                            }
                                                            // Sort domains: "all" first, then alphabetical
                                                            const sortedDomains = [...domainAgentsMap.keys()].sort((a, b) => {
                                                                if (a === 'all')
                                                                    return -1;
                                                                if (b === 'all')
                                                                    return 1;
                                                                return a.localeCompare(b);
                                                            });
                                                            // If a domain filter is active, only show that domain
                                                            const domainsToShow = domainFilter ? [domainFilter] : sortedDomains;
                                                            return domainsToShow.map((domain) => {
                                                                const domainAgents = (domainAgentsMap.get(domain) || []).filter((a) => {
                                                                    if (!agentSearch.trim())
                                                                        return true;
                                                                    const q = agentSearch.toLowerCase();
                                                                    return (a.name.toLowerCase().includes(q) ||
                                                                        a.id.toLowerCase().includes(q) ||
                                                                        (a.description || '').toLowerCase().includes(q));
                                                                });
                                                                if (domainAgents.length === 0)
                                                                    return null;
                                                                const meta = DOMAIN_META[domain] || { label: domain, color: '#94a3b8' };
                                                                return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2", style: { background: 'var(--c-bg-3)' }, children: [_jsx("span", { className: "inline-block h-2 w-2 rounded-full", style: { background: meta.color } }), _jsx("span", { className: "text-[10px] font-semibold uppercase tracking-wider", style: { color: meta.color }, children: meta.label }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: ["(", domainAgents.length, ")"] })] }), domainAgents.map((agent) => (_jsx(AgentPickerRow, { agent: agent, activeAgentId: activeAgentId, streamingAgents: streamingAgents, onSelect: () => {
                                                                                actions.setActiveAgent(agent.id);
                                                                                setShowAgentPicker(false);
                                                                                if (window.innerWidth < 768)
                                                                                    actions.setSidebarOpen(false);
                                                                            } }, `${domain}-${agent.id}`)))] }, domain));
                                                            });
                                                        })(), agentSearch.trim() &&
                                                    AGENTS.filter((a) => a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                        a.id.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                        a.model.toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                        (a.domains || []).some((d) => d.toLowerCase().includes(agentSearch.toLowerCase())) ||
                                                        (a.description || '').toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && (_jsxs("div", { className: "px-4 py-8 text-center text-[12px]", style: { color: 'var(--c-text-4)' }, children: ["No agents match \"", agentSearch, "\""] }))] })] })] })), _jsx("div", { className: "px-3 py-2", style: { borderBottom: '1px solid var(--c-border-2)' }, children: _jsxs("button", { onClick: () => {
                                    if (!state.writeEnabled)
                                        return;
                                    const id = actions.newSession();
                                    actions.switchSession(id);
                                    actions.setView('chat');
                                    if (window.innerWidth < 768)
                                        actions.setSidebarOpen(false);
                                }, disabled: !state.writeEnabled, className: "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40", style: {
                                    border: '1px solid var(--c-border-1)',
                                    color: 'var(--c-text-1)',
                                    background: 'transparent',
                                }, onMouseEnter: (e) => {
                                    if (!state.writeEnabled)
                                        return;
                                    e.currentTarget.style.background = 'var(--c-bg-hover)';
                                }, onMouseLeave: (e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }, title: !state.writeEnabled
                                    ? 'Enable Write mode in settings to create new chats'
                                    : 'New chat', children: [_jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), _jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })] }), "New chat"] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-3 py-1", children: [allTags.length > 0 && (_jsxs("div", { className: "flex flex-wrap gap-1 px-1 mb-1.5", children: [allTags.map((tag) => {
                                            const color = getTagColor(tag);
                                            const isActive = activeTagFilter === tag;
                                            return (_jsx("button", { onClick: () => setActiveTagFilter(isActive ? null : tag), className: "text-[11px] px-2 py-1 rounded-full transition-all", style: {
                                                    background: isActive ? color.bg : 'transparent',
                                                    color: isActive ? color.text : 'var(--c-text-4)',
                                                    border: `1px solid ${isActive ? color.border : 'var(--c-border-1)'}`,
                                                    fontWeight: isActive ? 600 : 400,
                                                }, children: tag }, tag));
                                        }), activeTagFilter && (_jsx("button", { onClick: () => setActiveTagFilter(null), className: "text-[11px] px-1.5 py-1 rounded-full", style: { color: 'var(--c-text-5)' }, title: "Clear filter", children: "clear" }))] })), _jsxs("div", { className: "relative px-1 mb-1.5", children: [_jsx("input", { type: "text", value: sidebarSearch, onChange: (e) => setSidebarSearch(e.target.value), placeholder: "Search sessions...", className: "w-full text-base md:text-[13px] px-2.5 py-1.5 rounded-lg outline-none placeholder:opacity-50", style: {
                                                background: 'var(--c-bg-card)',
                                                color: 'var(--c-text-2)',
                                                border: '1px solid var(--c-border-1)',
                                            } }), sidebarSearch && (_jsx("button", { onClick: () => setSidebarSearch(''), className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] leading-none focus-visible:ring-2 focus-visible:ring-blue-400", style: { color: 'var(--c-text-4)' }, "aria-label": "Clear search", children: "\u00D7" }))] }), (() => {
                                    let filtered = activeSessions;
                                    // Apply tag filter
                                    if (activeTagFilter) {
                                        filtered = filtered.filter((s) => s.tags?.includes(activeTagFilter));
                                    }
                                    // Apply search filter
                                    if (sidebarSearch) {
                                        const term = sidebarSearch.toLowerCase();
                                        filtered = filtered.filter((s) => s.title.toLowerCase().includes(term) ||
                                            s.messages.some((m) => m.content.toLowerCase().includes(term)));
                                    }
                                    // Group by date (ChatGPT-style)
                                    const groups = groupSessionsByDate(filtered);
                                    return groups.map((group) => (_jsxs("div", { children: [_jsx("div", { className: "text-[11px] font-semibold uppercase tracking-wider px-2 mb-1 mt-2.5", style: { color: 'var(--c-text-5)' }, children: group.label }), group.sessions.map((s) => renderSession(s))] }, group.label)));
                                })(), (() => {
                                    // Also render ungrouped for empty states
                                    return null;
                                })(), activeSessions.length === 0 && !sidebarSearch && !activeTagFilter && (_jsx("p", { className: "text-[11px] text-center mt-8", style: { color: 'var(--c-text-3)' }, children: "No conversations yet" })), (sidebarSearch || activeTagFilter) &&
                                    (() => {
                                        let filtered = activeSessions;
                                        if (activeTagFilter)
                                            filtered = filtered.filter((s) => s.tags?.includes(activeTagFilter));
                                        if (sidebarSearch) {
                                            const term = sidebarSearch.toLowerCase();
                                            filtered = filtered.filter((s) => s.title.toLowerCase().includes(term) ||
                                                s.messages.some((m) => m.content.toLowerCase().includes(term)));
                                        }
                                        return filtered.length === 0;
                                    })() && (_jsx("p", { className: "text-[11px] text-center mt-4", style: { color: 'var(--c-text-3)' }, children: "No matches" }))] }), _jsxs("div", { className: "px-3 py-1.5 flex items-center justify-around", style: { borderTop: '1px solid var(--c-border-2)' }, children: [_jsx(NavIconBtn, { active: view === 'chat', onClick: () => actions.setView('chat'), title: "Chat", icon: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }) }), _jsx(NavIconBtn, { active: view === 'activity', onClick: () => actions.setView('activity'), title: "Activity", icon: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }) }) }), features['bookmarks'] && (_jsxs("div", { style: { position: 'relative' }, children: [_jsx(NavIconBtn, { active: false, onClick: () => setBookmarkPanelOpen(true), title: "Bookmarks", icon: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }) }) }), bookmarkCount > 0 && (_jsx("span", { style: {
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
                                            }, children: bookmarkCount > 99 ? '99+' : bookmarkCount }))] })), _jsx(NavIconBtn, { active: view === 'employee-activity', onClick: () => actions.setView('employee-activity'), title: "Employee Activity", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }) }), _jsx(NavIconBtn, { active: view === 'briefing', onClick: () => actions.setView('briefing'), title: "Briefing", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("polyline", { points: "12 6 12 12 16 14" })] }) }), features['marketplace'] && (_jsx(NavIconBtn, { active: view === 'marketplace', onClick: () => actions.setView('marketplace'), title: "Marketplace", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" }), _jsx("line", { x1: "3", y1: "7", x2: "21", y2: "7" })] }) })), features['billing'] && (_jsx(NavIconBtn, { active: view === 'billing', onClick: () => actions.setView('billing'), title: "Billing", icon: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "1", y: "4", width: "22", height: "16", rx: "2", ry: "2" }), _jsx("line", { x1: "1", y1: "10", x2: "23", y2: "10" })] }) }))] }), _jsxs("div", { className: "px-3 py-2 flex items-center justify-between", style: { borderTop: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => {
                                                actions.toggleWriteEnabled();
                                            }, className: "p-1.5 rounded-lg transition-colors", style: { color: state.writeEnabled ? 'var(--c-accent)' : 'var(--c-text-3)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.background = 'var(--c-bg-hover)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.background = 'transparent';
                                            }, title: state.writeEnabled
                                                ? 'Write mode ON (click to go read-only)'
                                                : 'Read-only mode (click to enable write)', children: state.writeEnabled ? (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), _jsx("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })] })) : (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }), _jsx("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })] })) }), _jsx(IdentityVerifyButton, {}), _jsx(ThemeCustomizer, {}), _jsx("button", { onClick: () => actions.toggleTheme(), className: "p-1.5 rounded-lg transition-colors", style: { color: 'var(--c-text-3)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.background = 'var(--c-bg-hover)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.background = 'transparent';
                                            }, title: theme === 'dark' ? 'Light mode' : 'Dark mode', 'aria-label': theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', children: theme === 'dark' ? (_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "5" }), _jsx("line", { x1: "12", y1: "1", x2: "12", y2: "3" }), _jsx("line", { x1: "12", y1: "21", x2: "12", y2: "23" }), _jsx("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }), _jsx("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }), _jsx("line", { x1: "1", y1: "12", x2: "3", y2: "12" }), _jsx("line", { x1: "21", y1: "12", x2: "23", y2: "12" }), _jsx("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }), _jsx("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })] })) : (_jsx("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }) })) })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(PoweredByNirlab, { variant: "badge" }), actions.logout && (_jsx("button", { onClick: actions.logout, className: "p-1.5 rounded-lg transition-colors", style: { color: 'var(--c-text-3)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                                                e.currentTarget.style.color = 'var(--c-danger)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = 'var(--c-text-3)';
                                            }, title: "Sign out", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }), _jsx("polyline", { points: "16 17 21 12 16 7" }), _jsx("line", { x1: "21", y1: "12", x2: "9", y2: "12" })] }) }))] })] })] }) }), _jsx(BookmarkPanel, { open: bookmarkPanelOpen, onClose: () => setBookmarkPanelOpen(false), onNavigate: (sessionId, _messageIndex) => {
                    actions.switchSession(sessionId);
                    actions.setView('chat');
                    if (window.innerWidth < 768)
                        actions.setSidebarOpen(false);
                    // Scroll to bookmarked message after navigation
                    setTimeout(() => {
                        const msgEl = document.querySelector(`[data-msg-index="${_messageIndex}"]`);
                        if (msgEl)
                            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                } })] }));
}
/** Swipeable wrapper for session rows — swipe left to reveal Delete/Pin actions. */
function SwipeableRow({ onDelete, onPin, pinned, enabled, children, }) {
    const [tx, setTx] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const dirLocked = useRef(null);
    if (!enabled)
        return _jsx(_Fragment, { children: children });
    return (_jsxs("div", { style: { position: 'relative', overflow: 'hidden', borderRadius: 8 }, children: [_jsxs("div", { style: {
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 100,
                    display: 'flex',
                    alignItems: 'stretch',
                    opacity: Math.min(1, Math.abs(tx) / 40),
                    transition: swiping ? 'none' : 'opacity 200ms',
                }, children: [_jsx("button", { onClick: (e) => {
                            e.stopPropagation();
                            onPin();
                            setTx(0);
                        }, style: {
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
                        }, children: pinned ? 'Unpin' : 'Pin' }), _jsx("button", { onClick: (e) => {
                            e.stopPropagation();
                            onDelete();
                        }, style: {
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
                        }, children: "Delete" })] }), _jsx("div", { style: {
                    transform: `translateX(${tx}px)`,
                    transition: swiping ? 'none' : 'transform 200ms ease-out',
                    position: 'relative',
                    zIndex: 1,
                    background: 'inherit',
                }, onTouchStart: (e) => {
                    startX.current = e.touches[0].clientX;
                    startY.current = e.touches[0].clientY;
                    dirLocked.current = null;
                    setSwiping(false);
                }, onTouchMove: (e) => {
                    const dx = e.touches[0].clientX - startX.current;
                    const dy = e.touches[0].clientY - startY.current;
                    if (!dirLocked.current) {
                        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                            dirLocked.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
                        }
                        return;
                    }
                    if (dirLocked.current === 'v')
                        return; // vertical scroll — don't swipe
                    setSwiping(true);
                    setTx(Math.max(-100, Math.min(0, dx)));
                }, onTouchEnd: () => {
                    setSwiping(false);
                    dirLocked.current = null;
                    setTx(tx < -50 ? -100 : 0);
                }, children: children })] }));
}
function InlineEdit({ value, onChange, onCommit, onCancel, }) {
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);
    return (_jsx("input", { ref: ref, value: value, onChange: (e) => onChange(e.target.value), onBlur: onCommit, onKeyDown: (e) => {
            if (e.key === 'Enter')
                onCommit();
            if (e.key === 'Escape')
                onCancel();
        }, onClick: (e) => e.stopPropagation(), "aria-label": "Edit session title", className: "w-full bg-transparent outline-none text-xs rounded px-0.5", style: { color: 'var(--c-text-1)', border: '1px solid var(--c-border-1)' } }));
}
function NavIconBtn({ active, onClick, title, icon, external, }) {
    return (_jsxs("button", { onClick: onClick, "aria-label": title, title: title, className: "p-2 rounded-lg transition-colors relative", style: {
            background: active ? 'var(--c-bg-active)' : 'transparent',
            color: active ? 'var(--c-text-1)' : 'var(--c-text-3)',
        }, onMouseEnter: (e) => {
            if (!active)
                e.currentTarget.style.background = 'var(--c-bg-hover)';
        }, onMouseLeave: (e) => {
            if (!active)
                e.currentTarget.style.background = 'transparent';
        }, children: [icon, external && (_jsx("span", { className: "absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full", style: { background: 'var(--c-accent, #60a5fa)' } }))] }));
}
function groupSessionsByDate(sessions) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const last7 = today - 7 * 86400000;
    const last30 = today - 30 * 86400000;
    const groups = {
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
        if (t >= today)
            groups.Today.push(s);
        else if (t >= yesterday)
            groups.Yesterday.push(s);
        else if (t >= last7)
            groups['Last 7 days'].push(s);
        else if (t >= last30)
            groups['Last 30 days'].push(s);
        else
            groups.Older.push(s);
    }
    const order = ['Pinned', 'Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];
    return order
        .filter((label) => groups[label].length > 0)
        .map((label) => ({ label, sessions: groups[label] }));
}
// ── Agent Picker Row (extracted for reuse in both role and domain views) ──
function AgentPickerRow({ agent, activeAgentId, streamingAgents, onSelect, }) {
    return (_jsxs("button", { onClick: onSelect, className: "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors", style: {
            background: agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent',
            color: agent.id === activeAgentId ? 'var(--c-accent)' : 'var(--c-text-2)',
        }, onMouseEnter: (e) => {
            if (agent.id !== activeAgentId)
                e.currentTarget.style.background = 'var(--c-bg-hover)';
        }, onMouseLeave: (e) => {
            if (agent.id !== activeAgentId)
                e.currentTarget.style.background =
                    agent.id === activeAgentId ? 'var(--c-accent-soft)' : 'transparent';
        }, children: [_jsxs("span", { className: "text-lg relative", children: [agent.emoji, streamingAgents.has(agent.id) && (_jsx("span", { className: "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full", style: {
                            background: streamingAgents.get(agent.id) === 'thinking'
                                ? 'var(--c-warning)'
                                : 'var(--c-success)',
                            boxShadow: `0 0 6px ${streamingAgents.get(agent.id) === 'thinking' ? 'var(--c-warning)' : 'var(--c-success)'}`,
                            animation: 'pulse 1.5s ease-in-out infinite',
                        } }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm", children: agent.name }), agent.description ? (_jsx("div", { className: "text-[10px] truncate", style: { color: 'var(--c-text-4)' }, children: agent.description })) : streamingAgents.has(agent.id) ? (_jsx("div", { className: "text-[10px] font-mono", style: {
                            color: streamingAgents.get(agent.id) === 'thinking'
                                ? 'var(--c-warning)'
                                : 'var(--c-success)',
                        }, children: streamingAgents.get(agent.id) })) : (_jsx("div", { className: "text-[10px] font-mono truncate", style: { color: 'var(--c-text-4)' }, children: agent.model.split('/')[1]?.split('-').slice(0, 2).join('-') || agent.model })), (agent.domains || []).length > 0 && !(agent.domains || []).includes('all') && (_jsxs("div", { className: "flex flex-wrap gap-1 mt-0.5", children: [(agent.domains || []).slice(0, 3).map((d) => {
                                const meta = DOMAIN_META[d] || { label: d, color: '#94a3b8' };
                                return (_jsx("span", { className: "inline-block px-1.5 py-px rounded text-[8px] font-medium", style: {
                                        background: meta.color + '20',
                                        color: meta.color,
                                        border: `1px solid ${meta.color}30`,
                                    }, children: meta.label }, d));
                            }), (agent.domains || []).length > 3 && (_jsxs("span", { className: "text-[8px]", style: { color: 'var(--c-text-4)' }, children: ["+", (agent.domains || []).length - 3] }))] }))] }), agent.id === activeAgentId && (_jsx("svg", { className: "h-4 w-4 shrink-0", style: { color: 'var(--c-accent)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }))] }));
}
