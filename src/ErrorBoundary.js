import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class ErrorBoundary extends Component {
    state = { hasError: false, error: null, copied: false };
    static getDerivedStateFromError(error) {
        return { hasError: true, error, copied: false };
    }
    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }
    handleReload = () => {
        window.location.reload();
    };
    handleClearAndReload = async () => {
        try {
            localStorage.clear();
        }
        catch (_) {
            void _;
        }
        try {
            const dbs = await indexedDB.databases();
            for (const db of dbs) {
                if (db.name)
                    indexedDB.deleteDatabase(db.name);
            }
        }
        catch (_) {
            void _;
        }
        window.location.reload();
    };
    handleCopyError = () => {
        const { error } = this.state;
        if (!error)
            return;
        const msg = error?.message ?? String(error) ?? 'Unknown error';
        const text = `${msg}\n\n${error?.stack || ''}`;
        navigator.clipboard
            .writeText(text)
            .then(() => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        })
            .catch((err) => {
            console.error('[ErrorBoundary] Failed to copy error to clipboard:', err);
        });
    };
    render() {
        if (!this.state.hasError || !this.state.error) {
            return this.props.children;
        }
        const { error } = this.state;
        const msg = error?.message ?? String(error) ?? 'Unknown error';
        const truncated = msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
        return (_jsx("div", { style: styles.backdrop, children: _jsxs("div", { style: styles.card, children: [_jsx("div", { style: styles.icon, children: "!" }), _jsx("h1", { style: styles.title, children: "Something went wrong" }), _jsx("pre", { style: styles.code, children: truncated }), _jsxs("div", { style: styles.buttons, children: [_jsx("button", { style: styles.btnPrimary, onClick: this.handleReload, children: "Reload" }), _jsx("button", { style: styles.btnDanger, onClick: this.handleClearAndReload, children: "Clear Data & Reload" }), _jsx("button", { style: styles.btnSecondary, onClick: this.handleCopyError, children: this.state.copied ? 'Copied!' : 'Copy Error' })] })] }) }));
    }
}
const styles = {
    backdrop: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'var(--c-bg, #0e0e10)',
        color: 'var(--c-text, #e4e4e7)',
        fontFamily: 'system-ui, sans-serif',
    },
    card: {
        maxWidth: 480,
        width: '90%',
        padding: '2rem',
        border: '1px solid var(--c-border, #27272a)',
        borderRadius: 12,
        background: 'var(--c-bg, #0e0e10)',
        textAlign: 'center',
    },
    icon: {
        width: 48,
        height: 48,
        margin: '0 auto 1rem',
        borderRadius: '50%',
        background: 'var(--c-danger, #dc2626)22',
        color: 'var(--c-danger, #ef4444)',
        fontSize: 24,
        fontWeight: 700,
        lineHeight: '48px',
        textAlign: 'center',
    },
    title: {
        margin: '0 0 1rem',
        fontSize: '1.25rem',
        fontWeight: 600,
    },
    code: {
        margin: '0 0 1.5rem',
        padding: '0.75rem 1rem',
        background: 'var(--c-bg-2, #18181b)',
        border: '1px solid var(--c-border, #27272a)',
        borderRadius: 6,
        fontSize: '0.8rem',
        textAlign: 'left',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowY: 'auto',
        maxHeight: 120,
        color: 'var(--c-danger-soft, #fca5a5)',
    },
    buttons: {
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
    btnPrimary: {
        padding: '0.5rem 1.25rem',
        border: 'none',
        borderRadius: 6,
        background: 'var(--c-accent, #6366f1)',
        color: 'var(--c-on-accent, #fff)',
        fontWeight: 500,
        cursor: 'pointer',
        fontSize: '0.875rem',
    },
    btnDanger: {
        padding: '0.5rem 1.25rem',
        border: '1px solid var(--c-danger, #dc2626)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--c-danger, #ef4444)',
        fontWeight: 500,
        cursor: 'pointer',
        fontSize: '0.875rem',
    },
    btnSecondary: {
        padding: '0.5rem 1.25rem',
        border: '1px solid var(--c-border, #27272a)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--c-text, #e4e4e7)',
        fontWeight: 500,
        cursor: 'pointer',
        fontSize: '0.875rem',
    },
};
