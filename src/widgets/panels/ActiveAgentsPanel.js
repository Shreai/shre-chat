import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
export default function ActiveAgentsPanel({ size }) {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/status-bar');
                if (!res.ok)
                    throw new Error('fetch failed');
                const data = await res.json();
                if (cancelled)
                    return;
                const list = (data.agents ?? []).map((a) => ({
                    id: a.id ?? a.name,
                    name: a.name ?? a.id ?? 'Unknown',
                    status: a.status === 'active' ? 'active' : a.status === 'idle' ? 'idle' : 'offline',
                }));
                setAgents(list);
            }
            catch {
                if (!cancelled)
                    setAgents([]);
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const activeCount = agents.filter((a) => a.status === 'active').length;
    const dotColor = {
        active: 'bg-emerald-400',
        idle: 'bg-amber-400',
        offline: 'bg-zinc-500',
    };
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[13px] font-semibold text-[var(--c-text-1)]", children: "Active Agents" }), _jsx("span", { className: "text-[22px] font-medium tabular-nums text-[var(--c-accent)]", children: loading ? '--' : activeCount })] }), size === 'expanded' && !loading && (_jsx("ul", { className: "space-y-1", children: agents.slice(0, 6).map((a) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${dotColor[a.status]}` }), _jsx("span", { className: "text-[13px] font-normal text-[var(--c-text-2)] truncate", children: a.name }), _jsx("span", { className: "text-[11px] font-medium text-[var(--c-text-3)] ml-auto", children: a.status })] }, a.id))) }))] }));
}
