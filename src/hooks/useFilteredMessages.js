/**
 * useFilteredMessages — filters out system/internal messages, injects task badges,
 * provides virtualizer and message-to-run matching.
 */
import { useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePreferences } from '../preferences-store';
// System event patterns filtered in focus mode
const SYSTEM_EVENT_PATTERNS = [
    /^\[project_progress:/,
    /^\[ellie\.escalation\]/,
    /^\[escalation\./,
    /^\[budget_/,
    /^\[file_diff\]/,
    /^\[project_fallback\]/,
    /^\[approval\./,
    /^\[browser_approval\]/,
    /^\[browser_approved\]/,
    /^\[browser_denied\]/,
    /^\[project_pending\]/,
    /^\[cron\b/,
    /^\[scheduled\b/,
    /^\[auto[-_]?task\b/,
];
export function useFilteredMessages({ messages, latestTask, runs, scrollRef, }) {
    const focusMode = usePreferences((s) => s.focusMode);
    // Last assistant message content — for SuggestionsBar pattern detection
    const lastAssistantMessage = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant' && messages[i].content.trim())
                return messages[i].content;
        }
        return '';
    }, [messages]);
    const filteredMessages = useMemo(() => messages
        .filter((msg) => {
        if (msg.role !== 'user' && !msg.content.trim())
            return false;
        const t = msg.content.trim();
        if (t.includes('suggest 3 brief follow-up questions') ||
            t.includes('suggest 3 brief followup'))
            return false;
        if (/^\s*\[\s*"/.test(t) && /"\s*\]\s*$/.test(t))
            return false;
        if (t.includes('MEMORY CHECKPOINT') || t.includes('MEMORY_CHECKPOINT'))
            return false;
        if (t.startsWith('subagent task') ||
            t.startsWith('[subagent]') ||
            t.startsWith('Subagent result:'))
            return false;
        if (t.includes('Post-compaction context refresh') ||
            t.includes('Session Startup') ||
            t.includes('Session was just compacted'))
            return false;
        if (t.startsWith('System:') || t.startsWith('[System]'))
            return false;
        if (t.includes('AGENTS.md') || t.includes('Sender (untrusted metadata)'))
            return false;
        if (t.includes('identity verification') && t.length > 200)
            return false;
        if (t.includes('You are an AI assistant') && t.includes('session') && t.length > 800)
            return false;
        // Focus mode: hide system/cron/automated event messages
        if (focusMode) {
            if (msg.meta?.system === 'true' || msg.meta?.type === 'tool_exec')
                return false;
            if (SYSTEM_EVENT_PATTERNS.some((p) => p.test(t)))
                return false;
        }
        return true;
    })
        .map((msg) => {
        if (msg.role !== 'user' && msg.content.startsWith('[[reply_to_current]]')) {
            return { ...msg, content: msg.content.replace(/^\[\[reply_to_current\]\]\s*/, '') };
        }
        return msg;
    })
        .map((msg, i, arr) => {
        if (latestTask && msg.role === 'assistant' && i === arr.length - 1) {
            return {
                ...msg,
                meta: { ...msg.meta, taskId: latestTask.id, taskStatus: latestTask.status },
            };
        }
        return msg;
    }), [messages, latestTask, focusMode]);
    // Match process runs to assistant messages by timestamp proximity
    const getRunForMessage = useCallback((msg, _msgIndex) => {
        if (msg.role === 'user' || !msg.timestamp)
            return null;
        let best = null;
        let bestDiff = Infinity;
        for (const run of runs) {
            const diff = msg.timestamp - run.startedAt;
            if (diff >= 0 && diff < 300_000 && diff < bestDiff) {
                best = run;
                bestDiff = diff;
            }
        }
        return best;
    }, [runs]);
    // Virtualize at 30+ messages to avoid DOM bloat
    const useVirtual = filteredMessages.length > 30;
    const virtualizer = useVirtualizer({
        count: useVirtual ? filteredMessages.length : 0,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 200,
        overscan: 15,
        enabled: useVirtual,
    });
    return { filteredMessages, lastAssistantMessage, getRunForMessage, useVirtual, virtualizer };
}
