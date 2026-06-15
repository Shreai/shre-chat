import { describe, it, expect } from 'vitest';
import {
  buildSwitchNotice,
  isSwitchNotice,
  modelLabel,
  shouldEmitSwitchNotice,
} from '../lib/switch-notice';

describe('buildSwitchNotice', () => {
  it('builds an agent switch chip with emoji + description', () => {
    const m = buildSwitchNotice({
      kind: 'agent',
      label: 'Analytics',
      emoji: '📊',
      description: 'Sales & inventory insights',
      now: 123,
    });
    expect(m.role).toBe('assistant');
    expect(m.content).toBe('📊 **Agent switched to Analytics** — Sales & inventory insights');
    expect(m.timestamp).toBe(123);
    expect(m.meta).toMatchObject({
      system: 'true',
      kind: 'switch',
      switchKind: 'agent',
      switchLabel: 'Analytics',
      switchEmoji: '📊',
      switchDescription: 'Sales & inventory insights',
    });
  });

  it('builds a model switch chip (no emoji/description)', () => {
    const m = buildSwitchNotice({ kind: 'model', label: 'claude-sonnet-4-6', now: 1 });
    expect(m.content).toBe('🧠 **Model switched to claude-sonnet-4-6**');
    expect(m.meta?.switchKind).toBe('model');
    expect(m.meta?.switchEmoji).toBeUndefined();
  });

  it('falls back to a default agent icon when no emoji', () => {
    const m = buildSwitchNotice({ kind: 'agent', label: 'Shre', now: 1 });
    expect(m.content).toBe('🤝 **Agent switched to Shre**');
  });

  it('modelLabel maps auto/provider/specific values', () => {
    expect(modelLabel(null)).toBe('Auto');
    expect(modelLabel('provider:anthropic')).toBe('Anthropic (auto)');
    expect(modelLabel('ollama/qwen3:8b')).toBe('qwen3:8b');
    expect(modelLabel('claude-x', [{ id: 'claude-x', name: 'Claude X' }])).toBe('Claude X');
  });

  it('isSwitchNotice recognises its own output', () => {
    const m = buildSwitchNotice({ kind: 'model', label: 'x', now: 1 });
    expect(isSwitchNotice(m)).toBe(true);
    expect(isSwitchNotice({ meta: { model: 'foo' } })).toBe(false);
    expect(isSwitchNotice({ meta: undefined })).toBe(false);
  });
});

describe('shouldEmitSwitchNotice', () => {
  const base = { sid: 's1', agent: 'shre', model: 'auto' };

  it('emits an agent chip on an in-session agent change (non-empty)', () => {
    expect(shouldEmitSwitchNotice(base, { ...base, agent: 'analytics' }, true)).toEqual({
      agent: true,
      model: false,
    });
  });

  it('emits a model chip on an in-session model change (non-empty)', () => {
    expect(shouldEmitSwitchNotice(base, { ...base, model: 'claude' }, true)).toEqual({
      agent: false,
      model: true,
    });
  });

  it('emits both when agent and model both change in-session', () => {
    expect(
      shouldEmitSwitchNotice(base, { ...base, agent: 'analytics', model: 'claude' }, true),
    ).toEqual({ agent: true, model: true });
  });

  it('stays silent on a session change (navigation, not a switch)', () => {
    expect(
      shouldEmitSwitchNotice(base, { sid: 's2', agent: 'analytics', model: 'claude' }, true),
    ).toEqual({ agent: false, model: false });
  });

  it('stays silent in an empty session even if agent/model changed', () => {
    expect(shouldEmitSwitchNotice(base, { ...base, agent: 'analytics' }, false)).toEqual({
      agent: false,
      model: false,
    });
  });

  it('stays silent when nothing changed', () => {
    expect(shouldEmitSwitchNotice(base, { ...base }, true)).toEqual({
      agent: false,
      model: false,
    });
  });

  it('stays silent when there is no active session (sid null)', () => {
    expect(
      shouldEmitSwitchNotice(
        { sid: null, agent: 'shre', model: 'auto' },
        { sid: null, agent: 'analytics', model: 'auto' },
        true,
      ),
    ).toEqual({ agent: false, model: false });
  });
});
