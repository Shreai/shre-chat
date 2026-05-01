// @ts-check
// Chat bookmark routes — workspace-scoped shared pins/saved items

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} BookmarkRow
 * @property {string} id
 * @property {string} session_id
 * @property {number} message_index
 * @property {string} agent_id
 * @property {string} preview
 * @property {string | null} note
 * @property {number} created_at
 * @property {number} updated_at
 * @property {string} user_id
 * @property {string} tenant_id
 */

/**
 * @typedef {object} BookmarkPayload
 * @property {string} sessionId
 * @property {number} messageIndex
 * @property {string} agentId
 * @property {string} preview
 * @property {string} [note]
 * @property {number} [createdAt]
 */

/**
 * @typedef {object} BookmarkDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string } | null>} checkAuth
 */

function ensureBookmarkSchema(chatDb) {
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_bookmarks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      preview TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_tenant ON chat_bookmarks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_user ON chat_bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_session ON chat_bookmarks(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_updated ON chat_bookmarks(updated_at);
  `);
}

function rowToBookmark(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageIndex: row.message_index,
    agentId: row.agent_id,
    preview: row.preview,
    note: row.note || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Register bookmark routes.
 * @param {BookmarkDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerBookmarkRoutes({ log, chatDb, checkAuth }) {
  ensureBookmarkSchema(chatDb);

  const stmtList = chatDb.prepare(
    `SELECT id, session_id, message_index, agent_id, preview, note, created_at, updated_at
     FROM chat_bookmarks
     WHERE tenant_id = ?
     ORDER BY updated_at DESC, created_at DESC`,
  );
  const stmtGetOne = chatDb.prepare(
    `SELECT id, session_id, message_index, agent_id, preview, note, created_at, updated_at
     FROM chat_bookmarks
     WHERE id = ? AND tenant_id = ?`,
  );
  const stmtUpsert = chatDb.prepare(
    `INSERT OR REPLACE INTO chat_bookmarks
      (id, session_id, message_index, agent_id, preview, note, created_at, updated_at, user_id, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const stmtDelete = chatDb.prepare(`DELETE FROM chat_bookmarks WHERE id = ? AND tenant_id = ?`);
  const stmtDeleteBySession = chatDb.prepare(`DELETE FROM chat_bookmarks WHERE session_id = ? AND tenant_id = ?`);
  const stmtValidateSession = chatDb.prepare(
    `SELECT id FROM chat_sessions WHERE id = ? AND tenant_id = ? LIMIT 1`,
  );

  return async function handleBookmarkRoute(req, res, url, { json, collectBody }) {
    if (!url.pathname.startsWith('/api/chat-bookmarks')) return false;

    const claims = await checkAuth(req);
    const tenantId = claims?.activeWorkspaceId || 'default';
    const userId = claims?.sub || 'system';

    if (req.method === 'GET' && url.pathname === '/api/chat-bookmarks') {
      const rows = stmtList.all(tenantId).map(rowToBookmark);
      return json(res, { bookmarks: rows });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-bookmarks/sync') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const bookmarks = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
        for (const bookmark of bookmarks) {
          if (!bookmark?.id || !bookmark?.sessionId) continue;
          if (!stmtValidateSession.get(bookmark.sessionId, tenantId)) continue;
          stmtUpsert.run(
            String(bookmark.id),
            String(bookmark.sessionId),
            Number(bookmark.messageIndex) || 0,
            String(bookmark.agentId || 'main'),
            String(bookmark.preview || '').slice(0, 200),
            typeof bookmark.note === 'string' && bookmark.note.trim() ? String(bookmark.note).trim() : null,
            Number(bookmark.createdAt) || Date.now(),
            Number(bookmark.updatedAt) || Number(bookmark.createdAt) || Date.now(),
            userId,
            tenantId,
          );
        }
        const rows = stmtList.all(tenantId).map(rowToBookmark);
        return json(res, { ok: true, bookmarks: rows });
      } catch (err) {
        log.warn('[bookmarks] sync failed', {}, err);
        return json(res, { error: 'sync failed' }, 400);
      }
    }

    const itemMatch = url.pathname.match(/^\/api\/chat-bookmarks\/([^/]+)$/);
    if (itemMatch && req.method === 'PUT') {
      const id = decodeURIComponent(itemMatch[1]);
      try {
        const body = await collectBody(req);
        const payload = JSON.parse(body || '{}');
        if (!payload?.sessionId || typeof payload.sessionId !== 'string') {
          return json(res, { error: 'sessionId required' }, 400);
        }
        if (!stmtValidateSession.get(payload.sessionId, tenantId)) {
          return json(res, { error: 'session not found' }, 404);
        }
        const now = Date.now();
        stmtUpsert.run(
          id,
          String(payload.sessionId),
          Number(payload.messageIndex) || 0,
          String(payload.agentId || 'main'),
          String(payload.preview || '').slice(0, 200),
          typeof payload.note === 'string' && payload.note.trim() ? String(payload.note).trim() : null,
          Number(payload.createdAt) || now,
          now,
          userId,
          tenantId,
        );
        const row = stmtGetOne.get(id, tenantId);
        return json(res, { ok: true, bookmark: rowToBookmark(row) });
      } catch (err) {
        log.warn('[bookmarks] upsert failed', {}, err);
        return json(res, { error: 'upsert failed' }, 400);
      }
    }

    if (itemMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(itemMatch[1]);
      stmtDelete.run(id, tenantId);
      return json(res, { ok: true, id });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/chat-bookmarks/by-session') {
      const sessionId = url.searchParams.get('sessionId');
      if (sessionId) stmtDeleteBySession.run(sessionId, tenantId);
      return json(res, { ok: true });
    }

    return false;
  };
}
