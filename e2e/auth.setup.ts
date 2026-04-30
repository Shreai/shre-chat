import { test as setup, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const AUTH_FILE = '/tmp/shre-chat-auth.json';
const COMPOSER_SELECTOR =
  '#shre-chat-textarea, textarea[placeholder*="Queue a task" i], textarea[placeholder*="Type a message" i]';
const AUTH_TOKEN_KEY = 'shre-auth-token';
const AUTH_USER_KEY = 'shre-auth-user';
const AUTH_WORKSPACE_KEY = 'shre-auth-workspace';
const AUTH_WORKSPACES_KEY = 'shre-auth-workspaces';

async function seedAuthState(page: Parameters<typeof setup>[0]['page'], authData: any) {
  const migratedKey = `shre-onboarding-migrated:${authData.user.username}`;
  const profile = {
    id: authData.user.username,
    name: authData.user.name || authData.user.username,
    role: authData.user.role || 'user',
    bio: '',
    timezone: 'UTC',
    language: 'en',
    onboardedAt: Date.now(),
    business: { name: '', industry: '', size: '', goals: [], challenges: [], tools: [] },
    preferences: {
      communicationStyle: 'balanced',
      notifyOnComplete: true,
      showTasksOnGreeting: true,
      floatingChat: false,
    },
    skills: [],
    interests: [],
    memories: [],
  };
  const storageItems = [
    [AUTH_TOKEN_KEY, authData.token],
    [AUTH_USER_KEY, JSON.stringify(authData.user)],
    ['shre-user-profile', JSON.stringify(profile)],
    [`shre-user-profile:${authData.user.username}`, JSON.stringify(profile)],
  ] as const;

  if (authData.workspace) {
    storageItems.push([AUTH_WORKSPACE_KEY, JSON.stringify(authData.workspace)]);
  }
  if (authData.workspaces) {
    storageItems.push([AUTH_WORKSPACES_KEY, JSON.stringify(authData.workspaces)]);
  }

  await page.addInitScript((items, keyToRemove) => {
    for (const [key, value] of items) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    }
    localStorage.removeItem(keyToRemove);
  }, storageItems, migratedKey);
}

setup('authenticate', async ({ page }) => {
  setup.setTimeout(90_000);

  // Reuse cached auth state if available.
  // The manual login path is flaky in this environment; prefer the existing
  // session cookie jar whenever we have one and only fall back to sign-in
  // when there is no usable cache.
  if (existsSync(AUTH_FILE)) {
    // Verify the saved auth state still works
    await page.context().addCookies(
      JSON.parse((await import('node:fs')).readFileSync(AUTH_FILE, 'utf-8')).cookies || [],
    );
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const textarea = page.locator('#shre-chat-textarea');
    const valid = await textarea.isVisible({ timeout: 10_000 }).catch(() => false);
    if (valid) {
      // Auth state still works — no need to re-login
      return;
    }
  }

  const loginRes = await page.request.post('/api/auth/login', {
    data: { username: 'rapidnir', password: 'rapid@nir' },
  });
  if (!loginRes.ok()) {
    throw new Error(`Login API failed with ${loginRes.status()}`);
  }

  const authData = await loginRes.json();
  if (!authData?.token || !authData?.user) {
    throw new Error('Login API did not return a token and user');
  }

  await page.request.post('/api/onboarding/state', {
    headers: { Authorization: `Bearer ${authData.token}` },
    data: {
      onboardingPhase: 'complete',
      step: 'dashboard',
      completedSteps: [
        'welcome',
        'marketplace',
        'configure',
        'stores',
        'model',
        'agents',
        'dashboard',
      ],
      path: 'operator',
      identityData: {
        name: authData.user.name || authData.user.username,
        role: authData.user.role || 'user',
        businessName: authData.workspace?.name || '',
        businessType: '',
        businessSize: '',
      },
    },
  });

  await seedAuthState(page, authData);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector(COMPOSER_SELECTOR, { timeout: 40_000 });
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, `shre-onboarding-migrated:${authData.user.username}`);

  await page.context().storageState({ path: AUTH_FILE });
});
