// @ts-check
// Session routes — SQLite chat_sessions CRUD + sync, OpenClaw session reading

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} ChatSessionRow
 * @property {string} id
 * @property {string} title
 * @property {string} agent_id
 * @property {number} pinned
 * @property {string} tags - JSON-encoded string array
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} [messages] - JSON-encoded messages array
 */

/**
 * @typedef {object} ClientSession
 * @property {string} id
 * @property {string} title
 * @property {string} agentId
 * @property {boolean} pinned
 * @property {string[]} tags
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {any[]} [messages]
 */

/**
 * @typedef {object} SessionDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb - better-sqlite3 Database instance
 * @property {any} stmtGetAll - prepared statement: list all sessions
 * @property {any} stmtGetOne - prepared statement: get single session by id
 * @property {any} stmtDelete - prepared statement: hard delete
 * @property {any} stmtSoftDelete - prepared statement: soft delete (mark deleted_by)
 * @property {any} stmtRestoreDeleted - prepared statement: restore from trash
 * @property {any} stmtRemoveFromTrash - prepared statement: remove trash entry
 * @property {any} stmtListDeleted - prepared statement: list trash
 * @property {any} stmtPurgeTrash - prepared statement: purge old trash entries
 * @property {(session: any) => void} upsertSession
 * @property {(row: ChatSessionRow) => ClientSession} dbSessionToClient
 * @property {(req: IncomingMessage) => { sub: string, role: string } | null} checkAuth
 */

