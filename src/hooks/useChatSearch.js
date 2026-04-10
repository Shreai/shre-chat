import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
export function useChatSearch(filteredMessages, virtualizer) {
    // Global search state
    const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState([]);
    const [globalSearching, setGlobalSearching] = useState(false);
    const globalSearchRef = useRef(null);
    // In-conversation search state
    const [chatSearchOpen, setChatSearchOpen] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [chatSearchIndex, setChatSearchIndex] = useState(0);
    const chatSearchRef = useRef(null);
    // Chat search results — indices into filteredMessages that match
    const chatSearchResults = useMemo(() => {
        if (!chatSearch.trim())
            return [];
        const needle = chatSearch.toLowerCase();
        const hits = [];
        filteredMessages.forEach((msg, idx) => {
            if (msg.content.toLowerCase().includes(needle))
                hits.push(idx);
        });
        return hits;
    }, [chatSearch, filteredMessages]);
    useEffect(() => {
        setChatSearchIndex(0);
    }, [chatSearchResults.length]);
    const chatSearchNavigate = useCallback((dir) => {
        if (chatSearchResults.length === 0)
            return;
        const next = (chatSearchIndex + dir + chatSearchResults.length) % chatSearchResults.length;
        setChatSearchIndex(next);
        virtualizer.scrollToIndex(chatSearchResults[next], { align: 'center', behavior: 'smooth' });
    }, [chatSearchResults, chatSearchIndex, virtualizer]);
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
