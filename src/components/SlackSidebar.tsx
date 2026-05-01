import React, { useEffect, useMemo, useState } from 'react';
import { AGENTS, useApp, type Session } from '../store';
import { usePreferences, type ConversationModeId } from '../preferences-store';
import { useAppList } from '../hooks/useAppList';
import { loadWorkspacePresenceSnapshot } from '../hooks/useWorkspacePresence';
import {
  loadWorkspaceChannelMembershipSnapshot,
  type WorkspaceChannelMembersByChannelId,
} from '../hooks/useWorkspaceChannelMembership';
import { useViewportTier } from '../hooks/useViewportTier';
import { useWorkspaceCustomChannels } from '../hooks/useWorkspaceCustomChannels';
import {
  WORKSPACE_CHANNELS,
  getChannelParticipants,
  getWorkspaceChannelTag,
  type WorkspaceChannel,
} from '../workspace-channels';
import {
  createCustomWorkspaceChannel,
  saveCustomWorkspaceChannels,
  type CustomWorkspaceChannel,
} from '../workspace-custom-channels';

type SidebarScope = 'channel' | 'dm' | 'app';
type SidebarChannel = WorkspaceChannel | CustomWorkspaceChannel;

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

function derivePresence(updatedAt?: number): 'active' | 'away' | 'offline' {
  if (!updatedAt) return 'offline';
  const delta = Date.now() - updatedAt;
  if (delta < 5 * 60_000) return 'active';
  if (delta < 30 * 60_000) return 'away';
  return 'offline';
}

