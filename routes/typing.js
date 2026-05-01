// @ts-check
// Workspace typing routes — ephemeral typing indicators across devices

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} TypingDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string, name?: string, username?: string } | null>} checkAuth
 * @property {(payload: { tenantId: string, sessionId: string, typers: TypingRow[] }) => void} [onTypingChange]
 */

/**
 * @typedef {object} TypingRow
 * @property {string} userId
 * @property {string} tenantId
 * @property {string} sessionId
 * @property {string} displayName
 * @property {string} state
 * @property {number} lastSeenAt
 * @property {number} updatedAt
 */

const STALE_AFTER_MS = 8_000;

const typingByKey = new Map();

function keyFor(tenantId, sessionId, userId) {
  return `${tenantId}:${sessionId}:${userId}`;
}

function normalizeRow(row) {
  const lastSeenAt = Number(row.lastSeenAt || row.last_seen_at) || 0;
  const updatedAt = Number(row.updatedAt || row.updated_at) || lastSeenAt;
  const state = String(row.state || 'idle');
  return {
    userId: String(row.userId || row.user_id || ''),
    tenantId: String(row.tenantId || row.tenant_id || ''),
    sessionId: String(row.sessionId || row.session_id || ''),
    displayName: String(row.displayName || row.display_name || row.userId || row.user_id || ''),
    state,
    lastSeenAt,
    updatedAt,
  };
}

function upsertTyping({ tenantId, sessionId, userId, displayName, state, lastSeenAt }) {
  const now = Date.now();
  const row = {
    userId,
    tenantId,
    sessionId,
    displayName,
    state: state === 'typing' ? 'typing' : 'idle',
    lastSeenAt: Number(lastSeenAt) || now,
    updatedAt: now,
  };
  typingByKey.set(keyFor(tenantId, sessionId, userId), row);
  return row;
}

function listTyping(tenantId, sessionId) {
  const now = Date.now();
  const rows = [];
  for (const row of typingByKey.values()) {
    if (row.tenantId !== tenantId || row.sessionId !== sessionId) continue;
    if (now - row.lastSeenAt > STALE_AFTER_MS) {
      typingByKey.delete(keyFor(row.tenantId, row.sessionId, row.userId));
      continue;
    }
    if (row.state === 'typing') rows.push(row);
  }
  return rows
    .map((row) => normalizeRow(row))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Register typing routes.
 * @param {TypingDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerTypingRoutes({ log, chatDb, checkAuth, onTypingChange }) {
  void chatDb;

  return async function handleTypingRoute(req, res, url, { json, collectBody }) {
    if (!url.pathname.startsWith('/api/chat-typing')) return false;

    const claims = await checkAuth(req);
    const tenantId = claims?.activeWorkspaceId || 'default';
    const userId = claims?.sub || 'system';
    const currentName = claims?.name || claims?.username || userId;

    if (req.method === 'GET' && url.pathname === '/api/chat-typing') {
      const sessionId = url.searchParams.get('sessionId') || '';
      if (!sessionId) return json(res, { typers: [] });
      const typers = listTyping(tenantId, sessionId);
      return json(res, { typers });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-typing/me') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const sessionId = typeof parsed?.sessionId === 'string' ? parsed.sessionId.trim() : '';
        if (!sessionId) return json(res, { error: 'missing sessionId' }, 400);
        const state = parsed?.state === 'typing' ? 'typing' : 'idle';
        const displayName =
          typeof parsed?.displayName === 'string' && parsed.displayName.trim()
            ? parsed.displayName.trim()
            : currentName;
        if (state === 'idle') {
          typingByKey.delete(keyFor(tenantId, sessionId, userId));
        } else {
          upsertTyping({
            tenantId,
            sessionId,
            userId,
            displayName,
            state,
            lastSeenAt: Number(parsed?.lastSeenAt) || Date.now(),
          });
        }
        const typers = listTyping(tenantId, sessionId);
        if (typeof onTypingChange === 'function') {
          onTypingChange({ tenantId, sessionId, typers });
        }
        return json(res, { ok: true, sessionId, state, typers });
      } catch (err) {
        log.warn('[typing] update failed', {}, err);
        return json(res, { error: 'typing update failed' }, 400);
      }
    }

    return false;
  };
}
