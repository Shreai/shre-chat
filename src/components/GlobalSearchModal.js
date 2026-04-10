import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SDialog, SDialogContent, SBadge } from '@shre/ui-kit';
export function GlobalSearchModal({ isOpen, onClose, query, onQueryChange, results, searching, onSearch, onResultClick, inputRef, }) {
    return (_jsx(SDialog, { open: isOpen, onOpenChange: (open) => {
            if (!open)
                onClose();
        }, children: _jsxs(SDialogContent, { className: "max-w-lg p-4 gap-3", style: { marginTop: '15vh' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4 shrink-0", style: { color: 'var(--color-text-muted, var(--c-text-4))' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { ref: inputRef, type: "text", value: query, onChange: (e) => onQueryChange(e.target.value), onKeyDown: (e) => {
                                if (e.key === 'Escape') {
                                    onClose();
                                    return;
                                }
                                if (e.key === 'Enter' && query.trim().length >= 2) {
                                    onSearch();
                                }
                            }, placeholder: "Search across all sessions... (Enter to search)", className: "flex-1 bg-transparent text-sm outline-none", style: { color: 'var(--color-text, var(--c-text-1))' }, autoFocus: true }), searching && (_jsx("span", { className: "text-[10px] animate-pulse", style: { color: 'var(--color-primary, var(--c-accent))' }, children: "Searching..." }))] }), _jsxs("div", { className: "overflow-y-auto flex-1 max-h-[45vh] space-y-1", children: [results.length === 0 && !searching && query.trim().length >= 2 && (_jsx("div", { className: "text-xs text-center py-4", style: { color: 'var(--color-text-muted, var(--c-text-5))' }, children: "No results found" })), results.map((r, i) => (_jsxs("button", { className: "w-full text-left rounded-lg px-3 py-2 text-xs transition-colors hover:brightness-110", style: {
                                background: 'var(--color-surface-raised, var(--c-bg-3))',
                                color: 'var(--color-text-secondary, var(--c-text-2))',
                            }, onClick: () => onResultClick(r), children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx("span", { className: "font-medium", style: { color: 'var(--color-primary, var(--c-accent))' }, children: r.agentId }), _jsxs(SBadge, { variant: "outline", className: "text-[9px] py-0 h-4", children: [r.matches, " match", r.matches !== 1 ? 'es' : ''] })] }), _jsx("div", { className: "truncate", style: { color: 'var(--color-text-muted, var(--c-text-4))' }, children: r.preview })] }, `${r.agentId}-${r.sessionId}-${i}`)))] })] }) }));
}
