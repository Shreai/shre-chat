import { useApp, getAgent, type ActivityEvent } from './store';
import type { ActivityStatus } from './openclaw';

const STATUS_ICONS: Record<ActivityStatus, string> = {
  connecting: '🔗',
  thinking: '🧠',
  planning: '📋',
  writing: '✍️',
  researching: '⊕',
  executing: '▶',
  tool_call: '⚡',
  done: '✅',
  attention: '⚠️',
  warning: '⚠️',
  error: '❌',
};

const STATUS_COLORS: Record<ActivityStatus, string> = {
  connecting: 'text-yellow-400',
  thinking: 'text-amber-400',
  planning: 'text-violet-400',
  writing: 'text-blue-400',
  researching: 'text-cyan-400',
  executing: 'text-orange-400',
  tool_call: 'text-amber-400',
  done: 'text-emerald-400',
  attention: 'text-yellow-400',
  warning: 'text-orange-400',
  error: 'text-red-400',
};

export function ActivityView() {
  const { state, actions } = useApp();
  const { activity, activeAgentId } = state;
  const currentAgent = getAgent(activeAgentId);

  const filtered = activity.filter((a) => (a.agentId || 'main') === activeAgentId);
  const grouped = new Map<string, { title: string; events: ActivityEvent[] }>();
  for (const evt of [...filtered].reverse()) {
    if (!grouped.has(evt.sessionId)) {
      grouped.set(evt.sessionId, { title: evt.sessionTitle, events: [] });
    }
    grouped.get(evt.sessionId)!.events.push(evt);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm"
        style={{ background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
            style={{ color: 'var(--c-text-4)' }}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            {currentAgent.emoji} {currentAgent.name} Activity
          </h1>
          <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
            {filtered.length} events
          </span>
        </div>
        {activity.length > 0 && (
          <button
            onClick={() => {
              localStorage.removeItem('shre-activity');
              window.location.reload();
            }}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--c-text-4)' }}
          >
            Clear
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {grouped.size === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-20">
            <svg
              className="h-10 w-10"
              style={{ color: 'var(--c-text-5)' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              No activity yet
            </p>
          </div>
        )}

        <div className="space-y-6 max-w-2xl mx-auto">
          {Array.from(grouped.entries()).map(([sessionId, group]) => (
            <div key={sessionId}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
                  {group.title}
                </span>
                <button
                  onClick={() => {
                    actions.switchSession(sessionId);
                    actions.setView('chat');
                  }}
                  className="text-[10px] text-shre-400/70 hover:text-shre-400"
                >
                  Open →
                </button>
              </div>

              <div className="space-y-1 pl-3" style={{ borderLeft: '1px solid var(--c-border-2)' }}>
                {group.events.slice(0, 8).map((evt) => (
                  <div key={evt.id} className="flex items-center gap-2 py-0.5">
                    <span className={`text-xs ${STATUS_COLORS[evt.status]}`}>
                      {STATUS_ICONS[evt.status]}
                    </span>
                    <span className="text-[11px] flex-1" style={{ color: 'var(--c-text-3)' }}>
                      {evt.summary}
                    </span>
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--c-text-5)' }}>
                      {formatTime(evt.timestamp)}
                    </span>
                  </div>
                ))}
                {group.events.length > 8 && (
                  <span className="text-[10px] pl-5" style={{ color: 'var(--c-text-5)' }}>
                    +{group.events.length - 8} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}
