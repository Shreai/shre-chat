// @ts-check
// Workspace channel memberships — shared channel rosters across devices

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} ChannelMembershipDeps
 * @property {import('shre-sdk').Logger} log
 * @property {any} chatDb
 * @property {(req: IncomingMessage) => Promise<{ sub: string, role: string, activeWorkspaceId?: string, name?: string, username?: string } | null>} checkAuth
 * @property {(payload: { tenantId: string, channelId: string, members: ChannelMemberRow[] }) => void} [onMembershipChange]
 */

/**
 * @typedef {object} ChannelMemberRow
 * @property {string} memberId
 * @property {string} channelId
 * @property {string} displayName
 * @property {string} memberKind
 * @property {number} createdAt
 * @property {number} updatedAt
 */

const DEFAULT_CHANNEL_MEMBERS = {
  general: ['user', 'ellie', 'shre', 'architect', 'founding-engineer', 'compass', 'guardian', 'herald'],
  code: ['user', 'ellie', 'shre', 'architect', 'founding-engineer', 'weaver', 'guardian'],
  ops: ['user', 'ellie', 'shre', 'guardian', 'herald', 'pulse', 'compass'],
  strategy: ['user', 'ellie', 'shre', 'architect', 'chief-scientist', 'compass', 'herald'],
  alerts: ['user', 'ellie', 'shre', 'guardian', 'herald', 'pulse'],
  approvals: ['user', 'ellie', 'shre', 'guardian', 'herald'],
};

const DEFAULT_CHANNEL_IDS = Object.keys(DEFAULT_CHANNEL_MEMBERS);

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function displayNameForMember(memberId, currentUserName) {
  if (memberId === 'user') return currentUserName || 'You';
  return titleCase(memberId);
}

