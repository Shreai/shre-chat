import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../router-client';
import type { Session, AppActions } from '../store';
import { formatTime, copyToClipboard } from '../chat-utils';

export type SlashCategory = 'session' | 'app' | 'platform';

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  hasArg?: boolean;
  category?: SlashCategory;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

interface Project {
  name: string;
  status?: string;
  task_count?: number;
}

interface Goal {
  title: string;
  progress?: number;
  status?: string;
}

interface Contact {
  name: string;
  email?: string;
  role?: string;
}

interface NodeInfo {
  id: string;
  status: string;
  os?: string;
  version?: string;
}

interface ToolInfo {
  name: string;
  description?: string;
  type?: string;
}

interface AgentInfo {
  id: string;
  name: string;
  model?: string;
}

interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  localModel?: string;
  cloudModel?: string;
  training?: {
    loraAdapter?: string;
    boostDomains?: string[];
    minQuality?: number;
    sources?: string[];
  };
  appId?: string;
  fallbackChain?: string[];
  toolPrefixes?: string[];
  defaultAgents?: string[];
  localReadyThreshold?: number;
  localReadyMinQuality?: number;
}

interface AppRegistryResponse {
  error?: string;
  apps?: SkillInfo[];
  version?: string;
  count?: number;
}

export interface UseSlashCommandsParams {
  input: string;
  setInput: (val: string) => void;
  activeSessionId: string | null;
  activeAgentId: string;
  activeSession: Session | undefined;
  messages: ChatMessage[];
  actions: Pick<
    AppActions,
    | 'setStatusLine'
    | 'replaceSessionMessages'
    | 'addFeed'
    | 'addMessage'
    | 'toggleCompact'
    | 'setSystemPrompt'
    | 'newSession'
    | 'switchSession'
  >;
  stateCompact: boolean;
  cliMode: boolean;
  setCliMode: (v: boolean) => void;
  setCliContinue: (v: boolean) => void;
  ensureSession: () => string;
  AVAILABLE_MODELS: AvailableModel[];
  setSelectedModel: (m: string | null) => void;
  setModelOverride: (agentId: string, modelId: string | null) => void;
}

export interface UseSlashCommandsReturn {
  SLASH_COMMANDS: SlashCommand[];
  slashOpen: boolean;
  setSlashOpen: (v: boolean) => void;
  slashIndex: number;
  setSlashIndex: (v: number | ((prev: number) => number)) => void;
  slashRef: React.RefObject<HTMLDivElement>;
  slashFiltered: SlashCommand[];
  executeSlashCommand: (commandStr: string) => void;
}

