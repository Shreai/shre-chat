import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useApp, getAgent } from './store';
const SEVERITY_COLORS = {
    info: 'text-blue-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
};
const SEVERITY_BG = {
    info: 'rgba(96,165,250,0.1)',
    warning: 'rgba(251,191,36,0.1)',
    critical: 'rgba(248,113,113,0.1)',
};
const CATEGORY_ICONS = {
    alert: '!',
    insight: 'i',
    action: 'A',
    status: 'S',
    skill_result: 'R',
    delegation: 'D',
    escalation: 'E',
};
export function AgentFeedView() {
    const { state, actions } = useApp();
    const [posts, setPosts] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterAgent, setFilterAgent] = useState(null);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterStore, setFilterStore] = useState(null);
    const [offset, setOffset] = useState(0);
    const [allAgents, setAllAgents] = useState([]);
    const LIMIT = 50;
    const fetchPosts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('limit', String(LIMIT));
            params.set('offset', String(offset));
            if (filterAgent)
                params.set('agent', filterAgent);
            if (filterCategory)
                params.set('category', filterCategory);
            if (filterStore)
                params.set('store', filterStore);
            const res = await fetch(`/api/agent-feed?${params}`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setPosts(data.posts || []);
            setTotal(data.total || 0);
        }
        catch (err) {
            setError(err.message || 'Failed to load feed');
            setPosts([]);
        }
        finally {
            setLoading(false);
        }
    }, [filterAgent, filterCategory, filterStore, offset]);
    // Fetch distinct agents from dedicated endpoint (not from current page)
    useEffect(() => {
        fetch('/api/agent-feed/agents')
            .then((r) => (r.ok ? r.json() : { agents: [] }))
            .then((d) => {
            setAllAgents(d.agents || []);
        })
            .catch(() => { });
    }, []);
    useEffect(() => {
        fetchPosts();
        const iv = setInterval(fetchPosts, 15_000);
        return () => clearInterval(iv);
    }, [fetchPosts]);
    // Extract stores from posts (no dedicated endpoint for stores yet)
    const stores = [...new Set(posts.filter((p) => p.store_id).map((p) => p.store_id))];
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0", children: [_jsxs("header", { className: "flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm", style: { background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => actions.setSidebarOpen(!state.sidebarOpen), style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "21", y2: "18" })] }) }), _jsx("h1", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Agent Feed" }), _jsxs("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-card)', color: 'var(--c-text-4)' }, children: [total, " events"] })] }), _jsx("button", { onClick: fetchPosts, className: "text-[10px] px-2 py-1 rounded transition-colors hover:opacity-80", style: { color: 'var(--c-accent)' }, children: "Refresh" })] }), _jsxs("div", { className: "flex items-center gap-2 px-4 py-2 flex-wrap", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("select", { value: filterAgent || '', onChange: (e) => {
                            setFilterAgent(e.target.value || null);
                            setOffset(0);
                        }, className: "text-[11px] px-2 py-1 rounded", style: {
                            background: 'var(--c-bg-card)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsx("option", { value: "", children: "All Agents" }), allAgents.map((a) => {
                                const ag = getAgent(a.agent_id);
                                return (_jsxs("option", { value: a.agent_id, children: [ag.emoji, " ", ag.name, " (", a.count, ")"] }, a.agent_id));
                            })] }), _jsxs("select", { value: filterCategory || '', onChange: (e) => {
                            setFilterCategory(e.target.value || null);
                            setOffset(0);
                        }, className: "text-[11px] px-2 py-1 rounded", style: {
                            background: 'var(--c-bg-card)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsx("option", { value: "", children: "All Categories" }), ['alert', 'insight', 'action', 'status', 'skill_result', 'delegation', 'escalation'].map((c) => (_jsx("option", { value: c, children: c.replace('_', ' ') }, c)))] }), stores.length > 0 && (_jsxs("select", { value: filterStore || '', onChange: (e) => {
                            setFilterStore(e.target.value || null);
                            setOffset(0);
                        }, className: "text-[11px] px-2 py-1 rounded", style: {
                            background: 'var(--c-bg-card)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsx("option", { value: "", children: "All Stores" }), stores.map((s) => (_jsx("option", { value: s, children: s }, s)))] })), (filterAgent || filterCategory || filterStore) && (_jsx("button", { onClick: () => {
                            setFilterAgent(null);
                            setFilterCategory(null);
                            setFilterStore(null);
                            setOffset(0);
                        }, className: "text-[10px] px-2 py-0.5 rounded", style: { color: 'var(--c-text-5)' }, children: "Clear filters" }))] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-3", children: [loading && posts.length === 0 && (_jsx("div", { className: "flex items-center justify-center h-32", children: _jsx("span", { className: "text-xs", style: { color: 'var(--c-text-5)' }, children: "Loading feed..." }) })), error && (_jsxs("div", { className: "text-center py-8", children: [_jsxs("p", { className: "text-xs text-red-400", children: ["Feed unavailable: ", error] }), _jsx("p", { className: "text-[10px] mt-1", style: { color: 'var(--c-text-5)' }, children: "shre-feed service may be offline" })] })), !loading && !error && posts.length === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-center gap-3 pb-20", children: [_jsxs("svg", { className: "h-10 w-10", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M4 11a9 9 0 0 1 9 9" }), _jsx("path", { d: "M4 4a16 16 0 0 1 16 16" }), _jsx("circle", { cx: "5", cy: "19", r: "1" })] }), filterAgent || filterCategory || filterStore ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: "No results match your filters" }), _jsx("button", { onClick: () => {
                                            setFilterAgent(null);
                                            setFilterCategory(null);
                                            setFilterStore(null);
                                            setOffset(0);
                                        }, className: "text-[11px] px-3 py-1 rounded", style: { color: 'var(--c-accent)' }, children: "Clear filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: "No agent activity yet" }), _jsx("p", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: "Events from agent tools, delegations, and skills will appear here" })] }))] })), _jsx("div", { className: "space-y-2 max-w-4xl mx-auto", children: posts.map((post) => {
                            const agent = getAgent(post.agent_id);
                            const emoji = post.agent_emoji || agent.emoji;
                            const name = post.agent_name || agent.name;
                            const sevColor = SEVERITY_COLORS[post.severity] || 'text-gray-400';
                            const sevBg = SEVERITY_BG[post.severity] || 'rgba(128,128,128,0.1)';
                            const catIcon = CATEGORY_ICONS[post.category] || '?';
                            const appNode = post.app_node || post.node_app;
                            return (_jsxs("div", { className: "rounded-lg p-3 transition-all hover:brightness-110", style: { background: sevBg, border: `1px solid var(--c-border-2)` }, children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-sm shrink-0", children: emoji }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5 flex-wrap", children: [_jsx("span", { className: "text-[11px] font-semibold", style: { color: 'var(--c-text-1)' }, children: name }), _jsx("span", { className: `text-[9px] font-bold uppercase tracking-wider ${sevColor}`, children: post.category.replace('_', ' ') }), post.pinned && (_jsx("span", { className: "text-[9px]", title: "Pinned", children: "pin" }))] }), _jsx("p", { className: "text-[12px] mt-0.5 font-medium", style: { color: 'var(--c-text-2)' }, children: post.title }), post.body && (_jsxs("p", { className: "text-[11px] mt-1", style: { color: 'var(--c-text-3)' }, children: [post.body.slice(0, 300), post.body.length > 300 ? '...' : ''] }))] }), _jsx("span", { className: "text-[9px] shrink-0", style: { color: 'var(--c-text-5)' }, children: formatTime(post.time) })] }), _jsxs("div", { className: "flex flex-wrap gap-1 mt-2 ml-6", children: [post.workspace_id && _jsx(Pill, { label: "workspace", value: post.workspace_id }), post.store_id && _jsx(Pill, { label: "store", value: post.store_name || post.store_id }), appNode && _jsx(Pill, { label: "app/node", value: appNode }), post.tool_name && _jsx(Pill, { label: "tool", value: post.tool_name }), post.skill_id && _jsx(Pill, { label: "skill", value: post.skill_id }), post.tenant_id && _jsx(Pill, { label: "tenant", value: post.tenant_id }), post.tags?.length > 0 &&
                                                post.tags.map((t) => (_jsxs("span", { className: "text-[9px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-1)', color: 'var(--c-text-5)' }, children: ["#", t] }, t)))] })] }, post.id));
                        }) }), total > LIMIT && (_jsxs("div", { className: "flex items-center justify-center gap-3 mt-4 pb-4", children: [_jsx("button", { disabled: offset === 0, onClick: () => setOffset(Math.max(0, offset - LIMIT)), className: "text-[11px] px-3 py-1 rounded disabled:opacity-30", style: { background: 'var(--c-bg-card)', color: 'var(--c-text-3)' }, children: "Prev" }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [offset + 1, "\u2013", Math.min(offset + LIMIT, total), " of ", total] }), _jsx("button", { disabled: offset + LIMIT >= total, onClick: () => setOffset(offset + LIMIT), className: "text-[11px] px-3 py-1 rounded disabled:opacity-30", style: { background: 'var(--c-bg-card)', color: 'var(--c-text-3)' }, children: "Next" })] }))] })] }));
}
function Pill({ label, value }) {
    return (_jsxs("span", { className: "text-[9px] px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1", style: { background: 'rgba(56,189,248,0.08)', color: 'rgb(148,163,184)' }, children: [_jsxs("span", { style: { color: 'rgb(100,116,139)' }, children: [label, ":"] }), " ", value] }));
}
function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000)
        return 'just now';
    if (diffMs < 3600_000)
        return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86400_000)
        return `${Math.floor(diffMs / 3600_000)}h ago`;
    return (d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}
