/**
 * Shre Chat — Streaming Client
 *
 * Primary chat client for Shre chat UI.
 * Flow: Shre → shre-router → optimal model (budget, RAG, cost tracking, learning)
 *
 * All chat routes through shre-router /v1/chat. No direct provider calls.
 */

import { SYSTEM_PROMPT_VERSION } from './hooks/useMessageHandlers';

const RESPONSES_URL = '/v1/responses';
// Route through serve.js proxy to avoid self-signed cert issues in the browser
const SHRE_ROUTER_URL = import.meta.env.VITE_ROUTER_URL ?? `${window.location.origin}/api/router`;

// App version sent via X-App-Version header for device metadata tracking
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

// Auth — token fetched from server at runtime (never bundled in JS)

// Active agent ID — defaults to shre, switchable
let currentAgentId = 'shre';
let currentAgentModel = 'claude-sonnet-4-6';

/** Get the active tenant/workspace ID from the stored auth workspace (set at login/workspace switch).
 *  Falls back to "default" when no workspace is selected. */
export function getTenantId(): string {
  try {
    const ws = localStorage.getItem('shre-auth-workspace');
    if (ws) {
      const parsed = JSON.parse(ws);
      if (parsed?.id) return parsed.id;
    }
  } catch {
    /* fallback */
  }
  return 'default';
}

/** Get user's preferred language from localStorage (set via profile or chat settings) */
export function getUserLanguage(): string {
  try {
    return localStorage.getItem('shre-user-language') || '';
  } catch {
    return '';
  }
}

/** Set user's preferred language */
export function setUserLanguage(lang: string): void {
  try {
    if (lang) localStorage.setItem('shre-user-language', lang);
    else localStorage.removeItem('shre-user-language');
  } catch (_) {
    void _;
  }
}

/** Strip provider prefix (e.g. "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6").
 *  Some providers expect bare model IDs without provider prefix. */
export function stripProviderPrefix(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').pop()! : modelId;
}

// Cached agent model assignments from shre-router config API
let agentModelCache: Record<string, string> = {};

/** Fetch agent model map from shre-router and cache it */
async function refreshAgentModelCache(): Promise<void> {
  try {
    const res = await fetch(`${SHRE_ROUTER_URL}/v1/config/agents`);
    if (res.ok) agentModelCache = await res.json();
  } catch {
    // shre-router unavailable — keep existing cache
  }
}

function resolveAgentModel(agentId: string): string {
  return agentModelCache[agentId] ?? agentModelCache._default ?? 'claude-sonnet-4-6';
}

export function setAgent(agentId: string) {
  currentAgentId = agentId;
  currentAgentModel = resolveAgentModel(agentId);
}

// Fetch on module load (fire-and-forget)
refreshAgentModelCache().then(() => {
  currentAgentModel = resolveAgentModel(currentAgentId);
});

// ── Cost Reporting — record actual token usage to shre-router ────────

function reportUsage(
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number },
  latencyMs?: number,
): void {
  if (!usage.input_tokens && !usage.output_tokens) return;
  fetch(`${SHRE_ROUTER_URL}/v1/record-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.includes('/') ? model : `anthropic/${model}`,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      },
      agentId: currentAgentId,
      sessionId: activeSessionKey,
      source: 'shre-chat',
      latencyMs,
    }),
  }).catch(() => {}); // fire-and-forget
}

// Session key — format: agent:<agentId>:main
let activeSessionKey = 'main';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  model?: string;
  provider?: string;
  fromRouter?: boolean;
  feedback?: 'like' | 'dislike' | null;
  reactions?: Record<string, number>;
  annotation?: string;
  replyTo?: number;
  meta?: Record<string, string>;
}

// ── Session Sync (reads JSONL sessions via serve.js API) ────

export interface RouterSession {
  key: string;
  sessionId: string;
  updatedAt: string;
}

export interface SyncResult {
  messages: ChatMessage[];
  updatedAt: string;
  totalEvents: number;
  totalMessages?: number;
  hasMore?: boolean;
}

/**
 * List sessions for an agent from session files.
 */
export async function listSessions(agentId: string): Promise<RouterSession[]> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(agentId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Fetch messages from a session.
 * Pass sinceTs to only get messages after that timestamp (for incremental sync).
 */
export async function fetchSessionMessages(
  agentId: string,
  sessionKey: string = 'main',
  sinceTs: number = 0,
): Promise<SyncResult> {
  try {
    const url = `/api/sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionKey)}${sinceTs ? `?since=${sinceTs}` : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { messages: [], updatedAt: '', totalEvents: 0 };
    const data = await res.json();
    return {
      messages: data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model: m.model,
        provider: m.provider,
        fromRouter: true,
      })),
      updatedAt: data.updatedAt || '',
      totalEvents: data.totalEvents || 0,
    };
  } catch {
    return { messages: [], updatedAt: '', totalEvents: 0 };
  }
}

