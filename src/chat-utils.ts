import React from "react";
import ports from "../../ports.json";
import { usePreferences } from "./preferences-store";

// ── Notification sound (Web Audio API — no external files) ──────────
export const NOTIF_ENABLED_KEY = "shre-notification-sound";
export function isNotifEnabled(): boolean {
  return usePreferences.getState().notifSound;
}
export function playNotifSound() {
  if (!isNotifEnabled() || document.hasFocus()) return; // only play when tabbed away
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08); // C#6
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch { /* audio not available */ }
}

// ── Voice audio cues (Web Audio — no files needed) ──────────────────
export function playVoiceCue(type: "start" | "stop" | "wake") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);

    if (type === "start") {
      // Low ascending blip — 440→523Hz, 120ms
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(523, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "stop") {
      // High descending blip — 660→523Hz, 120ms
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(523, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else {
      // Wake word — 2-note ascending chime: C5→E5
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.connect(gain); o2.connect(gain);
      o1.type = "sine"; o2.type = "sine";
      o1.frequency.setValueAtTime(523, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.15);
      o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.15);
      o2.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.05, ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o2.start(ctx.currentTime + 0.15); o2.stop(ctx.currentTime + 0.3);
    }
    setTimeout(() => ctx.close(), 600);
  } catch { /* audio not available */ }
}

export const VOICE_MODE_KEY = "shre-voice-mode";
export const MAX_RECORDING_SECONDS = 300; // 5 minutes

export function showDesktopNotification(body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  const n = new Notification("Shre Chat", { body: body.slice(0, 100) });
  n.onclick = () => { window.focus(); n.close(); };
}

// ── Token estimation (chars / 4 heuristic for English text) ──────────
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `~${(tokens / 1000).toFixed(1)}k tokens`;
  return `~${tokens} tokens`;
}

// ── Provider icon mapping ────────────────────────────────────────────
export const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "🟣", openai: "🟢", google: "🔵",
  ollama: "⚪", "ollama-remote": "⚪", ensemble: "🟡", "claude-cli": "🟣",
};
export function providerIcon(provider: string): string {
  return PROVIDER_ICONS[provider] || "⚫";
}
export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: "Anthropic", openai: "OpenAI", google: "Google",
    ollama: "Ollama (Local)", "ollama-remote": "Ollama (Remote)",
    ensemble: "Ensemble", "claude-cli": "Claude CLI",
  };
  return labels[provider] || provider;
}

// Fallback models (used until live fetch completes)
export const FALLBACK_MODELS: Array<{ id: string; name: string; provider: string; icon: string; connected?: boolean }> = [
  { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", icon: "🟣", connected: true },
  { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6", provider: "Anthropic", icon: "🟣", connected: true },
  { id: "anthropic/claude-haiku", name: "Claude Haiku", provider: "Anthropic", icon: "🟣", connected: true },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", icon: "🟢", connected: true },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", icon: "🟢", connected: true },
  { id: "openai/o1", name: "o1", provider: "OpenAI", icon: "🟢", connected: true },
  { id: "openai/o3-mini", name: "o3-mini", provider: "OpenAI", icon: "🟢", connected: true },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", icon: "🔵", connected: true },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", icon: "🔵", connected: true },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek", icon: "🟠", connected: true },
  { id: "meta/llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta", icon: "🦙", connected: true },
];

export const DEFAULT_CONTEXT_LIMIT = 200000;

// ── Conversation Templates (starter prompts per agent) ──────────────
export const AGENT_TEMPLATES: Record<string, Array<{ title: string; prompt: string; icon: string }>> = {
  main: [
    { title: "Explain a concept", prompt: "Explain the following concept in simple terms: ", icon: "💡" },
    { title: "Write an email", prompt: "Help me write a professional email about ", icon: "✉️" },
    { title: "Brainstorm ideas", prompt: "Brainstorm creative ideas for ", icon: "🧠" },
    { title: "Analyze this data", prompt: "Analyze the following data and provide insights:\n\n", icon: "📊" },
  ],
  "engineering-manager": [
    { title: "Code review", prompt: "Review this code for quality, bugs, and improvements:\n\n", icon: "🔎" },
    { title: "Debug this error", prompt: "Help me debug the following error:\n\n", icon: "🐛" },
    { title: "Design a system", prompt: "Design a system architecture for ", icon: "🏗️" },
    { title: "Write tests", prompt: "Write comprehensive tests for the following code:\n\n", icon: "🧪" },
  ],
  "product-manager": [
    { title: "Write a PRD", prompt: "Write a product requirements document for ", icon: "📋" },
    { title: "User story mapping", prompt: "Create user stories for the following feature: ", icon: "🗺️" },
    { title: "Prioritize features", prompt: "Help me prioritize the following features using a framework:\n\n", icon: "📐" },
    { title: "Competitive analysis", prompt: "Conduct a competitive analysis for ", icon: "🔬" },
  ],
  "founding-engineer": [
    { title: "Architect a service", prompt: "Design the architecture for a new service that ", icon: "🏛️" },
    { title: "Optimize performance", prompt: "Help me optimize the performance of:\n\n", icon: "⚡" },
    { title: "Security audit", prompt: "Perform a security audit on the following:\n\n", icon: "🛡️" },
    { title: "Deploy strategy", prompt: "Plan a deployment strategy for ", icon: "🚀" },
  ],
  _default: [
    { title: "Ask a question", prompt: "I have a question about ", icon: "❓" },
    { title: "Summarize this", prompt: "Summarize the following:\n\n", icon: "📝" },
    { title: "Help me write", prompt: "Help me write ", icon: "✍️" },
    { title: "Analyze this", prompt: "Analyze the following and share your insights:\n\n", icon: "🔍" },
  ],
};

