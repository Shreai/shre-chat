// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useEscalationListener,
  type UseEscalationListenerOptions,
} from '../hooks/useEscalationListener';

type MessageHandler = (event: { data: string }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: MessageHandler | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }
}

function Harness({
  activeSessionId,
  addMessage,
}: {
  activeSessionId: string | null;
  addMessage: UseEscalationListenerOptions['addMessage'];
}) {
  useEscalationListener({ activeSessionId, addMessage });
  useEffect(() => undefined, []);
  return null;
}

describe('useEscalationListener', () => {
  afterEach(() => {
    MockWebSocket.instances.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes targeted events to the event session instead of the active session', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    const addMessage = vi.fn();
    render(<Harness activeSessionId="nova-session" addMessage={addMessage} />);

    expect(MockWebSocket.instances).toHaveLength(1);

    MockWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: 'chat.message',
        sessionId: 'shre-session',
        content: 'Yesterday sales were $123.45',
        source: 'ellie',
      }),
    });

    await waitFor(() => {
      expect(addMessage).toHaveBeenCalledWith(
        'shre-session',
        expect.objectContaining({
          role: 'assistant',
          content: 'Yesterday sales were $123.45',
        }),
      );
    });
  });
});
