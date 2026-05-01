import { describe, expect, it } from 'vitest';
import { buildConversationRoster } from '../workspace-roster';

describe('workspace roster', () => {
  it('builds an alerts channel roster with the current user and agent members', () => {
    const roster = buildConversationRoster({
      session: {
        id: '1',
        title: '#alerts',
        agentId: 'ellie',
        messages: [],
        createdAt: 1,
        updatedAt: Date.now(),
        tags: ['channel:alerts'],
      },
      sessions: [],
      agents: [
        { id: 'ellie', name: 'Ellie', emoji: '🤖', model: 'm', group: 'core' },
        { id: 'shre', name: 'Shre', emoji: '✨', model: 'm', group: 'core' },
        { id: 'guardian', name: 'Guardian', emoji: '🛡️', model: 'm', group: 'department' },
      ],
      currentAgentId: 'ellie',
      currentAgentName: 'Ellie',
      userName: 'Ava',
    });

    expect(roster.kind).toBe('channel');
    expect(roster.title).toBe('#alerts');
    expect(roster.members.some((member) => member.isUser)).toBe(true);
    expect(roster.members.some((member) => member.id === 'guardian')).toBe(true);
  });

  it('prefers shared channel members when they are provided', () => {
    const roster = buildConversationRoster({
      session: {
        id: '1',
        title: '#general',
        agentId: 'ellie',
        messages: [],
        createdAt: 1,
        updatedAt: Date.now(),
        tags: ['channel:general'],
      },
      sessions: [],
      agents: [{ id: 'ellie', name: 'Ellie', emoji: '🤖', model: 'm', group: 'core' }],
      currentAgentId: 'ellie',
      currentAgentName: 'Ellie',
      currentUserId: 'u-123',
      userName: 'Ava',
      workspacePresenceByUserId: { 'u-123': 'active', alice: 'away' },
      workspaceChannelMembersByChannelId: {
        general: [
          { memberId: 'u-123', displayName: 'Ava', memberKind: 'user' },
          { memberId: 'alice', displayName: 'Alice', memberKind: 'user' },
        ],
      },
    });

    expect(roster.members.some((member) => member.id === 'alice' && member.name === 'Alice')).toBe(
      true,
    );
    expect(roster.members.find((member) => member.id === 'u-123')?.presence).toBe('active');
  });
});
