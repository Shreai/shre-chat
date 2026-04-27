/**
 * CLI Handoff — Plan extraction, agent handoff, and escalation bridge.
 *
 * Three flows:
 * 1. PLAN → HANDOFF: Claude CLI produces a plan → extract tasks → push to shre-fleet
 * 2. ESCALATION: Agent fails after retries → Claude CLI intervenes via /api/cli/chat
 * 3. TEACH: Claude CLI fixes → captured as agent skills + training data
 *
 * Only active when shre-chat CLI mode is ON.
 */

import { createLogger, serviceUrl, createEventBus } from 'shre-sdk';
import { buildTaskIntakeHeaders } from './task-intake-auth.js';

const log = createLogger('shre-chat:cli-handoff');
let eventBus;
try {
  eventBus = createEventBus('shre-chat');
} catch {
  /* optional */
}

// ── Plan extraction patterns ────────────────────────────────────────────

const PLAN_PATTERNS = [
  // Markdown task lists
  /^[-*]\s*\[[ x]\]\s*(.+)$/gm,
  // Numbered steps
  /^\d+\.\s+(?:\*\*)?(.+?)(?:\*\*)?$/gm,
  // "Step N:" format
  /^(?:Step|Phase|Task)\s*\d+[:.]\s*(.+)$/gim,
];

const PRIORITY_KEYWORDS = {
  critical: /\b(?:critical|urgent|blocking|P0|must|immediately)\b/i,
  high: /\b(?:important|high|priority|first|P1|should)\b/i,
  medium: /\b(?:medium|P2|then|next|also)\b/i,
  low: /\b(?:nice.to.have|optional|later|P3|could|eventually)\b/i,
};

const AGENT_HINTS = {
  'founding-engineer': /\b(?:code|implement|build|fix|debug|refactor|write)\b/i,
  'founding-architect': /\b(?:architect|design|plan|structure|schema|database)\b/i,
  'founding-security': /\b(?:security|auth|permission|access|vulnerability|audit)\b/i,
  'ops-manager': /\b(?:deploy|devops|ci|cd|infra|monitor|config)\b/i,
  'qa-manager': /\b(?:test|qa|quality|validate|verify|e2e)\b/i,
};

/**
 * Extract a structured plan from Claude CLI output.
 * Returns an array of tasks with titles, priorities, and agent hints.
 */
export function extractPlan(cliOutput) {
  const tasks = [];
  const seen = new Set();

  for (const pattern of PLAN_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(cliOutput)) !== null) {
      const title = match[1].trim().replace(/\*\*/g, '');
      if (!title || title.length < 5 || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      // Infer priority
      let priority = 'medium';
      for (const [p, re] of Object.entries(PRIORITY_KEYWORDS)) {
        if (re.test(title)) {
          priority = p;
          break;
        }
      }

      // Infer agent
      let suggestedAgent = null;
      for (const [agent, re] of Object.entries(AGENT_HINTS)) {
        if (re.test(title)) {
          suggestedAgent = agent;
          break;
        }
      }

      tasks.push({
        title,
        priority,
        suggestedAgent,
        source: 'cli-plan',
      });
    }
  }

  return tasks;
}

/**
 * Extract structured plan from Claude CLI using explicit JSON format.
 * Falls back to pattern matching if no JSON found.
 */
export function extractStructuredPlan(cliOutput) {
  // Try to find JSON plan block
  const jsonMatch = cliOutput.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed.map((t) => ({
          title: t.title || t.name || t.task || 'Untitled',
          description: t.description || t.details || '',
          priority: t.priority || 'medium',
          suggestedAgent: t.agent || t.assignee || null,
          dependencies: t.depends_on || t.dependencies || [],
          doneCriteria: t.done_criteria || t.criteria || [],
          source: 'cli-plan-json',
        }));
      }
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        return parsed.tasks.map((t) => ({
          title: t.title || t.name || 'Untitled',
          description: t.description || '',
          priority: t.priority || 'medium',
          suggestedAgent: t.agent || null,
          dependencies: t.depends_on || [],
          doneCriteria: t.done_criteria || [],
          source: 'cli-plan-json',
        }));
      }
    } catch {
      /* fall through to pattern matching */
    }
  }

  // Fallback: pattern-based extraction
  return extractPlan(cliOutput);
}

