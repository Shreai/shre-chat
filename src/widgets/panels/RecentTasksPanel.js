import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
const STATUS_DOT = {
    done: 'bg-emerald-400',
    completed: 'bg-emerald-400',
    in_progress: 'bg-blue-400',
    running: 'bg-blue-400',
    failed: 'bg-red-400',
    pending: 'bg-zinc-500',
    todo: 'bg-zinc-500',
};
export default function RecentTasksPanel({ size }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/tasks/recent');
                if (!res.ok)
                    throw new Error('fetch failed');
                const data = await res.json();
                if (cancelled)
                    return;
                const list = (Array.isArray(data) ? data : data.tasks ?? [])
                    .slice(0, 5)
                    .map((t) => ({
                    id: t.id,
                    title: t.title ?? t.description ?? 'Untitled',
                    status: t.status ?? 'pending',
                    agent: t.agent ?? t.assigned_to ?? null,
                }));
                setTasks(list);
            }
            catch {
                if (!cancelled)
                    setTasks([]);
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const limit = size === 'compact' ? 3 : 5;
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[13px] font-semibold text-[var(--c-text-1)]", children: "Recent Tasks" }), _jsx("span", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: loading ? '...' : `${tasks.length} tasks` })] }), !loading && (_jsxs("ul", { className: "space-y-1.5", children: [tasks.slice(0, limit).map((t) => (_jsxs("li", { className: "flex items-start gap-2", children: [_jsx("span", { className: `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-zinc-500'}` }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-[13px] font-normal text-[var(--c-text-2)] truncate", children: t.title }), t.agent && (_jsx("p", { className: "text-[11px] font-medium text-[var(--c-text-3)]", children: t.agent }))] }), _jsx("span", { className: "text-[11px] font-medium text-[var(--c-text-4)] shrink-0", children: t.status.replace(/_/g, ' ') })] }, t.id))), tasks.length === 0 && (_jsx("li", { className: "text-[13px] text-[var(--c-text-3)]", children: "No recent tasks" }))] }))] }));
}
