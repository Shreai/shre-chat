import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { parseComposerToken } from '../lib/composer-grammar';

export interface ToolMentionItem {
  name: string;
  description: string;
  category: 'system' | 'app';
}

export interface UseToolMentionsParams {
  input: string;
  setInput: (val: string) => void;
  tools: ToolMentionItem[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Arm a tool for the next request (added to selectedTools) */
  armTool: (toolName: string) => void;
}

export interface UseToolMentionsReturn {
  toolOpen: boolean;
  setToolOpen: (v: boolean) => void;
  toolIndex: number;
  setToolIndex: (v: number | ((prev: number) => number)) => void;
  toolRef: React.RefObject<HTMLDivElement>;
  toolFiltered: ToolMentionItem[];
  onToolSelect: (tool: ToolMentionItem) => void;
}

/**
 * Detects `#tool` tokens in the composer (via the shared composer grammar) and
 * provides an autocomplete dropdown. Selecting a tool ARMS it for the next
 * message (reusing the existing selectedTools plumbing) and strips the `#token`
 * from the visible input — so the message text stays clean.
 */
export function useToolMentions(params: UseToolMentionsParams): UseToolMentionsReturn {
  const { input, setInput, tools, inputRef, armTool } = params;

  const [toolOpen, setToolOpen] = useState(false);
  const [toolIndex, setToolIndex] = useState(0);
  const toolRef = useRef<HTMLDivElement>(null);

  const toolQuery = useMemo(() => {
    const token = parseComposerToken(input);
    return token.kind === 'tool' ? token.query : null;
  }, [input]);

  const toolFiltered = useMemo(() => {
    if (toolQuery === null) return [];
    if (toolQuery === '') return tools.slice(0, 20);
    return tools
      .filter(
        (t) =>
          t.name.toLowerCase().includes(toolQuery) ||
          t.description.toLowerCase().includes(toolQuery),
      )
      .slice(0, 20);
  }, [toolQuery, tools]);

  useEffect(() => {
    if (toolQuery !== null && toolFiltered.length > 0) {
      setToolOpen(true);
      setToolIndex(0);
    } else {
      setToolOpen(false);
    }
  }, [toolQuery, toolFiltered.length]);

  useEffect(() => {
    if (toolOpen && toolRef.current) {
      const active = toolRef.current.querySelector("[data-tool-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [toolIndex, toolOpen]);

  const onToolSelect = useCallback(
    (tool: ToolMentionItem) => {
      // Strip the partial "#query" the user was typing, then arm the tool.
      const stripped = input.replace(/#[\w-]*$/, '').replace(/\s+$/, '');
      setInput(stripped ? stripped + ' ' : '');
      armTool(tool.name);
      setToolOpen(false);
      inputRef.current?.focus();
    },
    [input, setInput, armTool, inputRef],
  );

  return {
    toolOpen,
    setToolOpen,
    toolIndex,
    setToolIndex,
    toolRef: toolRef as React.RefObject<HTMLDivElement>,
    toolFiltered,
    onToolSelect,
  };
}
