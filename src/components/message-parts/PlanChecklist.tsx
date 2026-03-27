/**
 * PlanChecklist — renders a project plan as an interactive checklist.
 * Auto-updates as task_assigned / task_completed / task_failed events arrive.
 */
import React, { useState, useCallback } from "react";
import { usePlan } from "../../planStore";
import type { PlanTask } from "../../planStore";

interface PlanChecklistProps {
  projectId: string;
  subtaskCount: number;
  timestamp?: string;
}

const STATUS_ICON: Record<PlanTask["status"], string> = {
  pending: "\u25CB",     // ○
  assigned: "\u25D4",    // ◔ (half-filled)
  completed: "\u2713",   // ✓
  failed: "\u2717",      // ✗
};

const STATUS_COLOR: Record<PlanTask["status"], string> = {
  pending: "var(--c-text-5, #6b7280)",
  assigned: "var(--c-info-soft, #60a5fa)",
  completed: "var(--c-success, #34d399)",
  failed: "var(--c-danger-soft, #f87171)",
};

const STATUS_LABEL: Record<PlanTask["status"], string> = {
  pending: "Pending",
  assigned: "In progress",
  completed: "Done",
  failed: "Failed",
};

export function PlanChecklist({ projectId, subtaskCount, timestamp }: PlanChecklistProps) {
  const plan = usePlan(projectId);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const handleApprove = useCallback(async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/approve`, { method: "POST" });
      if (res.ok) setApproved(true);
    } catch {
      // silent — user can retry
    } finally {
      setApproving(false);
    }
  }, [projectId]);

  const tasks = plan?.tasks || [];
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const totalTasks = tasks.length || subtaskCount;
  const isComplete = plan?.status === "completed";
  const isApproved = approved || plan?.status === "approved" || plan?.status === "executing" || isComplete;

  // Progress percentage
  const progressPct = totalTasks > 0 ? Math.round(((completedCount + failedCount) / totalTasks) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header chip row */}
      <div className="flex items-center gap-1.5 py-1 px-2">
        <div className="flex-1 h-px" style={{ background: "var(--c-border-2)" }} />
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px]"
          style={{
            background: "var(--c-bg-3)",
            color: isComplete ? "var(--c-success, #34d399)" : "var(--c-warning, #fbbf24)",
            border: "1px solid var(--c-border-2)",
          }}
        >
          <span>{isComplete ? "\u2713" : "\uD83D\uDCCB"}</span>
          <span>{isComplete ? "Plan complete" : "Plan pending"}</span>
        </span>
        {timestamp && (
          <span className="text-[9px]" style={{ color: "var(--c-text-5)" }}>{timestamp}</span>
        )}
        <div className="flex-1 h-px" style={{ background: "var(--c-border-2)" }} />
      </div>

      {/* Plan card */}
      <div
        className="mx-4 mb-2 rounded-lg overflow-hidden"
        style={{
          background: "var(--c-bg-3)",
          border: "1px solid var(--c-border-2)",
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: "1px solid var(--c-border-2)" }}
        >
          <span className="font-medium text-[11px]" style={{ color: "var(--c-text-3)" }}>
            Project Plan — {totalTasks} task{totalTasks !== 1 ? "s" : ""}
          </span>
          {totalTasks > 0 && (
            <span className="text-[10px]" style={{ color: "var(--c-text-5)" }}>
              {completedCount}/{totalTasks} done{failedCount > 0 ? ` · ${failedCount} failed` : ""}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="px-3 pt-1.5">
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: "var(--c-border-2)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: isComplete
                    ? "var(--c-success, #34d399)"
                    : failedCount > 0
                      ? "var(--c-warning, #fbbf24)"
                      : "var(--c-info-soft, #60a5fa)",
                }}
              />
            </div>
          </div>
        )}

        {/* Task list */}
        {tasks.length > 0 ? (
          <div className="px-3 py-1.5">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 text-[11px]" style={{ color: "var(--c-text-5)" }}>
            {subtaskCount} tasks planned — details loading...
          </div>
        )}

        {/* Approve button */}
        {!isApproved && tasks.length > 0 && (
          <div
            className="px-3 py-2 flex gap-2"
            style={{ borderTop: "1px solid var(--c-border-2)" }}
          >
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-3 py-1 rounded-md text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                background: "var(--c-success, #34d399)",
                color: "#fff",
                border: "none",
                cursor: approving ? "not-allowed" : "pointer",
                opacity: approving ? 0.6 : 1,
              }}
            >
              {approving ? "Approving..." : "Approve Plan"}
            </button>
          </div>
        )}

        {/* Approved badge */}
        {isApproved && !isComplete && (
          <div
            className="px-3 py-1.5 text-[10px]"
            style={{ color: "var(--c-success, #34d399)", borderTop: "1px solid var(--c-border-2)" }}
          >
            Plan approved — execution in progress
          </div>
        )}

        {/* Completed badge */}
        {isComplete && (
          <div
            className="px-3 py-1.5 text-[10px] font-medium"
            style={{ color: "var(--c-success, #34d399)", borderTop: "1px solid var(--c-border-2)" }}
          >
            All tasks finished
          </div>
        )}
      </div>
    </div>
  );
}

/** Single task row inside the checklist */
function TaskRow({ task }: { task: PlanTask }) {
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      style={{
        opacity: task.status === "completed" ? 0.7 : 1,
      }}
    >
      {/* Status icon */}
      <span
        className="text-[12px] w-4 text-center flex-shrink-0 font-bold"
        style={{ color: STATUS_COLOR[task.status] }}
      >
        {STATUS_ICON[task.status]}
      </span>

      {/* Task title */}
      <span
        className="text-[11px] flex-1 truncate"
        style={{
          color: task.status === "completed" ? "var(--c-text-5)" : "var(--c-text-3)",
          textDecoration: task.status === "completed" ? "line-through" : "none",
        }}
        title={task.title}
      >
        {task.title}
      </span>

      {/* Agent badge */}
      {task.agent && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: "var(--c-bg-2, #1e293b)",
            color: "var(--c-text-4)",
            border: "1px solid var(--c-border-2)",
          }}
        >
          {task.agent}
        </span>
      )}

      {/* Status label */}
      <span
        className="text-[9px] flex-shrink-0"
        style={{ color: STATUS_COLOR[task.status] }}
      >
        {STATUS_LABEL[task.status]}
      </span>

      {/* Quality score */}
      {task.quality != null && (
        <span
          className="text-[9px] flex-shrink-0"
          style={{ color: task.quality >= 3.5 ? "var(--c-success)" : "var(--c-warning)" }}
        >
          Q{task.quality}
        </span>
      )}
    </div>
  );
}
