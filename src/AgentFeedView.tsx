import { useEffect, useState, useCallback } from 'react';
import { useApp, getAgent } from './store';

interface FeedPost {
  id: string;
  time: string;
  agent_id: string;
  agent_emoji: string | null;
  agent_name: string | null;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  skill_id: string | null;
  store_id: string | null;
  store_name: string | null;
  tenant_id: string | null;
  workspace_id: string | null;
  node_app: string | null;
  app_node: string | null;
  tool_name: string | null;
  read: boolean;
  pinned: boolean;
  tags: string[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
};

const SEVERITY_BG: Record<string, string> = {
  info: 'rgba(96,165,250,0.1)',
  warning: 'rgba(251,191,36,0.1)',
  critical: 'rgba(248,113,113,0.1)',
};

const CATEGORY_ICONS: Record<string, string> = {
  alert: '!',
  insight: 'i',
  action: 'A',
  status: 'S',
  skill_result: 'R',
  delegation: 'D',
  escalation: 'E',
};

type FilterAgent = string | null;
type FilterCategory = string | null;

export function AgentFeedView() {
  const { state, actions } = useApp();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<FilterAgent>(null);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>(null);
  const [filterStore, setFilterStore] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [allAgents, setAllAgents] = useState<{ agent_id: string; count: number }[]>([]);
  const LIMIT = 50;

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('offset', String(offset));
      if (filterAgent) params.set('agent', filterAgent);
      if (filterCategory) params.set('category', filterCategory);
      if (filterStore) params.set('store', filterStore);

      const res = await fetch(`/api/agent-feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
      setPosts([]);
    } finally {
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPosts();
    const iv = setInterval(fetchPosts, 15_000);
    return () => clearInterval(iv);
  }, [fetchPosts]);

  // Extract stores from posts (no dedicated endpoint for stores yet)
  const stores = [...new Set(posts.filter((p) => p.store_id).map((p) => p.store_id!))];

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm"
        style={{ background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
            style={{ color: 'var(--c-text-4)' }}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Agent Feed
          </h1>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--c-bg-card)', color: 'var(--c-text-4)' }}
          >
            {total} events
          </span>
        </div>
        <button
          onClick={fetchPosts}
          className="text-[10px] px-2 py-1 rounded transition-colors hover:opacity-80"
          style={{ color: 'var(--c-accent)' }}
        >
          Refresh
        </button>
      </header>

      {/* Filters */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-wrap"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        <select
          value={filterAgent || ''}
          onChange={(e) => {
            setFilterAgent(e.target.value || null);
            setOffset(0);
          }}
          className="text-[11px] px-2 py-1 rounded"
          style={{
            background: 'var(--c-bg-card)',
            color: 'var(--c-text-3)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          <option value="">All Agents</option>
          {allAgents.map((a) => {
            const ag = getAgent(a.agent_id);
            return (
              <option key={a.agent_id} value={a.agent_id}>
                {ag.emoji} {ag.name} ({a.count})
              </option>
            );
          })}
        </select>

        <select
          value={filterCategory || ''}
          onChange={(e) => {
            setFilterCategory(e.target.value || null);
            setOffset(0);
          }}
          className="text-[11px] px-2 py-1 rounded"
          style={{
            background: 'var(--c-bg-card)',
            color: 'var(--c-text-3)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          <option value="">All Categories</option>
          {['alert', 'insight', 'action', 'status', 'skill_result', 'delegation', 'escalation'].map(
            (c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ),
          )}
        </select>

        {stores.length > 0 && (
          <select
            value={filterStore || ''}
            onChange={(e) => {
              setFilterStore(e.target.value || null);
              setOffset(0);
            }}
            className="text-[11px] px-2 py-1 rounded"
            style={{
              background: 'var(--c-bg-card)',
              color: 'var(--c-text-3)',
              border: '1px solid var(--c-border-2)',
            }}
          >
            <option value="">All Stores</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {(filterAgent || filterCategory || filterStore) && (
          <button
            onClick={() => {
              setFilterAgent(null);
              setFilterCategory(null);
              setFilterStore(null);
              setOffset(0);
            }}
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ color: 'var(--c-text-5)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && posts.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <span className="text-xs" style={{ color: 'var(--c-text-5)' }}>
              Loading feed...
            </span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-xs text-red-400">Feed unavailable: {error}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-5)' }}>
              shre-feed service may be offline
            </p>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-20">
            <svg
              className="h-10 w-10"
              style={{ color: 'var(--c-text-5)' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
            {filterAgent || filterCategory || filterStore ? (
              <>
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  No results match your filters
                </p>
                <button
                  onClick={() => {
                    setFilterAgent(null);
                    setFilterCategory(null);
                    setFilterStore(null);
                    setOffset(0);
                  }}
                  className="text-[11px] px-3 py-1 rounded"
                  style={{ color: 'var(--c-accent)' }}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  No agent activity yet
                </p>
                <p className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                  Events from agent tools, delegations, and skills will appear here
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-2 max-w-4xl mx-auto">
          {posts.map((post) => {
            const agent = getAgent(post.agent_id);
            const emoji = post.agent_emoji || agent.emoji;
            const name = post.agent_name || agent.name;
            const sevColor = SEVERITY_COLORS[post.severity] || 'text-gray-400';
            const sevBg = SEVERITY_BG[post.severity] || 'rgba(128,128,128,0.1)';
            const catIcon = CATEGORY_ICONS[post.category] || '?';
            const appNode = post.app_node || post.node_app;

            return (
              <div
                key={post.id}
                className="rounded-lg p-3 transition-all hover:brightness-110"
                style={{ background: sevBg, border: `1px solid var(--c-border-2)` }}
              >
                {/* Row 1: Agent + Title + Severity */}
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: 'var(--c-text-1)' }}
                      >
                        {name}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${sevColor}`}>
                        {post.category.replace('_', ' ')}
                      </span>
                      {post.pinned && (
                        <span className="text-[9px]" title="Pinned">
                          pin
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[12px] mt-0.5 font-medium"
                      style={{ color: 'var(--c-text-2)' }}
                    >
                      {post.title}
                    </p>
                    {post.body && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                        {post.body.slice(0, 300)}
                        {post.body.length > 300 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] shrink-0" style={{ color: 'var(--c-text-5)' }}>
                    {formatTime(post.time)}
                  </span>
                </div>

                {/* Row 2: Metadata pills */}
                <div className="flex flex-wrap gap-1 mt-2 ml-6">
                  {post.workspace_id && <Pill label="workspace" value={post.workspace_id} />}
                  {post.store_id && <Pill label="store" value={post.store_name || post.store_id} />}
                  {appNode && <Pill label="app/node" value={appNode} />}
                  {post.tool_name && <Pill label="tool" value={post.tool_name} />}
                  {post.skill_id && <Pill label="skill" value={post.skill_id} />}
                  {post.tenant_id && <Pill label="tenant" value={post.tenant_id} />}
                  {post.tags?.length > 0 &&
                    post.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--c-bg-1)', color: 'var(--c-text-5)' }}
                      >
                        #{t}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-center gap-3 mt-4 pb-4">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="text-[11px] px-3 py-1 rounded disabled:opacity-30"
              style={{ background: 'var(--c-bg-card)', color: 'var(--c-text-3)' }}
            >
              Prev
            </button>
            <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
              {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
            </span>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              className="text-[11px] px-3 py-1 rounded disabled:opacity-30"
              style={{ background: 'var(--c-bg-card)', color: 'var(--c-text-3)' }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1"
      style={{ background: 'rgba(56,189,248,0.08)', color: 'rgb(148,163,184)' }}
    >
      <span style={{ color: 'rgb(100,116,139)' }}>{label}:</span> {value}
    </span>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}
