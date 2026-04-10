import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { ECOSYSTEM_APPS, MARKETPLACE_EMBED_APPS } from '../chat-utils';
export function AppsDrawer({ onClose }) {
    const [embedApp, setEmbedApp] = useState(null);
    // Fetch activated marketplace apps
    const [marketplaceApps, setMarketplaceApps] = useState([]);
    useEffect(() => {
        fetch('/api/marketplace/activated-apps')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
            const appIds = data.appIds || [];
            const embedded = [];
            for (const appId of appIds) {
                const entry = MARKETPLACE_EMBED_APPS[appId];
                if (entry)
                    embedded.push(entry);
            }
            setMarketplaceApps(embedded);
        })
            .catch(() => { });
    }, []);
    const allApps = [...ECOSYSTEM_APPS, ...marketplaceApps];
    // ── Fullscreen iframe for embeddable apps ──
    if (embedApp) {
        return (_jsxs("div", { className: "flex flex-col", style: {
                position: 'absolute',
                inset: 0,
                zIndex: 50,
                background: 'var(--c-bg-1)',
            }, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-1.5 shrink-0", style: {
                        background: 'var(--c-bg-2)',
                        borderBottom: '1px solid var(--c-border-1)',
                    }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => setEmbedApp(null), className: "h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-colors hover:bg-white/10", style: { color: 'var(--c-text-2)' }, children: [_jsx("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "15 18 9 12 15 6" }) }), "Apps"] }), _jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-text-1)' }, children: embedApp.name })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => window.open(embedApp.url, embedApp.id, 'noopener,noreferrer'), className: "h-7 px-2 rounded-md text-xs transition-colors hover:bg-white/10", style: { color: 'var(--c-text-3)' }, title: "Open in new window", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), _jsx("polyline", { points: "15 3 21 3 21 9" }), _jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })] }) }), _jsx("button", { onClick: () => {
                                        setEmbedApp(null);
                                        onClose();
                                    }, className: "h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10", style: { color: 'var(--c-text-3)' }, "aria-label": "Close", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsx("iframe", { src: embedApp.url, className: "flex-1 w-full border-0", allow: "clipboard-write; clipboard-read", sandbox: "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox", title: embedApp.name })] }));
    }
    // ── App grid ──
    return (_jsxs("div", { className: "px-4 py-3 shrink-0 relative", style: {
            background: 'var(--c-bg-2)',
            borderBottom: '1px solid var(--c-border-1)',
        }, children: [_jsx("button", { onClick: onClose, className: "absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10", style: { color: 'var(--c-text-3)' }, "aria-label": "Close apps", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) }), _jsx("div", { className: "grid gap-2 justify-items-center", style: {
                    gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                }, children: allApps.map((app) => (_jsxs("button", { onClick: () => {
                        if (app.embed) {
                            setEmbedApp({ id: app.id, name: app.name, url: app.url });
                        }
                        else {
                            window.open(app.url, app.id, 'noopener,noreferrer');
                            onClose();
                        }
                    }, className: "flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all group", title: app.description, children: [_jsx("div", { className: `h-9 w-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white text-[11px] font-bold group-hover:scale-105 transition-transform`, children: app.icon }), _jsx("span", { className: "text-[9px] font-medium truncate max-w-[56px]", style: { color: 'var(--c-text-2)' }, children: app.name })] }, app.id))) })] }));
}
