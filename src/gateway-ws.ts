/**
 * OpenClaw Gateway WebSocket Client
 *
 * Connects to OpenClaw via WebSocket (same protocol as native chat UI).
 * This ensures Shre Chat and OpenClaw share the same sessions.
 *
 * Features:
 * - Auto-reconnect with exponential backoff via partysocket (1s -> 2s -> 4s -> 8s -> 16s max)
 * - Heartbeat ping every 30s to detect dead connections
 * - Auto-reconnect before send if connection dropped
 *
 * This file is a thin orchestrator — implementation split across gateway/ modules.
 */

// Re-export types
export type {
  WSState,
  WSStateInfo,
  ActiveStream,
  WSStreamCallbacks,
  QueuedMessage,
  StreamStallState,
  StreamStallInfo,
} from "./gateway/ws-types";

// Re-export token management
export { clearGatewayToken } from "./gateway/ws-token";

// Re-export state/listeners
export {
  onStateChange,
  getStateInfo,
  onStreamChange,
  getActiveStreams,
  isAgentStreaming,
  onQueueChange,
  getMessageQueue,
  onStreamStall,
  onHealthChange,
  getLastHealth,
} from "./gateway/ws-state";

// Re-export connection management
export {
  connectGateway,
  isWSConnected,
  retryConnection,
  disconnectGateway,
  startHealthPoll,
  stopHealthPoll,
} from "./gateway/ws-connection";

// Re-export queue
export { queueMessage, dequeueMessage } from "./gateway/ws-queue";

// Re-export chat operations
export {
  sendChatWS,
  setModelWS,
  abortChatWS,
  abortAllStreams,
  loadHistoryWS,
} from "./gateway/ws-chat";
