import React from "react";
import { ECOSYSTEM_APPS } from "../chat-utils";

interface AppsDrawerProps {
  onClose: () => void;
}

export function AppsDrawer({ onClose }: AppsDrawerProps) {
  return (
    <div className="px-4 py-3 shrink-0 relative" style={{ background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border-1)" }}>
      <button
        onClick={onClose}
        className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: "var(--c-text-3)" }}
        aria-label="Close apps"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div className="grid gap-2 justify-items-center" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))" }}>
        {ECOSYSTEM_APPS.map((app) => (
          <button
            key={app.id}
            onClick={() => { window.open(app.url, app.id, "noopener,noreferrer"); onClose(); }}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all group"
            title={app.description}
          >
            <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-[11px] font-bold group-hover:scale-105 transition-transform`}>
              {app.icon}
            </div>
            <span className="text-[9px] font-medium truncate max-w-[56px]" style={{ color: "var(--c-text-2)" }}>{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
