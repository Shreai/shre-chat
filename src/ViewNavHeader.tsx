import { useState, useRef, useEffect } from 'react';
import type { View } from './store';

// ── View labels for the nav header ──
export const VIEW_LABELS: Record<string, string> = {
  tasks: 'Tasks',
  projects: 'Projects',
  reminders: 'Reminders',
  'task-timeline': 'Task Timeline',
  feed: 'Feed',
  'feed-analytics': 'Feed Analytics',
  'cost-dashboard': 'Cost Dashboard',
  reports: 'Reports',
  marketplace: 'Marketplace',
  admin: 'Admin',
  finetune: 'Fine-Tuning',
  activity: 'Activity',
  files: 'Files',
  cron: 'Cron Jobs',
  'agent-feed': 'Agent Feed',
  preview: 'Preview',
  spend: 'Spend',
  briefing: 'Briefing',
  'employee-activity': 'Employee Activity',
  email: 'Email',
  investor: 'Investor Dashboard',
  'agent-trace': 'Agent Trace',
};

export const NAV_VIEWS: { key: View; label: string; section: string }[] = [
  { key: 'tasks', label: 'Tasks', section: 'Work' },
  { key: 'projects', label: 'Projects', section: 'Work' },
  { key: 'reminders', label: 'Reminders', section: 'Work' },
  { key: 'task-timeline', label: 'Task Timeline', section: 'Work' },
  { key: 'feed', label: 'Feed', section: 'Views' },
  { key: 'feed-analytics', label: 'Feed Analytics', section: 'Views' },
  { key: 'cost-dashboard', label: 'Cost Dashboard', section: 'Views' },
  { key: 'reports', label: 'Reports', section: 'Views' },
  { key: 'email', label: 'Email', section: 'Work' },
  { key: 'marketplace', label: 'Marketplace', section: 'Apps' },
  { key: 'admin', label: 'Admin', section: 'Tools' },
  { key: 'finetune', label: 'Fine-Tuning', section: 'Tools' },
  { key: 'investor', label: 'Investor Dashboard', section: 'Views' },
  { key: 'agent-trace', label: 'Agent Trace', section: 'Tools' },
];

export function ViewNavHeader({ view, onSwitch }: { view: View; onSwitch: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  let lastSection = '';

  return (
    <header
      className="flex items-center gap-2 px-3 py-2 md:py-1.5 shrink-0"
      style={{
        background: 'var(--c-bg-2)',
        borderBottom: '1px solid var(--c-border-2)',
        zIndex: 40,
        position: 'relative',
        minHeight: 40,
      }}
    >
      <button
        onClick={() => onSwitch('chat')}
        className="flex items-center gap-1.5 px-2 py-1.5 md:py-1 rounded-lg text-[13px] transition-colors hover:bg-white/5"
        style={{ color: 'var(--c-text-3)', minHeight: 32 }}
        title="Back to Chat"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Chat
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--c-border-2)' }} />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2 py-1.5 md:py-1 rounded-lg text-[13px] font-medium transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-1)', minHeight: 32 }}
        >
          {VIEW_LABELS[view] || view}
          <svg
            className="h-3 w-3"
            style={{
              color: 'var(--c-text-4)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div
            className="absolute left-0 top-full mt-1 z-[60] w-52 rounded-xl shadow-xl py-1"
            style={{
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-2)',
              maxHeight: 'min(420px, calc(var(--vv-height, 100dvh) - 80px - env(safe-area-inset-bottom, 0px)))',
              overflowY: 'auto',
            }}
          >
            {NAV_VIEWS.filter((item) => item.key !== 'investor' || __SHRE_INTERNAL__).map((item) => {
              const showSection = item.section !== lastSection;
              lastSection = item.section;
              return (
                <div key={item.key}>
                  {showSection && (
                    <div
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      {item.section}
                    </div>
                  )}
                  <button
                    onClick={() => onSwitch(item.key)}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: view === item.key ? 'var(--c-accent)' : 'var(--c-text-1)' }}
                  >
                    {view === item.key && (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--c-accent)' }}
                      />
                    )}
                    {item.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1" />
    </header>
  );
}
