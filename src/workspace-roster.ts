import type { Agent, Session } from './store';

export type PresenceState = 'active' | 'away' | 'offline';

export interface WorkspaceMember {
  id: string;
  name: string;
  emoji: string;
  role: string;
  presence: PresenceState;
  note?: string;
  isUser?: boolean;
}

export interface ConversationRoster {
  kind: 'channel' | 'dm' | 'app' | 'general';
  title: string;
  subtitle: string;
  members: WorkspaceMember[];
}

const CHANNEL_PARTICIPANTS: Record<string, string[]> = {
  general: ['ellie', 'shre', 'architect', 'founding-engineer', 'compass', 'guardian', 'herald'],
  code: ['ellie', 'shre', 'architect', 'founding-engineer', 'weaver', 'guardian'],
  ops: ['ellie', 'shre', 'guardian', 'herald', 'pulse', 'compass'],
  strategy: ['ellie', 'shre', 'architect', 'chief-scientist', 'compass', 'herald'],
  alerts: ['ellie', 'shre', 'guardian', 'herald', 'pulse'],
  approvals: ['ellie', 'shre', 'guardian', 'herald'],
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function parseChannelId(tags?: string[]): string | null {
  const tag = tags?.find((value) => value.startsWith('channel:'));
  return tag ? tag.slice('channel:'.length) : null;
}

function parseDmId(tags?: string[]): string | null {
  const tag = tags?.find((value) => value.startsWith('dm:'));
  return tag ? tag.slice('dm:'.length) : null;
}

function latestSessionForAgent(sessions: Session[], agentId: string): Session | null {
  return (
    [...sessions]
      .filter((session) => session.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  );
}

function derivePresence(
  agentId: string,
  currentAgentId: string,
  sessions: Session[],
  activeSession?: Session | null,
): PresenceState {
  if (agentId === 'user' || agentId === currentAgentId) return 'active';
  const latest = latestSessionForAgent(sessions, agentId);
  const freshest = Math.max(latest?.updatedAt ?? 0, activeSession?.agentId === agentId ? activeSession.updatedAt : 0);
  if (freshest === 0) return 'offline';
  if (Date.now() - freshest < 5 * 60_000) return 'active';
  if (Date.now() - freshest < 30 * 60_000) return 'away';
  return 'offline';
}

function makeMember(
  agentId: string,
  agents: Agent[],
  sessions: Session[],
  currentAgentId: string,
  activeSession?: Session | null,
  isUser = false,
  userName = 'You',
): WorkspaceMember | null {
  if (isUser) {
    return {
      id: 'user',
      name: userName,
      emoji: '🧑‍💻',
      role: 'Operator',
      presence: 'active',
      isUser: true,
    };
  }
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) return null;
  return {
    id: agent.id,
    name: agent.name,
    emoji: agent.emoji,
    role: agent.group === 'council' ? 'Council' : agent.group === 'department' ? 'Team' : 'Agent',
    presence: derivePresence(agent.id, currentAgentId, sessions, activeSession),
  };
}

export function buildConversationRoster(args: {
  session: Session | null | undefined;
  sessions: Session[];
  agents: Agent[];
  currentAgentId: string;
  currentAgentName: string;
  userName: string;
  activeAppLabel?: string | null;
}): ConversationRoster {
  const { session, sessions, agents, currentAgentId, currentAgentName, userName, activeAppLabel } = args;
  const channelId = parseChannelId(session?.tags);
  const dmId = parseDmId(session?.tags);

  if (channelId) {
    const participantIds = unique(['user', currentAgentId, ...(CHANNEL_PARTICIPANTS[channelId] || [])]);
    const members = participantIds
      .map((id) =>
        id === 'user'
          ? makeMember(id, agents, sessions, currentAgentId, session, true, userName)
          : makeMember(id, agents, sessions, currentAgentId, session),
      )
      .filter((item): item is WorkspaceMember => Boolean(item));
    return {
      kind: 'channel',
      title: `#${channelId}`,
      subtitle: `${members.length} members · ${channelId === 'approvals' ? 'Approval lane' : channelId === 'alerts' ? 'Alert lane' : 'Workspace channel'}`,
      members,
    };
  }

  if (dmId) {
    const participants = unique(['user', dmId]);
    const members = participants
      .map((id) =>
        id === 'user'
          ? makeMember(id, agents, sessions, currentAgentId, session, true, userName)
          : makeMember(id, agents, sessions, currentAgentId, session),
      )
      .filter((item): item is WorkspaceMember => Boolean(item));
    return {
      kind: 'dm',
      title: dmId === 'main' ? `DM · ${userName}` : `DM · ${members[1]?.name || currentAgentName}`,
      subtitle: `${members.length} participants`,
      members,
    };
  }

  if (activeAppLabel) {
    return {
      kind: 'app',
      title: `App · ${activeAppLabel}`,
      subtitle: 'Workspace app context',
      members: [
        makeMember('user', agents, sessions, currentAgentId, session, true, userName)!,
        makeMember(currentAgentId, agents, sessions, currentAgentId, session)!,
      ],
    };
  }

  return {
    kind: 'general',
    title: 'General',
    subtitle: 'Workspace coordination',
    members: [
      makeMember('user', agents, sessions, currentAgentId, session, true, userName)!,
      makeMember(currentAgentId, agents, sessions, currentAgentId, session)!,
    ],
  };
}

export function getChannelParticipants(channelId: string, currentAgentId: string): string[] {
  return unique(['user', currentAgentId, ...(CHANNEL_PARTICIPANTS[channelId] || [])]);
}
