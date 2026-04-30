export type ModelFamilyKey =
  | 'ollama'
  | 'gemini'
  | 'claude'
  | 'kimi'
  | 'nvidia'
  | 'codex'
  | 'chatgpt'
  | 'other';

export interface ModelFamily {
  key: ModelFamilyKey;
  label: string;
  icon: string;
}

export interface FamilyModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

export const MODEL_FAMILIES: ModelFamily[] = [
  { key: 'ollama', label: 'Ollama', icon: '🦙' },
  { key: 'gemini', label: 'Gemini', icon: '🔵' },
  { key: 'claude', label: 'Claude', icon: '🟣' },
  { key: 'kimi', label: 'Kimi', icon: '🌙' },
  { key: 'nvidia', label: 'Nvidia', icon: '🟩' },
  { key: 'codex', label: 'Codex', icon: '⚙️' },
  { key: 'chatgpt', label: 'ChatGPT', icon: '🟢' },
  { key: 'other', label: 'Other', icon: '⚪' },
];

const FAMILY_LOOKUP: Record<ModelFamilyKey, ModelFamily> = MODEL_FAMILIES.reduce(
  (acc, family) => {
    acc[family.key] = family;
    return acc;
  },
  {} as Record<ModelFamilyKey, ModelFamily>,
);

export function getFamilyLabel(key: ModelFamilyKey): string {
  return FAMILY_LOOKUP[key]?.label ?? key;
}

export function getFamilyIcon(key: ModelFamilyKey): string {
  return FAMILY_LOOKUP[key]?.icon ?? '⚪';
}

export function getFamilyKey(modelId: string, provider?: string): ModelFamilyKey {
  const prefix = provider || modelId.split('/')[0] || '';
  if (prefix === 'ollama' || prefix === 'ollama-remote' || prefix === 'ollama-gpu') return 'ollama';
  if (prefix === 'google') return 'gemini';
  if (prefix === 'anthropic' || prefix === 'claude-cli') return 'claude';
  if (prefix === 'moonshot') return 'kimi';
  if (prefix === 'nvidia') return 'nvidia';
  if (prefix === 'openai') return modelId.includes('codex') ? 'codex' : 'chatgpt';
  return 'other';
}

export function groupModelsByFamily<T extends FamilyModelInfo>(models: T[]): Map<ModelFamilyKey, T[]> {
  const groups = new Map<ModelFamilyKey, T[]>();
  for (const family of MODEL_FAMILIES) groups.set(family.key, []);
  for (const model of models) {
    const key = getFamilyKey(model.id, model.provider);
    groups.get(key)!.push(model);
  }
  for (const [key, list] of groups) {
    if (list.length === 0) groups.delete(key);
  }
  return groups;
}

export function getProviderDisplayLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: 'Claude',
    'claude-cli': 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
    ollama: 'Ollama',
    'ollama-remote': 'Ollama',
    'ollama-gpu': 'Ollama',
    moonshot: 'Kimi',
    nvidia: 'Nvidia',
    xai: 'xAI',
    ensemble: 'Ensemble',
  };
  return labels[provider] || provider;
}

export function getProviderLockLabel(lock: string): string {
  const raw = lock.startsWith('provider:') ? lock.slice('provider:'.length) : lock;
  const aliases: Record<string, ModelFamilyKey> = {
    openai: 'chatgpt',
    chatgpt: 'chatgpt',
    codex: 'codex',
    anthropic: 'claude',
    claude: 'claude',
    google: 'gemini',
    gemini: 'gemini',
    moonshot: 'kimi',
    kimi: 'kimi',
    ollama: 'ollama',
    nvidia: 'nvidia',
  };
  const familyKey = aliases[raw];
  return familyKey ? getFamilyLabel(familyKey) : raw;
}