/**
 * Register session routes.
 * @param {SessionDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerSessionRoutes({ log, chatDb, stmtGetAll, stmtGetOne, stmtDelete, stmtSoftDelete, stmtRestoreDeleted, stmtRemoveFromTrash, stmtListDeleted, stmtPurgeTrash, upsertSession, dbSessionToClient, checkAuth }) {

  return async function handleSessionRoute(req, res, url, { json, collectBody }) {

    // ─── Session Persistence API (SQLite) ──────────────────────────

    // GET /api/chat-sessions — list all (metadata only, no messages)
    if (req.method === 'GET' && url.pathname === '/api/chat-sessions') {
      const claims = checkAuth(req);
      const userId = claims?.sub || 'system';
      const tenantId = claims?.activeWorkspaceId || 'default';
      const rows = stmtGetAll.all(userId, tenantId);
      const sessions = rows.map(r => ({
        id: r.id,
        title: r.title,
        agentId: r.agent_id,
        pinned: !!r.pinned,
        tags: JSON.parse(r.tags || '[]'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return json(res, sessions);
    }

    // GET /api/chat-sessions/recent-context — cross-session context for AI memory
    if (req.method === 'GET' && url.pathname === '/api/chat-sessions/recent-context') {
      try {
        const claims = checkAuth(req);
        const userId = claims?.sub || 'system';
        const tenantId = claims?.activeWorkspaceId || 'default';
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        // Last 5 sessions (metadata + message count, not full messages)
        const recentSessions = chatDb.prepare(
          `SELECT id, title, agent_id, updated_at,
                  json_array_length(messages) as messageCount
           FROM chat_sessions
           WHERE user_id = ? AND tenant_id = ? AND updated_at > ? AND title != 'New chat'
           ORDER BY updated_at DESC LIMIT 5`
        ).all(userId, tenantId, sevenDaysAgo);

        // Recent voice session summaries
        let voiceSummaries = [];
        try {
          voiceSummaries = chatDb.prepare(
            `SELECT summary, agent_id, created_at, turn_count, topics
             FROM voice_sessions
             WHERE user_id = ? AND tenant_id = ? AND created_at > ? AND summary IS NOT NULL AND summary != ''
             ORDER BY created_at DESC LIMIT 5`
          ).all(userId, tenantId, sevenDaysAgo);
        } catch { /* voice tables may not exist yet */ }

        // Recent voice actions (what the agent DID)
        let recentActions = [];
        try {
          recentActions = chatDb.prepare(
            `SELECT action_type, target, result, status, created_at
             FROM voice_actions
             WHERE user_id = ? AND tenant_id = ? AND created_at > ?
             ORDER BY created_at DESC LIMIT 10`
          ).all(userId, tenantId, sevenDaysAgo);
        } catch { /* voice_actions may not exist yet */ }

        // Recent chat actions (text chat equivalent)
        let recentChatActions = [];
        try {
          recentChatActions = chatDb.prepare(
            `SELECT action_type, target, result, status, agent_id, created_at
             FROM chat_actions
             WHERE user_id = ? AND tenant_id = ? AND created_at > ?
             ORDER BY created_at DESC LIMIT 10`
          ).all(userId, tenantId, sevenDaysAgo);
        } catch { /* chat_actions may not exist yet */ }

        // Merge voice + chat actions, sorted by date
        const allActions = [...recentActions, ...recentChatActions]
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 15);

        return json(res, { recentSessions, voiceSummaries, recentActions: allActions });
      } catch (err) {
        log.warn("recent-context error", {}, err);
        return json(res, { recentSessions: [], voiceSummaries: [], recentActions: [] });
      }
    }

    // GET /api/chat-sessions/search — search past conversations (text + voice + audit)
    if (req.method === 'GET' && url.pathname === '/api/chat-sessions/search') {
      try {
        const claims = checkAuth(req);
        const userId = claims?.sub || 'system';
        const query = url.searchParams.get("q") || "";
        const since = url.searchParams.get("since") || "0";
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
        if (!query || query.length < 2) return json(res, { error: "Query must be at least 2 characters" }, 400);

        const tenantId = claims?.activeWorkspaceId || 'default';
        const sinceMs = isNaN(Number(since)) ? new Date(since).getTime() : Number(since);
        const results = [];

        // Search chat sessions (title + messages JSON contains query)
        const sessionHits = chatDb.prepare(
          `SELECT id, title, agent_id, updated_at,
                  json_array_length(messages) as messageCount
           FROM chat_sessions
           WHERE user_id = ? AND tenant_id = ? AND (title LIKE ? OR messages LIKE ?) AND updated_at > ?
           ORDER BY updated_at DESC LIMIT ?`
        ).all(userId, tenantId, `%${query}%`, `%${query}%`, sinceMs || 0, limit);
        for (const s of sessionHits) {
          results.push({ type: "session", id: s.id, title: s.title, agent_id: s.agent_id, updated_at: s.updated_at, messageCount: s.messageCount });
        }

        // Search chat audit log (try FTS5 first, fall back to LIKE)
        try {
          let auditHits;
          try {
            // FTS5 — much faster for keyword search
            auditHits = chatDb.prepare(
              `SELECT cal.id, cal.session_id, cal.agent_id, cal.model, cal.user_message, cal.assistant_response, cal.created_at
               FROM chat_audit_fts fts
               JOIN chat_audit_log cal ON cal.rowid = fts.rowid
               WHERE chat_audit_fts MATCH ? AND cal.created_at > ? AND (cal.user_id = ? OR cal.user_id IS NULL)
               ORDER BY cal.created_at DESC LIMIT ?`
            ).all(query, sinceMs || 0, userId, limit);
          } catch {
            // Fallback to LIKE if FTS5 not available
            auditHits = chatDb.prepare(
              `SELECT id, session_id, agent_id, model, user_message, assistant_response, created_at
               FROM chat_audit_log
               WHERE (user_message LIKE ? OR assistant_response LIKE ?) AND created_at > ? AND (user_id = ? OR user_id IS NULL)
               ORDER BY created_at DESC LIMIT ?`
            ).all(`%${query}%`, `%${query}%`, sinceMs || 0, userId, limit);
          }
          for (const a of auditHits) {
            results.push({
              type: "chat_exchange",
              id: a.id,
              session_id: a.session_id,
              agent_id: a.agent_id,
              preview: (a.user_message || "").slice(0, 200),
              response_preview: (a.assistant_response || "").slice(0, 200),
              created_at: a.created_at,
            });
          }
        } catch { /* chat_audit_log may not exist yet */ }

        // Search voice turns
        try {
          const voiceHits = chatDb.prepare(
            `SELECT id, session_id, role, content, created_at
             FROM voice_turns
             WHERE user_id = ? AND tenant_id = ? AND content LIKE ? AND created_at > ?
             ORDER BY created_at DESC LIMIT ?`
          ).all(userId, tenantId, `%${query}%`, sinceMs || 0, limit);
          for (const v of voiceHits) {
            results.push({
              type: "voice_turn",
              id: v.id,
              session_id: v.session_id,
              role: v.role,
              preview: (v.content || "").slice(0, 200),
              created_at: v.created_at,
            });
          }
        } catch { /* voice_turns may not exist yet */ }

        // Sort all results by date descending
        results.sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));

        return json(res, { results: results.slice(0, limit), total: results.length, query });
      } catch (err) {
        log.warn("chat-sessions search error", {}, err);
        return json(res, { error: "Search failed" }, 500);
      }
    }

    // GET /api/chat-sessions/trash — list recently deleted sessions (must be before :id match)
    if (req.method === 'GET' && url.pathname === '/api/chat-sessions/trash') {
      const claims = checkAuth(req);
      const userId = claims?.sub || 'system';
      const tenantId = claims?.activeWorkspaceId || 'default';
      const rows = stmtListDeleted.all(userId, tenantId);
      json(res, { sessions: rows });
      return true;
    }

    // POST /api/chat-sessions/:id/restore — undo delete (must be before :id match)
    if (req.method === 'POST' && url.pathname.match(/^\/api\/chat-sessions\/[^/]+\/restore$/)) {
      const parts = url.pathname.split('/');
      const id = parts[parts.length - 2];
      const claims = checkAuth(req);
      const userId = claims?.sub || 'system';
      const tenantId = claims?.activeWorkspaceId || 'default';
      const restored = stmtRestoreDeleted.run(id, userId, tenantId);
      if (restored.changes === 0) {
        return json(res, { error: 'Not found in trash' }, 404);
      }
      stmtRemoveFromTrash.run(id, userId, tenantId);
      json(res, { ok: true, restored: true, id });
      return true;
    }

    // GET /api/chat-sessions/:id — get single session with messages
    if (req.method === 'GET' && url.pathname.match(/^\/api\/chat-sessions\/[^/]+$/)) {
      const id = url.pathname.split('/').pop();
      const claims = checkAuth(req);
      const userId = claims?.sub || 'system';
      const tenantId = claims?.activeWorkspaceId || 'default';
      const row = stmtGetOne.get(id, userId, tenantId);
      if (!row) return json(res, { error: 'not found' }, 404);
      json(res, dbSessionToClient(row));
      return true;
    }

    // PUT or POST /api/chat-sessions/:id — upsert single session
    if ((req.method === 'PUT' || req.method === 'POST') && url.pathname.match(/^\/api\/chat-sessions\/[^/]+$/) && !url.pathname.endsWith('/sync') && !url.pathname.endsWith('/restore')) {
      let body;
      try { body = await collectBody(req, 2 * 1024 * 1024); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const claims = checkAuth(req);
        const userId = claims?.sub || 'system';
        const tenantId = claims?.activeWorkspaceId || 'default';
        const session = JSON.parse(body);
        session.id = url.pathname.split('/').pop();
        upsertSession(session, userId, tenantId);
        json(res, { ok: true });
        return true;
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
    }

    // DELETE /api/chat-sessions/:id — soft delete
    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/chat-sessions\/[^/]+$/)) {
      const id = url.pathname.split('/').pop();
      const claims = checkAuth(req);
      const userId = claims?.sub || 'unknown';
      const tenantId = claims?.activeWorkspaceId || 'default';
      stmtSoftDelete.run(userId, id, userId, tenantId);
      stmtDelete.run(id, userId, tenantId);
      stmtPurgeTrash.run(Date.now() - 30 * 24 * 60 * 60 * 1000);
      json(res, { ok: true, recoverable: true });
      return true;
    }

    // POST /api/chat-sessions/sync — bulk merge
    if (req.method === 'POST' && url.pathname === '/api/chat-sessions/sync') {
      let body;
      try { body = await collectBody(req, 5 * 1024 * 1024); } catch { return json(res, { error: "Body too large" }, 413); }
      try {
        const claims = checkAuth(req);
        const userId = claims?.sub || 'system';
        const tenantId = claims?.activeWorkspaceId || 'default';
        const { sessions: clientSessions = [] } = JSON.parse(body);
        const serverRows = chatDb.prepare('SELECT * FROM chat_sessions WHERE user_id = ? AND tenant_id = ? ORDER BY updated_at DESC').all(userId, tenantId);
        const serverMap = new Map(serverRows.map(r => [r.id, r]));

        const bulkUpsert = chatDb.transaction((sessions) => {
          for (const cs of sessions) {
            const existing = serverMap.get(cs.id);
            const clientUpdated = cs.updatedAt || cs.updated_at || 0;
            const serverUpdated = existing ? existing.updated_at : 0;
            // Pick version with more messages to prevent localStorage-quota data loss
            const clientMsgCount = Array.isArray(cs.messages) ? cs.messages.length : 0;
            const serverMsgCount = existing ? JSON.parse(existing.messages || '[]').length : 0;
            if (clientMsgCount >= serverMsgCount || clientUpdated >= serverUpdated) {
              upsertSession(cs, userId, tenantId);
            }
          }
        });
        bulkUpsert(clientSessions);

        const mergedRows = chatDb.prepare('SELECT * FROM chat_sessions WHERE user_id = ? AND tenant_id = ? ORDER BY updated_at DESC LIMIT 100').all(userId, tenantId);
        const merged = mergedRows.map(dbSessionToClient);
        json(res, { sessions: merged });
        return true;
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
    }

    return false;
  };
}
