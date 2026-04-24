/**
 * useEscalationListener — listens for escalation events on /ws/notifications
 * and injects system messages into the active chat session.
 *
 * Event types handled:
 *   - ellie.escalation        — agent couldn't complete, Ellie investigating
 *   - chat.message             — resolution message appended to session
 *   - escalation.resolved      — escalation completed successfully
 *   - escalation.failed        — escalation failed, council notified
 *   - conversation.reopened    — reactive automation resuming a thread (targets
 *                                a specific sessionId; bypasses the
 *                                active-session filter so the follow-up lands
 *                                in the correct thread even when the user is
 *                                on a different one)
 */
import { useEffect, useRef, useCallback } from 'react';
import { setPlan, updateTaskStatus, updatePlanStatus, parsePlanTasks } from '../planStore';

interface EscalationEvent {
  type: string;
  title?: string;
  body?: string;
  sessionId?: string;
  source?: string;
  agentName?: string;
  content?: string;
  role?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

const ESCALATION_TYPES = new Set([
  'ellie.escalation',
  'chat.message',
  'escalation.resolved',
  'escalation.failed',
  'project_progress',
  'project_fallback',
  'project.pending_approval',
  'budget_warning',
  'budget_blocked',
  'file_diff',
  'approval.requested',
  'approval.resolved',
  'conversation.reopened',
]);

interface UseEscalationListenerOptions {
  activeSessionId: string | null;
  addMessage: (
    sessionId: string,
    msg: {
      role: 'user' | 'assistant';
      content: string;
      timestamp?: number;
      meta?: Record<string, string>;
    },
  ) => void;
}

export function useEscalationListener({
  activeSessionId,
  addMessage,
}: UseEscalationListenerOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);

  // Keep ref in sync so the WS handler always sees the latest sessionId
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const injectSystemMessage = useCallback(
    (sessionId: string, content: string, event: string) => {
      addMessage(sessionId, {
        role: 'assistant',
        content: `[system] ${content}`,
        timestamp: Date.now(),
        meta: { system: 'true', type: 'escalation', event },
      });
    },
    [addMessage],
  );

  useEffect(() => {
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws/notifications`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data: EscalationEvent = JSON.parse(event.data);
          if (!data.type || !ESCALATION_TYPES.has(data.type)) return;

          // `conversation.reopened` is routed BEFORE the active-session
          // filter — reactive automation can resume a thread the user isn't
          // currently looking at, and the follow-up message must still land
          // in the correct session's history so it renders on switch-in.
          if (data.type === 'conversation.reopened') {
            const targetSession = data.sessionId;
            if (!targetSession) return;
            const d = data as unknown as Record<string, unknown>;
            const reason = String(d.reason || 'resumed');
            const content = String(d.message || '').trim() || `[Shre follow-up: ${reason}]`;
            addMessage(targetSession, {
              role: 'assistant',
              content,
              timestamp: Date.now(),
              meta: {
                system: 'true',
                type: 'conversation.reopened',
                reason,
                ruleId: String(d.ruleId || ''),
                source: String(d.source || 'shre-cron:reactive'),
              },
            });
            return;
          }

          const currentSession = activeSessionIdRef.current;
          if (!currentSession) return;

          // Filter: only process events for the current session (or unscoped events)
          if (data.sessionId && data.sessionId !== currentSession) return;

          switch (data.type) {
            case 'ellie.escalation': {
              const agentName = data.agentName || data.source || 'An agent';
              injectSystemMessage(
                currentSession,
                `${agentName} couldn't complete your request. Ellie is investigating and will follow up.`,
                'ellie.escalation',
              );
              break;
            }

            case 'chat.message': {
              // Resolution message from Ellie — add as a real assistant message
              const content = data.content || data.body || '';
              if (content) {
                addMessage(currentSession, {
                  role: 'assistant',
                  content,
                  timestamp: Date.now(),
                  meta: { source: data.source || 'ellie', event: 'escalation.resolution' },
                });
              }
              break;
            }

            case 'escalation.resolved': {
              injectSystemMessage(
                currentSession,
                'Ellie resolved the issue.',
                'escalation.resolved',
              );
              break;
            }

            case 'escalation.failed': {
              injectSystemMessage(
                currentSession,
                "Escalation couldn't be resolved. The Architecture Council has been notified.",
                'escalation.failed',
              );
              break;
            }

            case 'project_fallback': {
              injectSystemMessage(
                currentSession,
                'Project decomposition unavailable — creating single task instead.',
                'project_fallback',
              );
              break;
            }

            case 'project.pending_approval': {
              const subtaskCount = (data as Record<string, unknown>).subtaskCount || 0;
              const summary = String((data as Record<string, unknown>).summary || '');
              const projectId = String((data as Record<string, unknown>).projectId || '');
              const planText = summary ? `\n${summary}` : '';

              // Populate plan store for interactive checklist
              if (projectId) {
                const tasks = parsePlanTasks(summary);
                setPlan(projectId, {
                  projectId,
                  tasks:
                    tasks.length > 0
                      ? tasks
                      : Array.from({ length: Number(subtaskCount) || 0 }, (_, i) => ({
                          id: `task-${i + 1}`,
                          title: `Task ${i + 1}`,
                          status: 'pending' as const,
                        })),
                  status: 'pending_approval',
                });
              }

              injectSystemMessage(
                currentSession,
                `[project_pending] Project plan ready — ${subtaskCount} tasks.${planText}\nProject ID: ${projectId}`,
                'project.pending_approval',
              );
              break;
            }

