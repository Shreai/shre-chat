import { describe, it, expect } from 'vitest';
import { planFanout, splitIntents } from '../intentSplitter';

describe('planFanout', () => {
  it('does not orchestrate a single request', () => {
    const p = planFanout("what's today's sales?");
    expect(p.shouldOrchestrate).toBe(false);
    expect(p.summary).toBe('single request');
  });

  it('does not orchestrate "fetch X and fetch Y" (one intent signal)', () => {
    // Only the first segment leads with a query verb → not a real split.
    const p = planFanout('show me apples and oranges');
    expect(p.shouldOrchestrate).toBe(false);
  });

  it('orchestrates an action + a query', () => {
    const p = planFanout("remind me to generate payroll tomorrow and fetch me today's sales");
    expect(p.shouldOrchestrate).toBe(true);
    expect(p.tasks.length).toBeGreaterThanOrEqual(2);
    expect(p.summary).toContain('action');
    expect(p.summary).toContain('quer');
  });

  it('orchestrates two distinct actions', () => {
    const p = planFanout('create a task to call the vendor and file a bug about the printer');
    expect(p.shouldOrchestrate).toBe(true);
  });

  it('keeps splitIntents behaviour intact', () => {
    const r = splitIntents('hi');
    expect(r.wasSplit).toBe(false);
  });
});
