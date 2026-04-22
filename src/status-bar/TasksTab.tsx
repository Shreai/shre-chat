import { TASK_GROUPS, TASK_STATUS_CONFIG } from './constants';
import type { LiveAgent, LiveTask } from './types';

export interface TasksTabProps {
  liveTasks: LiveTask[];
  liveTasksLoading: boolean;
  liveAgents: LiveAgent[];
  panelSearch: string;
  taskActionMenu: string | null;
  taskActionPending: string | null;
  showAssignDropdown: string | null;
  setPanelSearch: (s: string) => void;
  setTaskActionMenu: (id: string | null) => void;
  setShowAssignDropdown: (id: string | null) => void;
  fetchLiveTasks: () => Promise<void> | void;
  navigateToTask: (taskId: string) => void;
  taskAction: (
    taskId: string,
    action: 'cancel' | 'escalate' | 'retry',
    e: React.MouseEvent,
  ) => Promise<void> | void;
  reassignTask: (taskId: string, agentId: string) => Promise<void> | void;
}

export function TasksTab(props: TasksTabProps) {
  const {
    liveTasks,
    liveTasksLoading,
    liveAgents,
    panelSearch,
    taskActionMenu,
    taskActionPending,
    showAssignDropdown,
    setPanelSearch,
    setTaskActionMenu,
    setShowAssignDropdown,
    fetchLiveTasks,
    navigateToTask,
    taskAction,
    reassignTask,
  } = props;

  return (
    <>
      {/* Search + refresh bar */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--c-border-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--c-text-4)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks..."
              value={panelSearch}
              onChange={(e) => setPanelSearch(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '5px 8px 5px 26px',
                fontSize: 12,
                background: 'var(--c-bg-1)',
                border: '1px solid var(--c-border-2)',
                borderRadius: 6,
                color: 'var(--c-text-1)',
                outline: 'none',
              }}
            />
          </div>
          <button
            onClick={fetchLiveTasks}
            disabled={liveTasksLoading}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--c-text-3)',
              padding: '4px',
              borderRadius: 4,
              flexShrink: 0,
              opacity: liveTasksLoading ? 0.5 : 1,
            }}
            title="Refresh"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: liveTasksLoading ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
          {liveTasks.length} task{liveTasks.length !== 1 ? 's' : ''}
          {panelSearch ? ` · filtered` : ''} · auto-refreshes
        </div>
      </div>
      {liveTasksLoading && liveTasks.length === 0 ? (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading tasks...</div>
        </div>
      ) : liveTasks.length === 0 ? (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--c-text-5)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 auto 12px' }}
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>No tasks found</div>
        </div>
      ) : (
        TASK_GROUPS.map((group) => {
          const searchLower = panelSearch.toLowerCase();
          const groupTasks = liveTasks.filter(
            (t) =>
              group.statuses.has(t.status) &&
              (!panelSearch ||
                t.title.toLowerCase().includes(searchLower) ||
                t.agent?.toLowerCase().includes(searchLower) ||
                t.status.includes(searchLower)),
          );
          if (groupTasks.length === 0) return null;
          return (
            <div key={group.label}>
              {/* Group header */}
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--c-text-4)',
                  background: 'var(--c-bg-1)',
                  borderBottom: '1px solid var(--c-border-2)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {group.label} ({groupTasks.length})
              </div>
              {groupTasks.map((task) => {
                const cfg = TASK_STATUS_CONFIG[task.status] || {
                  color: '#6b7280',
                  label: task.status,
                  icon: '\u25cb',
                };
                const isActive = ['in_progress', 'started', 'working_on'].includes(task.status);
                const isPending = taskActionPending === task.id;
                const isTerminal = [
                  'done',
                  'completed',
                  'cancelled',
                  'qa_tested',
                  'production_ready',
                ].includes(task.status);
                return (
                  <div
                    key={task.id}
                    onClick={() => navigateToTask(task.id)}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--c-border-2)',
                      transition: 'background 0.15s',
                      opacity: isPending ? 0.5 : 1,
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: cfg.color,
                          boxShadow: isActive ? `0 0 6px ${cfg.color}` : 'none',
                          animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: `${cfg.color}20`,
                          color: cfg.color,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                      {task.priority && ['high', 'critical'].includes(task.priority) && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: task.priority === 'critical' ? '#ef4444' : '#f59e0b',
                          }}
                        >
                          {task.priority === 'critical' ? '!!' : '!'}
                        </span>
                      )}
                      {/* Action menu trigger */}
                      {!isTerminal && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskActionMenu(taskActionMenu === task.id ? null : task.id);
                            setShowAssignDropdown(null);
                          }}
                          style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--c-text-4)',
                            padding: '2px 4px',
                            borderRadius: 4,
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                          title="Actions"
                        >
                          &#x22EE;
                        </button>
                      )}
                    </div>
                    {/* Action dropdown */}
                    {taskActionMenu === task.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 16,
                          top: 32,
                          zIndex: 10,
                          background: 'var(--c-bg-2)',
                          border: '1px solid var(--c-border-1)',
                          borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                          padding: 4,
                          minWidth: 140,
                        }}
                      >
                        <button
                          onClick={(e) => taskAction(task.id, 'escalate', e)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 10px',
                            borderRadius: 4,
                            fontSize: 12,
                            color: '#f59e0b',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'none';
                          }}
                        >
                          Escalate to critical
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAssignDropdown(showAssignDropdown === task.id ? null : task.id);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 10px',
                            borderRadius: 4,
                            fontSize: 12,
                            color: 'var(--c-text-2)',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'none';
                          }}
                        >
                          Reassign agent
                        </button>
                        {['failed', 'errored', 'crash_unrecoverable'].includes(task.status) && (
                          <button
                            onClick={(e) => taskAction(task.id, 'retry', e)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontSize: 12,
                              color: 'var(--c-accent, #6366f1)',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--c-bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'none';
                            }}
                          >
                            \u21bb Retry execution
                          </button>
                        )}
                        {showAssignDropdown === task.id && liveAgents.length > 0 && (
                          <div
                            style={{
                              padding: '4px 0',
                              borderTop: '1px solid var(--c-border-2)',
                              marginTop: 2,
                            }}
                          >
                            {liveAgents
                              .filter((a) => a.id !== task.agent)
                              .slice(0, 8)
                              .map((a) => (
                                <button
                                  key={a.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    reassignTask(task.id, a.id);
                                  }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px 10px 4px 18px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    color: 'var(--c-text-2)',
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.background =
                                      'var(--c-bg-hover)';
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.background = 'none';
                                  }}
                                >
                                  {a.name}
                                </button>
                              ))}
                          </div>
                        )}
                        <div
                          style={{
                            borderTop: '1px solid var(--c-border-2)',
                            marginTop: 2,
                            paddingTop: 2,
                          }}
                        >
                          <button
                            onClick={(e) => taskAction(task.id, 'cancel', e)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontSize: 12,
                              color: '#ef4444',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--c-bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'none';
                            }}
                          >
                            Cancel task
                          </button>
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--c-text-1)',
                        lineHeight: 1.4,
                        marginBottom: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.title}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      {task.agent && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--c-text-2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {task.agent}
                        </span>
                      )}
                      {task.quality_score != null && (
                        <span
                          style={{
                            fontSize: 11,
                            color:
                              task.quality_score >= 0.8
                                ? '#22c55e'
                                : task.quality_score >= 0.5
                                  ? '#f59e0b'
                                  : '#ef4444',
                          }}
                        >
                          Q: {(task.quality_score * 100).toFixed(0)}%
                        </span>
                      )}
                      {task.completion_ratio != null &&
                        task.completion_ratio > 0 &&
                        task.completion_ratio < 1 && (
                          <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                            {(task.completion_ratio * 100).toFixed(0)}% done
                          </span>
                        )}
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--c-text-4)',
                          marginLeft: 'auto',
                        }}
                      >
                        {new Date(task.updated_at || task.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </>
  );
}
