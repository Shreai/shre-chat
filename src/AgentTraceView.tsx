import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FleetAssignment {
  task_id: string;
  agent: string;
  model: string;
  phase: string;
  subPhase: string | null;
  progress: number;
  progressNote?: string;
  quality?: number;
  retryCount: number;
  title: string;
  traceId?: string;
  elapsedMs: number;
  startedAt: number;
}

interface TraceSpan {
  name: string;
  durationMs: number;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
}

interface TraceRecord {
  traceId: string;
  service: string;
  totalMs: number;
  status: 'ok' | 'error' | 'partial';
  spans: TraceSpan[];
  agentId?: string;
  startedAt: string;
}

interface RoutingDecision {
  timestamp: string;
  model: string;
  reason: string;
  confidence: number;
  latencyMs: number;
  agentId?: string;
}

interface AgentMetrics {
  total_requests: number;
  total_cost_cents: number;
  models_used: string[];
  load_pct: number;
  budget_pct: { daily: number; weekly: number };
}

interface PulseEvent {
  type: string;
  ts: string;
  data: Record<string, unknown>;
}

interface AgentSummary {
  id: string;
  status: 'active' | 'queued' | 'idle';
  currentTask?: string;
  phase?: string;
  elapsedMs?: number;
  queuedTasks: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PIPELINE_PHASES = [
  'request_received',
  'routing',
  'model_selection',
  'research',
  'planning',
  'implementation',
  'testing',
  'review',
  'commit',
  'delivery',
  'scoring',
  'done',
] as const;

const PHASE_LABELS: Record<string, string> = {
  request_received: 'Received',
  routing: 'Routing',
  model_selection: 'Model',
  research: 'Research',
  planning: 'Planning',
  implementation: 'Impl',
  testing: 'Testing',
  review: 'Review',
  commit: 'Commit',
  delivery: 'Delivery',
  scoring: 'Scoring',
  done: 'Done',
};

const EVENT_CAP = 200;
const STATUS_POLL_MS = 5_000;
const TRACES_POLL_MS = 10_000;

const PULSE_ICONS: Record<string, string> = {
  task_assigned: '\u25B6',
  task_completed: '\u2713',
  task_failed: '\u2717',
  file_diff: '\u2206',
  budget_warning: '$',
  wave_progress: '\u2248',
  error: '!',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

async function safeFetch<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { data: null, error: `HTTP ${r.status}` };
    const data = await r.json();
    return { data, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

function phaseIndex(phase: string): number {
  const idx = PIPELINE_PHASES.indexOf(phase as typeof PIPELINE_PHASES[number]);
  return idx >= 0 ? idx : -1;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: 'active' | 'queued' | 'idle' }) {
  const color = status === 'active' ? '#22c55e' : status === 'queued' ? '#eab308' : '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: status === 'active' ? `0 0 6px ${color}` : 'none',
        animation: status === 'active' ? 'agentPulse 2s ease-in-out infinite' : 'none',
      }}
    />
  );
}

