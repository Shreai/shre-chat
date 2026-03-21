// Stub shre-sdk/training for shre-chat (browser-first, can't use full SDK)
// No-op implementations — training data written by shre-router in production

export async function writeConversation(opts) {
  // No-op stub — real implementation in shre-sdk/dist/training.js
}

export function startWALReplay(intervalMs) {
  // No-op stub — WAL replay not needed in browser-first shre-chat
}