export function useSlashCommands(params: UseSlashCommandsParams): UseSlashCommandsReturn {
  const {
    input,
    setInput,
    activeSessionId,
    activeAgentId,
    activeSession,
    messages,
    actions,
    stateCompact,
    cliMode,
    setCliMode,
    setCliContinue,
    ensureSession,
    AVAILABLE_MODELS,
    setSelectedModel,
    setModelOverride,
  } = params;

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef<HTMLDivElement>(null);

  const SLASH_COMMANDS = useMemo<SlashCommand[]>(
    () => [
      // Session commands
      {
        name: 'clear',
        description: 'Clear current session messages',
        usage: '/clear',
        category: 'session',
      },
      {
        name: 'model',
        description: 'Switch model',
        usage: '/model <name>',
        hasArg: true,
        category: 'session',
      },
      {
        name: 'export',
        description: 'Export conversation to clipboard',
        usage: '/export',
        category: 'session',
      },
      { name: 'new', description: 'Create a new session', usage: '/new', category: 'session' },
      {
        name: 'compact',
        description: 'Toggle compact message display',
        usage: '/compact',
        category: 'session',
      },
      {
        name: 'help',
        description: 'Show all available commands',
        usage: '/help',
        category: 'session',
      },
      {
        name: 'system',
        description: 'Set session system prompt',
        usage: '/system <prompt>',
        hasArg: true,
        category: 'session',
      },
      {
        name: 'cli',
        description: 'Toggle Claude CLI mode (uses subscription)',
        usage: '/cli',
        category: 'session',
      },
      {
        name: 'execute',
        description: 'Run a task with orchestrator-executor',
        usage: '/execute <task>',
        hasArg: true,
        category: 'session',
      },
      {
        name: 'run',
        description: 'Execute a shell command on the host',
        usage: '/run <command>',
        hasArg: true,
        category: 'session',
      },
      // App commands
      {
        name: 'task',
        description: 'Create a task',
        usage: '/task <description>',
        hasArg: true,
        category: 'app',
      },
      {
        name: 'reminder',
        description: 'Set a reminder (natural language)',
        usage: '/reminder <when> <text>',
        hasArg: true,
        category: 'app',
      },
      {
        name: 'email',
        description: 'Send an email',
        usage: '/email <to> <subject>',
        hasArg: true,
        category: 'app',
      },
      {
        name: 'project',
        description: 'Create or list projects',
        usage: '/project [name]',
        category: 'app',
      },
      {
        name: 'issue',
        description: 'File a bug or feature request',
        usage: '/issue <description>',
        hasArg: true,
        category: 'app',
      },
      {
        name: 'goal',
        description: 'Create or view goals',
        usage: '/goal [description]',
        category: 'app',
      },
      {
        name: 'contact',
        description: 'Lookup or add a contact',
        usage: '/contact <name or email>',
        hasArg: true,
        category: 'app',
      },
      // Platform commands
      { name: 'node', description: 'List connected nodes', usage: '/node', category: 'platform' },
      {
        name: 'tools',
        description: 'List or grant agent tools',
        usage: '/tools [agent]',
        category: 'platform',
      },
      {
        name: 'permissions',
        description: 'View agent permissions',
        usage: '/permissions [agent]',
        category: 'platform',
      },
      {
        name: 'agents',
        description: 'List all agents & status',
        usage: '/agents',
        category: 'platform',
      },
      {
        name: 'status',
        description: 'Service health overview',
        usage: '/status',
        category: 'platform',
      },
      {
        name: 'apps',
        description: 'List app model profiles or inspect one',
        usage: '/apps [appId|--domain <domain>]',
        hasArg: true,
        category: 'platform',
      },
      {
        name: 'resolve',
        description: 'Show model chain for an app',
        usage: '/resolve <appId> [--local]',
        hasArg: true,
        category: 'platform',
      },
      {
        name: 'pricing',
        description: 'Show model pricing overview',
        usage: '/pricing',
        category: 'platform',
      },
    ],
    [],
  );

  const slashFiltered = useMemo(() => {
    if (!slashOpen) return [];
    const typed = input.slice(1).toLowerCase();
    const cmdPart = typed.split(' ')[0] || '';
    if (typed.includes(' ')) {
      const cmd = SLASH_COMMANDS.find((c) => c.name === cmdPart);
      if (cmd?.name === 'model') {
        const modelQuery = typed.slice(cmdPart.length + 1).toLowerCase();
        return AVAILABLE_MODELS.filter(
          (m) =>
            m.id.toLowerCase().includes(modelQuery) || m.name.toLowerCase().includes(modelQuery),
        ).map((m) => ({
          name: `model ${m.id}`,
          description: `${m.icon} ${m.name} (${m.provider})`,
          usage: `/model ${m.id}`,
          category: 'session' as SlashCategory,
        }));
      }
      if (cmd) return [];
    }
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(cmdPart));
  }, [slashOpen, input, SLASH_COMMANDS, AVAILABLE_MODELS]);

  useEffect(() => {
    if (input.startsWith('/') && !input.startsWith('/ ') && input.length >= 1) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  }, [input]);

  useEffect(() => {
    if (slashOpen && slashRef.current) {
      const active = slashRef.current.querySelector("[data-slash-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [slashIndex, slashOpen]);

  const executeSlashCommand = useCallback(
    (commandStr: string) => {
      const parts = commandStr.trim().split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        case 'clear': {
          if (!activeSessionId) {
            actions.setStatusLine('No active session to clear');
            setTimeout(() => actions.setStatusLine(null), 2000);
            break;
          }
          if (confirm('Clear all messages in this session?')) {
            actions.replaceSessionMessages(activeSessionId, []);
            actions.setStatusLine('Session cleared');
            actions.addFeed(activeSessionId, 'system', 'Session cleared via /clear');
            setTimeout(() => actions.setStatusLine(null), 2000);
          }
          break;
        }
        case 'model': {
          if (!arg) {
            actions.setStatusLine('Usage: /model <model-id>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const model = AVAILABLE_MODELS.find(
            (m) => m.id === arg || m.name.toLowerCase() === arg.toLowerCase(),
          );
          if (model) {
            setSelectedModel(model.id);
            setModelOverride(activeAgentId, model.id);
            actions.setStatusLine(`Model switched to ${model.icon} ${model.name}`);
            if (activeSessionId) {
              actions.addMessage(activeSessionId, {
                role: 'assistant',
                content: `*Model switched to **${model.name}** (${model.provider})*`,
                timestamp: Date.now(),
              });
            }
          } else {
            actions.setStatusLine(`Unknown model: ${arg}`);
          }
          setTimeout(() => actions.setStatusLine(null), 4000);
          break;
        }
        case 'export': {
          if (!activeSession || messages.length === 0) {
            actions.setStatusLine('No messages to export');
            setTimeout(() => actions.setStatusLine(null), 2000);
            break;
          }
          const exportText = messages
            .map((m) => `[${m.role.toUpperCase()}] ${formatTime(m.timestamp)}\n${m.content}`)
            .join('\n\n---\n\n');
          const header = `# ${activeSession.title}\nExported: ${new Date().toLocaleString()}\nAgent: ${activeAgentId}\n\n---\n\n`;
          copyToClipboard(header + exportText).then(() => {
            actions.setStatusLine('Conversation copied to clipboard');
            setTimeout(() => actions.setStatusLine(null), 2000);
          });
          break;
        }
        case 'new': {
          const id = actions.newSession();
          actions.switchSession(id);
          actions.setStatusLine('New session created');
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        case 'compact': {
          actions.toggleCompact();
          actions.setStatusLine(`Compact mode ${stateCompact ? 'disabled' : 'enabled'}`);
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        case 'help': {
          const helpSessionId = ensureSession();
          const categories: [SlashCategory, string][] = [
            ['session', 'Session'],
            ['app', 'Apps'],
            ['platform', 'Platform'],
          ];
          const sections = categories.map(([cat, label]) => {
            const cmds = SLASH_COMMANDS.filter((c) => c.category === cat);
            return [
              `**${label}**`,
              '',
              '| Command | Description |',
              '|---------|-------------|',
              ...cmds.map((c) => `| \`${c.usage}\` | ${c.description} |`),
            ].join('\n');
          });
          const helpText = [
            '**Available Commands:**',
            '',
            ...sections,
            '',
            '**Mentions:** Type `@@` to tag an agent (e.g. `@@shre fix the build`)',
            '',
            '*Type `/` for the command menu. `@@` to mention an agent.*',
          ].join('\n');
          actions.addMessage(helpSessionId, {
            role: 'assistant',
            content: helpText,
            timestamp: Date.now(),
          });
          break;
        }
        case 'system': {
          if (!arg) {
            actions.setStatusLine('Usage: /system <prompt>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const sysSessionId = ensureSession();
          actions.setSystemPrompt(sysSessionId, arg);
          actions.addMessage(sysSessionId, {
            role: 'assistant',
            content: `*System prompt updated:*\n> ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('System prompt set');
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        case 'cli': {
          const newCliMode = !cliMode;
          setCliMode(newCliMode);
          setCliContinue(false);
          const cliSessionId = ensureSession();
          actions.addMessage(cliSessionId, {
            role: 'assistant',
            content: newCliMode
              ? '*Claude CLI mode **enabled** — messages will be sent via Claude CLI (uses subscription, not API credits). Type /cli again to disable.*'
              : '*Claude CLI mode **disabled** — back to normal API mode.*',
            timestamp: Date.now(),
          });
          actions.setStatusLine(newCliMode ? 'CLI mode ON' : 'CLI mode OFF');
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        case 'execute': {
          if (!arg) {
            actions.setStatusLine('Usage: /execute <task description>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const execSessionId = ensureSession();
          actions.addMessage(execSessionId, {
            role: 'user',
            content: `/execute ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Orchestrating...');

          const routerBase =
            import.meta.env?.VITE_ROUTER_URL ?? `${window.location.origin}/api/router`;
          fetch(`${routerBase}/v1/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: arg,
              agentId: activeAgentId || 'shre',
              stream: false,
            }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const errBody = await (res.json() as Promise<{ error: string }>).catch(() => ({
                  error: `HTTP ${res.status}`,
                }));
                throw new Error(errBody.error || `Execute failed: ${res.status}`);
              }
              return res.json();
            })
            .then(
              (result: {
                status: string;
                orchestratorModel: string;
                executorModel: string;
                totalDurationMs: number;
                subtasks?: { id: string; description: string }[];
                results?: {
                  subtaskId: string;
                  status: string;
                  durationMs: number;
                  iterations: number;
                  toolsUsed?: string[];
                  output?: string;
                }[];
              }) => {
                const lines: string[] = [];
                lines.push(`**Executor Result** — ${result.status}`);
                lines.push(
                  `Orchestrator: \`${result.orchestratorModel}\` | Executor: \`${result.executorModel}\` | Duration: ${result.totalDurationMs}ms`,
                );
                lines.push('');
                if (result.subtasks?.length && result.subtasks.length > 1) {
                  lines.push(`**Subtasks** (${result.subtasks.length}):`);
                  for (const st of result.subtasks) {
                    lines.push(`- \`${st.id}\`: ${st.description}`);
                  }
                  lines.push('');
                }
                for (const r of result.results || []) {
                  const icon = r.status === 'success' ? '+' : r.status === 'error' ? 'x' : '!';
                  lines.push(
                    `**[${icon}] ${r.subtaskId}** (${r.durationMs}ms, ${r.iterations} iteration${r.iterations !== 1 ? 's' : ''})`,
                  );
                  if (r.toolsUsed?.length) lines.push(`Tools: ${r.toolsUsed.join(', ')}`);
                  if (r.output) lines.push(`\n${r.output.slice(0, 2000)}`);
                  lines.push('');
                }
                actions.addMessage(execSessionId, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              },
            )
            .catch((err: Error) => {
              actions.addMessage(execSessionId, {
                role: 'assistant',
                content: `**Execute error:** ${err.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'run': {
          if (!arg) {
            actions.setStatusLine('Usage: /run <command>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const runSessionId = ensureSession();
          actions.addMessage(runSessionId, {
            role: 'user',
            content: `/run ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Running...');

          fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: arg }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(errBody.error || `Run failed: ${res.status}`);
              }
              return res.json();
            })
            .then(
              (result: {
                exitCode: number;
                stdout?: string;
                stderr?: string;
                truncated?: boolean;
              }) => {
                const lines: string[] = [];
                lines.push(
                  `**\`$ ${arg.length > 80 ? arg.slice(0, 77) + '...' : arg}\`** — exit ${result.exitCode}`,
                );
                if (result.stdout) lines.push('```\n' + result.stdout.slice(0, 4000) + '\n```');
                if (result.stderr)
                  lines.push('**stderr:**\n```\n' + result.stderr.slice(0, 2000) + '\n```');
                if (result.truncated) lines.push('_(output truncated)_');
                if (!result.stdout && !result.stderr) lines.push('_(no output)_');
                actions.addMessage(runSessionId, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              },
            )
            .catch((err: Error) => {
              actions.addMessage(runSessionId, {
                role: 'assistant',
                content: `**Run error:** ${err.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        // ── App Commands ──────────────────────────────────────────────
        case 'task': {
          if (!arg) {
            actions.setStatusLine('Usage: /task <description>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const taskSid = ensureSession();
          actions.addMessage(taskSid, {
            role: 'user',
            content: `/task ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Creating task...');
          fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: arg, source: 'chat-command' }),
          })
            .then(async (r) => {
              if (!r.ok)
                throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
              return r.json();
            })
            .then((t: { id: string }) => {
              actions.addMessage(taskSid, {
                role: 'assistant',
                content: `**Task created** \`${t.id}\`\n> ${arg}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch((e: Error) => {
              actions.addMessage(taskSid, {
                role: 'assistant',
                content: `**Task error:** ${e.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'reminder': {
          if (!arg) {
            actions.setStatusLine('Usage: /reminder <when and what>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const remSid = ensureSession();
          actions.addMessage(remSid, {
            role: 'user',
            content: `/reminder ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Parsing reminder...');
          fetch('/api/reminders/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: arg }),
          })
            .then(async (r) => {
              if (!r.ok) throw new Error('Parse failed');
              return r.json() as Promise<{ text: string; schedule: string }>;
            })
            .then((parsed: { text: string; schedule: string }) => {
              return fetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed),
              })
                .then(async (r) => {
                  if (!r.ok) throw new Error('Create failed');
                  return r.json() as Promise<{ text: string; due: string; recurring?: string }>;
                })
                .then((rem: { text: string; due: string; recurring?: string }) => {
                  const due = rem.due ? new Date(rem.due).toLocaleString() : 'no date';
                  actions.addMessage(remSid, {
                    role: 'assistant',
                    content: `**Reminder set** — ${rem.text}\n> Due: ${due}${rem.recurring ? ` (${rem.recurring})` : ''}`,
                    timestamp: Date.now(),
                  });
                  actions.setStatusLine(null);
                });
            })
            .catch((e: Error) => {
              actions.addMessage(remSid, {
                role: 'assistant',
                content: `**Reminder error:** ${e.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'email': {
          if (!arg) {
            actions.setStatusLine('Usage: /email <to> <subject>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const emailParts = arg.split(/\s+/);
          const emailTo = emailParts[0];
          const emailSubject = emailParts.slice(1).join(' ') || '(no subject)';
          const emailSid = ensureSession();
          actions.addMessage(emailSid, {
            role: 'user',
            content: `/email ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Shre is drafting...');

          // Gather recent conversation context for the AI to reference
          const recentMsgs = messages
            .slice(-6)
            .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
            .join('\n');

          // Step 1: AI drafts the email body
          fetch('/api/email/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: emailTo, subject: emailSubject, context: recentMsgs }),
          })
            .then(async (r) => {
              if (!r.ok)
                throw new Error((await r.json().catch(() => ({}))).error || 'Draft failed');
              return r.json();
            })
            .then((draft: { body: string }) => {
              // Show the draft to user
              actions.addMessage(emailSid, {
                role: 'assistant',
                content: `**Email draft** to \`${emailTo}\`\n**Subject:** ${emailSubject}\n\n---\n${draft.body}\n---\n\n*Sending...*`,
                timestamp: Date.now(),
              });
              actions.setStatusLine('Sending email...');

              // Step 2: Send the email with the AI-generated body
              return fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: emailTo, subject: emailSubject, body: draft.body }),
              });
            })
            .then(async (r) => {
              if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Send failed');
              actions.addMessage(emailSid, {
                role: 'assistant',
                content: `**Email sent** to \`${emailTo}\``,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch((e: Error) => {
              actions.addMessage(emailSid, {
                role: 'assistant',
                content: `**Email error:** ${e.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'project': {
          const projSid = ensureSession();
          if (!arg) {
            actions.addMessage(projSid, {
              role: 'user',
              content: '/project',
              timestamp: Date.now(),
            });
            actions.setStatusLine('Listing projects...');
            fetch('/api/projects')
              .then(async (r) => (r.ok ? (r.json() as Promise<Project[]>) : []))
              .then((projects: Project[]) => {
                const lines = projects.length
                  ? [
                      '**Projects:**',
                      '',
                      ...projects.map(
                        (p) =>
                          `- **${p.name}** — ${p.status || 'active'} (${p.task_count ?? 0} tasks)`,
                      ),
                    ]
                  : ['*No projects found. Create one with `/project <name>`*'];
                actions.addMessage(projSid, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              })
              .catch(() => {
                actions.addMessage(projSid, {
                  role: 'assistant',
                  content: '**Error:** Could not fetch projects',
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              });
          } else {
            actions.addMessage(projSid, {
              role: 'user',
              content: `/project ${arg}`,
              timestamp: Date.now(),
            });
            actions.setStatusLine('Creating project...');
            fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: arg }),
            })
              .then(async (r) => {
                if (!r.ok)
                  throw new Error(
                    ((await r.json().catch(() => ({}))) as { error?: string } | undefined)?.error ||
                      `HTTP ${r.status}`,
                  );
                return r.json() as Promise<Project>;
              })
              .then((p: Project) => {
                actions.addMessage(projSid, {
                  role: 'assistant',
                  content: `**Project created:** ${p.name || arg}`,
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              })
              .catch((e: Error) => {
                actions.addMessage(projSid, {
                  role: 'assistant',
                  content: `**Project error:** ${e.message}`,
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              });
          }
          break;
        }
        case 'issue': {
          if (!arg) {
            actions.setStatusLine('Usage: /issue <description>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const issueSid = ensureSession();
          actions.addMessage(issueSid, {
            role: 'user',
            content: `/issue ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Filing issue...');
          fetch('/api/issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: arg, source: 'chat-command' }),
          })
            .then(async (r) => {
              if (!r.ok)
                throw new Error(
                  ((await r.json().catch(() => ({}))) as { error?: string } | undefined)?.error ||
                    `HTTP ${r.status}`,
                );
              return r.json() as Promise<{ id?: string; number?: string }>;
            })
            .then((issue: { id?: string; number?: string }) => {
              actions.addMessage(issueSid, {
                role: 'assistant',
                content: `**Issue filed** \`${issue.id || issue.number || ''}\`\n> ${arg}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch((e: Error) => {
              actions.addMessage(issueSid, {
                role: 'assistant',
                content: `**Issue error:** ${e.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'goal': {
          const goalSid = ensureSession();
          if (!arg) {
            actions.addMessage(goalSid, { role: 'user', content: '/goal', timestamp: Date.now() });
            actions.setStatusLine('Loading goals...');
            fetch('/api/goals')
              .then(async (r) => (r.ok ? (r.json() as Promise<Goal[]>) : []))
              .then((goals: Goal[]) => {
                const lines = goals.length
                  ? [
                      '**Goals:**',
                      '',
                      ...goals.map(
                        (g) => `- **${g.title}** — ${g.progress ?? 0}% ${g.status || ''}`,
                      ),
                    ]
                  : ['*No goals found. Create one with `/goal <description>`*'];
                actions.addMessage(goalSid, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              })
              .catch(() => {
                actions.addMessage(goalSid, {
                  role: 'assistant',
                  content: '**Error:** Could not fetch goals',
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              });
          } else {
            actions.addMessage(goalSid, {
              role: 'user',
              content: `/goal ${arg}`,
              timestamp: Date.now(),
            });
            actions.setStatusLine('Creating goal...');
            fetch('/api/goals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: arg }),
            })
              .then(async (r) => {
                if (!r.ok)
                  throw new Error(
                    ((await r.json().catch(() => ({}))) as { error?: string } | undefined)?.error ||
                      `HTTP ${r.status}`,
                  );
                return r.json() as Promise<Goal>;
              })
              .then((g: Goal) => {
                actions.addMessage(goalSid, {
                  role: 'assistant',
                  content: `**Goal created:** ${g.title || arg}`,
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              })
              .catch((e: Error) => {
                actions.addMessage(goalSid, {
                  role: 'assistant',
                  content: `**Goal error:** ${e.message}`,
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              });
          }
          break;
        }
        case 'contact': {
          if (!arg) {
            actions.setStatusLine('Usage: /contact <name or email>');
            setTimeout(() => actions.setStatusLine(null), 4000);
            break;
          }
          const contactSid = ensureSession();
          actions.addMessage(contactSid, {
            role: 'user',
            content: `/contact ${arg}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Searching contacts...');
          fetch(`/api/contacts/search?q=${encodeURIComponent(arg)}`)
            .then(async (r) =>
              r.ok ? (r.json() as Promise<{ contacts: Contact[] }>) : { contacts: [] },
            )
            .then((data: { contacts: Contact[] }) => {
              const contacts = data.contacts || [];
              if (contacts.length > 0) {
                const lines = [
                  '**Contacts found:**',
                  '',
                  ...contacts
                    .slice(0, 10)
                    .map(
                      (c) =>
                        `- **${c.name || c.email}** ${c.email ? `(${c.email})` : ''} ${c.role ? `— ${c.role}` : ''}`,
                    ),
                ];
                actions.addMessage(contactSid, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
              } else {
                actions.addMessage(contactSid, {
                  role: 'assistant',
                  content: `*No contacts found for "${arg}"*`,
                  timestamp: Date.now(),
                });
              }
              actions.setStatusLine(null);
            })
            .catch((e: Error) => {
              actions.addMessage(contactSid, {
                role: 'assistant',
                content: `**Contact error:** ${e.message}`,
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }

        // ── Platform Commands ──────────────────────────────────────────
        case 'node': {
          const nodeSid = ensureSession();
          actions.addMessage(nodeSid, { role: 'user', content: '/node', timestamp: Date.now() });
          actions.setStatusLine('Loading nodes...');
          fetch('/api/nodes')
            .then(async (r) => (r.ok ? (r.json() as Promise<NodeInfo[]>) : []))
            .then((nodes: NodeInfo[]) => {
              const lines = nodes.length
                ? [
                    '**Connected Nodes:**',
                    '',
                    '| Node | Type | Status |',
                    '|------|------|--------|',
                    ...nodes.map(
                      (n) => `| ${n.id} | ${n.status || '-'} | ${n.status || 'unknown'} |`,
                    ),
                  ]
                : ['*No nodes connected.*'];
              actions.addMessage(nodeSid, {
                role: 'assistant',
                content: lines.join('\n'),
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch(() => {
              actions.addMessage(nodeSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch nodes',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'tools': {
          const toolsSid = ensureSession();
          actions.addMessage(toolsSid, {
            role: 'user',
            content: `/tools${arg ? ' ' + arg : ''}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Loading tools...');
          fetch(`/api/tools${arg ? '?agent=' + encodeURIComponent(arg) : ''}`)
            .then(async (r) => (r.ok ? (r.json() as Promise<ToolInfo[]>) : []))
            .then((tools: ToolInfo[]) => {
              const lines = tools.length
                ? [
                    '**Available Tools:**',
                    '',
                    '| Tool | Category | Access |',
                    '|------|----------|--------|',
                    ...tools.map((t) => `| ${t.name} | ${t.type || '-'} | granted |`),
                  ]
                : ['*No tools found.*'];
              actions.addMessage(toolsSid, {
                role: 'assistant',
                content: lines.join('\n'),
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch(() => {
              actions.addMessage(toolsSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch tools',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'permissions': {
          const permSid = ensureSession();
          actions.addMessage(permSid, {
            role: 'user',
            content: `/permissions${arg ? ' ' + arg : ''}`,
            timestamp: Date.now(),
          });
          actions.setStatusLine('Loading permissions...');
          fetch(`/api/permissions${arg ? '?agent=' + encodeURIComponent(arg) : ''}`)
            .then(async (r) =>
              r.ok
                ? (r.json() as Promise<
                    {
                      agent?: string;
                      agentId?: string;
                      permission?: string;
                      name?: string;
                      level?: string;
                      access?: string;
                    }[]
                  >)
                : [],
            )
            .then(
              (
                perms: {
                  agent?: string;
                  agentId?: string;
                  permission?: string;
                  name?: string;
                  level?: string;
                  access?: string;
                }[],
              ) => {
                const lines = perms.length
                  ? [
                      '**Permissions:**',
                      '',
                      '| Agent | Permission | Level |',
                      '|-------|-----------|-------|',
                      ...perms.map(
                        (p) =>
                          `| ${p.agent || p.agentId || '-'} | ${p.permission || p.name} | ${p.level || p.access || 'granted'} |`,
                      ),
                    ]
                  : ['*No permissions data available.*'];
                actions.addMessage(permSid, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              },
            )
            .catch(() => {
              actions.addMessage(permSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch permissions',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'agents': {
          const agentsSid = ensureSession();
          actions.addMessage(agentsSid, {
            role: 'user',
            content: '/agents',
            timestamp: Date.now(),
          });
          actions.setStatusLine('Loading agents...');
          fetch('/api/agents')
            .then(async (r) =>
              r.ok
                ? (r.json() as Promise<(AgentInfo & { emoji?: string; status?: string })[]>)
                : [],
            )
            .then((agentList: (AgentInfo & { emoji?: string; status?: string })[]) => {
              const lines = agentList.length
                ? [
                    '**Agents:**',
                    '',
                    '| Agent | Status | Model |',
                    '|-------|--------|-------|',
                    ...agentList.map(
                      (a) =>
                        `| ${a.emoji || '●'} ${a.name} | ${a.status || 'idle'} | ${a.model || '-'} |`,
                    ),
                  ]
                : ['*No agents found.*'];
              actions.addMessage(agentsSid, {
                role: 'assistant',
                content: lines.join('\n'),
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch(() => {
              actions.addMessage(agentsSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch agents',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }
        case 'status': {
          const statusSid = ensureSession();
          actions.addMessage(statusSid, {
            role: 'user',
            content: '/status',
            timestamp: Date.now(),
          });
          actions.setStatusLine('Checking platform status...');
          fetch('/api/platform-status')
            .then(async (r) =>
              r.ok
                ? (r.json() as Promise<{
                    services: {
                      name: string;
                      healthy: boolean;
                      status?: string;
                      uptime?: string;
                    }[];
                    summary?: string;
                  }>)
                : { services: [] },
            )
            .then(
              (data: {
                services: { name: string; healthy: boolean; status?: string; uptime?: string }[];
                summary?: string;
              }) => {
                const services = data.services || [];
                const lines = services.length
                  ? [
                      '**Platform Status:**',
                      '',
                      '| Service | Status | Uptime |',
                      '|---------|--------|--------|',
                      ...services.map(
                        (s) =>
                          `| ${s.name} | ${s.healthy ? '✓' : '✗'} ${s.status || ''} | ${s.uptime || '-'} |`,
                      ),
                    ]
                  : ['*No status data available.*'];
                if (data.summary) lines.push('', `> ${data.summary}`);
                actions.addMessage(statusSid, {
                  role: 'assistant',
                  content: lines.join('\n'),
                  timestamp: Date.now(),
                });
                actions.setStatusLine(null);
              },
            )
            .catch(() => {
              actions.addMessage(statusSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch status',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }

        case 'apps': {
          const appsSid = ensureSession();
          actions.addMessage(appsSid, {
            role: 'user',
            content: `/apps ${arg}`.trim(),
            timestamp: Date.now(),
          });
          actions.setStatusLine('Loading app registry...');

          // Parse arg: /apps pos | /apps --domain retail | /apps
          const appArgs = arg.trim().split(/\s+/);
          const domainIdx = appArgs.indexOf('--domain');
          let fetchUrl = '/api/model-registry/apps';
          if (domainIdx !== -1 && appArgs[domainIdx + 1]) {
            fetchUrl = `/api/model-registry/apps?domain=${encodeURIComponent(appArgs[domainIdx + 1])}`;
          } else if (appArgs[0] && appArgs[0] !== '--domain') {
            fetchUrl = `/api/model-registry/apps/${encodeURIComponent(appArgs[0])}`;
          }

          fetch(fetchUrl)
            .then(async (r) =>
              r.ok
                ? (r.json() as Promise<AppRegistryResponse>)
                : Promise.resolve({ error: 'Not found' } as AppRegistryResponse),
            )
            .then((data) => {
              let lines: string[];
              if (data.error) {
                lines = [`**Error:** ${data.error}`];
              } else if (data.apps) {
                // List view
                const appList = data.apps as SkillInfo[];
                lines = [
                  `**App Model Registry** v${data.version} — ${data.count} apps`,
                  '',
                  '| App | Name | Domains | Local Model | LoRA |',
                  '|-----|------|---------|-------------|------|',
                  ...appList.map(
                    (a) =>
                      `| ${a.id} | ${a.name} | ${a.id} | ${(a.localModel || '').replace('ollama-remote/', '')} | - |`,
                  ),
                ];
              } else {
                // Detail view (single app)
                const a = data as SkillInfo;
                lines = [
                  `**${a.name}** (\`${a.id}\`)`,
                  '',
                  `| Property | Value |`,
                  `|----------|-------|`,
                  `| Local Model | \`${a.localModel}\` |`,
                  `| Description | ${a.description || '-'} |`,
                ];
              }
              actions.addMessage(appsSid, {
                role: 'assistant',
                content: lines.join('\n'),
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch(() => {
              actions.addMessage(appsSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch app registry',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }

        case 'resolve': {
          const resolveSid = ensureSession();
          actions.addMessage(resolveSid, {
            role: 'user',
            content: `/resolve ${arg}`.trim(),
            timestamp: Date.now(),
          });
          actions.setStatusLine('Resolving app model...');

          const resolveArgs = arg.trim().split(/\s+/);
          const resolveAppId = resolveArgs[0];
          if (!resolveAppId) {
            actions.addMessage(resolveSid, {
              role: 'assistant',
              content: '**Usage:** `/resolve <appId> [--local]`',
              timestamp: Date.now(),
            });
            actions.setStatusLine(null);
            break;
          }
          const isLocal = resolveArgs.includes('--local');
          const resolveUrl = `/api/model-registry/resolve/${encodeURIComponent(resolveAppId)}${isLocal ? '?local=true' : ''}`;

          fetch(resolveUrl)
            .then(async (r) =>
              r.ok
                ? (r.json() as Promise<{
                    error?: string;
                    appId?: string;
                    model?: string;
                    source?: string;
                    chain?: string[];
                  }>)
                : { error: 'Not found' },
            )
            .then(
              (data: {
                error?: string;
                appId?: string;
                model?: string;
                source?: string;
                chain?: string[];
              }) => {
                if (data.error) {
                  actions.addMessage(resolveSid, {
                    role: 'assistant',
                    content: `**Error:** ${data.error}`,
                    timestamp: Date.now(),
                  });
                } else {
                  const chain = (data.chain || []).map((m: string) => `\`${m}\``).join(' → ');
                  actions.addMessage(resolveSid, {
                    role: 'assistant',
                    content: [
                      `**Model Resolution** for \`${data.appId}\``,
                      '',
                      `| Property | Value |`,
                      `|----------|-------|`,
                      `| Model | \`${data.model}\` |`,
                      `| Source | ${data.source} |`,
                      `| Chain | ${chain} |`,
                    ].join('\n'),
                    timestamp: Date.now(),
                  });
                }
                actions.setStatusLine(null);
              },
            )
            .catch(() => {
              actions.addMessage(resolveSid, {
                role: 'assistant',
                content: '**Error:** Could not resolve model',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }

        case 'pricing': {
          const pricingSid = ensureSession();
          actions.addMessage(pricingSid, {
            role: 'user',
            content: '/pricing',
            timestamp: Date.now(),
          });
          actions.setStatusLine('Loading pricing...');

          // Fetch app list + build pricing summary from profiles
          fetch('/api/model-registry/apps')
            .then(async (r) => (r.ok ? (r.json() as Promise<{ apps: SkillInfo[] }>) : { apps: [] }))
            .then((data: { apps: SkillInfo[] }) => {
              const appList = data.apps || [];
              // Group by local model
              const modelGroups: Record<string, string[]> = {};
              for (const a of appList) {
                const local = (a.localModel || '').replace('ollama-remote/', '');
                if (!modelGroups[local]) modelGroups[local] = [];
                modelGroups[local].push(a.id);
              }
              const lines = [
                `**App Model Pricing Overview** — ${appList.length} apps`,
                '',
                '| Local Model | Apps | Cloud Escalation | LoRA |',
                '|-------------|------|------------------|------|',
                ...Object.entries(modelGroups).map(([model, appIds]) => {
                  const sample = appList.find(
                    (a) => (a.localModel || '').replace('ollama-remote/', '') === model,
                  );
                  const cloud = sample?.cloudModel?.replace('anthropic/', '') || '-';
                  const lora = sample?.training?.loraAdapter || '-';
                  return `| \`${model}\` | ${appIds.join(', ')} | \`${cloud}\` | ${lora} |`;
                }),
                '',
                '> Local models = $0/token. Cloud costs apply only on escalation.',
              ];
              actions.addMessage(pricingSid, {
                role: 'assistant',
                content: lines.join('\n'),
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            })
            .catch(() => {
              actions.addMessage(pricingSid, {
                role: 'assistant',
                content: '**Error:** Could not fetch pricing',
                timestamp: Date.now(),
              });
              actions.setStatusLine(null);
            });
          break;
        }

        default:
          actions.setStatusLine(`Unknown command: /${cmd}. Type /help for available commands.`);
          setTimeout(() => actions.setStatusLine(null), 3000);
      }
      setInput('');
      setSlashOpen(false);
    },
    [
      activeSessionId,
      activeAgentId,
      activeSession,
      messages,
      actions,
      stateCompact,
      cliMode,
      SLASH_COMMANDS,
      ensureSession,
      AVAILABLE_MODELS,
      setSelectedModel,
      setModelOverride,
      setInput,
      setCliMode,
      setCliContinue,
    ],
  );

  return {
    SLASH_COMMANDS,
    slashOpen,
    setSlashOpen,
    slashIndex,
    setSlashIndex,
    slashRef: slashRef as React.RefObject<HTMLDivElement>,
    slashFiltered,
    executeSlashCommand,
  };
}
