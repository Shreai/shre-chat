/**
 * Message queue for offline/reconnecting sends.
 * When a user sends a message while WS is reconnecting, it gets queued
 * and automatically flushed once the connection is re-established.
 */

import type { WSStreamCallbacks } from "./ws-types";
import { messageQueue, notifyQueue, uuid } from "./ws-state";

/** Queue a message for sending when WS reconnects. */
export function queueMessage(
  agentId: string,
  sessionKey: string,
  message: string,
  callbacks: WSStreamCallbacks,
  modelOverride?: string,
  systemPrompt?: string,
): string {
  const id = uuid();
  messageQueue.push({ id, agentId, sessionKey, message, callbacks, modelOverride, systemPrompt, queuedAt: Date.now() });
  notifyQueue();
  return id;
}

/** Remove a queued message by id. */
export function dequeueMessage(id: string): boolean {
  const idx = messageQueue.findIndex((m) => m.id === id);
  if (idx >= 0) {
    messageQueue.splice(idx, 1);
    notifyQueue();
    return true;
  }
  return false;
}

/** Flush all queued messages by sending them via WS. Called on reconnect. */
export async function flushMessageQueue() {
  if (messageQueue.length === 0) return;
  console.log(`[ws] flushing ${messageQueue.length} queued message(s)`);
  // We need to import sendChatWS lazily to avoid circular dependency
  const { sendChatWS } = await import("./ws-chat");
  const toSend = messageQueue.splice(0, messageQueue.length);
  notifyQueue();
  for (const msg of toSend) {
    try {
      await sendChatWS(msg.agentId, msg.sessionKey, msg.message, msg.callbacks, msg.modelOverride, msg.systemPrompt);
    } catch (err) {
      msg.callbacks.onError(`Failed to send queued message: ${err}`);
    }
  }
}
