/**
 * AppActions factory — creates the AppActions object for MainApp.
 * Extracted from App.tsx to keep modularity score ≤ 800 LOC.
 */
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type {
  AppActions,
  Session,
  View,
  Theme,
  ThemeCustom,
  QueuedMessage,
  FeedEntry,
  UploadedFile,
} from './store';
import {
  uid,
  createSession,
  createVoiceSession,
  saveTabs,
  saveActiveSession,
  debouncedSaveSessions,
  markSessionDirty,
  syncDeleteToServer,
  saveActivity,
  saveFeed,
  saveFiles,
  saveQueue,
  saveDrafts,
  saveThemeCustom,
  saveSessionImmediate,
  fetchFullSessionMessages,
  loadSessions,
  saveSessions,
} from './store';
import type { ActivityStatus, ChatMessage } from './router-client';

const AGENT_KEY = 'shre-active-agent';
const COMPACT_KEY = 'shre-compact';
const WRITE_ENABLED_KEY = 'shre-write-enabled';

export interface ActionDeps {
  sessionsRef: MutableRefObject<Session[]>;
  agentRef: MutableRefObject<string>;
  queueRef: MutableRefObject<QueuedMessage[]>;
  draftsRef: MutableRefObject<Record<string, string>>;
  draftSaveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  crossTabRef: MutableRefObject<boolean>;

  activeSessionId: string | null;

  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setOpenTabs: Dispatch<SetStateAction<string[]>>;
  setActiveAgentId: Dispatch<SetStateAction<string>>;
  setView: Dispatch<SetStateAction<View>>;
  setActivity: Dispatch<SetStateAction<any[]>>;
  setFeed: Dispatch<SetStateAction<FeedEntry[]>>;
  setFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setStreaming: Dispatch<SetStateAction<boolean>>;
  setStreamText: Dispatch<SetStateAction<string>>;
  setStatusLine: Dispatch<SetStateAction<string | null>>;
  setGatewayUp: Dispatch<SetStateAction<boolean | null>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSyncing: Dispatch<SetStateAction<boolean>>;
  setTheme: Dispatch<SetStateAction<Theme>>;
  setCompact: Dispatch<SetStateAction<boolean>>;
  setWriteEnabled: Dispatch<SetStateAction<boolean>>;
  setClaudeCliMode: Dispatch<SetStateAction<boolean>>;
  setReplyToIndex: Dispatch<SetStateAction<number | null>>;
  setThemeCustomState: Dispatch<SetStateAction<ThemeCustom>>;

  updateSessions: (fn: (prev: Session[]) => Session[]) => void;
  onLogout: () => void;
}

