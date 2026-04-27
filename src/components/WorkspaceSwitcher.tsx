import { useState, useRef } from 'react';
import { FloatingMenu } from './FloatingMenu';

interface Workspace {
  id: string;
  name: string;
  role: string;
  isDefault?: boolean;
}

interface WorkspaceSwitcherProps {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSwitch: (workspaceId: string) => void;
}

export function WorkspaceSwitcher({
  activeWorkspace,
  workspaces,
  onSwitch,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!activeWorkspace || workspaces.length <= 1) return null;

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      member: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      viewer: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    };
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[role] ?? colors.member}`}
      >
        {role}
      </span>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="font-medium truncate max-w-[120px]">{activeWorkspace.name}</span>
        {roleBadge(activeWorkspace.role)}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        width={224}
        maxHeight={320}
        alignment="start"
        placement="bottom"
        style={{
          background: 'var(--c-bg-2)',
          border: '1px solid var(--c-border-1)',
          borderRadius: 16,
          boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
          padding: '6px 0',
        }}
      >
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-4)]">
          Workspaces
        </div>
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => {
              if (ws.id !== activeWorkspace.id) {
                onSwitch(ws.id);
              }
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--c-bg-hover)] ${
              ws.id === activeWorkspace.id ? 'bg-[var(--c-bg-active)]' : ''
            }`}
            style={{ color: 'var(--c-text-1)' }}
          >
            <span
              className={`w-2 h-2 rounded-full ${ws.id === activeWorkspace.id ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            />
            <span className="flex-1 text-left truncate">{ws.name}</span>
            {roleBadge(ws.role)}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
