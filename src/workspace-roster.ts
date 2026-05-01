import type { Agent, Session } from './store';
import type { WorkspacePresencePeer } from './hooks/useWorkspacePresence';

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

export interface WorkspaceChannelMember {
  memberId: string;
  displayName: string;
  memberKind?: 'agent' | 'user';
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

function dedupeMembers(members: Array<WorkspaceMember | null>): WorkspaceMember[] {
  const seen = new Set<string>();
  const result: WorkspaceMember[] = [];
  for (const member of members) {
    if (!member || seen.has(member.id)) continue;
    seen.add(member.id);
    result.push(member);
  }
  return result;
}

function parseChannelId(tags?: string[]): string | null {
  const tag = tags?.find((value) => value.startsWith('channel:'));
  return tag ? tag.slice('channel:'.length) : null;
}

function parseDmId(tags?: string[]): string | null {
  const tag = tags?.find((value) => value.startsWith('dm:'));
  return tag ? tag.slice('dm:'.length) : null;
}

function resolvePresence(
  value: PresenceState | WorkspacePresencePeer | undefined,
  fallback: PresenceState = 'offline',
): PresenceState {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.presence === 'offline' ? 'offline' : value.presence;
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
  const freshest = Math.max(
    latest?.updatedAt ?? 0,
    activeSession?.agentId === agentId ? activeSession.updatedAt : 0,
  );
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
  memberPresence?: PresenceState,
  fallbackName?: string,
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
  if (!agent) {
    return {
      id: agentId,
      name: fallbackName || titleCase(agentId),
      emoji: '👤',
      role: 'Member',
      presence: memberPresence || 'offline',
    };
  }
  return {
    id: agent.id,
    name: agent.name,
    emoji: agent.emoji,
    role: agent.group === 'council' ? 'Council' : agent.group === 'department' ? 'Team' : 'Agent',
    presence: derivePresence(agent.id, currentAgentId, sessions, activeSession),
  };
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

export function buildConversationRoster(args: {
  session: Session | null | undefined;
  sessions: Session[];
  agents: Agent[];
  currentAgentId: string;
  currentAgentName: string;
  currentUserId?: string;
  userName: string;
  userPresence?: PresenceState;
  workspacePresenceByUserId?: Record<string, PresenceState | WorkspacePresencePeer | undefined>;
  workspaceChannelMembersByChannelId?: Record<string, WorkspaceChannelMember[]>;
  activeAppLabel?: string | null;
}): ConversationRoster {
  const {
    session,
    sessions,
    agents,
    currentAgentId,
    currentAgentName,
    currentUserId,
    userName,
    userPresence = 'active',
    workspacePresenceByUserId = {},
    workspaceChannelMembersByChannelId = {},
    activeAppLabel,
  } = args;
  const sharedUserPresence = resolvePresence(
    currentUserId ? workspacePresenceByUserId[currentUserId] : undefined,
    userPresence,
  );
  const channelId = parseChannelId(session?.tags);
  const dmId = parseDmId(session?.tags);

  if (channelId) {
    const sharedMembers = workspaceChannelMembersByChannelId[channelId] || [];
    const participantIds = unique([
      currentUserId || 'user',
      'user',
      currentAgentId,
      ...sharedMembers.map((member) => member.memberId),
      ...(CHANNEL_PARTICIPANTS[channelId] || []),
    ]);
    const memberById = new Map(sharedMembers.map((member) => [member.memberId, member]));
    const members = dedupeMembers(
      participantIds
        .map((id) => {
          if (id === 'user' || id === currentUserId) {
            const userMember = makeMember(
              id,
              agents,
              sessions,
              currentAgentId,
              session,
              true,
              userName,
              sharedUserPresence,
            );
            return userMember
              ? {
                  ...userMember,
                  id: currentUserId || userMember.id,
                  name: userName,
                  presence: sharedUserPresence,
                }
              : null;
          }
          const member = memberById.get(id);
          const presence = resolvePresence(workspacePresenceByUserId[id]);
          return makeMember(
            id,
            agents,
            sessions,
            currentAgentId,
            session,
            false,
            userName,
            presence,
            member?.displayName,
          );
        })
        .filter((item): item is WorkspaceMember => Boolean(item)),
    );
    return {
      kind: 'channel',
      title: `#${channelId}`,
      subtitle: `${members.length} members · ${channelId === 'approvals' ? 'Approval lane' : channelId === 'alerts' ? 'Alert lane' : 'Workspace channel'}`,
      members,
    };
  }

  if (dmId) {
    const participants = unique([currentUserId || 'user', 'user', dmId]);
    const members = dedupeMembers(
      participants
        .map((id) => {
          if (id === 'user' || id === currentUserId) {
            const userMember = makeMember(
              id,
              agents,
              sessions,
              currentAgentId,
              session,
              true,
              userName,
              sharedUserPresence,
            );
            return userMember
              ? {
                  ...userMember,
                  id: currentUserId || userMember.id,
                  name: userName,
                  presence: sharedUserPresence,
                }
              : null;
          }
          return makeMember(
            id,
            agents,
            sessions,
            currentAgentId,
            session,
            false,
            userName,
            resolvePresence(workspacePresenceByUserId[id]),
            id,
          );
        })
        .filter((item): item is WorkspaceMember => Boolean(item)),
    );
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
        {
          ...makeMember(
            'user',
            agents,
            sessions,
            currentAgentId,
            session,
            true,
            userName,
            sharedUserPresence,
          )!,
          id: currentUserId || 'user',
          name: userName,
          presence: sharedUserPresence,
        },
        makeMember(currentAgentId, agents, sessions, currentAgentId, session)!,
      ],
    };
  }

  return {
    kind: 'general',
    title: 'General',
    subtitle: 'Workspace coordination',
    members: [
      {
        ...makeMember(
          'user',
          agents,
          sessions,
          currentAgentId,
          session,
          true,
          userName,
          sharedUserPresence,
        )!,
        id: currentUserId || 'user',
        name: userName,
        presence: sharedUserPresence,
      },
      makeMember(currentAgentId, agents, sessions, currentAgentId, session)!,
    ],
  };
}

export function getChannelParticipants(channelId: string, currentAgentId: string): string[] {
  return unique(['user', currentAgentId, ...(CHANNEL_PARTICIPANTS[channelId] || [])]);
}
