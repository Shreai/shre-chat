/**
 * switch-notice.ts — Inline transcript chips announcing agent / model switches.
 *
 * When the user changes the active agent or model mid-conversation the chat
 * should make that visible in the transcript itself (not just the header), so
 * later replies are unambiguous about who/what produced them.
 *
 * These are rendered specially by MessageBubble via `meta.kind === 'switch'`.
 */
import type { ChatMessage } from '../router-client';

export type SwitchKind = 'agent' | 'model';

export interface SwitchNoticeInput {
  kind: SwitchKind;
  /** Display label — agent name or model name */
  label: string;
  /** Agent emoji (agent switches only) */
  emoji?: string;
  /** One-line agent description (agent switches only) */
  description?: string;
  /** Override timestamp (mainly for tests) */
  now?: number;
}

/** Build the chat message that records an agent/model switch. */
export function buildSwitchNotice(input: SwitchNoticeInput): ChatMessage {
  const { kind, label, emoji, description } = input;
  const icon = kind === 'agent' ? emoji || '🤝' : '🧠';
  const noun = kind === 'agent' ? 'Agent' : 'Model';
  const tail = kind === 'agent' && description ? ` — ${description}` : '';
  const meta: Record<string, string> = {
    system: 'true',
    kind: 'switch',
    switchKind: kind,
    switchLabel: label,
  };
  if (emoji) meta.switchEmoji = emoji;
  if (description) meta.switchDescription = description;
  return {
    role: 'assistant',
    content: `${icon} **${noun} switched to ${label}**${tail}`,
    timestamp: input.now ?? Date.now(),
    meta,
  };
}

/** True when a chat message is a switch-notice chip. */
export function isSwitchNotice(msg: Pick<ChatMessage, 'meta'>): boolean {
  return msg.meta?.kind === 'switch';
}

/**
 * Human-friendly label for a selected-model value, matching the ModelPicker:
 *   null            → "Auto"
 *   "provider:x"    → "X (auto)"
 *   "vendor/model"  → the model's display name, else the bare model id
 */
export function modelLabel(
  selectedModel: string | null,
  models: ReadonlyArray<{ id: string; name: string }> = [],
): string {
  if (!selectedModel) return 'Auto';
  if (selectedModel.startsWith('provider:')) {
    const provider = selectedModel.slice('provider:'.length);
    return `${provider.charAt(0).toUpperCase()}${provider.slice(1)} (auto)`;
  }
  const m = models.find((x) => x.id === selectedModel);
  return m?.name || selectedModel.split('/').pop() || selectedModel;
}