            case 'budget_warning':
            case 'budget_blocked': {
              const budgetMsg =
                (data as Record<string, unknown>).message ||
                `Budget ${data.type === 'budget_blocked' ? 'exceeded' : 'warning'} for agent ${(data as Record<string, unknown>).agentId || 'unknown'}.`;
              injectSystemMessage(currentSession, String(budgetMsg), data.type);
              break;
            }

            case 'approval.requested': {
              const d = data as unknown as Record<string, unknown>;
              const approvalId = d.approvalId || '';
              const action = d.action || 'browser action';
              const target = d.target || '';
              const agent = d.agentId || d.agent || '';
              const reason = d.reason || '';
              const risk = d.risk || 'medium';
              injectSystemMessage(
                currentSession,
                `[browser_approval] Approval ID: ${approvalId}\nAction: ${action}\nTarget: ${target}\nAgent: ${agent}\nReason: ${reason}\nRisk: ${risk}`,
                'approval.requested',
              );
              break;
            }

            case 'approval.resolved': {
              const d = data as unknown as Record<string, unknown>;
              const status = d.status || 'resolved';
              const action = d.action || 'browser action';
              const target = d.target || '';
              const agent = d.agentId || '';
              const tag = status === 'approved' ? '[browser_approved]' : '[browser_denied]';
              const verb = status === 'approved' ? 'approved — executing' : 'denied — cancelled';
              injectSystemMessage(
                currentSession,
                `${tag} Browser ${String(action).replace('browser_', '')} ${verb}${target ? ` (${target})` : ''}${agent ? ` for ${agent}` : ''}`,
                'approval.resolved',
              );
              break;
            }

            case 'project_progress': {
              const subtype =
                data.metadata?.subtype || (data as Record<string, unknown>).subtype || '';
              const taskTitle = (data as Record<string, unknown>).taskTitle || 'Task';
              const agent = (data as Record<string, unknown>).agent || '';
              const quality = (data as Record<string, unknown>).quality;
              const progress = (data as Record<string, unknown>).progress || '';
              const reason = (data as Record<string, unknown>).reason || '';
              const progressProjectId = String((data as Record<string, unknown>).projectId || '');

              // Update plan store based on subtype
              if (progressProjectId) {
                switch (subtype) {
                  case 'task_assigned':
                    updateTaskStatus(
                      progressProjectId,
                      String(taskTitle),
                      'assigned',
                      String(agent),
                    );
                    break;
                  case 'task_completed':
                    updateTaskStatus(
                      progressProjectId,
                      String(taskTitle),
                      'completed',
                      String(agent),
                      quality != null ? Number(quality) : undefined,
                    );
                    break;
                  case 'task_failed':
                    updateTaskStatus(progressProjectId, String(taskTitle), 'failed', String(agent));
                    break;
                  case 'project_completed':
                    updatePlanStatus(progressProjectId, 'completed');
                    break;
                }
              }

              let message = '';
              switch (subtype) {
                case 'task_assigned':
                  message = `[project_progress:task_assigned] ${agent} picked up: ${taskTitle}${progress ? ` (${progress})` : ''}`;
                  break;
                case 'task_completed':
                  message = `[project_progress:task_completed] ${taskTitle} completed by ${agent}${quality ? ` — quality ${quality}` : ''}${progress ? ` (${progress})` : ''}`;
                  break;
                case 'task_failed':
                  message = `[project_progress:task_failed] ${taskTitle} failed${agent ? ` (${agent})` : ''}${reason ? ` — ${reason}` : ''}${progress ? ` (${progress})` : ''}`;
                  break;
                case 'project_created':
                  message = `[project_progress:project_created] New project: ${taskTitle}`;
                  break;
                case 'project_decomposed':
                  message = `[project_progress:project_decomposed] ${taskTitle} broken into ${progress || 'subtasks'}`;
                  break;
                case 'project_completed':
                  message = `[project_progress:project_completed] Project complete: ${taskTitle}${progress ? ` (${progress})` : ''}`;
                  break;
                case 'quality_gate_failed': {
                  const minQ = (data as Record<string, unknown>).minQuality || 3.0;
                  message = `[project_progress:quality_gate_failed] ⚠️ Project PAUSED — ${taskTitle} scored ${quality}/${minQ} quality. ${progress || ''}. Type "resume" to continue or "cancel" to abort.`;
                  break;
                }
                case 'merge_pr_created': {
                  const prUrl = (data as Record<string, unknown>).prUrl || '';
                  message = `[project_progress:pr_created] 🔗 Pull request created: ${prUrl || taskTitle}${agent ? ` (${agent})` : ''}`;
                  break;
                }
                default:
                  message = `[project_progress] ${taskTitle}${progress ? ` — ${progress}` : ''}`;
              }

              injectSystemMessage(currentSession, message, `project_progress.${subtype}`);
              break;
            }

            case 'file_diff': {
              const filePath = (data as Record<string, unknown>).path || '';
              const action = (data as Record<string, unknown>).subtype || 'edit';
              const agent = (data as Record<string, unknown>).agentId || '';
              const lines = (data as Record<string, unknown>).linesChanged || 0;
              const preview = String((data as Record<string, unknown>).preview || '').slice(0, 200);
              const icon = action === 'create' ? '📄' : '✏️';
              const msg = `[file_diff] ${icon} ${agent} ${action}d ${filePath} (${lines} lines)${preview ? `\n\`\`\`\n${preview}\n\`\`\`` : ''}`;
              injectSystemMessage(currentSession, msg, 'file_diff');
              break;
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        // Auto-reconnect after 5s
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            connect();
          }
        }, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [injectSystemMessage, addMessage]);
}
