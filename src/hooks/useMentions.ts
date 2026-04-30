import { useState, useRef, useMemo, useEffect, useCallback } from 'react';

export interface MentionItem {
  id: string;
  name: string;
  emoji: string;
  group: string;
}

export interface AppMentionItem {
  id: string;
  label: string;
  subtitle: string;
  icon?: string;
  category?: string;
  activated: boolean;
  skillCount: number;
  assignedAgents?: string[];
}

export interface UseMentionsParams {
  input: string;
  setInput: (val: string) => void;
  agents: MentionItem[];
  apps?: AppMentionItem[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface UseMentionsReturn {
  mentionOpen: boolean;
  setMentionOpen: (v: boolean) => void;
  mentionIndex: number;
  setMentionIndex: (v: number | ((prev: number) => number)) => void;
  mentionRef: React.RefObject<HTMLDivElement | null>;
  mentionFiltered: MentionItem[];
  mentionAgent: MentionItem | null;
  appFiltered: AppMentionItem[];
  appOpen: boolean;
  setAppOpen: (v: boolean) => void;
  appIndex: number;
  setAppIndex: (v: number | ((prev: number) => number)) => void;
  appRef: React.RefObject<HTMLDivElement | null>;
  clearMention: () => void;
  onMentionSelect: (agent: MentionItem) => void;
  onAppSelect: (app: AppMentionItem) => void;
  /** Extract mention from text and return cleaned text + mention scope */
  extractMention: (text: string) => {
    cleanText: string;
    agentId: string | null;
    appId: string | null;
    explicit: boolean;
    scopeTags: string[];
  };
}

/**
 * Detects `@agentname` patterns in the input and provides
 * an autocomplete dropdown for agent selection.
 */
export function useMentions(params: UseMentionsParams): UseMentionsReturn {
  const { input, setInput, agents, apps = [], inputRef } = params;

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionAgent, setMentionAgent] = useState<MentionItem | null>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const [appOpen, setAppOpen] = useState(false);
  const [appIndex, setAppIndex] = useState(0);
  const [mentionApp, setMentionApp] = useState<AppMentionItem | null>(null);
  const appRef = useRef<HTMLDivElement>(null);

  const appLookup = useMemo(() => {
    const byId = new Map<string, AppMentionItem>();
    const byName = new Map<string, AppMentionItem>();
    for (const app of apps) {
      byId.set(app.id.toLowerCase(), app);
      byName.set(app.label.toLowerCase(), app);
    }
    return { byId, byName };
  }, [apps]);

  const rawTags = useMemo(
    () => [...input.matchAll(/(^|[\s([{])#([A-Za-z0-9_-]+)/g)].map((m) => m[2].toLowerCase()),
    [input],
  );

  const scopeTags = useMemo(() => [...new Set(rawTags)].filter((tag) => tag.length > 0), [rawTags]);

  const queryState = useMemo(() => {
    const mentionMatch = input.match(/(?:^|[^@])@([A-Za-z0-9_-]*)$/);
    const appMatch = input.match(/(?:^|[\s([{])#([A-Za-z0-9_-]*)$/);
    return {
      mentionQuery: mentionMatch ? mentionMatch[1].toLowerCase() : null,
      appQuery: appMatch ? appMatch[1].toLowerCase() : null,
    };
  }, [input]);

  const parsedAgentId = useMemo(() => {
    const matches = [...input.matchAll(/(^|[^@])@{1,2}([A-Za-z0-9_-]+)/g)];
    const last = matches[matches.length - 1]?.[2]?.toLowerCase();
    if (!last) return null;
    const found = agents.find(
      (agent) => agent.id.toLowerCase() === last || agent.name.toLowerCase() === last,
    );
    return found?.id ?? null;
  }, [agents, input]);

  const resolveAppTag = useCallback(
    (tag: string): AppMentionItem | null => {
      const normalized = tag.toLowerCase().trim();
      if (!normalized) return null;
      const direct = appLookup.byId.get(normalized) || appLookup.byName.get(normalized);
      if (direct) return direct;
      if (normalized === 'pos') {
        return (
          apps.find(
            (app) =>
              app.id.toLowerCase().includes('pos') ||
              app.label.toLowerCase().includes('pos') ||
              app.subtitle.toLowerCase().includes('pos') ||
              app.category?.toLowerCase() === 'retail',
          ) ?? null
        );
      }
      return (
        apps.find(
          (app) =>
            app.id.toLowerCase().includes(normalized) ||
            app.label.toLowerCase().includes(normalized) ||
            app.subtitle.toLowerCase().includes(normalized) ||
            app.category?.toLowerCase().includes(normalized),
        ) ?? null
      );
    },
    [appLookup.byId, appLookup.byName, apps],
  );

  const activeScopeApps = useMemo(() => {
    const resolved = scopeTags.map((tag) => resolveAppTag(tag)).filter(Boolean) as AppMentionItem[];
    if (mentionApp) resolved.unshift(mentionApp);
    return [...new Map(resolved.map((app) => [app.id, app])).values()];
  }, [mentionApp, resolveAppTag, scopeTags]);

  const activeScopeAgents = useMemo(() => {
    const ids = new Set<string>();
    for (const app of activeScopeApps) {
      for (const agentId of app.assignedAgents || []) ids.add(agentId.toLowerCase());
    }
    if (mentionAgent) ids.add(mentionAgent.id.toLowerCase());
    if (parsedAgentId) ids.add(parsedAgentId.toLowerCase());
    return ids;
  }, [activeScopeApps, mentionAgent, parsedAgentId]);

  const mentionFiltered = useMemo(() => {
    const q = queryState.mentionQuery;
    const scope = activeScopeAgents;
    const base = agents.filter((agent) =>
      scope.size > 0 ? scope.has(agent.id.toLowerCase()) : true,
    );
    if (q === null) return [];
    if (q === '') return base.slice(0, 15);
    return base.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
  }, [agents, activeScopeAgents, queryState.mentionQuery]);

  const appFiltered = useMemo(() => {
    const q = queryState.appQuery;
    const scopeId = mentionAgent?.id ?? parsedAgentId ?? null;
    const scope = scopeId ? new Set([scopeId.toLowerCase()]) : new Set<string>();
    const base = apps.filter((app) =>
      scope.size > 0 ? (app.assignedAgents || []).some((id) => scope.has(id.toLowerCase())) : true,
    );
    if (q === null) return [];
    if (q === '') return base.slice(0, 15);
    return base.filter((app) => {
      const haystack = [
        app.id,
        app.label,
        app.subtitle,
        app.category || '',
        ...(app.assignedAgents || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [apps, mentionAgent, parsedAgentId, queryState.appQuery]);

  useEffect(() => {
    if (queryState.mentionQuery !== null && mentionFiltered.length > 0) {
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  }, [mentionFiltered.length, queryState.mentionQuery]);

  useEffect(() => {
    if (queryState.appQuery !== null && appFiltered.length > 0) {
      setAppOpen(true);
      setAppIndex(0);
    } else {
      setAppOpen(false);
    }
  }, [appFiltered.length, queryState.appQuery]);

  // Scroll active item into view
  useEffect(() => {
    if (mentionOpen && mentionRef.current) {
      const active = mentionRef.current.querySelector("[data-mention-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [mentionIndex, mentionOpen]);

  useEffect(() => {
    if (appOpen && appRef.current) {
      const active = appRef.current.querySelector("[data-app-active='true']");
      if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [appIndex, appOpen]);

  const onMentionSelect = useCallback(
    (agent: MentionItem) => {
      // Replace the @query with @agentname in the input
      const newInput = input.replace(/@(?:@)?\w*$/, `@${agent.name} `);
      setInput(newInput);
      setMentionAgent(agent);
      setMentionOpen(false);
      setAppOpen(false);
      inputRef.current?.focus();
    },
    [input, setInput, inputRef],
  );

  const onAppSelect = useCallback(
    (app: AppMentionItem) => {
      const newInput = input.replace(/(^|[\s([{])#([A-Za-z0-9_-]*)$/, `$1#${app.id} `);
      setInput(newInput);
      setMentionApp(app);
      setAppOpen(false);
      inputRef.current?.focus();
    },
    [input, setInput, inputRef],
  );

  const clearMention = useCallback(() => {
    setMentionAgent(null);
    setMentionApp(null);
  }, []);

  const extractMention = useCallback(
    (
      text: string,
    ): {
      cleanText: string;
      agentId: string | null;
      appId: string | null;
      explicit: boolean;
      scopeTags: string[];
    } => {
      const rawTags = [...text.matchAll(/(^|[\s([{])#([A-Za-z0-9_-]+)/g)].map((m) =>
        m[2].toLowerCase(),
      );
      const scopeTags = [...new Set(rawTags)].filter((tag) => tag.length > 0);
      const resolvedApps = scopeTags
        .map((tag) => resolveAppTag(tag))
        .filter(Boolean) as AppMentionItem[];
      const appId = resolvedApps[0]?.id ?? mentionApp?.id ?? null;
      // Match @AgentName or @@AgentName at any position.
      const match = text.match(/(^|[^@])@{1,2}([A-Za-z0-9_-]+)/);
      if (!match) {
        const cleanText = text.replace(/(^|[\s([{])#([A-Za-z0-9_-]+)/g, '$1').trim();
        return {
          cleanText,
          agentId: mentionAgent?.id ?? null,
          appId,
          explicit: scopeTags.length > 0,
          scopeTags,
        };
      }

      const mentionName = match[2].toLowerCase();
      const agent = agents.find(
        (a) => a.name.toLowerCase() === mentionName || a.id.toLowerCase() === mentionName,
      );

      // Remove the mention from visible text
      const cleanText = text
        .replace(/(^|[^@])@{1,2}[A-Za-z0-9_-]+\s*/, '$1')
        .replace(/(^|[\s([{])#([A-Za-z0-9_-]+)/g, '$1')
        .trim();
      return {
        cleanText,
        agentId: agent?.id ?? mentionAgent?.id ?? null,
        appId,
        explicit: true,
        scopeTags,
      };
    },
    [agents, mentionApp, mentionAgent, resolveAppTag],
  );

  return {
    mentionOpen,
    setMentionOpen,
    mentionIndex,
    setMentionIndex,
    mentionRef: mentionRef as React.RefObject<HTMLDivElement | null>,
    mentionFiltered,
    mentionAgent,
    appFiltered,
    appOpen,
    setAppOpen,
    appIndex,
    setAppIndex,
    appRef: appRef as React.RefObject<HTMLDivElement | null>,
    clearMention,
    onMentionSelect,
    onAppSelect,
    extractMention,
  };
}
