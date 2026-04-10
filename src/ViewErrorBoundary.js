import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
/**
 * Lightweight per-view error boundary. Catches crashes in a single view
 * (e.g. VoiceAssistant, BriefingView) and shows an inline retry fallback
 * instead of blanking the entire app.
 */
export class ViewErrorBoundary extends Component {
    state = { hasError: false, error: null };
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error(`[ViewErrorBoundary:${this.props.viewName}]`, error, info.componentStack);
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
        const isOverlay = this.props.viewName === 'Voice Assistant';
        return (_jsxs("div", { style: isOverlay ? styles.overlayContainer : styles.container, children: [_jsx("div", { style: styles.icon, children: "!" }), _jsx("div", { style: styles.title, children: this.props.viewName }), _jsx("div", { style: styles.subtitle, children: "Something went wrong" }), _jsx("pre", { style: styles.code, children: truncated }), _jsx("button", { style: styles.btn, onClick: this.handleRetry, children: "Retry" })] }));
    }
}
const styles = {
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
        textAlign: 'center',
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
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--c-danger-soft, #fca5a5)',
        maxHeight: 80,
        overflowY: 'auto',
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
