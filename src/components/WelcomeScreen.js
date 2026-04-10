import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { getGreeting, getTemplatesForAgent } from '../chat-utils';
export function WelcomeScreen({ agent, agentId, userProfile, onSelectTemplate, }) {
    const [tasks, setTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    // Fetch pending tasks from shre-tasks service
    useEffect(() => {
        if (!userProfile?.preferences?.showTasksOnGreeting)
            return;
        setTasksLoading(true);
        fetch(`${import.meta.env.VITE_TASKS_URL ?? 'https://127.0.0.1:5460'}/v1/tasks?status=todo&limit=5`)
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => setTasks(Array.isArray(data) ? data.slice(0, 5) : []))
            .catch(() => setTasks([]))
            .finally(() => setTasksLoading(false));
    }, [userProfile?.preferences?.showTasksOnGreeting]);
    const greeting = getGreeting();
    const firstName = userProfile?.name?.split(' ')[0] || '';
    return (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-center gap-5 pb-20", children: [_jsx("div", { className: "h-14 w-14 rounded-2xl flex items-center justify-center", style: { background: 'var(--c-bg-3)', border: '1px solid var(--c-border-2)' }, children: _jsx("span", { className: "text-2xl", children: agent.emoji }) }), _jsxs("div", { children: [_jsxs("p", { className: "font-semibold text-lg", style: { color: 'var(--c-text-1)', letterSpacing: '-0.02em' }, children: [greeting, firstName ? `, ${firstName}` : ''] }), _jsx("p", { className: "text-sm mt-0.5", style: { color: 'var(--c-text-3)' }, children: userProfile?.business?.name
                            ? `How can ${agent.name} help ${userProfile.business.name} today?`
                            : `How can ${agent.name} help you today?` })] }), userProfile?.preferences?.showTasksOnGreeting && (tasks.length > 0 || tasksLoading) && (_jsxs("div", { className: "w-full max-w-md px-4", children: [_jsx("div", { className: "text-[11px] font-semibold uppercase tracking-wider mb-2 text-left", style: { color: 'var(--c-text-4)' }, children: "Pending Tasks" }), tasksLoading ? (_jsx("div", { className: "text-xs animate-pulse", style: { color: 'var(--c-text-5)' }, children: "Loading tasks..." })) : (_jsx("div", { className: "space-y-1.5", children: tasks.map((t) => (_jsxs("button", { className: "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors", style: { background: 'var(--c-bg-card)', border: '1px solid var(--c-border-2)' }, onMouseEnter: (e) => {
                                e.currentTarget.style.background = 'var(--c-bg-active)';
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.background = 'var(--c-bg-card)';
                            }, onClick: () => onSelectTemplate(`Help me with: ${t.title}`), children: [_jsx("span", { className: "h-2 w-2 rounded-full shrink-0", style: {
                                        background: t.priority === 'high'
                                            ? 'var(--c-danger)'
                                            : t.priority === 'medium'
                                                ? 'var(--c-warning)'
                                                : 'var(--c-accent)',
                                    } }), _jsx("span", { className: "text-xs truncate", style: { color: 'var(--c-text-2)' }, children: t.title }), t.agent && (_jsx("span", { className: "text-[10px] ml-auto shrink-0", style: { color: 'var(--c-text-5)' }, children: t.agent }))] }, t.id))) }))] })), _jsx("div", { className: "grid gap-3 w-full max-w-md px-4", style: { gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }, children: getTemplatesForAgent(agentId).map((tpl) => (_jsxs("button", { className: "text-left px-4 py-3.5 rounded-xl transition-all duration-150", style: {
                        border: '1px solid var(--c-border-1)',
                        background: 'var(--c-bg-3)',
                        cursor: 'pointer',
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.background = 'var(--c-bg-hover)';
                        e.currentTarget.style.borderColor = 'var(--c-accent)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.background = 'var(--c-bg-3)';
                        e.currentTarget.style.borderColor = 'var(--c-border-1)';
                        e.currentTarget.style.transform = 'none';
                    }, onClick: () => onSelectTemplate(tpl.prompt), children: [_jsx("span", { className: "text-base mr-2", children: tpl.icon }), _jsx("span", { className: "text-sm font-medium", style: { color: 'var(--c-text-2)' }, children: tpl.title })] }, tpl.title))) })] }));
}
