import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_FLEET,
  buildFleetMarkdown,
  buildFleetSlackDraft,
} from '../workspace-fleet';

describe('workspace fleet', () => {
  it('defines the default project fleet', () => {
    expect(DEFAULT_PROJECT_FLEET).toHaveLength(10);
    expect(DEFAULT_PROJECT_FLEET[0].title).toContain('Coordinator');
    expect(DEFAULT_PROJECT_FLEET.some((role) => role.id === 'audit')).toBe(true);
  });

  it('renders a markdown brief and slack draft', () => {
    const markdown = buildFleetMarkdown('AROS', 'AROS', 'aros');
    const slack = buildFleetSlackDraft('AROS', 'AROS', 'aros');
    expect(markdown).toContain('Project: AROS');
    expect(markdown).toContain('Tech Stack Expert');
    expect(slack).toContain('AROS');
    expect(slack).toContain('Coordinator / Shre OS');
  });
});
