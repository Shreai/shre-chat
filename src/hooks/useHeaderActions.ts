import { useState, useCallback } from 'react';
import type { ChatMessage } from '../router-client';
import { shareSession } from '../store';
import { playNotifSound, formatTime } from '../chat-utils';
import { usePreferences, type GatewayMode } from '../preferences-store';

interface UseHeaderActionsOptions {
  activeSessionId: string | null;
  activeSession: { title?: string; systemPrompt?: string } | undefined;
  messages: ChatMessage[];
  userName: string;
  currentAgentName: string;
  currentAgentId: string;
  actions: {
    setStatusLine: (msg: string | null) => void;
    setSystemPrompt: (sessionId: string, prompt: string) => void;
    toggleCompact: () => void;
  };
}

export function useHeaderActions({
  activeSessionId,
  activeSession,
  messages,
  userName,
  currentAgentName,
  currentAgentId,
  actions,
}: UseHeaderActionsOptions) {
  const gatewayMode = usePreferences((s) => s.gatewayMode);
  const setGatewayMode = usePreferences((s) => s.setGatewayMode);
  // Legacy flag — always false (all routing via shre-router)
  const routerMode = false;
  const [compareMode, setCompareMode] = useState(false);
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const notifSound = usePreferences((s) => s.notifSound);
  const setNotifSound = usePreferences((s) => s.setNotifSound);

  const handleToggleRouterMode = useCallback(() => {
    // Legacy toggle — now just ensures router mode
    setGatewayMode('router');
  }, [setGatewayMode]);

  const handleSetGatewayMode = useCallback(
    (mode: GatewayMode) => setGatewayMode(mode),
    [setGatewayMode],
  );

  const handleToggleCompare = useCallback(
    (compareModelsLength: number) => {
      if (!compareMode) {
        setCompareMode(true);
        if (compareModelsLength < 2) setComparePickerOpen(true);
      } else {
        setCompareMode(false);
        setComparePickerOpen(false);
      }
    },
    [compareMode],
  );

  const handleOpenSystemPrompt = useCallback(() => {
    setSystemPromptDraft(activeSession?.systemPrompt || '');
    setShowSystemPrompt(true);
  }, [activeSession?.systemPrompt]);

  const handleToggleNotifSound = useCallback(() => {
    const next = !notifSound;
    setNotifSound(next);
    if (next) playNotifSound();
  }, [notifSound, setNotifSound]);

  const handleSummarize = useCallback(async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const convoText = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')
        .slice(0, 4000);
      const res = await fetch('/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          input: `Summarize this conversation concisely in bullet points. Include key decisions, questions asked, and conclusions reached.\n\nConversation:\n${convoText}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
      const data = await res.json();
      const text =
        data?.output
          ?.filter((o: { type: string }) => o.type === 'message')
          ?.flatMap(
            (o: { content: { type: string; text: string }[] }) =>
              o.content
                ?.filter((c: { type: string }) => c.type === 'output_text')
                ?.map((c: { text: string }) => c.text) ?? [],
          )
          ?.join('') || '';
      if (!text) throw new Error('Empty summary returned');
      setSummaryText(text);
      setShowSummary(true);
    } catch (err: unknown) {
      actions.setStatusLine(
        `Summary failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      setTimeout(() => actions.setStatusLine(null), 4000);
    } finally {
      setSummarizing(false);
    }
  }, [summarizing, messages, actions]);

  const handleShare = useCallback(async () => {
    if (!activeSessionId) return;
    setShareLoading(true);
    setShareCopied(false);
    try {
      const url = await shareSession(activeSessionId);
      setShareUrl(url);
    } catch (err) {
      console.warn('share session', err);
      actions.setStatusLine('Failed to create share link');
      setTimeout(() => actions.setStatusLine(null), 3000);
    }
    setShareLoading(false);
  }, [activeSessionId, actions]);

  const handleCopyMarkdown = useCallback(() => {
    const md = messages
      .map(
        (m) =>
          `**${m.role === 'user' ? userName : currentAgentName}** (${formatTime(m.timestamp)}):\n${m.content}`,
      )
      .join('\n\n---\n\n');
    navigator.clipboard?.writeText(md).then(() => {
      actions.setStatusLine('Copied to clipboard');
      setTimeout(() => actions.setStatusLine(null), 2000);
    });
  }, [messages, userName, currentAgentName, actions]);

  const handleDownloadMd = useCallback(() => {
    const md =
      `# ${activeSession?.title || 'Chat'}\n\n` +
      messages
        .map(
          (m) =>
            `## ${m.role === 'user' ? userName : currentAgentName} (${formatTime(m.timestamp)})\n\n${m.content}`,
        )
        .join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeSession?.title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    actions.setStatusLine('Downloaded as Markdown');
    setTimeout(() => actions.setStatusLine(null), 2000);
  }, [messages, userName, currentAgentName, activeSession?.title, actions]);

  const handleDownloadJson = useCallback(() => {
    const data = {
      title: activeSession?.title || 'Chat',
      agent: currentAgentId,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model: m.meta?.model,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeSession?.title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    actions.setStatusLine('Downloaded as JSON');
    setTimeout(() => actions.setStatusLine(null), 2000);
  }, [messages, currentAgentId, activeSession?.title, actions]);

  const handleSaveSystemPrompt = useCallback(() => {
    if (activeSessionId) {
      actions.setSystemPrompt(activeSessionId, systemPromptDraft.trim());
    }
    setShowSystemPrompt(false);
  }, [activeSessionId, systemPromptDraft, actions]);

  return {
    routerMode,
    setRouterMode: () => {},
    gatewayMode,
    handleSetGatewayMode,
    compareMode,
    setCompareMode,
    comparePickerOpen,
    setComparePickerOpen,
    showSystemPrompt,
    setShowSystemPrompt,
    systemPromptDraft,
    setSystemPromptDraft,
    summarizing,
    showSummary,
    setShowSummary,
    summaryText,
    showAnalytics,
    setShowAnalytics,
    shareUrl,
    setShareUrl,
    shareLoading,
    shareCopied,
    setShareCopied,
    notifSound,
    setNotifSound,
    handleToggleRouterMode,
    handleToggleCompare,
    handleOpenSystemPrompt,
    handleToggleNotifSound,
    handleSummarize,
    handleShare,
    handleCopyMarkdown,
    handleDownloadMd,
    handleDownloadJson,
    handleSaveSystemPrompt,
  };
}
