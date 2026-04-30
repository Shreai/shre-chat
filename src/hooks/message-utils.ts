// Pure async helpers used by useMessageHandlers.
// Extracted so the hook file stays under the max-lines limit; each takes
// its dependencies explicitly so callers retain control of React state.

import type { ChatMessage } from '../router-client';
import { isDevSafeMode } from '../env';

export async function fetchSuggestions(
  assistantResponse: string,
  setSuggestions: (s: string[]) => void,
): Promise<void> {
  if (isDevSafeMode()) return;
  try {
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: assistantResponse.slice(0, 500) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
      setSuggestions(data.suggestions.slice(0, 3));
    }
  } catch (err) {
    console.debug('fetch suggestions', err);
  }
}

export async function verifyIdentityCode(
  code: string,
  setVerifying: (v: boolean) => void,
  setIdentityVerified: (v: boolean) => void,
): Promise<boolean> {
  setVerifying(true);
  try {
    const res = await fetch('/api/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.verified) {
      sessionStorage.setItem('shre-identity-verified', 'true');
      setIdentityVerified(true);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('identity verify request', err);
    return false;
  } finally {
    setVerifying(false);
  }
}

export async function sendFeedbackToServer(
  msgIndex: number,
  rating: 'like' | 'dislike',
  deps: {
    messages: ChatMessage[];
    activeSessionId: string | null;
    activeAgentId: string | null;
    setStatusLine: (s: string | null) => void;
  },
): Promise<void> {
  const { messages, activeSessionId, activeAgentId, setStatusLine } = deps;
  const assistantMsg = messages[msgIndex];
  if (!assistantMsg || assistantMsg.role !== 'assistant') return;
  let userInput = '';
  for (let k = msgIndex - 1; k >= 0; k--) {
    if (messages[k].role === 'user') {
      userInput = messages[k].content;
      break;
    }
  }
  const workspaceId = activeSessionId ?? 'unknown';
  const feedbackRating = rating === 'like' ? 'positive' : 'negative';
  try {
    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: assistantMsg.id ?? `${workspaceId}-${msgIndex}`,
        workspaceId,
        rating: feedbackRating,
        agentId: activeAgentId ?? 'shre',
        userInput: userInput.slice(0, 500),
        assistantText: assistantMsg.content.slice(0, 500),
      }),
    });
    if (resp.ok) {
      setStatusLine('Feedback saved \u2713');
      setTimeout(() => setStatusLine(null), 2500);
    }
  } catch (err) {
    console.debug('save feedback', err);
  }
}
