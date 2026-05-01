// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TaskPanel } from '../components/TaskPanel';
import type { TaskTraceDetails } from '../hooks/useTaskTracker';

describe('TaskPanel trace tab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders execution plan steps alongside the route timeline', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'evt-1',
          event_type: 'task.updated',
          message: 'Task approved for execution',
          agent: 'user',
          source: 'approval-gate',
          created_at: Date.now(),
        },
        {
          id: 'evt-2',
          event_type: 'task.updated',
          message: 'Task dispatched to fleet',
          agent: 'shre-tasks',
          source: 'intake',
          created_at: Date.now() - 1000,
        },
      ],
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TaskPanel
        task={{
          id: 'task-1',
          title: 'Process vendor reorder',
          status: 'in_progress',
          created_at: Date.now(),
          trace_id: 'trace-123',
          session_id: 'session-abc',
          dispatch_status: 'dispatched',
          task_memory: JSON.stringify({
            packet: {
              workflowId: 'wf-123',
              sourceAppId: 'pos',
              securityMode: 'fail-safe',
              nodes: [{ id: 'n1', appId: 'pos', role: 'source' }],
              pipes: [],
              requestedScopes: { vault: false, memory: false, database: false },
            },
          }),
        }}
        onClose={vi.fn()}
        onUpdateTask={vi.fn(async () => ({}))}
        fetchSubtasks={vi.fn(async () => [])}
        fetchTrace={vi.fn(
          async (): Promise<TaskTraceDetails> => ({
            steps: [
              { name: 'route', status: 'ok', duration_ms: 9 },
              { name: 'tool', status: 'running', duration_ms: 42 },
            ],
            executionPlan: [
              {
                stepId: 'step-2',
                order: 2,
                type: 'email',
                title: 'Notify vendor',
                status: 'delegated',
                queryText: 'Send vendor email',
              },
              {
                stepId: 'step-1',
                order: 1,
                type: 'task',
                title: 'Draft reorder',
                status: 'done',
                taskId: 'task-draft-1',
              },
            ],
          }),
        )}
      />,
    );

    expect(screen.getByText('Published + dispatched')).toBeTruthy();
    expect(screen.getByText('Fleet: dispatched')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /trace route/i }));

    await waitFor(() => {
      expect(screen.getByText('Execution plan')).toBeTruthy();
    });

    expect(screen.getByText('1. Draft reorder')).toBeTruthy();
    expect(screen.getByText('2. Notify vendor')).toBeTruthy();
    expect(screen.getByText('delegated')).toBeTruthy();
    expect(screen.getByText('task task-dra')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByText('Lifecycle events')).toBeTruthy();
    });
    expect(screen.getByText('Task dispatched to fleet')).toBeTruthy();
  });
});
