import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback } from 'react';
/* ── Helpers ── */
function fmtCurrency(n) {
    return n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    });
}
function fmtNum(n) {
    return n.toLocaleString('en-US');
}
function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
const PERIOD_LABELS = {
    today: 'Today',
    yesterday: 'Yesterday',
    '7days': 'Last 7 Days',
    '30days': 'Last 30 Days',
};
const ALERT_COLORS = {
    void: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'VOID' },
    void_line_item: { bg: 'rgba(239,68,68,0.10)', text: '#fb923c', label: 'VOID ITEM' },
    no_sale: { bg: 'rgba(251,146,60,0.15)', text: '#fb923c', label: 'NO SALE' },
    refund: { bg: 'rgba(250,204,21,0.15)', text: '#facc15', label: 'REFUND' },
};
async function fetchApi(path) {
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
/* ── Sub-components ── */
function StatCard({ label, value, accent }) {
    return (_jsxs("div", { className: "rounded-lg px-3 py-2.5", style: {
            background: 'var(--c-bg-2)',
            border: `1px solid ${accent ? accent + '33' : 'var(--c-border-2)'}`,
        }, children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wider mb-0.5", style: { color: 'var(--c-text-5)' }, children: label }), _jsx("div", { className: "text-lg font-bold", style: { color: accent || 'var(--c-text-1)' }, children: value })] }));
}
function SortIcon({ active, dir }) {
    if (!active) {
        return (_jsx("svg", { className: "inline-block ml-0.5 h-3 w-3 opacity-30", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M8 4l3 4H5l3-4zm0 8L5 8h6l-3 4z" }) }));
    }
    return (_jsx("svg", { className: "inline-block ml-0.5 h-3 w-3", viewBox: "0 0 16 16", fill: "currentColor", children: dir === 'asc' ? _jsx("path", { d: "M8 4l4 5H4l4-5z" }) : _jsx("path", { d: "M8 12L4 7h8l-4 5z" }) }));
}
function AlertBadge({ type }) {
    const c = ALERT_COLORS[type] || ALERT_COLORS.void;
    return (_jsx("span", { className: "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", style: { background: c.bg, color: c.text }, children: c.label }));
}
/* ── Main Component ── */
export function EmployeeActivityView() {
    const [period, setPeriod] = useState('today');
    const [data, setData] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortKey, setSortKey] = useState('sales');
    const [sortDir, setSortDir] = useState('desc');
    const alertEndRef = useRef(null);
    const lastAlertTs = useRef('');
    // Load main data
    const loadData = useCallback(async () => {
        const result = await fetchApi(`/api/employee-activity?period=${period}`);
        if (result) {
            setData(result);
            setError(null);
        }
        else if (!data) {
            setError('Could not reach employee activity API.');
        }
        setLoading(false);
    }, [period]);
    // Load alerts
    const loadAlerts = useCallback(async () => {
        const since = lastAlertTs.current || new Date(Date.now() - 86400000).toISOString();
        const result = await fetchApi(`/api/employee-activity/alerts?since=${encodeURIComponent(since)}`);
        if (result && result.length > 0) {
            setAlerts((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const newAlerts = result.filter((a) => !existingIds.has(a.id));
                if (newAlerts.length === 0)
                    return prev;
                const merged = [...prev, ...newAlerts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                lastAlertTs.current = merged[merged.length - 1].timestamp;
                return merged.slice(-200); // keep last 200
            });
        }
    }, []);
    // Initial load + polling
    useEffect(() => {
        setLoading(true);
        setData(null);
        setAlerts([]);
        lastAlertTs.current = '';
        loadData();
        loadAlerts();
        const iv = setInterval(() => {
            loadData();
            loadAlerts();
        }, 30_000);
        return () => clearInterval(iv);
    }, [period, loadData, loadAlerts]);
    // Auto-scroll alerts
    useEffect(() => {
        alertEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [alerts]);
    // Sort employees
    const sortedEmployees = data
        ? [...data.employees].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            return sortDir === 'asc'
                ? av - bv
                : bv - av;
        })
        : [];
    function handleSort(key) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        }
        else {
            setSortKey(key);
            setSortDir(key === 'name' ? 'asc' : 'desc');
        }
    }
    const summary = data?.summary;
    const columns = [
        { key: 'name', label: 'Employee', fmt: (e) => e.name },
        { key: 'transactions', label: 'Txns', fmt: (e) => fmtNum(e.transactions) },
        { key: 'sales', label: 'Sales', fmt: (e) => fmtCurrency(e.sales) },
        { key: 'avgTicket', label: 'Avg Ticket', fmt: (e) => fmtCurrency(e.avgTicket) },
        { key: 'voids', label: 'Voids', fmt: (e) => String(e.voids), warn: (e) => e.voids > 0 },
        {
            key: 'noSales',
            label: 'No-Sales',
            fmt: (e) => String(e.noSales),
            warn: (e) => e.noSales > 0,
        },
        { key: 'refunds', label: 'Refunds', fmt: (e) => String(e.refunds), warn: (e) => e.refunds > 0 },
    ];
    return (_jsxs("div", { className: "flex-1 flex flex-col h-full min-w-0", children: [_jsxs("header", { className: "flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm", style: { background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }, children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("svg", { className: "h-4 w-4", style: { color: 'var(--c-accent)' }, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }), _jsx("h1", { className: "text-sm font-semibold", style: { color: 'var(--c-text-1)' }, children: "Employee Activity" }), _jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded", style: {
                                    background: 'var(--c-accent-muted, rgba(96,165,250,0.15))',
                                    color: 'var(--c-accent)',
                                }, children: "Party Liquor" })] }), _jsx("div", { className: "flex items-center gap-1", children: Object.keys(PERIOD_LABELS).map((p) => (_jsx("button", { onClick: () => setPeriod(p), className: "text-[11px] px-2 py-1 rounded transition-colors", style: {
                                background: period === p ? 'var(--c-accent)' : 'transparent',
                                color: period === p ? '#fff' : 'var(--c-text-4)',
                            }, children: PERIOD_LABELS[p] }, p))) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-4 py-4", children: [loading && !data && (_jsx("div", { className: "flex items-center justify-center h-40", children: _jsx("div", { className: "text-xs", style: { color: 'var(--c-text-4)' }, children: "Loading employee activity..." }) })), error && !data && (_jsx("div", { className: "flex items-center justify-center h-40", children: _jsx("div", { className: "text-xs", style: { color: '#f87171' }, children: error }) })), data && (_jsxs("div", { className: "max-w-6xl mx-auto space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsx(StatCard, { label: "Total Sales", value: fmtCurrency(summary.totalSales) }), _jsx(StatCard, { label: "Transactions", value: fmtNum(summary.totalTransactions) }), _jsx(StatCard, { label: "Voids", value: `${fmtNum(summary.totalVoids)} (${fmtCurrency(summary.totalVoidAmount)})`, accent: summary.totalVoids > 0 ? '#f87171' : undefined }), _jsx(StatCard, { label: "No-Sales", value: fmtNum(summary.totalNoSales), accent: summary.totalNoSales > 0 ? '#fb923c' : undefined })] }), _jsx("div", { className: "grid gap-4", style: { gridTemplateColumns: '1fr' }, children: _jsxs("div", { className: "grid gap-4", style: { gridTemplateColumns: 'minmax(0,1fr) 320px' }, children: [_jsxs("div", { className: "rounded-lg overflow-hidden", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }, children: [_jsxs("div", { className: "px-3 py-2", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-text-2)' }, children: "Employee Performance" }), _jsxs("span", { className: "text-[10px] ml-2", style: { color: 'var(--c-text-5)' }, children: [sortedEmployees.length, " employees"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-xs", style: { borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { style: { borderBottom: '1px solid var(--c-border-2)' }, children: columns.map((col) => (_jsxs("th", { onClick: () => handleSort(col.key), className: "px-3 py-2 cursor-pointer select-none whitespace-nowrap", style: {
                                                                            color: 'var(--c-text-4)',
                                                                            fontWeight: 600,
                                                                            textAlign: col.key === 'name' ? 'left' : 'right',
                                                                            background: sortKey === col.key ? 'rgba(255,255,255,0.03)' : undefined,
                                                                        }, children: [col.label, _jsx(SortIcon, { active: sortKey === col.key, dir: sortDir })] }, col.key))) }) }), _jsxs("tbody", { children: [sortedEmployees.map((emp, i) => (_jsx("tr", { style: {
                                                                            borderBottom: i < sortedEmployees.length - 1
                                                                                ? '1px solid var(--c-border-2)'
                                                                                : undefined,
                                                                        }, children: columns.map((col) => {
                                                                            const isWarn = col.warn?.(emp);
                                                                            return (_jsx("td", { className: "px-3 py-2 whitespace-nowrap", style: {
                                                                                    textAlign: col.key === 'name' ? 'left' : 'right',
                                                                                    color: isWarn ? '#f87171' : 'var(--c-text-2)',
                                                                                    fontWeight: col.key === 'name' ? 500 : 400,
                                                                                    background: isWarn ? 'rgba(239,68,68,0.06)' : undefined,
                                                                                }, children: col.fmt(emp) }, col.key));
                                                                        }) }, emp.name))), sortedEmployees.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: columns.length, className: "px-3 py-6 text-center", style: { color: 'var(--c-text-5)' }, children: "No employee data for this period" }) }))] })] }) })] }), _jsxs("div", { className: "rounded-lg flex flex-col", style: {
                                                background: 'var(--c-bg-2)',
                                                border: '1px solid var(--c-border-2)',
                                                maxHeight: 'calc(100vh - 260px)',
                                                minHeight: 300,
                                            }, children: [_jsxs("div", { className: "px-3 py-2 shrink-0 flex items-center justify-between", style: { borderBottom: '1px solid var(--c-border-2)' }, children: [_jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-text-2)' }, children: "Alert Feed" }), _jsxs("span", { className: "text-[10px]", style: { color: 'var(--c-text-5)' }, children: [alerts.length, " events"] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-2 py-2 space-y-1.5", children: [alerts.length === 0 && (_jsx("div", { className: "flex items-center justify-center h-full", children: _jsx("span", { className: "text-[11px]", style: { color: 'var(--c-text-5)' }, children: "No alerts for this period" }) })), alerts.map((alert) => (_jsxs("div", { className: "rounded px-2.5 py-2 flex items-start gap-2", style: {
                                                                background: 'var(--c-bg-3, rgba(255,255,255,0.02))',
                                                                border: '1px solid var(--c-border-2)',
                                                            }, children: [_jsx(AlertBadge, { type: alert.type }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-1", children: [_jsx("span", { className: "text-[11px] font-medium truncate", style: { color: 'var(--c-text-2)' }, children: alert.employee }), _jsx("span", { className: "text-[10px] shrink-0", style: { color: 'var(--c-text-5)' }, children: fmtTime(alert.timestamp) })] }), _jsxs("div", { className: "text-[10px] mt-0.5", style: { color: 'var(--c-text-4)' }, children: ["Inv #", alert.invoiceNo, alert.amount > 0 && (_jsx("span", { className: "ml-1.5", style: { color: '#f87171' }, children: fmtCurrency(alert.amount) })), alert.itemName && _jsxs("span", { className: "ml-1.5", children: ["- ", alert.itemName] })] })] })] }, alert.id))), _jsx("div", { ref: alertEndRef })] })] })] }) })] }))] }), _jsx("style", { children: `
        @media (max-width: 768px) {
          .grid[style*="320px"] {
            grid-template-columns: 1fr !important;
          }
        }
      ` })] }));
}