function PhaseBadge({ phase }: { phase?: string }) {
  if (!phase) return null;
  const label = PHASE_LABELS[phase] || phase;
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 4,
        background: 'var(--c-accent)',
        color: '#fff',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ---------- Traceroute Pipeline ---------- */

function TraceroutePipeline({
  currentPhase,
  spans,
}: {
  currentPhase: string;
  spans: TraceSpan[];
}) {
  const activeIdx = phaseIndex(currentPhase);
  const spanMap = useMemo(() => {
    const m = new Map<string, TraceSpan>();
    for (const s of spans) m.set(s.name, s);
    return m;
  }, [spans]);

  return (
    <div style={{ overflowX: 'auto', padding: '16px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          minWidth: 'max-content',
        }}
      >
        {PIPELINE_PHASES.map((phase, i) => {
          const span = spanMap.get(phase);
          const isCurrent = i === activeIdx;
          const isCompleted = i < activeIdx || (span?.status === 'ok' && !isCurrent);
          const isFailed = span?.status === 'error';
          const isPending = !isCompleted && !isCurrent && !isFailed;

          let nodeColor = 'var(--c-border-2)';
          let nodeBg = 'transparent';
          let nodeIcon = '';
          if (isCompleted) {
            nodeColor = '#22c55e';
            nodeBg = 'rgba(34,197,94,0.15)';
            nodeIcon = '\u2713';
          } else if (isCurrent) {
            nodeColor = 'var(--c-accent)';
            nodeBg = 'rgba(99,102,241,0.15)';
            nodeIcon = '\u25CF';
          } else if (isFailed) {
            nodeColor = '#ef4444';
            nodeBg = 'rgba(239,68,68,0.15)';
            nodeIcon = '\u2717';
          }

          const isSubPhase = i >= 3 && i <= 9;

          return (
            <div key={phase} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Connector line (before node, except first) */}
              {i > 0 && (
                <div
                  style={{
                    width: isSubPhase ? 20 : 28,
                    height: 2,
                    background: isCompleted
                      ? '#22c55e'
                      : isCurrent
                        ? `linear-gradient(90deg, #22c55e, var(--c-accent))`
                        : 'var(--c-border-2)',
                    transition: 'background 0.3s',
                  }}
                />
              )}

              {/* Node */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: isSubPhase ? 56 : 64,
                }}
              >
                <div
                  style={{
                    width: isSubPhase ? 28 : 34,
                    height: isSubPhase ? 28 : 34,
                    borderRadius: '50%',
                    border: `2px solid ${nodeColor}`,
                    background: nodeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isCompleted || isFailed ? 14 : 10,
                    color: nodeColor,
                    fontWeight: 700,
                    transition: 'all 0.3s',
                    animation: isCurrent ? 'agentPulse 2s ease-in-out infinite' : 'none',
                    boxShadow: isCurrent ? `0 0 12px ${nodeColor}` : 'none',
                    position: 'relative',
                  }}
                >
                  {isPending ? '' : nodeIcon}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: isCurrent ? 'var(--c-text-1)' : isPending ? 'var(--c-text-4)' : 'var(--c-text-3)',
                    fontWeight: isCurrent ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {PHASE_LABELS[phase]}
                </span>
                {span && span.durationMs > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--c-text-4)' }}>
                    {fmtMs(span.durationMs)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Live Elapsed Timer ---------- */

function LiveElapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt]);

  return <span>{fmtMs(now - startedAt)}</span>;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AgentTraceView() {
  /* ----- state ----- */
  const [assignments, setAssignments] = useState<FleetAssignment[]>([]);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [routing, setRouting] = useState<RoutingDecision[]>([]);
  const [metrics, setMetrics] = useState<Record<string, AgentMetrics>>({});
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const eventsRef = useRef<PulseEvent[]>([]);
  const eventContainerRef = useRef<HTMLDivElement>(null);

  /* ----- derived agent list ----- */
  const agents: AgentSummary[] = useMemo(() => {
    const map = new Map<string, AgentSummary>();

    for (const a of assignments) {
      const existing = map.get(a.agent);
      if (!existing) {
        map.set(a.agent, {
          id: a.agent,
          status: a.phase === 'queued' ? 'queued' : 'active',
          currentTask: a.title,
          phase: a.phase,
          elapsedMs: a.elapsedMs,
          queuedTasks: a.phase === 'queued' ? 1 : 0,
        });
      } else {
        if (a.phase === 'queued') {
          existing.queuedTasks += 1;
          if (existing.status === 'idle') existing.status = 'queued';
        } else {
          existing.status = 'active';
          existing.currentTask = a.title;
          existing.phase = a.phase;
          existing.elapsedMs = a.elapsedMs;
        }
      }
    }

    // Add agents from metrics that have no current assignments
    for (const agentId of Object.keys(metrics)) {
      if (!map.has(agentId)) {
        map.set(agentId, {
          id: agentId,
          status: 'idle',
          queuedTasks: 0,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const order = { active: 0, queued: 1, idle: 2 };
      return order[a.status] - order[b.status] || a.id.localeCompare(b.id);
    });
  }, [assignments, metrics]);

  const summary = useMemo(() => {
    let active = 0, queued = 0, idle = 0;
    for (const a of agents) {
      if (a.status === 'active') active++;
      else if (a.status === 'queued') queued++;
      else idle++;
    }
    return { active, queued, idle };
  }, [agents]);

  /* ----- selected agent data ----- */
  const selectedAssignments = useMemo(
    () =>
      selectedAgent
        ? assignments.filter((a) => a.agent === selectedAgent)
        : assignments,
    [assignments, selectedAgent],
  );

  const selectedTraces = useMemo(
    () =>
      selectedAgent
        ? traces.filter((t) => t.agentId === selectedAgent)
        : traces,
    [traces, selectedAgent],
  );

  const selectedRouting = useMemo(
    () =>
      selectedAgent
        ? routing.filter((r) => r.agentId === selectedAgent)
        : routing,
    [routing, selectedAgent],
  );

  const selectedEvents = useMemo(
    () =>
      selectedAgent
        ? events.filter(
            (e) => (e.data?.agent as string) === selectedAgent || (e.data?.agentId as string) === selectedAgent,
          )
        : events,
    [events, selectedAgent],
  );

  const selectedMetrics = selectedAgent ? metrics[selectedAgent] : null;

  const activeAssignment = useMemo(
    () =>
      selectedAgent
        ? assignments.find((a) => a.agent === selectedAgent && a.phase !== 'queued')
        : null,
    [assignments, selectedAgent],
  );

  const activeTraceSpans = useMemo(() => {
    if (!activeAssignment?.traceId) return [];
    const tr = traces.find((t) => t.traceId === activeAssignment.traceId);
    return tr?.spans || [];
  }, [activeAssignment, traces]);

  /* ----- fetch callbacks ----- */
  const fetchStatus = useCallback(async () => {
    const { data, error } = await safeFetch<{
      active_assignments: FleetAssignment[];
    }>('/api/agent-trace/status');
    if (error) {
      setStatusError(error);
    } else if (data) {
      setStatusError(null);
      setAssignments(data.active_assignments || []);
    }
  }, []);

  const fetchTraces = useCallback(async () => {
    const { data, error } = await safeFetch<{ traces: TraceRecord[] }>('/api/agent-trace/traces');
    if (error) {
      setTraceError(error);
    } else if (data) {
      setTraceError(null);
      setTraces(data.traces || []);
    }
  }, []);

  const fetchRouting = useCallback(async () => {
    const { data } = await safeFetch<{ decisions: RoutingDecision[] }>('/api/agent-trace/routing');
    if (data) setRouting(data.decisions || []);
  }, []);

  const fetchMetrics = useCallback(async () => {
    const { data } = await safeFetch<Record<string, AgentMetrics>>('/api/agent-trace/metrics');
    if (data) setMetrics(data);
  }, []);

  /* ----- polling ----- */
  useEffect(() => {
    fetchStatus();
    fetchTraces();
    fetchRouting();
    fetchMetrics();

    const si = setInterval(fetchStatus, STATUS_POLL_MS);
    const ti = setInterval(() => {
      fetchTraces();
      fetchRouting();
      fetchMetrics();
    }, TRACES_POLL_MS);

    return () => {
      clearInterval(si);
      clearInterval(ti);
    };
  }, [fetchStatus, fetchTraces, fetchRouting, fetchMetrics]);

  /* ----- SSE pulse stream ----- */
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/agent-trace/pulse');

      es.onmessage = (e) => {
        try {
          const evt: PulseEvent = JSON.parse(e.data);
          eventsRef.current = [evt, ...eventsRef.current].slice(0, EVENT_CAP);
          setEvents([...eventsRef.current]);
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        es?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  /* ----- auto-scroll events ----- */
  useEffect(() => {
    if (eventContainerRef.current) {
      eventContainerRef.current.scrollTop = 0;
    }
  }, [events.length]);

  /* ----- error expand toggle ----- */
  const toggleError = useCallback((id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ----- failed events for error log ----- */
  const errorEvents = useMemo(
    () => selectedEvents.filter((e) => e.type === 'task_failed' || e.type === 'error'),
    [selectedEvents],
  );

  /* ----- queued tasks for selected agent ----- */
  const queuedTasks = useMemo(
    () =>
      selectedAgent
        ? assignments.filter((a) => a.agent === selectedAgent && a.phase === 'queued')
        : [],
    [assignments, selectedAgent],
  );

  const inProgressTasks = useMemo(
    () =>
      selectedAgent
        ? assignments.filter((a) => a.agent === selectedAgent && a.phase !== 'queued')
        : [],
    [assignments, selectedAgent],
  );

  /* ----- stats for selected agent ----- */
  const agentStats = useMemo(() => {
    const agentTraces = selectedTraces.filter((t) => t.status !== 'partial');
    const completed = agentTraces.length;
    const succeeded = agentTraces.filter((t) => t.status === 'ok').length;
    const avgMs =
      completed > 0 ? agentTraces.reduce((s, t) => s + t.totalMs, 0) / completed : 0;
    const successRate = completed > 0 ? (succeeded / completed) * 100 : 0;
    return { completed, avgMs, successRate };
  }, [selectedTraces]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--c-bg-1)',
        color: 'var(--c-text-1)',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 767px) {
          .trace-layout { flex-direction: column !important; }
          .trace-left-panel {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            border-right: none !important;
            border-bottom: 1px solid var(--c-border-1) !important;
            max-height: 72px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
          }
          .trace-agent-list {
            flex-direction: row !important;
            overflow-x: auto !important;
            padding: 8px !important;
            gap: 6px !important;
          }
          .trace-agent-row {
            flex-shrink: 0 !important;
            min-width: max-content !important;
            padding: 4px 12px !important;
            border-radius: 20px !important;
          }
          .trace-summary-bar { display: none !important; }
        }
      `}</style>

      {/* ============== LEFT PANEL — Agent List ============== */}
      <div
        className="trace-left-panel"
        style={{
          width: 250,
          minWidth: 250,
          maxWidth: 250,
          borderRight: '1px solid var(--c-border-1)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--c-bg-2)',
          overflow: 'hidden',
        }}
      >
        {/* "All" option */}
        <button
          onClick={() => setSelectedAgent(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            width: '100%',
            border: 'none',
            borderBottom: '1px solid var(--c-border-1)',
            background: selectedAgent === null ? 'var(--c-bg-glass)' : 'transparent',
            color: selectedAgent === null ? 'var(--c-text-1)' : 'var(--c-text-2)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--c-accent)',
            }}
          />
          All Agents
        </button>

        {/* Scrollable agent list */}
        <div
          className="trace-agent-list"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {statusError && agents.length === 0 && (
            <div style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>
              Failed to load agents: {statusError}
            </div>
          )}

          {agents.map((agent) => (
            <button
              key={agent.id}
              className="trace-agent-row"
              onClick={() => setSelectedAgent(agent.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                width: '100%',
                border: 'none',
                background:
                  selectedAgent === agent.id ? 'var(--c-bg-glass)' : 'transparent',
                color: 'var(--c-text-1)',
                cursor: 'pointer',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              <StatusDot status={agent.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: selectedAgent === agent.id ? 'var(--c-text-1)' : 'var(--c-text-2)',
                  }}
                >
                  {agent.id}
                </div>
                {agent.currentTask && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--c-text-4)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    {agent.currentTask}
                  </div>
                )}
              </div>
              {agent.phase && <PhaseBadge phase={agent.phase} />}
              {agent.queuedTasks > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    background: '#eab308',
                    color: '#000',
                    borderRadius: 8,
                    padding: '0 5px',
                    fontWeight: 700,
                    lineHeight: '16px',
                  }}
                >
                  {agent.queuedTasks}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        <div
          className="trace-summary-bar"
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--c-border-1)',
            fontSize: 11,
            color: 'var(--c-text-3)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#22c55e' }}>{summary.active} active</span>
          <span style={{ color: '#eab308' }}>{summary.queued} queued</span>
          <span>{summary.idle} idle</span>
        </div>
      </div>

      {/* ============== RIGHT PANEL — Trace Detail ============== */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--c-border-1)',
            background: 'var(--c-bg-glass)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {selectedAgent ? (
            <>
              <StatusDot
                status={
                  agents.find((a) => a.id === selectedAgent)?.status || 'idle'
                }
              />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedAgent}</span>
              {activeAssignment && (
                <>
                  <PhaseBadge phase={activeAssignment.phase} />
                  <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    <LiveElapsed startedAt={activeAssignment.startedAt} />
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--c-text-2)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activeAssignment.title}
                  </span>
                </>
              )}
              {!activeAssignment && (
                <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>Idle</span>
              )}
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Fleet Overview</span>
              <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {assignments.length} active assignment{assignments.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ---- Traceroute Pipeline (agent selected only) ---- */}
          {selectedAgent && activeAssignment && (
            <div
              style={{
                background: 'var(--c-bg-2)',
                borderRadius: 10,
                border: '1px solid var(--c-border-1)',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Execution Pipeline
              </div>
              <TraceroutePipeline
                currentPhase={activeAssignment.subPhase || activeAssignment.phase}
                spans={activeTraceSpans}
              />
              {activeAssignment.progressNote && (
                <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 4 }}>
                  {activeAssignment.progressNote}
                </div>
              )}
            </div>
          )}

          {/* ---- Stats Row ---- */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {selectedAgent ? (
              <>
                <StatBox label="Tasks Today" value={String(agentStats.completed)} />
                <StatBox label="Avg Time" value={fmtMs(agentStats.avgMs)} />
                <StatBox
                  label="Success Rate"
                  value={`${agentStats.successRate.toFixed(0)}%`}
                  accent={agentStats.successRate >= 90 ? '#22c55e' : agentStats.successRate >= 70 ? '#eab308' : '#ef4444'}
                />
                {activeAssignment?.quality != null && (
                  <StatBox
                    label="Quality"
                    value={activeAssignment.quality.toFixed(1)}
                    accent={activeAssignment.quality >= 3.5 ? '#22c55e' : '#eab308'}
                  />
                )}
                {selectedMetrics && (
                  <>
                    <StatBox
                      label="Cost"
                      value={`$${(selectedMetrics.total_cost_cents / 100).toFixed(2)}`}
                    />
                    <StatBox
                      label="Load"
                      value={`${selectedMetrics.load_pct.toFixed(0)}%`}
                      accent={selectedMetrics.load_pct > 80 ? '#ef4444' : undefined}
                    />
                    <StatBox
                      label="Budget (D/W)"
                      value={`${selectedMetrics.budget_pct.daily.toFixed(0)}% / ${selectedMetrics.budget_pct.weekly.toFixed(0)}%`}
                      accent={
                        selectedMetrics.budget_pct.daily > 90 || selectedMetrics.budget_pct.weekly > 90
                          ? '#ef4444'
                          : undefined
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <StatBox label="Active" value={String(summary.active)} accent="#22c55e" />
                <StatBox label="Queued" value={String(summary.queued)} accent="#eab308" />
                <StatBox label="Total Agents" value={String(agents.length)} />
                <StatBox label="Assignments" value={String(assignments.length)} />
              </>
            )}
          </div>

          {/* ---- Task Queue (agent selected) ---- */}
          {selectedAgent && (inProgressTasks.length > 0 || queuedTasks.length > 0) && (
            <div
              style={{
                background: 'var(--c-bg-2)',
                borderRadius: 10,
                border: '1px solid var(--c-border-1)',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Task Queue
              </div>
              {inProgressTasks.map((t) => (
                <div
                  key={t.task_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid var(--c-border-2)',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: '#8b5cf6',
                      color: '#fff',
                      fontWeight: 600,
                    }}
                  >
                    in_progress
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }}>
                    {t.title}
                  </span>
                  {t.progress > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{t.progress}%</span>
                  )}
                </div>
              ))}
              {queuedTasks.map((t) => (
                <div
                  key={t.task_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid var(--c-border-2)',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: '#eab308',
                      color: '#000',
                      fontWeight: 600,
                    }}
                  >
                    queued
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }}>
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ---- Live Events Feed ---- */}
          <div
            style={{
              background: 'var(--c-bg-2)',
              borderRadius: 10,
              border: '1px solid var(--c-border-1)',
              padding: '12px 16px',
              maxHeight: 280,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live Events {selectedEvents.length > 0 && <span style={{ fontWeight: 400 }}>({selectedEvents.length})</span>}
            </div>
            <div ref={eventContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {selectedEvents.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--c-text-4)', padding: '20px 0', textAlign: 'center' }}>
                  Waiting for events...
                </div>
              )}
              {selectedEvents.map((evt, i) => (
                <div
                  key={`${evt.ts}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '4px 0',
                    borderBottom: '1px solid var(--c-border-2)',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color:
                        evt.type === 'task_failed' || evt.type === 'error'
                          ? '#ef4444'
                          : evt.type === 'task_completed'
                            ? '#22c55e'
                            : evt.type === 'budget_warning'
                              ? '#eab308'
                              : 'var(--c-text-3)',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {PULSE_ICONS[evt.type] || '\u2022'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--c-text-4)', flexShrink: 0, minWidth: 60 }}>
                    {fmtTime(evt.ts)}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '0 4px',
                      borderRadius: 3,
                      background: 'var(--c-bg-1)',
                      color: 'var(--c-text-3)',
                      flexShrink: 0,
                    }}
                  >
                    {evt.type}
                  </span>
                  {typeof evt.data?.agent === 'string' && (
                    <span style={{ fontSize: 10, color: 'var(--c-accent)', flexShrink: 0 }}>
                      {evt.data.agent}
                    </span>
                  )}
                  <span
                    style={{
                      flex: 1,
                      color: 'var(--c-text-2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(evt.data?.title as string) || (evt.data?.message as string) || ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Error Log ---- */}
          {errorEvents.length > 0 && (
            <div
              style={{
                background: 'var(--c-bg-2)',
                borderRadius: 10,
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Errors ({errorEvents.length})
              </div>
              {errorEvents.slice(0, 20).map((evt, i) => {
                const key = `${evt.ts}-${i}`;
                const expanded = expandedErrors.has(key);
                return (
                  <div key={key} style={{ borderBottom: '1px solid var(--c-border-2)', padding: '6px 0' }}>
                    <button
                      onClick={() => toggleError(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        color: 'var(--c-text-2)',
                        cursor: 'pointer',
                        fontSize: 12,
                        textAlign: 'left',
                        padding: 0,
                      }}
                    >
                      <span style={{ color: '#ef4444', flexShrink: 0 }}>{expanded ? '\u25BC' : '\u25B6'}</span>
                      <span style={{ fontSize: 10, color: 'var(--c-text-4)', flexShrink: 0 }}>{fmtTime(evt.ts)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(evt.data?.title as string) || (evt.data?.error as string) || evt.type}
                      </span>
                    </button>
                    {expanded && (
                      <pre
                        style={{
                          margin: '6px 0 0 24px',
                          fontSize: 11,
                          color: 'var(--c-text-3)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          background: 'var(--c-bg-1)',
                          padding: 8,
                          borderRadius: 6,
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(evt.data, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Recent Routing Decisions ---- */}
          {selectedRouting.length > 0 && (
            <div
              style={{
                background: 'var(--c-bg-2)',
                borderRadius: 10,
                border: '1px solid var(--c-border-1)',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recent Routing
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: '4px 12px', fontSize: 12, alignItems: 'center' }}>
                {selectedRouting.slice(0, 10).map((r, i) => (
                  <div key={i} style={{ display: 'contents' }}>
                    <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{fmtTime(r.timestamp)}</span>
                    <span style={{ color: 'var(--c-accent)', fontWeight: 600, fontSize: 11 }}>{r.model}</span>
                    <span style={{ color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
                    <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{r.latencyMs}ms</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: r.confidence >= 0.8 ? '#22c55e' : r.confidence >= 0.5 ? '#eab308' : '#ef4444',
                      }}
                    >
                      {(r.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Status/trace errors ---- */}
          {(statusError || traceError) && (
            <div
              style={{
                fontSize: 12,
                color: '#ef4444',
                background: 'rgba(239,68,68,0.08)',
                borderRadius: 8,
                padding: '8px 12px',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {statusError && <div>Status fetch error: {statusError}</div>}
              {traceError && <div>Trace fetch error: {traceError}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatBox                                                            */
/* ------------------------------------------------------------------ */

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--c-bg-2)',
        borderRadius: 8,
        border: '1px solid var(--c-border-1)',
        padding: '8px 14px',
        minWidth: 80,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--c-text-4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent || 'var(--c-text-1)' }}>
        {value}
      </div>
    </div>
  );
}
