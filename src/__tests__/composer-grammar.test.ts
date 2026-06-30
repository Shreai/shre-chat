import { describe, it, expect } from 'vitest';
import {
  parseComposerToken,
  applyToolToken,
  extractToolTokens,
} from '../lib/composer-grammar';

describe('parseComposerToken', () => {
  it('returns none for plain text', () => {
    expect(parseComposerToken('hello world').kind).toBe('none');
    expect(parseComposerToken('').kind).toBe('none');
  });

  it('detects slash commands only as the whole input', () => {
    expect(parseComposerToken('/model').kind).toBe('slash');
    expect(parseComposerToken('/model claude').query).toBe('model claude');
    // "/ " is a literal slash, not a command
    expect(parseComposerToken('/ thoughts').kind).toBe('none');
  });

  it('detects @@ agent mentions at the cursor end', () => {
    const t = parseComposerToken('please @@anal');
    expect(t.kind).toBe('mention');
    expect(t.query).toBe('anal');
    expect(t.sigil).toBe('@@');
  });

  it('does NOT fire on a single @ (email/scope safety)', () => {
    expect(parseComposerToken('email me@host.com').kind).toBe('none');
    expect(parseComposerToken('install @scope/pkg').kind).toBe('none');
    expect(parseComposerToken('meet @ 5pm').kind).toBe('none');
  });

  it('detects #tool tokens at the cursor end', () => {
    const t = parseComposerToken('run #web-sea');
    expect(t.kind).toBe('tool');
    expect(t.query).toBe('web-sea');
    expect(t.sigil).toBe('#');
  });

  it('does not treat a mid-word hash as a tool', () => {
    expect(parseComposerToken('issue#42').kind).toBe('none');
  });
});

describe('applyToolToken', () => {
  it('replaces the active #token with the chosen id + space', () => {
    expect(applyToolToken('run #web', 'web-search')).toBe('run #web-search ');
    expect(applyToolToken('#', 'sql')).toBe('#sql ');
  });
});

describe('extractToolTokens', () => {
  it('pulls all #tool ids and cleans the text', () => {
    const { cleanText, toolIds } = extractToolTokens('pull sales #sql-query and chart #charts');
    expect(toolIds).toEqual(['sql-query', 'charts']);
    expect(cleanText).toBe('pull sales and chart');
  });

  it('returns empty when no tools armed', () => {
    const { cleanText, toolIds } = extractToolTokens('just a normal message');
    expect(toolIds).toEqual([]);
    expect(cleanText).toBe('just a normal message');
  });
});
