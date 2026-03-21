import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import type { ChatMessage } from "../openclaw";
import type { Session } from "../store";
import { formatTime, copyToClipboard } from "../chat-utils";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  hasArg?: boolean;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

export interface UseSlashCommandsParams {
  input: string;
  setInput: (val: string) => void;
  activeSessionId: string | null;
  activeAgentId: string;
  activeSession: Session | undefined;
  messages: ChatMessage[];
  actions: {
    setStatusLine: (s: string | null) => void;
    replaceSessionMessages: (id: string, msgs: ChatMessage[]) => void;
    addFeed: (sessionId: string, type: string, text: string, meta?: Record<string, string>) => void;
    addMessage: (sessionId: string, msg: ChatMessage) => void;
    toggleCompact: () => void;
    setSystemPrompt: (sessionId: string, prompt: string) => void;
    newSession: () => string;
    switchSession: (id: string) => void;
  };
  stateCompact: boolean;
  cliMode: boolean;
  setCliMode: (v: boolean) => void;
  setCliContinue: (v: boolean) => void;
  ensureSession: () => string;
  AVAILABLE_MODELS: AvailableModel[];
  setSelectedModel: (m: string | null) => void;
  setModelOverride: (agentId: string, modelId: string | null) => void;
}

export interface UseSlashCommandsReturn {
  SLASH_COMMANDS: SlashCommand[];
  slashOpen: boolean;
  setSlashOpen: (v: boolean) => void;
  slashIndex: number;
  setSlashIndex: (v: number | ((prev: number) => number)) => void;
  slashRef: React.RefObject<HTMLDivElement>;
  slashFiltered: SlashCommand[];
  executeSlashCommand: (commandStr: string) => void;
}

