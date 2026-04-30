import React, { useState, useEffect } from 'react';
import { ECOSYSTEM_APPS, MARKETPLACE_EMBED_APPS } from '../chat-utils';
import { isDevSafeMode } from '../env';

interface AppsDrawerProps {
  open?: boolean;
  onClose: () => void;
  activeAgentId?: string;
}

interface AppEntry {
  id: string;
  name: string;
  icon: string;
  url: string;
  color: string;
  description: string;
  embed?: boolean;
}

export function AppsDrawer({ open = true, onClose }: AppsDrawerProps) {
  const devSafeMode = isDevSafeMode();
  const [embedApp, setEmbedApp] = useState<{
    id: string;
    name: string;
    url: string;
  } | null>(null);

  // Fetch activated marketplace apps
  const [marketplaceApps, setMarketplaceApps] = useState<AppEntry[]>([]);
  useEffect(() => {
    if (devSafeMode) return;
    fetch('/api/marketplace/activated-apps')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { appIds?: string[] }) => {
        const appIds = data.appIds || [];
        const embedded: AppEntry[] = [];
        for (const appId of appIds) {
          const entry = MARKETPLACE_EMBED_APPS[appId];
          if (entry) embedded.push(entry);
        }
        setMarketplaceApps(embedded);
      })
      .catch(() => {});
  }, [devSafeMode]);

  const allApps: AppEntry[] = [...ECOSYSTEM_APPS, ...marketplaceApps];

  if (!open) return null;

  // ── Fullscreen iframe for embeddable apps ──
  if (embedApp) {
    return (
      <div
        className="flex flex-col"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          background: 'var(--c-bg-1)',
        }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 shrink-0"
          style={{
            background: 'var(--c-bg-2)',
            borderBottom: '1px solid var(--c-border-1)',
          }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEmbedApp(null)}
              className="h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-colors hover:bg-white/10"
              style={{ color: 'var(--c-text-2)' }}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Apps
            </button>
            <span className="text-xs font-semibold" style={{ color: 'var(--c-text-1)' }}>
              {embedApp.name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.open(embedApp.url, embedApp.id, 'noopener,noreferrer')}
              className="h-7 px-2 rounded-md text-xs transition-colors hover:bg-white/10"
              style={{ color: 'var(--c-text-3)' }}
              title="Open in new window"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => {
                setEmbedApp(null);
                onClose();
              }}
              className="h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: 'var(--c-text-3)' }}
              aria-label="Close"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        {/* Iframe */}
        <iframe
          src={embedApp.url}
          className="flex-1 w-full border-0"
          allow="clipboard-write; clipboard-read"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          title={embedApp.name}
        />
      </div>
    );
  }

  // ── App grid ──
  return (
    <div
      className="px-4 py-3 shrink-0 relative"
      style={{
        background: 'var(--c-bg-2)',
        borderBottom: '1px solid var(--c-border-1)',
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: 'var(--c-text-3)' }}
        aria-label="Close apps"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div
        className="grid gap-2 justify-items-center"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
        }}
      >
        {allApps.map((app) => (
          <button
            key={app.id}
            onClick={() => {
              if (app.embed) {
                setEmbedApp({ id: app.id, name: app.name, url: app.url });
              } else {
                window.open(app.url, app.id, 'noopener,noreferrer');
                onClose();
              }
            }}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all group"
            title={app.description}
          >
            <div
              className={`h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-[11px] font-bold group-hover:scale-105 transition-transform`}
            >
              {app.icon}
            </div>
            <span
              className="text-[9px] font-medium truncate max-w-[56px]"
              style={{ color: 'var(--c-text-2)' }}
            >
              {app.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
