export interface FleetRole {
  id: string;
  title: string;
  responsibility: string;
}

export const DEFAULT_PROJECT_FLEET: FleetRole[] = [
  {
    id: 'coordinator',
    title: 'Coordinator / Shre OS',
    responsibility: 'Keeps the project moving, routes tasks, and maintains the shared context.',
  },
  {
    id: 'tech-stack-expert',
    title: 'Tech Stack Expert',
    responsibility: 'Chooses and defends the architecture, stack, and delivery boundaries.',
  },
  {
    id: 'frontend',
    title: 'Frontend Agent',
    responsibility: 'Owns UI structure, CSS, motion, accessibility, and white-label theme layers.',
  },
  {
    id: 'backend',
    title: 'Backend Agent',
    responsibility: 'Owns schemas, databases, APIs, auth, integrations, and server-side rules.',
  },
  {
    id: 'infra',
    title: 'Infra Agent',
    responsibility: 'Handles deployment targets, DNS, hosting, environment adapters, and rollouts.',
  },
  {
    id: 'qa',
    title: 'QA Agent',
    responsibility: 'Runs Playwright, regression, and responsive checks before release.',
  },
  {
    id: 'security',
    title: 'Security / Pentest Agent',
    responsibility: 'Checks auth, secrets, RLS, headers, and obvious abuse paths.',
  },
  {
    id: 'marketing',
    title: 'Marketing Agent',
    responsibility: 'Drafts positioning, launch copy, product site content, and growth assets.',
  },
  {
    id: 'support',
    title: 'Support / Docs Agent',
    responsibility: 'Writes onboarding, help docs, runbooks, and support handoff material.',
  },
  {
    id: 'audit',
    title: 'Audit Agent',
    responsibility: 'Checks for drift, unsupported claims, missing docs, and release readiness.',
  },
];

export function buildFleetMarkdown(projectName: string, owner: string, shell: string): string {
  const items = DEFAULT_PROJECT_FLEET.map((role) => `- [ ] ${role.title} — ${role.responsibility}`);
  return [
    '# Project Fleet',
    `Project: ${projectName}`,
    `Owner: ${owner}`,
    `Shell: ${shell}`,
    '',
    'Roles:',
    ...items,
  ].join('\n');
}

export function buildFleetSlackDraft(projectName: string, owner: string, shell: string): string {
  const roles = DEFAULT_PROJECT_FLEET.map((role) => role.title).join(', ');
  return `Project fleet ready for ${projectName} (${shell}, owner ${owner}): ${roles}.`;
}
