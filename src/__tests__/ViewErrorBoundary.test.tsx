// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { ViewErrorBoundary } from '../ViewErrorBoundary';

function Bomb({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

// Wrapper that can be flipped after mount to simulate "fix the bug, retry".
function ToggleBomb({ initial }: { initial: boolean }): React.ReactElement {
  const [crashed] = useState(initial);
  if (crashed) throw new Error('boom');
  return <div data-testid="recovered">ok</div>;
}

describe('ViewErrorBoundary', () => {
  const originalConsoleError = console.error;

  afterEach(() => {
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ViewErrorBoundary viewName="Tasks">
        <div data-testid="inner">ok</div>
      </ViewErrorBoundary>,
    );
    expect(screen.getByTestId('inner')).toHaveTextContent('ok');
  });

  it('renders inline fallback with view name when child throws', () => {
    console.error = vi.fn();
    render(
      <ViewErrorBoundary viewName="Briefing">
        <Bomb message="crashed" />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText('Briefing')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('crashed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('truncates long error messages to 120 chars + ...', () => {
    console.error = vi.fn();
    const long = 'Y'.repeat(200);
    render(
      <ViewErrorBoundary viewName="X">
        <Bomb message={long} />
      </ViewErrorBoundary>,
    );
    const text = screen.getByText(/Y+/).textContent ?? '';
    expect(text.length).toBeLessThanOrEqual(123);
    expect(text.endsWith('...')).toBe(true);
  });

  it('clicking Retry resets the error state (children render again)', () => {
    console.error = vi.fn();
    // Mount with crashed state; Retry should clear boundary so children mount fresh.
    const { rerender } = render(
      <ViewErrorBoundary viewName="Reports">
        <ToggleBomb initial={true} />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText('Reports')).toBeInTheDocument();

    // Swap child to non-crashing BEFORE clicking Retry so the remount succeeds.
    rerender(
      <ViewErrorBoundary viewName="Reports">
        <ToggleBomb initial={false} />
      </ViewErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('recovered')).toHaveTextContent('ok');
  });
});
