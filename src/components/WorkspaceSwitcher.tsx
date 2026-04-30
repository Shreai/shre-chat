import { useState, useRef, useEffect } from 'react';

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        <span className="font-medium truncate max-w-[80px] sm:max-w-[120px]">{activeWorkspace.name}</span>
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

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 max-w-[calc(100vw-12px)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
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
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                ${ws.id === activeWorkspace.id ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${ws.id === activeWorkspace.id ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              />
              <span className="flex-1 text-left truncate">{ws.name}</span>
              {roleBadge(ws.role)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
