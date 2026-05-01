import { scopedStorageKey } from './workspace-context';
import type { WorkspaceChannel } from './workspace-channels';

export type CustomWorkspaceChannel = Omit<WorkspaceChannel, 'id'> & {
  id: string;
  custom?: true;
};

const STORAGE_KEY = scopedStorageKey('shre-custom-workspace-channels');
const SNAPSHOT_KEY = 'shre-workspace-custom-channels-snapshot';
const CHANGE_EVENT = 'shre-workspace-custom-channels-changed';
const LEGACY_CHANGE_EVENT = 'shre-custom-workspace-channels-changed';

const ACCENTS = ['#60a5fa', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185'];

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function normalizeLabel(label: string) {
  return label
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
}

function fallbackChannelId(label: string) {
  const normalized = normalizeLabel(label) || 'channel';
  return `${normalized}-${Date.now().toString(36)}`;
}

export function loadCustomWorkspaceChannels(): CustomWorkspaceChannel[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomWorkspaceChannel[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (channel) =>
        !!channel &&
        typeof channel.id === 'string' &&
        typeof channel.label === 'string' &&
        typeof channel.description === 'string' &&
        typeof channel.mode === 'string' &&
        typeof channel.accent === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCustomWorkspaceChannels(channels: CustomWorkspaceChannel[]) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(channels));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    window.dispatchEvent(new Event(LEGACY_CHANGE_EVENT));
  } catch {
    /* quota or blocked */
  }
}

export function createCustomWorkspaceChannel(
  label: string,
  existingIds: string[],
): CustomWorkspaceChannel | null {
  const cleaned = label.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
  if (!cleaned) return null;
  const slug = normalizeLabel(cleaned);
  const id = `custom:${slug || fallbackChannelId(cleaned)}`;
  if (existingIds.includes(id)) return null;
  const accent = ACCENTS[existingIds.length % ACCENTS.length];
  return {
    id,
    label: cleaned.toLowerCase(),
    description: 'Custom workspace channel',
    mode: 'assistant',
    accent,
    custom: true,
  };
}
