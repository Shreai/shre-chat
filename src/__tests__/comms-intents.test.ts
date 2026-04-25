import { describe, expect, it } from 'vitest';
import {
  buildCommsShortcutReply,
  detectCommsShortcut,
} from '../hooks/message-handlers/comms-intents';

describe('comms intents', () => {
  it('routes approvals questions to the approvals channel', () => {
    const shortcut = detectCommsShortcut('show me approvals');
    expect(shortcut?.id).toBe('approvals');
    expect(buildCommsShortcutReply(shortcut!)).toContain('Open Approvals');
  });

  it('routes briefing requests to the briefings page', () => {
    const shortcut = detectCommsShortcut("read today's briefing");
    expect(shortcut?.id).toBe('briefings');
    expect(shortcut?.link).toContain('/briefings');
  });

  it('routes alert questions to inbox alerts', () => {
    const shortcut = detectCommsShortcut('what alerts do I have?');
    expect(shortcut?.id).toBe('alerts');
    expect(shortcut?.link).toContain('/inbox/all');
  });

  it('routes vendor and payroll requests to comms', () => {
    expect(detectCommsShortcut('send this PO to vendor')?.id).toBe('vendor');
    expect(detectCommsShortcut('review payroll for this week')?.id).toBe('payroll');
  });
});
