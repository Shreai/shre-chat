/**
 * Shared types for the WebSocket gateway client.
 */

export type WSState = 'disconnected' | 'connecting' | 'connected' | 'failed';

/** Extended state info for UI consumption. */
export interface WSStateInfo {
  state: WSState;
  attempt?: number;
  maxAttempts?: number;
  errorMessage?: string;
}

export interface ActiveStream {
  agentId: string;
  sessionKey: string;
  fullSessionKey: string;
  runId: string | null;
  startedAt: number;
  status: 'connecting' | 'thinking' | 'writing' | 'compacting';
}

export interface WSStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  onStatus?: (status: string, detail?: string) => void;
  onActivity?: (text: string) => void;
  /** Fired when the server acknowledges receipt of the message (RPC response OK). */
  onAck?: (runId: string | null) => void;
}

export interface QueuedMessage {
  id: string;
  agentId: string;
  sessionKey: string;
  message: string;
  callbacks: WSStreamCallbacks;
  modelOverride?: string;
  systemPrompt?: string;
  queuedAt: number;
}

export type StreamStallState = 'stalling' | 'retrying' | 'clear';
export interface StreamStallInfo {
  state: StreamStallState;
  agentId: string;
  sessionKey: string;
  stalledSince?: number;
  elapsedMs?: number;
}

export type StateListener = (state: WSState, info: WSStateInfo) => void;
export type StreamChangeListener = (streams: ActiveStream[]) => void;
export type QueueListener = (queue: QueuedMessage[]) => void;
export type StreamStallListener = (info: StreamStallInfo) => void;
export type HealthListener = (up: boolean) => void;

export type CrossTabMessage =
  | { type: 'stream-update'; streams: ActiveStream[] }
  | { type: 'ws-state'; state: WSState; errorMessage?: string }
  | { type: 'queue-update'; count: number };
