import { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from './store';

interface BriefingData {
  greeting: string;
  timestamp: string;
  warnings?: string[];
  sections: {
    tasks?: {
      total: number;
      overdue: number;
      due_today: number;
      items: { title: string; status: string; priority?: string; due?: string }[];
    };
    agents?: {
      active: number;
      total: number;
      recent: { id: string; name: string; lastActivity: string; messageCount: number }[];
    };
    conversations?: {
      today: number;
      unread: number;
      recent: { agent: string; preview: string; time: string }[];
    };
    reminders?: {
      upcoming: number;
      items: { id: string; text: string; due: string; overdue: boolean }[];
    };
    calendar?: {
      upcoming: number;
      items: { title: string; time: string; minutesAway: number; meetingUrl: string | null }[];
    };
    weather?: { temp: string; condition: string; location: string };
    tip?: string;
  };
}

export function BriefingView() {
  const ctx = useContext(AppContext);
  const actions = ctx?.actions;
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(0);
  const [autoDisabled, setAutoDisabled] = useState(
    () => localStorage.getItem('shre-briefing-disabled') === '1',
  );

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token =
        sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token');
      let headers: Record<string, string> = {};
      if (token && token !== 'null' && token !== 'undefined') {
        headers.Authorization = `Bearer ${token}`;
      }
      let res = await fetch('/api/briefing', {
        headers,
      });
      if (!res.ok && headers.Authorization) {
        // Stored token can be stale; retry once without forcing auth header.
        headers = {};
        res = await fetch('/api/briefing', { headers });
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setBriefing(data);
      setLastRefresh(Date.now());
      // Mark briefing as shown today (so auto-show doesn't repeat)
      localStorage.setItem('shre-last-briefing-date', new Date().toDateString());
    } catch (e: any) {
      setError(e.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  if (loading)
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--c-bg)' }}
      >
        <div className="animate-pulse text-sm" style={{ color: 'var(--c-text-3)' }}>
          Loading your briefing...
        </div>
      </div>
    );

  if (error)
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3"
        style={{ background: 'var(--c-bg)' }}
      >
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          Could not load briefing
        </p>
        <button
          onClick={fetchBriefing}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--c-accent)', color: 'var(--c-on-accent)' }}
        >
          Retry
        </button>
      </div>
    );

  if (!briefing) return null;
  const sections = briefing.sections ?? ({} as BriefingData['sections']);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* View header — consistent with Activity/Feed views */}
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm"
        style={{ background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions?.setSidebarOpen(!ctx?.state.sidebarOpen)}
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
            Daily Briefing
          </h1>
          <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBriefing}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--c-text-4)' }}
            title="Refresh"
          >
            Refresh
          </button>
          <button
            onClick={() => actions?.setView('chat')}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--c-accent)' }}
          >
            Go to Chat →
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--c-bg)' }}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Greeting */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>
              {briefing.greeting}
            </h2>
            {lastRefresh > 0 && (
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                Updated{' '}
                {new Date(lastRefresh).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>

          {/* Partial error warnings */}
          {briefing.warnings && briefing.warnings.length > 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
              style={{
                background: 'rgba(234,179,8,0.12)',
                border: '1px solid rgba(234,179,8,0.3)',
                color: 'rgb(202,138,4)',
              }}
            >
              <svg
                className="h-4 w-4 flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <span className="font-medium">Some data unavailable: </span>
                {briefing.warnings.join(', ')}
              </div>
            </div>
          )}

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard
              label="Tasks Due"
              value={sections.tasks?.due_today ?? 0}
              accent={sections.tasks?.overdue ? true : false}
              sub={sections.tasks?.overdue ? `${sections.tasks.overdue} overdue` : undefined}
            />
            <StatCard
              label="Meetings"
              value={sections.calendar?.upcoming ?? 0}
              accent={sections.calendar?.items?.some((c) => c.minutesAway < 15) ?? false}
              sub={
                sections.calendar?.items?.[0]
                  ? `Next: ${sections.calendar.items[0].time}`
                  : undefined
              }
            />
            <StatCard
              label="Active Agents"
              value={sections.agents?.active ?? 0}
              sub={`of ${sections.agents?.total ?? 0}`}
            />
            <StatCard label="Chats Today" value={sections.conversations?.today ?? 0} />
            <StatCard
              label="Reminders"
              value={sections.reminders?.upcoming ?? 0}
              accent={sections.reminders?.items?.some((r) => r.overdue) ?? false}
            />
          </div>

          {/* Tasks Section */}
          {sections.tasks && sections.tasks.items.length > 0 && (
            <BriefingSection
              title="Tasks"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              }
            >
              <div className="space-y-2">
                {sections.tasks.items.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{ background: 'var(--c-bg-2)' }}
                    title="Click to get help with this task"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('shre-prefill', {
                          detail: { text: 'Help me with: ' + t.title },
                        }),
                      );
                      actions?.setView('chat');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--c-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--c-bg-2)';
                    }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'}`}
                    />
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--c-text-1)' }}>
                      {t.title}
                    </span>
                    <span
                      className="text-[11px] flex-shrink-0"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      {t.status}
                    </span>
                    {t.due && (
                      <span
                        className="text-[11px] flex-shrink-0"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        {t.due}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </BriefingSection>
          )}

          {/* Calendar Section */}
          {sections.calendar && sections.calendar.items.length > 0 && (
            <BriefingSection
              title="Calendar"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              }
            >
              <div className="space-y-2">
                {sections.calendar.items.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--c-bg-2)' }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${m.minutesAway < 15 ? 'bg-red-500 animate-pulse' : m.minutesAway < 60 ? 'bg-orange-500' : 'bg-blue-500'}`}
                    />
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--c-text-1)' }}>
                      {m.title}
                    </span>
                    <span
                      className="text-[11px] flex-shrink-0"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      {m.time}
                    </span>
                    {m.minutesAway > 0 && (
                      <span
                        className="text-[11px] flex-shrink-0 font-medium"
                        style={{ color: m.minutesAway < 15 ? 'rgb(239,68,68)' : 'var(--c-text-4)' }}
                      >
                        in {m.minutesAway}m
                      </span>
                    )}
                    {m.meetingUrl && (
                      <a
                        href={m.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2 py-0.5 rounded font-medium"
                        style={{ background: 'var(--c-accent)', color: 'var(--c-on-accent)' }}
                      >
                        Join
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </BriefingSection>
          )}

          {/* Reminders Section */}
          {sections.reminders && sections.reminders.items.length > 0 && (
            <BriefingSection
              title="Upcoming Reminders"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              }
            >
              <div className="space-y-2">
                {sections.reminders.items.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{ background: r.overdue ? 'rgba(239,68,68,0.1)' : 'var(--c-bg-2)' }}
                    title="View reminders"
                    onClick={() => {
                      actions?.setView('reminders');
                    }}
                    onMouseEnter={(e) => {
                      if (!r.overdue) e.currentTarget.style.background = 'var(--c-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = r.overdue
                        ? 'rgba(239,68,68,0.1)'
                        : 'var(--c-bg-2)';
                    }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${r.overdue ? 'bg-red-500' : 'bg-green-500'}`}
                    />
                    <span className="flex-1 text-sm" style={{ color: 'var(--c-text-1)' }}>
                      {r.text}
                    </span>
                    <span
                      className="text-[11px] flex-shrink-0"
                      style={{ color: r.overdue ? 'rgb(239,68,68)' : 'var(--c-text-4)' }}
                    >
                      {r.due}
                    </span>
                  </div>
                ))}
              </div>
            </BriefingSection>
          )}

          {/* Recent Agent Activity */}
          {sections.agents && sections.agents.recent.length > 0 && (
            <BriefingSection
              title="Agent Activity"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              }
            >
              <div className="space-y-2">
                {sections.agents.recent.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{ background: 'var(--c-bg-2)' }}
                    title={`Switch to ${a.name}`}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('shre-switch-agent', { detail: { agentId: a.id } }),
                      );
                      actions?.setView('chat');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--c-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--c-bg-2)';
                    }}
                  >
                    <span
                      className="text-sm font-medium flex-1"
                      style={{ color: 'var(--c-text-1)' }}
                    >
                      {a.name}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                      {a.messageCount} msgs
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                      {a.lastActivity}
                    </span>
                  </div>
                ))}
              </div>
            </BriefingSection>
          )}

          {/* Recent Conversations */}
          {sections.conversations && sections.conversations.recent.length > 0 && (
            <BriefingSection
              title="Recent Conversations"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            >
              <div className="space-y-2">
                {sections.conversations.recent.map((c, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg"
                    style={{ background: 'var(--c-bg-2)' }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium" style={{ color: 'var(--c-accent)' }}>
                        {c.agent}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                        {c.time}
                      </span>
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--c-text-2)' }}>
                      {c.preview}
                    </p>
                  </div>
                ))}
              </div>
            </BriefingSection>
          )}

          {/* Tip of the day */}
          {sections.tip && (
            <div
              className="px-4 py-3 rounded-xl"
              style={{ background: 'var(--c-bg-2)', borderLeft: '3px solid var(--c-accent)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--c-accent)' }}>
                Tip
              </p>
              <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                {sections.tip}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center pt-2 pb-4">
            <button
              className="text-[11px] transition-colors"
              style={{
                color: 'var(--c-text-4)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
              onClick={() => {
                const next = !autoDisabled;
                setAutoDisabled(next);
                if (next) {
                  localStorage.setItem('shre-briefing-disabled', '1');
                } else {
                  localStorage.removeItem('shre-briefing-disabled');
                }
              }}
            >
              {autoDisabled
                ? 'Show briefing automatically on login'
                : 'Don\u2019t show automatically'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div
      className="px-3 py-3 rounded-xl"
      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
    >
      <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--c-text-4)' }}>
        {label}
      </p>
      <p
        className={`text-2xl font-bold ${accent ? 'text-red-500' : ''}`}
        style={accent ? {} : { color: 'var(--c-text-1)' }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="text-[11px] mt-0.5"
          style={{ color: accent ? 'rgb(239,68,68)' : 'var(--c-text-4)' }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function BriefingSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-border-2)' }}
      >
        <span style={{ color: 'var(--c-accent)' }}>{icon}</span>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
          {title}
        </h2>
      </div>
      <div className="px-1 py-1" style={{ background: 'var(--c-bg-1)' }}>
        {children}
      </div>
    </div>
  );
}
