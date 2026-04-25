import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { NOTIF_FILTERS, NOTIF_ICONS } from './constants';
import { getAuthHeaders } from './helpers';
import { TasksTab } from './TasksTab';
import type { LiveAgent, LiveService, LiveTask, NotifFilter, Notification } from './types';

export interface NotificationPanelProps {
  bellOpen: boolean;
  panelRef: RefObject<HTMLDivElement>;
  notifications: Notification[];
  notifFilter: NotifFilter;
  liveTasks: LiveTask[];
  liveTasksLoading: boolean;
  liveAgents: LiveAgent[];
  liveAgentsLoading: boolean;
  liveServices: LiveService[];
  liveServicesLoading: boolean;
  taskActionMenu: string | null;
  taskActionPending: string | null;
  showAssignDropdown: string | null;
  panelSearch: string;
  restartingService: string | null;
  setBellOpen: (open: boolean) => void;
  setNotifFilter: (f: NotifFilter) => void;
  setTaskActionMenu: (id: string | null) => void;
  setShowAssignDropdown: (id: string | null) => void;
  setPanelSearch: (s: string) => void;
  clearAll: () => Promise<void> | void;
  markRead: (id: string) => Promise<void> | void;
  dismissNotif: (id: string, e: React.MouseEvent) => Promise<void> | void;
  navigateToTask: (taskId: string) => void;
  fetchLiveTasks: () => Promise<void> | void;
  fetchLiveAgents: () => Promise<void> | void;
  fetchLiveServices: () => Promise<void> | void;
  taskAction: (
    taskId: string,
    action: 'cancel' | 'escalate' | 'retry',
    e: React.MouseEvent,
  ) => Promise<void> | void;
  reassignTask: (taskId: string, agentId: string) => Promise<void> | void;
  restartService: (serviceName: string, e: React.MouseEvent) => Promise<void> | void;
}

