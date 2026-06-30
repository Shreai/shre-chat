export interface AgentWorkspaceSession {
  id: string;
  title: string;
  agentId: string;
  type: string;
  status: string;
  messageCount: number;
  updatedAt: string;
  taskId: string | null;
  projectId: string | null;
}

export interface AgentWorkspaceCandidate {
  id: string;
  source: string;
  sessionId: string | null;
  agentId: string;
  proposedSkillPath: string;
  status: string;
  createdAt: string;
  approvalRequired: boolean;
  promotionPolicy: string;
  notes: string;
  evidence: {
    title: string | null;
    messageCount: number;
    ledgerExcerpt: string;
  };
}

export interface AgentWorkspaceApprovalCard {
  id: string;
  title: string;
  actionType: string;
  summary: string;
  requestedBy: string;
  sessionId: string | null;
  risk: 'low' | 'medium' | 'high' | 'critical' | string;
  status: 'pending' | 'approved' | 'rejected' | string;
  approvalRequired: boolean;
  executionStatus: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export interface AgentWorkspaceTask {
  id: string;
  title: string;
  status: 'implemented' | 'next' | string;
}

export interface AgentWorkspacePlanNode {
  id: string;
  taskType: string;
  executor: string;
  dependsOn: string[];
  inputs: unknown[];
  successCriteria: string;
  gate?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentWorkspaceCanonicalEvent {
  id: string;
  type: string;
  runId: string;
  nodeId: string | null;
  executor: string | null;
  text?: string;
  patch?: string;
  passed?: number;
  failed?: number;
  step?: number;
  metric?: number;
  success?: boolean;
  kind?: string;
  payload?: Record<string, unknown>;
  message?: string;
  createdAt: string;
}

export interface AgentWorkspaceTrainingJob {
  id: string;
  runId: string;
  nodeId: string;
  status: string;
  datasetRef: string;
  metricName: string;
  targetMetric: number;
  currentMetric: number | null;
  step: number;
  backend?: string | null;
  externalJobId?: string | null;
  backendDispatch?: {
    dispatched: boolean;
    status?: number;
    externalJobId?: string | null;
    error?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkspaceOrchestrationRun {
  id: string;
  title: string;
  objective: string;
  status: string;
  approvalRequired: boolean;
  nodes: AgentWorkspacePlanNode[];
  trainingJobs: AgentWorkspaceTrainingJob[];
  createdAt: string;
  updatedAt: string;
  eventCount?: number;
  events?: AgentWorkspaceCanonicalEvent[];
}

export interface AgentWorkspaceOrchestration {
  controlPlane: {
    owner: string;
    invariant: string;
    durableState: string;
    eventSpine: string;
  };
  executors: Record<string, { available: boolean; adapter: string }>;
  executorIsolation: {
    claude: {
      oauthTokenPresent: boolean;
      apiKeyEnvPresent: boolean;
      cliAuthAvailable: boolean;
      isolated: boolean;
    };
    codex: {
      authJsonPresent: boolean;
      apiKeyEnvPresent: boolean;
      cliAuthAvailable: boolean;
      isolated: boolean;
    };
    local: { externalCredentialRequired: boolean; isolated: boolean };
    risks: string[];
  };
  capabilityRegistry: Array<{
    taskType: string;
    executor: string;
    qualityScore: number;
    costClass: string;
    latencyClass: string;
    enabled: boolean;
  }>;
  canonicalEvents: string[];
  gates: string[];
  routingPolicy: string;
  readiness: {
    routingReady: boolean;
    missingExecutors: string[];
    openGaps: string[];
  };
  runStore: {
    kind: string;
    path: string;
    runs: AgentWorkspaceOrchestrationRun[];
  };
  executorEventBridge: {
    endpoint: string;
    accepts: string[];
    mapsTo: string[];
    forwarders?: string[];
  };
}

export interface AgentWorkspaceSummary {
  generatedAt: string;
  objective: string;
  architecture: Record<string, { service: string; port?: number; url?: string; role: string }>;
  status: {
    router: { ok: boolean; status: number; error?: string };
    terminal: { ok: boolean; status: number; error?: string };
    openclaw: {
      configured: boolean;
      configPath: string;
      gatewayPort: number;
      hasGatewayToken: boolean;
      agentCount: number;
      authProfileCount: number;
    };
    openclawRuntime: { ok: boolean; status: number; error?: string; hint?: string };
    cli: {
      root: string;
      count: number;
      sessions: AgentWorkspaceSession[];
    };
    hermes: {
      id: string;
      role: string;
      implementedAs: string;
      routingBoundary: string;
      systemPrompt: string[];
    };
    training: {
      service: string;
      mode: string;
      candidateCount: number;
      candidates: AgentWorkspaceCandidate[];
      nextActions: string[];
    };
    approvalPolicy: {
      invariant: string;
      gatedSideEffects: string[];
      observedContentRule: string;
    };
    approvalCards: {
      store: string;
      pendingCount: number;
      cards: AgentWorkspaceApprovalCard[];
    };
    orchestration: AgentWorkspaceOrchestration;
  };
  terminalAgents: Array<Record<string, unknown>>;
  tasks: AgentWorkspaceTask[];
}

export interface AgentWorkspaceResumePayload {
  session: AgentWorkspaceSession;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string | null }>;
  ledgerExcerpt: string;
  prompt: string;
}

export async function fetchAgentWorkspace(): Promise<AgentWorkspaceSummary> {
  const res = await fetch('/api/agent-workspace');
  if (!res.ok) {
    throw new Error(`Agent workspace HTTP ${res.status}`);
  }
  return (await res.json()) as AgentWorkspaceSummary;
}

export async function fetchCliResume(sessionId: string): Promise<AgentWorkspaceResumePayload> {
  const res = await fetch(
    `/api/agent-workspace/cli-sessions/${encodeURIComponent(sessionId)}/resume`,
  );
  if (!res.ok) {
    throw new Error(`CLI resume HTTP ${res.status}`);
  }
  return (await res.json()) as AgentWorkspaceResumePayload;
}

export async function createOrchestrationRun(
  input: {
    title?: string;
    objective?: string;
    nodes?: Partial<AgentWorkspacePlanNode>[];
  } = {},
): Promise<AgentWorkspaceOrchestrationRun> {
  const res = await fetch('/api/agent-workspace/orchestration-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Orchestration run HTTP ${res.status}`);
  }
  const data = (await res.json()) as { run: AgentWorkspaceOrchestrationRun };
  return data.run;
}

export async function appendOrchestrationEvent(
  runId: string,
  event: Partial<AgentWorkspaceCanonicalEvent>,
): Promise<AgentWorkspaceCanonicalEvent> {
  const res = await fetch(
    `/api/agent-workspace/orchestration-runs/${encodeURIComponent(runId)}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) {
    throw new Error(`Canonical event HTTP ${res.status}`);
  }
  const data = (await res.json()) as { event: AgentWorkspaceCanonicalEvent };
  return data.event;
}

export async function submitTrainingJob(
  runId: string,
  input: { nodeId?: string; datasetRef?: string; targetMetric?: number; metricName?: string } = {},
): Promise<AgentWorkspaceTrainingJob> {
  const res = await fetch(
    `/api/agent-workspace/orchestration-runs/${encodeURIComponent(runId)}/training-jobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    throw new Error(`Training job HTTP ${res.status}`);
  }
  const data = (await res.json()) as { job: AgentWorkspaceTrainingJob };
  return data.job;
}

export async function createTrainingCandidate(input: {
  sessionId?: string;
  proposedSkillPath?: string;
  notes?: string;
}): Promise<AgentWorkspaceCandidate> {
  const res = await fetch('/api/agent-workspace/training-candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'workspace', ...input }),
  });
  if (!res.ok) {
    throw new Error(`Training candidate HTTP ${res.status}`);
  }
  const data = (await res.json()) as { candidate: AgentWorkspaceCandidate };
  return data.candidate;
}

export async function createApprovalCard(input: {
  title?: string;
  actionType?: string;
  summary?: string;
  requestedBy?: string;
  sessionId?: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  payload?: Record<string, unknown>;
}): Promise<AgentWorkspaceApprovalCard> {
  const res = await fetch('/api/agent-workspace/approval-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Approval card HTTP ${res.status}`);
  }
  const data = (await res.json()) as { card: AgentWorkspaceApprovalCard };
  return data.card;
}

export async function decideApprovalCard(
  id: string,
  decision: 'approve' | 'reject',
  input: { note?: string; decidedBy?: string } = {},
): Promise<AgentWorkspaceApprovalCard> {
  const res = await fetch(
    `/api/agent-workspace/approval-cards/${encodeURIComponent(id)}/${decision}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    throw new Error(`Approval decision HTTP ${res.status}`);
  }
  const data = (await res.json()) as { card: AgentWorkspaceApprovalCard };
  return data.card;
}
