import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp, getAgent } from "./store";

// ── Notification types ──────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  source: string | null;
  read: boolean;
  createdAt: number;
}

const NOTIF_ICONS: Record<string, string> = {
  "task.completed": "\u2705",
  "task.failed": "\u274c",
  "service.unhealthy": "\u26a0\ufe0f",
  "service.started": "\u2714\ufe0f",
  "agent.quality_alert": "\ud83d\udcc9",
  "fleet.agent_status": "\ud83e\udd16",
};

// Important notification types that also show as system messages in chat
const IMPORTANT_TYPES = new Set(["task.failed", "service.unhealthy", "agent.quality_alert"]);

// ── Notification filter categories ──────────────────────────────────
type NotifFilter = "all" | "tasks" | "agents" | "services";

const NOTIF_FILTERS: { key: NotifFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tasks", label: "Tasks" },
  { key: "agents", label: "Agents" },
  { key: "services", label: "Services" },
];

function notifMatchesFilter(n: Notification, filter: NotifFilter): boolean {
  if (filter === "all") return true;
  if (filter === "services") return n.type?.startsWith("service.") || false;
  if (filter === "agents") return n.type?.startsWith("agent.") || n.type?.startsWith("fleet.") || false;
  if (filter === "tasks") return n.type?.startsWith("task.") || false;
  return true;
}

// ── Types ────────────────────────────────────────────────────────────

interface StatusBarData {
  nextEvent: { title: string; startsAt: number } | null;
  activeTasks: number;
  reminders: { total: number; overdue: number };
  agentStatus: "idle" | "busy";
  gatewayConnected: boolean;
  activeAgents: number;
  pendingTasks: number;
}

const EMPTY_DATA: StatusBarData = {
  nextEvent: null,
  activeTasks: 0,
  reminders: { total: 0, overdue: 0 },
  agentStatus: "idle",
  gatewayConnected: false,
  activeAgents: 0,
  pendingTasks: 0,
};

// ── Countdown formatter ──────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ── Component ────────────────────────────────────────────────────────

