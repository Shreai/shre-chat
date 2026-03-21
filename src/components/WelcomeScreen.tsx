import React, { useState, useEffect } from "react";
import type { UserProfile } from "../store";
import { getGreeting, getTemplatesForAgent } from "../chat-utils";

interface PendingTask { id: string; title: string; status: string; priority?: string; agent?: string }

export function WelcomeScreen({ agent, agentId, userProfile, onSelectTemplate }: {
  agent: { emoji: string; name: string; id: string };
  agentId: string;
  userProfile: UserProfile | null;
  onSelectTemplate: (prompt: string) => void;
}) {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Fetch pending tasks from shre-tasks service
  useEffect(() => {
    if (!userProfile?.preferences?.showTasksOnGreeting) return;
    setTasksLoading(true);
    fetch(`${import.meta.env.VITE_TASKS_URL ?? "https://127.0.0.1:5460"}/v1/tasks?status=todo&limit=5`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: PendingTask[]) => setTasks(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [userProfile?.preferences?.showTasksOnGreeting]);

  const greeting = getGreeting();
  const firstName = userProfile?.name?.split(" ")[0] || "";

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-5 pb-20">
      {/* Agent avatar */}
      <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "var(--c-bg-active)" }}>
        <span className="text-3xl">{agent.emoji}</span>
      </div>

      {/* Personalized greeting */}
      <div>
        <p className="font-semibold text-base" style={{ color: "var(--c-text-1)" }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--c-text-3)" }}>
          {userProfile?.business?.name
            ? `How can ${agent.name} help ${userProfile.business.name} today?`
            : `How can ${agent.name} help you today?`}
        </p>
      </div>

      {/* Pending tasks */}
      {userProfile?.preferences?.showTasksOnGreeting && (tasks.length > 0 || tasksLoading) && (
        <div className="w-full max-w-md px-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-left" style={{ color: "var(--c-text-4)" }}>
            Pending Tasks
          </div>
          {tasksLoading ? (
            <div className="text-xs animate-pulse" style={{ color: "var(--c-text-5)" }}>Loading tasks...</div>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  style={{ background: "var(--c-bg-card)", border: "1px solid var(--c-border-2)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-bg-active)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--c-bg-card)"; }}
                  onClick={() => onSelectTemplate(`Help me with: ${t.title}`)}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{
                    background: t.priority === "high" ? "var(--c-danger)" : t.priority === "medium" ? "var(--c-warning)" : "var(--c-accent)",
                  }} />
                  <span className="text-xs truncate" style={{ color: "var(--c-text-2)" }}>{t.title}</span>
                  {t.agent && (
                    <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--c-text-5)" }}>{t.agent}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conversation starter templates */}
      <div className="grid gap-3 w-full max-w-md px-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {getTemplatesForAgent(agentId).map((tpl) => (
          <button
            key={tpl.title}
            className="text-left px-4 py-3 rounded-xl transition-all duration-150"
            style={{
              border: "1px solid var(--c-border-2)",
              background: "var(--c-bg-card)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--c-bg-active)";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--c-bg-card)";
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "none";
            }}
            onClick={() => onSelectTemplate(tpl.prompt)}
          >
            <span className="text-base mr-2">{tpl.icon}</span>
            <span className="text-xs font-medium" style={{ color: "var(--c-text-2)" }}>{tpl.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
