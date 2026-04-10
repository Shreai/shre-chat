import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './store';
const ACCENT_PRESETS = [
    { name: 'Blue', color: '#2563eb' },
    { name: 'Purple', color: '#7c3aed' },
    { name: 'Green', color: '#16a34a' },
    { name: 'Orange', color: '#ea580c' },
    { name: 'Pink', color: '#db2777' },
    { name: 'Red', color: '#dc2626' },
    { name: 'Teal', color: '#0d9488' },
    { name: 'Amber', color: '#d97706' },
];
// ── Server preference sync helpers ──
async function fetchServerPrefs() {
    try {
        const res = await fetch('/api/user/preferences', { credentials: 'include' });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data?.theme || null;
    }
    catch {
        return null;
    }
}
async function pushServerPrefs(theme) {
    try {
        await fetch('/api/user/preferences', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme }),
        });
    }
    catch {
        /* offline — localStorage fallback is fine */
    }
}
export function ThemeCustomizer() {
    const { state, actions } = useApp();
    const { themeCustom } = state;
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const wrapperRef = useRef(null);
    // On mount: fetch server prefs and apply if present (overrides localStorage)
    useEffect(() => {
        let cancelled = false;
        fetchServerPrefs().then((serverTheme) => {
            if (cancelled || !serverTheme)
                return;
            const hasValues = serverTheme.accentColor || serverTheme.fontSize || serverTheme.borderRadius;
            if (hasValues) {
                actions.setThemeCustom({ ...themeCustom, ...serverTheme });
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Close on outside click (check both the portal panel and the button wrapper)
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            const target = e.target;
            const inPanel = panelRef.current?.contains(target);
            const inWrapper = wrapperRef.current?.contains(target);
            if (!inPanel && !inWrapper)
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);
    const update = (patch) => {
        const next = { ...themeCustom, ...patch };
        actions.setThemeCustom(next);
        pushServerPrefs(next);
    };
    const reset = () => {
        actions.setThemeCustom({});
        pushServerPrefs({});
    };
    const currentAccent = themeCustom.accentColor || '#2563eb';
    const currentSize = themeCustom.fontSize || 'md';
    const currentRadius = themeCustom.borderRadius || 'normal';
    const btnRef = useRef(null);
    return (_jsxs("div", { className: "relative", ref: wrapperRef, children: [_jsx("button", { ref: btnRef, onClick: () => setOpen(!open), className: "p-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1", style: { color: 'var(--c-text-4)' }, onMouseEnter: (e) => {
                    e.currentTarget.style.background = 'var(--c-bg-hover)';
                    e.currentTarget.style.color = 'var(--c-text-1)';
                }, onMouseLeave: (e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--c-text-4)';
                }, title: "Customize theme", "aria-label": "Customize theme", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.48-9-10-9z" }), _jsx("circle", { cx: "6.5", cy: "11.5", r: "1.5", fill: "currentColor" }), _jsx("circle", { cx: "9.5", cy: "7.5", r: "1.5", fill: "currentColor" }), _jsx("circle", { cx: "14.5", cy: "7.5", r: "1.5", fill: "currentColor" }), _jsx("circle", { cx: "17.5", cy: "11.5", r: "1.5", fill: "currentColor" })] }) }), open &&
                createPortal(_jsxs("div", { ref: panelRef, className: "fixed w-64 rounded-xl shadow-xl z-[200]", style: {
                        background: 'var(--c-bg-2)',
                        border: '1px solid var(--c-border-1)',
                        padding: '14px',
                        maxHeight: 'calc(100vh - 24px)',
                        overflowY: 'auto',
                        ...(() => {
                            const rect = btnRef.current?.getBoundingClientRect();
                            if (!rect)
                                return { bottom: 60, left: 12 };
                            const panelW = 256;
                            let left = rect.left;
                            if (left + panelW > window.innerWidth - 12) {
                                left = window.innerWidth - panelW - 12;
                            }
                            left = Math.max(8, left);
                            // Position above button; clamp to viewport
                            let bottom = window.innerHeight - rect.top + 8;
                            if (bottom < 12)
                                bottom = 12;
                            return { bottom, left };
                        })(),
                    }, children: [_jsx("div", { className: "text-[11px] font-semibold mb-3", style: { color: 'var(--c-text-1)' }, children: "Customize Theme" }), _jsxs("div", { className: "mb-3", children: [_jsx("div", { className: "text-[10px] font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Accent Color" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: ACCENT_PRESETS.map((preset) => (_jsx("button", { onClick: () => update({ accentColor: preset.color === '#2563eb' ? undefined : preset.color }), className: "w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-1", style: {
                                            background: preset.color,
                                            boxShadow: currentAccent === preset.color
                                                ? `0 0 0 2px var(--c-bg-2), 0 0 0 4px ${preset.color}`
                                                : 'none',
                                        }, title: preset.name, "aria-label": `Accent color: ${preset.name}` }, preset.color))) })] }), _jsxs("div", { className: "mb-3", children: [_jsx("div", { className: "text-[10px] font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Font Size" }), _jsx("div", { className: "flex gap-1", children: ['sm', 'md', 'lg'].map((size) => {
                                        const label = size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L';
                                        const isActive = currentSize === size;
                                        return (_jsx("button", { onClick: () => update({ fontSize: size === 'md' ? undefined : size }), className: "flex-1 py-1 rounded-md text-[11px] font-medium transition-colors", style: {
                                                background: isActive ? 'var(--c-accent, #2563eb)' : 'var(--c-bg-card)',
                                                color: isActive ? '#fff' : 'var(--c-text-3)',
                                                border: `1px solid ${isActive ? 'transparent' : 'var(--c-border-2)'}`,
                                            }, children: label }, size));
                                    }) })] }), _jsxs("div", { className: "mb-3", children: [_jsx("div", { className: "text-[10px] font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Border Radius" }), _jsx("div", { className: "flex gap-1", children: ['sharp', 'normal', 'round'].map((r) => {
                                        const label = r.charAt(0).toUpperCase() + r.slice(1);
                                        const isActive = currentRadius === r;
                                        return (_jsx("button", { onClick: () => update({ borderRadius: r === 'normal' ? undefined : r }), className: "flex-1 py-1 text-[10px] font-medium transition-colors", style: {
                                                background: isActive ? 'var(--c-accent, #2563eb)' : 'var(--c-bg-card)',
                                                color: isActive ? '#fff' : 'var(--c-text-3)',
                                                border: `1px solid ${isActive ? 'transparent' : 'var(--c-border-2)'}`,
                                                borderRadius: r === 'sharp' ? '2px' : r === 'normal' ? '6px' : '12px',
                                            }, children: label }, r));
                                    }) })] }), _jsx("button", { onClick: reset, className: "w-full py-1.5 rounded-md text-[10px] font-medium transition-colors", style: {
                                background: 'var(--c-bg-hover)',
                                color: 'var(--c-text-3)',
                                border: '1px solid var(--c-border-2)',
                            }, onMouseEnter: (e) => {
                                e.currentTarget.style.color = 'var(--c-text-1)';
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.color = 'var(--c-text-3)';
                            }, children: "Reset to default" })] }), document.body)] }));
}
