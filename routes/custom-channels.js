// @ts-check
// Workspace custom channels — shared channel list across devices

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} CustomChannelDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string, name?: string, username?: string } | null>} checkAuth
 * @property {(payload: { tenantId: string, channels: CustomChannelRow[] }) => void} [onCustomChannelsChange]
 */

/**
 * @typedef {object} CustomChannelRow
 * @property {string} channelId
 * @property {string} label
 * @property {string} description
 * @property {string} mode
 * @property {string} accent
 * @property {string} createdBy
 * @property {number} createdAt
 * @property {number} updatedAt
 */

const ACCENTS = ['#60a5fa', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185'];

function ensureSchema(chatDb) {
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_custom_channels (
      tenant_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      mode TEXT NOT NULL,
      accent TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, channel_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_custom_channels_tenant ON chat_custom_channels(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_chat_custom_channels_updated ON chat_custom_channels(updated_at);
  `);
}

function normalizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
}

function displayLabel(label) {
  return String(label || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ');
}

function rowToChannel(row) {
  return {
    channelId: row.channel_id,
    label: row.label,
    description: row.description,
    mode: row.mode,
    accent: row.accent,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Register custom channel routes.
 * @param {CustomChannelDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerCustomChannelRoutes({ log, chatDb, checkAuth, onCustomChannelsChange }) {
  ensureSchema(chatDb);

  const stmtList = chatDb.prepare(
    `SELECT tenant_id, channel_id, label, description, mode, accent, created_by, created_at, updated_at
     FROM chat_custom_channels
     WHERE tenant_id = ?
     ORDER BY updated_at DESC, label ASC`,
  );
  const stmtGetOne = chatDb.prepare(
    `SELECT tenant_id, channel_id, label, description, mode, accent, created_by, created_at, updated_at
     FROM chat_custom_channels
     WHERE tenant_id = ? AND channel_id = ?`,
  );
  const stmtInsert = chatDb.prepare(
    `INSERT INTO chat_custom_channels
      (tenant_id, channel_id, label, description, mode, accent, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, channel_id) DO UPDATE SET
       label = excluded.label,
       description = excluded.description,
       mode = excluded.mode,
       accent = excluded.accent,
       created_by = excluded.created_by,
       updated_at = excluded.updated_at`,
  );
  const stmtUpdate = chatDb.prepare(
    `UPDATE chat_custom_channels
     SET label = ?, description = ?, mode = ?, accent = ?, updated_at = ?
     WHERE tenant_id = ? AND channel_id = ?`,
  );
  const stmtDelete = chatDb.prepare(
    `DELETE FROM chat_custom_channels WHERE tenant_id = ? AND channel_id = ?`,
  );
  const stmtDeleteMembers = chatDb.prepare(
    `DELETE FROM chat_channel_members WHERE tenant_id = ? AND channel_id = ?`,
  );

  const publish = (tenantId) => {
    if (typeof onCustomChannelsChange !== 'function') return;
    const channels = stmtList.all(tenantId).map(rowToChannel);
    onCustomChannelsChange({ tenantId, channels });
  };

  return async function handleCustomChannelsRoute(req, res, url, { json, collectBody }) {
    if (!url.pathname.startsWith('/api/chat-custom-channels')) return false;

    const claims = await checkAuth(req);
    const tenantId = claims?.activeWorkspaceId || 'default';
    const userId = claims?.sub || 'system';
    const currentUserName = claims?.name || claims?.username || userId;

    if (req.method === 'GET' && url.pathname === '/api/chat-custom-channels') {
      const channels = stmtList.all(tenantId).map(rowToChannel);
      return json(res, { channels });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-custom-channels') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const label = displayLabel(typeof parsed?.label === 'string' ? parsed.label : '');
        if (!label) return json(res, { error: 'missing label' }, 400);

        const channelId = `custom:${normalizeLabel(label) || Date.now().toString(36)}`;
        const existing = stmtGetOne.get(tenantId, channelId);
        if (existing) return json(res, { channel: rowToChannel(existing), existed: true });

        const accent = typeof parsed?.accent === 'string' && parsed.accent.trim()
          ? parsed.accent.trim()
          : ACCENTS[(stmtList.all(tenantId).length + label.length) % ACCENTS.length];
        const description =
          typeof parsed?.description === 'string' && parsed.description.trim()
            ? parsed.description.trim()
            : 'Custom workspace channel';
        const mode = typeof parsed?.mode === 'string' && parsed.mode.trim()
          ? parsed.mode.trim()
          : 'assistant';
        const now = Date.now();
        stmtInsert.run(
          tenantId,
          channelId,
          label,
          description,
          mode,
          accent,
          currentUserName,
          now,
          now,
        );
        const channel = rowToChannel(stmtGetOne.get(tenantId, channelId));
        publish(tenantId);
        return json(res, { ok: true, channel });
      } catch (err) {
        log.warn('[custom-channels] create failed', {}, err);
        return json(res, { error: 'custom channel create failed' }, 400);
      }
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/chat-custom-channels/')) {
      try {
        const channelId = decodeURIComponent(url.pathname.split('/').pop() || '');
        if (!channelId) return json(res, { error: 'missing channelId' }, 400);
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const label = displayLabel(typeof parsed?.label === 'string' ? parsed.label : '');
        if (!label) return json(res, { error: 'missing label' }, 400);
        const existing = stmtGetOne.get(tenantId, channelId);
        if (!existing) return json(res, { error: 'channel not found' }, 404);
        const accent =
          typeof parsed?.accent === 'string' && parsed.accent.trim()
            ? parsed.accent.trim()
            : existing.accent;
        const description =
          typeof parsed?.description === 'string' && parsed.description.trim()
            ? parsed.description.trim()
            : existing.description;
        const mode =
          typeof parsed?.mode === 'string' && parsed.mode.trim()
            ? parsed.mode.trim()
            : existing.mode;
        const now = Date.now();
        stmtUpdate.run(label, description, mode, accent, now, tenantId, channelId);
        const channel = rowToChannel(stmtGetOne.get(tenantId, channelId));
        publish(tenantId);
        return json(res, { ok: true, channel });
      } catch (err) {
        log.warn('[custom-channels] update failed', {}, err);
        return json(res, { error: 'custom channel update failed' }, 400);
      }
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/chat-custom-channels/')) {
      try {
        const channelId = decodeURIComponent(url.pathname.split('/').pop() || '');
        if (!channelId) return json(res, { error: 'missing channelId' }, 400);
        stmtDeleteMembers.run(tenantId, channelId);
        stmtDelete.run(tenantId, channelId);
        publish(tenantId);
        return json(res, { ok: true, channelId });
      } catch (err) {
        log.warn('[custom-channels] delete failed', {}, err);
        return json(res, { error: 'custom channel delete failed' }, 400);
      }
    }

    return false;
  };
}
