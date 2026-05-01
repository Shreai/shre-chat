// @ts-check
// Workspace thread routes — server-backed thread summary index

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} ThreadDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string } | null>} checkAuth
 */

function stripMessagePreview(content) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function summarizeContent(content, fallback) {
  const preview = stripMessagePreview(content);
  return preview || fallback;
}

function parseMessages(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildThreadSummariesFromSessions(rows, opts = {}) {
  const threadMap = new Map();
  for (const row of rows) {
    const messages = parseMessages(row.messages);
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.replyTo == null) continue;
      const rootIndex = message.replyTo;
      if (rootIndex < 0 || rootIndex >= messages.length) continue;
      const root = messages[rootIndex];
      if (!root) continue;
      const key = `${row.id}:${rootIndex}`;
      const existing = threadMap.get(key);
      const replyPreview = summarizeContent(message.content, 'Reply');
      const rootPreview = summarizeContent(root.content, 'Thread');
      const updatedAt = Math.max(
        existing?.updatedAt || 0,
        Number(message.timestamp) || 0,
        Number(root.timestamp) || 0,
        Number(row.updated_at) || 0,
      );
      threadMap.set(key, {
        id: key,
        sessionId: row.id,
        sessionTitle: row.title,
        rootIndex,
        rootPreview,
        latestReplyIndex: index,
        latestReplyPreview: replyPreview,
        replyCount: (existing?.replyCount || 0) + 1,
        updatedAt,
      });
    }
  }

  const limit = Number(opts.limit) || 8;
  return Array.from(threadMap.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/**
 * Register thread routes.
 * @param {ThreadDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function }) => Promise<boolean>}
 */
export function registerThreadRoutes({ log, chatDb, checkAuth }) {
  const stmtList = chatDb.prepare(
    `SELECT id, title, messages, updated_at
     FROM chat_sessions
     WHERE user_id = ? AND tenant_id = ?
     ORDER BY updated_at DESC LIMIT 100`,
  );

  return async function handleThreadRoute(req, res, url, { json }) {
    if (req.method !== 'GET' || url.pathname !== '/api/chat-threads') return false;

    try {
      const claims = await checkAuth(req);
      const userId = claims?.sub || 'system';
      const tenantId = claims?.activeWorkspaceId || 'default';
      const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 8), 50));
      const rows = stmtList.all(userId, tenantId);
      const threads = buildThreadSummariesFromSessions(rows, { limit });
      return json(res, { threads });
    } catch (err) {
      log.warn('[threads] list failed', {}, err);
      return json(res, { error: 'thread list failed' }, 500);
    }
  };
}
