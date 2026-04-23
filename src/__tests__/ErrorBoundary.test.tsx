// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

// Throws on render — used to trigger the boundary's error state.
function Bomb({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;

  afterEach(() => {
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('ok');
  });

  it('renders fallback UI when child throws', () => {
    // Suppress the expected React error logs so test output stays clean.
    console.error = vi.fn();
    render(
      <ErrorBoundary>
        <Bomb message="boom" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear Data/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Error' })).toBeInTheDocument();
  });

  it('truncates very long error messages', () => {
    console.error = vi.fn();
    const long = 'X'.repeat(500);
    render(
      <ErrorBoundary>
        <Bomb message={long} />
      </ErrorBoundary>,
    );
    // 200 Xs + '...' means the 201st char onwards is the ellipsis
    const msg = screen.getByText(/X+/).textContent ?? '';
    expect(msg.length).toBeLessThanOrEqual(203);
    expect(msg.endsWith('...')).toBe(true);
  });

  it('calls window.location.reload on Reload click', () => {
    console.error = vi.fn();
    const reload = vi.fn();
    // @ts-expect-error — writable override for test
    delete window.location;
    // @ts-expect-error — minimal stub
    window.location = { reload };

    render(
      <ErrorBoundary>
        <Bomb message="oops" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('toggles "Copied!" label after Copy Error click', async () => {
    console.error = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <Bomb message="copy-me" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy Error' }));

    // Wait for the microtask to run so the .then handler fires.
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('copy-me'));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });
});
