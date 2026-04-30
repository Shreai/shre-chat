import React, { useEffect, useRef, useState } from 'react';
import type { ConversationModeId } from '../preferences-store';
import type { AppOption } from '../hooks/useAppList';

interface ModeOption {
  id: ConversationModeId;
  label: string;
  subtitle: string;
  icon: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'assistant', label: 'Assistant', subtitle: 'Briefings, decisions, status', icon: 'A' },
  { id: 'code', label: 'Code', subtitle: 'Build, debug, refactor', icon: 'C' },
  { id: 'apps', label: 'Apps', subtitle: 'App-scoped tools & data', icon: 'P' },
  { id: 'ops', label: 'Ops', subtitle: 'Infra, monitoring, incidents', icon: 'O' },
  { id: 'strategy', label: 'Strategy', subtitle: 'Roadmap, architecture, planning', icon: 'S' },
  { id: 'business', label: 'Business', subtitle: 'Sales, marketing, investors', icon: 'B' },
];

interface ModePickerProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  selectedMode: ConversationModeId;
  onSelectMode: (mode: ConversationModeId, appId?: string | null) => void;
  activeAppId?: string | null;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  appOptions?: AppOption[];
}

export default function ModePicker({
  open,
  onToggle,
  onClose,
  selectedMode,
  onSelectMode,
  activeAppId,
  pickerRef,
  appOptions = [],
}: ModePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, pickerRef]);

  const currentMode = MODE_OPTIONS.find((m) => m.id === selectedMode) || MODE_OPTIONS[0];
  const currentApp = activeAppId ? appOptions.find((a) => a.id === activeAppId) : null;
  const displayLabel =
    selectedMode === 'apps' && currentApp ? `Apps: ${currentApp.label}` : currentMode.label;

  // Group apps by category for display
  const categorized = groupByCategory(appOptions);

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={onToggle}
        title={`Mode: ${displayLabel}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '6px',
          border: '1px solid var(--c-border-2)',
          background: open ? 'var(--c-accent-soft)' : 'transparent',
          color: 'var(--c-text-2)',
          fontSize: '11px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '3px',
            background: 'var(--c-accent)',
            color: 'var(--c-bg-1)',
            fontSize: '9px',
            fontWeight: 700,
          }}
        >
          {currentMode.icon}
        </span>
        {displayLabel}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99,
            }}
          />
          <div
            ref={panelRef}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 100,
              width: showAppPicker ? '260px' : '220px',
              maxHeight: 'min(420px, calc(var(--vv-height, 100dvh) - 120px))',
              borderRadius: '10px',
              border: '1px solid var(--c-border-2)',
              background: 'var(--c-bg-2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'mode-picker-fade-in 0.12s ease-out',
            }}
          >
            <div
              style={{
                padding: '8px 10px 4px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--c-text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                flexShrink: 0,
              }}
            >
              {showAppPicker ? 'Select App' : 'Conversation Mode'}
            </div>
            <div style={{ padding: '2px 4px 6px', overflowY: 'auto', flex: 1 }}>
              {showAppPicker ? (
                <>
                  <button
                    onClick={() => setShowAppPicker(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      marginBottom: '2px',
                      fontSize: '10px',
                      color: 'var(--c-text-3)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    &#x2190; Back to modes
                  </button>

                  {categorized.map(([category, apps]) => (
                    <div key={category}>
                      {categorized.length > 1 && (
                        <div
                          style={{
                            padding: '6px 8px 2px',
                            fontSize: '9px',
                            fontWeight: 600,
                            color: 'var(--c-text-4)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}
                        >
                          {category}
                        </div>
                      )}
                      {apps.map((app) => {
                        const active = selectedMode === 'apps' && activeAppId === app.id;
                        return (
                          <button
                            key={app.id}
                            onClick={() => {
                              onSelectMode('apps', app.id);
                              setShowAppPicker(false);
                              onClose();
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: 'none',
                              background: active ? 'var(--c-accent-soft)' : 'transparent',
                              color: active ? 'var(--c-accent)' : 'var(--c-text-1)',
                              fontSize: '12px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'background 0.1s',
                            }}
                            onMouseEnter={(e) => {
                              if (!active) e.currentTarget.style.background = 'var(--c-bg-3)';
                            }}
                            onMouseLeave={(e) => {
                              if (!active) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {app.icon && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '4px',
                                  background: active ? 'var(--c-accent)' : 'var(--c-bg-3)',
                                  color: active ? 'var(--c-bg-1)' : 'var(--c-text-2)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                {app.icon}
                              </span>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 500 }}>
                                {app.label}
                                {app.skillCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      color: 'var(--c-text-4)',
                                      marginLeft: '4px',
                                    }}
                                  >
                                    {app.skillCount} skills
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--c-text-3)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {app.subtitle}
                              </div>
                            </div>
                            {!app.activated && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  background: 'var(--c-bg-3)',
                                  color: 'var(--c-text-4)',
                                }}
                              >
                                inactive
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {appOptions.length === 0 && (
                    <div
                      style={{
                        padding: '12px 8px',
                        fontSize: '11px',
                        color: 'var(--c-text-4)',
                        textAlign: 'center',
                      }}
                    >
                      No apps available
                    </div>
                  )}
                </>
              ) : (
                MODE_OPTIONS.map((opt) => {
                  const active = opt.id === selectedMode;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === 'apps') {
                          setShowAppPicker(true);
                          return;
                        }
                        onSelectMode(opt.id);
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: active ? 'var(--c-accent-soft)' : 'transparent',
                        color: active ? 'var(--c-accent)' : 'var(--c-text-1)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = 'var(--c-bg-3)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          background: active ? 'var(--c-accent)' : 'var(--c-bg-3)',
                          color: active ? 'var(--c-bg-1)' : 'var(--c-text-2)',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {opt.icon}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>
                          {opt.label}
                          {opt.id === 'apps' && appOptions.length > 0 && (
                            <span
                              style={{
                                fontSize: '9px',
                                color: 'var(--c-text-4)',
                                marginLeft: '4px',
                              }}
                            >
                              {appOptions.length} apps
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: 'var(--c-text-3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes mode-picker-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function groupByCategory(apps: AppOption[]): [string, AppOption[]][] {
  const groups = new Map<string, AppOption[]>();
  for (const app of apps) {
    const cat = app.category || 'General';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(app);
  }
  return Array.from(groups.entries());
}
