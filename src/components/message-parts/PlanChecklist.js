import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PlanChecklist — renders a project plan as an interactive checklist.
 * Auto-updates as task_assigned / task_completed / task_failed events arrive.
 */
import { useState, useCallback } from 'react';
import { usePlan } from '../../planStore';
const STATUS_ICON = {
    pending: '\u25CB', // ○
    assigned: '\u25D4', // ◔ (half-filled)
    completed: '\u2713', // ✓
    failed: '\u2717', // ✗
};
const STATUS_COLOR = {
    pending: 'var(--c-text-5, #6b7280)',
    assigned: 'var(--c-info-soft, #60a5fa)',
    completed: 'var(--c-success, #34d399)',
    failed: 'var(--c-danger-soft, #f87171)',
};
const STATUS_LABEL = {
    pending: 'Pending',
    assigned: 'In progress',
    completed: 'Done',
    failed: 'Failed',
};
export function PlanChecklist({ projectId, subtaskCount, timestamp }) {
    const plan = usePlan(projectId);
    const [approving, setApproving] = useState(false);
    const [approved, setApproved] = useState(false);
    const handleApprove = useCallback(async () => {
        setApproving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/approve`, { method: 'POST' });
            if (res.ok)
                setApproved(true);
        }
        catch {
            // silent — user can retry
        }
        finally {
            setApproving(false);
        }
    }, [projectId]);
    const tasks = plan?.tasks || [];
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;
    const totalTasks = tasks.length || subtaskCount;
    const isComplete = plan?.status === 'completed';
    const isApproved = approved || plan?.status === 'approved' || plan?.status === 'executing' || isComplete;
    // Progress percentage
    const progressPct = totalTasks > 0 ? Math.round(((completedCount + failedCount) / totalTasks) * 100) : 0;
    return (_jsxs("div", { className: "max-w-3xl mx-auto", children: [_jsxs("div", { className: "flex items-center gap-1.5 py-1 px-2", children: [_jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } }), _jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px]", style: {
                            background: 'var(--c-bg-3)',
                            color: isComplete ? 'var(--c-success, #34d399)' : 'var(--c-warning, #fbbf24)',
                            border: '1px solid var(--c-border-2)',
                        }, children: [_jsx("span", { children: isComplete ? '\u2713' : '\uD83D\uDCCB' }), _jsx("span", { children: isComplete ? 'Plan complete' : 'Plan pending' })] }), timestamp && (_jsx("span", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: timestamp })), _jsx("div", { className: "flex-1 h-px", style: { background: 'var(--c-border-2)' } })] }), _jsxs("div", { className: "mx-4 mb-2 rounded-lg overflow-hidden", style: {
                    background: 'var(--c-bg-3)',
                    border: '1px solid var(--c-border-2)',
                }, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-1.5", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsxs("span", { className: "font-medium text-[11px]", style: { color: 'var(--c-text-3)' }, children: ["Project Plan \u2014 ", totalTasks, " task", totalTasks !== 1 ? 's' : ''] }), totalTasks > 0 && (_jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [completedCount, "/", totalTasks, " done", failedCount > 0 ? ` · ${failedCount} failed` : ''] }))] }), totalTasks > 0 && (_jsx("div", { className: "px-3 pt-1.5", children: _jsx("div", { className: "h-1 rounded-full overflow-hidden", style: { background: 'var(--c-border-2)' }, children: _jsx("div", { className: "h-full rounded-full transition-all duration-500", style: {
                                    width: `${progressPct}%`,
                                    background: isComplete
                                        ? 'var(--c-success, #34d399)'
                                        : failedCount > 0
                                            ? 'var(--c-warning, #fbbf24)'
                                            : 'var(--c-info-soft, #60a5fa)',
                                } }) }) })), tasks.length > 0 ? (_jsx("div", { className: "px-3 py-1.5", children: tasks.map((task) => (_jsx(TaskRow, { task: task }, task.id))) })) : (_jsxs("div", { className: "px-3 py-2 text-[11px]", style: { color: 'var(--c-text-5)' }, children: [subtaskCount, " tasks planned \u2014 details loading..."] })), !isApproved && tasks.length > 0 && (_jsx("div", { className: "px-3 py-2 flex gap-2", style: { borderTop: '1px solid var(--c-border-2)' }, children: _jsx("button", { onClick: handleApprove, disabled: approving, className: "px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90", style: {
                                background: 'var(--c-success, #34d399)',
                                color: '#fff',
                                border: 'none',
                                cursor: approving ? 'not-allowed' : 'pointer',
                                opacity: approving ? 0.6 : 1,
                            }, children: approving ? 'Approving...' : 'Approve Plan' }) })), isApproved && !isComplete && (_jsx("div", { className: "px-3 py-1.5 text-[10px]", style: { color: 'var(--c-success, #34d399)', borderTop: '1px solid var(--c-border-2)' }, children: "Plan approved \u2014 execution in progress" })), isComplete && (_jsx("div", { className: "px-3 py-1.5 text-[10px] font-medium", style: { color: 'var(--c-success, #34d399)', borderTop: '1px solid var(--c-border-2)' }, children: "All tasks finished" }))] })] }));
}
/** Single task row inside the checklist */
function TaskRow({ task }) {
    return (_jsxs("div", { className: "flex items-center gap-2 py-0.5", style: {
            opacity: task.status === 'completed' ? 0.7 : 1,
        }, children: [_jsx("span", { className: "text-[12px] w-4 text-center flex-shrink-0 font-bold", style: { color: STATUS_COLOR[task.status] }, children: STATUS_ICON[task.status] }), _jsx("span", { className: "text-[11px] flex-1 truncate", style: {
                    color: task.status === 'completed' ? 'var(--c-text-5)' : 'var(--c-text-3)',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                }, title: task.title, children: task.title }), task.agent && (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0", style: {
                    background: 'var(--c-bg-2, #1e293b)',
                    color: 'var(--c-text-4)',
                    border: '1px solid var(--c-border-2)',
                }, children: task.agent })), _jsx("span", { className: "text-[9px] flex-shrink-0", style: { color: STATUS_COLOR[task.status] }, children: STATUS_LABEL[task.status] }), task.quality != null && (_jsxs("span", { className: "text-[9px] flex-shrink-0", style: { color: task.quality >= 3.5 ? 'var(--c-success)' : 'var(--c-warning)' }, children: ["Q", task.quality] }))] }));
}
