import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { mib007Link } from './chat-utils';
const STATUS_COLORS = {
    active: '#22c55e',
    paused: '#f59e0b',
    archived: '#6b7280',
};
function getToken() {
    return sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token') || '';
}
async function apiFetch(path) {
    const res = await fetch(path, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok)
        throw new Error(`${res.status}`);
    return res.json();
}
function relativeTime(ts) {
    const d = new Date(typeof ts === 'number' ? ts : ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)
        return 'just now';
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}
export function ProjectsView() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('active');
    const [expandedId, setExpandedId] = useState(null);
    const [projectTasks, setProjectTasks] = useState({});
    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const qs = statusFilter ? `?status=${statusFilter}` : '';
            const data = await apiFetch(`/api/projects${qs}`);
            const list = Array.isArray(data) ? data : data.projects || data || [];
            setProjects(list);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load projects');
        }
        finally {
            setLoading(false);
        }
    }, [statusFilter]);
    useEffect(() => {
        load();
    }, [load]);
    const loadProjectTasks = useCallback(async (projectId) => {
        if (projectTasks[projectId])
            return;
        try {
            const data = await apiFetch(`/api/tasks?project_id=${projectId}&limit=20`);
            const list = Array.isArray(data) ? data : data.tasks || data || [];
            setProjectTasks((prev) => ({ ...prev, [projectId]: list }));
        }
        catch (_) {
            void _;
        }
    }, [projectTasks]);
    const toggleProject = (id) => {
        if (expandedId === id) {
            setExpandedId(null);
        }
        else {
            setExpandedId(id);
            loadProjectTasks(id);
        }
    };
    return (_jsxs("div", { className: "flex-1 flex flex-col min-h-0 overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Projects" }), _jsx("span", { className: "text-[11px] px-1.5 py-0.5 rounded-full", style: { background: 'rgba(16,185,129,0.12)', color: '#34d399' }, children: projects.length })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("a", { href: mib007Link('projects'), target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)' }, children: ["Open in MIB007", _jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), _jsx("polyline", { points: "15 3 21 3 21 9" }), _jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })] })] }), _jsx("button", { onClick: load, className: "text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/5", style: { color: 'var(--c-text-3)' }, children: "Refresh" })] })] }), _jsx("div", { className: "flex items-center gap-2 px-4 py-2 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: ['active', 'paused', 'archived', ''].map((s) => (_jsx("button", { onClick: () => setStatusFilter(s), className: "text-[11px] px-2 py-1 rounded-lg transition-colors", style: {
                        background: statusFilter === s ? 'var(--c-accent)' : 'transparent',
                        color: statusFilter === s ? '#fff' : 'var(--c-text-3)',
                    }, children: s || 'All' }, s || 'all'))) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-3 space-y-2", children: [loading && projects.length === 0 && (_jsx("div", { className: "flex items-center justify-center py-12", style: { color: 'var(--c-text-4)' }, children: "Loading projects..." })), error && (_jsx("div", { className: "text-[13px] text-center py-8", style: { color: 'var(--c-error, #ef4444)' }, children: error === '502'
                            ? 'Could not reach task service. Is shre-tasks running?'
                            : `Error: ${error}` })), !loading && !error && projects.length === 0 && (_jsxs("div", { className: "text-center py-12", style: { color: 'var(--c-text-4)' }, children: [_jsx("div", { className: "text-lg mb-2", children: "No projects found" }), _jsx("div", { className: "text-[13px]", children: "Projects created from tasks or MIB007 will appear here." })] })), projects.map((project) => (_jsxs("div", { className: "rounded-lg transition-colors", style: {
                            background: expandedId === project.id ? 'var(--c-bg-2)' : 'transparent',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsxs("button", { onClick: () => toggleProject(project.id), className: "w-full text-left px-4 py-3 flex items-center gap-3", children: [_jsx("span", { className: "shrink-0 h-2.5 w-2.5 rounded-full", style: { background: STATUS_COLORS[project.status] || '#6b7280' } }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[13px] font-medium truncate", style: { color: 'var(--c-text-1)' }, children: project.name }), project.description && (_jsx("div", { className: "text-[11px] truncate mt-0.5", style: { color: 'var(--c-text-4)' }, children: project.description.slice(0, 120) }))] }), _jsx("span", { className: "text-[10px] shrink-0", style: { color: 'var(--c-text-4)' }, children: relativeTime(project.updated_at || project.created_at) }), _jsx("svg", { className: "h-3 w-3 shrink-0 transition-transform", style: {
                                            color: 'var(--c-text-4)',
                                            transform: expandedId === project.id ? 'rotate(180deg)' : 'none',
                                        }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) })] }), expandedId === project.id && (_jsxs("div", { className: "px-4 pb-3 space-y-2", style: { borderTop: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-3 pt-2 text-[11px]", style: { color: 'var(--c-text-4)' }, children: [_jsxs("span", { children: ["ID: ", project.id.slice(0, 12)] }), project.slug && _jsxs("span", { children: ["Slug: ", project.slug] }), project.approval_mode && _jsxs("span", { children: ["Approval: ", project.approval_mode] }), project.source && _jsxs("span", { children: ["Source: ", project.source] })] }), _jsxs("div", { className: "mt-2", children: [_jsx("div", { className: "text-[11px] font-semibold uppercase tracking-wider mb-1.5", style: { color: 'var(--c-text-4)' }, children: "Tasks" }), !projectTasks[project.id] ? (_jsx("div", { className: "text-[12px]", style: { color: 'var(--c-text-4)' }, children: "Loading..." })) : projectTasks[project.id].length === 0 ? (_jsx("div", { className: "text-[12px]", style: { color: 'var(--c-text-4)' }, children: "No tasks in this project." })) : (_jsx("div", { className: "space-y-1", children: projectTasks[project.id].map((t) => (_jsxs("div", { className: "flex items-center gap-2 px-2 py-1.5 rounded text-[12px]", style: { background: 'var(--c-bg-1)' }, children: [_jsx("span", { className: "h-2 w-2 rounded-full shrink-0", style: {
                                                                background: t.status === 'done'
                                                                    ? '#22c55e'
                                                                    : t.status === 'in_progress'
                                                                        ? '#8b5cf6'
                                                                        : '#6b7280',
                                                            } }), _jsx("span", { className: "flex-1 truncate", style: { color: 'var(--c-text-2)' }, children: t.title }), t.agent && (_jsx("span", { className: "text-[10px] px-1 rounded", style: { color: '#60a5fa' }, children: t.agent }))] }, t.id))) }))] }), _jsx("div", { className: "pt-1", children: _jsx("a", { href: mib007Link(`projects/${project.id}`), target: "_blank", rel: "noopener noreferrer", className: "text-[11px] px-2 py-1 rounded transition-colors hover:bg-white/5", style: { color: 'var(--c-text-4)' }, children: "View in MIB007" }) })] }))] }, project.id)))] })] }));
}
