import { useCallback } from 'react';
import type { ChatMessage } from '../router-client';

interface UseMessageListHandlersOptions {
  activeSessionId: string | null;
  activeAgentId?: string;
  messages: ChatMessage[];
  filteredMessages: ChatMessage[];
  actions: {
    setMessageFeedback: (
      sessionId: string,
      msgIndex: number,
      feedback: 'like' | 'dislike' | null,
    ) => void;
    replaceSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
    setAnnotation: (sessionId: string, msgIndex: number, text: string) => void;
    branchFrom: (sessionId: string, msgIndex: number) => string | null;
    toggleReaction: (sessionId: string, msgIndex: number, emoji: string) => void;
    setReplyTo: (index: number | null) => void;
    setStatusLine: (msg: string | null) => void;
  };
  setInput: (val: string) => void;
  setEditingMsgIndex: (val: number | null) => void;
  setEditingMsgText: (val: string) => void;
  setBranchToast: (val: boolean) => void;
  setShowTerminal: (val: boolean) => void;
  setPendingApproval: (
    val: {
      approvalId: string;
      tool: string;
      input: Record<string, unknown>;
      reason: string;
    } | null,
  ) => void;
  setSelectedMsgIndex?: (val: number | null) => void;
  virtualizer?: {
    scrollToIndex: (
      idx: number,
      opts?: ScrollIntoViewOptions & { align?: 'start' | 'center' | 'end' | 'auto' },
    ) => void;
  };
  pendingEditSendRef: React.MutableRefObject<boolean>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  terminalRef: React.RefObject<{ sendCommand: (cmd: string) => void }>;
  setLightboxSrc: (src: string | null) => void;
  sendFeedbackToRapidRMS: (msgIndex: number, feedback: 'like' | 'dislike') => void;
  handleContentExpand: (content: string, type: string, title?: string) => void;
}

export function useMessageListHandlers({
  activeSessionId,
  messages,
  filteredMessages,
  actions,
  setInput,
  setEditingMsgIndex,
  setEditingMsgText,
  setBranchToast,
  setShowTerminal,
  setPendingApproval,
  pendingEditSendRef,
  inputRef,
  terminalRef,
  setLightboxSrc,
  sendFeedbackToRapidRMS,
  handleContentExpand,
}: any) {
  const onSelectTemplate = useCallback(
    (prompt: string) => {
      setInput(prompt);
      inputRef.current?.focus();
    },
    [setInput, inputRef],
  );

  const onFeedback = useCallback(
    (msgIndex: number, fb: 'like' | 'dislike') => {
      if (activeSessionId) {
        const msg = filteredMessages[msgIndex];
        const newFeedback: 'like' | 'dislike' | null = msg.feedback === fb ? null : fb;
        actions.setMessageFeedback(activeSessionId, msgIndex, newFeedback);
        if (newFeedback !== null && msg.role === 'assistant') {
          sendFeedbackToRapidRMS(msgIndex, newFeedback);
        }
      }
    },
    [activeSessionId, filteredMessages, actions, sendFeedbackToRapidRMS],
  );

  const onEditStart = useCallback(
    (msgIndex: number, content: string) => {
      setEditingMsgIndex(msgIndex);
      setEditingMsgText(content);
      setInput(content);
      setTimeout(() => {
        const ta = document.getElementById('shre-chat-textarea');
        if (ta) {
          ta.focus();
          (ta as HTMLTextAreaElement).setSelectionRange(content.length, content.length);
        }
      }, 50);
    },
    [setEditingMsgIndex, setEditingMsgText, setInput],
  );

  const onEditChange = useCallback((text: string) => setEditingMsgText(text), [setEditingMsgText]);

  const onEditCancel = useCallback(() => {
    setEditingMsgIndex(null);
    setEditingMsgText('');
  }, [setEditingMsgIndex, setEditingMsgText]);

  const onEdit = useCallback(
    (msgIndex: number, newText: string) => {
      if (!activeSessionId) return;
      const truncated = messages.slice(0, msgIndex);
      actions.replaceSessionMessages(activeSessionId, truncated);
      setEditingMsgIndex(null);
      setEditingMsgText('');
      setInput(newText);
      pendingEditSendRef.current = true;
    },
    [
      activeSessionId,
      messages,
      actions,
      setEditingMsgIndex,
      setEditingMsgText,
      setInput,
      pendingEditSendRef,
    ],
  );

  const onRegenerate = useCallback(
    (_msgIndex: number) => {
      if (!activeSessionId) return;
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastUserMsg) return;
      const truncated = messages.slice(0, messages.length - 1);
      actions.replaceSessionMessages(activeSessionId, truncated);
      setInput(lastUserMsg.content);
      pendingEditSendRef.current = true;
    },
    [activeSessionId, messages, actions, setInput, pendingEditSendRef],
  );

  const onAnnotate = useCallback(
    (msgIndex: number, text: string) => {
      if (activeSessionId) actions.setAnnotation(activeSessionId, msgIndex, text);
    },
    [activeSessionId, actions],
  );

  const onBranch = useCallback(
    (msgIndex: number) => {
      if (!activeSessionId) return;
      const newId = actions.branchFrom(activeSessionId, msgIndex);
      if (newId) {
        setBranchToast(true);
        setTimeout(() => setBranchToast(false), 2000);
      }
    },
    [activeSessionId, actions, setBranchToast],
  );

  const onReaction = useCallback(
    (msgIndex: number, emoji: string) => {
      if (activeSessionId) actions.toggleReaction(activeSessionId, msgIndex, emoji);
    },
    [activeSessionId, actions],
  );

  const onReply = useCallback(
    (msgIndex: number) => {
      actions.setReplyTo(msgIndex);
      inputRef.current?.focus();
    },
    [actions, inputRef],
  );

  const onRetry = useCallback(
    (msgIndex: number) => {
      if (!activeSessionId) return;
      const lastUserMsg = [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === 'user');
      if (!lastUserMsg) return;
      const truncated = messages.slice(0, msgIndex);
      actions.replaceSessionMessages(activeSessionId, truncated);
      setInput(lastUserMsg.content);
      pendingEditSendRef.current = true;
    },
    [activeSessionId, messages, actions, setInput, pendingEditSendRef],
  );

  const onRunCommand = useCallback(
    (cmd: string) => {
      setShowTerminal(true);
      setTimeout(() => terminalRef.current?.sendCommand(cmd), 300);
    },
    [setShowTerminal, terminalRef],
  );

  const onApprove = useCallback(
    (approvalId: string) => {
      fetch('/api/router/v1/chat/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, approved: true }),
      }).catch(() => {});
      setPendingApproval(null);
      actions.setStatusLine('Approved \u2014 executing...');
    },
    [setPendingApproval, actions],
  );

  const onDeny = useCallback(
    (approvalId: string) => {
      fetch('/api/router/v1/chat/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, approved: false }),
      }).catch(() => {});
      setPendingApproval(null);
      actions.setStatusLine('Denied \u2014 operation cancelled');
    },
    [setPendingApproval, actions],
  );

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