/**
 * Fetch recent messages from a session with pagination.
 * Returns the most recent `limit` messages, plus metadata for loading older ones.
 */
export async function fetchSessionMessagesPage(
  agentId: string,
  sessionKey: string = 'main',
  limit: number = 50,
  offset: number = 0,
): Promise<SyncResult> {
  try {
    const url = `/api/sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionKey)}?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok)
      return { messages: [], updatedAt: '', totalEvents: 0, totalMessages: 0, hasMore: false };
    const data = await res.json();
    return {
      messages: data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model: m.model,
        provider: m.provider,
        fromRouter: true,
      })),
      updatedAt: data.updatedAt || '',
      totalEvents: data.totalEvents || 0,
      totalMessages: data.totalMessages || 0,
      hasMore: data.hasMore || false,
    };
  } catch {
    return { messages: [], updatedAt: '', totalEvents: 0, totalMessages: 0, hasMore: false };
  }
}

/**
 * Trigger server-side compaction for a session.
 * Moves messages older than `keepDays` to an archive file.
 */
export async function compactSession(
  agentId: string,
  sessionKey: string,
  keepDays: number = 1,
): Promise<{ compacted: number; remaining: number } | null> {
  try {
    const url = `/api/sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionKey)}/compact`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepDays }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch ALL messages for an agent across all sessions (aggregated).
 * This merges openresponses, main, subagent sessions into one timeline.
 */
export async function fetchAllAgentMessages(
  agentId: string,
  sinceTs: number = 0,
): Promise<SyncResult> {
  try {
    // First get all session keys
    const sessionsRes = await fetch(`/api/sessions/${encodeURIComponent(agentId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!sessionsRes.ok) return { messages: [], updatedAt: '', totalEvents: 0 };
    const sessions: RouterSession[] = await sessionsRes.json();

    // Fetch messages from each session in parallel
    const allMessages: ChatMessage[] = [];
    let latestUpdate = '';
    let totalEvts = 0;

    const fetches = sessions.map(async (s) => {
      // Extract the session key part after agent:agentId:
      const keyParts = s.key.split(':');
      const sessionKey = keyParts.slice(2).join(':');
      if (!sessionKey) return;
      // Skip internal sessions (subagents, cron, suggestion generation)
      if (
        sessionKey.startsWith('subagent:') ||
        sessionKey.startsWith('cron:') ||
        sessionKey === '_suggestions'
      )
        return;

      const result = await fetchSessionMessages(agentId, sessionKey, sinceTs);
      allMessages.push(...result.messages);
      totalEvts += result.totalEvents;
      if (result.updatedAt > latestUpdate) latestUpdate = result.updatedAt;
    });

    await Promise.all(fetches);

    // Sort by timestamp
    allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    return { messages: allMessages, updatedAt: latestUpdate, totalEvents: totalEvts };
  } catch {
    return { messages: [], updatedAt: '', totalEvents: 0 };
  }
}

/**
 * Fetch global feed — recent messages across ALL agents.
 */
