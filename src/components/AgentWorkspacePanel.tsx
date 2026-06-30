import React, { useEffect, useMemo, useState } from 'react';
import {
  appendOrchestrationEvent,
  createApprovalCard,
  createOrchestrationRun,
  createTrainingCandidate,
  decideApprovalCard,
  fetchAgentWorkspace,
  fetchCliResume,
  submitTrainingJob,
  type AgentWorkspaceSummary,
} from '../lib/agent-workspace';

function statusColor(ok: boolean) {
  return ok ? 'var(--c-success)' : 'var(--c-warning)';
}

function formatAge(iso: string) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function AgentWorkspacePanel({
  onUsePrompt,
}: {
  onUsePrompt?: (prompt: string, agentId?: string) => void;
}) {
  const [summary, setSummary] = useState<AgentWorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAgentWorkspace()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load workspace');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeServices = useMemo(() => {
    if (!summary) return 0;
    return [
      summary.status.router.ok,
      summary.status.terminal.ok,
      summary.status.openclaw.configured,
      summary.status.openclawRuntime.ok,
    ].filter(Boolean).length;
  }, [summary]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--c-text-3)' }}>
        Loading agent workspace...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div
        className="h-full flex items-center justify-center px-6"
        style={{ color: 'var(--c-danger)' }}
      >
        {error || 'Agent workspace unavailable'}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--c-bg-main)' }}>
      <div className="mx-auto max-w-6xl px-4 py-4 space-y-4">
        <section className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                  Agent Conversation Workspace
                </h2>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
                  {summary.objective}
                </p>
              </div>
              <span
                className="shrink-0 rounded px-2 py-1 text-[11px]"
                style={{ color: 'var(--c-text-1)', background: 'var(--c-accent-soft)' }}
              >
                {activeServices}/4 online
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(summary.architecture).map(([key, item]) => (
                <div
                  key={key}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: 'var(--c-border-2)' }}
                >
                  <div
                    className="text-[11px] font-semibold uppercase"
                    style={{ color: 'var(--c-text-3)' }}
                  >
                    {item.service}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--c-text-1)' }}>
                    {item.port ? `:${item.port}` : item.url || key}
                  </div>
                  <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--c-text-3)' }}>
                    {item.role}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Runtime Status
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <StatusRow
                label="shre-router"
                ok={summary.status.router.ok}
                detail={summary.status.router.status || summary.status.router.error || 'unknown'}
              />
              <StatusRow
                label="shre-terminal"
                ok={summary.status.terminal.ok}
                detail={
                  summary.status.terminal.status || summary.status.terminal.error || 'optional'
                }
              />
              <StatusRow
                label="OpenClaw config"
                ok={summary.status.openclaw.configured}
                detail={`${summary.status.openclaw.agentCount} agents, ${summary.status.openclaw.authProfileCount} auth profiles`}
              />
              <StatusRow
                label="OpenClaw runtime"
                ok={summary.status.openclawRuntime.ok}
                detail={
                  summary.status.openclawRuntime.ok
                    ? `:${summary.status.openclaw.gatewayPort}`
                    : summary.status.openclawRuntime.hint ||
                      summary.status.openclawRuntime.error ||
                      'offline'
                }
              />
              <StatusRow
                label="Gateway token"
                ok={summary.status.openclaw.hasGatewayToken}
                detail={summary.status.openclaw.hasGatewayToken ? 'present, hidden' : 'not found'}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <div
            className="rounded-lg border p-4 lg:col-span-2"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                CLI Sessions Ready For UI Migration
              </h3>
              <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                {summary.status.cli.root}
              </span>
            </div>
            <div className="mt-3 divide-y" style={{ borderColor: 'var(--c-border-2)' }}>
              {summary.status.cli.sessions.length === 0 ? (
                <div className="py-5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                  No CLI ledgers found yet.
                </div>
              ) : (
                summary.status.cli.sessions.map((session) => (
                  <div key={session.id} className="w-full py-2 transition-colors hover:bg-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="truncate text-xs font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {session.title}
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                          {session.agentId} · {session.type} · {session.messageCount} messages
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                        {formatAge(session.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded px-2 py-1 text-[11px]"
                        style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
                        onClick={async () => {
                          try {
                            setActionStatus('Loading CLI ledger...');
                            const payload = await fetchCliResume(session.id);
                            onUsePrompt?.(payload.prompt, session.agentId);
                            setActionStatus(`Loaded ${session.title}`);
                          } catch (err: any) {
                            setActionStatus(err?.message || 'CLI resume failed');
                          }
                        }}
                      >
                        Continue in UI
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                        onClick={async () => {
                          try {
                            setActionStatus('Staging skill candidate...');
                            const candidate = await createTrainingCandidate({
                              sessionId: session.id,
                              proposedSkillPath: 'agentic-workflows/conversation-routing',
                              notes: `Candidate staged from ${session.title}`,
                            });
                            setSummary((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: {
                                      ...prev.status,
                                      training: {
                                        ...prev.status.training,
                                        candidateCount: prev.status.training.candidateCount + 1,
                                        candidates: [
                                          candidate,
                                          ...prev.status.training.candidates,
                                        ].slice(0, 10),
                                      },
                                    },
                                  }
                                : prev,
                            );
                            setActionStatus(`Candidate staged: ${candidate.id}`);
                          } catch (err: any) {
                            setActionStatus(err?.message || 'Candidate staging failed');
                          }
                        }}
                      >
                        Stage skill candidate
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                        onClick={async () => {
                          try {
                            setActionStatus('Creating approval card...');
                            const card = await createApprovalCard({
                              title: `Approve next action for ${session.title}`,
                              actionType: 'irreversible',
                              summary: `Hermes or an operator should review the resumed CLI ledger before any write, public-send, financial, POS/BOS, or irreversible action is executed.`,
                              requestedBy: session.agentId || 'hermes',
                              sessionId: session.id,
                              risk: 'medium',
                              payload: { source: 'cli-session', sessionId: session.id },
                            });
                            setSummary((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: {
                                      ...prev.status,
                                      approvalCards: {
                                        ...prev.status.approvalCards,
                                        pendingCount: prev.status.approvalCards.pendingCount + 1,
                                        cards: [card, ...prev.status.approvalCards.cards].slice(
                                          0,
                                          10,
                                        ),
                                      },
                                    },
                                  }
                                : prev,
                            );
                            setActionStatus(`Approval card created: ${card.id}`);
                          } catch (err: any) {
                            setActionStatus(err?.message || 'Approval card failed');
                          }
                        }}
                      >
                        Request approval
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {actionStatus && (
              <div className="mt-3 text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                {actionStatus}
              </div>
            )}
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Hermes
            </h3>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
              {summary.status.hermes.role}. Routed through {summary.status.hermes.routingBoundary}.
            </p>
            <div className="mt-3 space-y-1">
              {summary.status.hermes.systemPrompt.map((rule) => (
                <div
                  key={rule}
                  className="text-[11px] leading-4"
                  style={{ color: 'var(--c-text-3)' }}
                >
                  {rule}
                </div>
              ))}
            </div>
            <button
              className="mt-3 rounded px-3 py-2 text-xs font-medium"
              style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
              onClick={() =>
                onUsePrompt?.(
                  'Hermes, route this conversation to the right agent, explain your routing decision, and list any approval gates before action.',
                  'hermes',
                )
              }
            >
              Start with Hermes
            </button>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                  Multi-Model Orchestration
                </h3>
                <p className="mt-2 text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
                  {summary.status.orchestration.controlPlane.invariant}
                </p>
              </div>
              <span
                className="shrink-0 rounded px-2 py-1 text-[10px] uppercase"
                style={{
                  color: summary.status.orchestration.readiness.routingReady
                    ? 'var(--c-success)'
                    : 'var(--c-warning)',
                  background: 'var(--c-bg-3)',
                }}
              >
                {summary.status.orchestration.readiness.routingReady ? 'ready' : 'gaps'}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Object.entries(summary.status.orchestration.executors).map(([name, executor]) => (
                <StatusRow
                  key={name}
                  label={name}
                  ok={executor.available}
                  detail={executor.adapter}
                />
              ))}
            </div>
            <div className="mt-4 text-[11px] leading-4" style={{ color: 'var(--c-text-3)' }}>
              {summary.status.orchestration.routingPolicy}
            </div>
            {summary.status.orchestration.executorIsolation.risks.length > 0 && (
              <div className="mt-3 space-y-1">
                {summary.status.orchestration.executorIsolation.risks.map((risk) => (
                  <div
                    key={risk}
                    className="text-[11px] leading-4"
                    style={{ color: 'var(--c-warning)' }}
                  >
                    {risk}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded px-3 py-2 text-xs font-medium"
                style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
                onClick={async () => {
                  try {
                    setActionStatus('Creating orchestration run...');
                    const run = await createOrchestrationRun({
                      title: 'Conversation workspace orchestration',
                      objective:
                        'Plan, implement, train, and review a multi-model workflow through gated execution.',
                    });
                    setSummary((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: {
                              ...prev.status,
                              orchestration: {
                                ...prev.status.orchestration,
                                runStore: {
                                  ...prev.status.orchestration.runStore,
                                  runs: [run, ...prev.status.orchestration.runStore.runs].slice(
                                    0,
                                    5,
                                  ),
                                },
                              },
                            },
                          }
                        : prev,
                    );
                    setActionStatus(`Run created: ${run.id}`);
                  } catch (err: any) {
                    setActionStatus(err?.message || 'Run creation failed');
                  }
                }}
              >
                Create gated run
              </button>
            </div>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Routing Contract
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {summary.status.orchestration.capabilityRegistry.slice(0, 6).map((entry) => (
                <div
                  key={`${entry.taskType}-${entry.executor}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: entry.enabled ? 'var(--c-success)' : 'var(--c-warning)' }}
                  />
                  <span className="font-medium" style={{ color: 'var(--c-text-1)' }}>
                    {entry.taskType}
                  </span>
                  <span className="ml-auto" style={{ color: 'var(--c-text-3)' }}>
                    {entry.executor} · {entry.latencyClass}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.status.orchestration.gates.map((gate) => (
                <span
                  key={gate}
                  className="rounded border px-2 py-1 text-[11px]"
                  style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                >
                  {gate}
                </span>
              ))}
            </div>
            <div className="mt-3 text-[11px] leading-4" style={{ color: 'var(--c-text-3)' }}>
              Events: {summary.status.orchestration.canonicalEvents.join(', ')}
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border p-4"
          style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Orchestration Runs
            </h3>
            <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>
              {summary.status.orchestration.runStore.path}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {summary.status.orchestration.runStore.runs.length === 0 ? (
              <div className="py-4 text-xs" style={{ color: 'var(--c-text-3)' }}>
                No persisted runs yet.
              </div>
            ) : (
              summary.status.orchestration.runStore.runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: 'var(--c-border-2)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="truncate text-xs font-medium"
                        style={{ color: 'var(--c-text-1)' }}
                      >
                        {run.title}
                      </div>
                      <div
                        className="mt-1 text-[11px] leading-4"
                        style={{ color: 'var(--c-text-3)' }}
                      >
                        {run.status} · {run.nodes.length} nodes · {run.trainingJobs.length} training
                        jobs · {run.eventCount || run.events?.length || 0} events
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                      {formatAge(run.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded border px-2 py-1 text-[11px]"
                      style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                      onClick={async () => {
                        try {
                          setActionStatus('Appending plan approval event...');
                          await appendOrchestrationEvent(run.id, {
                            type: 'gate',
                            nodeId: 'approve-plan',
                            executor: 'claude',
                            kind: 'approve_plan',
                            payload: { status: 'approval_required' },
                          });
                          setSummary((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  status: {
                                    ...prev.status,
                                    orchestration: {
                                      ...prev.status.orchestration,
                                      runStore: {
                                        ...prev.status.orchestration.runStore,
                                        runs: prev.status.orchestration.runStore.runs.map((item) =>
                                          item.id === run.id
                                            ? {
                                                ...item,
                                                status: 'active',
                                                eventCount:
                                                  (item.eventCount || item.events?.length || 0) + 1,
                                                nodes: item.nodes.map((node) =>
                                                  node.id === 'approve-plan'
                                                    ? { ...node, status: 'blocked' }
                                                    : node,
                                                ),
                                              }
                                            : item,
                                        ),
                                      },
                                    },
                                  },
                                }
                              : prev,
                          );
                          setActionStatus(`Plan gate recorded for ${run.id}`);
                        } catch (err: any) {
                          setActionStatus(err?.message || 'Event append failed');
                        }
                      }}
                    >
                      Record plan gate
                    </button>
                    <button
                      className="rounded px-2 py-1 text-[11px]"
                      style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
                      onClick={async () => {
                        try {
                          setActionStatus('Submitting training job...');
                          const job = await submitTrainingJob(run.id, {
                            nodeId: 'train',
                            datasetRef: 'agent-workspace://candidate-ledgers',
                            targetMetric: 0.85,
                            metricName: 'eval_score',
                          });
                          setSummary((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  status: {
                                    ...prev.status,
                                    orchestration: {
                                      ...prev.status.orchestration,
                                      runStore: {
                                        ...prev.status.orchestration.runStore,
                                        runs: prev.status.orchestration.runStore.runs.map((item) =>
                                          item.id === run.id
                                            ? {
                                                ...item,
                                                status: 'active',
                                                trainingJobs: [job, ...item.trainingJobs],
                                                eventCount:
                                                  (item.eventCount || item.events?.length || 0) + 1,
                                              }
                                            : item,
                                        ),
                                      },
                                    },
                                  },
                                }
                              : prev,
                          );
                          setActionStatus(`Training job queued: ${job.id}`);
                        } catch (err: any) {
                          setActionStatus(err?.message || 'Training job failed');
                        }
                      }}
                    >
                      Queue training job
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Implementation Tasks
            </h3>
            <div className="mt-3 space-y-2">
              {summary.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        task.status === 'implemented' ? 'var(--c-success)' : 'var(--c-warning)',
                    }}
                  />
                  <span style={{ color: 'var(--c-text-2)' }}>{task.title}</span>
                  <span
                    className="ml-auto text-[10px] uppercase"
                    style={{ color: 'var(--c-text-4)' }}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Training Path
            </h3>
            <div className="mt-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
              {summary.status.training.service} · {summary.status.training.mode} ·{' '}
              {summary.status.training.candidateCount} candidates
            </div>
            <div className="mt-3 space-y-2">
              {summary.status.training.nextActions.map((item) => (
                <div key={item} className="text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
                  {item}
                </div>
              ))}
            </div>
            {summary.status.training.candidates.length > 0 && (
              <div className="mt-4 space-y-2">
                {summary.status.training.candidates.slice(0, 3).map((candidate) => (
                  <div
                    key={candidate.id}
                    className="rounded border px-2 py-2"
                    style={{ borderColor: 'var(--c-border-2)' }}
                  >
                    <div
                      className="truncate text-[11px] font-medium"
                      style={{ color: 'var(--c-text-1)' }}
                    >
                      {candidate.proposedSkillPath}
                    </div>
                    <div className="mt-1 text-[10px]" style={{ color: 'var(--c-text-3)' }}>
                      {candidate.agentId} · {candidate.status} · approval required
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          className="rounded-lg border p-4"
          style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Approval Cards
            </h3>
            <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>
              {summary.status.approvalCards.pendingCount} pending
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {summary.status.approvalCards.cards.length === 0 ? (
              <div className="py-4 text-xs" style={{ color: 'var(--c-text-3)' }}>
                No gated action approvals are waiting.
              </div>
            ) : (
              summary.status.approvalCards.cards.map((card) => (
                <div
                  key={card.id}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: 'var(--c-border-2)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="truncate text-xs font-medium"
                        style={{ color: 'var(--c-text-1)' }}
                      >
                        {card.title}
                      </div>
                      <div
                        className="mt-1 text-[11px] leading-4"
                        style={{ color: 'var(--c-text-3)' }}
                      >
                        {card.actionType} · {card.risk} · {card.executionStatus}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded border px-2 py-1 text-[10px] uppercase"
                      style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                    >
                      {card.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
                    {card.summary}
                  </p>
                  {card.status === 'pending' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded px-2 py-1 text-[11px]"
                        style={{ color: 'var(--c-on-accent)', background: 'var(--c-accent)' }}
                        onClick={async () => {
                          try {
                            setActionStatus('Approving card...');
                            const updated = await decideApprovalCard(card.id, 'approve', {
                              decidedBy: 'workspace-user',
                            });
                            setSummary((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: {
                                      ...prev.status,
                                      approvalCards: {
                                        ...prev.status.approvalCards,
                                        pendingCount: Math.max(
                                          0,
                                          prev.status.approvalCards.pendingCount - 1,
                                        ),
                                        cards: prev.status.approvalCards.cards.map((item) =>
                                          item.id === card.id ? updated : item,
                                        ),
                                      },
                                    },
                                  }
                                : prev,
                            );
                            setActionStatus(`Approved: ${card.title}`);
                          } catch (err: any) {
                            setActionStatus(err?.message || 'Approval failed');
                          }
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
                        onClick={async () => {
                          try {
                            setActionStatus('Rejecting card...');
                            const updated = await decideApprovalCard(card.id, 'reject', {
                              decidedBy: 'workspace-user',
                            });
                            setSummary((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: {
                                      ...prev.status,
                                      approvalCards: {
                                        ...prev.status.approvalCards,
                                        pendingCount: Math.max(
                                          0,
                                          prev.status.approvalCards.pendingCount - 1,
                                        ),
                                        cards: prev.status.approvalCards.cards.map((item) =>
                                          item.id === card.id ? updated : item,
                                        ),
                                      },
                                    },
                                  }
                                : prev,
                            );
                            setActionStatus(`Rejected: ${card.title}`);
                          } catch (err: any) {
                            setActionStatus(err?.message || 'Rejection failed');
                          }
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section
          className="rounded-lg border p-4"
          style={{ borderColor: 'var(--c-border-1)', background: 'var(--c-bg-2)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Approval Policy
          </h3>
          <p className="mt-2 text-xs leading-5" style={{ color: 'var(--c-text-2)' }}>
            {summary.status.approvalPolicy.invariant}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.status.approvalPolicy.gatedSideEffects.map((item) => (
              <span
                key={item}
                className="rounded border px-2 py-1 text-[11px]"
                style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border-2)' }}
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-4" style={{ color: 'var(--c-text-3)' }}>
            {summary.status.approvalPolicy.observedContentRule}
          </p>
        </section>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string | number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: statusColor(ok) }} />
      <span className="font-medium" style={{ color: 'var(--c-text-1)' }}>
        {label}
      </span>
      <span className="ml-auto truncate" style={{ color: 'var(--c-text-3)' }}>
        {detail}
      </span>
    </div>
  );
}