export function StatusBar() {
  const { state, actions } = useApp();
  const [data, setData] = useState<StatusBarData>(EMPTY_DATA);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>("all");
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastNotifCheck = useRef(0);

  // Derive busy from streaming state
  const agentBusy = state.streaming || data.agentStatus === "busy";

  // Current agent info
  const currentAgent = getAgent(state.activeAgentId);

  // Fetch status bar data
  const fetchStatus = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      const res = await fetch("/api/status-bar", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const json = await res.json();
        setData({
          nextEvent: json.nextEvent ?? null,
          activeTasks: json.tasks?.due ?? 0,
          reminders: { total: json.reminders?.active ?? 0, overdue: json.reminders?.overdue ?? 0 },
          agentStatus: json.streaming ? "busy" : "idle",
          gatewayConnected: json.gatewayConnected ?? false,
          activeAgents: json.activeAgents ?? 0,
          pendingTasks: json.pendingTasks ?? 0,
        });
      }
    } catch {
      // Silently fail — status bar is non-critical
    }
  }, []);

  // Fetch notification unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      const res = await fetch("/api/notifications/unread-count", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const json = await res.json();
        const newCount = json.count || 0;
        if (newCount > unreadCount && unreadCount > 0) {
          fetchNotifications();
        }
        setUnreadCount(newCount);
      }
    } catch { /* non-critical */ }
  }, [unreadCount]);

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      const res = await fetch(`/api/notifications?since=0&limit=20`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const json = await res.json();
        const items: Notification[] = json.notifications || [];
        setNotifications(items);
        const lastCheck = lastNotifCheck.current;
        for (const n of items) {
          if (n.createdAt > lastCheck && !n.read && IMPORTANT_TYPES.has(n.type)) {
            window.dispatchEvent(new CustomEvent("shre-system-notification", { detail: { title: n.title, body: n.body, type: n.type } }));
          }
        }
        if (items.length > 0) {
          lastNotifCheck.current = Math.max(...items.map(n => n.createdAt));
        }
      }
    } catch { /* non-critical */ }
  }, []);

  // Mark a notification as read
  const markRead = useCallback(async (id: string) => {
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* non-critical */ }
  }, []);

  // Dismiss a single notification
  const dismissNotif = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      await fetch(`/api/notifications/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* non-critical */ }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("shre-auth-token") || localStorage.getItem("shre-auth-token");
      const ids = notifications.map(n => n.id);
      if (ids.length === 0) return;
      await fetch(`/api/notifications/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch { /* non-critical */ }
  }, [notifications]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bellOpen]);

  // Fetch on mount (deferred by 2s), then every 60s
  useEffect(() => {
    const initial = setTimeout(() => { fetchStatus(); fetchUnreadCount(); }, 2000);
    const id = setInterval(() => { fetchStatus(); fetchUnreadCount(); }, 60_000);
    return () => { clearTimeout(initial); clearInterval(id); };
  }, [fetchStatus, fetchUnreadCount]);

  // Tick the countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Mic toggle
  const toggleMic = useCallback(() => {
    setRecording((prev) => {
      const next = !prev;
      if (next) window.dispatchEvent(new CustomEvent("shre-voice-start"));
      else window.dispatchEvent(new CustomEvent("shre-voice-stop"));
      return next;
    });
  }, []);

  // Listen for external voice-stop events
  useEffect(() => {
    const handler = () => setRecording(false);
    window.addEventListener("shre-voice-stop", handler);
    return () => window.removeEventListener("shre-voice-stop", handler);
  }, []);

  // Countdown for next event
  const countdown = data.nextEvent ? formatCountdown(data.nextEvent.startsAt - now) : null;

  // Connection status color
  const connColor = data.gatewayConnected ? "#22c55e" : "#ef4444";

  return (
    <div className="status-bar" style={styles.bar}>
      {/* Hamburger — sidebar toggle */}
      <button
        onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
        className="shrink-0 p-1 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: "var(--c-text-3)" }}
        aria-label={state.sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {/* Connection dot + Agent name + Chat icon */}
      <div className="status-bar-item flex items-center" style={{ ...styles.item, gap: 6 }}>
        <span
          className="shrink-0"
          style={{
            width: 7, height: 7, borderRadius: "50%",
            background: connColor,
            boxShadow: data.gatewayConnected ? `0 0 6px ${connColor}` : "none",
          }}
          title={data.gatewayConnected ? "Connected" : "Disconnected"}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-1)", lineHeight: 1 }}>
          {currentAgent.name}
        </span>
        <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </div>

      {/* Active agents badge */}
      {data.activeAgents > 0 && (
        <div className="status-bar-item hidden md:flex" style={styles.item} title={`${data.activeAgents} active agent${data.activeAgents !== 1 ? "s" : ""}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={styles.badge}>{data.activeAgents}</span>
        </div>
      )}

      {/* Pending tasks badge */}
      {data.pendingTasks > 0 && (
        <div className="status-bar-item hidden md:flex" style={styles.item} title={`${data.pendingTasks} pending task${data.pendingTasks !== 1 ? "s" : ""}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ ...styles.badge, color: "var(--c-accent)" }}>{data.pendingTasks}</span>
        </div>
      )}

      {/* Next event countdown */}
      {data.nextEvent && (
        <div className="status-bar-item hidden md:flex" style={styles.item}>
          <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={styles.label} className="truncate max-w-[140px]">{data.nextEvent.title}</span>
          <span style={styles.countdown}>{countdown}</span>
        </div>
      )}

      {/* Reminders badge */}
      {data.reminders.total > 0 && (
        <div className="status-bar-item hidden md:flex" style={styles.item}>
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {data.reminders.overdue > 0 && <span style={styles.redDot} />}
          </div>
          <span style={styles.badge}>{data.reminders.total}</span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Agent status dot */}
      <div className="status-bar-item hidden md:flex" style={styles.item} title={agentBusy ? "Agent busy" : "Agent idle"}>
        <span
          style={{
            width: 7, height: 7, borderRadius: "50%",
            background: agentBusy ? "#22c55e" : "var(--c-text-5)",
            boxShadow: agentBusy ? "0 0 8px #22c55e" : "none",
            transition: "all 0.3s ease",
            animation: agentBusy ? "pulse 1.5s ease-in-out infinite" : "none",
          }}
        />
        <span style={{ ...styles.label, fontSize: 10 }}>{agentBusy ? "busy" : "idle"}</span>
      </div>

      {/* Router / OpenClaw toggle */}
      <button
        onClick={() => {
          const curr = localStorage.getItem("shre-openclaw-mode") === "true";
          const next = !curr;
          localStorage.setItem("shre-openclaw-mode", String(next));
          window.dispatchEvent(new StorageEvent("storage", { key: "shre-openclaw-mode", newValue: String(next) }));
          setData((d) => ({ ...d }));
        }}
        style={{
          ...styles.pillBtn,
          background: localStorage.getItem("shre-openclaw-mode") === "true" ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.1)",
          color: localStorage.getItem("shre-openclaw-mode") === "true" ? "#a855f7" : "#3b82f6",
          border: `1px solid ${localStorage.getItem("shre-openclaw-mode") === "true" ? "rgba(168,85,247,0.25)" : "rgba(59,130,246,0.2)"}`,
        }}
        title={localStorage.getItem("shre-openclaw-mode") === "true" ? "OpenClaw mode — click to switch to Router" : "Router mode — click to switch to OpenClaw"}
      >
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: localStorage.getItem("shre-openclaw-mode") === "true" ? "#a855f7" : "#3b82f6" }} />
        {localStorage.getItem("shre-openclaw-mode") === "true" ? "OC" : "R"}
      </button>

      {/* Language selector */}
      <select
        value={localStorage.getItem("shre-user-language") || ""}
        onChange={(e) => {
          const lang = e.target.value;
          if (lang) localStorage.setItem("shre-user-language", lang);
          else localStorage.removeItem("shre-user-language");
          setData((d) => ({ ...d }));
        }}
        style={{
          ...styles.pillBtn,
          background: "rgba(59,130,246,0.1)",
          color: "var(--c-text-secondary, #94a3b8)",
          border: "1px solid rgba(59,130,246,0.2)",
          cursor: "pointer",
          appearance: "none" as const,
          WebkitAppearance: "none" as const,
        }}
        title="Chat language preference"
      >
        <option value="">EN</option>
        <option value="es">ES</option>
        <option value="hi">HI</option>
        <option value="gu">GU</option>
        <option value="zh">ZH</option>
        <option value="fr">FR</option>
        <option value="pt">PT</option>
        <option value="de">DE</option>
        <option value="ar">AR</option>
        <option value="ja">JA</option>
      </select>

      {/* Notification bell — opens right slider */}
      <div ref={bellRef} style={{ position: "relative" }}>
        <button
          onClick={() => { setBellOpen(!bellOpen); if (!bellOpen) fetchNotifications(); }}
          className="status-bar-item flex"
          style={{ ...styles.iconBtn, position: "relative" }}
          title={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
          aria-label="Notifications"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -2, right: -4,
              minWidth: 14, height: 14, borderRadius: 7,
              background: "var(--c-danger, #ef4444)",
              color: "#fff", fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px", lineHeight: 1,
              boxShadow: "0 0 4px rgba(239,68,68,0.5)",
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Mic button */}
      <button
        onClick={toggleMic}
        style={{
          ...styles.micBtn,
          background: recording ? "var(--c-accent, #6366f1)" : "var(--c-bg-hover, rgba(255,255,255,0.08))",
          animation: recording ? "mic-pulse 1.5s ease-in-out infinite" : "none",
        }}
        title={recording ? "Stop recording" : "Start voice input"}
        aria-label={recording ? "Stop recording" : "Start voice input"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={recording ? "#fff" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {/* ── Notification Slide-in Panel (right side) ── */}
      {createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 199,
              background: "rgba(0,0,0,0.3)",
              opacity: bellOpen ? 1 : 0,
              pointerEvents: bellOpen ? "auto" : "none",
              transition: "opacity 0.25s ease",
            }}
            onClick={() => setBellOpen(false)}
          />
          {/* Panel */}
          <div
            ref={panelRef}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 200,
              width: 360, maxWidth: "90vw",
              transform: bellOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              background: "var(--c-bg-2)",
              borderLeft: "1px solid var(--c-border-1)",
              boxShadow: bellOpen ? "-8px 0 30px rgba(0,0,0,0.3)" : "none",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Panel header */}
            <div style={{
              padding: "16px 16px 12px",
              borderBottom: "1px solid var(--c-border-2)",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--c-text-1)" }}>Notifications</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAll}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 11, color: "var(--c-text-3)", padding: "4px 8px",
                        borderRadius: 6, transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--c-danger, #ef4444)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--c-text-3)"; }}
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setBellOpen(false)}
                    style={{
                      background: "var(--c-bg-hover)", border: "none", cursor: "pointer",
                      width: 28, height: 28, borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--c-text-3)",
                    }}
                    aria-label="Close notifications"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 4 }}>
                {NOTIF_FILTERS.map(f => {
                  const count = f.key === "all" ? notifications.length : notifications.filter(n => notifMatchesFilter(n, f.key)).length;
                  const active = notifFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setNotifFilter(f.key)}
                      style={{
                        flex: 1, padding: "5px 0", fontSize: 11, fontWeight: active ? 600 : 400,
                        background: active ? "var(--c-accent, #6366f1)" : "var(--c-bg-card, var(--c-bg-1))",
                        color: active ? "#fff" : "var(--c-text-3)",
                        border: `1px solid ${active ? "transparent" : "var(--c-border-2)"}`,
                        borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      }}
                    >
                      {f.label}
                      {count > 0 && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          background: active ? "rgba(255,255,255,0.25)" : "var(--c-bg-hover)",
                          padding: "1px 5px", borderRadius: 8, lineHeight: "14px",
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notification list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifications.filter(n => notifMatchesFilter(n, notifFilter)).length === 0 ? (
                <div style={{ padding: "48px 16px", textAlign: "center" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <div style={{ fontSize: 13, color: "var(--c-text-3)" }}>
                    {notifFilter === "all" ? "No notifications yet" : `No ${notifFilter} notifications`}
                  </div>
                </div>
              ) : (
                notifications.filter(n => notifMatchesFilter(n, notifFilter)).map(n => (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.read) markRead(n.id); }}
                    style={{
                      padding: "12px 16px", cursor: "pointer",
                      borderBottom: "1px solid var(--c-border-2)",
                      background: n.read ? "transparent" : "var(--c-accent-soft, rgba(99,141,255,0.08))",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--c-bg-hover)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.read ? "transparent" : "var(--c-accent-soft, rgba(99,141,255,0.08))"; }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                        background: n.type?.includes("failed") || n.type?.includes("unhealthy")
                          ? "var(--c-danger, #ef4444)"
                          : n.type?.includes("quality") ? "#f59e0b" : "var(--c-accent)",
                      }} />
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || "\ud83d\udd14"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: "var(--c-text-1)", lineHeight: 1.4 }}>
                          {n.title}
                        </div>
                        {n.body && (
                          <div style={{ fontSize: 12, color: "var(--c-text-2)", marginTop: 4, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {n.body}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "var(--c-text-3)", marginTop: 5 }}>
                          {new Date(n.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          {n.source && <span> &middot; {n.source}</span>}
                        </div>
                      </div>
                      <button
                        onClick={(e) => dismissNotif(n.id, e)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--c-text-3)", padding: "4px", flexShrink: 0,
                          borderRadius: 6, transition: "color 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--c-danger)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--c-text-3)"; }}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Inline styles */}
      <style>{`
        .status-bar {
          position: relative;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 38px;
          padding: 0 10px;
          padding-top: env(safe-area-inset-top, 0px);
          flex-shrink: 0;
          background: color-mix(in srgb, var(--c-bg-2, #0f0f1a) 80%, transparent);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          border-bottom: 1px solid var(--c-border-1, rgba(255,255,255,0.06));
          font-family: inherit;
          color: var(--c-text-2, #a1a1aa);
          user-select: none;
        }
        .pwa-mode .status-bar { padding-top: 0; }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--c-accent, rgba(99, 102, 241, 0.6)); }
          50% { box-shadow: 0 0 0 8px transparent; }
        }
        @media (max-width: 767px) {
          .status-bar { padding: 0 6px; gap: 6px; }
        }
      `}</style>
    </div>
  );
}

// ── Inline style objects ─────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  bar: {},
  item: {
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  label: {
    color: "var(--c-text-3, #71717a)",
    fontSize: 11,
    lineHeight: 1,
  },
  countdown: {
    color: "var(--c-accent, #6366f1)",
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "var(--c-text-2, #a1a1aa)",
  },
  redDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--c-danger, #ef4444)",
    boxShadow: "0 0 4px #ef4444",
  },
  iconBtn: {
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--c-text-2, #a1a1aa)",
    flexShrink: 0,
  },
  pillBtn: {
    height: 22,
    padding: "0 6px",
    fontSize: 9,
    gap: 3,
    display: "flex",
    alignItems: "center",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--c-text-2, #a1a1aa)",
    transition: "background 0.2s ease, box-shadow 0.2s ease",
    flexShrink: 0,
  },
};
