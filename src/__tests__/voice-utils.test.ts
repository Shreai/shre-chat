import { describe, expect, it } from 'vitest';
import { humanizeVoiceText, splitVoiceResponse } from '../voice/voice-utils';

describe('splitVoiceResponse', () => {
  it('returns the full text as spoken text when no separator is present', () => {
    const result = splitVoiceResponse('Hello there.');

    expect(result).toEqual({
      spokenText: 'Hello there.',
      referenceText: '',
    });
  });

  it('splits spoken and reference text at the separator line', () => {
    const result = splitVoiceResponse(
      'Your total sales are up 12%.\n\n---\n\n| Store | Sales |\n| --- | --- |\n| A | $12 |',
    );

    expect(result).toEqual({
      spokenText: 'Your total sales are up 12%.',
      referenceText: '| Store | Sales |\n| --- | --- |\n| A | $12 |',
    });
  });

  it('ignores extra whitespace around the response', () => {
    const result = splitVoiceResponse('  Quick summary.  \n---\n  More detail.  ');

    expect(result).toEqual({
      spokenText: 'Quick summary.',
      referenceText: 'More detail.',
    });
  });

  it('humanizes generic apology language for speech', () => {
    expect(
      humanizeVoiceText(
        "I'm unable to retrieve the sales data due to a connection issue. Could you confirm if there's any specific detail or context you'd like me to focus on?",
      ),
    ).toBe(
      "I couldn't pull the sales data just now. If you want, I can narrow it to a date, store, or metric.",
    );
  });
});
