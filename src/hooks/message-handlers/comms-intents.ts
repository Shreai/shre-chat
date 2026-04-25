import { mib007Link } from '../../chat-utils';

export type CommsShortcutId = 'approvals' | 'briefings' | 'alerts' | 'comms' | 'vendor' | 'payroll';

export interface CommsShortcut {
  id: CommsShortcutId;
  label: string;
  link: string;
  description: string;
}

export interface CommsIntentsProps {
  actions: {
    addMessage: (
      sessionId: string,
      msg: {
        role: 'user' | 'assistant';
        content: string;
        timestamp?: number;
        meta?: Record<string, string>;
      },
    ) => void;
  };
}

const COMMS_PATTERNS: Array<{ regex: RegExp; shortcut: CommsShortcut }> = [
  {
    regex:
      /\b(approve|approvals?|approval\s+queue|pending\s+approvals?|review\s+(?:this|the)\s+approval)\b/i,
    shortcut: {
      id: 'approvals',
      label: 'Approvals',
      link: mib007Link('approvals/pending'),
      description: 'Pending approvals and review items',
    },
  },
  {
    regex:
      /\b(briefing|briefings|daily\s+briefing|morning\s+briefing|owner\s+briefing|daily\s+summary|digest)\b/i,
    shortcut: {
      id: 'briefings',
      label: 'Briefings',
      link: mib007Link('briefings'),
      description: 'Daily and owner briefings',
    },
  },
  {
    regex:
      /\b(alerts?|low\s+stock|stockouts?|failed\s+syncs?|exceptions?|urgent\s+alerts?|what\s+alerts?\s+do\s+i\s+have)\b/i,
    shortcut: {
      id: 'alerts',
      label: 'Alerts',
      link: mib007Link('inbox/all'),
      description: 'Alerts and operational exceptions',
    },
  },
  {
    regex:
      /\b(communication\s+center|comms|communications?|channels?|channel\s+messages?|slack|teams?)\b/i,
    shortcut: {
      id: 'comms',
      label: 'Comms',
      link: mib007Link('comms'),
      description: 'Workspace communications hub',
    },
  },
  {
    regex: /\b(vendor|supplier|purchase\s+order\s+to\s+vendor|send\s+.*\s+to\s+vendor)\b/i,
    shortcut: {
      id: 'vendor',
      label: 'Vendor',
      link: mib007Link('comms'),
      description: 'Vendor threads and purchase order handoff',
    },
  },
  {
    regex: /\b(payroll|pay\s+period|hours\s+worked|submit\s+payroll|accountant)\b/i,
    shortcut: {
      id: 'payroll',
      label: 'Payroll',
      link: mib007Link('comms'),
      description: 'Payroll review and accountant handoff',
    },
  },
];

export function detectCommsShortcut(text: string): CommsShortcut | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const { regex, shortcut } of COMMS_PATTERNS) {
    if (regex.test(trimmed)) return shortcut;
  }

  return null;
}

export function buildCommsShortcutReply(shortcut: CommsShortcut): string {
  switch (shortcut.id) {
    case 'approvals':
      return `I routed that to **${shortcut.label}**. [Open Approvals](${shortcut.link})`;
    case 'briefings':
      return `Here’s **${shortcut.label}**. [Open Briefings](${shortcut.link})`;
    case 'alerts':
      return `I opened the **Alerts** view in Inbox. [Open Inbox Alerts](${shortcut.link})`;
    case 'vendor':
      return `I routed that to the **Vendor** lane in Comms. [Open Comms](${shortcut.link})`;
    case 'payroll':
      return `I routed that to the **Payroll** lane in Comms. [Open Comms](${shortcut.link})`;
    case 'comms':
    default:
      return `I opened **Comms**. [Open Comms](${shortcut.link})`;
  }
}

export function useCommsIntents({ actions }: CommsIntentsProps) {
  const detectAndHandleCommsIntent = async (text: string, sessionId: string) => {
    const shortcut = detectCommsShortcut(text);
    if (!shortcut) return false;

    actions.addMessage(sessionId, {
      role: 'assistant',
      content: buildCommsShortcutReply(shortcut),
      timestamp: Date.now(),
      meta: { type: 'system', channel: shortcut.id },
    });
    return true;
  };

  return { detectAndHandleCommsIntent };
}
