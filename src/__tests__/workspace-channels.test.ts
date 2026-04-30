import { describe, expect, it } from 'vitest';
import { resolveWorkspaceChannelForEvent, getWorkspaceChannelTag } from '../workspace-channels';

describe('workspace channels', () => {
  it('routes approvals to the approvals channel', () => {
    expect(resolveWorkspaceChannelForEvent('approval.requested')).toBe('approvals');
    expect(resolveWorkspaceChannelForEvent('project.pending_approval')).toBe('approvals');
  });

  it('routes alerts and failures to the alerts channel', () => {
    expect(resolveWorkspaceChannelForEvent('task.failed')).toBe('alerts');
    expect(resolveWorkspaceChannelForEvent('service.unhealthy')).toBe('alerts');
    expect(resolveWorkspaceChannelForEvent('deploy.monitor.breach')).toBe('alerts');
  });

  it('respects severity when the event type is otherwise generic', () => {
    expect(resolveWorkspaceChannelForEvent('notification', { severity: 'critical' })).toBe(
      'alerts',
    );
    expect(resolveWorkspaceChannelForEvent('notification', { level: 'high' })).toBe('alerts');
    expect(resolveWorkspaceChannelForEvent('notification', { severity: 'info' })).toBeNull();
  });

  it('formats channel tags consistently', () => {
    expect(getWorkspaceChannelTag('alerts')).toBe('channel:alerts');
  });
});
