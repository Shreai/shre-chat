import React, { useEffect, useMemo, useState } from 'react';
import { AGENTS, getAgent, useApp, type Session } from '../store';
import { usePreferences, type ConversationModeId } from '../preferences-store';
import { useAppList } from '../hooks/useAppList';

type SidebarScope = 'channel' | 'dm' | 'app';

const CHANNELS: Array<{
  id: string;
  label: string;
  description: string;
  mode: ConversationModeId;
  accent: string;
}> = [
  {
    id: 'general',
    label: 'general',
    description: 'Company-wide coordination and default work',
    mode: 'assistant',
    accent: '#7c8cff',
  },
  {
    id: 'code',
    label: 'code',
    description: 'Autonomous build, debug, and ship loops',
    mode: 'code',
    accent: '#4ade80',
  },
  {
    id: 'ops',
    label: 'ops',
    description: 'Infra, incidents, approvals, and guardrails',
    mode: 'ops',
    accent: '#f59e0b',
  },
  {
    id: 'strategy',
    label: 'strategy',
    description: 'Planning, priorities, and decision context',
    mode: 'strategy',
    accent: '#f472b6',
  },
];

function formatShortTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function scopeTag(scope: SidebarScope, id: string) {
  return `${scope}:${id}`;
}

function latestSessionForTag(sessions: Session[], tag: string) {
  return [...sessions]
    .filter((session) => session.tags?.includes(tag))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function getSearchTokens(text: string) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function SlackSidebar() {
  const { state, actions } = useApp();
  const { appOptions } = useAppList();
  const conversationMode = usePreferences((s) => s.conversationMode);
  const activeAppId = usePreferences((s) => s.activeAppId);
  const setConversationMode = usePreferences((s) => s.setConversationMode);

  const [query, setQuery] = useState('');

  const activeAgent = getAgent(state.activeAgentId);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  useEffect(() => {
    if (!state.sidebarOpen || !isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, state.sidebarOpen]);

  const sortedAgents = useMemo(
    () =>
      [...AGENTS]
        .filter((agent) => agent.group !== 'council')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const recentSessions = useMemo(
    () =>
      [...state.sessions]
        .filter((session) => session.messages.length > 0)
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.updatedAt - a.updatedAt;
        }),
    [state.sessions],
  );

  const recentApps = useMemo(() => appOptions.slice(0, 6), [appOptions]);

  const searchTokens = useMemo(() => getSearchTokens(query), [query]);
  const matches = (value: string) => {
    if (!searchTokens.length) return true;
    const haystack = value.toLowerCase();
    return searchTokens.every((token) => haystack.includes(token));
  };

  const openScopedSession = ({
    scope,
    id,
    title,
    agentId,
  }: {
    scope: SidebarScope;
    id: string;
    title: string;
    agentId?: string;
  }) => {
    const tag = scopeTag(scope, id);
    const existing = latestSessionForTag(state.sessions, tag);

    if (agentId) actions.setActiveAgent(agentId);
    if (!existing) {
      const newId = actions.newSession();
      actions.addSessionTag(newId, tag);
      actions.updateSessionTitle(newId, title);
      actions.switchSession(newId);
    } else {
      actions.switchSession(existing.id);
    }

    actions.setView('chat');
    if (isMobile) actions.setSidebarOpen(false);
  };

  const openChannel = (channelId: string, mode: ConversationModeId) => {
    const channel = CHANNELS.find((item) => item.id === channelId);
    setConversationMode(mode, null);
    openScopedSession({
      scope: 'channel',
      id: channelId,
      title: channel ? `#${channel.label}` : `#${channelId}`,
    });
  };

  const openDm = (agentId: string, title: string) => {
    openScopedSession({
      scope: 'dm',
      id: agentId,
      title,
      agentId,
    });
  };

  const openApp = (appId: string, label: string) => {
    setConversationMode('apps', appId);
    openScopedSession({
      scope: 'app',
      id: appId,
      title: `App · ${label}`,
    });
  };

  const visibleChannels = CHANNELS.filter((channel) =>
    matches(`${channel.label} ${channel.description}`),
  );
  const visibleAgents = sortedAgents.filter((agent) =>
    matches(`${agent.name} ${agent.id} ${agent.description || ''}`),
  );
  const visibleApps = recentApps.filter((app) => matches(`${app.label} ${app.subtitle}`));
  const visibleSessions = recentSessions.filter((session) =>
    matches(`${session.title} ${session.messages.map((m) => m.content).join(' ')}`),
  );

  return (
    <>
      {state.sidebarOpen && isMobile && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => actions.setSidebarOpen(false)}
        />
      )}

      <aside
        className={`shre-sidebar relative z-40 flex h-full w-[320px] max-w-[86vw] flex-col border-r border-[var(--c-border-2)] ${state.sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,28,0.98) 0%, rgba(16,16,18,0.98) 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          transition: 'transform 180ms ease',
        }}
      >
        <div
          className="shre-no-drag flex items-start justify-between gap-3 border-b border-[var(--c-border-2)] px-4 pb-4 pt-4"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-4)]">
              Shre AI
            </div>
            <div className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[var(--c-text-1)]">
              Channels
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[var(--c-text-3)]">
              Slack-style workspace for chats, agents, and apps.
            </div>
          </div>

          <button
            type="button"
            className="rounded-full border border-[var(--c-border-1)] px-3 py-1 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
            onClick={() => actions.setSidebarOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="shre-no-drag border-b border-[var(--c-border-2)] px-4 py-4">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--c-border-1)] bg-[rgba(255,255,255,0.04)] p-1.5">
            <button
              type="button"
              onClick={() => setConversationMode('assistant', null)}
              className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                conversationMode === 'assistant'
                  ? 'bg-white text-black'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setConversationMode('code', null)}
              className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                conversationMode === 'code'
                  ? 'bg-[var(--c-accent)] text-white'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => setConversationMode('apps', activeAppId)}
              className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                conversationMode === 'apps'
                  ? 'bg-[rgba(74,222,128,0.16)] text-[var(--c-success)]'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              Apps
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-4)]">
                  Active agent
                </div>
                <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[var(--c-text-1)]">
                  {activeAgent.name}
                </div>
              </div>
              <div className="text-[20px]">{activeAgent.emoji}</div>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--c-text-3)]">
              {conversationMode === 'code'
                ? 'Code mode is set to stay autonomous until it needs approval or hits a blocker.'
                : conversationMode === 'apps'
                  ? 'Apps mode keeps the workspace anchored to a specific product surface.'
                  : 'General mode keeps the conversation open-ended and operator-led.'}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[var(--c-border-1)] px-3 py-1.5 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
              onClick={() => {
                const id = actions.newSession();
                actions.switchSession(id);
                actions.setView('chat');
                if (isMobile) actions.setSidebarOpen(false);
              }}
            >
              New thread
            </button>
            <button
              type="button"
              className="rounded-full border border-[var(--c-border-1)] px-3 py-1.5 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
              onClick={() => actions.setView('email')}
            >
              Inbox
            </button>
          </div>

          <div className="relative mt-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels, DMs, apps..."
              className="w-full rounded-2xl border border-[var(--c-border-1)] bg-[var(--c-bg-card)] px-4 py-2.5 text-[13px] text-[var(--c-text-1)] outline-none placeholder:text-[var(--c-text-4)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <Section title="Channels">
            {visibleChannels.map((channel) => {
              const active =
                conversationMode === channel.mode &&
                latestSessionForTag(state.sessions, scopeTag('channel', channel.id))?.id ===
                  state.activeSessionId;
              return (
                <NavRow
                  key={channel.id}
                  active={active}
                  icon="#"
                  label={channel.label}
                  description={channel.description}
                  accent={channel.accent}
                  onClick={() => openChannel(channel.id, channel.mode)}
                />
              );
            })}
          </Section>

          <Section title="Direct Messages">
            {(() => {
              const youLatest = latestSessionForTag(state.sessions, scopeTag('dm', 'main'));
              const youActive =
                state.activeSessionId === youLatest?.id && state.activeAgentId === 'main';
              return (
                <button
                  type="button"
                  onClick={() => openDm('main', `DM · ${state.userProfile?.name || 'You'}`)}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    youActive ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.04)] text-[12px] font-semibold text-[var(--c-text-1)]">
                    You
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">
                      {state.userProfile?.name || 'You'}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--c-text-3)]">
                      Human operator and approval owner
                    </div>
                    {youLatest && (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-4)]">
                        {formatShortTime(youLatest.updatedAt)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })()}
            {visibleAgents.map((agent) => {
              const latest = latestSessionForTag(state.sessions, scopeTag('dm', agent.id));
              const active =
                state.activeSessionId === latest?.id && state.activeAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => openDm(agent.id, `DM · ${agent.name}`)}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.04)] text-[18px]">
                    {agent.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">
                        {agent.name}
                      </div>
                      <span className="rounded-full border border-[var(--c-border-1)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-4)]">
                        {agent.group}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--c-text-3)]">
                      {agent.description || 'Direct message'}
                    </div>
                    {latest && (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-4)]">
                        {formatShortTime(latest.updatedAt)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </Section>

          <Section title="Apps">
            {visibleApps.map((app) => {
              const active = conversationMode === 'apps' && activeAppId === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => openApp(app.id, app.label)}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#334155)] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                    {app.icon || app.label.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">
                      {app.label}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--c-text-3)]">
                      {app.subtitle}
                    </div>
                  </div>
                  <div className="rounded-full border border-[var(--c-border-1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-4)]">
                    {app.skillCount || 'app'}
                  </div>
                </button>
              );
            })}
          </Section>

          <Section title="History">
            {visibleSessions.slice(0, 8).map((session) => {
              const agent = getAgent(session.agentId || 'main');
              const preview =
                session.messages[session.messages.length - 1]?.content
                  .replace(/\s+/g, ' ')
                  .slice(0, 52) || 'No messages yet';
              const active = state.activeSessionId === session.id && state.view === 'chat';
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    actions.switchSession(session.id);
                    actions.setView('chat');
                    if (isMobile) actions.setSidebarOpen(false);
                  }}
                  className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.03)] text-[17px]">
                    {agent.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">
                        {session.title}
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-4)]">
                        {formatShortTime(session.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--c-text-3)]">
                      {preview}
                    </div>
                  </div>
                </button>
              );
            })}
          </Section>
        </div>

        <div className="shre-no-drag border-t border-[var(--c-border-2)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-4)]">
                Workspace
              </div>
              <div className="mt-1 text-[13px] font-medium text-[var(--c-text-2)]">
                {state.writeEnabled ? 'Write enabled' : 'Read-only'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--c-border-1)] px-3 py-1.5 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
                onClick={() => actions.toggleTheme()}
              >
                Theme
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--c-border-1)] px-3 py-1.5 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
                onClick={() => actions.toggleWriteEnabled()}
              >
                {state.writeEnabled ? 'Lock' : 'Unlock'}
              </button>
            </div>
          </div>
          {actions.logout && (
            <button
              type="button"
              onClick={actions.logout}
              className="mt-3 w-full rounded-2xl border border-[var(--c-border-1)] px-3 py-2 text-left text-[12px] text-[var(--c-text-3)] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--c-danger)]"
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--c-text-4)]">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function NavRow({
  active,
  icon,
  label,
  description,
  accent,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  description: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
      }`}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
        style={{ background: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">{label}</div>
        <div className="mt-0.5 text-[12px] leading-5 text-[var(--c-text-3)]">{description}</div>
      </div>
    </button>
  );
}
