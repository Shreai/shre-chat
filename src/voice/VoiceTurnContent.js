import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * VoiceTurnContent — rich markdown renderer for assistant voice turns.
 * Extracted from VoiceAssistant.tsx.
 */
import { memo, lazy, Suspense } from 'react';
const Markdown = lazy(() => import('react-markdown'));
const DataCard = lazy(() => import('../components/DataCard'));
const remarkGfmPromise = import('remark-gfm').then((m) => m.default);
let remarkGfmPlugin = null;
remarkGfmPromise.then((p) => {
    remarkGfmPlugin = p;
});
export const VoiceTurnContent = memo(function VoiceTurnContent({ text, role, }) {
    if (role === 'user')
        return _jsx(_Fragment, { children: text });
    return (_jsxs(Suspense, { fallback: _jsx("span", { children: text }), children: [_jsx(DataCard, { content: text }), _jsx(Markdown, { remarkPlugins: remarkGfmPlugin ? [remarkGfmPlugin] : [], components: {
                    table({ children }) {
                        return (_jsx("div", { style: {
                                overflowX: 'auto',
                                margin: '8px 0',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.08)',
                            }, children: _jsx("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 }, children: children }) }));
                    },
                    thead({ children }) {
                        return _jsx("thead", { style: { background: 'rgba(255,255,255,0.06)' }, children: children });
                    },
                    th({ children }) {
                        return (_jsx("th", { style: {
                                padding: '6px 10px',
                                textAlign: 'left',
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.6)',
                                borderBottom: '1px solid rgba(255,255,255,0.1)',
                                whiteSpace: 'nowrap',
                            }, children: children }));
                    },
                    td({ children }) {
                        return (_jsx("td", { style: {
                                padding: '5px 10px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                color: 'rgba(255,255,255,0.85)',
                                fontFamily: "'SF Mono', monospace",
                                fontSize: 12,
                            }, children: children }));
                    },
                    strong({ children }) {
                        return (_jsx("strong", { style: { color: 'rgba(255,255,255,0.95)', fontWeight: 600 }, children: children }));
                    },
                    a({ href, children }) {
                        return (_jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", style: { color: 'rgba(96,165,250,0.9)', textDecoration: 'underline' }, children: children }));
                    },
                    ul({ children }) {
                        return (_jsx("ul", { style: { paddingLeft: 16, margin: '4px 0', listStyleType: 'disc' }, children: children }));
                    },
                    ol({ children }) {
                        return (_jsx("ol", { style: { paddingLeft: 16, margin: '4px 0', listStyleType: 'decimal' }, children: children }));
                    },
                    li({ children }) {
                        return _jsx("li", { style: { marginBottom: 2, lineHeight: 1.5 }, children: children });
                    },
                    code({ className, children }) {
                        const isBlock = Boolean(className) || String(children).includes('\n');
                        if (isBlock) {
                            return (_jsx("pre", { style: {
                                    background: 'rgba(0,0,0,0.3)',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    margin: '6px 0',
                                    overflowX: 'auto',
                                    fontSize: 11,
                                    lineHeight: 1.4,
                                }, children: _jsx("code", { style: { fontFamily: "'SF Mono', monospace", color: 'rgba(255,255,255,0.8)' }, children: children }) }));
                        }
                        return (_jsx("code", { style: {
                                background: 'rgba(255,255,255,0.08)',
                                padding: '1px 4px',
                                borderRadius: 3,
                                fontSize: '0.9em',
                                fontFamily: "'SF Mono', monospace",
                            }, children: children }));
                    },
                    p({ children }) {
                        return _jsx("p", { style: { margin: '4px 0', lineHeight: 1.6 }, children: children });
                    },
                    h1({ children }) {
                        return (_jsx("div", { style: {
                                fontSize: 16,
                                fontWeight: 700,
                                margin: '8px 0 4px',
                                color: 'rgba(255,255,255,0.95)',
                            }, children: children }));
                    },
                    h2({ children }) {
                        return (_jsx("div", { style: {
                                fontSize: 15,
                                fontWeight: 600,
                                margin: '6px 0 3px',
                                color: 'rgba(255,255,255,0.9)',
                            }, children: children }));
                    },
                    h3({ children }) {
                        return (_jsx("div", { style: {
                                fontSize: 14,
                                fontWeight: 600,
                                margin: '4px 0 2px',
                                color: 'rgba(255,255,255,0.85)',
                            }, children: children }));
                    },
                    hr() {
                        return (_jsx("hr", { style: {
                                border: 'none',
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                                margin: '8px 0',
                            } }));
                    },
                }, children: text })] }));
});
