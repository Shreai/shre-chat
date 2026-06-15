import { describe, it, expect } from 'vitest';
import { buildSwitchNotice, isSwitchNotice, modelLabel } from '../lib/switch-notice';

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