export function useSlashCommands(params: UseSlashCommandsParams): UseSlashCommandsReturn {
  const {
    input, setInput, activeSessionId, activeAgentId, activeSession, messages,
    actions, stateCompact, cliMode, setCliMode, setCliContinue,
    ensureSession, AVAILABLE_MODELS, setSelectedModel, setModelOverride,
  } = params;

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef<HTMLDivElement>(null);

  const SLASH_COMMANDS = useMemo<SlashCommand[]>(() => [
    { name: "clear", description: "Clear current session messages", usage: "/clear" },
    { name: "model", description: "Switch model", usage: "/model <name>", hasArg: true },
    { name: "export", description: "Export conversation to clipboard", usage: "/export" },
    { name: "new", description: "Create a new session", usage: "/new" },
    { name: "compact", description: "Toggle compact message display", usage: "/compact" },
    { name: "help", description: "Show all available commands", usage: "/help" },
    { name: "system", description: "Set session system prompt", usage: "/system <prompt>", hasArg: true },
    { name: "cli", description: "Toggle Claude CLI mode (uses subscription)", usage: "/cli" },
    { name: "execute", description: "Run a task with orchestrator-executor (cloud plans, local executes)", usage: "/execute <task>", hasArg: true },
    { name: "run", description: "Execute a shell command directly on the host", usage: "/run <command>", hasArg: true },
  ], []);

  const slashFiltered = useMemo(() => {
    if (!slashOpen) return [];
    const typed = input.slice(1).toLowerCase();
    const cmdPart = typed.split(" ")[0] || "";
    if (typed.includes(" ")) {
      const cmd = SLASH_COMMANDS.find((c) => c.name === cmdPart);
      if (cmd?.name === "model") {
        const modelQuery = typed.slice(cmdPart.length + 1).toLowerCase();
        return AVAILABLE_MODELS
          .filter((m) => m.id.toLowerCase().includes(modelQuery) || m.name.toLowerCase().includes(modelQuery))
          .map((m) => ({ name: `model ${m.id}`, description: `${m.icon} ${m.name} (${m.provider})`, usage: `/model ${m.id}` }));
      }
      if (cmd) return [];
    }
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(cmdPart));
  }, [slashOpen, input, SLASH_COMMANDS, AVAILABLE_MODELS]);

  useEffect(() => {
    if (input.startsWith("/") && !input.startsWith("/ ") && input.length >= 1) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  }, [input]);

  useEffect(() => {
    if (slashOpen && slashRef.current) {
      const active = slashRef.current.querySelector("[data-slash-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [slashIndex, slashOpen]);

  const executeSlashCommand = useCallback((commandStr: string) => {
    const parts = commandStr.trim().split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(" ");

    switch (cmd) {
      case "clear": {
        if (!activeSessionId) {
          actions.setStatusLine("No active session to clear");
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        if (confirm("Clear all messages in this session?")) {
          actions.replaceSessionMessages(activeSessionId, []);
          actions.setStatusLine("Session cleared");
          actions.addFeed(activeSessionId, "system", "Session cleared via /clear");
          setTimeout(() => actions.setStatusLine(null), 2000);
        }
        break;
      }
      case "model": {
        if (!arg) {
          actions.setStatusLine("Usage: /model <model-id>");
          setTimeout(() => actions.setStatusLine(null), 4000);
          break;
        }
        const model = AVAILABLE_MODELS.find(
          (m) => m.id === arg || m.name.toLowerCase() === arg.toLowerCase()
        );
        if (model) {
          setSelectedModel(model.id);
          setModelOverride(activeAgentId, model.id);
          actions.setStatusLine(`Model switched to ${model.icon} ${model.name}`);
          if (activeSessionId) {
            actions.addMessage(activeSessionId, {
              role: "assistant",
              content: `*Model switched to **${model.name}** (${model.provider})*`,
              timestamp: Date.now(),
            });
          }
        } else {
          actions.setStatusLine(`Unknown model: ${arg}`);
        }
        setTimeout(() => actions.setStatusLine(null), 4000);
        break;
      }
      case "export": {
        if (!activeSession || messages.length === 0) {
          actions.setStatusLine("No messages to export");
          setTimeout(() => actions.setStatusLine(null), 2000);
          break;
        }
        const exportText = messages
          .map((m) => `[${m.role.toUpperCase()}] ${formatTime(m.timestamp)}\n${m.content}`)
          .join("\n\n---\n\n");
        const header = `# ${activeSession.title}\nExported: ${new Date().toLocaleString()}\nAgent: ${activeAgentId}\n\n---\n\n`;
        copyToClipboard(header + exportText).then(() => {
          actions.setStatusLine("Conversation copied to clipboard");
          setTimeout(() => actions.setStatusLine(null), 2000);
        });
        break;
      }
      case "new": {
        const id = actions.newSession();
        actions.switchSession(id);
        actions.setStatusLine("New session created");
        setTimeout(() => actions.setStatusLine(null), 2000);
        break;
      }
      case "compact": {
        actions.toggleCompact();
        actions.setStatusLine(`Compact mode ${stateCompact ? "disabled" : "enabled"}`);
        setTimeout(() => actions.setStatusLine(null), 2000);
        break;
      }
      case "help": {
        const helpSessionId = ensureSession();
        const helpText = [
          "**Available Slash Commands:**",
          "",
          "| Command | Description |",
          "|---------|-------------|",
          ...SLASH_COMMANDS.map((c) => `| \`${c.usage}\` | ${c.description} |`),
          "",
          "*Type `/` to see the command menu. Use arrow keys to navigate, Enter to select.*",
        ].join("\n");
        actions.addMessage(helpSessionId, {
          role: "assistant",
          content: helpText,
          timestamp: Date.now(),
        });
        break;
      }
      case "system": {
        if (!arg) {
          actions.setStatusLine("Usage: /system <prompt>");
          setTimeout(() => actions.setStatusLine(null), 4000);
          break;
        }
        const sysSessionId = ensureSession();
        actions.setSystemPrompt(sysSessionId, arg);
        actions.addMessage(sysSessionId, {
          role: "assistant",
          content: `*System prompt updated:*\n> ${arg}`,
          timestamp: Date.now(),
        });
        actions.setStatusLine("System prompt set");
        setTimeout(() => actions.setStatusLine(null), 2000);
        break;
      }
      case "cli": {
        const newCliMode = !cliMode;
        setCliMode(newCliMode);
        setCliContinue(false);
        const cliSessionId = ensureSession();
        actions.addMessage(cliSessionId, {
          role: "assistant",
          content: newCliMode
            ? "*Claude CLI mode **enabled** — messages will be sent via Claude CLI (uses subscription, not API credits). Type /cli again to disable.*"
            : "*Claude CLI mode **disabled** — back to normal API mode.*",
          timestamp: Date.now(),
        });
        actions.setStatusLine(newCliMode ? "CLI mode ON" : "CLI mode OFF");
        setTimeout(() => actions.setStatusLine(null), 2000);
        break;
      }
      case "execute": {
        if (!arg) {
          actions.setStatusLine("Usage: /execute <task description>");
          setTimeout(() => actions.setStatusLine(null), 4000);
          break;
        }
        const execSessionId = ensureSession();
        actions.addMessage(execSessionId, {
          role: "user",
          content: `/execute ${arg}`,
          timestamp: Date.now(),
        });
        actions.setStatusLine("Orchestrating...");

        const routerBase = (import.meta as any).env?.VITE_ROUTER_URL ?? `${window.location.origin}/api/router`;
        fetch(`${routerBase}/v1/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: arg,
            agentId: activeAgentId || "shre",
            stream: false,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              throw new Error(errBody.error || `Execute failed: ${res.status}`);
            }
            return res.json();
          })
          .then((result: any) => {
            const lines: string[] = [];
            lines.push(`**Executor Result** — ${result.status}`);
            lines.push(`Orchestrator: \`${result.orchestratorModel}\` | Executor: \`${result.executorModel}\` | Duration: ${result.totalDurationMs}ms`);
            lines.push("");
            if (result.subtasks?.length > 1) {
              lines.push(`**Subtasks** (${result.subtasks.length}):`);
              for (const st of result.subtasks) {
                lines.push(`- \`${st.id}\`: ${st.description}`);
              }
              lines.push("");
            }
            for (const r of result.results || []) {
              const icon = r.status === "success" ? "+" : r.status === "error" ? "x" : "!";
              lines.push(`**[${icon}] ${r.subtaskId}** (${r.durationMs}ms, ${r.iterations} iteration${r.iterations !== 1 ? "s" : ""})`);
              if (r.toolsUsed?.length) lines.push(`Tools: ${r.toolsUsed.join(", ")}`);
              if (r.output) lines.push(`\n${r.output.slice(0, 2000)}`);
              lines.push("");
            }
            actions.addMessage(execSessionId, {
              role: "assistant",
              content: lines.join("\n"),
              timestamp: Date.now(),
            });
            actions.setStatusLine(null);
          })
          .catch((err: Error) => {
            actions.addMessage(execSessionId, {
              role: "assistant",
              content: `**Execute error:** ${err.message}`,
              timestamp: Date.now(),
            });
            actions.setStatusLine(null);
          });
        break;
      }
      case "run": {
        if (!arg) {
          actions.setStatusLine("Usage: /run <command>");
          setTimeout(() => actions.setStatusLine(null), 4000);
          break;
        }
        const runSessionId = ensureSession();
        actions.addMessage(runSessionId, {
          role: "user",
          content: `/run ${arg}`,
          timestamp: Date.now(),
        });
        actions.setStatusLine("Running...");

        fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: arg }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              throw new Error(errBody.error || `Run failed: ${res.status}`);
            }
            return res.json();
          })
          .then((result: any) => {
            const lines: string[] = [];
            lines.push(`**\`$ ${arg.length > 80 ? arg.slice(0, 77) + "..." : arg}\`** — exit ${result.exitCode}`);
            if (result.stdout) lines.push("```\n" + result.stdout.slice(0, 4000) + "\n```");
            if (result.stderr) lines.push("**stderr:**\n```\n" + result.stderr.slice(0, 2000) + "\n```");
            if (result.truncated) lines.push("_(output truncated)_");
            if (!result.stdout && !result.stderr) lines.push("_(no output)_");
            actions.addMessage(runSessionId, {
              role: "assistant",
              content: lines.join("\n"),
              timestamp: Date.now(),
            });
            actions.setStatusLine(null);
          })
          .catch((err: Error) => {
            actions.addMessage(runSessionId, {
              role: "assistant",
              content: `**Run error:** ${err.message}`,
              timestamp: Date.now(),
            });
            actions.setStatusLine(null);
          });
        break;
      }
      default:
        actions.setStatusLine(`Unknown command: /${cmd}. Type /help for available commands.`);
        setTimeout(() => actions.setStatusLine(null), 3000);
    }
    setInput("");
    setSlashOpen(false);
  }, [activeSessionId, activeAgentId, activeSession, messages, actions, stateCompact, cliMode, SLASH_COMMANDS, ensureSession, AVAILABLE_MODELS, setSelectedModel, setModelOverride, setInput, setCliMode, setCliContinue]);

  return {
    SLASH_COMMANDS,
    slashOpen,
    setSlashOpen,
    slashIndex,
    setSlashIndex,
    slashRef: slashRef as React.RefObject<HTMLDivElement>,
    slashFiltered,
    executeSlashCommand,
  };
}