export function buildActions(deps: ActionDeps): AppActions {
  const {
    sessionsRef,
    agentRef,
    queueRef,
    draftsRef,
    draftSaveTimer,
    crossTabRef,
    activeSessionId,
    setActiveSessionId,
    setOpenTabs,
    setActiveAgentId,
    setView,
    setActivity,
    setFeed,
    setFiles,
    setStreaming,
    setStreamText,
    setStatusLine,
    setGatewayUp,
    setSidebarOpen,
    setSyncing,
    setTheme,
    setCompact,
    setWriteEnabled,
    setClaudeCliMode,
    setReplyToIndex,
    setThemeCustomState,
    updateSessions,
    onLogout,
  } = deps;

  const actions: AppActions = {
    newSession: () => {
      const s = createSession(undefined, agentRef.current);
      updateSessions((prev) => [...prev, s]);
      setOpenTabs((prev) => {
        const next = [...prev, s.id];
        saveTabs(next);
        return next;
      });
      return s.id;
    },

    getOrCreateVoiceSession: (agentId: string) => {
      const RESUME_WINDOW = 30 * 60 * 1000;
      const now = Date.now();
      const existing = sessionsRef.current.find(
        (s) => s.type === 'voice' && s.agentId === agentId && now - s.updatedAt < RESUME_WINDOW,
      );
      if (existing) return existing.id;
      const s = createVoiceSession(agentId);
      updateSessions((prev) => [...prev, s]);
      return s.id;
    },

    switchSession: (id: string) => {
      setActiveSessionId(id);
      saveActiveSession(id);
      const session = sessionsRef.current.find((s) => s.id === id);
      if (session?.agentId) {
        setActiveAgentId(session.agentId);
        localStorage.setItem(AGENT_KEY, session.agentId);
        const PINNED_KEY = 'shre-pinned-sessions';
        let pinned: Record<string, string> = {};
        try {
          pinned = JSON.parse(localStorage.getItem(PINNED_KEY) || '{}');
        } catch (err) {
          console.debug('pinned sessions JSON parse', err);
        }
        pinned[session.agentId] = id;
        localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
      }
      setOpenTabs((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        saveTabs(next);
        return next;
      });
    },

    closeTab: (id: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t !== id);
        saveTabs(next);
        if (activeSessionId === id) {
          const idx = prev.indexOf(id);
          const newActive = next[Math.min(idx, next.length - 1)] ?? null;
          setActiveSessionId(newActive);
          saveActiveSession(newActive);
        }
        return next;
      });
    },

    deleteSession: (id: string) => {
      actions.closeTab(id);
      updateSessions((prev) => prev.filter((s) => s.id !== id));
      syncDeleteToServer(id);
    },

    setView,
    switchView: setView,

    addMessage: (sessionId, msg) => {
      updateSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sessionId) return s;
          let messages = [...s.messages];
          if (msg.role === 'assistant' && !msg.meta?.partial && !msg.meta?.system) {
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant' && last.meta?.partial) {
              messages = messages.slice(0, -1);
            }
          }
          return { ...s, messages: [...messages, msg], updatedAt: Date.now() };
        });
        const updated = next.find((s) => s.id === sessionId);
        if (updated) saveSessionImmediate(updated);
        return next;
      });
    },

    updateSessionTitle: (sessionId, title) => {
      updateSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
    },

    addActivity: (sessionId, status, summary) => {
      setActivity((prev: any[]) => {
        const session = sessionsRef.current.find((s) => s.id === sessionId);
        const evt = {
          id: uid(),
          sessionId,
          sessionTitle: session?.title || 'Chat',
          agentId: session?.agentId || agentRef.current,
          status,
          summary,
          timestamp: Date.now(),
        };
        const next = [...prev, evt];
        saveActivity(next);
        return next;
      });
    },

    addFeed: (sessionId, type, message, meta) => {
      setFeed((prev) => {
        const session = sessionsRef.current.find((s) => s.id === sessionId);
        const entry: FeedEntry = {
          id: uid(),
          sessionId,
          sessionTitle: session?.title || 'Chat',
          type,
          message,
          meta: { ...meta, agent: session?.agentId || agentRef.current },
          timestamp: Date.now(),
        };
        const next = [...prev, entry];
        saveFeed(next);
        return next;
      });
    },

    addFile: (file) => {
      setFiles((prev) => {
        const next = [...prev, file];
        saveFiles(next);
        return next;
      });
    },

    removeFile: (id) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        saveFiles(next);
        return next;
      });
    },

    enqueue: (msg) => {
      queueRef.current.push(msg);
      saveQueue(queueRef.current);
    },
    dequeue: () => {
      const msg = queueRef.current.shift();
      saveQueue(queueRef.current);
      return msg;
    },

    setStreaming,
    setStreamText,
    setStatusLine,
    setGatewayUp,
    setSidebarOpen,

    setActiveAgent: (agentId: string) => {
      setActiveAgentId(agentId);
      localStorage.setItem(AGENT_KEY, agentId);

      // Always start a fresh session when switching agents
      const s = createSession(undefined, agentId);
      updateSessions((prev) => [...prev, s]);
      setActiveSessionId(s.id);
      saveActiveSession(s.id);
      setOpenTabs((prev) => {
        const next = [...prev, s.id];
        saveTabs(next);
        return next;
      });
    },

    setSyncing,

    toggleTheme: () => {
      document.documentElement.classList.add('theme-transitioning');
      setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 300);
    },

    replaceSessionMessages: (sessionId: string, msgs: ChatMessage[]) => {
      updateSessions((prev) => {
        const next = prev.map((s) =>
          s.id === sessionId ? { ...s, messages: msgs, updatedAt: Date.now() } : s,
        );
        const updated = next.find((s) => s.id === sessionId);
        if (updated) saveSessionImmediate(updated);
        return next;
      });
    },

    setMessageFeedback: (
      sessionId: string,
      msgIndex: number,
      feedback: 'like' | 'dislike' | null,
    ) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (msgIndex >= 0 && msgIndex < msgs.length) {
            msgs[msgIndex] = { ...msgs[msgIndex], feedback };
          }
          return { ...s, messages: msgs };
        }),
      );
    },

    setAnnotation: (sessionId: string, messageIndex: number, text: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (messageIndex >= 0 && messageIndex < msgs.length) {
            msgs[messageIndex] = { ...msgs[messageIndex], annotation: text || undefined };
          }
          return { ...s, messages: msgs };
        }),
      );
    },

    toggleReaction: (sessionId: string, messageIndex: number, emoji: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          if (messageIndex >= 0 && messageIndex < msgs.length) {
            const existing = { ...(msgs[messageIndex].reactions || {}) };
            if (existing[emoji] && existing[emoji] > 0) {
              existing[emoji] -= 1;
              if (existing[emoji] <= 0) delete existing[emoji];
            } else {
              existing[emoji] = 1;
            }
            msgs[messageIndex] = {
              ...msgs[messageIndex],
              reactions: Object.keys(existing).length > 0 ? existing : undefined,
            };
          }
          return { ...s, messages: msgs };
        }),
      );
    },

    togglePin: (sessionId: string) => {
      updateSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, pinned: !s.pinned } : s)),
      );
    },

    addSessionTag: (sessionId: string, tag: string) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const existing = s.tags || [];
          if (existing.includes(normalized)) return s;
          return { ...s, tags: [...existing, normalized] };
        }),
      );
    },

    removeSessionTag: (sessionId: string, tag: string) => {
      updateSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return { ...s, tags: (s.tags || []).filter((t) => t !== tag) };
        }),
      );
    },

    toggleCompact: () => {
      setCompact((prev) => {
        const next = !prev;
        localStorage.setItem(COMPACT_KEY, String(next));
        return next;
      });
    },
    toggleWriteEnabled: () => {
      setWriteEnabled((prev) => {
        const next = !prev;
        localStorage.setItem(WRITE_ENABLED_KEY, String(next));
        return next;
      });
    },
    setClaudeCliMode: (on: boolean) => {
      setClaudeCliMode(on);
      localStorage.setItem('shre-claude-cli-mode', String(on));
    },

    setSystemPrompt: (sessionId: string, prompt: string) => {
      updateSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, systemPrompt: prompt || undefined } : s)),
      );
    },

    setThemeCustom: (custom: ThemeCustom) => {
      setThemeCustomState(custom);
      saveThemeCustom(custom);
    },

    branchFrom: (sessionId: string, messageIndex: number) => {
      const source = sessionsRef.current.find((s) => s.id === sessionId);
      if (!source) return null;
      const branchedMessages = source.messages.slice(0, messageIndex + 1);

      const recentMsgs = branchedMessages.slice(-4);
      const contextLines = recentMsgs.map((m) => {
        const snippet = m.content.replace(/\n/g, ' ').slice(0, 200);
        return `- [${m.role}]: ${snippet}${m.content.length > 200 ? '...' : ''}`;
      });
      const branchContext =
        `[This conversation was branched from "${source.title}" at message ${messageIndex + 1} of ${source.messages.length}. ` +
        `The user wants to continue or follow up on what was being discussed. ` +
        `Recent context:\n${contextLines.join('\n')}\n` +
        `IMPORTANT: When the user says "this", "status on this", or asks if something is done/complete, ` +
        `they are referring to the task or topic in the conversation above. ` +
        `Review the full conversation history to determine: what was being worked on, ` +
        `and whether it was completed or left unfinished. Give a clear status update.]`;

      const newId = uid();
      const branched: Session = {
        id: newId,
        title: source.title + ' (branch)',
        agentId: source.agentId,
        messages: branchedMessages.map((m) => ({ ...m })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        systemPrompt: (source.systemPrompt ? source.systemPrompt + '\n\n' : '') + branchContext,
        parentId: source.id,
      };
      updateSessions((prev) => [...prev, branched]);
      setOpenTabs((prev) => {
        const next = [...prev, newId];
        saveTabs(next);
        return next;
      });
      setActiveSessionId(newId);
      saveActiveSession(newId);
      return newId;
    },

    setDraft: (sessionId: string, text: string) => {
      if (text) draftsRef.current[sessionId] = text;
      else delete draftsRef.current[sessionId];
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = setTimeout(() => {
        saveDrafts(draftsRef.current);
        draftSaveTimer.current = null;
      }, 500);
    },

    getDraft: (sessionId: string) => {
      return draftsRef.current[sessionId] || '';
    },

    setReplyTo: (index: number | null) => {
      setReplyToIndex(index);
    },

    logout: onLogout,
  };

  return actions;
}