export function getTemplatesForAgent(agentId: string): Array<{ title: string; prompt: string; icon: string }> {
  return AGENT_TEMPLATES[agentId] || AGENT_TEMPLATES._default;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getContextColor(pct: number): string {
  if (pct > 90) return "var(--c-danger)";   // red
  if (pct > 75) return "var(--c-orange)";   // orange
  if (pct > 50) return "var(--c-yellow)";   // yellow
  return "var(--c-success)";                 // green
}

export const MODEL_STORAGE_KEY = "shre-model-overrides";

export function getModelOverride(agentId: string): string | null {
  return usePreferences.getState().modelOverrides[agentId] || null;
}

export function setModelOverride(agentId: string, modelId: string | null) {
  usePreferences.getState().setModelOverride(agentId, modelId);
}

/** MIB007 base URL — use tunnel URL when available, fallback to localhost */
export const MIB007_BASE = typeof window !== "undefined" && window.location.hostname !== "localhost"
  ? "https://app.nirtek.net"
  : `https://localhost:${ports.services?.["mib007"]?.port ?? 5520}`;

/** Default company prefix for MIB007 deep links */
export const MIB007_PREFIX = "SHR";

/** Build a deep link to a MIB007 view */
export function mib007Link(view: string, params?: string): string {
  const base = `${MIB007_BASE}/${MIB007_PREFIX}/${view}`;
  return params ? `${base}?${params}` : base;
}

export const ECOSYSTEM_APPS = [
  { id: "mib007", name: "MIB007", icon: "M", url: MIB007_BASE, color: "from-blue-500 to-cyan-500", description: "Agents & Issues" },
  { id: "shre-platform", name: "Shre AI", icon: "S", url: `https://localhost:${ports.services?.["mib-desktop"]?.port ?? 5500}`, color: "from-violet-500 to-fuchsia-500", description: "Dashboard" },
  { id: "openclaw", name: "OpenClaw", icon: "O", url: `http://localhost:${ports.infrastructure?.["openclaw-gateway"]?.port ?? 18789}`, color: "from-amber-500 to-orange-500", description: "AI Gateway" },
  { id: "cortexdb", name: "CortexDB", icon: "C", url: `http://localhost:${ports.infrastructure?.["cortexdb-dashboard"]?.port ?? 3400}`, color: "from-emerald-500 to-teal-500", description: "Knowledge DB" },
];

export function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const hhmm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return hhmm;
  const mon = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${mon} ${day}, ${hhmm}`;
  return `${mon} ${day} ${d.getFullYear()}, ${hhmm}`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for Electron / non-secure contexts
  return new Promise((resolve) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    resolve();
  });
}

export const REACTION_EMOJIS = ["\u{1F44D}", "\u{1F44E}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F389}", "\u{1F914}"];

/** Strip <think>...</think> blocks and raw thinking artifacts from AI responses */
export function stripThinkBlocks(text: string): string {
  // Remove <think>...</think> blocks (including multiline)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  // Remove unclosed <think> at start (partial streaming artifact)
  cleaned = cleaned.replace(/^<think>[\s\S]*$/, "");
  return cleaned.trim();
}

/** Semantic action tag definitions */
export interface ActionTag {
  type: string;
  content: string;
  icon: string;
  color: string;
  bgColor: string;
}

export const TAG_STYLES: Record<string, { icon: string; color: string; bgColor: string; label: string }> = {
  final:     { icon: "✓", color: "var(--c-emerald)", bgColor: "rgba(52,211,153,0.12)", label: "Completed" },
  executing: { icon: "⟳", color: "var(--c-terminal-accent)", bgColor: "rgba(108,180,238,0.12)", label: "Executing" },
  status:    { icon: "●", color: "var(--c-purple)", bgColor: "rgba(167,139,250,0.12)", label: "Status" },
  tool:      { icon: "⚙", color: "var(--c-warning)", bgColor: "rgba(245,158,11,0.12)",  label: "Tool" },
  result:    { icon: "◆", color: "var(--c-emerald)", bgColor: "rgba(52,211,153,0.12)",  label: "Result" },
  error:     { icon: "✗", color: "var(--c-danger-soft)", bgColor: "rgba(248,113,113,0.12)", label: "Error" },
  warning:   { icon: "▲", color: "var(--c-warning-soft)", bgColor: "rgba(251,191,36,0.12)",  label: "Warning" },
  progress:  { icon: "◐", color: "var(--c-terminal-accent)", bgColor: "rgba(108,180,238,0.12)", label: "In Progress" },
  action:    { icon: "→", color: "var(--c-purple)", bgColor: "rgba(167,139,250,0.12)", label: "Action" },
  verified:  { icon: "✓", color: "var(--c-emerald)", bgColor: "rgba(52,211,153,0.12)", label: "Verified" },
};

/** Extract semantic tags from message content and return clean text + tags */
export function extractActionTags(text: string): { cleanText: string; tags: ActionTag[] } {
  const tags: ActionTag[] = [];
  const tagPattern = /<(final|executing|status|tool|result|error|warning|progress|action|verified)>([\s\S]*?)<\/\1>/g;

  let cleanText = text;
  let match;

  while ((match = tagPattern.exec(text)) !== null) {
    const [fullMatch, tagType, content] = match;
    const style = TAG_STYLES[tagType] || TAG_STYLES.status;
    tags.push({
      type: tagType,
      content: content.trim(),
      icon: style.icon,
      color: style.color,
      bgColor: style.bgColor,
    });
    cleanText = cleanText.replace(fullMatch, content.trim());
  }

  return { cleanText: cleanText.trim(), tags };
}

// ── Lightweight streaming markdown renderer ──────────────────────────
export function lightweightMarkdown(text: string): string {
  let html = text
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic: *text* or _text_ (not inside words)
    .replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<em>$1</em>")
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<em>$1</em>")
    // Inline code: `code`
    .replace(/`([^`\n]+?)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
    // Links: [text](url) — only allow safe URL schemes (prevent javascript: XSS)
    .replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m: string, linkText: string, url: string) => {
      const scheme = url.trim().toLowerCase();
      if (scheme.startsWith("javascript:") || scheme.startsWith("data:") || scheme.startsWith("vbscript:")) {
        return linkText; // Strip dangerous links, keep text
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--c-accent);text-decoration:underline">${linkText}</a>`;
    })
    // Headings: # at start of line
    .replace(/^### (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:1.15em">$1</strong>')
    // Bullet lists: - or * at start of line
    .replace(/^[\-\*] (.+)$/gm, "\u2022 $1");
  return html;
}

export function splitStableAndPending(text: string): { stable: string; pending: string } {
  const lastDoubleNewline = text.lastIndexOf("\n\n");
  if (lastDoubleNewline === -1) {
    return { stable: "", pending: text };
  }
  return {
    stable: text.slice(0, lastDoubleNewline),
    pending: text.slice(lastDoubleNewline + 2),
  };
}

export function classifySystemEvent(content: string): { icon: string; label: string; color: string } {
  const t = content.toLowerCase();
  if (t.includes("compaction") || t.includes("compacted")) return { icon: "⟳", label: "Context compacted", color: "var(--c-orange)" };
  if (t.includes("session startup") || t.includes("startup sequence")) return { icon: "🔄", label: "Session refresh", color: "var(--c-info-soft)" };
  if (t.includes("agents.md") || t.includes("identity verification")) return { icon: "📋", label: "Agent startup", color: "var(--c-purple)" };
  if (t.includes("sender (untrusted")) return { icon: "🏷", label: "Sender metadata", color: "var(--c-slate)" };
  if (t.includes("security") || t.includes("vault")) return { icon: "🔒", label: "Security check", color: "var(--c-warning)" };
  if (t.includes("system:")) return { icon: "⚙", label: "System event", color: "var(--c-slate)" };
  return { icon: "⚙", label: "System", color: "var(--c-slate)" };
}

/** Highlight search matches within plain text */
export function highlightSearchText(text: string, query: string): string | React.ReactNode[] {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      React.createElement("mark", { key: i, style: { background: "rgba(250,204,21,0.4)", color: "inherit", borderRadius: "2px", padding: "0 1px" } }, part)
    ) : React.createElement("span", { key: i }, part)
  );
}
