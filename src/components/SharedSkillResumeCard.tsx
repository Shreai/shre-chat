import { useCallback, useEffect, useState } from 'react';
import { isDevSafeMode } from '../env';

interface SharedSkillRanking {
  skillKey: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  partialCount: number;
  successRate: number;
  averageLatencyMs: number | null;
  rankingScore: number;
  lastOutcome: 'success' | 'failure' | 'partial' | 'unknown';
  promotable: boolean;
  reason: string;
}

export function SharedSkillResumeCard({ agentId }: { agentId: string | null }) {
  if (isDevSafeMode()) {
    return null;
  }
  const [rankings, setRankings] = useState<SharedSkillRanking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token =
      sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (!agentId) {
        setRankings([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/router/v1/agents/${encodeURIComponent(agentId)}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to load agent resume (${res.status})`);
        }
        const data = (await res.json()) as { sharedSkillRankings?: SharedSkillRanking[] };
        setRankings(Array.isArray(data.sharedSkillRankings) ? data.sharedSkillRankings : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setRankings([]);
        setError(err instanceof Error ? err.message : 'Failed to load shared skills');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load().catch(() => {});
    return () => controller.abort();
  }, [agentId, authHeaders]);

  return (
    <div
      className="mx-3 mt-3 rounded-xl border px-3 py-3"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: 'var(--c-border-2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--c-text-4)' }}
          >
            Resume
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Shared skill ranking
          </div>
        </div>
        {loading && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ color: 'var(--c-text-4)', background: 'var(--c-bg-hover)' }}
          >
            Loading
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
          {error}
        </div>
      ) : rankings.length > 0 ? (
        <div className="mt-2 space-y-2">
          {rankings.slice(0, 3).map((rank) => (
            <div
              key={rank.skillKey}
              className="rounded-lg px-2.5 py-2"
              style={{ background: 'var(--c-bg-hover)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[12px] font-medium truncate"
                    style={{ color: 'var(--c-text-1)' }}
                  >
                    {rank.skillKey}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    {rank.usageCount} uses · {rank.successRate.toFixed(1)}% success
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      color: rank.promotable ? 'var(--c-success)' : 'var(--c-text-4)',
                      background: rank.promotable
                        ? 'rgba(52,211,153,0.12)'
                        : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {rank.promotable ? 'Promotable' : 'Observed'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                    {rank.rankingScore.toFixed(2)}
                  </span>
                </div>
              </div>
              <div
                className="mt-1 flex items-center gap-2 text-[10px]"
                style={{ color: 'var(--c-text-4)' }}
              >
                <span>Last: {rank.lastOutcome}</span>
                {rank.averageLatencyMs !== null && <span>Latency: {rank.averageLatencyMs}ms</span>}
              </div>
              <div
                className="mt-1 text-[10px] leading-relaxed"
                style={{ color: 'var(--c-text-5)' }}
              >
                {rank.reason}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
          No shared skills ranked yet for this agent.
        </div>
      )}
    </div>
  );
}