export function SlackSidebar() {
  const { state, actions } = useApp();
  const { appOptions } = useAppList();
  const conversationMode = usePreferences((s) => s.conversationMode);
  const activeAppId = usePreferences((s) => s.activeAppId);
  const setConversationMode = usePreferences((s) => s.setConversationMode);

  const [query, setQuery] = useState('');
  const [presenceSnapshot, setPresenceSnapshot] = useState(() => loadWorkspacePresenceSnapshot());
  const [channelMembersByChannelId, setChannelMembersByChannelId] =
    useState<WorkspaceChannelMembersByChannelId>(() => loadWorkspaceChannelMembershipSnapshot());
  const { customChannels, refreshWorkspaceCustomChannels } = useWorkspaceCustomChannels();
  const viewportTier = useViewportTier();
  const sidebarCompact =
    viewportTier === 'trifold-phone' ||
    viewportTier === 'bifold-phone' ||
    viewportTier === 'phone' ||
    viewportTier === 'mini-tablet';
  const sidebarNarrow = sidebarCompact || viewportTier === 'tablet';
  useEffect(() => {
    if (!state.sidebarOpen || !sidebarCompact) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarCompact, state.sidebarOpen]);

  useEffect(() => {
    const refresh = () => setPresenceSnapshot(loadWorkspacePresenceSnapshot());
    const handler = (event: StorageEvent) => {
      if (event.key === 'shre-workspace-presence-snapshot') {
        refresh();
      }
    };
    const customHandler = () => refresh();
    window.addEventListener('storage', handler);
    window.addEventListener('shre-workspace-presence-snapshot-changed', customHandler);
    refresh();
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('shre-workspace-presence-snapshot-changed', customHandler);
    };
  }, []);

  useEffect(() => {
    const refreshChannelMembers = async () => {
      try {
        const res = await fetch('/api/chat-channel-memberships', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          channels?: WorkspaceChannelMembersByChannelId;
        };
        setChannelMembersByChannelId(data.channels || {});
      } catch {
        /* offline */
      }
    };
    void refreshChannelMembers();
    const interval = window.setInterval(() => {
      void refreshChannelMembers();
    }, 30_000);
    const handleMembershipChange = () => {
      setChannelMembersByChannelId(loadWorkspaceChannelMembershipSnapshot());
    };
    window.addEventListener('shre-workspace-channel-membership-changed', handleMembershipChange);
    return () => {
      window.removeEventListener(
        'shre-workspace-channel-membership-changed',
        handleMembershipChange,
      );
      window.clearInterval(interval);
    };
  }, []);

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
    if (sidebarCompact) actions.setSidebarOpen(false);
  };

  const openChannel = (channelId: string, mode: ConversationModeId) => {
    setConversationMode(mode);
    actions.openWorkspaceChannel(channelId, { focus: true });
  };

  const createChannel = () => {
    const raw = window.prompt('New channel name');
    const draft = raw
      ? createCustomWorkspaceChannel(
          raw,
          [...WORKSPACE_CHANNELS, ...customChannels].map((entry) => entry.id),
        )
      : null;
    if (!draft) return;

    const persistLocalFallback = () => {
      const updated = [...customChannels, draft];
      saveCustomWorkspaceChannels(updated);
      setConversationMode(draft.mode);
      openScopedSession({
        scope: 'channel',
        id: draft.id,
        title: `#${draft.label}`,
      });
    };

    void (async () => {
      try {
        const res = await fetch('/api/chat-custom-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            label: draft.label,
            description: draft.description,
            mode: draft.mode,
            accent: draft.accent,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          channel?: {
            channelId: string;
            label: string;
            description: string;
            mode: ConversationModeId;
            accent: string;
          };
        };
        const channel = data.channel;
        if (!channel?.channelId) throw new Error('Missing created channel');
        await fetch('/api/chat-channel-memberships/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ channelId: channel.channelId }),
        });
        await refreshWorkspaceCustomChannels();
        setConversationMode(channel.mode || draft.mode);
        openScopedSession({
          scope: 'channel',
          id: channel.channelId,
          title: `#${channel.label}`,
        });
      } catch {
        persistLocalFallback();
      }
    })();
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

  const allChannels: SidebarChannel[] = [...WORKSPACE_CHANNELS, ...customChannels];
  const visibleChannels = allChannels.filter((channel) =>
    matches(`${channel.label} ${channel.description}`),
  );
  const visibleAgents = sortedAgents.filter((agent) =>
    matches(`${agent.name} ${agent.id} ${agent.description || ''}`),
  );
  const visibleApps = recentApps.filter((app) => matches(`${app.label} ${app.subtitle}`));

  return (
    <>
      {state.sidebarOpen && sidebarCompact && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => actions.setSidebarOpen(false)}
        />
      )}

      <aside
        className={`shre-sidebar relative z-40 flex h-dvh min-h-0 ${sidebarCompact ? 'w-[min(84vw,288px)] max-w-[84vw]' : sidebarNarrow ? 'w-[300px] max-w-[84vw]' : 'w-[320px] max-w-[86vw]'} flex-col overflow-hidden border-r border-[var(--c-border-2)] ${state.sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,28,0.98) 0%, rgba(16,16,18,0.98) 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          transition: 'transform 180ms ease',
        }}
      >
        <div
          className={`shre-no-drag flex items-start justify-between gap-3 border-b border-[var(--c-border-2)] ${sidebarCompact ? 'px-3 pb-3 pt-3' : sidebarNarrow ? 'px-3.5 pb-3.5 pt-3.5' : 'px-4 pb-4 pt-4'}`}
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.05)] text-[12px] font-semibold tracking-[0.16em] text-[var(--c-text-1)]">
                S
              </div>
              <div className="min-w-0">
                <div
                  className={`${sidebarCompact ? 'text-[12px]' : 'text-[13px]'} truncate font-semibold tracking-[-0.03em] text-[var(--c-text-1)]`}
                >
                  Shre AI
                </div>
                <div
                  className={`truncate text-[11px] text-[var(--c-text-4)] ${sidebarCompact ? 'hidden' : ''}`}
                >
                  Channels first
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`rounded-full border border-[var(--c-border-1)] ${sidebarCompact ? 'px-2 py-0.5 text-[10px]' : sidebarNarrow ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-[11px]'} font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]`}
            onClick={() => actions.setSidebarOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="relative mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, DMs, apps..."
            className={`w-full rounded-2xl border border-[var(--c-border-1)] bg-[var(--c-bg-card)] ${sidebarCompact ? 'px-3 py-2 text-[12px]' : sidebarNarrow ? 'px-3 py-2 text-[12px]' : 'px-4 py-2.5 text-[13px]'} text-[var(--c-text-1)] outline-none placeholder:text-[var(--c-text-4)]`}
          />
        </div>

        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${sidebarCompact ? 'px-2 py-2' : sidebarNarrow ? 'px-2.5 py-2.5' : 'px-3 py-3'}`}
        >
          <Section
            title="Channels"
            action={
              <button
                type="button"
                className="rounded-full border border-[var(--c-border-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-3)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
                onClick={createChannel}
              >
                + Add
              </button>
            }
          >
            {visibleChannels.map((channel) => {
              const active =
                conversationMode === channel.mode &&
                latestSessionForTag(state.sessions, getWorkspaceChannelTag(channel.id))?.id ===
                  state.activeSessionId;
              const memberCount =
                channelMembersByChannelId[channel.id]?.length ||
                getChannelParticipants(channel.id).length;
              return (
                <NavRow
                  key={channel.id}
                  active={active}
                  icon="#"
                  label={channel.label}
                  description={`${channel.description} · ${memberCount} members`}
                  accent={channel.accent}
                  onClick={() => openChannel(channel.id, channel.mode)}
                />
              );
            })}
            <button
              type="button"
              className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--c-border-2)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--c-bg-hover)]"
              onClick={createChannel}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.03)] text-[14px] font-semibold text-[var(--c-text-3)]">
                +
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--c-text-1)]">
                  Add channel
                </div>
                <div className="mt-0.5 truncate text-[12px] text-[var(--c-text-3)]">
                  Create a custom workspace channel
                </div>
              </div>
            </button>
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
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.04)] text-[12px] font-semibold text-[var(--c-text-1)]">
                    You
                    <span
                      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-[var(--c-bg-2)]"
                      style={{
                        background:
                          (presenceSnapshot.self?.presence || 'active') === 'active'
                            ? '#4ade80'
                            : '#f59e0b',
                      }}
                    />
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
              const presence = derivePresence(latest?.updatedAt);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => openDm(agent.id, `DM · ${agent.name}`)}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[var(--c-bg-active)]' : 'hover:bg-[var(--c-bg-hover)]'
                  }`}
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.04)] text-[18px]">
                    {agent.emoji}
                    <span
                      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-[var(--c-bg-2)]"
                      style={{
                        background:
                          presence === 'active'
                            ? '#4ade80'
                            : presence === 'away'
                              ? '#f59e0b'
                              : 'var(--c-text-5)',
                      }}
                    />
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
        </div>

        <div className="shre-no-drag border-t border-[var(--c-border-2)] px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-4)]">
              Settings
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--c-border-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
                onClick={() => actions.toggleTheme()}
              >
                Theme
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--c-border-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]"
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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--c-text-4)]">
          {title}
        </div>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--c-border-2)] px-3 py-3 text-[12px] text-[var(--c-text-4)]">
      {label}
    </div>
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
      className={`group flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-[color:color-mix(in_srgb,var(--c-accent)_45%,var(--c-border-2))] bg-[rgba(255,255,255,0.05)]'
          : 'border-[var(--c-border-2)] bg-[rgba(255,255,255,0.03)] hover:bg-[var(--c-bg-hover)]'
      }`}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border-2)] text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
        style={{ background: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[13px] font-medium tracking-[-0.02em] text-[var(--c-text-1)]">
            {label}
          </div>
          {active && (
            <span className="rounded-full border border-[var(--c-border-1)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-4)]">
              Active
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-[var(--c-text-3)]">{description}</div>
      </div>
    </button>
  );
}
