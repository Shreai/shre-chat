/**
 * composer-grammar.ts — Unified prefix grammar for the chat composer.
 *
 * One parser classifies the "active token" the user is typing at the cursor end,
 * so the composer can drive a single, self-documenting autocomplete surface:
 *
 *   /command   → slash commands (sessions, apps, platform, /skill, /run …)
 *   @@agent    → address/route the message to a specific agent
 *   #tool      → arm a specific tool for the next message
 *
 * `@@` (double-at) is intentional: a single `@` collides with emails, "@scope"
 * package names and "@ 5pm" phrasing, which would pop the agent menu constantly.
 * Keeping the double sigil is a deliberate disambiguation, not an oversight.
 */

export type TokenKind = 'none' | 'slash' | 'mention' | 'tool';

export interface ComposerToken {
  kind: TokenKind;
  /** The text typed after the sigil (lowercased), '' when just the sigil so far */
  query: string;
  /** The literal sigil that triggered this token ('/', '@@', '#') */
  sigil: string;
}

const NONE: ComposerToken = { kind: 'none', query: '', sigil: '' };

// Agent mention: `@@query` at end, not part of a longer `@@@`/email run.
const MENTION_RE = /(?:^|[^@])@@(\w*)$/;
// Tool arm: `#query` at end, preceded by start-of-input or whitespace.
const TOOL_RE = /(?:^|\s)#([\w-]*)$/;
// Global form used to extract every armed tool token from a finished message.
const TOOL_GLOBAL_RE = /(?:^|\s)#([\w-]+)/g;

/**
 * Parse the active autocomplete token at the end of `input`.
 * Returns {kind:'none'} when nothing should trigger a menu.
 */
export function parseComposerToken(input: string): ComposerToken {
  // Slash commands: only when the WHOLE input is the command line ("/foo …"),
  // matching the existing useSlashCommands trigger (leading slash, not "/ ").
  if (input.startsWith('/') && !input.startsWith('/ ')) {
    return { kind: 'slash', query: input.slice(1).toLowerCase(), sigil: '/' };
  }

  const mention = input.match(MENTION_RE);
  if (mention) {
    return { kind: 'mention', query: mention[1].toLowerCase(), sigil: '@@' };
  }

  const tool = input.match(TOOL_RE);
  if (tool) {
    return { kind: 'tool', query: tool[1].toLowerCase(), sigil: '#' };
  }

  return NONE;
}

/**
 * Replace the active `#tool` token with the chosen tool id and a trailing space.
 * Mirrors useMentions' replacement behaviour for `@@`.
 */
export function applyToolToken(input: string, toolId: string): string {
  return input.replace(/#[\w-]*$/, `#${toolId} `);
}

/**
 * Extract all armed `#tool` ids from a message and return the cleaned text.
 * Tool tokens are stripped from the visible/sent text; the ids are returned so
 * the caller can merge them into the request's selectedTools.
 */
export function extractToolTokens(text: string): { cleanText: string; toolIds: string[] } {
  const toolIds = [...text.matchAll(TOOL_GLOBAL_RE)].map((m) => m[1]);
  const cleanText = text
    .replace(/(?:^|\s)#[\w-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanText, toolIds };
}
