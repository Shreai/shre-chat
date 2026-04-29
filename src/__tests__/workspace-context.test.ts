// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_USER_KEY,
  WORKSPACE_ID_KEY,
  getAppModeForHost,
  scopedStorageKey,
} from '../workspace-context';
import { loadSessions, saveSessions } from '../store';

describe('workspace context scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('classifies the documents host and keeps qa/dev on chat', () => {
    expect(getAppModeForHost('shre.nirtek.net')).toBe('documents');
    expect(getAppModeForHost('qa.mib.nirtek.net')).toBe('chat');
    expect(getAppModeForHost('dev.mirb.nirtek.net')).toBe('chat');
  });

  it('scopes sessions by host, user, and workspace', () => {
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({ id: 'user-1', username: 'user-1', email: 'user@example.com' }),
    );
    localStorage.setItem(WORKSPACE_ID_KEY, 'workspace-1');

    const sessions = [
      {
        id: 'session-1',
        title: 'Scoped',
        agentId: 'main',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    saveSessions(sessions);

    expect(localStorage.getItem('shre-sessions')).toBeNull();
    expect(localStorage.getItem(scopedStorageKey('shre-sessions'))).toContain('session-1');
    expect(loadSessions()).toHaveLength(1);
    expect(loadSessions()[0]?.id).toBe('session-1');
  });
});
