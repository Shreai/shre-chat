import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * TaskPanel — Slide-out drawer showing task detail, trace route, subtasks
 * with interactive checkboxes for approving/completing/cancelling tasks.
 */
import { useState, useEffect, useCallback } from 'react';
import { mib007Link } from '../chat-utils';
// ── Status & Priority styling ──
const STATUS_COLORS = {
    created: '#6b7280',
    todo: '#3b82f6',
    in_progress: '#8b5cf6',
    pending_review: '#f59e0b',
    blocked: '#ef4444',
    done: '#22c55e',
    completed: '#22c55e',
    cancelled: '#9ca3af',
    failed: '#ef4444',
};
const STATUS_LABELS = {
    created: 'Created',
    todo: 'To-Do',
    in_progress: 'In Progress',
    pending_review: 'Review',
    blocked: 'Blocked',
    done: 'Done',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
};
function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)
        return 'just now';
    if (diff < 3_600_000)
        return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)
        return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}
export function TaskPanel({ task, onClose, onUpdateTask, fetchSubtasks, fetchTrace }) {
    const [subtasks, setSubtasks] = useState([]);
    const [traceSteps, setTraceSteps] = useState([]);
    const [loadingSubtasks, setLoadingSubtasks] = useState(false);
    const [loadingTrace, setLoadingTrace] = useState(false);
    const [updating, setUpdating] = useState(null);
    const [activeTab, setActiveTab] = useState('detail');
    // Load subtasks
    useEffect(() => {
        setLoadingSubtasks(true);
        fetchSubtasks(task.id).then((list) => {
            setSubtasks(list);
            setLoadingSubtasks(false);
            if (list.length > 0 && activeTab === 'detail')
                setActiveTab('subtasks');
        });
    }, [task.id, fetchSubtasks]);
    // Load trace if available
    useEffect(() => {
        if (task.trace_id) {
            setLoadingTrace(true);
            fetchTrace(task.trace_id).then((steps) => {
                setTraceSteps(steps);
                setLoadingTrace(false);
            });
        }
    }, [task.trace_id, fetchTrace]);
    const handleUpdate = useCallback(async (taskId, patch) => {
        setUpdating(taskId);
        await onUpdateTask(taskId, patch);
        // Refresh subtasks
        const refreshed = await fetchSubtasks(task.id);
        setSubtasks(refreshed);
        setUpdating(null);
    }, [onUpdateTask, fetchSubtasks, task.id]);
    const isDone = task.status === 'done' || task.status === 'completed' || task.status === 'cancelled';
    const completedSubtasks = subtasks.filter((s) => s.status === 'done' || s.status === 'completed').length;
    const progress = task.completion_ratio != null
        ? Math.round(task.completion_ratio * 100)
        : subtasks.length > 0
            ? Math.round((completedSubtasks / subtasks.length) * 100)
            : undefined;
    return (_jsxs("div", { className: "flex flex-col h-full", style: {
            width: 380,
            background: 'var(--c-bg-1)',
            borderLeft: '1px solid var(--c-border-2)',
        }, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx("span", { className: "shrink-0 h-2.5 w-2.5 rounded-full", style: { background: STATUS_COLORS[task.status] || '#6b7280' } }), _jsx("span", { className: "text-sm font-semibold truncate", style: { color: 'var(--c-text-1)' }, children: task.title })] }), _jsx("button", { onClick: onClose, className: "shrink-0 p-1 rounded hover:bg-white/5 transition-colors", style: { color: 'var(--c-text-4)' }, children: _jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), _jsxs("div", { className: "px-4 py-2 shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center gap-3 text-[12px]", style: { color: 'var(--c-text-3)' }, children: [_jsx("span", { className: "px-2 py-0.5 rounded-full text-[11px] font-medium", style: {
                                    background: `${STATUS_COLORS[task.status] || '#6b7280'}20`,
                                    color: STATUS_COLORS[task.status] || '#6b7280',
                                }, children: STATUS_LABELS[task.status] || task.status }), task.agent && _jsxs("span", { children: ["Agent: ", task.agent] }), task.priority && (_jsx("span", { style: { textTransform: 'capitalize' }, children: task.priority })), _jsx("span", { children: relativeTime(task.updated_at || task.created_at) })] }), progress != null && (_jsxs("div", { className: "mt-2", children: [_jsxs("div", { className: "flex items-center justify-between text-[11px] mb-1", style: { color: 'var(--c-text-4)' }, children: [_jsx("span", { children: "Progress" }), _jsxs("span", { children: [progress, "%"] })] }), _jsx("div", { className: "h-1.5 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3, rgba(255,255,255,0.06))' }, children: _jsx("div", { className: "h-full rounded-full transition-all duration-500", style: {
                                        width: `${progress}%`,
                                        background: progress === 100 ? '#22c55e' : '#8b5cf6',
                                    } }) })] }))] }), _jsx("div", { className: "flex shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: ['detail', 'subtasks', 'trace'].map((tab) => (_jsxs("button", { onClick: () => setActiveTab(tab), className: "flex-1 text-[11px] py-2 transition-colors", style: {
                        color: activeTab === tab ? 'var(--c-accent, #8b5cf6)' : 'var(--c-text-4)',
                        borderBottom: activeTab === tab ? '2px solid var(--c-accent, #8b5cf6)' : '2px solid transparent',
                        fontWeight: activeTab === tab ? 600 : 400,
                    }, children: [tab === 'detail' && 'Detail', tab === 'subtasks' && `Subtasks${subtasks.length > 0 ? ` (${subtasks.length})` : ''}`, tab === 'trace' && 'Trace Route'] }, tab))) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-3", children: [activeTab === 'detail' && (_jsx(DetailTab, { task: task, isDone: isDone, onUpdate: handleUpdate, updating: updating })), activeTab === 'subtasks' && (_jsx(SubtasksTab, { subtasks: subtasks, loading: loadingSubtasks, onUpdate: handleUpdate, updating: updating })), activeTab === 'trace' && (_jsx(TraceTab, { steps: traceSteps, loading: loadingTrace, traceId: task.trace_id }))] }), _jsxs("div", { className: "flex items-center gap-2 px-4 py-3 shrink-0", style: { borderTop: '1px solid var(--c-border-2)' }, children: [!isDone && (_jsxs(_Fragment, { children: [(task.status === 'in_progress' || task.status === 'pending_review') && (_jsx(ActionButton, { label: "Complete", color: "#22c55e", loading: updating === task.id, onClick: () => handleUpdate(task.id, { status: 'done', expected_status: task.status }) })), task.status === 'blocked' && (_jsx(ActionButton, { label: "Unblock", color: "#3b82f6", loading: updating === task.id, onClick: () => handleUpdate(task.id, { status: 'in_progress', expected_status: 'blocked' }) })), _jsx(ActionButton, { label: "Cancel", color: "#ef4444", loading: updating === task.id, onClick: () => handleUpdate(task.id, { status: 'cancelled' }) })] })), (task.status === 'failed' || task.status === 'cancelled') && (_jsx(ActionButton, { label: "Retry", color: "#f59e0b", loading: updating === task.id, onClick: () => handleUpdate(task.id, { status: 'todo' }) })), _jsx("a", { href: mib007Link('tasks', `id=${task.id}`), target: "_blank", rel: "noopener noreferrer", className: "ml-auto text-[11px] px-2 py-1.5 rounded-lg transition-colors hover:bg-white/5", style: { color: 'var(--c-text-4)' }, children: "Open in MIB007" })] })] }));
}
// ── Detail Tab ──
function DetailTab({ task, isDone, onUpdate, updating, }) {
    return (_jsxs("div", { className: "space-y-3", children: [task.description && (_jsx("p", { className: "text-[12px] leading-relaxed", style: { color: 'var(--c-text-2)' }, children: task.description })), _jsxs("div", { className: "space-y-1.5", children: [_jsx(InfoRow, { label: "ID", value: task.id.slice(0, 16) }), task.project_id && _jsx(InfoRow, { label: "Project", value: task.project_id.slice(0, 16) }), task.source && _jsx(InfoRow, { label: "Source", value: task.source }), task.quality_score != null && (_jsx(InfoRow, { label: "Quality", value: `${task.quality_score.toFixed(1)} / 5.0` })), task.depends_on && task.depends_on.length > 0 && (_jsx(InfoRow, { label: "Depends on", value: task.depends_on.map((d) => d.slice(0, 8)).join(', ') })), _jsx(InfoRow, { label: "Created", value: new Date(task.created_at).toLocaleString() }), task.updated_at && _jsx(InfoRow, { label: "Updated", value: relativeTime(task.updated_at) })] })] }));
}
function InfoRow({ label, value }) {
    return (_jsxs("div", { className: "flex items-center justify-between text-[11px]", children: [_jsx("span", { style: { color: 'var(--c-text-4)' }, children: label }), _jsx("span", { style: { color: 'var(--c-text-2)' }, className: "font-mono text-right max-w-[200px] truncate", children: value })] }));
}
// ── Subtasks Tab (Interactive Checkboxes) ──
function SubtasksTab({ subtasks, loading, onUpdate, updating, }) {
    if (loading) {
        return (_jsx("div", { className: "text-[12px] py-6 text-center", style: { color: 'var(--c-text-4)' }, children: "Loading subtasks..." }));
    }
    if (subtasks.length === 0) {
        return (_jsx("div", { className: "text-[12px] py-6 text-center", style: { color: 'var(--c-text-4)' }, children: "No subtasks. This is a standalone task." }));
    }
    return (_jsx("div", { className: "space-y-1", children: subtasks.map((sub) => {
            const isChecked = sub.status === 'done' || sub.status === 'completed';
            const isFailed = sub.status === 'failed';
            const isActive = sub.status === 'in_progress';
            const isUpdating = updating === sub.id;
            return (_jsxs("div", { className: "flex items-start gap-2.5 py-2 px-2 rounded-lg transition-colors hover:bg-white/[0.03]", children: [_jsxs("button", { disabled: isUpdating, onClick: () => {
                            if (isChecked) {
                                onUpdate(sub.id, { status: 'in_progress', expected_status: sub.status });
                            }
                            else {
                                onUpdate(sub.id, { status: 'done', expected_status: sub.status });
                            }
                        }, className: "shrink-0 mt-0.5 h-4 w-4 rounded border transition-all duration-150 flex items-center justify-center", style: {
                            borderColor: isChecked
                                ? '#22c55e'
                                : isFailed
                                    ? '#ef4444'
                                    : isActive
                                        ? '#8b5cf6'
                                        : 'var(--c-border-2)',
                            background: isChecked
                                ? '#22c55e'
                                : isFailed
                                    ? 'rgba(239,68,68,0.15)'
                                    : 'transparent',
                            opacity: isUpdating ? 0.5 : 1,
                        }, children: [isChecked && (_jsx("svg", { className: "h-2.5 w-2.5", viewBox: "0 0 12 12", fill: "none", stroke: "white", strokeWidth: "2", children: _jsx("path", { d: "M2 6l3 3 5-5" }) })), isFailed && (_jsx("svg", { className: "h-2.5 w-2.5", viewBox: "0 0 12 12", fill: "none", stroke: "#ef4444", strokeWidth: "2", children: _jsx("path", { d: "M3 3l6 6M9 3l-6 6" }) })), isActive && (_jsx("span", { className: "h-2 w-2 rounded-full animate-pulse", style: { background: '#8b5cf6' } }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[12px] leading-snug", style: {
                                    color: isChecked ? 'var(--c-text-4)' : 'var(--c-text-1)',
                                    textDecoration: isChecked ? 'line-through' : 'none',
                                }, children: sub.title }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5 text-[10px]", style: { color: 'var(--c-text-4)' }, children: [sub.agent && _jsx("span", { children: sub.agent }), sub.quality_score != null && _jsxs("span", { children: ["Q: ", sub.quality_score.toFixed(1)] }), _jsx("span", { className: "px-1 py-px rounded", style: {
                                            background: `${STATUS_COLORS[sub.status] || '#6b7280'}15`,
                                            color: STATUS_COLORS[sub.status] || '#6b7280',
                                        }, children: STATUS_LABELS[sub.status] || sub.status })] })] })] }, sub.id));
        }) }));
}
// ── Trace Route Tab ──
function TraceTab({ steps, loading, traceId, }) {
    if (!traceId) {
        return (_jsx("div", { className: "text-[12px] py-6 text-center", style: { color: 'var(--c-text-4)' }, children: "No trace ID attached to this task." }));
    }
    if (loading) {
        return (_jsx("div", { className: "text-[12px] py-6 text-center", style: { color: 'var(--c-text-4)' }, children: "Loading trace route..." }));
    }
    if (steps.length === 0) {
        return (_jsxs("div", { className: "text-[12px] py-6 text-center", style: { color: 'var(--c-text-4)' }, children: ["Trace data not available yet.", _jsxs("div", { className: "mt-1 text-[10px]", children: ["ID: ", traceId.slice(0, 20)] })] }));
    }
    return (_jsxs("div", { className: "relative", children: [_jsx("div", { className: "absolute left-[7px] top-2 bottom-2 w-px", style: { background: 'var(--c-border-2)' } }), _jsx("div", { className: "space-y-0.5", children: steps.map((step, i) => {
                    const icon = step.status === 'ok' ? 'check' : step.status === 'fail' ? 'x' : step.status === 'running' ? 'pulse' : 'dot';
                    const color = step.status === 'ok'
                        ? '#22c55e'
                        : step.status === 'fail'
                            ? '#ef4444'
                            : step.status === 'running'
                                ? '#8b5cf6'
                                : '#6b7280';
                    return (_jsxs("div", { className: "flex items-start gap-3 py-1.5 pl-0 relative", children: [_jsxs("div", { className: "shrink-0 h-[14px] w-[14px] rounded-full flex items-center justify-center z-10", style: { background: 'var(--c-bg-1)' }, children: [icon === 'check' && (_jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 12 12", fill: color, children: [_jsx("circle", { cx: "6", cy: "6", r: "6" }), _jsx("path", { d: "M3.5 6l2 2 3-3.5", fill: "none", stroke: "white", strokeWidth: "1.5" })] })), icon === 'x' && (_jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 12 12", fill: color, children: [_jsx("circle", { cx: "6", cy: "6", r: "6" }), _jsx("path", { d: "M4 4l4 4M8 4l-4 4", fill: "none", stroke: "white", strokeWidth: "1.5" })] })), icon === 'pulse' && (_jsx("span", { className: "h-3 w-3 rounded-full animate-pulse", style: { background: color } })), icon === 'dot' && (_jsx("span", { className: "h-2.5 w-2.5 rounded-full border-2", style: { borderColor: color } }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[12px]", style: { color: step.status === 'pending' ? 'var(--c-text-4)' : 'var(--c-text-1)' }, children: step.name }), _jsxs("div", { className: "flex items-center gap-2 text-[10px]", style: { color: 'var(--c-text-4)' }, children: [step.duration_ms != null && (_jsx("span", { children: step.duration_ms < 1000
                                                    ? `${step.duration_ms}ms`
                                                    : `${(step.duration_ms / 1000).toFixed(1)}s` })), step.error && (_jsx("span", { style: { color: '#ef4444' }, className: "truncate max-w-[200px]", children: step.error }))] })] })] }, i));
                }) })] }));
}
// ── Shared Components ──
function ActionButton({ label, color, loading, onClick, }) {
    return (_jsx("button", { disabled: loading, onClick: onClick, className: "text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all duration-150 hover:brightness-110", style: {
            background: `${color}20`,
            color,
            opacity: loading ? 0.5 : 1,
        }, children: loading ? '...' : label }));
}
// ── Inline Task Status Pills (for use inside message bubbles) ──
export function InlineTaskPills({ tasks, onSelectTask, }) {
    if (tasks.length === 0)
        return null;
    return (_jsx("div", { className: "flex flex-wrap gap-1.5 mt-2", children: tasks.map((task) => {
            const color = STATUS_COLORS[task.status] || '#6b7280';
            const isDone = task.status === 'done' || task.status === 'completed';
            const isActive = task.status === 'in_progress';
            return (_jsxs("button", { onClick: () => onSelectTask(task.id), className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110 cursor-pointer", style: {
                    background: `${color}15`,
                    color,
                    border: `1px solid ${color}30`,
                }, children: [isDone ? (_jsx("svg", { className: "h-3 w-3", viewBox: "0 0 12 12", fill: "currentColor", children: _jsx("path", { d: "M6 0a6 6 0 110 12A6 6 0 016 0zm2.4 4.2a.5.5 0 00-.7.02L5.5 6.8l-1.2-1.3a.5.5 0 10-.7.7l1.6 1.7a.5.5 0 00.7 0l2.5-2.9a.5.5 0 000-.7z" }) })) : isActive ? (_jsx("span", { className: "h-2 w-2 rounded-full animate-pulse", style: { background: color } })) : (_jsx("span", { className: "h-2 w-2 rounded-full", style: { background: color } })), _jsx("span", { className: "truncate max-w-[120px]", children: task.agent || 'agent' }), _jsx("span", { style: { opacity: 0.7 }, children: STATUS_LABELS[task.status] || task.status }), task.completion_ratio != null && task.completion_ratio > 0 && (_jsxs("span", { style: { opacity: 0.7 }, children: [Math.round(task.completion_ratio * 100), "%"] }))] }, task.id));
        }) }));
}
// ── Floating Task Indicator (shows in chat header/sidebar) ──
export function TaskIndicatorButton({ activeTasks, onClick, }) {
    if (activeTasks.length === 0)
        return null;
    const inProgress = activeTasks.filter((t) => t.status === 'in_progress').length;
    const blocked = activeTasks.filter((t) => t.status === 'blocked').length;
    return (_jsxs("button", { onClick: onClick, className: "relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 hover:brightness-110", style: {
            background: 'rgba(139,92,246,0.1)',
            color: '#a78bfa',
            border: '1px solid rgba(139,92,246,0.2)',
        }, title: `${activeTasks.length} active task${activeTasks.length > 1 ? 's' : ''}`, children: [inProgress > 0 && (_jsx("span", { className: "h-2 w-2 rounded-full animate-pulse", style: { background: '#8b5cf6' } })), blocked > 0 && inProgress === 0 && (_jsx("span", { className: "h-2 w-2 rounded-full", style: { background: '#ef4444' } })), _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M9 11l3 3L22 4" }), _jsx("path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" })] }), _jsx("span", { children: activeTasks.length })] }));
}