// ── Task creation pipeline ──────────────────────────────────────────────

/**
 * Push extracted plan tasks to shre-tasks for agent execution.
 * Returns array of created task IDs.
 */
export async function handoffToAgents(plan, { ledgerSessionId, projectId, parentTaskId } = {}) {
  const tasksUrl = serviceUrl('shre-tasks');
  const createdIds = [];

  for (let i = 0; i < plan.length; i++) {
    const task = plan[i];
    const description = [
      task.description || task.title,
      '',
      '---',
      `Source: Claude CLI plan (session: ${ledgerSessionId || 'unknown'})`,
      task.dependencies?.length ? `Depends on: ${task.dependencies.join(', ')}` : '',
      task.doneCriteria?.length ? `Done criteria: ${task.doneCriteria.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await fetch(`${tasksUrl}/v1/intake`, {
        method: 'POST',
        headers: buildTaskIntakeHeaders('/v1/intake'),
        body: JSON.stringify({
          title: task.title,
          description,
          priority: task.priority,
          agent_id: task.suggestedAgent || undefined,
          tags: [
            'cli-handoff',
            ledgerSessionId ? `session:${ledgerSessionId}` : null,
            projectId ? `project:${projectId}` : null,
            parentTaskId ? `parent:${parentTaskId}` : null,
          ].filter(Boolean),
          depends_on: task.dependencies || [],
          done_criteria:
            task.doneCriteria?.length > 0 ? task.doneCriteria : ['typecheck', 'qa_pass'],
          metadata: {
            cliHandoff: true,
            ledgerSessionId,
            projectId,
            planIndex: i,
            planTotal: plan.length,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json();
        const taskId = data.id || data.taskId;
        createdIds.push(taskId);
        log.info('[cli-handoff] Task created', {
          taskId,
          title: task.title.slice(0, 60),
          agent: task.suggestedAgent,
          priority: task.priority,
        });
      } else {
        log.warn('[cli-handoff] Failed to create task', {
          status: res.status,
          title: task.title.slice(0, 60),
        });
      }
    } catch (err) {
      log.error('[cli-handoff] Task creation error', {
        error: err.message,
        title: task.title.slice(0, 60),
      });
    }
  }

  // Emit handoff event
  if (eventBus && createdIds.length > 0) {
    eventBus
      .publish('cli.handoff', 'info', {
        taskCount: createdIds.length,
        taskIds: createdIds,
        ledgerSessionId,
        projectId,
      })
      .catch(() => {});
  }

  return createdIds;
}

// ── Escalation bridge: agent failure → Claude CLI ───────────────────────

/**
 * Called when an agent fails and architect-loop determines CLI intervention is needed.
 * Sends the failure context to Claude CLI via shre-chat's /api/cli/chat endpoint.
 * Returns the CLI response (fix instructions + code changes).
 */
export async function escalateToCli(taskId, agentId, diagnosis, errorOutput, originalPrompt) {
  const chatUrl = `https://127.0.0.1:${process.env.PORT || 5510}`;

  const escalationPrompt = [
    `## Agent Escalation — Task Failed`,
    ``,
    `An agent has failed this task after exhausting all retries. You need to step in and fix it.`,
    ``,
    `**Task ID**: ${taskId}`,
    `**Failed Agent**: ${agentId}`,
    `**Failure**: ${diagnosis?.failureReason || 'unknown'} — ${diagnosis?.details || 'no details'}`,
    ``,
    `## Original Task`,
    originalPrompt?.slice(0, 3000) || 'No original prompt',
    ``,
    `## Error Output`,
    errorOutput?.slice(0, 2000) || 'No error output',
    ``,
    `## Your Job`,
    `1. Diagnose the ROOT CAUSE`,
    `2. Fix the code/config/permission issue`,
    `3. If the agent needs new tools or permissions, grant them`,
    `4. Write teaching instructions so the agent can handle this next time`,
    `5. After fixing, output a structured plan for what the agent should verify:`,
    ``,
    '```json',
    `{`,
    `  "rootCause": "what went wrong",`,
    `  "fixApplied": "what you changed",`,
    `  "teachingForAgent": "instructions for the agent to learn from this",`,
    `  "toolsToGrant": [],`,
    `  "verificationSteps": ["step1", "step2"]`,
    `}`,
    '```',
  ].join('\n');

  try {
    const res = await fetch(`${chatUrl}/api/cli/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: escalationPrompt,
        agentId: 'architect',
        autoMode: true, // Claude CLI executes autonomously
        sessionType: 'task',
        sessionTitle: `Escalation: ${taskId.slice(0, 8)} (${agentId})`,
      }),
      signal: AbortSignal.timeout(120_000), // 2min timeout for complex fixes
    });

    if (!res.ok) {
      log.warn('[cli-handoff] Escalation CLI call failed', { status: res.status });
      return null;
    }

    // Parse SSE to extract the response
    const sseText = await res.text();
    let fullResponse = '';
    let ledgerSessionId = null;

    for (const line of sseText.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'delta' && evt.text) fullResponse += evt.text;
        if (evt.ledgerSessionId) ledgerSessionId = evt.ledgerSessionId;
      } catch {
        /* skip */
      }
    }

    if (!fullResponse) {
      log.warn('[cli-handoff] Empty response from escalation CLI');
      return null;
    }

    log.info('[cli-handoff] CLI escalation complete', {
      taskId: taskId.slice(0, 8),
      agentId,
      responseLength: fullResponse.length,
      ledgerSessionId,
    });

    // Extract teaching data from response
    const teaching = extractTeaching(fullResponse);

    // Record teaching as training data for the failed agent
    if (teaching) {
      await recordTeaching(agentId, taskId, teaching).catch((err) => {
        log.warn('[cli-handoff] Failed to record teaching', { error: err.message });
      });
    }

    return {
      response: fullResponse,
      teaching,
      ledgerSessionId,
    };
  } catch (err) {
    log.error('[cli-handoff] Escalation error', { error: err.message, taskId: taskId.slice(0, 8) });
    return null;
  }
}

// ── Teaching extraction & recording ─────────────────────────────────────

/**
 * Extract teaching data from Claude CLI's escalation response.
 */
function extractTeaching(cliResponse) {
  // Look for JSON teaching block
  const jsonMatch = cliResponse.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.rootCause || parsed.fixApplied || parsed.teachingForAgent) {
        return {
          rootCause: parsed.rootCause || '',
          fixApplied: parsed.fixApplied || '',
          teachingContext: parsed.teachingForAgent || parsed.teachingContext || '',
          toolsToGrant: parsed.toolsToGrant || [],
          verificationSteps: parsed.verificationSteps || [],
        };
      }
    } catch {
      /* fall through */
    }
  }

  // Fallback: extract key sections from markdown
  return {
    rootCause: extractSection(cliResponse, 'root cause') || extractSection(cliResponse, 'problem'),
    fixApplied: extractSection(cliResponse, 'fix') || extractSection(cliResponse, 'solution'),
    teachingContext:
      extractSection(cliResponse, 'teaching') || extractSection(cliResponse, 'learn'),
    toolsToGrant: [],
    verificationSteps: [],
  };
}

function extractSection(text, keyword) {
  const re = new RegExp(`(?:^|\\n)#+\\s*.*${keyword}.*\\n([\\s\\S]*?)(?=\\n#+|$)`, 'i');
  const match = text.match(re);
  return match ? match[1].trim().slice(0, 1000) : '';
}

/**
 * Record CLI teaching as training data and skill update for the failed agent.
 */
async function recordTeaching(agentId, taskId, teaching) {
  const routerUrl = serviceUrl('shre-router');
  const skillsUrl = serviceUrl('shre-skills');

  // 1. Record as training data via CortexDB
  try {
    const cortexUrl = serviceUrl('cortex-bridge');
    await fetch(`${cortexUrl}/v1/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_type: 'training_data',
        payload: {
          agent_id: agentId,
          task_id: taskId,
          type: 'architect_teaching',
          root_cause: teaching.rootCause,
          fix_applied: teaching.fixApplied,
          teaching_context: teaching.teachingContext,
          timestamp: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    log.info('[cli-handoff] Teaching recorded to CortexDB', {
      agentId,
      taskId: taskId.slice(0, 8),
    });
  } catch (err) {
    log.warn('[cli-handoff] CortexDB teaching write failed', { error: err.message });
  }

  // 2. Grant tools if recommended
  if (teaching.toolsToGrant?.length > 0) {
    for (const tool of teaching.toolsToGrant) {
      try {
        await fetch(`${routerUrl}/v1/tools/grants/${agentId}/${tool}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        log.info('[cli-handoff] Tool granted via teaching', { agentId, tool });
      } catch {
        /* best effort */
      }
    }
  }

  // 3. Update agent skill profile with learned capability
  if (teaching.rootCause) {
    try {
      await fetch(`${skillsUrl}/v1/agents/${agentId}/learning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'architect_teaching',
          taskId,
          skill: teaching.rootCause.slice(0, 100),
          context: teaching.teachingContext,
          type: 'gap_fix',
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* best effort */
    }
  }

  // 4. Emit teaching event
  if (eventBus) {
    eventBus
      .publish('cli.teaching', 'info', {
        agentId,
        taskId,
        rootCause: teaching.rootCause?.slice(0, 100),
        toolsGranted: teaching.toolsToGrant?.length || 0,
      })
      .catch(() => {});
  }
}

// ── HTTP Route Handler ──────────────────────────────────────────────────

function collectBodyStr(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function registerCliHandoffRoutes({ log }) {
  return async function handleCliHandoff(req, res, url) {
    // POST /api/cli/handoff — extract plan from CLI output and create tasks
    if (url.pathname === '/api/cli/handoff' && req.method === 'POST') {
      try {
        const body = JSON.parse(await collectBodyStr(req));
        const { cliOutput, ledgerSessionId, projectId, parentTaskId } = body;

        if (!cliOutput) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'cliOutput required' }));
          return true;
        }

        // Extract plan
        const plan = extractStructuredPlan(cliOutput);
        if (plan.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tasks: [], message: 'No actionable tasks found in plan' }));
          return true;
        }

        // Create tasks in shre-tasks
        const taskIds = await handoffToAgents(plan, { ledgerSessionId, projectId, parentTaskId });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tasks: plan.map((t, i) => ({ ...t, taskId: taskIds[i] || null })),
            created: taskIds.length,
            total: plan.length,
          }),
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // POST /api/cli/escalation — agent failed, CLI intervenes
    if (url.pathname === '/api/cli/escalation' && req.method === 'POST') {
      try {
        const body = JSON.parse(await collectBodyStr(req));
        const { taskId, agentId, diagnosis, errorOutput, originalPrompt } = body;

        if (!taskId || !agentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'taskId and agentId required' }));
          return true;
        }

        const result = await escalateToCli(taskId, agentId, diagnosis, errorOutput, originalPrompt);

        if (!result) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'CLI escalation failed' }));
          return true;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // POST /api/cli/extract-plan — extract plan from text (dry-run, no task creation)
    if (url.pathname === '/api/cli/extract-plan' && req.method === 'POST') {
      try {
        const body = JSON.parse(await collectBodyStr(req));
        const plan = extractStructuredPlan(body.cliOutput || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tasks: plan }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    return false;
  };
}
