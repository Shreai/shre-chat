/**
 * planStore — lightweight reactive store for project plan checklists.
 * Uses useSyncExternalStore for React 18 compatibility.
 * No external dependencies (no Zustand).
 */
import { useSyncExternalStore } from 'react';
const plans = new Map();
const listeners = new Set();
let version = 0;
function notify() {
    version++;
    listeners.forEach((l) => l());
}
export function setPlan(projectId, plan) {
    plans.set(projectId, plan);
    notify();
}
export function getPlan(projectId) {
    return plans.get(projectId);
}
export function updatePlanStatus(projectId, status) {
    const plan = plans.get(projectId);
    if (!plan)
        return;
    plan.status = status;
    notify();
}
export function updateTaskStatus(projectId, taskTitle, status, agent, quality) {
    const plan = plans.get(projectId);
    if (!plan)
        return;
    // Find by exact match first, then by substring/includes
    let task = plan.tasks.find((t) => t.title === taskTitle);
    if (!task) {
        const lower = taskTitle.toLowerCase();
        task = plan.tasks.find((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
    }
    if (task) {
        task.status = status;
        if (agent)
            task.agent = agent;
        if (quality != null)
            task.quality = quality;
    }
    // Check if all tasks are done
    const allDone = plan.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
    if (allDone && plan.tasks.length > 0) {
        plan.status = 'completed';
    }
    else if (plan.tasks.some((t) => t.status === 'assigned' || t.status === 'completed')) {
        plan.status = 'executing';
    }
    notify();
}
/** Parse plan summary text into individual task items */
export function parsePlanTasks(summary) {
    if (!summary)
        return [];
    const lines = summary.split('\n');
    const tasks = [];
    let idx = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // Match numbered items: "1. Task title", "1) Task title"
        // Match bullet items: "- Task title", "* Task title", "• Task title"
        // Match checkbox items: "[ ] Task title", "[x] Task title"
        const taskMatch = trimmed.match(/^(?:\d+[.)]\s*|[-*•]\s*|\[[ x]?\]\s*)(.*)/i);
        if (taskMatch && taskMatch[1].trim().length > 2) {
            idx++;
            tasks.push({
                id: `task-${idx}`,
                title: taskMatch[1].trim(),
                status: 'pending',
            });
        }
    }
    return tasks;
}
// ── React hook via useSyncExternalStore ──
function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}
function getSnapshotFor(projectId) {
    let cachedVersion = -1;
    let cachedPlan;
    return () => {
        if (version !== cachedVersion) {
            cachedVersion = version;
            cachedPlan = plans.get(projectId);
        }
        return cachedPlan;
    };
}
const snapshotCache = new Map();
export function usePlan(projectId) {
    if (!snapshotCache.has(projectId)) {
        snapshotCache.set(projectId, getSnapshotFor(projectId));
    }
    return useSyncExternalStore(subscribe, snapshotCache.get(projectId));
}
