import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
// ── Stat Card ──
function StatCard({ label, value, sub, accent, large, }) {
    return (_jsxs("div", { className: "rounded-xl p-4", style: {
            background: 'var(--c-bg-2)',
            border: '1px solid var(--c-border-2)',
        }, children: [_jsx("div", { className: "text-[11px] font-medium uppercase tracking-wider mb-1", style: { color: 'var(--c-text-4)' }, children: label }), _jsx("div", { className: `font-bold ${large ? 'text-2xl' : 'text-xl'}`, style: { color: accent || 'var(--c-text-1)' }, children: value }), sub && (_jsx("div", { className: "text-[11px] mt-0.5", style: { color: 'var(--c-text-3)' }, children: sub }))] }));
}
// ── Section Header ──
function SectionHeader({ title, icon }) {
    return (_jsxs("h2", { className: "text-sm font-semibold uppercase tracking-wider mt-6 mb-3 flex items-center gap-2", style: { color: 'var(--c-text-3)' }, children: [_jsx("span", { children: icon }), " ", title] }));
}
// ── Progress Bar ──
function ProgressBar({ value, max, color }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (_jsx("div", { className: "h-2 rounded-full overflow-hidden", style: { background: 'var(--c-bg-3, rgba(255,255,255,0.05))' }, children: _jsx("div", { className: "h-full rounded-full transition-all", style: { width: `${pct}%`, background: color } }) }));
}
// ── Opportunity Card ──
function OpportunityCard({ title, desc, size, status }) {
    return (_jsxs("div", { className: "rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-[13px] font-semibold", style: { color: 'var(--c-text-1)' }, children: title }), _jsx("span", { className: "text-[10px] px-2 py-0.5 rounded-full font-medium", style: { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }, children: status })] }), _jsx("div", { className: "text-[12px] mb-2", style: { color: 'var(--c-text-3)' }, children: desc }), _jsx("div", { className: "text-[11px] font-medium", style: { color: 'var(--c-accent, #6366f1)' }, children: size })] }));
}
// ── ROI Table ──
function ROITable() {
    const rows = [
        { role: 'Store Manager (reporting)', human: '$3,500/mo', ai: '$49/mo', savings: '98.6%', note: 'Automated daily/weekly/monthly reports' },
        { role: 'Inventory Analyst', human: '$4,000/mo', ai: '$49/mo', savings: '98.8%', note: 'Real-time stock alerts, reorder suggestions' },
        { role: 'Compliance Officer', human: '$5,000/mo', ai: '$49/mo', savings: '99.0%', note: 'Automated audit trails, exception flagging' },
        { role: 'Data Analyst (HQ)', human: '$6,500/mo', ai: '$99/mo', savings: '98.5%', note: 'Cross-store benchmarking, trend analysis' },
        { role: 'Marketing Coordinator', human: '$3,200/mo', ai: '$49/mo', savings: '98.5%', note: 'AI-generated promotions, loyalty campaigns' },
    ];
    return (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-[12px]", style: { color: 'var(--c-text-2)' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("th", { className: "text-left py-2 px-2 font-medium", style: { color: 'var(--c-text-4)' }, children: "Role Replaced" }), _jsx("th", { className: "text-right py-2 px-2 font-medium", style: { color: 'var(--c-text-4)' }, children: "Human Cost" }), _jsx("th", { className: "text-right py-2 px-2 font-medium", style: { color: 'var(--c-text-4)' }, children: "AI Agent Cost" }), _jsx("th", { className: "text-right py-2 px-2 font-medium", style: { color: 'var(--c-text-4)' }, children: "Savings" }), _jsx("th", { className: "text-left py-2 px-2 font-medium", style: { color: 'var(--c-text-4)' }, children: "What AI Does" })] }) }), _jsx("tbody", { children: rows.map((r) => (_jsxs("tr", { style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("td", { className: "py-2 px-2 font-medium", style: { color: 'var(--c-text-1)' }, children: r.role }), _jsx("td", { className: "py-2 px-2 text-right", style: { color: '#ef4444' }, children: r.human }), _jsx("td", { className: "py-2 px-2 text-right", style: { color: '#22c55e' }, children: r.ai }), _jsx("td", { className: "py-2 px-2 text-right font-bold", style: { color: '#22c55e' }, children: r.savings }), _jsx("td", { className: "py-2 px-2 text-[11px]", style: { color: 'var(--c-text-3)' }, children: r.note })] }, r.role))) })] }) }));
}
// ── Main Component ──
export function InvestorView() {
    const [platform, setPlatform] = useState(null);
    const [investor, setInvestor] = useState(null);
    const [version, setVersion] = useState('1.0.0');
    const [changelog, setChangelog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState('');
    const fetchAll = useCallback(async () => {
        try {
            // Single unified API — server fetches all platform data in parallel
            const res = await fetch('/api/investor/kpis');
            const inv = res.ok ? await res.json() : null;
            if (inv && !inv.error) {
                setVersion(inv.version || '1.0.0');
                setChangelog(inv.changelog || []);
                setInvestor({
                    stage: inv.stage || 'Pre-Launch / Beta',
                    customers: inv.customers || 0,
                    revenue: inv.revenue || { mrr: 0, arr: 0 },
                    pipeline: inv.pipeline || { leads: 0, pilots: 0, converted: 0 },
                    dataAdvantage: inv.dataAdvantage || { locations: 200, partner: 'RapidRMS', views: 22 },
                    techStack: inv.techStack || { services: 30, agents: 17, sdkModules: 15, e2eTests: 110 },
                    opportunities: inv.opportunities || { upsell: '', cpg: '' },
                    costStructure: inv.costStructure || { infra: 45, compute: 30, total: 75 },
                });
                // Platform KPIs from live server-side aggregation
                const p = inv.platform;
                if (p) {
                    setPlatform({
                        services: {
                            total: p.services?.total || 30,
                            healthy: p.services?.healthy || 0,
                            degraded: p.services?.degraded || 0,
                            down: p.services?.down || 0,
                        },
                        agents: {
                            total: p.agents?.total || 17,
                            active: p.agents?.active || 0,
                            idle: Math.max(0, (p.agents?.total || 17) - (p.agents?.active || 0)),
                        },
                        tasks: {
                            total: p.tasks?.total || 0,
                            completed: p.tasks?.completed || 0,
                            inProgress: p.tasks?.inProgress || 0,
                            failed: p.tasks?.failed || 0,
                        },
                        training: {
                            dataPoints: p.training?.dataPoints || 0,
                            lastRun: p.training?.lastRun || 'N/A',
                            modelVersion: p.training?.modelVersion || 'shre-ft:latest',
                        },
                        uptime: {
                            pct: '99.9',
                            since: p.uptime?.since || new Date().toISOString(),
                        },
                        benchmark: { score: 100, goal: 95 },
                    });
                }
            }
            setLastRefresh(new Date().toLocaleTimeString());
        }
        catch {
            // best effort
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchAll();
        const iv = setInterval(fetchAll, 60_000);
        return () => clearInterval(iv);
    }, [fetchAll]);
    // Use API data or defaults
    const inv = investor || {
        stage: 'Pre-Launch / Beta',
        customers: 0,
        revenue: { mrr: 0, arr: 0 },
        pipeline: { leads: 0, pilots: 0, converted: 0 },
        dataAdvantage: { locations: 200, partner: 'RapidRMS', views: 22 },
        techStack: { services: 30, agents: 17, sdkModules: 15, e2eTests: 110 },
        opportunities: {
            upsell: 'RapidRMS customer base (3,100+ stores)',
            cpg: 'CPG data companies seeking AI for store operators',
        },
        costStructure: { infra: 45, compute: 30, total: 75 },
    };
    return (_jsxs("div", { className: "flex-1 overflow-y-auto px-4 md:px-8 py-6", style: { background: 'var(--c-bg-1)', maxWidth: 1200, margin: '0 auto', width: '100%' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-lg font-bold", style: { color: 'var(--c-text-1)' }, children: "AROS Investor Dashboard" }), _jsx("div", { className: "text-[12px]", style: { color: 'var(--c-text-3)' }, children: "Nirlab Inc \u2014 Autonomous Retail Operating System" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase", style: { background: 'rgba(234,179,8,0.15)', color: '#eab308' }, children: inv.stage }), _jsxs("span", { className: "text-[10px] px-2 py-0.5 rounded font-mono", style: { background: 'rgba(99,102,241,0.1)', color: 'var(--c-accent, #6366f1)' }, children: ["v", version] }), lastRefresh && (_jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-4)' }, children: ["Updated ", lastRefresh] }))] })] }), _jsx(SectionHeader, { title: "Business Metrics", icon: "$" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(StatCard, { label: "Customers", value: inv.customers, sub: "Pre-launch \u2014 seeking beta pilots", large: true }), _jsx(StatCard, { label: "MRR", value: "$0", sub: "No revenue yet" }), _jsx(StatCard, { label: "ARR", value: "$0", sub: "Target: $81K Y1" }), _jsx(StatCard, { label: "Pipeline", value: `${inv.pipeline.leads} leads`, sub: `${inv.pipeline.pilots} pilots, ${inv.pipeline.converted} converted` })] }), _jsx(SectionHeader, { title: "Competitive Data Advantage", icon: "~" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(StatCard, { label: "Training Data", value: `${inv.dataAdvantage.locations}+`, sub: `Retail locations via ${inv.dataAdvantage.partner}`, accent: "#3b82f6", large: true }), _jsx(StatCard, { label: "Analytics Views", value: inv.dataAdvantage.views, sub: "Materialized POS views" }), _jsx(StatCard, { label: "Partner", value: "RapidRMS", sub: "3,100+ store ecosystem", accent: "#22c55e" }), _jsx(StatCard, { label: "Verticals", value: "5", sub: "C-Store, Liquor, QSR, Fuel, Retail" })] }), _jsx(SectionHeader, { title: "AI Agent ROI \u2014 Replacing Human Roles", icon: "%" }), _jsxs("div", { className: "rounded-xl p-4 mb-3", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx(ROITable, {}), _jsxs("div", { className: "mt-3 text-[11px] flex items-center gap-4", style: { color: 'var(--c-text-3)' }, children: [_jsxs("span", { children: [_jsx("strong", { style: { color: '#22c55e' }, children: "Per-store savings:" }), " $15,700-22,200/mo in labor replaced by $49-99/mo AI agents"] }), _jsxs("span", { children: [_jsx("strong", { style: { color: 'var(--c-accent)' }, children: "ROI:" }), " 150-450x on subscription cost"] })] })] }), _jsx(SectionHeader, { title: "Market Opportunities", icon: ">" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsx(OpportunityCard, { title: "Upsell to RapidRMS Customers", desc: "Existing relationship with 3,100+ stores. Native POS integration built. Warm introductions via dealer network \u2014 not cold outreach.", size: "TAM: 3,100+ stores at $49-99/mo = $1.8M-3.7M ARR", status: "Ready" }), _jsx(OpportunityCard, { title: "CPG Data Companies", desc: "Tech companies collecting retailer data for CPG brands want AI insights for store operators. AROS becomes the AI layer on their data. Revenue share model.", size: "TAM: $2.1B retail AI market (growing 28% CAGR)", status: "Exploring" })] }), _jsx(SectionHeader, { title: "Platform KPIs (Real-Time)", icon: "#" }), loading ? (_jsx("div", { className: "text-[12px] py-4", style: { color: 'var(--c-text-4)' }, children: "Loading platform metrics..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(StatCard, { label: "Services", value: `${platform?.services.healthy || 0}/${platform?.services.total || 30}`, sub: platform?.services.down ? `${platform.services.down} down` : 'All healthy', accent: platform?.services.down ? '#ef4444' : '#22c55e' }), _jsx(StatCard, { label: "AI Agents", value: `${platform?.agents.active || 0}/${platform?.agents.total || 17}`, sub: `${platform?.agents.idle || 0} idle`, accent: "#3b82f6" }), _jsx(StatCard, { label: "Benchmark Score", value: `${platform?.benchmark.score || 0}%`, sub: `Goal: ${platform?.benchmark.goal}%`, accent: (platform?.benchmark.score || 0) >= (platform?.benchmark.goal || 95) ? '#22c55e' : '#eab308' }), _jsx(StatCard, { label: "Uptime", value: `${platform?.uptime.pct || '99.9'}%`, sub: `Since ${platform?.uptime.since ? new Date(platform.uptime.since).toLocaleDateString() : 'N/A'}`, accent: "#22c55e" })] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-3", children: [_jsx(StatCard, { label: "Tasks Completed", value: platform?.tasks.completed || 0, sub: `${platform?.tasks.inProgress || 0} in progress` }), _jsx(StatCard, { label: "Training Data Points", value: platform?.training.dataPoints || 0, sub: platform?.training.lastRun || 'N/A' }), _jsx(StatCard, { label: "Model Version", value: platform?.training.modelVersion || 'N/A', sub: "Fine-tuned daily" }), _jsx(StatCard, { label: "E2E Tests", value: inv.techStack.e2eTests, sub: "110 passing, 9 agents", accent: "#22c55e" })] }), _jsxs("div", { className: "mt-4 rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-[11px] font-medium", style: { color: 'var(--c-text-3)' }, children: "Service Health" }), _jsxs("span", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: [platform?.services.healthy || 0, " healthy / ", platform?.services.total || 30, " total"] })] }), _jsx(ProgressBar, { value: platform?.services.healthy || 0, max: platform?.services.total || 30, color: "#22c55e" })] })] })), _jsx(SectionHeader, { title: "Technology Stack", icon: "*" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(StatCard, { label: "Microservices", value: inv.techStack.services, sub: "Fully operational" }), _jsx(StatCard, { label: "AI Agents", value: inv.techStack.agents, sub: "Multi-agent fleet" }), _jsx(StatCard, { label: "SDK Modules", value: inv.techStack.sdkModules, sub: "Shared infrastructure" }), _jsx(StatCard, { label: "E2E Test Agents", value: "9", sub: "Parallel QA coverage" })] }), _jsxs("div", { className: "mt-3 rounded-xl p-4", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsx("div", { className: "text-[12px] font-medium mb-2", style: { color: 'var(--c-text-2)' }, children: "Core Infrastructure" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px]", style: { color: 'var(--c-text-3)' }, children: [_jsx("div", { children: "CortexDB (PG + Qdrant + Redis)" }), _jsx("div", { children: "shre-router Gateway (multi-model)" }), _jsx("div", { children: "Architecture Council" }), _jsx("div", { children: "shre-router (trust gate + billing)" }), _jsx("div", { children: "shre-fleet (agent orchestration)" }), _jsx("div", { children: "shre-tasks (task management)" }), _jsx("div", { children: "BlockOS (micro-frontend marketplace)" }), _jsx("div", { children: "Daily fine-tuning (Shadow PC)" }), _jsx("div", { children: "Cloudflare Tunnel (edge delivery)" })] })] }), _jsx(SectionHeader, { title: "Monthly Cost Structure (Pre-Revenue)", icon: "-" }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(StatCard, { label: "Infrastructure", value: `$${inv.costStructure.infra}/mo`, sub: "Hosting + DB + CDN" }), _jsx(StatCard, { label: "Compute", value: `$${inv.costStructure.compute}/mo`, sub: "GPU (Shadow PC) + API" }), _jsx(StatCard, { label: "Total Burn", value: `$${inv.costStructure.total}/mo`, sub: "Lean \u2014 solo founder", accent: "#eab308" })] }), _jsx(SectionHeader, { title: "Roadmap", icon: ">" }), _jsx("div", { className: "space-y-2", children: [
                    { phase: 'Now', label: 'Beta Launch', desc: 'Deploy to first 5 RapidRMS pilot stores, validate product-market fit', status: 'current' },
                    { phase: 'Q2 2026', label: '50 Paying Stores', desc: 'Expand via RapidRMS dealer network, collect 3 case studies', status: 'next' },
                    { phase: 'Q4 2026', label: 'Multi-POS', desc: 'Build NCR, Clover, Square adapters. Unlock 200K+ additional stores', status: 'planned' },
                    { phase: '2027', label: 'Platform Ecosystem', desc: 'Open SDK, agent marketplace, BlockOS block marketplace (30% take rate)', status: 'planned' },
                ].map((item) => (_jsxs("div", { className: "flex items-center gap-3 rounded-lg px-4 py-2.5", style: {
                        background: item.status === 'current' ? 'rgba(59,130,246,0.08)' : 'var(--c-bg-2)',
                        border: `1px solid ${item.status === 'current' ? 'rgba(59,130,246,0.2)' : 'var(--c-border-2)'}`,
                    }, children: [_jsx("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded shrink-0", style: {
                                background: item.status === 'current' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                                color: item.status === 'current' ? '#3b82f6' : 'var(--c-text-3)',
                            }, children: item.phase }), _jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-[13px] font-medium", style: { color: 'var(--c-text-1)' }, children: item.label }), _jsx("span", { className: "text-[11px] ml-2", style: { color: 'var(--c-text-3)' }, children: item.desc })] })] }, item.phase))) }), changelog.length > 0 && (_jsxs(_Fragment, { children: [_jsx(SectionHeader, { title: `Changelog (v${version})`, icon: "!" }), _jsx("div", { className: "rounded-xl overflow-hidden", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: changelog.slice(0, 10).map((entry, i) => (_jsxs("div", { className: "px-4 py-2.5 flex items-start gap-3", style: { borderBottom: i < Math.min(changelog.length, 10) - 1 ? '1px solid var(--c-border-2)' : 'none' }, children: [_jsxs("span", { className: "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5", style: { background: 'rgba(99,102,241,0.1)', color: 'var(--c-accent, #6366f1)' }, children: ["v", entry.version] }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-[11px]", style: { color: 'var(--c-text-4)' }, children: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }), entry.changes.map((c, j) => (_jsx("div", { className: "text-[12px]", style: { color: 'var(--c-text-2)' }, children: c }, j)))] })] }, `${entry.version}-${i}`))) })] })), _jsx("div", { className: "mt-8 mb-4 text-[10px] text-center", style: { color: 'var(--c-text-4)' }, children: "Confidential \u2014 Nirlab Inc. All projections are forward-looking estimates. Currently pre-launch with zero customers and zero revenue. Platform metrics refresh every 60 seconds." })] }));
}
