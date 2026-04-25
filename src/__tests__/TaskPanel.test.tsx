// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TaskPanel } from '../components/TaskPanel';
import type { TaskTraceDetails } from '../hooks/useTaskTracker';

describe('TaskPanel trace tab', () => {
  it('renders execution plan steps alongside the route timeline', async () => {
    render(
      <TaskPanel
        task={{
          id: 'task-1',
          title: 'Process vendor reorder',
          status: 'in_progress',
          created_at: Date.now(),
          trace_id: 'trace-123',
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

    fireEvent.click(screen.getByRole('button', { name: /trace route/i }));

    await waitFor(() => {
      expect(screen.getByText('Execution plan')).toBeTruthy();
    });

    expect(screen.getByText('1. Draft reorder')).toBeTruthy();
    expect(screen.getByText('2. Notify vendor')).toBeTruthy();
    expect(screen.getByText('delegated')).toBeTruthy();
    expect(screen.getByText('task task-dra')).toBeTruthy();
  });
});
