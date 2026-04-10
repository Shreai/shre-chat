import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const ACTIONS = [
    { label: 'New Task', icon: '\u2795', action: 'new-task' },
    { label: 'Upload File', icon: '\ud83d\udcc4', action: 'upload' },
    { label: 'Voice Input', icon: '\ud83c\udf99\ufe0f', action: 'voice' },
    { label: 'Switch Agent', icon: '\ud83d\udd04', action: 'switch-agent' },
];
function handleAction(action) {
    window.dispatchEvent(new CustomEvent('shre-quick-action', { detail: { action } }));
}
export default function QuickActionsPanel({ size }) {
    const visible = size === 'compact' ? ACTIONS.slice(0, 3) : ACTIONS;
    return (_jsxs("div", { className: "space-y-2", children: [_jsx("span", { className: "text-[13px] font-semibold text-[var(--c-text-1)]", children: "Quick Actions" }), _jsx("div", { className: "grid grid-cols-2 gap-1.5", children: visible.map((a) => (_jsxs("button", { onClick: () => handleAction(a.action), className: "flex items-center gap-2 rounded-lg px-2.5 py-2\n              bg-[var(--c-bg-hover)] hover:bg-[var(--c-bg-active)]\n              transition-colors duration-150", children: [_jsx("span", { className: "text-[15px]", children: a.icon }), _jsx("span", { className: "text-[13px] font-medium text-[var(--c-text-2)]", children: a.label })] }, a.action))) })] }));
}
