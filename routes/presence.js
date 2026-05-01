// @ts-check
// Workspace presence routes — shared live presence across devices

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} PresenceDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string } | null>} checkAuth
 * @property {(payload: { tenantId: string, presence: ReturnType<typeof rowToPresence>[] }) => void} [onPresenceChange]
 */

const STALE_AFTER_MS = 90_000;

function ensureSchema(chatDb) {
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_presence (
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'away',
      display_name TEXT,
      agent_id TEXT,
      session_id TEXT,
      client_id TEXT,
      last_seen_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, tenant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_presence_tenant ON chat_presence(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_chat_presence_seen ON chat_presence(last_seen_at);
  `);
}

function rowToPresence(row) {
  const lastSeenAt = Number(row.last_seen_at) || 0;
  const updatedAt = Number(row.updated_at) || lastSeenAt;
  const age = Date.now() - lastSeenAt;
  const stale = age > STALE_AFTER_MS;
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    state: stale ? 'offline' : row.state,
    displayName: row.display_name || row.user_id,
    agentId: row.agent_id || undefined,
    sessionId: row.session_id || undefined,
    clientId: row.client_id || undefined,
    lastSeenAt,
    updatedAt,
  };
}

/**
 * Register presence routes.
 * @param {PresenceDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerPresenceRoutes({ log, chatDb, checkAuth, onPresenceChange }) {
  ensureSchema(chatDb);

  const stmtUpsert = chatDb.prepare(
    `INSERT INTO chat_presence
      (user_id, tenant_id, state, display_name, agent_id, session_id, client_id, last_seen_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, tenant_id) DO UPDATE SET
       state = excluded.state,
       display_name = excluded.display_name,
       agent_id = excluded.agent_id,
       session_id = excluded.session_id,
       client_id = excluded.client_id,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`,
  );
  const stmtList = chatDb.prepare(
    `SELECT user_id, tenant_id, state, display_name, agent_id, session_id, client_id, last_seen_at, updated_at
     FROM chat_presence
     WHERE tenant_id = ?
     ORDER BY last_seen_at DESC`,
  );

  return async function handlePresenceRoute(req, res, url, { json, collectBody }) {
    if (!url.pathname.startsWith('/api/chat-presence')) return false;

    const claims = await checkAuth(req);
    const tenantId = claims?.activeWorkspaceId || 'default';
    const userId = claims?.sub || 'system';

    if (req.method === 'GET' && url.pathname === '/api/chat-presence') {
      const rows = stmtList.all(tenantId).map(rowToPresence);
      return json(res, { presence: rows });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-presence/me') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const state = parsed?.state === 'active' ? 'active' : 'away';
        const now = Date.now();
        stmtUpsert.run(
          userId,
          tenantId,
          state,
          typeof parsed?.displayName === 'string' && parsed.displayName.trim()
            ? parsed.displayName.trim()
            : claims?.name || claims?.username || userId,
          typeof parsed?.agentId === 'string' ? parsed.agentId : null,
          typeof parsed?.sessionId === 'string' ? parsed.sessionId : null,
          typeof parsed?.clientId === 'string' ? parsed.clientId : null,
          Number(parsed?.lastSeenAt) || now,
          now,
        );
        const rows = stmtList.all(tenantId).map(rowToPresence);
        if (typeof onPresenceChange === 'function') {
          onPresenceChange({ tenantId, presence: rows });
        }
        return json(res, { ok: true, presence: { userId, tenantId, state, lastSeenAt: now } });
      } catch (err) {
        log.warn('[presence] update failed', {}, err);
        return json(res, { error: 'presence update failed' }, 400);
      }
    }

    return false;
  };
}
