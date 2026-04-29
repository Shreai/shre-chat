import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SBadge } from '@shre/ui-kit';
import { mib007Link } from './chat-utils';
import { getMinimumFleetRoleLabel } from './store';

interface AgentSummary {
  id: string;
  name: string;
  identity?: { emoji?: string };
  stats?: { totalTasks: number; successRate: number; currentTask?: string };
  costs?: { totalCostUsd: number };
  status?: string;
}

type AdminTab = 'overview' | 'approvals' | 'rules';

function getInitialTab(): AdminTab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'approvals' || tab === 'rules' || tab === 'overview') return tab;
  return 'overview';
}

interface ApprovalRow {
  id: string;
  workspace_id: string;
  rule_id: string;
  rule_run_id: string;
  action_index: number;
  action_type: string;
  title: string;
  message: string;
  instructions?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_by?: string | null;
  requested_at: number;
  decided_by?: string | null;
  decided_at?: number | null;
  decision_note?: string | null;
  run_started_at?: number | null;
  run_status?: string | null;
  rule_name?: string | null;
  pending_action_index?: number | null;
  request_context?: string | null;
}

interface AgentProfile {
  role: string;
  summary: string;
  tools: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    approvalRequired?: boolean;
  }>;
  memory: {
    recentContextWindowMinutes: number;
    retentionHours: number;
    ragCollections: string[];
    businessKeys: string[];
  };
  approvals: {
    requiredFor: string[];
    thresholds: Array<{
      metric: string;
      maximum: number;
      reason: string;
    }>;
    escalationChannel?: string;
  };
  knowledgeBase: string[];
  guardrails: string[];
}

interface RuleRow {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger_type: string;
  status: string;
  updated_at: number;
  agent_profile: AgentProfile;
}

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

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return '$0.00';
  return `$${n.toFixed(4)}`;
}

function fmtTime(ts?: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function timeAgo(ts?: number | null): string {
  if (!ts) return '—';
  const deltaMs = Date.now() - ts;
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseRequestContextSummary(requestContext?: string | null): string | null {
  if (!requestContext) return null;
  try {
    const parsed = JSON.parse(requestContext) as { reason?: string; kind?: string };
    if (parsed.reason) return parsed.kind ? `${parsed.kind}: ${parsed.reason}` : parsed.reason;
    if (parsed.kind) return parsed.kind;
  } catch {
    return requestContext;
  }
  return null;
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--c-border-2)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
      style={{
        background: active ? 'var(--c-accent)' : 'var(--c-bg-2)',
        color: active ? 'var(--c-on-accent)' : 'var(--c-text-3)',
        border: '1px solid var(--c-border-2)',
      }}
    >
      {label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--c-text-5)' }}
      >
        {label}
      </div>
      <div className="mt-1 text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
        {value}
      </div>
    </div>
  );
}

