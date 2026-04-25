// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessageTraceDrawer } from '../components/message-parts/MessageTraceDrawer';

describe('MessageTraceDrawer', () => {
  it('renders execution plan steps from the trace payload', () => {
    const traceRecord = JSON.stringify({
      traceId: 'trace-123',
      service: 'shre-router',
      totalMs: 2450,
      status: 'partial',
      spans: [
        { name: 'route', status: 'ok', durationMs: 10 },
        { name: 'tool', status: 'ok', durationMs: 80 },
      ],
      executionPlan: [
        {
          stepId: 'step-2',
          order: 2,
          type: 'reminder',
          title: 'Send reminder',
          status: 'delegated',
          queryText: 'Send reminder tomorrow',
        },
        {
          stepId: 'step-1',
          order: 1,
          type: 'task',
          title: 'Create task',
          status: 'done',
          taskId: 'task-abc123',
        },
        {
          stepId: 'step-3',
          order: 3,
          type: 'query',
          title: 'Check inventory',
          status: 'failed',
          error: 'Missing connector',
        },
      ],
      request: { agentId: 'sales-agent', model: 'auto', promptLen: 88 },
    });

    render(
      <MessageTraceDrawer
        traceId="trace-123"
        traceRecord={traceRecord}
        model="auto"
        totalMs="2450"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /trace/i }));

    expect(screen.getByText('Execution plan')).toBeTruthy();
    expect(screen.getByText('1. Create task')).toBeTruthy();
    expect(screen.getByText('2. Send reminder')).toBeTruthy();
    expect(screen.getByText('3. Check inventory')).toBeTruthy();
    expect(screen.getByText('Delegated')).toBeTruthy();
    expect(screen.getByText('task task-abc')).toBeTruthy();
    expect(screen.getByText('Missing connector')).toBeTruthy();
  });
});
