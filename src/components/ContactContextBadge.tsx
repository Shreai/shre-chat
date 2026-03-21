import React from "react";

interface Props {
  contacts?: string[];
}

export function ContactContextBadge({ contacts }: Props) {
  if (!contacts?.length) return null;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      <svg className="h-3 w-3" style={{ color: "var(--c-text-5)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      {contacts.map(c => (
        <span
          key={c}
          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
          style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
