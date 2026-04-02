import type { ChatWidgetProps } from '../types';

interface QuickAction {
  label: string;
  icon: string;
  action: string;
}

const ACTIONS: QuickAction[] = [
  { label: 'New Task', icon: '\u2795', action: 'new-task' },
  { label: 'Upload File', icon: '\ud83d\udcc4', action: 'upload' },
  { label: 'Voice Input', icon: '\ud83c\udf99\ufe0f', action: 'voice' },
  { label: 'Switch Agent', icon: '\ud83d\udd04', action: 'switch-agent' },
];

function handleAction(action: string) {
  window.dispatchEvent(new CustomEvent('shre-quick-action', { detail: { action } }));
}

export default function QuickActionsPanel({ size }: ChatWidgetProps) {
  const visible = size === 'compact' ? ACTIONS.slice(0, 3) : ACTIONS;

  return (
    <div className="space-y-2">
      <span className="text-[13px] font-semibold text-[var(--c-text-1)]">Quick Actions</span>
      <div className="grid grid-cols-2 gap-1.5">
        {visible.map((a) => (
          <button
            key={a.action}
            onClick={() => handleAction(a.action)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2
              bg-[var(--c-bg-hover)] hover:bg-[var(--c-bg-active)]
              transition-colors duration-150"
          >
            <span className="text-[15px]">{a.icon}</span>
            <span className="text-[13px] font-medium text-[var(--c-text-2)]">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
