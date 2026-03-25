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
      <div className="flex gap-3 justify-center">
        {ECOSYSTEM_APPS.map((app) => {
          const disabled = !app.url;
          return (
          <button
            key={app.id}
            onClick={() => { if (!disabled) { window.open(app.url, app.id, "noopener,noreferrer"); onClose(); } }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all group ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            title={disabled ? `${app.name} — local access only` : app.description}
          >
            <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-xs font-bold ${disabled ? "" : "group-hover:scale-105"} transition-transform`}>
              {app.icon}
            </div>
            <span className="text-[10px] font-medium" style={{ color: "var(--c-text-2)" }}>{app.name}</span>
            {disabled && <span className="text-[8px]" style={{ color: "var(--c-text-5)" }}>local only</span>}
          </button>
          );
        })}
      </div>
    </div>
  );
}
