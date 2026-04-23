import { useEffect, useCallback } from 'react';
import type { ChatMessage } from '../router-client';
import type { AppActions } from '../store';
import { abortChatWS } from '../gateway-ws';

export interface UseKeyboardShortcutsParams {
  streaming: boolean;
  wsConnected: boolean;
  activeAgentId: string;
  activeSessionId: string | null;
  messages: ChatMessage[];
  filteredMessages: ChatMessage[];
  selectedMsgIndex: number | null;
  setSelectedMsgIndex: React.Dispatch<React.SetStateAction<number | null>>;
  chatSearchOpen: boolean;
  setChatSearchOpen: (v: boolean) => void;
  chatSearchRef: React.RefObject<HTMLInputElement | null>;
  closeChatSearch: () => void;
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (v: boolean) => void;
  globalSearchRef: React.RefObject<HTMLInputElement | null>;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  abortRef: React.MutableRefObject<AbortController | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingEditSendRef: React.MutableRefObject<boolean>;
  setInput: (v: string) => void;
  setEditingMsgIndex: (v: number | null) => void;
  setEditingMsgText: (v: string) => void;
  actions: Pick<AppActions, 'newSession' | 'switchSession' | 'replaceSessionMessages'>;
  virtualizer: { scrollToIndex: (idx: number, opts?: any) => void };
}

export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams) {
  const {
    streaming,
    wsConnected,
    activeAgentId,
    activeSessionId,
    messages,
    filteredMessages,
    selectedMsgIndex,
    setSelectedMsgIndex,
    chatSearchOpen,
    setChatSearchOpen,
    chatSearchRef,
    closeChatSearch,
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchRef,
    shortcutsOpen,
    setShortcutsOpen,
    showModelPicker,
    setShowModelPicker,
    abortRef,
    inputRef,
    pendingEditSendRef,
    setInput,
    setEditingMsgIndex,
    setEditingMsgText,
    actions,
    virtualizer,
  } = params;

  const handleAbort = useCallback(() => {
    if (wsConnected) {
      abortChatWS(activeAgentId, 'main');
    }
    abortRef.current?.abort();
  }, [wsConnected, activeAgentId, abortRef]);

  // Handle programatic abort from voice barge-in
  useEffect(() => {
    const stopHandler = () => handleAbort();
    window.addEventListener('shre-stop-generation', stopHandler);
    return () => window.removeEventListener('shre-stop-generation', stopHandler);
  }, [handleAbort]);

  // Global keyboard shortcuts: Escape=abort, Cmd/Ctrl+K=new chat, Cmd/Ctrl+/=toggle model picker, etc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape to cancel streaming
      if (e.key === 'Escape' && streaming) {
        e.preventDefault();
        handleAbort();
        return;
      }

      // Cmd/Ctrl+K for new chat
      if (mod && e.key === 'k') {
        e.preventDefault();
        const id = actions.newSession();
        actions.switchSession(id);
        return;
      }

      // Cmd/Ctrl+/ to toggle model picker
      if (mod && e.key === '/') {
        e.preventDefault();
        setShowModelPicker((prev: boolean) => !prev);
      }

      // Cmd/Ctrl+F for in-chat search
      if (mod && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setChatSearchOpen(true);
        setTimeout(() => chatSearchRef.current?.focus(), 50);
        return;
      }

      // Cmd/Ctrl+Shift+F for cross-session search
      if (mod && e.key === 'f' && e.shiftKey) {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setTimeout(() => globalSearchRef.current?.focus(), 50);
        return;
      }

      // Cmd/Ctrl+? for keyboard shortcuts overlay
      if (mod && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
        return;
      }

      // Escape to close chat search (when not streaming)
      if (e.key === 'Escape' && chatSearchOpen && !streaming) {
        e.preventDefault();
        closeChatSearch();
        return;
      }

      // Escape to close shortcuts or global search
      if (e.key === 'Escape' && shortcutsOpen) {
        e.preventDefault();
        setShortcutsOpen(false);
        return;
      }
      if (e.key === 'Escape' && globalSearchOpen) {
        e.preventDefault();
        setGlobalSearchOpen(false);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    streaming,
    handleAbort,
    actions,
    showModelPicker,
    chatSearchOpen,
    closeChatSearch,
    shortcutsOpen,
    globalSearchOpen,
    setChatSearchOpen,
    chatSearchRef,
    setGlobalSearchOpen,
    globalSearchRef,
    setShortcutsOpen,
    setShowModelPicker,
  ]);

  // Message keyboard navigation (when textarea is NOT focused)
  useEffect(() => {
    const navHandler = (e: KeyboardEvent) => {
      // Skip if modifier keys held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Skip if user is typing in an input/textarea/editable element
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      )
        return;

      const len = filteredMessages.length;
      if (len === 0) return;

      // ArrowUp / k — select previous message
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSelectedMsgIndex((prev) => {
          if (prev === null) return len - 1;
          return Math.max(0, prev - 1);
        });
        return;
      }

      // ArrowDown / j — select next message
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSelectedMsgIndex((prev) => {
          if (prev === null) return 0;
          const next = prev + 1;
          return next >= len ? prev : next;
        });
        return;
      }

      // Escape — deselect
      if (e.key === 'Escape' && selectedMsgIndex !== null) {
        e.preventDefault();
        setSelectedMsgIndex(null);
        return;
      }

      // Enter or Space — focus textarea, start typing
      if ((e.key === 'Enter' || e.key === ' ') && selectedMsgIndex !== null) {
        e.preventDefault();
        setSelectedMsgIndex(null);
        inputRef.current?.focus();
        return;
      }

      // c — copy selected message content
      if (e.key === 'c' && selectedMsgIndex !== null) {
        e.preventDefault();
        const msg = filteredMessages[selectedMsgIndex];
        if (msg) navigator.clipboard.writeText(msg.content);
        return;
      }

      // e — edit selected message (user messages only)
      if (e.key === 'e' && selectedMsgIndex !== null) {
        const msg = filteredMessages[selectedMsgIndex];
        if (msg && msg.role === 'user') {
          e.preventDefault();
          setEditingMsgIndex(selectedMsgIndex);
          setEditingMsgText(msg.content);
        }
        return;
      }

      // r — regenerate (last assistant message only)
      if (e.key === 'r' && selectedMsgIndex !== null) {
        const msg = filteredMessages[selectedMsgIndex];
        if (
          msg &&
          msg.role === 'assistant' &&
          selectedMsgIndex === filteredMessages.length - 1 &&
          !streaming &&
          activeSessionId
        ) {
          e.preventDefault();
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
          if (!lastUserMsg) return;
          const truncated = messages.slice(0, messages.length - 1);
          actions.replaceSessionMessages(activeSessionId, truncated);
          setInput(lastUserMsg.content);
          pendingEditSendRef.current = true;
          setSelectedMsgIndex(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', navHandler);
    return () => window.removeEventListener('keydown', navHandler);
  }, [
    filteredMessages,
    selectedMsgIndex,
    streaming,
    activeSessionId,
    messages,
    actions,
    setSelectedMsgIndex,
    inputRef,
    setInput,
    setEditingMsgIndex,
    setEditingMsgText,
    pendingEditSendRef,
  ]);

  // Scroll to selected message when it changes
  useEffect(() => {
    if (selectedMsgIndex !== null) {
      virtualizer.scrollToIndex(selectedMsgIndex, { align: 'center', behavior: 'smooth' });
    }
  }, [selectedMsgIndex, virtualizer]);

  return { handleAbort };
}
