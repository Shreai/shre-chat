import { useEffect, useState, useCallback } from 'react';

interface OwnerBriefing {
  workspaceId: string;
  slotTs: number;
  executive: string;
  agentCount?: number;
  perAgent?: Array<{ agentId: string; role: string; bullets: string[]; blockers: string[] }>;
  escalations: Array<{ agentId: string; text: string }>;
  proposals: Array<{ agentId: string; text: string }>;
}

// shre-chat serve.js proxies these passthroughs to shre-tasks
const TASKS_BASE = '';

/**
 * OwnerBriefingCard — surfaces the latest owner briefing for a workspace.
 * Auto-refreshes every 60s; provides a "Run now" trigger for ad-hoc.
 *
 * Mount in the sidebar when a workspace is active, or as the "/brief" slash command response.
 */
export function OwnerBriefingCard({
  workspaceId,
  onOpenFull,
}: {
  workspaceId: string;
  onOpenFull?: () => void;
}) {
  const [data, setData] = useState<OwnerBriefing | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch(
        `${TASKS_BASE}/v1/briefing/owner?workspace=${encodeURIComponent(workspaceId)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) setData(await res.json());
    } catch {
      // silent — card hides on failure
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchBrief();
    const id = setInterval(() => void fetchBrief(), 60_000);
    return () => clearInterval(id);
  }, [fetchBrief]);

  const handleRun = async () => {
    setRunning(true);
    try {
      await fetch(`${TASKS_BASE}/v1/briefing/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      await fetchBrief();
    } finally {
      setRunning(false);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const time = new Date(data.slotTs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="owner-briefing-card" style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>
          📰 {workspaceId} • {time}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => void handleRun()} disabled={running} style={btnStyle}>
            {running ? '...' : 'refresh'}
          </button>
          {onOpenFull && (
            <button onClick={onOpenFull} style={btnStyle}>
              open
            </button>
          )}
        </div>
      </div>
      <p style={execStyle}>{data.executive}</p>
      <div style={statRowStyle}>
        <span>👥 {data.agentCount ?? data.perAgent?.length ?? 0}</span>
        <span style={{ color: data.escalations.length > 0 ? '#dc2626' : '#9ca3af' }}>
          🚨 {data.escalations.length}
        </span>
        <span>💡 {data.proposals.length}</span>
      </div>
      {data.escalations.length > 0 && (
        <ul style={listStyle}>
          {data.escalations.slice(0, 3).map((e, i) => (
            <li key={i} style={escItemStyle}>
              <strong>{e.agentId}:</strong> {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── inline styles (shre-chat has no design system) ────────────────────────
const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  background: 'var(--card-bg, #fafafa)',
  fontSize: 13,
  marginBottom: 12,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
};
const titleStyle: React.CSSProperties = { fontWeight: 600 };
const btnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 6px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
};
const execStyle: React.CSSProperties = {
  margin: '4px 0 8px',
  lineHeight: 1.4,
  color: 'var(--text-color, #374151)',
};
const statRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  fontSize: 11,
  color: '#6b7280',
};
const listStyle: React.CSSProperties = { marginTop: 8, paddingLeft: 16 };
const escItemStyle: React.CSSProperties = { color: '#dc2626', fontSize: 12, marginBottom: 4 };
