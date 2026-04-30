import { describe, expect, it } from 'vitest';
import { buildConversationRoster } from '../workspace-roster';

describe('workspace roster', () => {
  it('builds an alerts channel roster with the current user and agent members', () => {
    const roster = buildConversationRoster({
      session: { id: '1', title: '#alerts', agentId: 'ellie', messages: [], createdAt: 1, updatedAt: Date.now(), tags: ['channel:alerts'] },
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
});
