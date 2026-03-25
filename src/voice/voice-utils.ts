/**
 * Voice utility functions — pure helpers for voice processing.
 * Extracted from VoiceAssistant.tsx.
 */

export interface AgentOption { id: string; name: string; emoji: string; }
export interface Turn { role: "user" | "assistant"; text: string; mib007Link?: string; }
export interface VoiceShortcut { id: string; pattern: string; intent: string; hit_count: number; lastUsed: number; }

/** Strip markdown for TTS — converts tables to spoken form, removes formatting */
export function stripMd(t: string): string {
  let s = t.replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking>[\s\S]*$/gi, "")
    .replace(/<\/?think(?:ing)?>/gi, "")
    .replace(/<thinking_mode>[\s\S]*?<\/thinking_mode>/gi, "")
    .replace(/<reasoning_effort>[\s\S]*?<\/reasoning_effort>/gi, "");
  // Convert markdown tables to spoken-friendly form
  s = s.replace(/(?:^\|.+\|\s*\n\|[-:\s|]+\|\s*\n)((?:^\|.+\|\s*\n?)+)/gm, (block) => {
    const rows = block.trim().split("\n").filter(r => r.includes("|") && !/^[\s|:-]+$/.test(r));
    if (rows.length === 0) return block;
    const headerCells = rows[0].split("|").map(c => c.trim()).filter(Boolean);
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) return block;
    const spoken = dataRows.slice(0, 5).map(row => {
      const cells = row.split("|").map(c => c.trim()).filter(Boolean);
      return cells.map((c, i) => headerCells[i] ? `${headerCells[i]}: ${c}` : c).join(", ");
    }).join(". ");
    const extra = dataRows.length > 5 ? `. And ${dataRows.length - 5} more rows.` : "";
    return spoken + extra + " ";
  });
  return s.replace(/```[\s\S]*?```/g, " code block omitted ").replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/#{1,6}\s+/g, "").replace(/[*_~]{1,3}/g, "").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").trim().slice(0, 4096);
}

export function detectCmd(text: string): "summarize" | "read_last" | "goodbye" | null {
  const l = text.toLowerCase().trim();
  if (/\b(summarize|summary|summarise)\b/.test(l)) return "summarize";
  if (/\b(read last|read the last|last message)\b/.test(l)) return "read_last";
  if (/\b(goodbye|good bye|bye bye|bye|exit|close|stop talking|thanks|thank you|that's all|thats all|i'm done|im done|see you|later|good night|goodnight)\b/.test(l)) return "goodbye";
  return null;
}

export function detectAgentSwitch(text: string, agents?: AgentOption[]): string | null {
  if (!agents?.length) return null;
  const l = text.toLowerCase().trim();
  const m = l.match(/\b(?:switch to|talk to|connect me to|let me talk to|get me|bring|put on)\s+(.+?)(?:\s+please)?$/i);
  if (!m) return null;
  const target = m[1].toLowerCase();
  return agents.find((a) => a.name.toLowerCase() === target || a.id.toLowerCase() === target)?.id || null;
}
