import React from 'react';
import { usePreferences } from '../preferences-store';
import { OAuthSetup } from './OAuthSetup';

interface ChatSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  currentAgentId: string;
  currentAgentName: string;
  onOpenModelPicker: () => void;
}

export function ChatSettingsDrawer({
  open,
  onClose,
  currentAgentId,
  currentAgentName,
  onOpenModelPicker,
}: ChatSettingsDrawerProps) {
  const modelOverride = usePreferences((s) => s.getModelOverride(currentAgentId));
  const setModelOverride = usePreferences((s) => s.setModelOverride);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 z-[60] h-dvh w-[min(100vw,420px)] overflow-y-auto shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(10,15,25,0.94), rgba(8,12,18,0.98))',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 backdrop-blur-xl"
             style={{ background: 'rgba(10,15,25,0.72)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-5)' }}>
              Settings
            </div>
            <div className="text-[15px] font-semibold" style={{ color: 'var(--c-text-1)' }}>
              {currentAgentName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-text-3)' }}
            aria-label="Close settings"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <section
            className="rounded-2xl p-4"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--c-text-5)' }}>
              Model Defaults
            </div>
            <div className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--c-text-3)' }}>
              Current agent: <span style={{ color: 'var(--c-text-1)' }}>{currentAgentName}</span>
              <br />
              Default: <span style={{ color: 'var(--c-accent)' }}>{modelOverride || 'Auto / router decides'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setModelOverride(currentAgentId, null);
                  onClose();
                }}
                className="rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-1)' }}
              >
                Auto
              </button>
              <button
                onClick={() => {
                  setModelOverride(currentAgentId, 'google/gemini-2.5-flash');
                  onClose();
                }}
                className="rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-white/10"
                style={{ background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}
              >
                Gemini Flash
              </button>
              <button
                onClick={() => {
                  onOpenModelPicker();
                  onClose();
                }}
                className="rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-1)' }}
              >
                Model picker
              </button>
            </div>
          </section>

          <section
            className="rounded-2xl p-4"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--c-text-5)' }}>
              Provider Keys
            </div>
            <OAuthSetup onClose={onClose} />
          </section>

          <section
            className="rounded-2xl p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--c-text-5)' }}>
              Global Default
            </div>
            <div className="text-[13px] leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Shared defaults are managed from `shre-cli` or the router config so they apply across
              `shre-chat`, `shre-cli`, and `mib`.
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