export async function fetchFeed(
  sinceTs: number = 0,
): Promise<Array<ChatMessage & { agentId: string; sessionKey: string }>> {
  try {
    const res = await fetch(`/api/feed?since=${sinceTs}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries.map((e: any) => ({
      role: e.role,
      content: e.content,
      timestamp: e.timestamp,
      model: e.model,
      provider: e.provider,
      agentId: e.agentId,
      sessionKey: e.sessionKey,
      fromRouter: true,
    }));
  } catch {
    return [];
  }
}

// ── Retry utility for transient HTTP failures ───────────────────────

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 1; // 1 retry = 2 total attempts
const RETRY_BACKOFF_MS = 1000;

/**
 * Wrapper around fetch() that retries on network errors and 502/503/504.
 * Does NOT retry on 4xx client errors, 429 rate-limit, or aborted requests.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(input, init);

      // Don't retry client errors or rate-limit
      if (!RETRYABLE_STATUS.has(res.status)) return res;

      // Retryable server error — save for potential re-throw
      lastError = new Error(`HTTP ${res.status}`);
      // Consume body so connection is released
      await res.text().catch(() => {});
    } catch (err) {
      // Aborted — never retry
      if (init?.signal?.aborted) throw err;
      // Network error (TypeError from fetch) — retryable
      if (!(err instanceof TypeError)) throw err;
      lastError = err;
    }

    // Wait before next attempt (skip wait on last failed attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }
  }

  throw lastError;
}

// ── Dynamic Model Discovery from shre-router ────────────────────────

export interface RouterModel {
  id: string;
  name: string;
  provider: string;
  connected: boolean;
  contextWindow?: number;
}

/** Fetch live model list + config from shre-router, merged into one array. */
export async function fetchAvailableModels(): Promise<RouterModel[]> {
  try {
    const [modelsRes, configRes] = await Promise.all([
      fetch(`${SHRE_ROUTER_URL}/v1/models`, { signal: AbortSignal.timeout(4000) }),
      fetch(`${SHRE_ROUTER_URL}/v1/config/models`, { signal: AbortSignal.timeout(4000) }),
    ]);
    if (!modelsRes.ok) return [];
    const { models } = (await modelsRes.json()) as {
      models: Array<{ id: string; name: string; provider: string; connected: boolean }>;
    };
    let catalog: Record<string, { contextWindow?: number }> = {};
    if (configRes.ok) {
      const cfg = await configRes.json();
      catalog = cfg.catalog || {};
    }
    return models.map((m) => ({
      ...m,
      contextWindow: catalog[m.id]?.contextWindow,
    }));
  } catch {
    return [];
  }
}

export type ActivityStatus =
  | 'connecting'
  | 'thinking'
  | 'planning'
  | 'writing'
  | 'researching'
  | 'executing'
  | 'tool_call'
  | 'done'
  | 'attention'
  | 'warning'
  | 'error';

export interface ToolResult {
  tool: string;
  input: any;
  output: any;
  status: 'success' | 'error';
  duration_ms?: number;
}

export interface ToolStartEvent {
  tool: string;
  input: any;
  iteration: number;
}

export interface ToolResultEvent {
  tool: string;
  success: boolean;
  outputPreview: string;
  latencyMs: number;
  iteration: number;
}

export interface ToolErrorEvent {
  tool: string;
  error: string;
  iteration: number;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  onStatus?: (status: ActivityStatus, detail?: string) => void;
  onApprovalRequired?: (approval: {
    approvalId: string;
    tool: string;
    input: any;
    reason: string;
  }) => void;
  onToolResult?: (result: ToolResult) => void;
  /** Fired when a tool call begins execution */
  onToolStart?: (event: ToolStartEvent) => void;
  /** Fired when a tool call fails */
  onToolError?: (event: ToolErrorEvent) => void;
  onBillingWarning?: (message: string, balanceCents: number) => void;
  /** Fired when a model's response failed quality checks and will be retried */
  onModelFailed?: (model: string, reason: string) => void;
  /** Fired to clear accumulated stream text before a retry with a better model */
  onClearResponse?: () => void;
  /** Fired when switching to a fallback model after failure */
  onModelSwitch?: (from: string, to: string, reason: string) => void;
  // ── Claude CLI callbacks ──
  /** Fired when route event indicates Claude CLI mode */
  onClaudeCliRoute?: (mode: string) => void;
  /** Fired when Claude CLI session starts */
  onClaudeSessionStart?: (sessionId: string) => void;
  /** Fired when Claude CLI session ends */
  onClaudeSessionEnd?: (data: {
    costUsd?: number;
    durationMs?: number;
    sessionId?: string;
  }) => void;
  /** Fired with Claude CLI final result metadata */
  onClaudeResult?: (data: { costUsd?: number; durationMs?: number; model?: string }) => void;
  /** Fired when Claude CLI produces a file diff */
  onFileDiff?: (data: { file: string; diff?: string; action?: string }) => void;
  /** Fired for Claude CLI system messages */
  onClaudeSystem?: (message: string) => void;
}

/**
 * Send a chat message through shre-router (streaming).
 */
export interface ThreadContext {
  parentSessionId?: string;
  branchPoint?: number;
  replyToMessageIndex?: number;
}

export async function sendMessage(
  message: string,
  history: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  sessionId?: string,
  modelOverride?: string,
  attachments?: Array<{ name: string; type: string; dataUrl: string }>,
  routerMode?: boolean,
  threadContext?: ThreadContext,
  contextHealth?: Record<string, 'ok' | 'missing' | 'error'>,
  claudeCliMode?: boolean,
  directMode?: boolean,
  voiceMode?: boolean,
): Promise<void> {
  // Use provided sessionId or fall back to global activeSessionKey
  activeSessionKey = sessionId ?? activeSessionKey ?? 'main';

  // Track whether onDone was already called — prevents spurious onError after completion
  let done = false;
  const safeCallbacks: StreamCallbacks = {
    ...callbacks,
    onDone: (text) => {
      done = true;
      callbacks.onDone(text);
    },
    onError: (err) => {
      if (!done) callbacks.onError(err);
    },
  };

  // All chat routes through shre-router /v1/chat (trust gate + training):
  // Router (default): shre-router → provider-proxy → LLM (budget, RAG, cost tracking, learning)
  try {
    await streamViaFallback(
      message,
      history,
      systemPrompt,
      safeCallbacks,
      signal,
      modelOverride,
      attachments,
      routerMode,
      threadContext,
      contextHealth,
      claudeCliMode,
      directMode,
      voiceMode,
    );
  } catch (err) {
    if (done) return;
    if (signal?.aborted) {
      safeCallbacks.onError('Cancelled');
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[shre] shre-router failed:', msg);
    // Classify error for better UX — order matters: check specific patterns before generic fallback
    const isToolLoopError = msg.includes('iterations') || msg.includes('tool loop') || msg.includes('maximum iteration') || msg.includes('tool_loop');
    const isNetworkError = msg.includes('Failed to fetch') || msg.includes('NetworkError') || (msg.includes('TypeError') && msg.includes('fetch'));
    const isAuthError = msg.includes('auth_expired') || msg.includes('Session expired') || msg.includes('sign in again');
    if (isToolLoopError) {
      // Tool loop exhaustion — NOT a gateway error, NOT transient. Prefix with 'tool_loop_exhausted:'
      // so useMessageHandlers knows not to auto-retry.
      safeCallbacks.onError('tool_loop_exhausted: The agent ran out of tool iterations. Your message has been escalated for review. Try rephrasing or breaking the request into smaller steps.');
    } else if (isAuthError) {
      safeCallbacks.onError('Session expired — please sign in again.');
    } else if (isNetworkError) {
      safeCallbacks.onError('Cannot reach the gateway — check if shre-router is running. Please try again.');
    } else {
      safeCallbacks.onError(`Gateway unavailable — ${msg}. Please try again.`);
    }
  }
}

// ── shre-router Smart Gateway ─────────────────────────────
// Uses /v1/chat which auto-routes, manages API keys, and falls back through providers

async function streamViaFallback(
  message: string,
  history: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  modelOverride?: string,
  attachments?: Array<{ name: string; type: string; dataUrl: string }>,
  routerMode?: boolean,
  threadContext?: ThreadContext,
  contextHealth?: Record<string, 'ok' | 'missing' | 'error'>,
  claudeCliMode?: boolean,
  directMode?: boolean,
  voiceMode?: boolean,
  _emptyRetry?: boolean,
): Promise<void> {
  callbacks.onStatus?.('connecting');

  const messages = [
    ...history.filter((m) => {
      if (!m.meta?.system) return true;
      // Keep system messages that carry substantive context (errors, escalations)
      // Drop pure routing noise — the server-side noise filter handles the rest
      const t = m.content.trim();
      if (t.startsWith('[system] Routing via ')) return false;
      if (t.startsWith('[tool_exec]')) return false;
      if (/^\[system\] .+ API quota exceeded/.test(t)) return false;
      // Keep error messages, escalation notices, and other substantive system info
      return true;
    }).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // Direct mode bypasses shre-router — sends to local Ollama via serve.js proxy
  const chatUrl = directMode ? '/api/direct/v1/chat' : `${SHRE_ROUTER_URL}/v1/chat`;
  const res = await fetchWithRetry(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Version': APP_VERSION,
      'x-channel': 'shre-chat',
    },
    body: JSON.stringify({
      messages,
      systemPrompt,
      model: modelOverride || 'auto',
      stream: true,
      agentId: currentAgentId,
      sessionId: activeSessionKey,
      tenantId: getTenantId(),
      companyId: getTenantId(),
      promptVersion: SYSTEM_PROMPT_VERSION,
      ...(attachments?.length ? { attachments } : {}),
      ...(routerMode ? { routerMode: true } : {}),
      ...(claudeCliMode ? { claudeCliMode: true } : {}),
      ...(getUserLanguage() ? { userLanguage: getUserLanguage() } : {}),
      ...(voiceMode ? { voiceMode: true } : {}),
      ...(threadContext ? { threadContext } : {}),
      ...(contextHealth ? { contextHealth } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Handle auth errors — session expired or unauthorized
    if (res.status === 401 || res.status === 403) {
      const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
      const errMsg = parsed?.message || text.slice(0, 200) || 'Session expired';
      throw new Error(`auth_expired: ${errMsg}`);
    }
    // Handle billing kill switch — 402 Payment Required
    if (res.status === 402) {
      try {
        const billing = JSON.parse(text);
        callbacks.onBillingWarning?.(
          billing.message || 'Payment required',
          billing.balanceCents ?? 0,
        );
        throw new Error(billing.message || 'Payment required — please add tokens to continue');
      } catch (e) {
        if (e instanceof Error && e.message.includes('Payment required')) throw e;
      }
    }
    throw new Error(`Smart gateway ${res.status}: ${text.slice(0, 200)}`);
  }

  // Read SSE stream from smart gateway
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No stream');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let routedModel = '';
  const fallbackStart = Date.now();

  // Stream silence timeout — if no data for 60s, assume connection died
  const STREAM_SILENCE_TIMEOUT = 60_000;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      try { reader.cancel(); } catch {}
    }, STREAM_SILENCE_TIMEOUT);
  };

  try {
    resetSilenceTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetSilenceTimer();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const evt = JSON.parse(raw);

          if (evt.type === 'route') {
            routedModel = evt.model || '';
            // Detect Claude CLI auto-routing
            if (evt.mode === 'claude-cli-auto' || evt.route === 'claude-cli') {
              callbacks.onClaudeCliRoute?.(evt.mode || evt.route);
            }
            callbacks.onStatus?.('thinking', `Routed → ${routedModel}`);
          } else if (evt.type === 'session_start') {
            callbacks.onClaudeSessionStart?.(evt.sessionId || '');
            callbacks.onStatus?.('executing', 'Claude CLI starting...');
          } else if (evt.type === 'session_end') {
            callbacks.onClaudeSessionEnd?.({
              costUsd: evt.costUsd ?? evt.cost_usd,
              durationMs: evt.durationMs ?? evt.duration_ms,
              sessionId: evt.sessionId,
            });
          } else if (evt.type === 'claude_result') {
            callbacks.onClaudeResult?.({
              costUsd: evt.costUsd ?? evt.cost_usd,
              durationMs: evt.durationMs ?? evt.duration_ms,
              model: evt.model,
            });
          } else if (evt.type === 'file_diff') {
            callbacks.onFileDiff?.({
              file: evt.file || evt.path || '',
              diff: evt.diff || evt.content,
              action: evt.action,
            });
          } else if (evt.type === 'claude_system') {
            callbacks.onClaudeSystem?.(evt.message || evt.text || '');
          } else if (evt.type === 'status') {
            callbacks.onStatus?.(
              'thinking',
              `${evt.model || routedModel} via ${evt.provider || '...'}`,
            );
          } else if (evt.type === 'delta' && evt.text) {
            fullText += evt.text;
            callbacks.onToken(evt.text);
            callbacks.onStatus?.('writing');
          } else if (evt.type === 'response.output_text.delta' && evt.delta) {
            // Text deltas in OpenAI Responses API format
            fullText += evt.delta;
            callbacks.onToken(evt.delta);
            callbacks.onStatus?.('writing');
          } else if (evt.type === 'response.in_progress' || evt.type === 'response.created') {
            callbacks.onStatus?.('thinking');
          } else if (evt.type === 'response.completed') {
            const usage = evt.response?.usage;
            if (usage && routedModel) {
              reportUsage(routedModel, usage, Date.now() - fallbackStart);
            }
            callbacks.onStatus?.('done');
          } else if (evt.type === 'done') {
            callbacks.onStatus?.('done');
            // Report usage — estimate tokens from text if no usage in event
            if (evt.usage) {
              reportUsage(
                routedModel || modelOverride || 'auto',
                evt.usage,
                Date.now() - fallbackStart,
              );
            } else if (fullText && routedModel) {
              const estInput = Math.ceil(message.length / 4);
              const estOutput = Math.ceil(fullText.length / 4);
              reportUsage(
                routedModel,
                { input_tokens: estInput, output_tokens: estOutput },
                Date.now() - fallbackStart,
              );
            }
          } else if (evt.type === 'tool_status') {
            const toolName = evt.tool || (evt.tools || []).join(', ');
            if (evt.status === 'executing' || evt.status === 'running') {
              callbacks.onStatus?.('tool_call', toolName);
            } else if (evt.status === 'completed') {
              callbacks.onStatus?.('tool_call', `${toolName} done`);
            } else if (evt.status === 'continuing') {
              callbacks.onStatus?.('thinking', `Continuing (step ${evt.iteration}/${evt.max})...`);
            }
          } else if (evt.type === 'tool_start') {
            callbacks.onToolStart?.({
              tool: evt.tool || 'unknown',
              input: evt.input,
              iteration: evt.iteration || 1,
            });
            callbacks.onStatus?.('tool_call', evt.tool);
          } else if (evt.type === 'tool_error') {
            callbacks.onToolError?.({
              tool: evt.tool || 'unknown',
              error: evt.error || 'Unknown error',
              iteration: evt.iteration || 1,
            });
          } else if (evt.type === 'tool_result') {
            callbacks.onToolResult?.({
              tool: evt.tool || 'unknown',
              input: evt.input,
              output: evt.output || evt.outputPreview,
              status: evt.error ? 'error' : 'success',
              duration_ms: evt.duration_ms || evt.latencyMs,
            });
          } else if (evt.type === 'approval_required') {
            callbacks.onApprovalRequired?.({
              approvalId: evt.approvalId,
              tool: evt.tool,
              input: evt.input,
              reason: evt.reason,
            });
          } else if (evt.type === 'model_failed') {
            callbacks.onModelFailed?.(
              evt.model || routedModel,
              evt.reason || 'Quality check failed',
            );
          } else if (evt.type === 'clear_response') {
            // Server says: discard streamed text, retry coming with better model
            fullText = '';
            callbacks.onClearResponse?.();
          } else if (evt.type === 'model_switch') {
            routedModel = evt.to || '';
            callbacks.onModelSwitch?.(evt.from || '', evt.to || '', evt.reason || '');
            callbacks.onStatus?.('thinking', `Retrying → ${routedModel}`);
          } else if (evt.type === 'billing_warning') {
            callbacks.onStatus?.('warning', evt.message || 'Low balance');
            callbacks.onBillingWarning?.(evt.message, evt.balanceCents);
          } else if (evt.type === 'error') {
            const errMsg = evt.error || 'Gateway error';
            // Tool loop exhaustion is not a gateway failure — surface it accurately
            // and skip the outer catch (which would prepend "Gateway unavailable")
            if (errMsg.includes('iterations') || errMsg.includes('tool loop') || errMsg.includes('maximum')) {
              callbacks.onError(`tool_loop_exhausted: ${errMsg}`);
              return;
            }
            throw new Error(errMsg);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== raw) throw e;
        }
      }
    }
  } finally {
    if (silenceTimer) clearTimeout(silenceTimer);
    reader.releaseLock();
  }

  // If stream ended with no content, auto-retry once before surfacing error
  if (!fullText || fullText.trim().length < 3) {
    const elapsed = Date.now() - fallbackStart;
    if (elapsed >= STREAM_SILENCE_TIMEOUT - 1000) {
      callbacks.onError('Request timed out — no response received. The service may be restarting. Please try again.');
      return;
    }

    // One automatic retry — transient empty responses often succeed on second attempt
    if (!_emptyRetry && !signal?.aborted) {
      callbacks.onStatus?.('thinking', 'Empty response — retrying...');
      await new Promise((r) => setTimeout(r, 800));
      return streamViaFallback(
        message, history, systemPrompt, callbacks, signal, modelOverride,
        attachments, routerMode, threadContext, contextHealth, claudeCliMode, directMode,
        true,
      );
    }

    callbacks.onError('The model returned an empty response. This has been escalated automatically. Please try again.');
    return;
  }

  callbacks.onDone(fullText);
}

// ── SSE Stream Reader (Responses API format) ─────────────────────────

async function readSSEStream(res: Response, callbacks: StreamCallbacks): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No stream');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let currentEvent = '';
  const streamStart = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // Track named events (SSE format: `event: <type>\ndata: {...}`)
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
          continue;
        }

        if (!line.startsWith('data: ')) {
          // Empty line resets event name per SSE spec
          if (line.trim() === '') currentEvent = '';
          continue;
        }

        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;

        try {
          const evt = JSON.parse(raw);
          const evtType = evt.type || currentEvent;

          // Emit activity status based on event type
          if (callbacks.onStatus) {
            if (evtType === 'response.created') {
              callbacks.onStatus('connecting');
            } else if (evtType === 'response.in_progress') {
              callbacks.onStatus('thinking');
            } else if (evtType === 'response.output_text.delta') {
              callbacks.onStatus('writing');
            } else if (
              evtType === 'response.function_call_arguments.delta' ||
              evtType === 'response.output_item.added'
            ) {
              const toolName = evt.item?.call?.name || evt.name || '';
              if (toolName.includes('search') || toolName.includes('web')) {
                callbacks.onStatus('researching', toolName);
              } else if (
                toolName.includes('database') ||
                toolName.includes('cortex') ||
                toolName.includes('write')
              ) {
                callbacks.onStatus('executing', toolName);
              } else if (toolName) {
                callbacks.onStatus('tool_call', toolName);
              }
            } else if (
              evtType === 'response.completed' ||
              evtType === 'response.output_text.done'
            ) {
              callbacks.onStatus('done');
            }
          }

          // ── Report usage on response.completed ──
          if (evtType === 'response.completed' && evt.response?.usage) {
            const r = evt.response;
            reportUsage(r.model || currentAgentModel, r.usage, Date.now() - streamStart);
          }

          // Extract text content — Responses API format
          if (evtType === 'response.output_text.delta' && evt.delta) {
            fullText += evt.delta;
            callbacks.onToken(evt.delta);
          }
          // Alternative format (Anthropic native)
          if (evtType === 'content_block_delta' && evt.delta?.text) {
            fullText += evt.delta.text;
            callbacks.onToken(evt.delta.text);
          }
        } catch {
          /* skip malformed JSON */
        }

        currentEvent = '';
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone(fullText);
}

/**
 * Check if the gateway is reachable via the proxy.
 */
export async function checkGateway(): Promise<boolean> {
  try {
    // Use proxy path (same origin) — avoids CORS issues
    const res = await fetch('/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'ping', input: 'health', stream: false }),
      signal: AbortSignal.timeout(3000),
    });
    // Any response (even 4xx) means the gateway is reachable
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a short AI-powered title for a chat session.
 * Fire-and-forget — returns null on any failure.
 */
export async function generateAITitle(userMessage: string): Promise<string | null> {
  try {
    const res = await fetch('/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku',
        input: `Generate a 3-5 word title for this conversation. First message: ${userMessage.slice(0, 300)}. Reply with ONLY the title, no quotes.`,
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Responses API returns output array with message items
    const text =
      data?.output
        ?.filter((o: { type: string }) => o.type === 'message')
        ?.flatMap((o: { content: { type: string; text: string }[] }) => o.content)
        ?.filter((c: { type: string }) => c.type === 'output_text')
        ?.map((c: { text: string }) => c.text)
        ?.join('') ||
      data?.output_text ||
      '';
    const title = text.replace(/^["']|["']$/g, '').trim();
    if (title && title.length > 0 && title.length < 80) return title;
    return null;
  } catch {
    return null;
  }
}
