/**
 * planStore — lightweight reactive store for project plan checklists.
 * Uses useSyncExternalStore for React 18 compatibility.
 * No external dependencies (no Zustand).
 */
import { useSyncExternalStore } from 'react';

export interface PlanTask {
  id: string;
  title: string;
  status: 'pending' | 'assigned' | 'completed' | 'failed';
  agent?: string;
  quality?: number;
}

export interface Plan {
  projectId: string;
  tasks: PlanTask[];
  status: 'pending_approval' | 'approved' | 'executing' | 'completed';
}

const plans = new Map<string, Plan>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function setPlan(projectId: string, plan: Plan): void {
  plans.set(projectId, plan);
  notify();
}

export function getPlan(projectId: string): Plan | undefined {
  return plans.get(projectId);
}

export function updatePlanStatus(projectId: string, status: Plan['status']): void {
  const plan = plans.get(projectId);
  if (!plan) return;
  plan.status = status;
  notify();
}

export function updateTaskStatus(
  projectId: string,
  taskTitle: string,
  status: PlanTask['status'],
  agent?: string,
  quality?: number,
): void {
  const plan = plans.get(projectId);
  if (!plan) return;

  // Find by exact match first, then by substring/includes
  let task = plan.tasks.find((t) => t.title === taskTitle);
  if (!task) {
    const lower = taskTitle.toLowerCase();
    task = plan.tasks.find(
      (t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()),
    );
  }

  if (task) {
    task.status = status;
    if (agent) task.agent = agent;
    if (quality != null) task.quality = quality;
  }

  // Check if all tasks are done
  const allDone = plan.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
  if (allDone && plan.tasks.length > 0) {
    plan.status = 'completed';
  } else if (plan.tasks.some((t) => t.status === 'assigned' || t.status === 'completed')) {
    plan.status = 'executing';
  }

  notify();
}

/** Parse plan summary text into individual task items */
export function parsePlanTasks(summary: string): PlanTask[] {
  if (!summary) return [];
  const lines = summary.split('\n');
  const tasks: PlanTask[] = [];
  let idx = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

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

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshotFor(projectId: string): () => Plan | undefined {
  let cachedVersion = -1;
  let cachedPlan: Plan | undefined;

  return () => {
    if (version !== cachedVersion) {
      cachedVersion = version;
      cachedPlan = plans.get(projectId);
    }
    return cachedPlan;
  };
}

const snapshotCache = new Map<string, () => Plan | undefined>();

export function usePlan(projectId: string): Plan | undefined {
  if (!snapshotCache.has(projectId)) {
    snapshotCache.set(projectId, getSnapshotFor(projectId));
  }
  return useSyncExternalStore(subscribe, snapshotCache.get(projectId)!);
}
