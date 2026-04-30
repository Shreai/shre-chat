/**
 * MemoryPanel — slide-out panel showing working memory facts, muscle memory patterns,
 * and cross-session context. Accessible via brain icon in StatusBar.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface MemoryFact {
  id: string;
  text: string;
  category: string;
  agentId: string;
  confidence: number;
  createdAt: string;
  lastRecalledAt?: string;
  recallCount?: number;
}

interface MemoryDashboard {
  totalFacts: number;
  activeFacts: number;
  byCategory: Record<string, number>;
  byAgent: Record<string, number>;
  recallHitRate: number;
  consolidation?: { lastRunAt: string; merged: number; promoted: number; demoted: number } | null;
}

interface MuscleMemoryStats {
  totalPatterns: number;
  learnedPatterns: number;
  totalSavedUsd: number;
  topAgents: Array<{ agentId: string; learnedCount: number; savedUsd: number }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tenantId?: string | null;
  agentId?: string | null;
}

interface SharedFact {
  fact: string;
  category: string;
  confidence: number;
  sourceAgent: string;
  sharedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  preference: '#6366f1',
  identity: '#8b5cf6',
  business: '#10b981',
  technical: '#3b82f6',
  workflow: '#f59e0b',
  relationship: '#ec4899',
  default: '#6b7280',
};

export function MemoryPanel({ open, onClose, tenantId, agentId }: Props) {
  const [tab, setTab] = useState<'facts' | 'patterns' | 'shared' | 'dashboard'>('facts');
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [dashboard, setDashboard] = useState<MemoryDashboard | null>(null);
  const [muscleMemory, setMuscleMemory] = useState<MuscleMemoryStats | null>(null);
  const [sharedFacts, setSharedFacts] = useState<SharedFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharedSyncState, setSharedSyncState] = useState<'idle' | 'refreshing' | 'live'>('idle');
  const [lastSharedRefreshAt, setLastSharedRefreshAt] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [factsRes, dashRes, mmRes] = await Promise.allSettled([
        fetch('/api/router/v1/memory/facts?pageSize=50'),
        fetch('/api/router/v1/memory/dashboard'),
        fetch('/api/router/v1/memory/stats'),
      ]);

      if (factsRes.status === 'fulfilled' && factsRes.value.ok) {
        const data = await factsRes.value.json();
        setFacts(data.facts ?? []);
      }
      if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
        setDashboard(await dashRes.value.json());
      }
      if (mmRes.status === 'fulfilled' && mmRes.value.ok) {
        setMuscleMemory(await mmRes.value.json());
      }
    } catch (err) {
      console.error('[MemoryPanel] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSharedFacts = useCallback(async () => {
    if (!tenantId) return;
    try {
      setSharedSyncState('refreshing');
      const res = await fetch(`/api/router/v1/memory/shared/${encodeURIComponent(tenantId)}`);
      const data = res.ok ? await res.json() : null;
      if (Array.isArray(data?.facts) && data.facts.length > 0) {
        setSharedFacts(data.facts);
      } else {
        const token =
          sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
        const fallback = await fetch(
          `/api/workspaces/${encodeURIComponent(tenantId)}/memory/shared?limit=20`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (fallback.ok) {
          const shared = await fallback.json();
          if (Array.isArray(shared.facts) && shared.facts.length > 0) {
            setSharedFacts(
              shared.facts
                .map((entry: SharedFact) => ({
                  fact: entry.fact || '',
                  category: entry.category || 'decision',
                  confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.5,
                  sourceAgent: entry.sourceAgent || 'unknown',
                  sharedAt: entry.sharedAt || new Date().toISOString(),
                }))
                .filter((entry: SharedFact) => entry.fact),
            );
          }
        }
      }
      setLastSharedRefreshAt(Date.now());
      setSharedSyncState('live');
    } catch (err) {
      console.error('[MemoryPanel] Shared memory fetch failed:', err);
      setSharedSyncState('idle');
    }
  }, [tenantId, agentId]);

  useEffect(() => {
    if (!open || !tenantId) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token =
      sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
    const wsUrl = token
      ? `${proto}//${location.host}/api/workspaces/${encodeURIComponent(tenantId)}/events/ws?token=${encodeURIComponent(token)}`
      : `${proto}//${location.host}/api/workspaces/${encodeURIComponent(tenantId)}/events/ws`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          workspaceId?: string;
          payload?: {
            fact?: string;
            category?: string;
            confidence?: number;
            sourceAgent?: string;
            sharedAt?: string;
          };
        };
        if (data?.type !== 'memory.shared.updated') return;
        if (data.workspaceId && data.workspaceId !== tenantId) return;
        setSharedSyncState('refreshing');
        if (data.payload?.fact) {
          setSharedFacts((prev) => {
            const next: SharedFact = {
              fact: data.payload?.fact ?? '',
              category: data.payload?.category ?? 'context',
              confidence: data.payload?.confidence ?? 0.5,
              sourceAgent: data.payload?.sourceAgent ?? 'unknown',
              sharedAt: data.payload?.sharedAt ?? new Date().toISOString(),
            };
            if (prev.some((item) => item.fact === next.fact && item.sharedAt === next.sharedAt)) {
              return prev;
            }
            return [next, ...prev].slice(0, 50);
          });
        }
        void fetchSharedFacts();
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      ws.close();
    };
  }, [open, tenantId, fetchSharedFacts]);

  useEffect(() => {
    if (open) {
      fetchData();
      fetchSharedFacts();
    }
  }, [open, fetchData, fetchSharedFacts]);

  const handleForget = async (factId: string) => {
    try {
      await fetch('/api/memory/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factId }),
      });
      setFacts((prev) => prev.filter((f) => f.id !== factId));
    } catch (err) {
      console.error('[MemoryPanel] Forget failed:', err);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 299,
          background: 'rgba(0,0,0,0.3)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 300,
          width: 420,
          maxWidth: '90vw',
          background: 'var(--c-bg-2, #111827)',
          borderLeft: '1px solid var(--c-border, #1f2937)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--c-border, #1f2937)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a9 9 0 0 0-9 9c0 3.9 2.5 7.1 6 8.3V21h6v-1.7c3.5-1.2 6-4.4 6-8.3a9 9 0 0 0-9-9z" />
              <path d="M9 21h6" />
              <path d="M10 17v-2" />
              <path d="M14 17v-2" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--c-text-1, #f9fafb)' }}>
              Memory
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tenantId && (
              <div
                data-testid="shared-memory-sync-badge"
                aria-label={`Shared sync ${sharedSyncState}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  background:
                    sharedSyncState === 'live'
                      ? 'rgba(16, 185, 129, 0.14)'
                      : sharedSyncState === 'refreshing'
                        ? 'rgba(245, 158, 11, 0.14)'
                        : 'rgba(107, 114, 128, 0.14)',
                  color:
                    sharedSyncState === 'live'
                      ? '#34d399'
                      : sharedSyncState === 'refreshing'
                        ? '#f59e0b'
                        : '#9ca3af',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background:
                      sharedSyncState === 'live'
                        ? '#34d399'
                        : sharedSyncState === 'refreshing'
                          ? '#f59e0b'
                          : '#9ca3af',
                    boxShadow:
                      sharedSyncState === 'refreshing'
                        ? '0 0 8px rgba(245, 158, 11, 0.55)'
                        : 'none',
                  }}
                />
                {sharedSyncState === 'live'
                  ? lastSharedRefreshAt
                    ? `Live ${new Date(lastSharedRefreshAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : 'Live sync'
                  : sharedSyncState === 'refreshing'
                    ? 'Refreshing'
                    : 'Idle'}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--c-text-3)',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border, #1f2937)' }}>
          {(['facts', 'patterns', 'shared', 'dashboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #8b5cf6' : '2px solid transparent',
                color: tab === t ? '#8b5cf6' : 'var(--c-text-3, #9ca3af)',
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading && (
            <div style={{ color: 'var(--c-text-3)', textAlign: 'center', padding: 20 }}>
              Loading...
            </div>
          )}

          {!loading && tab === 'facts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {facts.length === 0 && (
                <div style={{ color: 'var(--c-text-3)', textAlign: 'center', padding: 20 }}>
                  No memories yet. Shre learns facts from your conversations automatically.
                </div>
              )}
              {facts.map((fact) => (
                <div
                  key={fact.id}
                  style={{ background: 'var(--c-bg-3, #1f2937)', borderRadius: 10, padding: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background:
                          (CATEGORY_COLORS[fact.category] ?? CATEGORY_COLORS.default) + '33',
                        color: CATEGORY_COLORS[fact.category] ?? CATEGORY_COLORS.default,
                        textTransform: 'uppercase',
                      }}
                    >
                      {fact.category}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{fact.agentId}</span>
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)', marginLeft: 'auto' }}>
                      {fact.recallCount ?? 0} recalls
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c-text-1, #f9fafb)', lineHeight: 1.5 }}>
                    {fact.text}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                      {new Date(fact.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleForget(fact.id)}
                      style={{
                        fontSize: 11,
                        color: '#ef4444',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Forget
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'patterns' && muscleMemory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard label="Total Patterns" value={muscleMemory.totalPatterns} />
                <StatCard label="Learned" value={muscleMemory.learnedPatterns} color="#22c55e" />
              </div>
              <div
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)', marginTop: 8 }}
              >
                Top Agents
              </div>
              {muscleMemory.topAgents.map((a) => (
                <div
                  key={a.agentId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--c-bg-3, #1f2937)',
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--c-text-1)' }}>{a.agentId}</span>
                  <span style={{ fontSize: 12, color: '#22c55e' }}>{a.learnedCount} learned</span>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'shared' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tenantId ? null : (
                <div style={{ color: 'var(--c-text-3)', textAlign: 'center', padding: 20 }}>
                  No workspace selected, so shared memory is not available.
                </div>
              )}
              {tenantId && sharedFacts.length === 0 && (
                <div style={{ color: 'var(--c-text-3)', textAlign: 'center', padding: 20 }}>
                  No shared memories yet for this workspace.
                </div>
              )}
              {sharedFacts.map((fact, index) => (
                <div
                  key={`${fact.sharedAt}-${index}`}
                  style={{ background: 'var(--c-bg-3, #1f2937)', borderRadius: 10, padding: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#10b98133',
                        color: '#10b981',
                        textTransform: 'uppercase',
                      }}
                    >
                      {fact.category}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                      {fact.sourceAgent}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--c-text-3)', marginLeft: 'auto' }}>
                      {(fact.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ color: 'var(--c-text-1, #f9fafb)', fontSize: 13, lineHeight: 1.5 }}>
                    {fact.fact}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'dashboard' && dashboard && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard label="Total Facts" value={dashboard.totalFacts} />
                <StatCard label="Active" value={dashboard.activeFacts} color="#22c55e" />
                <StatCard
                  label="Recall Rate"
                  value={`${(dashboard.recallHitRate * 100).toFixed(0)}%`}
                  color="#6366f1"
                />
                <StatCard label="Categories" value={Object.keys(dashboard.byCategory).length} />
              </div>
              {Object.keys(dashboard.byCategory).length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--c-text-1)',
                      marginTop: 8,
                    }}
                  >
                    By Category
                  </div>
                  {Object.entries(dashboard.byCategory).map(([cat, count]) => (
                    <div
                      key={cat}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        background: 'var(--c-bg-3)',
                        borderRadius: 8,
                      }}
                    >
                      <span
                        style={{ fontSize: 13, color: CATEGORY_COLORS[cat] ?? 'var(--c-text-1)' }}
                      >
                        {cat}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                        {count as number}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {dashboard.consolidation && (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--c-text-1)',
                      marginTop: 8,
                    }}
                  >
                    Last Consolidation
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--c-text-3)',
                      padding: '8px 12px',
                      background: 'var(--c-bg-3)',
                      borderRadius: 8,
                    }}
                  >
                    Merged: {dashboard.consolidation.merged} | Promoted:{' '}
                    {dashboard.consolidation.promoted} | Demoted: {dashboard.consolidation.demoted}
                    <br />
                    {new Date(dashboard.consolidation.lastRunAt).toLocaleString()}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div style={{ background: 'var(--c-bg-3, #1f2937)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--c-text-1, #f9fafb)' }}>
        {value}
      </div>
    </div>
  );
}
