import { useCallback } from 'react';
export function useMessageListHandlers({ activeSessionId, messages, filteredMessages, actions, setInput, setEditingMsgIndex, setEditingMsgText, setBranchToast, setShowTerminal, setPendingApproval, pendingEditSendRef, inputRef, terminalRef, setLightboxSrc, sendFeedbackToRapidRMS, handleContentExpand, }) {
    const onSelectTemplate = useCallback((prompt) => {
        setInput(prompt);
        inputRef.current?.focus();
    }, [setInput, inputRef]);
    const onFeedback = useCallback((msgIndex, fb) => {
        if (activeSessionId) {
            const msg = filteredMessages[msgIndex];
            const newFeedback = msg.feedback === fb ? null : fb;
            actions.setMessageFeedback(activeSessionId, msgIndex, newFeedback);
            if (newFeedback !== null && msg.role === 'assistant') {
                sendFeedbackToRapidRMS(msgIndex, newFeedback);
            }
        }
    }, [activeSessionId, filteredMessages, actions, sendFeedbackToRapidRMS]);
    const onEditStart = useCallback((msgIndex, content) => {
        setEditingMsgIndex(msgIndex);
        setEditingMsgText(content);
        setInput(content);
        setTimeout(() => {
            const ta = document.getElementById('shre-chat-textarea');
            if (ta) {
                ta.focus();
                ta.setSelectionRange(content.length, content.length);
            }
        }, 50);
    }, [setEditingMsgIndex, setEditingMsgText, setInput]);
    const onEditChange = useCallback((text) => setEditingMsgText(text), [setEditingMsgText]);
    const onEditCancel = useCallback(() => {
        setEditingMsgIndex(null);
        setEditingMsgText('');
    }, [setEditingMsgIndex, setEditingMsgText]);
    const onEdit = useCallback((msgIndex, newText) => {
        if (!activeSessionId)
            return;
        const truncated = messages.slice(0, msgIndex);
        actions.replaceSessionMessages(activeSessionId, truncated);
        setEditingMsgIndex(null);
        setEditingMsgText('');
        setInput(newText);
        pendingEditSendRef.current = true;
    }, [
        activeSessionId,
        messages,
        actions,
        setEditingMsgIndex,
        setEditingMsgText,
        setInput,
        pendingEditSendRef,
    ]);
    const onRegenerate = useCallback((_msgIndex) => {
        if (!activeSessionId)
            return;
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        if (!lastUserMsg)
            return;
        const truncated = messages.slice(0, messages.length - 1);
        actions.replaceSessionMessages(activeSessionId, truncated);
        setInput(lastUserMsg.content);
        pendingEditSendRef.current = true;
    }, [activeSessionId, messages, actions, setInput, pendingEditSendRef]);
    const onAnnotate = useCallback((msgIndex, text) => {
        if (activeSessionId)
            actions.setAnnotation(activeSessionId, msgIndex, text);
    }, [activeSessionId, actions]);
    const onBranch = useCallback((msgIndex) => {
        if (!activeSessionId)
            return;
        const newId = actions.branchFrom(activeSessionId, msgIndex);
        if (newId) {
            setBranchToast(true);
            setTimeout(() => setBranchToast(false), 2000);
        }
    }, [activeSessionId, actions, setBranchToast]);
    const onReaction = useCallback((msgIndex, emoji) => {
        if (activeSessionId)
            actions.toggleReaction(activeSessionId, msgIndex, emoji);
    }, [activeSessionId, actions]);
    const onReply = useCallback((msgIndex) => {
        actions.setReplyTo(msgIndex);
        inputRef.current?.focus();
    }, [actions, inputRef]);
    const onRetry = useCallback((msgIndex) => {
        if (!activeSessionId)
            return;
        const lastUserMsg = [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === 'user');
        if (!lastUserMsg)
            return;
        const truncated = messages.slice(0, msgIndex);
        actions.replaceSessionMessages(activeSessionId, truncated);
        setInput(lastUserMsg.content);
        pendingEditSendRef.current = true;
    }, [activeSessionId, messages, actions, setInput, pendingEditSendRef]);
    const onRunCommand = useCallback((cmd) => {
        setShowTerminal(true);
        setTimeout(() => terminalRef.current?.sendCommand(cmd), 300);
    }, [setShowTerminal, terminalRef]);
    const onApprove = useCallback((approvalId) => {
        fetch('/api/router/v1/chat/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalId, approved: true }),
        }).catch(() => { });
        setPendingApproval(null);
        actions.setStatusLine('Approved \u2014 executing...');
    }, [setPendingApproval, actions]);
    const onDeny = useCallback((approvalId) => {
        fetch('/api/router/v1/chat/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalId, approved: false }),
        }).catch(() => { });
        setPendingApproval(null);
        actions.setStatusLine('Denied \u2014 operation cancelled');
    }, [setPendingApproval, actions]);
    return {
        onImageClick: setLightboxSrc,
        onSelectTemplate,
        onFeedback,
        onEditStart,
        onEditChange,
        onEditCancel,
        onEdit,
        onRegenerate,
        onAnnotate,
        onBranch,
        onReaction,
        onReply,
        onRetry,
        onRunCommand,
        onContentExpand: handleContentExpand,
        onApprove,
        onDeny,
    };
}
