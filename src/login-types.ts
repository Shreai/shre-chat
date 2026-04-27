export type LoginType = 'dev' | 'qa' | 'beta' | 'production';

const LOGIN_TYPE_ALIASES: Record<string, LoginType> = {
  dev: 'dev',
  qa: 'qa',
  beta: 'beta',
  prod: 'production',
  production: 'production',
  customer: 'production',
  production_ready: 'production',
};

export function normalizeLoginType(value?: string | null): LoginType {
  if (!value) return 'production';
  const normalized = value.trim().toLowerCase();
  return LOGIN_TYPE_ALIASES[normalized] ?? 'production';
}

export function isCustomerFacingLoginType(loginType: LoginType): boolean {
  return loginType === 'beta' || loginType === 'production';
}

export function getShellMode(loginType: LoginType): 'dev' | 'qa' | 'customer' {
  if (loginType === 'dev') return 'dev';
  if (loginType === 'qa') return 'qa';
  return 'customer';
}

export function getLoginTypeCopy(loginType: LoginType) {
  const shellMode = getShellMode(loginType);
  if (shellMode === 'dev') {
    return {
      label: 'Dev',
      subtitle: 'Technical workspace',
      description: 'Logs, bugs, implementation notes, and fix actions.',
    };
  }
  if (shellMode === 'qa') {
    return {
      label: 'QA',
      subtitle: 'Verification workspace',
      description: 'Repro steps, evidence, regressions, and pass/fail actions.',
    };
  }
  return {
    label: 'Customer',
    subtitle: 'Beta / Production',
    description: 'A clean customer-facing workspace for status, replies, and updates.',
  };
}

export function getLoginTypeAccent(loginType: LoginType): string {
  if (loginType === 'dev') return '#2563eb';
  if (loginType === 'qa') return '#16a34a';
  return '#4f6edc';
}
