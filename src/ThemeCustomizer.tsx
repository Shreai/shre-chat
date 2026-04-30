import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp, type ThemeCustom } from './store';
import { isDevSafeMode } from './env';

const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: 'Blue', color: '#2563eb' },
  { name: 'Purple', color: '#7c3aed' },
  { name: 'Green', color: '#16a34a' },
  { name: 'Orange', color: '#ea580c' },
  { name: 'Pink', color: '#db2777' },
  { name: 'Red', color: '#dc2626' },
  { name: 'Teal', color: '#0d9488' },
  { name: 'Amber', color: '#d97706' },
];

const THEME_PACKS: {
  id: NonNullable<ThemeCustom['themePack']>;
  label: string;
  color: string;
  note: string;
}[] = [
  { id: 'shre-os', label: 'Shre OS', color: '#2563eb', note: 'Command-center blue' },
  { id: 'aros', label: 'AROS', color: '#0f766e', note: 'Separate product shell' },
  { id: 'workspace', label: 'Workspace', color: '#7c3aed', note: 'Neutral shared shell' },
  { id: 'custom', label: 'Custom', color: '#64748b', note: 'Manual override' },
];

// ── Server preference sync helpers ──
async function fetchServerPrefs(): Promise<Partial<ThemeCustom> | null> {
  try {
    const res = await fetch('/api/user/preferences', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.theme || null;
  } catch {
    return null;
  }
}

async function pushServerPrefs(theme: ThemeCustom): Promise<void> {
  try {
    await fetch('/api/user/preferences', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch {
    /* offline — localStorage fallback is fine */
  }
}

export function ThemeCustomizer() {
  const { state, actions } = useApp();
  const { themeCustom } = state;
  const devSafeMode = isDevSafeMode();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // On mount: fetch server prefs and apply if present (overrides localStorage)
  useEffect(() => {
    if (devSafeMode) return;
    let cancelled = false;
    fetchServerPrefs().then((serverTheme) => {
      if (cancelled || !serverTheme) return;
      const hasValues = serverTheme.accentColor || serverTheme.fontSize || serverTheme.borderRadius;
      if (hasValues) {
        actions.setThemeCustom({ ...themeCustom, ...serverTheme });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devSafeMode]);

  // Close on outside click (check both the portal panel and the button wrapper)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inWrapper = wrapperRef.current?.contains(target);
      if (!inPanel && !inWrapper) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const update = (patch: Partial<ThemeCustom>) => {
    const next = { ...themeCustom, ...patch };
    actions.setThemeCustom(next);
    if (!devSafeMode) pushServerPrefs(next);
  };

  const reset = () => {
    actions.setThemeCustom({});
    if (!devSafeMode) pushServerPrefs({});
  };

  const currentAccent = themeCustom.accentColor || '#2563eb';
  const currentSize = themeCustom.fontSize || 'md';
  const currentRadius = themeCustom.borderRadius || 'normal';
  const currentPack = themeCustom.themePack || 'custom';

  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        style={{ color: 'var(--c-text-4)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--c-bg-hover)';
          e.currentTarget.style.color = 'var(--c-text-1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--c-text-4)';
        }}
        title="Customize theme"
        aria-label="Customize theme"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.48-9-10-9z" />
          <circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" />
          <circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" />
          <circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" />
          <circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed w-64 rounded-xl shadow-xl z-[200]"
            style={{
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-1)',
              padding: '14px',
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto',
              ...(() => {
                const rect = btnRef.current?.getBoundingClientRect();
                if (!rect) return { bottom: 60, left: 12 };
                const panelW = 256;
                let left = rect.left;
                if (left + panelW > window.innerWidth - 12) {
                  left = window.innerWidth - panelW - 12;
                }
                left = Math.max(8, left);
                // Position above button; clamp to viewport
                let bottom = window.innerHeight - rect.top + 8;
                if (bottom < 12) bottom = 12;
                return { bottom, left };
              })(),
            }}
          >
            {/* Header */}
            <div className="text-[11px] font-semibold mb-3" style={{ color: 'var(--c-text-1)' }}>
              Customize Theme
            </div>

            {/* Accent Color */}
            <div className="mb-3">
              <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Theme Pack
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {THEME_PACKS.map((pack) => {
                  const isActive = currentPack === pack.id;
                  return (
                    <button
                      key={pack.id}
                      onClick={() =>
                        update({
                          themePack: pack.id,
                          accentColor: pack.id === 'custom' ? themeCustom.accentColor : undefined,
                        })
                      }
                      className="text-left rounded-md px-2 py-1.5 transition-colors border"
                      style={{
                        background: isActive ? 'var(--c-accent-soft)' : 'var(--c-bg-card)',
                        borderColor: isActive ? 'var(--c-accent)' : 'var(--c-border-2)',
                        color: 'var(--c-text-2)',
                      }}
                    >
                      <div className="text-[11px] font-medium" style={{ color: 'var(--c-text-1)' }}>
                        {pack.label}
                      </div>
                      <div className="text-[9px]" style={{ color: 'var(--c-text-4)' }}>
                        {pack.note}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Accent Color
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.color}
                    onClick={() =>
                      update({ accentColor: preset.color === '#2563eb' ? undefined : preset.color })
                    }
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{
                      background: preset.color,
                      boxShadow:
                        currentAccent === preset.color
                          ? `0 0 0 2px var(--c-bg-2), 0 0 0 4px ${preset.color}`
                          : 'none',
                    }}
                    title={preset.name}
                    aria-label={`Accent color: ${preset.name}`}
                  />
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="mb-3">
              <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Font Size
              </div>
              <div className="flex gap-1">
                {(['sm', 'md', 'lg'] as const).map((size) => {
                  const label = size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L';
                  const isActive = currentSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => update({ fontSize: size === 'md' ? undefined : size })}
                      className="flex-1 py-1 rounded-md text-[11px] font-medium transition-colors"
                      style={{
                        background: isActive ? 'var(--c-accent, #2563eb)' : 'var(--c-bg-card)',
                        color: isActive ? '#fff' : 'var(--c-text-3)',
                        border: `1px solid ${isActive ? 'transparent' : 'var(--c-border-2)'}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Border Radius */}
            <div className="mb-3">
              <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Border Radius
              </div>
              <div className="flex gap-1">
                {(['sharp', 'normal', 'round'] as const).map((r) => {
                  const label = r.charAt(0).toUpperCase() + r.slice(1);
                  const isActive = currentRadius === r;
                  return (
                    <button
                      key={r}
                      onClick={() => update({ borderRadius: r === 'normal' ? undefined : r })}
                      className="flex-1 py-1 text-[10px] font-medium transition-colors"
                      style={{
                        background: isActive ? 'var(--c-accent, #2563eb)' : 'var(--c-bg-card)',
                        color: isActive ? '#fff' : 'var(--c-text-3)',
                        border: `1px solid ${isActive ? 'transparent' : 'var(--c-border-2)'}`,
                        borderRadius: r === 'sharp' ? '2px' : r === 'normal' ? '6px' : '12px',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={reset}
              className="w-full py-1.5 rounded-md text-[10px] font-medium transition-colors"
              style={{
                background: 'var(--c-bg-hover)',
                color: 'var(--c-text-3)',
                border: '1px solid var(--c-border-2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--c-text-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--c-text-3)';
              }}
            >
              Reset to default
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
