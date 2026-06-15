import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  createCollectBodyHelper,
  createJsonHelper,
  createMockLogger,
  createMockReq,
  createMockRes,
  getJsonResponse,
} from './route-test-helpers';

vi.mock('shre-sdk', () => ({
  serviceUrl: (name: string) =>
    name === 'shre-router' ? 'http://router.test' : `http://${name}.test`,
}));

import {
  buildAgentWorkspaceSummary,
  registerAgentWorkspaceRoutes,
} from '../../routes/agent-workspace.js';

describe('agent workspace route', () => {
  it('summarizes OpenClaw config and CLI ledgers without exposing secrets', async () => {
    const root = join(tmpdir(), `agent-workspace-${Date.now()}`);
    mkdirSync(join(root, 'agents', 'hermes', 'agent'), { recursive: true });
    mkdirSync(join(root, 'sessions', 'cli', 'cli-1'), { recursive: true });
    writeFileSync(
      join(root, 'openclaw.json'),
      JSON.stringify({ gateway: { port: 18789, auth: { token: 'secret-token' } } }),
    );
    writeFileSync(
      join(root, 'agents', 'hermes', 'agent', 'auth-profiles.json'),
      JSON.stringify({ profiles: { anthropic: { key: 'sk-secret' } } }),
    );
    writeFileSync(
      join(root, 'sessions', 'cli', 'cli-1', 'session.json'),
      JSON.stringify({
        id: 'cli-1',
        title: 'CLI migration test',
        agentId: 'hermes',
        type: 'chat',
        status: 'active',
        messageCount: 4,
        updatedAt: '2026-06-14T00:00:00.000Z',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/agents')) {
          return new Response(JSON.stringify([{ name: 'codex', available: true }]), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const summary = await buildAgentWorkspaceSummary({
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
    });

    expect(summary.status.openclaw.configured).toBe(true);
    expect(summary.status.openclaw.hasGatewayToken).toBe(true);
    expect(summary.status.openclaw.authProfileCount).toBe(1);
    expect(summary.status.cli.sessions[0].id).toBe('cli-1');
    expect(
      summary.status.orchestration.capabilityRegistry.some(
        (entry: any) => entry.executor === 'codex',
      ),
    ).toBe(true);
    expect(summary.status.orchestration.canonicalEvents).toContain('gate');
    expect(summary.status.orchestration.gates).toContain('approve_train');
    expect(JSON.stringify(summary)).not.toContain('secret-token');
    expect(JSON.stringify(summary)).not.toContain('sk-secret');
  });

  it('surfaces multi-model executor readiness and credential isolation without secret values', async () => {
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'claude-secret-token');
    vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-secret-key');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('CODEX_API_KEY', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/agents')) {
          return new Response(
            JSON.stringify([
              { name: 'claude', available: true },
              { name: 'codex', available: true },
              { name: 'ollama', available: true },
            ]),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const root = join(tmpdir(), `agent-workspace-orchestration-${Date.now()}`);
    const summary = await buildAgentWorkspaceSummary({
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      candidatePath: join(root, 'candidates.jsonl'),
    });

    expect(summary.status.orchestration.executors.claude.available).toBe(true);
    expect(summary.status.orchestration.executors.codex.available).toBe(true);
    expect(summary.status.orchestration.executors.local.available).toBe(true);
    expect(summary.status.orchestration.executorIsolation.claude.isolated).toBe(false);
    expect(summary.status.orchestration.executorIsolation.risks[0]).toContain('Claude OAuth');
    expect(JSON.stringify(summary)).not.toContain('claude-secret-token');
    expect(JSON.stringify(summary)).not.toContain('anthropic-secret-key');
  });

  it('handles GET /api/agent-workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const handle = registerAgentWorkspaceRoutes({
      log: createMockLogger() as any,
      openclawHome: join(tmpdir(), `agent-workspace-empty-${Date.now()}`),
      terminalUrl: 'http://terminal.test',
    });
    const req = createMockReq({ method: 'GET', url: '/api/agent-workspace' });
    const res = createMockRes();

    await handle(req, res, new URL('/api/agent-workspace', 'http://localhost'), {
      json: createJsonHelper(),
    });

    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(200);
    expect(body.objective).toContain('CLI-first users');
    expect(body.tasks.some((task: any) => task.id === 'workspace-api')).toBe(true);
  });

  it('persists orchestration runs, canonical events, and training job lifecycle', async () => {
    const root = join(tmpdir(), `agent-workspace-runs-${Date.now()}`);
    const orchestrationStatePath = join(root, 'orchestration-runs.json');
    const handle = registerAgentWorkspaceRoutes({
      log: createMockLogger() as any,
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      orchestrationStatePath,
    });

    const createRunReq = createMockReq({
      method: 'POST',
      url: '/api/agent-workspace/orchestration-runs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Run test', objective: 'Persist the DAG.' }),
    });
    const createRunRes = createMockRes();
    await handle(
      createRunReq,
      createRunRes,
      new URL('/api/agent-workspace/orchestration-runs', 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );

    const created = await getJsonResponse(createRunRes._promise);
    expect(created.status).toBe(201);
    expect(created.body.run.nodes.some((node: any) => node.gate === 'approve_train')).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain('secret');

    const runId = created.body.run.id;
    const eventReq = createMockReq({
      method: 'POST',
      url: `/api/agent-workspace/orchestration-runs/${runId}/events`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'node_started',
        nodeId: 'implement',
        executor: 'codex',
        text: 'Starting implementation.',
      }),
    });
    const eventRes = createMockRes();
    await handle(
      eventReq,
      eventRes,
      new URL(`/api/agent-workspace/orchestration-runs/${runId}/events`, 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );
    const event = await getJsonResponse(eventRes._promise);
    expect(event.status).toBe(201);
    expect(event.body.event.type).toBe('node_started');

    const bridgeReq = createMockReq({
      method: 'POST',
      url: `/api/agent-workspace/orchestration-runs/${runId}/executor-events`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        executor: 'codex',
        nodeId: 'implement',
        events: [
          { type: 'delta', text: 'Editing files.' },
          { type: 'done', success: true },
        ],
      }),
    });
    const bridgeRes = createMockRes();
    await handle(
      bridgeReq,
      bridgeRes,
      new URL(
        `/api/agent-workspace/orchestration-runs/${runId}/executor-events`,
        'http://localhost',
      ),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );
    const bridged = await getJsonResponse(bridgeRes._promise);
    expect(bridged.status).toBe(201);
    expect(bridged.body.events.map((item: any) => item.type)).toEqual(['message', 'node_done']);

    const trainingReq = createMockReq({
      method: 'POST',
      url: `/api/agent-workspace/orchestration-runs/${runId}/training-jobs`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: 'train', datasetRef: 'dataset://demo', targetMetric: 0.9 }),
    });
    const trainingRes = createMockRes();
    await handle(
      trainingReq,
      trainingRes,
      new URL(`/api/agent-workspace/orchestration-runs/${runId}/training-jobs`, 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );
    const training = await getJsonResponse(trainingRes._promise);
    expect(training.status).toBe(201);
    expect(training.body.job.status).toBe('queued');

    const transitionReq = createMockReq({
      method: 'POST',
      url: `/api/agent-workspace/orchestration-runs/${runId}/training-jobs/${training.body.job.id}/transition`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'succeeded', step: 12, metric: 0.93 }),
    });
    const transitionRes = createMockRes();
    await handle(
      transitionReq,
      transitionRes,
      new URL(
        `/api/agent-workspace/orchestration-runs/${runId}/training-jobs/${training.body.job.id}/transition`,
        'http://localhost',
      ),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );
    const transition = await getJsonResponse(transitionRes._promise);
    expect(transition.status).toBe(200);
    expect(transition.body.job.currentMetric).toBe(0.93);

    const getRunReq = createMockReq({
      method: 'GET',
      url: `/api/agent-workspace/orchestration-runs/${runId}`,
    });
    const getRunRes = createMockRes();
    await handle(
      getRunReq,
      getRunRes,
      new URL(`/api/agent-workspace/orchestration-runs/${runId}`, 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );
    const fetched = await getJsonResponse(getRunRes._promise);
    expect(fetched.status).toBe(200);
    expect(fetched.body.run.events.map((item: any) => item.type)).toContain('train_progress');
    expect(fetched.body.run.events.map((item: any) => item.type)).toContain('node_done');
  });

  it('reports OpenClaw runtime as not_configured when openclaw.json is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const root = join(tmpdir(), `agent-workspace-no-openclaw-config-${Date.now()}`);
    const summary = await buildAgentWorkspaceSummary({
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      candidatePath: join(root, 'candidates.jsonl'),
    });

    expect(summary.status.openclaw.configured).toBe(false);
    expect(summary.status.openclawRuntime.ok).toBe(false);
    expect(summary.status.openclawRuntime.error).toBe('not_configured');
    expect(summary.status.openclawRuntime.hint).toContain('openclaw.json');
  });

  it('returns a safe CLI resume payload with ledger context', async () => {
    const root = join(tmpdir(), `agent-workspace-resume-${Date.now()}`);
    mkdirSync(join(root, 'sessions', 'cli', 'cli-resume'), { recursive: true });
    writeFileSync(
      join(root, 'sessions', 'cli', 'cli-resume', 'session.json'),
      JSON.stringify({
        id: 'cli-resume',
        title: 'Resume me',
        agentId: 'hermes',
        type: 'chat',
        status: 'active',
        messageCount: 2,
        updatedAt: '2026-06-14T00:00:00.000Z',
      }),
    );
    writeFileSync(
      join(root, 'sessions', 'cli', 'cli-resume', 'ledger.md'),
      '# CLI Session\n\n## User\n\nRoute this work.\n\n## Assistant\n\nUse Hermes.\n',
    );
    writeFileSync(
      join(root, 'sessions', 'cli', 'cli-resume', 'events.jsonl'),
      [
        JSON.stringify({ type: 'user_message', content: 'Route this work.', timestamp: 't1' }),
        JSON.stringify({ type: 'cli_response', content: 'Use Hermes.', timestamp: 't2' }),
      ].join('\n') + '\n',
    );

    const handle = registerAgentWorkspaceRoutes({
      log: createMockLogger() as any,
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      candidatePath: join(root, 'candidates.jsonl'),
    });
    const req = createMockReq({
      method: 'GET',
      url: '/api/agent-workspace/cli-sessions/cli-resume/resume',
    });
    const res = createMockRes();

    await handle(
      req,
      res,
      new URL('/api/agent-workspace/cli-sessions/cli-resume/resume', 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );

    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(200);
    expect(body.prompt).toContain('Continue CLI session cli-resume');
    expect(body.messages).toHaveLength(2);
    expect(body.ledgerExcerpt).toContain('Use Hermes');
  });

  it('stages training candidates from CLI sessions', async () => {
    const root = join(tmpdir(), `agent-workspace-candidate-${Date.now()}`);
    const candidatePath = join(root, 'state', 'candidates.jsonl');
    mkdirSync(join(root, 'sessions', 'cli', 'cli-candidate'), { recursive: true });
    writeFileSync(
      join(root, 'sessions', 'cli', 'cli-candidate', 'session.json'),
      JSON.stringify({
        id: 'cli-candidate',
        title: 'Candidate source',
        agentId: 'hermes',
        type: 'chat',
        status: 'active',
        messageCount: 3,
        updatedAt: '2026-06-14T00:00:00.000Z',
      }),
    );
    writeFileSync(join(root, 'sessions', 'cli', 'cli-candidate', 'ledger.md'), 'repeatable flow');
    writeFileSync(join(root, 'sessions', 'cli', 'cli-candidate', 'events.jsonl'), '');

    const handle = registerAgentWorkspaceRoutes({
      log: createMockLogger() as any,
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      candidatePath,
    });
    const req = createMockReq({
      method: 'POST',
      url: '/api/agent-workspace/training-candidates',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cli-candidate', proposedSkillPath: 'agentic/test' }),
    });
    const res = createMockRes();

    await handle(
      req,
      res,
      new URL('/api/agent-workspace/training-candidates', 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );

    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.candidate.proposedSkillPath).toBe('agentic/test');
    expect(body.candidate.approvalRequired).toBe(true);
  });

  it('creates and decides approval cards without executing side effects', async () => {
    const root = join(tmpdir(), `agent-workspace-approval-${Date.now()}`);
    const approvalPath = join(root, 'state', 'approvals.jsonl');
    const handle = registerAgentWorkspaceRoutes({
      log: createMockLogger() as any,
      openclawHome: root,
      terminalUrl: 'http://terminal.test',
      approvalPath,
    });

    const createReq = createMockReq({
      method: 'POST',
      url: '/api/agent-workspace/approval-cards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Approve customer email',
        actionType: 'customer_message',
        summary: 'Send a customer-facing message after review.',
        requestedBy: 'hermes',
        risk: 'high',
      }),
    });
    const createRes = createMockRes();

    await handle(
      createReq,
      createRes,
      new URL('/api/agent-workspace/approval-cards', 'http://localhost'),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );

    const created = await getJsonResponse(createRes._promise);
    expect(created.status).toBe(201);
    expect(created.body.card.status).toBe('pending');
    expect(created.body.card.executionStatus).toBe('blocked_until_approved');

    const approveReq = createMockReq({
      method: 'POST',
      url: `/api/agent-workspace/approval-cards/${created.body.card.id}/approve`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decidedBy: 'operator', note: 'Reviewed in UI' }),
    });
    const approveRes = createMockRes();

    await handle(
      approveReq,
      approveRes,
      new URL(
        `/api/agent-workspace/approval-cards/${created.body.card.id}/approve`,
        'http://localhost',
      ),
      { json: createJsonHelper(), collectBody: createCollectBodyHelper() },
    );

    const approved = await getJsonResponse(approveRes._promise);
    expect(approved.status).toBe(200);
    expect(approved.body.card.status).toBe('approved');
    expect(approved.body.card.executionStatus).toBe('approved_not_executed');
  });
});
