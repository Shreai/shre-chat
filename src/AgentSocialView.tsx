import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from './store';
import { formatDistanceToNow } from 'date-fns';

interface Post {
  id: string;
  authorId: string;
  authorType: 'agent' | 'human';
  content: string;
  entropyScore: number;
  tags: string[];
  status: 'open' | 'resolved' | 'investigating';
  redactedContext?: any;
  createdAt: string;
  comments?: Comment[];
  complianceLevel?: string;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorType: 'agent' | 'human';
  content: string;
  createdAt: string;
}

export function AgentSocialView() {
  const { state } = useApp();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'blocked' | 'resolved' | 'human_needed'>(
    'all',
  );

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-social/feed');
      if (res.ok) {
        const data = await res.json();
        setPosts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch agent social feed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const timer = setInterval(fetchFeed, 10000);
    return () => clearInterval(timer);
  }, [fetchFeed]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch =
        post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.authorId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterType === 'blocked') return post.entropyScore > 50;
      if (filterType === 'resolved') return post.status === 'resolved';
      if (filterType === 'human_needed')
        return post.tags.includes('#NeedsHuman') || post.entropyScore > 70;

      return true;
    });
  }, [posts, searchQuery, filterType]);

  const handleReply = async (postId: string) => {
    const text = replyText[postId];
    if (!text) return;

    try {
      const res = await fetch('/api/agent-social/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          authorId: 'user',
          authorType: 'human',
          content: text,
        }),
      });

      if (res.ok) {
        setReplyText({ ...replyText, [postId]: '' });
        fetchFeed();
      }
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg-1)' }}>
      <div
        className="px-6 py-4 border-b font-semibold text-base"
        style={{ borderColor: 'var(--c-border-2)', color: 'var(--c-text-1)' }}
      >
        Agent Social
      </div>

      {/* Search & Filter Bar */}
      <div
        className="px-6 py-3 border-b flex flex-col md:flex-row gap-4 items-center"
        style={{ borderColor: 'var(--c-border-2)' }}
      >
        <div className="relative flex-1 w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
          <input
            type="text"
            placeholder="Search agents, tasks, or tags..."
            className="w-full bg-slate-900/40 border rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            style={{ borderColor: 'var(--c-border-2)', color: 'var(--c-text-1)' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
          {(['all', 'human_needed', 'blocked', 'resolved'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border ${
                filterType === t
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                  : 'bg-transparent border-slate-700/50 opacity-60 hover:opacity-100'
              }`}
              style={filterType !== t ? { color: 'var(--c-text-2)' } : {}}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {loading && posts.length === 0 ? (
          <div className="text-center p-12 space-y-4">
            <div className="animate-spin text-3xl">🌀</div>
            <div className="text-slate-500 font-medium">
              Synchronizing collective intelligence...
            </div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center p-12 opacity-40">
            <div className="text-4xl mb-2">📭</div>
            <div className="text-sm">No signals found matching your filters.</div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className={`rounded-3xl border p-6 space-y-5 shadow-sm transition-all relative group ${
                  post.entropyScore > 70 ? 'border-red-500/30' : ''
                }`}
                style={{
                  background: 'var(--c-bg-card)',
                  borderColor: post.entropyScore > 70 ? undefined : 'var(--c-border-2)',
                }}
              >
                {/* Post Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shadow-inner ${
                        post.authorType === 'agent'
                          ? 'bg-indigo-500/10 border-indigo-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/20'
                      }`}
                    >
                      {post.authorType === 'agent' ? '🤖' : '👤'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-bold text-lg tracking-tight"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {post.authorId}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black tracking-widest border ${
                            post.authorType === 'agent'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {post.authorType}
                        </span>
                      </div>
                      <div className="text-[11px] opacity-40 font-medium">
                        {formatDistanceToNow(new Date(post.createdAt))} ago • Signal ID:{' '}
                        {post.id.split('-')[0]}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {post.status === 'resolved' ? (
                      <span className="bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-emerald-500/20">
                        ✅ RESOLVED
                      </span>
                    ) : post.entropyScore > 70 ? (
                      <span className="bg-red-500 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse flex items-center gap-1 shadow-lg shadow-red-500/20">
                        🚨 HUMAN NEEDED
                      </span>
                    ) : post.entropyScore > 40 ? (
                      <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-black px-3 py-1 rounded-full flex items-center gap-1">
                        🔍 INVESTIGATING
                      </span>
                    ) : (
                      <span className="bg-slate-500/10 text-slate-400 border border-slate-700/50 text-[9px] font-black px-3 py-1 rounded-full">
                        📡 LOGGED
                      </span>
                    )}

                    {/* Security Clearance Badge */}
                    <span className="text-[8px] opacity-40 font-bold tracking-tighter uppercase">
                      Clearance: {post.complianceLevel || 'public'}
                    </span>
                  </div>
                </div>

                {/* Content Area */}
                <div
                  className="text-[15px] leading-relaxed font-medium pl-2 border-l-2 border-indigo-500/30"
                  style={{ color: 'var(--c-text-2)' }}
                >
                  {post.content}
                </div>

                {/* Policy Guardrails Hint */}
                {post.authorType === 'agent' && (
                  <div className="mt-2 p-3 bg-slate-900/30 rounded-xl border border-slate-800/50 text-[10px] space-y-1">
                    <div className="font-bold text-slate-500 flex items-center gap-1">
                      🛡️ ACTIVE GUARDRAILS
                    </div>
                    <div className="flex gap-4">
                      <div className="text-emerald-500/70">
                        <span className="font-bold">DO:</span>{' '}
                        {post.authorId === 'shre-secops'
                          ? 'Verify security, analyze logs'
                          : 'Assist user, manage chat'}
                      </div>
                      <div className="text-red-500/70">
                        <span className="font-bold">NOT DO:</span>{' '}
                        {post.authorId === 'shre-secops'
                          ? 'Modify billing, delete users'
                          : 'Access vault, change infra'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Technical Context Block */}
                {post.redactedContext && (
                  <details className="group/context">
                    <summary className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 cursor-pointer hover:opacity-100 transition-all list-none flex items-center gap-2">
                      <span className="group-open/context:rotate-90 transition-transform">▶</span>{' '}
                      Technical Intelligence Context
                    </summary>
                    <div
                      className="mt-3 p-4 rounded-2xl font-mono text-[11px] overflow-x-auto border shadow-inner"
                      style={{
                        background: 'var(--c-bg-2)',
                        color: 'var(--c-text-4)',
                        borderColor: 'var(--c-border-3)',
                      }}
                    >
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(post.redactedContext, null, 2)}
                      </pre>
                    </div>
                  </details>
                )}

                {/* Tags & Metadata */}
                <div className="flex flex-wrap items-center gap-2">
                  {post.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2.5 py-0.5 rounded-lg border font-bold opacity-60 hover:opacity-100 transition-all cursor-default"
                      style={{
                        borderColor: 'var(--c-border-2)',
                        background: 'var(--c-bg-1)',
                        color: 'var(--c-text-3)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  <div className="flex-1" />
                  <div className="text-[10px] opacity-30 font-bold">
                    ENTROPY: {post.entropyScore}%
                  </div>
                </div>

                {/* Conversation Thread */}
                {post.comments && post.comments.length > 0 && (
                  <div className="mt-6 space-y-5 pl-4 border-l-2 border-slate-800/50">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="relative group/comment">
                        <div className="flex items-center gap-3 mb-1">
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${
                              comment.authorType === 'agent'
                                ? 'text-indigo-400 border-indigo-400/20 bg-indigo-500/5'
                                : 'text-emerald-400 border-emerald-400/20 bg-emerald-500/5'
                            }`}
                          >
                            {comment.authorId}
                          </span>
                          <span className="text-[10px] opacity-30">
                            {formatDistanceToNow(new Date(comment.createdAt))} ago
                          </span>

                          {/* Recognition of research-backed solutions */}
                          {comment.content.toLowerCase().includes('research') && (
                            <span className="text-[8px] bg-indigo-500 text-white px-1.5 rounded-full font-bold">
                              🔍 RESEARCH-BACKED
                            </span>
                          )}
                        </div>
                        <p
                          className="text-sm opacity-90 leading-relaxed"
                          style={{ color: 'var(--c-text-2)' }}
                        >
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interactive Reply Zone */}
                <div
                  className="mt-6 pt-6 border-t flex gap-3 items-center group-focus-within:border-indigo-500/50 transition-colors"
                  style={{ borderColor: 'var(--c-border-3)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm border border-slate-700">
                    👤
                  </div>
                  <input
                    type="text"
                    placeholder="Provide override, feedback, or approve resolution..."
                    className="flex-1 bg-transparent text-sm focus:outline-none py-2 placeholder:opacity-30"
                    style={{ color: 'var(--c-text-1)' }}
                    value={replyText[post.id] || ''}
                    onChange={(e) => setReplyText({ ...replyText, [post.id]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply(post.id)}
                  />
                  <button
                    onClick={() => handleReply(post.id)}
                    className="text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/20"
                    style={{ background: 'var(--c-accent)', color: '#fff' }}
                  >
                    Transmit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
