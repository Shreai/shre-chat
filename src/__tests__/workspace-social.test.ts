import { describe, expect, it } from 'vitest';
import { buildPinnedSummaries, buildThreadSummaries } from '../workspace-social';

describe('workspace social summaries', () => {
  it('builds thread summaries from reply chains', () => {
    const threads = buildThreadSummaries([
      {
        id: 'session-1',
        title: 'Planning',
        agentId: 'shre',
        createdAt: 1,
        updatedAt: 4,
        messages: [
          { role: 'user', content: 'Launch plan', timestamp: 1 },
          { role: 'assistant', content: 'Reply one', timestamp: 2, replyTo: 0 },
          { role: 'assistant', content: 'Reply two', timestamp: 3, replyTo: 0 },
        ],
      },
    ] as any);

    expect(threads).toHaveLength(1);
    expect(threads[0].replyCount).toBe(2);
    expect(threads[0].rootIndex).toBe(0);
    expect(threads[0].latestReplyPreview).toContain('Reply');
  });

  it('builds pinned summaries from bookmarks and sessions', () => {
    const pinned = buildPinnedSummaries(
      [
        {
          id: 'bm-1',
          sessionId: 'session-1',
          messageIndex: 0,
          preview: 'Pinned preview',
          createdAt: 42,
          agentId: 'shre',
        },
      ],
      [
        {
          id: 'session-1',
          title: 'Planning',
          agentId: 'shre',
          createdAt: 1,
          updatedAt: 4,
          messages: [{ role: 'user', content: 'Launch plan', timestamp: 1 }],
        },
      ] as any,
    );

    expect(pinned).toHaveLength(1);
    expect(pinned[0].preview).toBe('Launch plan');
  });
});
