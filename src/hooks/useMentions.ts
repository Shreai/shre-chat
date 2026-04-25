import { useState, useRef, useMemo, useEffect, useCallback } from 'react';

export interface MentionItem {
  id: string;
  name: string;
  emoji: string;
  group: string;
}

export interface UseMentionsParams {
  input: string;
  setInput: (val: string) => void;
  agents: MentionItem[];
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export interface UseMentionsReturn {
  mentionOpen: boolean;
  setMentionOpen: (v: boolean) => void;
  mentionIndex: number;
  setMentionIndex: (v: number | ((prev: number) => number)) => void;
  mentionRef: React.RefObject<HTMLDivElement>;
  mentionFiltered: MentionItem[];
  mentionAgent: MentionItem | null;
  clearMention: () => void;
  onMentionSelect: (agent: MentionItem) => void;
  /** Extract mention from text and return cleaned text + agentId */
  extractMention: (text: string) => { cleanText: string; agentId: string | null };
}

/**
 * Detects `@@agentname` patterns in the input and provides
 * an autocomplete dropdown for agent selection.
 */
export function useMentions(params: UseMentionsParams): UseMentionsReturn {
  const { input, setInput, agents, inputRef } = params;

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionAgent, setMentionAgent] = useState<MentionItem | null>(null);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Detect @@ pattern anywhere in input
  const mentionQuery = useMemo(() => {
    // Find last @@ that isn't preceded by another @
    const match = input.match(/(?:^|[^@])@@(\w*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [input]);

  const mentionFiltered = useMemo(() => {
    if (mentionQuery === null) return [];
    if (mentionQuery === '') return agents.slice(0, 15);
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(mentionQuery) || a.id.toLowerCase().includes(mentionQuery),
    );
  }, [mentionQuery, agents]);

  useEffect(() => {
    if (mentionQuery !== null && mentionFiltered.length > 0) {
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  }, [mentionQuery, mentionFiltered.length]);

  // Scroll active item into view
  useEffect(() => {
    if (mentionOpen && mentionRef.current) {
      const active = mentionRef.current.querySelector("[data-mention-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [mentionIndex, mentionOpen]);

  const onMentionSelect = useCallback(
    (agent: MentionItem) => {
      // Replace the @@query with @@agentname in the input
      const newInput = input.replace(/@@\w*$/, `@@${agent.name} `);
      setInput(newInput);
      setMentionAgent(agent);
      setMentionOpen(false);
      inputRef.current?.focus();
    },
    [input, setInput, inputRef],
  );

  const clearMention = useCallback(() => {
    setMentionAgent(null);
  }, []);

  const extractMention = useCallback(
    (text: string): { cleanText: string; agentId: string | null } => {
      // Match @@AgentName at any position
      const match = text.match(/@@(\w+)/);
      if (!match) return { cleanText: text, agentId: mentionAgent?.id ?? null };

      const mentionName = match[1].toLowerCase();
      const agent = agents.find(
        (a) => a.name.toLowerCase() === mentionName || a.id.toLowerCase() === mentionName,
      );

      // Remove the @@mention from visible text
      const cleanText = text.replace(/@@\w+\s*/, '').trim();
      return {
        cleanText,
        agentId: agent?.id ?? mentionAgent?.id ?? null,
      };
    },
    [agents, mentionAgent],
  );

  return {
    mentionOpen,
    setMentionOpen,
    mentionIndex,
    setMentionIndex,
    mentionRef: mentionRef as React.RefObject<HTMLDivElement>,
    mentionFiltered,
    mentionAgent,
    clearMention,
    onMentionSelect,
    extractMention,
  };
}
