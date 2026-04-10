import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SDialog, SDialogContent, SDialogHeader, SDialogTitle, SDialogFooter, SButton, SSeparator, } from '@shre/ui-kit';
export function SummaryModal({ isOpen, onClose, summaryText, onCopy }) {
    return (_jsx(SDialog, { open: isOpen, onOpenChange: (open) => {
            if (!open)
                onClose();
        }, children: _jsxs(SDialogContent, { className: "max-w-lg", children: [_jsx(SDialogHeader, { children: _jsxs(SDialogTitle, { className: "flex items-center gap-2 text-sm", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--color-primary, var(--c-accent))' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }), _jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })] }), "Conversation Summary"] }) }), _jsx(SSeparator, {}), _jsx("div", { className: "max-h-[60vh] overflow-y-auto py-2", children: _jsx("div", { className: "prose prose-sm prose-invert max-w-none text-xs leading-relaxed", style: { color: 'var(--color-text-secondary, var(--c-text-2))' }, children: summaryText.split('\n').map((line, i) => {
                            const trimmed = line.trim();
                            if (!trimmed)
                                return _jsx("br", {}, i);
                            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                return (_jsx("p", { className: "my-1 pl-3", style: { textIndent: '-0.75rem' }, children: trimmed }, i));
                            }
                            if (trimmed.startsWith('**') || trimmed.startsWith('##')) {
                                return (_jsx("p", { className: "font-semibold mt-3 mb-1", style: { color: 'var(--color-text, var(--c-text-1))' }, children: trimmed.replace(/^[#*\s]+/, '').replace(/\*+$/, '') }, i));
                            }
                            return (_jsx("p", { className: "my-1", children: trimmed }, i));
                        }) }) }), _jsx(SSeparator, {}), _jsxs(SDialogFooter, { children: [_jsx(SButton, { variant: "secondary", size: "sm", onClick: onCopy, children: "Copy" }), _jsx(SButton, { size: "sm", onClick: onClose, children: "Close" })] })] }) }));
}
