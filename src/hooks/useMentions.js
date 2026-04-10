import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
/**
 * Detects `@@agentname` patterns in the input and provides
 * an autocomplete dropdown for agent selection.
 */
export function useMentions(params) {
    const { input, setInput, agents, inputRef } = params;
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionAgent, setMentionAgent] = useState(null);
    const mentionRef = useRef(null);
    // Detect @@ pattern anywhere in input
    const mentionQuery = useMemo(() => {
        // Find last @@ that isn't preceded by another @
        const match = input.match(/(?:^|[^@])@@(\w*)$/);
        return match ? match[1].toLowerCase() : null;
    }, [input]);
    const mentionFiltered = useMemo(() => {
        if (mentionQuery === null)
            return [];
        if (mentionQuery === '')
            return agents.slice(0, 15);
        return agents.filter((a) => a.name.toLowerCase().includes(mentionQuery) || a.id.toLowerCase().includes(mentionQuery));
    }, [mentionQuery, agents]);
    useEffect(() => {
        if (mentionQuery !== null && mentionFiltered.length > 0) {
            setMentionOpen(true);
            setMentionIndex(0);
        }
        else {
            setMentionOpen(false);
        }
    }, [mentionQuery, mentionFiltered.length]);
    // Scroll active item into view
    useEffect(() => {
        if (mentionOpen && mentionRef.current) {
            const active = mentionRef.current.querySelector("[data-mention-active='true']");
            if (active)
                active.scrollIntoView({ block: 'nearest' });
        }
    }, [mentionIndex, mentionOpen]);
    const onMentionSelect = useCallback((agent) => {
        // Replace the @@query with @@agentname in the input
        const newInput = input.replace(/@@\w*$/, `@@${agent.name} `);
        setInput(newInput);
        setMentionAgent(agent);
        setMentionOpen(false);
        inputRef.current?.focus();
    }, [input, setInput, inputRef]);
    const clearMention = useCallback(() => {
        setMentionAgent(null);
    }, []);
    const extractMention = useCallback((text) => {
        // Match @@AgentName at any position
        const match = text.match(/@@(\w+)/);
        if (!match)
            return { cleanText: text, agentId: mentionAgent?.id ?? null };
        const mentionName = match[1].toLowerCase();
        const agent = agents.find((a) => a.name.toLowerCase() === mentionName || a.id.toLowerCase() === mentionName);
        // Remove the @@mention from visible text
        const cleanText = text.replace(/@@\w+\s*/, '').trim();
        return {
            cleanText,
            agentId: agent?.id ?? mentionAgent?.id ?? null,
        };
    }, [agents, mentionAgent]);
    return {
        mentionOpen,
        setMentionOpen,
        mentionIndex,
        setMentionIndex,
        mentionRef: mentionRef,
        mentionFiltered,
        mentionAgent,
        clearMention,
        onMentionSelect,
        extractMention,
    };
}
