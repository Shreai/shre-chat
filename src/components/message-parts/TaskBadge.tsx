import { mib007Link } from "../../chat-utils";

export function TaskBadge({ taskId, status }: { taskId: string; status?: string }) {
  const isDone = status === "done" || status === "completed";
  const href = mib007Link("tasks", `id=${taskId}`);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110 cursor-pointer no-underline"
      style={{
        background: isDone ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
        color: isDone ? "rgb(52,211,153)" : "rgb(129,140,248)",
        border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)"}`,
      }}
      title={isDone ? "Task completed — click to view" : "Task created — click to view"}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        {isDone
          ? <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.97a.75.75 0 00-1.06.02L7.4 9.09 5.87 7.44a.75.75 0 10-1.1 1.02l2.1 2.25a.75.75 0 001.07-.01l3.28-3.7a.75.75 0 00-.02-1.06z"/>
          : <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 11.5a.75.75 0 110-1.5.75.75 0 010 1.5z"/>
        }
      </svg>
      <span>{isDone ? "Task done" : "Task open"}</span>
    </a>
  );
}
