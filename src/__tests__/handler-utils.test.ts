import { describe, expect, it } from 'vitest';
import { isRetailPosPrompt } from '../hooks/message-handlers/handler-utils';

describe('retail POS prompt detection', () => {
  it('matches sales and inventory requests', () => {
    expect(isRetailPosPrompt('what are my sales at party liquor today?')).toBe(true);
    expect(isRetailPosPrompt('show inventory for tonight')).toBe(true);
    expect(isRetailPosPrompt('how many transactions did we have?')).toBe(true);
  });

  it('does not match general conversation', () => {
    expect(isRetailPosPrompt('tell me a joke')).toBe(false);
    expect(isRetailPosPrompt('help me brainstorm marketing ideas')).toBe(false);
  });
});
