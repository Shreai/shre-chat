import { useCallback } from 'react';
export function useChatKeydown(params) {
    const { slashOpen, slashFiltered, slashIndex, setSlashIndex, setSlashOpen, executeSlashCommand, mentionOpen, mentionFiltered, mentionIndex, setMentionIndex, setMentionOpen, onMentionSelect, editingQueueId, setEditingQueueId, setEditingQueueText, editingMsgIndex, setEditingMsgIndex, setEditingMsgText, input, setInput, setQueue, messages, activeSessionId, replaceSessionMessages, handleSend, sentHistoryRef, sentHistoryIdxRef, HISTORY_KEY, } = params;
    const handleKeyDown = useCallback((e) => {
        // Slash command dropdown navigation
        if (slashOpen && slashFiltered.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashIndex((prev) => (prev - 1 + slashFiltered.length) % slashFiltered.length);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashIndex((prev) => (prev + 1) % slashFiltered.length);
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const selected = slashFiltered[slashIndex];
                if (selected) {
                    const hasArg = selected.usage.includes('<');
                    setInput('/' + selected.name + (hasArg ? ' ' : ''));
                }
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const selected = slashFiltered[slashIndex];
                if (selected) {
                    const hasArg = selected.usage.includes('<');
                    if (hasArg && !input.includes(' ')) {
                        setInput('/' + selected.name + ' ');
                    }
                    else {
                        executeSlashCommand(input.slice(1));
                    }
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSlashOpen(false);
                return;
            }
        }
        // @@ Mention dropdown navigation
        if (mentionOpen && mentionFiltered.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((prev) => (prev - 1 + mentionFiltered.length) % mentionFiltered.length);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((prev) => (prev + 1) % mentionFiltered.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const selected = mentionFiltered[mentionIndex];
                if (selected)
                    onMentionSelect(selected);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionOpen(false);
                return;
            }
        }
        // Escape cancels edit mode (queue or message)
        if (e.key === 'Escape' && editingQueueId !== null) {
            e.preventDefault();
            setEditingQueueId(null);
            setEditingQueueText('');
            setInput('');
            return;
        }
        if (e.key === 'Escape' && editingMsgIndex !== null) {
            e.preventDefault();
            setEditingMsgIndex(null);
            setEditingMsgText('');
            setInput('');
            return;
        }
        // Tab -> focus send button (when no dropdown is open)
        if (e.key === 'Tab' && !e.shiftKey) {
            const sendBtn = document.querySelector('[data-send-btn]');
            if (sendBtn) {
                e.preventDefault();
                sendBtn.focus();
                return;
            }
        }
        // Enter sends message, Shift+Enter inserts newline
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingQueueId !== null) {
                const newText = input.trim();
                if (newText) {
                    setQueue((prev) => prev.map((q) => (q.id === editingQueueId ? { ...q, text: newText } : q)));
                }
                setEditingQueueId(null);
                setEditingQueueText('');
                setInput('');
                return;
            }
            // If editing a message, truncate history and resend
            if (editingMsgIndex !== null && activeSessionId && input.trim()) {
                const truncated = messages.slice(0, editingMsgIndex);
                replaceSessionMessages(activeSessionId, truncated);
                setEditingMsgIndex(null);
                setEditingMsgText('');
            }
            if (input.trim()) {
                const hist = sentHistoryRef.current;
                if (hist[hist.length - 1] !== input.trim()) {
                    hist.push(input.trim());
                    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
                }
                sentHistoryIdxRef.current = hist.length;
            }
            handleSend();
        }
        else if (e.key === 'ArrowUp') {
            const hist = sentHistoryRef.current;
            if (hist.length === 0)
                return;
            e.preventDefault();
            const cur = Math.min(sentHistoryIdxRef.current, hist.length);
            const idx = cur - 1;
            if (idx >= 0) {
                sentHistoryIdxRef.current = idx;
                setInput(hist[idx]);
            }
        }
        else if (e.key === 'ArrowDown') {
            const hist = sentHistoryRef.current;
            if (hist.length === 0)
                return;
            const cur = sentHistoryIdxRef.current;
            if (cur < 0 || cur >= hist.length)
                return;
            e.preventDefault();
            const idx = cur + 1;
            if (idx < hist.length) {
                sentHistoryIdxRef.current = idx;
                setInput(hist[idx]);
            }
            else {
                sentHistoryIdxRef.current = hist.length;
                setInput('');
            }
        }
    }, [
        slashOpen,
        slashFiltered,
        slashIndex,
        setSlashIndex,
        setSlashOpen,
        executeSlashCommand,
        mentionOpen,
        mentionFiltered,
        mentionIndex,
        setMentionIndex,
        setMentionOpen,
        onMentionSelect,
        editingQueueId,
        setEditingQueueId,
        setEditingQueueText,
        editingMsgIndex,
        setEditingMsgIndex,
        setEditingMsgText,
        input,
        setInput,
        setQueue,
        messages,
        activeSessionId,
        replaceSessionMessages,
        handleSend,
        sentHistoryRef,
        sentHistoryIdxRef,
        HISTORY_KEY,
    ]);
    return handleKeyDown;
}
