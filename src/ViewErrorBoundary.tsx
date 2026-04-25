import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  viewName?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight per-view error boundary. Catches crashes in a single view
 * (e.g. VoiceAssistant, BriefingView) and shows an inline retry fallback
 * instead of blanking the entire app.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ViewErrorBoundary:${this.props.viewName || 'View'}]`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const msg = this.state.error?.message || 'Unknown error';
    const truncated = msg.length > 120 ? msg.slice(0, 120) + '...' : msg;
    const viewName = this.props.viewName || 'View';
    const isOverlay = viewName === 'Voice Assistant';

    return (
      <div style={isOverlay ? styles.overlayContainer : styles.container}>
        <div style={styles.icon}>!</div>
        <div style={styles.title}>{viewName}</div>
        <div style={styles.subtitle}>Something went wrong</div>
        <pre style={styles.code}>{truncated}</pre>
        <button style={styles.btn} onClick={this.handleRetry}>
          Retry
        </button>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: 'var(--c-text-2, #a1a1aa)',
    gap: '0.5rem',
  },
  overlayContainer: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: 'var(--c-text-2, #a1a1aa)',
    gap: '0.5rem',
    background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--c-danger, #dc2626)22',
    color: 'var(--c-danger, #ef4444)',
    fontSize: 18,
    fontWeight: 700,
    lineHeight: '36px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--c-text-1, #e4e4e7)',
  },
  subtitle: {
    fontSize: '0.8rem',
    color: 'var(--c-text-3, #71717a)',
  },
  code: {
    maxWidth: 360,
    padding: '0.5rem 0.75rem',
    background: 'var(--c-bg-2, #18181b)',
    border: '1px solid var(--c-border, #27272a)',
    borderRadius: 6,
    fontSize: '0.75rem',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: 'var(--c-danger-soft, #fca5a5)',
    maxHeight: 80,
    overflowY: 'auto' as const,
  },
  btn: {
    marginTop: '0.5rem',
    padding: '0.4rem 1rem',
    border: '1px solid var(--c-border, #27272a)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--c-text-1, #e4e4e7)',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
};
