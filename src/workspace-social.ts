import type { Bookmark, Session } from './store';

export interface ThreadSummary {
  id: string;
  sessionId: string;
  sessionTitle: string;
  rootIndex: number;
  replyCount: number;
  rootPreview: string;
  latestReplyPreview: string;
  latestReplyIndex: number;
  updatedAt: number;
}

export interface PinnedSummary {
  id: string;
  sessionId: string;
  sessionTitle: string;
  messageIndex: number;
  preview: string;
  note?: string;
  updatedAt: number;
}

function stripMessagePreview(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function summarizeContent(content: string, fallback: string): string {
  const preview = stripMessagePreview(content);
  return preview || fallback;
}

export function buildThreadSummaries(
  sessions: Session[],
  opts: { limit?: number } = {},
): ThreadSummary[] {
  const threadMap = new Map<
    string,
    {
      sessionId: string;
      sessionTitle: string;
      rootIndex: number;
      rootPreview: string;
      latestReplyIndex: number;
      latestReplyPreview: string;
      replyCount: number;
      updatedAt: number;
    }
  >();

  for (const session of sessions) {
    for (let index = 0; index < session.messages.length; index += 1) {
      const message = session.messages[index];
      if (message.replyTo == null) continue;
      const rootIndex = message.replyTo;
      if (rootIndex < 0 || rootIndex >= session.messages.length) continue;
      const root = session.messages[rootIndex];
      if (!root) continue;
      const key = `${session.id}:${rootIndex}`;
      const existing = threadMap.get(key);
      const replyPreview = summarizeContent(message.content, 'Reply');
      const rootPreview = summarizeContent(root.content, 'Thread');
      const updatedAt = Math.max(
        existing?.updatedAt || 0,
        message.timestamp || 0,
        root.timestamp || 0,
      );
      threadMap.set(key, {
        sessionId: session.id,
        sessionTitle: session.title,
        rootIndex,
        rootPreview,
        latestReplyIndex: index,
        latestReplyPreview: replyPreview,
        replyCount: (existing?.replyCount || 0) + 1,
        updatedAt,
      });
    }
  }

  return Array.from(threadMap.entries())
    .map(([key, value]) => ({
      id: key,
      ...value,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, opts.limit ?? 8);
}

export function buildPinnedSummaries(
  bookmarks: Bookmark[],
  sessions: Session[],
  opts: { limit?: number } = {},
): PinnedSummary[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const summaries: PinnedSummary[] = [];
  for (const bookmark of bookmarks) {
    const session = sessionById.get(bookmark.sessionId);
    if (!session) continue;
    const message = session.messages[bookmark.messageIndex];
    if (!message) continue;
    summaries.push({
      id: bookmark.id,
      sessionId: bookmark.sessionId,
      sessionTitle: session.title,
      messageIndex: bookmark.messageIndex,
      preview: bookmark.note?.trim()
        ? bookmark.note.trim()
        : summarizeContent(message.content, bookmark.preview || 'Pinned message'),
      note: bookmark.note?.trim() || undefined,
      updatedAt: bookmark.createdAt,
    });
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, opts.limit ?? 8);
}
