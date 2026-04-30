import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '../router-client';

export interface UseChatSearchReturn {
  // Global search
  globalSearchOpen: boolean;
  setGlobalSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  globalSearchQuery: string;
  setGlobalSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  globalSearchResults: Array<{
    agentId: string;
    sessionKey: string;
    sessionId: string;
    matches: number;
    preview: string;
  }>;
  setGlobalSearchResults: React.Dispatch<
    React.SetStateAction<
      Array<{
        agentId: string;
        sessionKey: string;
        sessionId: string;
        matches: number;
        preview: string;
      }>
    >
  >;
  globalSearching: boolean;
  setGlobalSearching: React.Dispatch<React.SetStateAction<boolean>>;
  globalSearchRef: React.RefObject<HTMLInputElement | null>;
  // In-conversation search
  chatSearchOpen: boolean;
  setChatSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatSearch: string;
  setChatSearch: React.Dispatch<React.SetStateAction<string>>;
  chatSearchIndex: number;
  setChatSearchIndex: React.Dispatch<React.SetStateAction<number>>;
  chatSearchRef: React.RefObject<HTMLInputElement | null>;
  // Computed
  chatSearchResults: number[];
  chatSearchNavigate: (dir: 1 | -1) => void;
  closeChatSearch: () => void;
}

export function useChatSearch(
  filteredMessages: ChatMessage[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
): UseChatSearchReturn {
  // Global search state
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<
    Array<{
      agentId: string;
      sessionKey: string;
      sessionId: string;
      matches: number;
      preview: string;
    }>
  >([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  // In-conversation search state
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chatSearchIndex, setChatSearchIndex] = useState(0);
  const chatSearchRef = useRef<HTMLInputElement>(null);

  // Chat search results — indices into filteredMessages that match
  const chatSearchResults = useMemo(() => {
    if (!chatSearch.trim()) return [] as number[];
    const needle = chatSearch.toLowerCase();
    const hits: number[] = [];
    filteredMessages.forEach((msg, idx) => {
      if (msg.content.toLowerCase().includes(needle)) hits.push(idx);
    });
    return hits;
  }, [chatSearch, filteredMessages]);

  useEffect(() => {
    setChatSearchIndex(0);
  }, [chatSearchResults.length]);

  const chatSearchNavigate = useCallback(
    (dir: 1 | -1) => {
      if (chatSearchResults.length === 0) return;
      const next = (chatSearchIndex + dir + chatSearchResults.length) % chatSearchResults.length;
      setChatSearchIndex(next);
      virtualizer.scrollToIndex(chatSearchResults[next], { align: 'center', behavior: 'smooth' });
    },
    [chatSearchResults, chatSearchIndex, virtualizer],
  );

  const closeChatSearch = useCallback(() => {
    setChatSearchOpen(false);
    setChatSearch('');
    setChatSearchIndex(0);
  }, []);

  return {
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    setGlobalSearchResults,
    globalSearching,
    setGlobalSearching,
    globalSearchRef,
    chatSearchOpen,
    setChatSearchOpen,
    chatSearch,
    setChatSearch,
    chatSearchIndex,
    setChatSearchIndex,
    chatSearchRef,
    chatSearchResults,
    chatSearchNavigate,
    closeChatSearch,
  };
}
