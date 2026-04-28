import runtimeContract from '../docs/runtime-contract.json';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ActionMode = 'read' | 'write' | 'mixed';
export type RuntimePhase = 'research' | 'planning' | 'implementation';
export type RuntimeHealth = 'ok' | 'missing' | 'error';

export interface RuntimePhaseTiming {
  phase: RuntimePhase;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

export interface RuntimeFlowDiagnostics {
  researchMs?: number;
  planningMs?: number;
  implementationMs?: number;
  firstTokenMs?: number;
  compareModelCount?: number;
  attachedFiles?: number;
  contextHealth?: Record<string, RuntimeHealth>;
}

export interface RuntimeBottleneck {
  stage: RuntimePhase | 'approval' | 'router';
  severity: RiskLevel;
  reason: string;
  signals: string[];
}

export interface RuntimeScope {
  requestId: string;
  tenantId: string;
  query: string;
  domains: string[];
  objects: string[];
  allowedTools: string[];
  blockedDomains: string[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  actionMode: ActionMode;
  reason: string[];
}

export interface RuntimeEvidenceItem {
  source: string;
  text: string;
}

export interface RuntimeContextPacket {
  request_id: string;
  tenant_id: string;
  query: string;
  domains: string[];
  objects: string[];
  allowed_tools: string[];
  blocked_domains: string[];
  risk_level: RiskLevel;
  requires_approval: boolean;
  action_mode: ActionMode;
  evidence: RuntimeEvidenceItem[];
  context_health?: Record<string, RuntimeHealth>;
}

interface RuntimeContractDoc {
  principles: Record<string, boolean>;
  pipeline: string[];
  context_packet: {
    allowed_tools: string[];
    blocked_domains: string[];
  };
  object_index: Record<
    string,
    {
      sources: string[];
      tools: string[];
    }
  >;
  high_risk_actions: {
    categories: string[];
    approval_flow: string[];
  };
}

const CONTRACT = runtimeContract as RuntimeContractDoc;

const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  crm: /\b(customer|account|lead|contact|client|crm)\b/i,
  pos: /\b(pos|point of sale|checkout|register|transaction|sale|receipt|payment)\b/i,
  accounting: /\b(accounting|invoice|journal|ledger|reconciliation|bookkeeping|debit|credit)\b/i,
  erp: /\b(erp|inventory|purchase order|po\b|fulfillment|supply chain)\b/i,
  scheduling: /\b(schedule|shift|rota|roster|calendar|availability|work hours)\b/i,
  payroll: /\b(payroll|wage|salary|pay period|timesheet|payout)\b/i,
  hr: /\b(hr|human resources|onboarding|offboarding|employee)\b/i,
  inventory: /\b(inventory|stock|stockout|sku|adjust inventory|adjust stock)\b/i,
  finance: /\b(refund|tax|chargeback|cash flow|expense|payment)\b/i,
};

const OBJECT_KEYWORDS: Record<string, RegExp> = {
  Customer: /\b(customer|account|contact|client)\b/i,
  Invoice: /\b(invoice|bill|statement|unpaid|due|balance due|open balance|reconciliation)\b/i,
  Payment: /\b(payment|paid|unpaid|refund|charge|captured)\b/i,
  Order: /\b(order|receipt|sale|transaction)\b/i,
  Product: /\b(product|item|sku|catalog)\b/i,
  Shift: /\b(shift|schedule|roster|timecard)\b/i,
  LedgerEntry: /\b(ledger|journal entry|debit|credit|reconciliation)\b/i,
};

const WRITE_KEYWORDS = /\b(create|update|edit|change|refund|issue|match|adjust|send|delete|approve|post|reconcile)\b/i;
const HIGH_RISK_KEYWORDS = /\b(refund|payroll|tax|inventory|schedule|shift|wage|salary|journal entry|payment match)\b/i;

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req_${Date.now()}`;
}

function inferDomains(query: string): string[] {
  return dedupe(
    Object.entries(DOMAIN_KEYWORDS)
      .filter(([, regex]) => regex.test(query))
      .map(([domain]) => domain),
  );
}

function inferObjects(query: string): string[] {
  return dedupe(
    Object.entries(OBJECT_KEYWORDS)
      .filter(([, regex]) => regex.test(query))
      .map(([object]) => object),
  );
}

function inferActionMode(query: string): ActionMode {
  const isWrite = WRITE_KEYWORDS.test(query);
  const isRead = /\b(why|what|show|find|search|lookup|compare|status|list|review|check)\b/i.test(query);
  if (isWrite && isRead) return 'mixed';
  if (isWrite) return 'write';
  return 'read';
}

function inferRiskLevel(query: string, actionMode: ActionMode, domains: string[], objects: string[]): RiskLevel {
  const highRiskMatch = HIGH_RISK_KEYWORDS.test(query);
  const financialScope =
    domains.includes('accounting') ||
    domains.includes('pos') ||
    domains.includes('finance') ||
    objects.some((object) => ['Payment', 'Invoice', 'LedgerEntry', 'Order'].includes(object));
  if (actionMode === 'read') {
    return highRiskMatch || financialScope ? 'medium' : 'low';
  }
  return highRiskMatch || financialScope ? 'high' : 'medium';
}

function inferBlockedDomains(domains: string[]): string[] {
  const defaults = new Set(
    CONTRACT.context_packet.blocked_domains.length > 0
      ? CONTRACT.context_packet.blocked_domains
      : ['payroll', 'hr', 'inventory_write', 'scheduling'],
  );
  for (const domain of domains) defaults.delete(domain);
  return [...defaults];
}

function inferAllowedTools(domains: string[], objects: string[]): string[] {
  const toolSet = new Set<string>(CONTRACT.context_packet.allowed_tools);

  for (const domain of domains) {
    for (const [objectName, spec] of Object.entries(CONTRACT.object_index)) {
      if (spec.sources.includes(domain)) {
        for (const tool of spec.tools) toolSet.add(tool);
      }
      if (objectName && objects.includes(objectName)) {
        for (const tool of spec.tools) toolSet.add(tool);
      }
    }
  }

  return [...toolSet];
}

export function buildRuntimeScope(query: string, tenantId: string): RuntimeScope {
  const domains = inferDomains(query);
  const objects = inferObjects(query);
  const actionMode = inferActionMode(query);
  const riskLevel = inferRiskLevel(query, actionMode, domains, objects);
  const blockedDomains = inferBlockedDomains(domains);
  const allowedTools = inferAllowedTools(domains, objects);
  const requiresApproval = riskLevel === 'high' && actionMode !== 'read';

  return {
    requestId: makeRequestId(),
    tenantId,
    query,
    domains,
    objects,
    allowedTools,
    blockedDomains,
    riskLevel,
    requiresApproval,
    actionMode,
    reason: [
      domains.length ? `domains=${domains.join(',')}` : 'domains=general',
      objects.length ? `objects=${objects.join(',')}` : 'objects=unspecified',
      `mode=${actionMode}`,
      `risk=${riskLevel}`,
    ],
  };
}

export function buildRuntimeContextPacket(
  scope: RuntimeScope,
  evidence: RuntimeEvidenceItem[],
): RuntimeContextPacket {
  return {
    request_id: scope.requestId,
    tenant_id: scope.tenantId,
    query: scope.query,
    domains: scope.domains,
    objects: scope.objects,
    allowed_tools: scope.allowedTools,
    blocked_domains: scope.blockedDomains,
    risk_level: scope.riskLevel,
    requires_approval: scope.requiresApproval,
    action_mode: scope.actionMode,
    evidence,
  };
}

export function buildRuntimeSystemPrompt(basePrompt: string, packet: RuntimeContextPacket): string {
  const block = [
    'Runtime contract:',
    `- Request id: ${packet.request_id}`,
    `- Tenant: ${packet.tenant_id}`,
    `- Domains: ${packet.domains.join(', ') || 'general'}`,
    `- Objects: ${packet.objects.join(', ') || 'unspecified'}`,
    `- Allowed tools: ${packet.allowed_tools.join(', ') || 'none'}`,
    `- Blocked domains: ${packet.blocked_domains.join(', ') || 'none'}`,
    `- Risk level: ${packet.risk_level}`,
    `- Requires approval: ${String(packet.requires_approval)}`,
    `- Action mode: ${packet.action_mode}`,
    'Rules:',
    '- Research: inspect evidence only; do not act yet.',
    '- Planning: decide scope, identify gaps, and choose only allowed tools.',
    '- Implementation: execute only approved work or provide the final answer.',
    '- Use evidence only for factual claims.',
    '- Do not invent fields or records.',
    '- If you need a tool outside the allowlist, stop and request escalation.',
    '- For write actions, follow draft -> preview -> user approval -> execute.',
    '- Surface likely bottlenecks when research, planning, or implementation is slow.',
    'Evidence packet:',
    JSON.stringify(packet),
  ].join('\n');

  return `${basePrompt}\n\n${block}`;
}

export function summarizeRuntimeScope(scope: RuntimeScope): string {
  const domains = scope.domains.length ? scope.domains.join(', ') : 'general';
  const objects = scope.objects.length ? scope.objects.join(', ') : 'unspecified';
  const risk = scope.riskLevel.toUpperCase();
  return `${domains} / ${objects} / ${risk}`;
}

function addBottleneck(
  items: RuntimeBottleneck[],
  stage: RuntimeBottleneck['stage'],
  severity: RiskLevel,
  reason: string,
  signals: string[],
): void {
  items.push({ stage, severity, reason, signals: dedupe(signals) });
}

export function predictRuntimeBottlenecks(
  scope: RuntimeScope,
  packet: RuntimeContextPacket,
  diagnostics: RuntimeFlowDiagnostics = {},
): RuntimeBottleneck[] {
  const bottlenecks: RuntimeBottleneck[] = [];
  const contextHealth = diagnostics.contextHealth ?? {};
  const researchErrors = Object.entries(contextHealth).filter(([, health]) => health !== 'ok');
  const broadScope = scope.domains.length >= 4 || scope.objects.length >= 4 || scope.actionMode === 'mixed';
  const highRiskFlow = scope.riskLevel === 'high' || scope.requiresApproval;
  const hasEvidence = packet.evidence.length > 0;

  if (researchErrors.length > 0) {
    addBottleneck(
      bottlenecks,
      'research',
      'high',
      'One or more source layers are unavailable or stale',
      researchErrors.map(([name, health]) => `${name}:${health}`),
    );
  }

  if (!hasEvidence) {
    addBottleneck(bottlenecks, 'research', 'medium', 'No citable evidence was loaded', [
      'empty_evidence_packet',
    ]);
  }

  if (diagnostics.researchMs != null && diagnostics.researchMs > 2500) {
    addBottleneck(bottlenecks, 'research', diagnostics.researchMs > 6000 ? 'high' : 'medium', 'Evidence retrieval is slow', [
      `research_ms=${diagnostics.researchMs}`,
    ]);
  }

  if (broadScope) {
    addBottleneck(bottlenecks, 'planning', 'medium', 'Wide scope can slow routing and disambiguation', [
      `domains=${scope.domains.length}`,
      `objects=${scope.objects.length}`,
      `mode=${scope.actionMode}`,
    ]);
  }

  if (scope.allowedTools.length > 8) {
    addBottleneck(bottlenecks, 'planning', 'medium', 'Tool menu is still broad for a single request', [
      `allowed_tools=${scope.allowedTools.length}`,
    ]);
  }

  if (diagnostics.planningMs != null && diagnostics.planningMs > 1200) {
    addBottleneck(
      bottlenecks,
      'planning',
      diagnostics.planningMs > 4000 ? 'high' : 'medium',
      'Plan assembly is slow',
      [`planning_ms=${diagnostics.planningMs}`],
    );
  }

  if (highRiskFlow) {
    addBottleneck(bottlenecks, 'approval', 'medium', 'Draft / preview / approval gates may stall execution', [
      `risk=${scope.riskLevel}`,
      `requires_approval=${String(scope.requiresApproval)}`,
    ]);
  }

  if (diagnostics.compareModelCount && diagnostics.compareModelCount > 2) {
    addBottleneck(bottlenecks, 'router', 'medium', 'Compare mode fans out to multiple models', [
      `compare_models=${diagnostics.compareModelCount}`,
    ]);
  }

  if (diagnostics.firstTokenMs != null && diagnostics.firstTokenMs > 4000) {
    addBottleneck(
      bottlenecks,
      'router',
      diagnostics.firstTokenMs > 12000 ? 'high' : 'medium',
      'Model turn-up or upstream streaming is slow',
      [`first_token_ms=${diagnostics.firstTokenMs}`],
    );
  }

  if (diagnostics.implementationMs != null && diagnostics.implementationMs > 15000) {
    addBottleneck(
      bottlenecks,
      'implementation',
      diagnostics.implementationMs > 30000 ? 'high' : 'medium',
      'Tool execution or finalization is slow',
      [`implementation_ms=${diagnostics.implementationMs}`],
    );
  }

  if (diagnostics.attachedFiles && diagnostics.attachedFiles > 0 && diagnostics.researchMs == null) {
    addBottleneck(
      bottlenecks,
      'research',
      'medium',
      'Attached files often increase retrieval and parsing latency',
      [`attached_files=${diagnostics.attachedFiles}`],
    );
  }

  if (scope.allowedTools.length === 0) {
    addBottleneck(
      bottlenecks,
      'planning',
      'high',
      'No tools are allowed for this request scope',
      ['empty_tool_allowlist'],
    );
  }

  return bottlenecks;
}

export function verifyRuntimeAnswer(answer: string, packet: RuntimeContextPacket): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (packet.allowed_tools.length === 0) issues.push('empty_tool_allowlist');
  if (packet.risk_level !== 'low' && packet.requires_approval && !answer.trim()) {
    issues.push('missing_answer_for_high_risk_request');
  }
  if (packet.evidence.length === 0) issues.push('no_evidence_loaded');
  return { ok: issues.length === 0, issues };
}

export function getRuntimeContractDoc() {
  return CONTRACT;
}
