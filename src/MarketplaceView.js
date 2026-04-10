import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from 'react';
import { mib007Link } from './chat-utils';
// ── Helpers ───────────────────────────────────────────────────────────
function tierColor(tier) {
    switch (tier) {
        case 'c-suite':
            return '#f59e0b';
        case 'specialist':
        case 'professional':
            return '#a78bfa';
        case 'council':
            return '#60a5fa';
        case 'enterprise':
            return '#f59e0b';
        case 'starter':
            return '#38bdf8';
        case 'free':
            return '#4ade80';
        default:
            return '#4ade80';
    }
}
function tierBg(tier) {
    return tierColor(tier) + '18';
}
function priceLabel(item) {
    if ('price' in item && typeof item.price === 'number') {
        return item.price === 0 ? 'Free' : `$${item.price}/mo`;
    }
    const pt = item.pricing_tier;
    return pt === 'free' ? 'Free' : pt ? pt.charAt(0).toUpperCase() + pt.slice(1) : 'Free';
}
async function fetchJson(path) {
    try {
        const r = await fetch(path);
        if (!r.ok)
            return null;
        return r.json();
    }
    catch {
        return null;
    }
}
// ── Icon mapping (emoji fallback for catalog icons) ──────────────────
const ICON_MAP = {
    ShoppingCart: '\uD83D\uDED2',
    Warehouse: '\uD83C\uDFED',
    DollarSign: '\uD83D\uDCB2',
    Mail: '\u2709\uFE0F',
    MessageSquare: '\uD83D\uDCAC',
    CheckSquare: '\u2611\uFE0F',
    Store: '\uD83C\uDFEA',
    Database: '\uD83D\uDDC4\uFE0F',
    Shield: '\uD83D\uDEE1\uFE0F',
    Server: '\uD83D\uDDA5\uFE0F',
    Megaphone: '\uD83D\uDCE3',
    Hammer: '\uD83D\uDD28',
    Compass: '\uD83E\uDDED',
    ShieldCheck: '\u2705',
    Building2: '\uD83C\uDFE2',
    Activity: '\uD83D\uDCC8',
    Link: '\uD83D\uDD17',
    Calculator: '\uD83E\uDDEE',
    Eye: '\uD83D\uDC41\uFE0F',
    Headphones: '\uD83C\uDFA7',
    Settings: '\u2699\uFE0F',
    Cloud: '\u2601\uFE0F',
    CreditCard: '\uD83D\uDCB3',
    Cpu: '\uD83E\uDDE0',
    HardDrive: '\uD83D\uDCBE',
    Send: '\uD83D\uDCE8',
    CalendarDays: '\uD83D\uDCC5',
    Radio: '\uD83D\uDCE1',
    CircleDot: '\uD83D\uDD34',
    FolderKanban: '\uD83D\uDCC1',
    LayoutDashboard: '\uD83D\uDCCA',
    BarChart3: '\uD83D\uDCC8',
};
function iconEmoji(icon) {
    return icon ? (ICON_MAP[icon] ?? '\uD83D\uDCE6') : '\uD83D\uDCE6';
}
// ── Main Component ────────────────────────────────────────────────────
export function MarketplaceView() {
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('available');
    const [section, setSection] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedType, setSelectedType] = useState('app');
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');
    // ── Fetch catalog from shre-marketplace via serve.js proxy ──
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            // Try marketplace catalog first, fallback to agents-only endpoint
            let data = await fetchJson('/api/marketplace/catalog');
            if (!data && !cancelled) {
                // Fallback: build partial catalog from shre-hr agents endpoint
                const agentData = await fetchJson('/api/marketplace/agents');
                if (agentData && !cancelled) {
                    const raw = agentData;
                    const agents = Array.isArray(raw) ? raw : Array.isArray(raw?.agents) ? raw.agents : [];
                    data = {
                        apps: [],
                        agents: agents.map((a) => ({
                            id: a.id,
                            name: a.displayName || a.name || a.id,
                            title: a.title || a.department || '',
                            description: a.bio || '',
                            category: a.tier || 'business',
                            skills: a.strengths || a.skills || [],
                            price: 0,
                            currency: 'USD',
                            billing: 'per-month',
                            status: 'available',
                        })),
                        bundles: [],
                        nodes: [],
                        services: [],
                        total: { apps: 0, agents: agents.length, bundles: 0, nodes: 0, services: 0 },
                    };
                }
            }
            if (cancelled)
                return;
            if (!data) {
                setError('Could not load marketplace catalog. Is shre-marketplace running on port 5458?');
                setLoading(false);
                return;
            }
            setCatalog(data);
            setLoading(false);
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);
    // ── Open detail modal ──
    async function openDetail(item, type) {
        setSelectedItem(item);
        setSelectedType(type);
        setDetail(null);
        if (type !== 'bundle') {
            setDetailLoading(true);
            const d = await fetchJson(`/api/marketplace/catalog/detail/${item.id}`);
            setDetail(d);
            setDetailLoading(false);
        }
    }
    // ── Filter + search ──
    const searchLower = search.toLowerCase();
    const filteredApps = useMemo(() => {
        if (!catalog)
            return [];
        let list = catalog.apps;
        if (categoryFilter !== 'all')
            list = list.filter((a) => a.category === categoryFilter);
        if (searchLower)
            list = list.filter((a) => a.name.toLowerCase().includes(searchLower) ||
                a.description.toLowerCase().includes(searchLower));
        return list;
    }, [catalog, categoryFilter, searchLower]);
    const filteredAgents = useMemo(() => {
        if (!catalog)
            return [];
        let list = catalog.agents;
        if (categoryFilter !== 'all')
            list = list.filter((a) => a.category === categoryFilter);
        if (searchLower)
            list = list.filter((a) => a.name.toLowerCase().includes(searchLower) ||
                a.description.toLowerCase().includes(searchLower));
        return list;
    }, [catalog, categoryFilter, searchLower]);
    const filteredBundles = useMemo(() => {
        if (!catalog)
            return [];
        if (searchLower)
            return catalog.bundles.filter((b) => b.name.toLowerCase().includes(searchLower) ||
                b.description.toLowerCase().includes(searchLower));
        return catalog.bundles;
    }, [catalog, searchLower]);
    // All categories across apps + agents
    const allCategories = useMemo(() => {
        if (!catalog)
            return [];
        const cats = new Set();
        catalog.apps.forEach((a) => cats.add(a.category));
        catalog.agents.forEach((a) => cats.add(a.category));
        return Array.from(cats).sort();
    }, [catalog]);
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full overflow-hidden", style: { background: 'var(--c-bg-1)' }, children: [_jsxs("div", { className: "px-4 py-3 flex items-center gap-3 justify-between shrink-0", style: { borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-text-3)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" }), _jsx("line", { x1: "3", y1: "7", x2: "21", y2: "7" })] }), _jsx("span", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Marketplace" }), catalog && (_jsxs("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: [(catalog.total.apps || 0) + (catalog.total.agents || 0), " items"] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => window.open('/app-marketplace', '_blank'), className: "px-2 py-1 rounded text-[11px] font-medium transition-colors", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-3)',
                                    border: '1px solid var(--c-border-2)',
                                }, children: "Full Store" }), _jsx("button", { onClick: () => window.open(mib007Link('marketplace'), '_blank'), className: "px-2 py-1 rounded text-[11px] font-medium transition-colors", style: {
                                    background: 'var(--c-bg-2)',
                                    color: 'var(--c-text-3)',
                                    border: '1px solid var(--c-border-2)',
                                }, children: "MIB007" })] })] }), _jsxs("div", { className: "px-4 py-2 flex items-center gap-2 flex-wrap shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [['available', 'active'].map((t) => (_jsx("button", { onClick: () => setTab(t), className: "px-2.5 py-1 rounded text-[11px] font-semibold capitalize", style: {
                            background: tab === t ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                            color: tab === t ? '#fff' : 'var(--c-text-3)',
                            border: `1px solid ${tab === t ? 'transparent' : 'var(--c-border-2)'}`,
                        }, children: t }, t))), _jsx("div", { style: { width: 1, height: 16, background: 'var(--c-border-2)', margin: '0 4px' } }), ['all', 'apps', 'agents', 'bundles'].map((s) => (_jsx("button", { onClick: () => setSection(s), className: "px-2 py-0.5 rounded text-[10px] font-medium capitalize", style: {
                            background: section === s ? 'var(--c-bg-3)' : 'transparent',
                            color: section === s ? 'var(--c-text-1)' : 'var(--c-text-4)',
                        }, children: s }, s))), _jsxs("div", { className: "ml-auto relative", children: [_jsxs("svg", { className: "absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3", style: { color: 'var(--c-text-5)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { type: "text", placeholder: "Search...", value: search, onChange: (e) => setSearch(e.target.value), className: "pl-7 pr-2 py-1 rounded text-[11px]", style: {
                                    width: 160,
                                    background: 'var(--c-bg-2)',
                                    border: '1px solid var(--c-border-2)',
                                    color: 'var(--c-text-1)',
                                    outline: 'none',
                                } })] })] }), (section === 'all' || section === 'apps' || section === 'agents') &&
                allCategories.length > 0 && (_jsxs("div", { className: "px-4 py-1.5 flex gap-1.5 overflow-x-auto shrink-0", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("button", { onClick: () => setCategoryFilter('all'), className: "px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0", style: {
                            background: categoryFilter === 'all' ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                            color: categoryFilter === 'all' ? '#fff' : 'var(--c-text-4)',
                            border: `1px solid ${categoryFilter === 'all' ? 'transparent' : 'var(--c-border-2)'}`,
                        }, children: "All" }), allCategories.map((cat) => (_jsx("button", { onClick: () => setCategoryFilter(cat), className: "px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0", style: {
                            background: categoryFilter === cat ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                            color: categoryFilter === cat ? '#fff' : 'var(--c-text-4)',
                            border: `1px solid ${categoryFilter === cat ? 'transparent' : 'var(--c-border-2)'}`,
                        }, children: cat }, cat)))] })), _jsxs("div", { className: "flex-1 overflow-y-auto p-4", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx("div", { className: "animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), error && (_jsx("div", { className: "rounded-lg px-4 py-3 text-sm text-center", style: {
                            background: 'rgba(239,68,68,0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.2)',
                        }, children: error })), catalog && (_jsxs(_Fragment, { children: [(section === 'all' || section === 'apps') && filteredApps.length > 0 && (_jsxs("div", { className: "mb-6", children: [_jsxs("h3", { className: "text-[12px] font-semibold mb-2", style: {
                                            color: 'var(--c-text-4)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }, children: ["Applications (", filteredApps.length, ")"] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2", children: filteredApps.map((app) => (_jsxs("button", { onClick: () => openDetail(app, 'app'), className: "text-left rounded-lg p-3 transition-all", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-border-2)';
                                                e.currentTarget.style.transform = 'none';
                                            }, children: [_jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [_jsx("span", { className: "text-lg", children: iconEmoji(app.icon) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[12px] font-semibold truncate", style: { color: 'var(--c-text-1)' }, children: app.name }), _jsx("div", { className: "text-[10px] capitalize", style: { color: 'var(--c-text-5)' }, children: app.category })] }), _jsx("span", { className: "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0", style: {
                                                                background: tierBg(app.pricing_tier),
                                                                color: tierColor(app.pricing_tier),
                                                            }, children: priceLabel(app) })] }), _jsx("p", { className: "text-[10px] line-clamp-2", style: { color: 'var(--c-text-3)', lineHeight: 1.4 }, children: app.description })] }, app.id))) })] })), (section === 'all' || section === 'agents') && filteredAgents.length > 0 && (_jsxs("div", { className: "mb-6", children: [_jsxs("h3", { className: "text-[12px] font-semibold mb-2", style: {
                                            color: 'var(--c-text-4)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }, children: ["AI Agents (", filteredAgents.length, ")"] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2", children: filteredAgents.map((agent) => (_jsxs("button", { onClick: () => openDetail(agent, 'agent'), className: "text-left rounded-lg p-3 transition-all", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, onMouseEnter: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.borderColor = 'var(--c-border-2)';
                                                e.currentTarget.style.transform = 'none';
                                            }, children: [_jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [_jsx("span", { className: "text-lg", children: iconEmoji(agent.icon) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[12px] font-semibold truncate", style: { color: 'var(--c-text-1)' }, children: agent.name }), _jsx("div", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: agent.title || agent.category })] }), _jsx("span", { className: "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0", style: {
                                                                background: tierBg(agent.category),
                                                                color: tierColor(agent.category),
                                                            }, children: agent.category })] }), _jsx("p", { className: "text-[10px] line-clamp-2 mb-2", style: { color: 'var(--c-text-3)', lineHeight: 1.4 }, children: agent.description }), agent.skills.length > 0 && (_jsxs("div", { className: "flex flex-wrap gap-1", children: [agent.skills.slice(0, 3).map((s) => (_jsx("span", { className: "px-1.5 py-0.5 rounded text-[8px]", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: s }, s))), agent.skills.length > 3 && (_jsxs("span", { className: "text-[8px] self-center", style: { color: 'var(--c-text-5)' }, children: ["+", agent.skills.length - 3] }))] })), _jsxs("div", { className: "flex items-center justify-between mt-2", children: [_jsx("span", { className: "text-[11px] font-bold", style: { color: agent.price === 0 ? '#4ade80' : 'var(--c-text-1)' }, children: priceLabel(agent) }), _jsx("span", { className: "text-[9px] px-2 py-0.5 rounded-full font-medium", style: {
                                                                background: agent.status === 'available'
                                                                    ? 'rgba(74,222,128,0.1)'
                                                                    : 'rgba(161,161,170,0.1)',
                                                                color: agent.status === 'available' ? '#4ade80' : 'var(--c-text-5)',
                                                            }, children: agent.status === 'available' ? 'Available' : 'Coming Soon' })] })] }, agent.id))) })] })), (section === 'all' || section === 'bundles') && filteredBundles.length > 0 && (_jsxs("div", { className: "mb-6", children: [_jsxs("h3", { className: "text-[12px] font-semibold mb-2", style: {
                                            color: 'var(--c-text-4)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }, children: ["Bundles (", filteredBundles.length, ")"] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2", children: filteredBundles.map((bundle) => (_jsxs("button", { onClick: () => openDetail(bundle, 'bundle'), className: "text-left rounded-lg p-3 transition-all relative", style: {
                                                background: bundle.popular
                                                    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))'
                                                    : 'var(--c-bg-2)',
                                                border: `1px solid ${bundle.popular ? 'rgba(99,102,241,0.3)' : 'var(--c-border-2)'}`,
                                            }, onMouseEnter: (e) => {
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.transform = 'none';
                                            }, children: [bundle.popular && (_jsx("span", { className: "absolute -top-2 right-3 text-[8px] font-bold uppercase px-2 py-0.5 rounded-full", style: { background: 'var(--c-accent, #6366f1)', color: '#fff' }, children: "Popular" })), _jsx("div", { className: "text-[12px] font-semibold mb-1", style: { color: 'var(--c-text-1)' }, children: bundle.name }), _jsx("p", { className: "text-[10px] mb-2", style: { color: 'var(--c-text-3)', lineHeight: 1.4 }, children: bundle.description }), _jsxs("div", { className: "flex flex-wrap gap-1 mb-2", children: [bundle.agents.slice(0, 4).map((a) => (_jsx("span", { className: "px-1.5 py-0.5 rounded text-[8px]", style: { background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }, children: a }, a))), bundle.agents.length > 4 && (_jsxs("span", { className: "text-[8px] self-center", style: { color: 'var(--c-text-5)' }, children: ["+", bundle.agents.length - 4] }))] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "text-[12px] font-bold", style: { color: 'var(--c-text-1)' }, children: ["$", bundle.price, "/mo"] }), bundle.savings && (_jsxs("span", { className: "text-[9px] font-medium", style: { color: '#4ade80' }, children: ["Save ", bundle.savings] }))] })] }, bundle.id))) })] })), filteredApps.length === 0 &&
                                filteredAgents.length === 0 &&
                                filteredBundles.length === 0 && (_jsx("div", { className: "text-center py-12", children: _jsx("p", { className: "text-[13px]", style: { color: 'var(--c-text-4)' }, children: "No items match your search." }) }))] }))] }), selectedItem && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center", style: { background: 'rgba(0,0,0,0.6)' }, onClick: () => {
                    setSelectedItem(null);
                    setDetail(null);
                }, children: _jsxs("div", { className: "rounded-xl p-5 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto", style: { background: 'var(--c-bg-1)', border: '1px solid var(--c-border-1)' }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("span", { className: "text-2xl", children: iconEmoji(selectedItem.icon) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h2", { className: "text-base font-bold", style: { color: 'var(--c-text-1)' }, children: selectedItem.name }), _jsxs("p", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: [selectedItem.title || selectedItem.category || '', detail?.detail?.developer && ` — ${detail.detail.developer}`] })] }), _jsx("span", { className: "text-[10px] font-bold uppercase px-2 py-1 rounded", style: {
                                        background: tierBg(selectedItem.category || selectedItem.pricing_tier),
                                        color: tierColor(selectedItem.category || selectedItem.pricing_tier),
                                    }, children: selectedType === 'agent'
                                        ? selectedItem.category
                                        : selectedItem.pricing_tier || 'free' })] }), _jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("span", { className: "text-lg font-bold", style: { color: 'var(--c-text-1)' }, children: priceLabel(selectedItem) }), detail?.detail?.rating && (_jsxs("span", { className: "text-[11px]", style: { color: '#f59e0b' }, children: ['★'.repeat(Math.floor(detail.detail.rating)), " ", detail.detail.rating, " (", detail.detail.reviews ?? 0, " reviews)"] })), detail?.detail?.installs && (_jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [detail.detail.installs, " installs"] }))] }), _jsx("p", { className: "text-[11px] mb-3", style: { color: 'var(--c-text-3)', lineHeight: 1.6 }, children: detail?.detail?.longDescription || selectedItem.description }), detail?.detail?.whatsNew && (_jsxs("div", { className: "mb-3 p-2.5 rounded-lg", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "text-[10px] font-semibold mb-1 flex items-center gap-1.5", style: { color: 'var(--c-text-2)' }, children: [_jsx("span", { style: {
                                                width: 5,
                                                height: 5,
                                                borderRadius: '50%',
                                                background: '#4ade80',
                                                display: 'inline-block',
                                            } }), "What's New", detail.detail.version && ` — v${detail.detail.version}`] }), _jsx("p", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: detail.detail.whatsNew })] })), selectedType === 'agent' && selectedItem.skills?.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase mb-1.5", style: { color: 'var(--c-text-5)' }, children: "Skills" }), _jsx("div", { className: "flex flex-wrap gap-1", children: selectedItem.skills.map((s) => (_jsx("span", { className: "px-2 py-0.5 rounded text-[10px]", style: {
                                            background: 'var(--c-bg-2)',
                                            color: 'var(--c-text-3)',
                                            border: '1px solid var(--c-border-2)',
                                        }, children: s }, s))) })] })), detail?.detail?.features && detail.detail.features.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase mb-1.5", style: { color: 'var(--c-text-5)' }, children: "Features" }), _jsx("ul", { className: "space-y-1", children: detail.detail.features.map((f, i) => (_jsxs("li", { className: "flex items-center gap-2 text-[10px]", style: { color: 'var(--c-text-3)' }, children: [_jsx("span", { style: {
                                                    width: 4,
                                                    height: 4,
                                                    borderRadius: '50%',
                                                    background: '#4ade80',
                                                    flexShrink: 0,
                                                } }), f] }, i))) })] })), selectedType === 'bundle' && selectedItem.agents?.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsxs("h3", { className: "text-[10px] font-semibold uppercase mb-1.5", style: { color: 'var(--c-text-5)' }, children: ["Included Agents (", selectedItem.agents.length, ")"] }), _jsx("div", { className: "flex flex-wrap gap-1", children: selectedItem.agents.map((a) => (_jsx("span", { className: "px-2 py-0.5 rounded text-[10px]", style: {
                                            background: 'var(--c-bg-2)',
                                            color: 'var(--c-text-3)',
                                            border: '1px solid var(--c-border-2)',
                                        }, children: a }, a))) })] })), detail?.detail?.permissions && detail.detail.permissions.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsx("h3", { className: "text-[10px] font-semibold uppercase mb-1.5", style: { color: 'var(--c-text-5)' }, children: "Permissions" }), _jsx("div", { className: "flex flex-wrap gap-1", children: detail.detail.permissions.map((p) => (_jsx("span", { className: "px-2 py-0.5 rounded text-[10px]", style: {
                                            background: 'rgba(99,102,241,0.08)',
                                            color: 'var(--c-accent, #6366f1)',
                                            border: '1px solid rgba(99,102,241,0.15)',
                                        }, children: p }, p))) })] })), detail?.detail && (_jsxs("div", { className: "grid grid-cols-3 gap-2 mb-4", children: [detail.detail.version && (_jsxs("div", { className: "rounded-lg p-2 text-center", style: { background: 'var(--c-bg-2)' }, children: [_jsx("div", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: "Version" }), _jsx("div", { className: "text-[11px] font-bold", style: { color: 'var(--c-text-1)' }, children: detail.detail.version })] })), detail.detail.updatedAt && (_jsxs("div", { className: "rounded-lg p-2 text-center", style: { background: 'var(--c-bg-2)' }, children: [_jsx("div", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: "Updated" }), _jsx("div", { className: "text-[11px] font-bold", style: { color: 'var(--c-text-1)' }, children: detail.detail.updatedAt })] })), detail.detail.size && (_jsxs("div", { className: "rounded-lg p-2 text-center", style: { background: 'var(--c-bg-2)' }, children: [_jsx("div", { className: "text-[9px]", style: { color: 'var(--c-text-5)' }, children: "Size" }), _jsx("div", { className: "text-[11px] font-bold", style: { color: 'var(--c-text-1)' }, children: detail.detail.size })] }))] })), detailLoading && (_jsx("div", { className: "flex items-center justify-center py-4", children: _jsx("div", { className: "animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full", style: { color: 'var(--c-text-5)' } }) })), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx("button", { onClick: () => {
                                        alert(`${selectedType === 'bundle' ? 'Bundle' : selectedType === 'agent' ? 'Agent' : 'App'} "${selectedItem.name}" activation requested.\n\nThis will provision the workspace and wire the pipeline.`);
                                    }, className: "flex-1 py-2 rounded-lg text-[12px] font-semibold text-center transition-colors", style: {
                                        background: selectedItem.status === 'coming_soon'
                                            ? 'var(--c-bg-3)'
                                            : 'var(--c-accent, #6366f1)',
                                        color: selectedItem.status === 'coming_soon' ? 'var(--c-text-5)' : '#fff',
                                        cursor: selectedItem.status === 'coming_soon' ? 'default' : 'pointer',
                                    }, children: selectedItem.status === 'coming_soon'
                                        ? 'Coming Soon'
                                        : selectedType === 'bundle'
                                            ? 'Subscribe'
                                            : selectedType === 'agent'
                                                ? 'Activate Agent'
                                                : 'Activate' }), _jsx("button", { onClick: () => {
                                        setSelectedItem(null);
                                        setDetail(null);
                                    }, className: "px-4 py-2 rounded-lg text-[12px] transition-colors", style: {
                                        background: 'var(--c-bg-2)',
                                        color: 'var(--c-text-3)',
                                        border: '1px solid var(--c-border-2)',
                                    }, children: "Close" })] })] }) }))] }));
}
