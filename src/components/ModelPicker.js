import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
const PROVIDER_OPTIONS = [
    { id: 'auto', label: 'Auto', subtitle: 'Best model per task', icon: '\u26A1', providerKey: null },
    {
        id: 'provider:openai',
        label: 'ChatGPT',
        subtitle: 'OpenAI GPT models',
        icon: '\uD83E\uDDE0',
        providerKey: 'openai',
    },
    {
        id: 'provider:anthropic',
        label: 'Claude',
        subtitle: 'Anthropic Claude models',
        icon: '\uD83E\uDDCA',
        providerKey: 'anthropic',
    },
    {
        id: 'provider:ollama',
        label: 'Local',
        subtitle: 'Ollama (on-device)',
        icon: '\uD83D\uDDA5\uFE0F',
        providerKey: 'ollama',
    },
    {
        id: 'provider:google',
        label: 'Google',
        subtitle: 'Gemini models',
        icon: '\uD83D\uDC8E',
        providerKey: 'google',
    },
];
/** Check if any model from a given provider is connected */
function isProviderOnline(models, providerKey) {
    const prefixes = providerKey === 'ollama' ? ['ollama', 'ollama-remote'] : [providerKey];
    return models.some((m) => {
        const mProvider = m.id.split('/')[0];
        return prefixes.some((p) => mProvider === p) && m.connected !== false;
    });
}
/** Count online models for a provider */
function providerModelCount(models, providerKey) {
    const prefixes = providerKey === 'ollama' ? ['ollama', 'ollama-remote'] : [providerKey];
    return models.filter((m) => {
        const mProvider = m.id.split('/')[0];
        return prefixes.some((p) => mProvider === p) && m.connected !== false;
    }).length;
}
/** Get display label for the selected model */
function getSelectedLabel(selectedModel) {
    if (!selectedModel)
        return 'Auto';
    const opt = PROVIDER_OPTIONS.find((o) => o.id === selectedModel);
    return opt?.label || 'Auto';
}
export function ModelPicker({ open, onToggle, onClose, selectedModel, onSelectModel, models, agentName, pickerRef, }) {
    const panelRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (panelRef.current &&
                !panelRef.current.contains(e.target) &&
                pickerRef.current &&
                !pickerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open, onClose, pickerRef]);
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);
    const isSelected = (optId) => optId === 'auto' ? !selectedModel : selectedModel === optId;
    return (_jsxs("div", { ref: pickerRef, style: { position: 'relative' }, children: [_jsxs("button", { onClick: onToggle, className: "h-7 rounded-lg flex items-center gap-1 px-2 text-[11px] transition-all", style: {
                    color: selectedModel ? 'var(--c-accent)' : 'var(--c-text-3)',
                    background: open ? 'var(--c-bg-active)' : 'transparent',
                    border: selectedModel ? '1px solid var(--c-accent-soft)' : '1px solid transparent',
                }, title: "Switch AI provider", "aria-label": "Switch AI provider", children: [_jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5z" }), _jsx("path", { d: "M2 17l10 5 10-5" }), _jsx("path", { d: "M2 12l10 5 10-5" })] }), _jsx("span", { className: "hidden sm:inline max-w-[100px] truncate", children: getSelectedLabel(selectedModel) }), _jsx("svg", { className: "h-3 w-3 opacity-50", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) })] }), open && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40", onClick: onClose }), _jsxs("div", { ref: panelRef, className: "absolute right-0 z-50 flex flex-col rounded-xl overflow-hidden shadow-2xl model-picker-dropdown", style: {
                            width: 280,
                            top: '100%',
                            marginTop: 4,
                            maxHeight: 'min(400px, calc(var(--vv-height, 100dvh) - 100px))',
                            background: 'var(--c-bg-2)',
                            border: '1px solid var(--c-border-1)',
                            animation: 'picker-fade-in 150ms ease-out forwards',
                        }, children: [_jsx("div", { className: "px-3 pt-3 pb-2 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[13px] font-semibold", style: { color: 'var(--c-text-1)' }, children: "AI Provider" }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: ["for ", agentName] })] }) }), _jsx("div", { className: "flex-1 overflow-y-auto overscroll-contain py-1", children: PROVIDER_OPTIONS.map((opt) => {
                                    const active = isSelected(opt.id);
                                    const online = opt.providerKey ? isProviderOnline(models, opt.providerKey) : true;
                                    const count = opt.providerKey
                                        ? providerModelCount(models, opt.providerKey)
                                        : models.filter((m) => m.connected !== false).length;
                                    return (_jsxs("button", { onClick: () => {
                                            if (!online && opt.providerKey)
                                                return;
                                            onSelectModel(opt.id === 'auto' ? null : opt.id);
                                            onClose();
                                        }, className: "w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors", style: {
                                            color: active
                                                ? 'var(--c-accent)'
                                                : !online
                                                    ? 'var(--c-text-4)'
                                                    : 'var(--c-text-2)',
                                            background: active ? 'var(--c-accent-soft)' : 'transparent',
                                            opacity: !online && opt.providerKey ? 0.4 : 1,
                                            cursor: !online && opt.providerKey ? 'not-allowed' : 'pointer',
                                        }, onMouseEnter: (e) => {
                                            if (!active && online)
                                                e.currentTarget.style.background = 'var(--c-bg-hover)';
                                        }, onMouseLeave: (e) => {
                                            if (!active)
                                                e.currentTarget.style.background = 'transparent';
                                        }, children: [_jsx("span", { className: "text-lg w-7 text-center", children: opt.icon }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[13px] font-medium", children: opt.label }), _jsxs("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: [opt.subtitle, count > 0 ? ` \u00B7 ${count} models` : ''] })] }), !online && opt.providerKey && (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: "offline" })), active && (_jsx("svg", { className: "h-4 w-4 shrink-0", style: { color: 'var(--c-accent)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }))] }, opt.id));
                                }) }), _jsx("div", { className: "px-3 py-2 shrink-0", style: { borderTop: '1px solid var(--c-border-2)' }, children: _jsx("div", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: "Auto picks the best model per task. Lock to a provider to force all requests through it." }) })] })] })), _jsx("style", { children: `
        @keyframes picker-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          .model-picker-dropdown {
            position: fixed !important;
            left: 8px !important;
            right: 8px !important;
            top: 48px !important;
            bottom: auto !important;
            width: auto !important;
            max-height: calc(var(--vv-height, 100dvh) - 120px) !important;
          }
        }
      ` })] }));
}