function ensureSchema(chatDb) {
  chatDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_channel_members (
      tenant_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      member_kind TEXT NOT NULL DEFAULT 'agent',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, channel_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_tenant ON chat_channel_members(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_channel ON chat_channel_members(channel_id);
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_updated ON chat_channel_members(updated_at);
  `);
}

function rowToMember(row) {
  return {
    memberId: row.member_id,
    channelId: row.channel_id,
    displayName: row.display_name,
    memberKind: row.member_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupRows(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.channel_id]) grouped[row.channel_id] = [];
    grouped[row.channel_id].push(rowToMember(row));
  }
  for (const channelId of Object.keys(grouped)) {
    grouped[channelId].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return grouped;
}

/**
 * Register channel membership routes.
 * @param {ChannelMembershipDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function, collectBody: Function }) => Promise<boolean>}
 */
export function registerChannelMembershipRoutes({ log, chatDb, checkAuth, onMembershipChange }) {
  ensureSchema(chatDb);

  const stmtListAll = chatDb.prepare(
    `SELECT tenant_id, channel_id, member_id, display_name, member_kind, created_at, updated_at
     FROM chat_channel_members
     WHERE tenant_id = ?
     ORDER BY channel_id ASC, display_name ASC`,
  );
  const stmtListChannel = chatDb.prepare(
    `SELECT tenant_id, channel_id, member_id, display_name, member_kind, created_at, updated_at
     FROM chat_channel_members
     WHERE tenant_id = ? AND channel_id = ?
     ORDER BY display_name ASC`,
  );
  const stmtUpsert = chatDb.prepare(
    `INSERT INTO chat_channel_members
      (tenant_id, channel_id, member_id, display_name, member_kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, channel_id, member_id) DO UPDATE SET
       display_name = excluded.display_name,
       member_kind = excluded.member_kind,
       updated_at = excluded.updated_at`,
  );
  const stmtDeleteChannel = chatDb.prepare(
    `DELETE FROM chat_channel_members WHERE tenant_id = ? AND channel_id = ?`,
  );
  const stmtDeleteMember = chatDb.prepare(
    `DELETE FROM chat_channel_members WHERE tenant_id = ? AND channel_id = ? AND member_id = ?`,
  );

  const ensureDefaultMembers = (tenantId, currentUserName) => {
    const now = Date.now();
    for (const channelId of DEFAULT_CHANNEL_IDS) {
      const existing = stmtListChannel.all(tenantId, channelId);
      const existingIds = new Set(existing.map((row) => row.member_id));
      for (const memberId of DEFAULT_CHANNEL_MEMBERS[channelId]) {
        if (existingIds.has(memberId)) continue;
        stmtUpsert.run(
          tenantId,
          channelId,
          memberId,
          displayNameForMember(memberId, currentUserName),
          memberId === 'user' ? 'user' : 'agent',
          now,
          now,
        );
      }
    }
  };

  const publish = (tenantId, channelId) => {
    if (typeof onMembershipChange !== 'function') return;
    const members = stmtListChannel.all(tenantId, channelId).map(rowToMember);
    onMembershipChange({ tenantId, channelId, members });
  };

  return async function handleChannelMembershipRoute(req, res, url, { json, collectBody }) {
    if (!url.pathname.startsWith('/api/chat-channel-memberships')) return false;

    const claims = await checkAuth(req);
    const tenantId = claims?.activeWorkspaceId || 'default';
    const userId = claims?.sub || 'system';
    const currentUserName = claims?.name || claims?.username || userId;

    if (req.method === 'GET' && url.pathname === '/api/chat-channel-memberships') {
      ensureDefaultMembers(tenantId, currentUserName);
      const rows = stmtListAll.all(tenantId);
      return json(res, { channels: groupRows(rows) });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/chat-channel-memberships/')) {
      const channelId = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!channelId) return json(res, { error: 'missing channelId' }, 400);
      ensureDefaultMembers(tenantId, currentUserName);
      const rows = stmtListChannel.all(tenantId, channelId).map(rowToMember);
      return json(res, { channelId, members: rows });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-channel-memberships/join') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const channelId = typeof parsed?.channelId === 'string' ? parsed.channelId.trim() : '';
        if (!channelId) return json(res, { error: 'missing channelId' }, 400);
        ensureDefaultMembers(tenantId, currentUserName);
        const now = Date.now();
        stmtUpsert.run(
          tenantId,
          channelId,
          userId,
          currentUserName,
          'user',
          now,
          now,
        );
        const members = stmtListChannel.all(tenantId, channelId).map(rowToMember);
        publish(tenantId, channelId);
        return json(res, { ok: true, channelId, members });
      } catch (err) {
        log.warn('[channel-memberships] join failed', {}, err);
        return json(res, { error: 'channel join failed' }, 400);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-channel-memberships/sync') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const channelId = typeof parsed?.channelId === 'string' ? parsed.channelId.trim() : '';
        if (!channelId) return json(res, { error: 'missing channelId' }, 400);

        const members = Array.isArray(parsed?.members) ? parsed.members : [];
        const nextMembers = members
          .map((member) => ({
            memberId: typeof member?.memberId === 'string' ? member.memberId.trim() : '',
            displayName: typeof member?.displayName === 'string' && member.displayName.trim()
              ? member.displayName.trim()
              : undefined,
            memberKind: member?.memberKind === 'user' ? 'user' : 'agent',
          }))
          .filter((member) => member.memberId);
        const now = Date.now();
        stmtDeleteChannel.run(tenantId, channelId);
        const normalized = nextMembers.length > 0 ? nextMembers : DEFAULT_CHANNEL_MEMBERS[channelId] || [];
        for (const member of normalized) {
          const memberId = typeof member === 'string' ? member : member.memberId;
          const displayName = typeof member === 'string'
            ? displayNameForMember(memberId, currentUserName)
            : member.displayName || displayNameForMember(memberId, currentUserName);
          const memberKind = typeof member === 'string'
            ? (memberId === userId ? 'user' : 'agent')
            : member.memberKind;
          stmtUpsert.run(
            tenantId,
            channelId,
            memberId,
            displayName,
            memberKind,
            now,
            now,
          );
        }
        const membersOut = stmtListChannel.all(tenantId, channelId).map(rowToMember);
        publish(tenantId, channelId);
        return json(res, { ok: true, channelId, members: membersOut });
      } catch (err) {
        log.warn('[channel-memberships] sync failed', {}, err);
        return json(res, { error: 'channel membership sync failed' }, 400);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-channel-memberships/leave') {
      try {
        const body = await collectBody(req);
        const parsed = JSON.parse(body || '{}');
        const channelId = typeof parsed?.channelId === 'string' ? parsed.channelId.trim() : '';
        if (!channelId) return json(res, { error: 'missing channelId' }, 400);
        stmtDeleteMember.run(tenantId, channelId, userId);
        const members = stmtListChannel.all(tenantId, channelId).map(rowToMember);
        publish(tenantId, channelId);
        return json(res, { ok: true, channelId, members });
      } catch (err) {
        log.warn('[channel-memberships] leave failed', {}, err);
        return json(res, { error: 'channel leave failed' }, 400);
      }
    }

    return false;
  };
}