export function NotificationPanel(props: NotificationPanelProps) {
  const {
    bellOpen,
    panelRef,
    notifications,
    notifFilter,
    liveTasks,
    liveTasksLoading,
    liveAgents,
    liveAgentsLoading,
    liveServices,
    liveServicesLoading,
    taskActionMenu,
    taskActionPending,
    showAssignDropdown,
    panelSearch,
    restartingService,
    setBellOpen,
    setNotifFilter,
    setTaskActionMenu,
    setShowAssignDropdown,
    setPanelSearch,
    clearAll,
    markRead,
    dismissNotif,
    navigateToTask,
    fetchLiveTasks,
    fetchLiveAgents,
    fetchLiveServices,
    taskAction,
    reassignTask,
    restartService,
  } = props;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 199,
          background: 'rgba(0,0,0,0.3)',
          opacity: bellOpen ? 1 : 0,
          pointerEvents: bellOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        onClick={() => setBellOpen(false)}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 200,
          width: 360,
          maxWidth: '90vw',
          transform: bellOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'var(--c-bg-2)',
          borderLeft: '1px solid var(--c-border-1)',
          boxShadow: bellOpen ? '-8px 0 30px rgba(0,0,0,0.3)' : 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--c-border-2)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text-1)' }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'var(--c-text-3)',
                    padding: '4px 8px',
                    borderRadius: 6,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--c-danger, #ef4444)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--c-text-3)';
                  }}
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setBellOpen(false)}
                style={{
                  background: 'var(--c-bg-hover)',
                  border: 'none',
                  cursor: 'pointer',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--c-text-3)',
                }}
                aria-label="Close notifications"
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
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {NOTIF_FILTERS.map((f) => {
              const count =
                f.key === 'tasks'
                  ? liveTasks.length
                  : f.key === 'agents'
                    ? liveAgents.length
                    : f.key === 'services'
                      ? liveServices.length
                      : notifications.length;
              const active = notifFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setNotifFilter(f.key);
                    setPanelSearch('');
                  }}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    background: active
                      ? 'var(--c-accent, #6366f1)'
                      : 'var(--c-bg-card, var(--c-bg-1))',
                    color: active ? '#fff' : 'var(--c-text-3)',
                    border: `1px solid ${active ? 'transparent' : 'var(--c-border-2)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  {f.label}
                  {count > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        background: active ? 'rgba(255,255,255,0.25)' : 'var(--c-bg-hover)',
                        padding: '1px 5px',
                        borderRadius: 8,
                        lineHeight: '14px',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {notifFilter === 'tasks' ? (
            <TasksTab
              liveTasks={liveTasks}
              liveTasksLoading={liveTasksLoading}
              liveAgents={liveAgents}
              panelSearch={panelSearch}
              taskActionMenu={taskActionMenu}
              taskActionPending={taskActionPending}
              showAssignDropdown={showAssignDropdown}
              setPanelSearch={setPanelSearch}
              setTaskActionMenu={setTaskActionMenu}
              setShowAssignDropdown={setShowAssignDropdown}
              fetchLiveTasks={fetchLiveTasks}
              navigateToTask={navigateToTask}
              taskAction={taskAction}
              reassignTask={reassignTask}
            />
          ) : notifFilter === 'agents' ? (
            /* ── Live Agents Panel (enriched with fleet data) ── */
            <>
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
                      placeholder="Search agents..."
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
                    onClick={fetchLiveAgents}
                    disabled={liveAgentsLoading}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--c-text-3)',
                      padding: '4px',
                      borderRadius: 4,
                      flexShrink: 0,
                      opacity: liveAgentsLoading ? 0.5 : 1,
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
                        animation: liveAgentsLoading ? 'spin 1s linear infinite' : 'none',
                      }}
                    >
                      <path d="M23 4v6h-6" />
                      <path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
                  {liveAgents.filter((a) => a.status === 'busy').length} busy / {liveAgents.length}{' '}
                  total
                </div>
              </div>
              {liveAgentsLoading && liveAgents.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading agents...</div>
                </div>
              ) : liveAgents.length === 0 ? (
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
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>No agents registered</div>
                </div>
              ) : (
                liveAgents
                  .filter(
                    (a) =>
                      !panelSearch ||
                      a.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                      a.model.toLowerCase().includes(panelSearch.toLowerCase()) ||
                      a.currentTask?.title?.toLowerCase().includes(panelSearch.toLowerCase()),
                  )
                  .map((agent) => {
                    const isBusy = agent.status === 'busy';
                    const task = agent.currentTask;
                    return (
                      <div
                        key={agent.id}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--c-border-2)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: isBusy ? '#8b5cf6' : '#22c55e',
                              animation: isBusy ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--c-text-1)',
                              }}
                            >
                              {agent.name || agent.id}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>
                              {agent.model}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background:
                                agent.status === 'stuck'
                                  ? '#f59e0b20'
                                  : agent.status === 'dead'
                                    ? '#ef444420'
                                    : isBusy
                                      ? '#8b5cf620'
                                      : '#22c55e20',
                              color:
                                agent.status === 'stuck'
                                  ? '#f59e0b'
                                  : agent.status === 'dead'
                                    ? '#ef4444'
                                    : isBusy
                                      ? '#8b5cf6'
                                      : '#22c55e',
                            }}
                          >
                            {agent.status || (isBusy ? 'busy' : 'idle')}
                          </span>
                          {(agent.status === 'stuck' || agent.status === 'dead') && task && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `Restart stuck agent ${agent.name} for task ${task.title.slice(0, 20)}...?`,
                                  )
                                ) {
                                  try {
                                    await fetch(`/api/agents/${task.taskId}/restart`, {
                                      method: 'POST',
                                      headers: getAuthHeaders(),
                                    });
                                  } catch (err) {
                                    console.error('Failed to restart agent', err);
                                  }
                                }
                              }}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--c-accent-1)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                marginLeft: 6,
                              }}
                            >
                              Restart
                            </button>
                          )}
                        </div>
                        {/* Current task info */}
                        {task && (
                          <div
                            style={{
                              marginTop: 6,
                              marginLeft: 16,
                              padding: '4px 8px',
                              borderRadius: 4,
                              background: 'var(--c-bg-1)',
                              fontSize: 11,
                              color: 'var(--c-text-2)',
                            }}
                          >
                            <div
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: 500,
                              }}
                            >
                              {task.title}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                marginTop: 2,
                                color: 'var(--c-text-4)',
                                fontSize: 10,
                              }}
                            >
                              {task.phase && <span>{task.phase}</span>}
                              {task.progress && <span>{task.progress}</span>}
                              {task.elapsedMs != null && (
                                <span>{Math.round(task.elapsedMs / 60000)}m elapsed</span>
                              )}
                              {task.type && (
                                <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
                                  {task.type}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </>
          ) : notifFilter === 'services' ? (
            /* ── Live Services Panel (enriched with latency/uptime) ── */
            <>
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
                      placeholder="Search services..."
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
                    onClick={fetchLiveServices}
                    disabled={liveServicesLoading}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--c-text-3)',
                      padding: '4px',
                      borderRadius: 4,
                      flexShrink: 0,
                      opacity: liveServicesLoading ? 0.5 : 1,
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
                        animation: liveServicesLoading ? 'spin 1s linear infinite' : 'none',
                      }}
                    >
                      <path d="M23 4v6h-6" />
                      <path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>
                  {liveServices.filter((s) => s.healthy).length}/{liveServices.length} healthy
                </div>
              </div>
              {liveServicesLoading && liveServices.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading services...</div>
                </div>
              ) : liveServices.length === 0 ? (
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
                    <rect x="2" y="2" width="20" height="8" rx="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" />
                    <circle cx="6" cy="6" r="1" />
                    <circle cx="6" cy="18" r="1" />
                  </svg>
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                    No service data available
                  </div>
                </div>
              ) : (
                liveServices
                  .filter(
                    (s) =>
                      !panelSearch ||
                      s.name.toLowerCase().includes(panelSearch.toLowerCase()) ||
                      s.status?.toLowerCase().includes(panelSearch.toLowerCase()),
                  )
                  .map((svc) => {
                    const isRestarting = restartingService === svc.name;
                    return (
                      <div
                        key={svc.name}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--c-border-2)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: svc.healthy ? '#22c55e' : '#ef4444',
                              boxShadow: !svc.healthy ? '0 0 6px #ef4444' : 'none',
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--c-text-1)',
                              }}
                            >
                              {svc.name}
                              {svc.port && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: 'var(--c-text-4)',
                                    marginLeft: 4,
                                  }}
                                >
                                  :{svc.port}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                fontSize: 10,
                                color: 'var(--c-text-4)',
                                marginTop: 2,
                              }}
                            >
                              {svc.latency_ms != null && (
                                <span
                                  style={{
                                    color:
                                      svc.latency_ms < 100
                                        ? '#22c55e'
                                        : svc.latency_ms < 500
                                          ? '#f59e0b'
                                          : '#ef4444',
                                  }}
                                >
                                  {svc.latency_ms}ms
                                </span>
                              )}
                              {svc.uptime_pct != null && (
                                <span
                                  style={{
                                    color:
                                      svc.uptime_pct >= 99.9
                                        ? '#22c55e'
                                        : svc.uptime_pct >= 95
                                          ? '#f59e0b'
                                          : '#ef4444',
                                  }}
                                >
                                  {svc.uptime_pct.toFixed(1)}% uptime
                                </span>
                              )}
                              {svc.type && <span>{svc.type}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {!svc.healthy && (
                              <button
                                onClick={(e) => restartService(svc.name, e)}
                                disabled={isRestarting}
                                style={{
                                  background: isRestarting ? 'var(--c-bg-hover)' : '#ef444415',
                                  border: '1px solid #ef444430',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: '#ef4444',
                                  cursor: isRestarting ? 'wait' : 'pointer',
                                  opacity: isRestarting ? 0.6 : 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  whiteSpace: 'nowrap',
                                }}
                                title={`Restart ${svc.name}`}
                              >
                                {isRestarting ? (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ animation: 'spin 1s linear infinite' }}
                                  >
                                    <path d="M23 4v6h-6" />
                                    <path d="M1 20v-6h6" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                  </svg>
                                ) : (
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
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                  </svg>
                                )}
                                {isRestarting ? 'Starting...' : 'Start'}
                              </button>
                            )}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: svc.healthy ? '#22c55e20' : '#ef444420',
                                color: svc.healthy ? '#22c55e' : '#ef4444',
                              }}
                            >
                              {svc.status || (svc.healthy ? 'up' : 'down')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </>
          ) : (
            /* ── "All" Tab — live summary cards + notification stream ── */
            <>
              {/* Search bar */}
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--c-border-2)' }}>
                <div style={{ position: 'relative' }}>
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
                    placeholder="Search notifications..."
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
              </div>
              {/* Live summary cards at top */}
              {(() => {
                const activeTasks = liveTasks.filter((t) =>
                  ['in_progress', 'started', 'working_on'].includes(t.status),
                );
                const blockedTasks = liveTasks.filter((t) =>
                  ['blocked', 'roadblock'].includes(t.status),
                );
                const unhealthySvcs = liveServices.filter((s) => !s.healthy);
                const busyAgents = liveAgents.filter((a) => a.status === 'busy');
                const hasLiveData =
                  activeTasks.length > 0 ||
                  blockedTasks.length > 0 ||
                  unhealthySvcs.length > 0 ||
                  busyAgents.length > 0;
                if (!hasLiveData) return null;
                return (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--c-border-2)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    {activeTasks.length > 0 && (
                      <button
                        onClick={() => setNotifFilter('tasks')}
                        style={{
                          background: '#8b5cf615',
                          border: '1px solid #8b5cf630',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          color: '#8b5cf6',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#8b5cf6',
                            animation: 'pulse-dot 2s ease-in-out infinite',
                          }}
                        />
                        {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}
                      </button>
                    )}
                    {blockedTasks.length > 0 && (
                      <button
                        onClick={() => setNotifFilter('tasks')}
                        style={{
                          background: '#ef444415',
                          border: '1px solid #ef444430',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        {blockedTasks.length} blocked
                      </button>
                    )}
                    {busyAgents.length > 0 && (
                      <button
                        onClick={() => setNotifFilter('agents')}
                        style={{
                          background: '#8b5cf615',
                          border: '1px solid #8b5cf630',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          color: '#8b5cf6',
                          cursor: 'pointer',
                        }}
                      >
                        {busyAgents.length} agent{busyAgents.length !== 1 ? 's' : ''} busy
                      </button>
                    )}
                    {unhealthySvcs.length > 0 && (
                      <button
                        onClick={() => setNotifFilter('services')}
                        style={{
                          background: '#ef444415',
                          border: '1px solid #ef444430',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        {unhealthySvcs.length} service{unhealthySvcs.length !== 1 ? 's' : ''} down
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Notification stream */}
              {(() => {
                const filtered = panelSearch
                  ? notifications.filter(
                      (n) =>
                        n.title.toLowerCase().includes(panelSearch.toLowerCase()) ||
                        n.body?.toLowerCase().includes(panelSearch.toLowerCase()) ||
                        n.source?.toLowerCase().includes(panelSearch.toLowerCase()),
                    )
                  : notifications;
                return filtered.length === 0 ? (
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
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                      {panelSearch ? 'No matching notifications' : 'No notifications yet'}
                    </div>
                  </div>
                ) : (
                  filtered.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                      }}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--c-border-2)',
                        background: n.read
                          ? 'transparent'
                          : 'var(--c-accent-soft, rgba(99,141,255,0.08))',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = n.read
                          ? 'transparent'
                          : 'var(--c-accent-soft, rgba(99,141,255,0.08))';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            flexShrink: 0,
                            marginTop: 5,
                            background:
                              n.type?.includes('failed') || n.type?.includes('unhealthy')
                                ? 'var(--c-danger, #ef4444)'
                                : n.type?.includes('quality')
                                  ? '#f59e0b'
                                  : 'var(--c-accent)',
                          }}
                        />
                        <span style={{ fontSize: 15, flexShrink: 0 }}>
                          {NOTIF_ICONS[n.type] || '\ud83d\udd14'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: n.read ? 400 : 600,
                              color: 'var(--c-text-1)',
                              lineHeight: 1.4,
                            }}
                          >
                            {n.title}
                          </div>
                          {n.body && (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--c-text-2)',
                                marginTop: 4,
                                lineHeight: 1.4,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {n.body}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--c-text-3)', marginTop: 5 }}>
                            {new Date(n.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                            {n.source && <span> &middot; {n.source}</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => dismissNotif(n.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--c-text-3)',
                            padding: '4px',
                            flexShrink: 0,
                            borderRadius: 6,
                            transition: 'color 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.color = 'var(--c-danger)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.color = 'var(--c-text-3)';
                          }}
                          title="Dismiss"
                          aria-label="Dismiss notification"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                );
              })()}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