export function AdminView() {
  const [tab, setTab] = useState<AdminTab>(getInitialTab);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentResume, setSelectedAgentResume] = useState<SharedSkillRanking[]>([]);
  const [selectedAgentResumeLoading, setSelectedAgentResumeLoading] = useState(false);
  const [selectedAgentResumeError, setSelectedAgentResumeError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingApprovalId, setSavingApprovalId] = useState<string | null>(null);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, string>>({});
  const [ruleEditorError, setRuleEditorError] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [ruleQuery, setRuleQuery] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const [agentData, approvalData, ruleData] = await Promise.all([
      fetchApi<AgentSummary[]>('/api/marketplace/agents'),
      fetchApi<{ approvals?: ApprovalRow[] }>('/v1/approvals?status=pending&limit=100'),
      fetchApi<{ rules?: RuleRow[] }>('/v1/rules?limit=200'),
    ]);

    if (!agentData && !approvalData && !ruleData) {
      setError('Could not load admin data. Is shre-hr running?');
    }

    const nextRules = ruleData?.rules ?? [];
    const nextAgents = agentData ?? [];
    setAgents(nextAgents);
    setSelectedAgentId((current) => {
      if (current && nextAgents.some((agent) => agent.id === current)) return current;
      return nextAgents[0]?.id ?? null;
    });
    setApprovals(approvalData?.approvals ?? []);
    setRules(nextRules);
    setSelectedRuleId((current) => {
      if (current && nextRules.some((rule) => rule.id === current)) return current;
      return nextRules[0]?.id ?? null;
    });
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadResume = async () => {
      if (!selectedAgentId) {
        setSelectedAgentResume([]);
        setSelectedAgentResumeError(null);
        setSelectedAgentResumeLoading(false);
        return;
      }

      setSelectedAgentResumeLoading(true);
      setSelectedAgentResumeError(null);

      try {
        const res = await fetch(`/api/router/v1/agents/${encodeURIComponent(selectedAgentId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Resume lookup failed (${res.status})`);
        }
        const data = (await res.json()) as { sharedSkillRankings?: SharedSkillRanking[] };
        setSelectedAgentResume(
          Array.isArray(data.sharedSkillRankings) ? data.sharedSkillRankings : [],
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setSelectedAgentResume([]);
        setSelectedAgentResumeError(err instanceof Error ? err.message : 'Resume lookup failed');
      } finally {
        if (!controller.signal.aborted) setSelectedAgentResumeLoading(false);
      }
    };

    loadResume().catch(() => {});
    return () => controller.abort();
  }, [selectedAgentId]);

  useEffect(() => {
    let cancelled = false;
    load(false).catch(() => {
      if (!cancelled) setLoading(false);
    });
    const iv = setInterval(() => {
      load(true).catch(() => {
        /* keep previous data */
      });
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(
      null,
      '',
      `${url.pathname}?${url.searchParams.toString()}${url.hash}`,
    );
  }, [tab]);

  const totalSpend = agents.reduce((s, a) => s + (a.costs?.totalCostUsd ?? 0), 0);
  const totalTasks = agents.reduce((s, a) => s + (a.stats?.totalTasks ?? 0), 0);
  const avgQuality = agents.length
    ? agents.reduce((s, a) => s + (a.stats?.successRate ?? 0), 0) / agents.length
    : 0;
  const pendingApprovals = approvals.length;

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? null,
    [rules, selectedRuleId],
  );

  useEffect(() => {
    if (!selectedRule) return;
    setRuleDrafts((current) => {
      if (current[selectedRule.id] != null) return current;
      return {
        ...current,
        [selectedRule.id]: prettyJson(selectedRule.agent_profile),
      };
    });
    setRuleEditorError(null);
  }, [selectedRule]);

  const visibleRules = useMemo(() => {
    const q = ruleQuery.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((rule) => {
      const blob =
        `${rule.name} ${rule.description ?? ''} ${rule.agent_profile.role} ${rule.trigger_type}`.toLowerCase();
      return blob.includes(q);
    });
  }, [ruleQuery, rules]);

  async function respondToApproval(id: string, decision: 'approve' | 'reject') {
    setSavingApprovalId(id);
    try {
      const note = approvalNotes[id]?.trim() || '';
      const res = await fetch(`/v1/approvals/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decided_by: 'admin-ui',
          note,
          decision_note: note,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval action failed');
    } finally {
      setSavingApprovalId(null);
    }
  }

  async function saveRuleProfile(ruleId: string) {
    const draft = ruleDrafts[ruleId];
    if (draft == null) return;
    setSavingRuleId(ruleId);
    setRuleEditorError(null);
    try {
      const parsed = JSON.parse(draft) as AgentProfile;
      const res = await fetch(`/v1/rules/${encodeURIComponent(ruleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_profile: parsed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as RuleRow;
      setRules((current) => current.map((rule) => (rule.id === updated.id ? updated : rule)));
      setRuleDrafts((current) => ({
        ...current,
        [updated.id]: prettyJson(updated.agent_profile),
      }));
    } catch (err) {
      setRuleEditorError(err instanceof Error ? err.message : 'Failed to save agent profile');
    } finally {
      setSavingRuleId(null);
    }
  }

  function resetRuleDraft(rule: RuleRow) {
    setRuleDrafts((current) => ({
      ...current,
      [rule.id]: prettyJson(rule.agent_profile),
    }));
    setRuleEditorError(null);
  }

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div
        className="px-4 py-3 flex items-center gap-3 justify-between"
        style={{ borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--c-text-3)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--c-text-1)' }}>
              Admin Console
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--c-text-4)' }}>
              Approval queue and agent profile controls
            </div>
          </div>
        </div>
        <button
          onClick={() => window.open(mib007Link('admin'), '_blank')}
          className="px-2 py-1 rounded text-[11px] font-medium transition-colors shrink-0"
          style={{
            background: 'var(--c-bg-2)',
            color: 'var(--c-text-3)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          Full Admin →
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"
              style={{ color: 'var(--c-text-5)' }}
            />
          </div>
        )}
        {error && (
          <SBadge
            variant="destructive"
            className="w-full justify-center rounded-lg px-4 py-3 text-sm"
          >
            {error}
          </SBadge>
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniStat label="Active Agents" value={String(agents.length)} />
              <MiniStat label="Total Spend" value={fmtUsd(totalSpend)} />
              <MiniStat label="Total Tasks" value={String(totalTasks)} />
              <MiniStat label="Pending Approvals" value={String(pendingApprovals)} />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <TabButton
                active={tab === 'overview'}
                label="Overview"
                onClick={() => setTab('overview')}
              />
              <TabButton
                active={tab === 'approvals'}
                label={`Approvals (${pendingApprovals})`}
                onClick={() => setTab('approvals')}
              />
              <TabButton
                active={tab === 'rules'}
                label={`Rules (${rules.length})`}
                onClick={() => setTab('rules')}
              />
            </div>

            {tab === 'overview' && (
              <SectionCard
                title="Agent Roster"
                subtitle="Marketplace and platform agent health at a glance"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-border-2)' }}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                      style={{ color: 'var(--c-text-5)' }}
                    >
                      Avg Quality
                    </div>
                    <div
                      className="text-lg font-bold"
                      style={{ color: avgQuality > 80 ? '#4ade80' : '#f59e0b' }}
                    >
                      {avgQuality.toFixed(0)}%
                    </div>
                  </div>
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-border-2)' }}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                      style={{ color: 'var(--c-text-5)' }}
                    >
                      Approval Guardrails
                    </div>
                    <div className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Sensitive actions pause for human review
                    </div>
                  </div>
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-border-2)' }}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                      style={{ color: 'var(--c-text-5)' }}
                    >
                      Agent Profiles
                    </div>
                    <div className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Tools, memory, knowledge, and approvals live per rule
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--c-border-2)' }}
                >
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: 'var(--c-bg-1)' }}>
                        <th
                          className="text-left px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Agent
                        </th>
                        <th
                          className="text-right px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Tasks
                        </th>
                        <th
                          className="text-right px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Quality
                        </th>
                        <th
                          className="text-right px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Cost
                        </th>
                        <th
                          className="text-center px-3 py-2 font-semibold"
                          style={{ color: 'var(--c-text-4)' }}
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a, i) => (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedAgentId(a.id)}
                          className="cursor-pointer"
                          style={{
                            background:
                              selectedAgentId === a.id
                                ? 'rgba(99,102,241,0.10)'
                                : i % 2 === 0
                                  ? 'var(--c-bg-1)'
                                  : 'var(--c-bg-2)',
                          }}
                        >
                          <td className="px-3 py-2 flex items-center gap-1.5">
                            <span>{a.identity?.emoji || '🤖'}</span>
                            <div className="min-w-0">
                              <div className="truncate" style={{ color: 'var(--c-text-2)' }}>
                                {a.name}
                              </div>
                              <div
                                className="text-[9px] truncate"
                                style={{ color: 'var(--c-text-5)' }}
                              >
                                {a.id}
                              </div>
                              {getMinimumFleetRoleLabel(a.id) && (
                                <div className="mt-0.5">
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium"
                                    style={{
                                      background: 'var(--c-bg-3)',
                                      color: 'var(--c-text-4)',
                                    }}
                                  >
                                    {getMinimumFleetRoleLabel(a.id)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                            {a.stats?.totalTasks ?? 0}
                          </td>
                          <td
                            className="text-right px-3 py-2"
                            style={{
                              color: (a.stats?.successRate ?? 0) > 80 ? '#4ade80' : '#f59e0b',
                            }}
                          >
                            {(a.stats?.successRate ?? 0).toFixed(0)}%
                          </td>
                          <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                            {fmtUsd(a.costs?.totalCostUsd ?? 0)}
                          </td>
                          <td className="text-center px-3 py-2">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ background: a.status === 'active' ? '#4ade80' : '#a1a1aa' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4">
                  <SectionCard
                    title="Selected Agent Resume"
                    subtitle="Shared skill rankings for the currently selected agent"
                  >
                    {!selectedAgentId ? (
                      <div
                        className="text-sm py-8 text-center"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Select an agent row to inspect shared skill rankings.
                      </div>
                    ) : selectedAgentResumeError ? (
                      <div className="text-sm py-8 text-center" style={{ color: '#f87171' }}>
                        {selectedAgentResumeError}
                      </div>
                    ) : selectedAgentResumeLoading ? (
                      <div
                        className="text-sm py-8 text-center"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Loading resume…
                      </div>
                    ) : selectedAgentResume.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {selectedAgentResume.slice(0, 6).map((rank) => (
                          <div
                            key={rank.skillKey}
                            className="rounded-2xl p-3"
                            style={{
                              background: 'var(--c-bg-1)',
                              border: '1px solid var(--c-border-2)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div
                                  className="text-sm font-semibold truncate"
                                  style={{ color: 'var(--c-text-1)' }}
                                >
                                  {rank.skillKey}
                                </div>
                                <div
                                  className="text-[10px] mt-0.5"
                                  style={{ color: 'var(--c-text-4)' }}
                                >
                                  {rank.usageCount} uses · {rank.successRate.toFixed(1)}% success
                                </div>
                              </div>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                                style={{
                                  color: rank.promotable ? 'var(--c-success)' : 'var(--c-text-4)',
                                  background: rank.promotable
                                    ? 'rgba(52,211,153,0.12)'
                                    : 'rgba(255,255,255,0.04)',
                                }}
                              >
                                {rank.promotable ? 'Promotable' : 'Observed'}
                              </span>
                            </div>
                            <div
                              className="mt-2 flex flex-wrap gap-2 text-[10px]"
                              style={{ color: 'var(--c-text-4)' }}
                            >
                              <span>Score {rank.rankingScore.toFixed(2)}</span>
                              <span>Last {rank.lastOutcome}</span>
                              {rank.averageLatencyMs !== null && (
                                <span>{rank.averageLatencyMs}ms avg</span>
                              )}
                            </div>
                            <div
                              className="mt-2 text-[10px] leading-5"
                              style={{ color: 'var(--c-text-5)' }}
                            >
                              {rank.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="text-sm py-8 text-center"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        No shared skill rankings available for this agent yet.
                      </div>
                    )}
                  </SectionCard>
                </div>
              </SectionCard>
            )}

            {tab === 'approvals' && (
              <SectionCard
                title="Approval Queue"
                subtitle="Sensitive actions pause here until a human approves or rejects them"
              >
                {approvals.length === 0 ? (
                  <div className="text-sm py-10 text-center" style={{ color: 'var(--c-text-4)' }}>
                    No pending approvals.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className="rounded-2xl p-4"
                        style={{
                          background: 'var(--c-bg-1)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div
                                className="text-sm font-semibold"
                                style={{ color: 'var(--c-text-1)' }}
                              >
                                {approval.title}
                              </div>
                              <SBadge className="rounded-full px-2 py-0.5 text-[10px]">
                                {approval.action_type}
                              </SBadge>
                              <SBadge
                                variant={approval.status === 'pending' ? 'default' : 'secondary'}
                                className="rounded-full px-2 py-0.5 text-[10px]"
                              >
                                {approval.status}
                              </SBadge>
                            </div>
                            <div className="mt-1 text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                              {approval.rule_name || approval.rule_id} · run {approval.rule_run_id}{' '}
                              · requested {timeAgo(approval.requested_at)}
                            </div>
                            {parseRequestContextSummary(approval.request_context) && (
                              <div
                                className="mt-2 text-[11px] rounded-xl px-3 py-2"
                                style={{
                                  background: 'var(--c-bg-2)',
                                  border: '1px solid var(--c-border-2)',
                                  color: 'var(--c-text-3)',
                                }}
                              >
                                {parseRequestContextSummary(approval.request_context)}
                              </div>
                            )}
                            <div
                              className="mt-3 text-sm leading-6 whitespace-pre-wrap"
                              style={{ color: 'var(--c-text-2)' }}
                            >
                              {approval.message}
                            </div>
                            {approval.instructions && (
                              <div
                                className="mt-3 rounded-xl p-3 text-[12px] whitespace-pre-wrap"
                                style={{
                                  background: 'var(--c-bg-2)',
                                  border: '1px solid var(--c-border-2)',
                                  color: 'var(--c-text-3)',
                                }}
                              >
                                {approval.instructions}
                              </div>
                            )}
                            <div className="mt-3 text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                              Run started {fmtTime(approval.run_started_at)} · run status{' '}
                              {approval.run_status || 'unknown'} · action #{approval.action_index}
                            </div>
                          </div>

                          <div className="w-full lg:w-80 space-y-2">
                            <textarea
                              className="w-full min-h-20 rounded-xl px-3 py-2 text-sm outline-none resize-y"
                              style={{
                                background: 'var(--c-bg-2)',
                                color: 'var(--c-text-1)',
                                border: '1px solid var(--c-border-2)',
                              }}
                              placeholder="Optional note for approve/reject"
                              value={approvalNotes[approval.id] ?? ''}
                              onChange={(e) =>
                                setApprovalNotes((current) => ({
                                  ...current,
                                  [approval.id]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => respondToApproval(approval.id, 'approve')}
                                disabled={savingApprovalId === approval.id}
                                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium"
                                style={{
                                  background:
                                    savingApprovalId === approval.id ? 'var(--c-bg-2)' : '#16a34a',
                                  color: '#fff',
                                  opacity: savingApprovalId === approval.id ? 0.7 : 1,
                                }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => respondToApproval(approval.id, 'reject')}
                                disabled={savingApprovalId === approval.id}
                                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium"
                                style={{
                                  background:
                                    savingApprovalId === approval.id ? 'var(--c-bg-2)' : '#dc2626',
                                  color: '#fff',
                                  opacity: savingApprovalId === approval.id ? 0.7 : 1,
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {tab === 'rules' && (
              <SectionCard
                title="Agent Profile Editor"
                subtitle="Edit the rule-level agent contract for tools, memory, approvals, and guardrails"
              >
                <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
                  <div className="space-y-3">
                    <div
                      className="rounded-xl p-3"
                      style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-border-2)' }}
                    >
                      <label
                        className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                        style={{ color: 'var(--c-text-5)' }}
                      >
                        Search rules
                      </label>
                      <input
                        value={ruleQuery}
                        onChange={(e) => setRuleQuery(e.target.value)}
                        placeholder="Filter by name, role, trigger..."
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={{
                          background: 'var(--c-bg-2)',
                          color: 'var(--c-text-1)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      />
                    </div>

                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {visibleRules.map((rule) => {
                        const active = rule.id === selectedRuleId;
                        return (
                          <button
                            key={rule.id}
                            onClick={() => setSelectedRuleId(rule.id)}
                            className="w-full text-left rounded-2xl p-3 transition-colors"
                            style={{
                              background: active ? 'var(--c-bg-1)' : 'var(--c-bg-2)',
                              border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div
                                  className="text-sm font-semibold truncate"
                                  style={{ color: 'var(--c-text-1)' }}
                                >
                                  {rule.name}
                                </div>
                                <div
                                  className="mt-1 text-[11px] truncate"
                                  style={{ color: 'var(--c-text-4)' }}
                                >
                                  {rule.agent_profile.role} · {rule.trigger_type}
                                </div>
                              </div>
                              <SBadge
                                variant={rule.enabled ? 'default' : 'secondary'}
                                className="rounded-full px-2 py-0.5 text-[10px]"
                              >
                                {rule.enabled ? 'enabled' : 'paused'}
                              </SBadge>
                            </div>
                            <div
                              className="mt-2 text-[11px] line-clamp-2"
                              style={{ color: 'var(--c-text-3)' }}
                            >
                              {rule.agent_profile.summary || rule.description || 'No description'}
                            </div>
                            <div className="mt-2 text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                              Updated {timeAgo(rule.updated_at)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedRule ? (
                      <>
                        <div
                          className="rounded-2xl p-4"
                          style={{
                            background: 'var(--c-bg-1)',
                            border: '1px solid var(--c-border-2)',
                          }}
                        >
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div
                                className="text-lg font-semibold"
                                style={{ color: 'var(--c-text-1)' }}
                              >
                                {selectedRule.name}
                              </div>
                              <div
                                className="text-[11px] mt-1"
                                style={{ color: 'var(--c-text-4)' }}
                              >
                                {selectedRule.trigger_type} ·{' '}
                                {selectedRule.enabled ? 'enabled' : 'paused'} ·{' '}
                                {selectedRule.status}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => resetRuleDraft(selectedRule)}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                                style={{
                                  background: 'var(--c-bg-2)',
                                  color: 'var(--c-text-3)',
                                  border: '1px solid var(--c-border-2)',
                                }}
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => saveRuleProfile(selectedRule.id)}
                                disabled={savingRuleId === selectedRule.id}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                                style={{
                                  background:
                                    savingRuleId === selectedRule.id
                                      ? 'var(--c-bg-2)'
                                      : 'var(--c-accent)',
                                  color: 'var(--c-on-accent)',
                                  opacity: savingRuleId === selectedRule.id ? 0.7 : 1,
                                }}
                              >
                                {savingRuleId === selectedRule.id ? 'Saving…' : 'Save profile'}
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                            <MiniStat
                              label="Tool Count"
                              value={String(selectedRule.agent_profile.tools?.length ?? 0)}
                            />
                            <MiniStat
                              label="Memory Window"
                              value={`${selectedRule.agent_profile.memory.recentContextWindowMinutes}m`}
                            />
                            <MiniStat
                              label="Approval Rules"
                              value={String(
                                selectedRule.agent_profile.approvals.requiredFor.length,
                              )}
                            />
                          </div>
                        </div>

                        {ruleEditorError && (
                          <SBadge
                            variant="destructive"
                            className="w-full justify-center rounded-lg px-4 py-3 text-sm"
                          >
                            {ruleEditorError}
                          </SBadge>
                        )}

                        <div
                          className="rounded-2xl p-4"
                          style={{
                            background: 'var(--c-bg-1)',
                            border: '1px solid var(--c-border-2)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <div
                                className="text-sm font-semibold"
                                style={{ color: 'var(--c-text-1)' }}
                              >
                                Agent Profile JSON
                              </div>
                              <div
                                className="text-[11px] mt-0.5"
                                style={{ color: 'var(--c-text-4)' }}
                              >
                                Edit the full profile contract. Invalid JSON will block saving.
                              </div>
                            </div>
                          </div>
                          <textarea
                            className="w-full min-h-[420px] rounded-2xl px-4 py-3 text-[12px] font-mono outline-none resize-y leading-6"
                            spellCheck={false}
                            style={{
                              background: 'var(--c-bg-2)',
                              color: 'var(--c-text-1)',
                              border: '1px solid var(--c-border-2)',
                            }}
                            value={
                              ruleDrafts[selectedRule.id] ?? prettyJson(selectedRule.agent_profile)
                            }
                            onChange={(e) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [selectedRule.id]: e.target.value,
                              }))
                            }
                          />
                          <div
                            className="mt-3 text-[11px] leading-5"
                            style={{ color: 'var(--c-text-4)' }}
                          >
                            Fields available: role, summary, tools, memory, approvals,
                            knowledgeBase, and guardrails.
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        className="rounded-2xl p-8 text-center"
                        style={{
                          background: 'var(--c-bg-1)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      >
                        <div className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                          No rule selected
                        </div>
                        <div className="text-[12px] mt-1" style={{ color: 'var(--c-text-4)' }}>
                          Pick a rule from the left to edit its agent profile.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
