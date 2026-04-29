import { useState, useEffect, useMemo } from 'react';
import { mib007Link } from './chat-utils';
import { getAgent, getMinimumFleetRoleLabel } from './store';

// ── Types ─────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_tier?: string;
  icon?: string;
  status: 'available' | 'coming_soon';
  landingPageUrl?: string;
  supportUrl?: string;
}

interface AgentListing {
  id: string;
  name: string;
  title: string;
  description: string;
  category: 'c-suite' | 'specialist' | 'council' | 'business';
  skills: string[];
  price: number;
  currency: string;
  billing: string;
  status: 'available' | 'coming_soon';
  icon?: string;
}

interface BundleListing {
  id: string;
  name: string;
  description: string;
  agents: string[];
  price: number;
  currency: string;
  billing: string;
  savings?: string;
  popular?: boolean;
}

interface ReleaseBundle {
  id: 'qa' | 'beta' | 'production';
  name: string;
  description: string;
  leadAgent: string;
  releaseGate: string[];
  supportAgents: string[];
  customerFacingAgents: string[];
  purchaseMode: 'bundle' | 'a-la-carte';
}

interface CatalogData {
  apps: CatalogItem[];
  agents: AgentListing[];
  bundles: BundleListing[];
  nodes: CatalogItem[];
  services: CatalogItem[];
  total: Record<string, number>;
}

interface DetailData {
  item: any;
  detail: {
    longDescription?: string;
    features?: string[];
    whatsNew?: string;
    version?: string;
    developer?: string;
    requirements?: string[];
    rating?: number;
    reviews?: number;
    installs?: string;
    updatedAt?: string;
    size?: string;
    permissions?: string[];
  } | null;
  related: any[];
}

type TabKey = 'active' | 'available';
type SectionKey = 'all' | 'apps' | 'agents' | 'bundles';

// ── Helpers ───────────────────────────────────────────────────────────

function tierColor(tier?: string): string {
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

function tierBg(tier?: string): string {
  return tierColor(tier) + '18';
}

function priceLabel(item: AgentListing | CatalogItem | BundleListing): string {
  if ('price' in item && typeof item.price === 'number') {
    return item.price === 0 ? 'Free' : `$${item.price}/mo`;
  }
  const pt = (item as CatalogItem).pricing_tier;
  return pt === 'free' ? 'Free' : pt ? pt.charAt(0).toUpperCase() + pt.slice(1) : 'Free';
}

function roleHint(agentId: string): string {
  return getMinimumFleetRoleLabel(agentId) ?? getAgent(agentId).name ?? agentId.replace(/-/g, ' ');
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

// ── Icon mapping (emoji fallback for catalog icons) ──────────────────

const ICON_MAP: Record<string, string> = {
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

function iconEmoji(icon?: string): string {
  return icon ? (ICON_MAP[icon] ?? '\uD83D\uDCE6') : '\uD83D\uDCE6';
}

// ── Main Component ────────────────────────────────────────────────────

export function MarketplaceView() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [releaseBundles, setReleaseBundles] = useState<ReleaseBundle[]>([]);
  const [builderBundleId, setBuilderBundleId] = useState<ReleaseBundle['id'] | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('available');
  const [section, setSection] = useState<SectionKey>('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'app' | 'agent' | 'bundle' | 'node'>('app');
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ── Fetch catalog from shre-marketplace via serve.js proxy ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Try marketplace catalog first, fallback to agents-only endpoint
      let data = await fetchJson<CatalogData>('/api/marketplace/catalog');
      if (!data && !cancelled) {
        // Fallback: build partial catalog from shre-hr agents endpoint
        const agentData = await fetchJson<{ agents?: any[] }>('/api/marketplace/agents');
        if (agentData && !cancelled) {
          const raw = agentData as any;
          const agents = Array.isArray(raw) ? raw : Array.isArray(raw?.agents) ? raw.agents : [];
          data = {
            apps: [],
            agents: agents.map((a: any) => ({
              id: a.id,
              name: a.displayName || a.name || a.id,
              title: a.title || a.department || '',
              description: a.bio || '',
              category: a.tier || 'business',
              skills: a.strengths || a.skills || [],
              price: 0,
              currency: 'USD',
              billing: 'per-month',
              status: 'available' as const,
            })),
            bundles: [],
            nodes: [],
            services: [],
            total: { apps: 0, agents: agents.length, bundles: 0, nodes: 0, services: 0 },
          };
        }
      }
      if (cancelled) return;
      if (!data) {
        setError('Could not load marketplace catalog. Is shre-marketplace running on port 5458?');
        setLoading(false);
        return;
      }
      setCatalog(data);
      const bundles = await fetchJson<{ bundles?: ReleaseBundle[] }>(
        '/api/router/v1/agents/release-bundles',
      );
      if (!cancelled && bundles?.bundles) {
        setReleaseBundles(bundles.bundles);
        if (!builderBundleId) {
          const defaultBundle =
            bundles.bundles.find((bundle) => bundle.id === 'beta') ?? bundles.bundles[0];
          if (defaultBundle) {
            setBuilderBundleId(defaultBundle.id);
            setSelectedTeamIds(
              Array.from(
                new Set([
                  defaultBundle.leadAgent,
                  ...defaultBundle.releaseGate,
                  ...defaultBundle.supportAgents,
                  ...defaultBundle.customerFacingAgents,
                ]),
              ),
            );
          }
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Open detail modal ──
  async function openDetail(item: any, type: 'app' | 'agent' | 'bundle' | 'node') {
    setSelectedItem(item);
    setSelectedType(type);
    setDetail(null);
    if (type !== 'bundle') {
      setDetailLoading(true);
      const d = await fetchJson<DetailData>(`/api/marketplace/catalog/detail/${item.id}`);
      setDetail(d);
      setDetailLoading(false);
    }
  }

  // ── Filter + search ──
  const searchLower = search.toLowerCase();

  const filteredApps = useMemo(() => {
    if (!catalog) return [];
    let list = catalog.apps;
    if (categoryFilter !== 'all') list = list.filter((a) => a.category === categoryFilter);
    if (searchLower)
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          a.description.toLowerCase().includes(searchLower),
      );
    return list;
  }, [catalog, categoryFilter, searchLower]);

  const filteredAgents = useMemo(() => {
    if (!catalog) return [];
    let list = catalog.agents;
    if (categoryFilter !== 'all') list = list.filter((a) => a.category === categoryFilter);
    if (searchLower)
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          a.description.toLowerCase().includes(searchLower),
      );
    return list;
  }, [catalog, categoryFilter, searchLower]);

  const filteredBundles = useMemo(() => {
    if (!catalog) return [];
    if (searchLower)
      return catalog.bundles.filter(
        (b) =>
          b.name.toLowerCase().includes(searchLower) ||
          b.description.toLowerCase().includes(searchLower),
      );
    return catalog.bundles;
  }, [catalog, searchLower]);

  // All categories across apps + agents
  const allCategories = useMemo(() => {
    if (!catalog) return [];
    const cats = new Set<string>();
    catalog.apps.forEach((a) => cats.add(a.category));
    catalog.agents.forEach((a) => cats.add(a.category));
    return Array.from(cats).sort();
  }, [catalog]);

  const agentLookup = useMemo(() => {
    const map = new Map<string, AgentListing>();
    catalog?.agents.forEach((agent) => map.set(agent.id, agent));
    return map;
  }, [catalog]);

  const activeBuilderBundle = useMemo(
    () => releaseBundles.find((bundle) => bundle.id === builderBundleId) ?? null,
    [releaseBundles, builderBundleId],
  );

  const selectedTeam = useMemo(() => {
    return selectedTeamIds.map(
      (id) =>
        agentLookup.get(id) ?? {
          id,
          name: roleHint(id),
          title: roleHint(id),
          description: `${roleHint(id)} role for release operations`,
          category: 'business',
          skills: [],
          price: 0,
          currency: 'USD',
          billing: 'per-month',
          status: 'available' as const,
        },
    );
  }, [selectedTeamIds, agentLookup]);

  function seedTeam(bundle: ReleaseBundle) {
    setBuilderBundleId(bundle.id);
    setSelectedTeamIds(
      Array.from(
        new Set([
          bundle.leadAgent,
          ...bundle.releaseGate,
          ...bundle.supportAgents,
          ...bundle.customerFacingAgents,
        ]),
      ),
    );
    setSection('agents');
  }

  function toggleTeamAgent(agentId: string) {
    setSelectedTeamIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  }

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--c-bg-1)' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 flex items-center gap-3 justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4"
            style={{ color: 'var(--c-text-3)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" />
            <line x1="3" y1="7" x2="21" y2="7" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Marketplace
          </span>
          {catalog && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }}
            >
              {(catalog.total.apps || 0) + (catalog.total.agents || 0)} items
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/app-marketplace', '_blank')}
            className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
            style={{
              background: 'var(--c-bg-2)',
              color: 'var(--c-text-3)',
              border: '1px solid var(--c-border-2)',
            }}
          >
            Full Store
          </button>
          <button
            onClick={() => window.open(mib007Link('marketplace'), '_blank')}
            className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
            style={{
              background: 'var(--c-bg-2)',
              color: 'var(--c-text-3)',
              border: '1px solid var(--c-border-2)',
            }}
          >
            MIB007
          </button>
        </div>
      </div>

      {/* ── Tabs + Search ──────────────────────────────────────── */}
      <div
        className="px-4 py-2 flex items-center gap-2 flex-wrap shrink-0"
        style={{ borderBottom: '1px solid var(--c-border-2)' }}
      >
        {/* Active / Available tabs */}
        {(['available', 'active'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-2.5 py-1 rounded text-[11px] font-semibold capitalize"
            style={{
              background: tab === t ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
              color: tab === t ? '#fff' : 'var(--c-text-3)',
              border: `1px solid ${tab === t ? 'transparent' : 'var(--c-border-2)'}`,
            }}
          >
            {t}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--c-border-2)', margin: '0 4px' }} />

        {/* Section filter */}
        {(['all', 'apps', 'agents', 'bundles'] as SectionKey[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className="px-2 py-0.5 rounded text-[10px] font-medium capitalize"
            style={{
              background: section === s ? 'var(--c-bg-3)' : 'transparent',
              color: section === s ? 'var(--c-text-1)' : 'var(--c-text-4)',
            }}
          >
            {s}
          </button>
        ))}

        {/* Search */}
        <div className="ml-auto relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3"
            style={{ color: 'var(--c-text-5)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-2 py-1 rounded text-[11px]"
            style={{
              width: 160,
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-2)',
              color: 'var(--c-text-1)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {!loading && releaseBundles.length > 0 && (
        <div
          className="px-4 py-4 border-b"
          style={{
            borderColor: 'var(--c-border-2)',
            background: 'linear-gradient(180deg, rgba(99,102,241,0.08), transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <div
                className="text-[11px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--c-text-4)' }}
              >
                Release Teams
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                Buy a team or assemble your own
              </div>
            </div>
            <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
              Browse release bundles and team configurations powered by the minimum fleet
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {releaseBundles.map((bundle) => (
              <div
                key={bundle.id}
                className="rounded-xl p-3 border"
                style={{
                  background: 'var(--c-bg-1)',
                  borderColor: 'var(--c-border-2)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
                      {bundle.name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                      {bundle.description}
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      color: bundle.id === 'production' ? '#4ade80' : '#60a5fa',
                      background:
                        bundle.id === 'production'
                          ? 'rgba(74,222,128,0.12)'
                          : 'rgba(96,165,250,0.12)',
                    }}
                  >
                    {bundle.id}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-[11px]">
                  <div style={{ color: 'var(--c-text-3)' }}>
                    <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Lead:
                    </span>{' '}
                    {roleHint(bundle.leadAgent)}
                  </div>
                  <div style={{ color: 'var(--c-text-3)' }}>
                    <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Gate:
                    </span>{' '}
                    {bundle.releaseGate.map((a) => roleHint(a)).join(' · ')}
                  </div>
                  <div style={{ color: 'var(--c-text-3)' }}>
                    <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Support:
                    </span>{' '}
                    {bundle.supportAgents.map((a) => roleHint(a)).join(' · ') || 'None'}
                  </div>
                  <div style={{ color: 'var(--c-text-3)' }}>
                    <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>
                      Customer-facing:
                    </span>{' '}
                    {bundle.customerFacingAgents.map((a) => roleHint(a)).join(' · ') || 'None'}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => seedTeam(bundle)}
                    className="px-2.5 py-1.5 rounded text-[11px] font-medium"
                    style={{
                      background:
                        bundle.id === 'production' ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                      color: bundle.id === 'production' ? '#fff' : 'var(--c-text-3)',
                      border: `1px solid ${bundle.id === 'production' ? 'transparent' : 'var(--c-border-2)'}`,
                    }}
                  >
                    Build team
                  </button>
                  <button
                    onClick={() => setSection('agents')}
                    className="px-2.5 py-1.5 rounded text-[11px] font-medium"
                    style={{
                      background: 'transparent',
                      color: 'var(--c-text-4)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Hand select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Category pills ─────────────────────────────────────── */}
      {(section === 'all' || section === 'apps' || section === 'agents') &&
        allCategories.length > 0 && (
          <div
            className="px-4 py-1.5 flex gap-1.5 overflow-x-auto shrink-0"
            style={{ borderBottom: '1px solid var(--c-border-2)' }}
          >
            <button
              onClick={() => setCategoryFilter('all')}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0"
              style={{
                background: categoryFilter === 'all' ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                color: categoryFilter === 'all' ? '#fff' : 'var(--c-text-4)',
                border: `1px solid ${categoryFilter === 'all' ? 'transparent' : 'var(--c-border-2)'}`,
              }}
            >
              All
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0"
                style={{
                  background: categoryFilter === cat ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
                  color: categoryFilter === cat ? '#fff' : 'var(--c-text-4)',
                  border: `1px solid ${categoryFilter === cat ? 'transparent' : 'var(--c-border-2)'}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"
              style={{ color: 'var(--c-text-5)' }}
            />
          </div>
        )}
        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm text-center"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {error}
          </div>
        )}

        {catalog && (
          <>
            {section === 'agents' && activeBuilderBundle && (
              <div
                className="mb-6 rounded-2xl p-4 border"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(14,165,233,0.10), rgba(99,102,241,0.08))',
                  borderColor: 'rgba(99,102,241,0.25)',
                }}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <div
                      className="text-[11px] uppercase tracking-[0.16em]"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      Team Builder
                    </div>
                    <div className="text-base font-semibold" style={{ color: 'var(--c-text-1)' }}>
                      {activeBuilderBundle?.name || 'Custom Team'}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--c-text-4)' }}>
                      {activeBuilderBundle?.description || 'Pick the agents you want to activate.'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => activeBuilderBundle && seedTeam(activeBuilderBundle)}
                      className="px-3 py-1.5 rounded text-[11px] font-medium"
                      style={{
                        background: 'var(--c-bg-2)',
                        color: 'var(--c-text-3)',
                        border: '1px solid var(--c-border-2)',
                      }}
                    >
                      Reset template
                    </button>
                    <button
                      onClick={() => setSelectedTeamIds([])}
                      className="px-3 py-1.5 rounded text-[11px] font-medium"
                      style={{
                        background: 'transparent',
                        color: 'var(--c-text-4)',
                        border: '1px solid var(--c-border-2)',
                      }}
                    >
                      Clear team
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTeam.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => toggleTeamAgent(agent.id)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--c-text-2)',
                        border: '1px solid var(--c-border-2)',
                      }}
                    >
                      {agent.title || agent.name}
                      <span className="ml-2 text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                        remove
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                  Lead: {roleHint(activeBuilderBundle?.leadAgent || 'ellie')} · Gate:{' '}
                  {(activeBuilderBundle?.releaseGate || []).map((a) => roleHint(a)).join(' · ') ||
                    'None'}
                </div>
              </div>
            )}

            {/* Apps Section */}
            {(section === 'all' || section === 'apps') && filteredApps.length > 0 && (
              <div className="mb-6">
                <h3
                  className="text-[12px] font-semibold mb-2"
                  style={{
                    color: 'var(--c-text-4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Applications ({filteredApps.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredApps.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => openDetail(app, 'app')}
                      className="text-left rounded-lg p-3 transition-all"
                      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{iconEmoji(app.icon)}</span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[12px] font-semibold truncate"
                            style={{ color: 'var(--c-text-1)' }}
                          >
                            {app.name}
                          </div>
                          <div
                            className="text-[10px] capitalize"
                            style={{ color: 'var(--c-text-5)' }}
                          >
                            {app.category}
                          </div>
                        </div>
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: tierBg(app.pricing_tier),
                            color: tierColor(app.pricing_tier),
                          }}
                        >
                          {priceLabel(app)}
                        </span>
                      </div>
                      <p
                        className="text-[10px] line-clamp-2"
                        style={{ color: 'var(--c-text-3)', lineHeight: 1.4 }}
                      >
                        {app.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Agents Section */}
            {(section === 'all' || section === 'agents') && filteredAgents.length > 0 && (
              <div className="mb-6">
                <h3
                  className="text-[12px] font-semibold mb-2"
                  style={{
                    color: 'var(--c-text-4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  AI Agents ({filteredAgents.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => openDetail(agent, 'agent')}
                      className="text-left rounded-lg p-3 transition-all"
                      style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-accent, #6366f1)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--c-border-2)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{iconEmoji(agent.icon)}</span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[12px] font-semibold truncate"
                            style={{ color: 'var(--c-text-1)' }}
                          >
                            {agent.name}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                            {getMinimumFleetRoleLabel(agent.id)
                              ? `${getMinimumFleetRoleLabel(agent.id)} · `
                              : ''}
                            {agent.title || agent.category}
                          </div>
                        </div>
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: tierBg(agent.category),
                            color: tierColor(agent.category),
                          }}
                        >
                          {agent.category}
                        </span>
                      </div>
                      <p
                        className="text-[10px] line-clamp-2 mb-2"
                        style={{ color: 'var(--c-text-3)', lineHeight: 1.4 }}
                      >
                        {agent.description}
                      </p>
                      {agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {agent.skills.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="px-1.5 py-0.5 rounded text-[8px]"
                              style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }}
                            >
                              {s}
                            </span>
                          ))}
                          {agent.skills.length > 3 && (
                            <span
                              className="text-[8px] self-center"
                              style={{ color: 'var(--c-text-5)' }}
                            >
                              +{agent.skills.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: agent.price === 0 ? '#4ade80' : 'var(--c-text-1)' }}
                        >
                          {priceLabel(agent)}
                        </span>
                        <span
                          className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background:
                              agent.status === 'available'
                                ? 'rgba(74,222,128,0.1)'
                                : 'rgba(161,161,170,0.1)',
                            color: agent.status === 'available' ? '#4ade80' : 'var(--c-text-5)',
                          }}
                        >
                          {agent.status === 'available' ? 'Available' : 'Coming Soon'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                          {selectedTeamIds.includes(agent.id) ? 'Selected for team' : 'Optional'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTeamAgent(agent.id);
                            setSection('agents');
                          }}
                          className="px-2 py-1 rounded text-[10px] font-medium"
                          style={{
                            background: selectedTeamIds.includes(agent.id)
                              ? 'rgba(74,222,128,0.12)'
                              : 'var(--c-bg-3)',
                            color: selectedTeamIds.includes(agent.id)
                              ? '#4ade80'
                              : 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                          }}
                        >
                          {selectedTeamIds.includes(agent.id) ? 'Remove' : 'Add to team'}
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bundles Section */}
            {(section === 'all' || section === 'bundles') && filteredBundles.length > 0 && (
              <div className="mb-6">
                <h3
                  className="text-[12px] font-semibold mb-2"
                  style={{
                    color: 'var(--c-text-4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Bundles ({filteredBundles.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredBundles.map((bundle) => (
                    <button
                      key={bundle.id}
                      onClick={() => openDetail(bundle, 'bundle')}
                      className="text-left rounded-lg p-3 transition-all relative"
                      style={{
                        background: bundle.popular
                          ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))'
                          : 'var(--c-bg-2)',
                        border: `1px solid ${bundle.popular ? 'rgba(99,102,241,0.3)' : 'var(--c-border-2)'}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {bundle.popular && (
                        <span
                          className="absolute -top-2 right-3 text-[8px] font-bold uppercase px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--c-accent, #6366f1)', color: '#fff' }}
                        >
                          Popular
                        </span>
                      )}
                      <div
                        className="text-[12px] font-semibold mb-1"
                        style={{ color: 'var(--c-text-1)' }}
                      >
                        {bundle.name}
                      </div>
                      <p
                        className="text-[10px] mb-2"
                        style={{ color: 'var(--c-text-3)', lineHeight: 1.4 }}
                      >
                        {bundle.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {bundle.agents.slice(0, 4).map((a) => (
                          <span
                            key={a}
                            className="px-1.5 py-0.5 rounded text-[8px]"
                            style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }}
                          >
                            {a}
                          </span>
                        ))}
                        {bundle.agents.length > 4 && (
                          <span
                            className="text-[8px] self-center"
                            style={{ color: 'var(--c-text-5)' }}
                          >
                            +{bundle.agents.length - 4}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[12px] font-bold"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          ${bundle.price}/mo
                        </span>
                        {bundle.savings && (
                          <span className="text-[9px] font-medium" style={{ color: '#4ade80' }}>
                            Save {bundle.savings}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredApps.length === 0 &&
              filteredAgents.length === 0 &&
              filteredBundles.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-[13px]" style={{ color: 'var(--c-text-4)' }}>
                    No items match your search.
                  </p>
                </div>
              )}
          </>
        )}
      </div>

      {/* ── Detail Modal ───────────────────────────────────────── */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => {
            setSelectedItem(null);
            setDetail(null);
          }}
        >
          <div
            className="rounded-xl p-5 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-border-1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{iconEmoji(selectedItem.icon)}</span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {selectedItem.name}
                </h2>
                <p className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                  {selectedItem.title || selectedItem.category || ''}
                  {detail?.detail?.developer && ` — ${detail.detail.developer}`}
                </p>
              </div>
              <span
                className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                style={{
                  background: tierBg(selectedItem.category || selectedItem.pricing_tier),
                  color: tierColor(selectedItem.category || selectedItem.pricing_tier),
                }}
              >
                {selectedType === 'agent'
                  ? selectedItem.category
                  : selectedItem.pricing_tier || 'free'}
              </span>
            </div>

            {/* Price + status */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                {priceLabel(selectedItem)}
              </span>
              {detail?.detail?.rating && (
                <span className="text-[11px]" style={{ color: '#f59e0b' }}>
                  {'★'.repeat(Math.floor(detail.detail.rating))} {detail.detail.rating} (
                  {detail.detail.reviews ?? 0} reviews)
                </span>
              )}
              {detail?.detail?.installs && (
                <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                  {detail.detail.installs} installs
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-[11px] mb-3" style={{ color: 'var(--c-text-3)', lineHeight: 1.6 }}>
              {detail?.detail?.longDescription || selectedItem.description}
            </p>

            {/* What's New */}
            {detail?.detail?.whatsNew && (
              <div
                className="mb-3 p-2.5 rounded-lg"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold mb-1 flex items-center gap-1.5"
                  style={{ color: 'var(--c-text-2)' }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#4ade80',
                      display: 'inline-block',
                    }}
                  />
                  What's New{detail.detail.version && ` — v${detail.detail.version}`}
                </div>
                <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                  {detail.detail.whatsNew}
                </p>
              </div>
            )}

            {/* Skills (for agents) */}
            {selectedType === 'agent' && selectedItem.skills?.length > 0 && (
              <div className="mb-3">
                <h3
                  className="text-[10px] font-semibold uppercase mb-1.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Skills
                </h3>
                <div className="flex flex-wrap gap-1">
                  {selectedItem.skills.map((s: string) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{
                        background: 'var(--c-bg-2)',
                        color: 'var(--c-text-3)',
                        border: '1px solid var(--c-border-2)',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            {detail?.detail?.features && detail.detail.features.length > 0 && (
              <div className="mb-3">
                <h3
                  className="text-[10px] font-semibold uppercase mb-1.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Features
                </h3>
                <ul className="space-y-1">
                  {detail.detail.features.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-[10px]"
                      style={{ color: 'var(--c-text-3)' }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: '#4ade80',
                          flexShrink: 0,
                        }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bundle agents */}
            {selectedType === 'bundle' && selectedItem.agents?.length > 0 && (
              <div className="mb-3">
                <h3
                  className="text-[10px] font-semibold uppercase mb-1.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Included Agents ({selectedItem.agents.length})
                </h3>
                <div className="flex flex-wrap gap-1">
                  {selectedItem.agents.map((a: string) => (
                    <span
                      key={a}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{
                        background: 'var(--c-bg-2)',
                        color: 'var(--c-text-3)',
                        border: '1px solid var(--c-border-2)',
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Permissions */}
            {detail?.detail?.permissions && detail.detail.permissions.length > 0 && (
              <div className="mb-3">
                <h3
                  className="text-[10px] font-semibold uppercase mb-1.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Permissions
                </h3>
                <div className="flex flex-wrap gap-1">
                  {detail.detail.permissions.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{
                        background: 'rgba(99,102,241,0.08)',
                        color: 'var(--c-accent, #6366f1)',
                        border: '1px solid rgba(99,102,241,0.15)',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Info grid */}
            {detail?.detail && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {detail.detail.version && (
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'var(--c-bg-2)' }}
                  >
                    <div className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                      Version
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--c-text-1)' }}>
                      {detail.detail.version}
                    </div>
                  </div>
                )}
                {detail.detail.updatedAt && (
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'var(--c-bg-2)' }}
                  >
                    <div className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                      Updated
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--c-text-1)' }}>
                      {detail.detail.updatedAt}
                    </div>
                  </div>
                )}
                {detail.detail.size && (
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'var(--c-bg-2)' }}
                  >
                    <div className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                      Size
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--c-text-1)' }}>
                      {detail.detail.size}
                    </div>
                  </div>
                )}
              </div>
            )}

            {detailLoading && (
              <div className="flex items-center justify-center py-4">
                <div
                  className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                  style={{ color: 'var(--c-text-5)' }}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  alert(
                    `${selectedType === 'bundle' ? 'Bundle' : selectedType === 'agent' ? 'Agent' : 'App'} "${selectedItem.name}" activation requested.\n\nThis will provision the workspace and wire the pipeline.`,
                  );
                }}
                className="flex-1 py-2 rounded-lg text-[12px] font-semibold text-center transition-colors"
                style={{
                  background:
                    selectedItem.status === 'coming_soon'
                      ? 'var(--c-bg-3)'
                      : 'var(--c-accent, #6366f1)',
                  color: selectedItem.status === 'coming_soon' ? 'var(--c-text-5)' : '#fff',
                  cursor: selectedItem.status === 'coming_soon' ? 'default' : 'pointer',
                }}
              >
                {selectedItem.status === 'coming_soon'
                  ? 'Coming Soon'
                  : selectedType === 'bundle'
                    ? 'Subscribe'
                    : selectedType === 'agent'
                      ? 'Activate Agent'
                      : 'Activate'}
              </button>
              <button
                onClick={() => {
                  setSelectedItem(null);
                  setDetail(null);
                }}
                className="px-4 py-2 rounded-lg text-[12px] transition-colors"
                style={{
                  background: 'var(--c-bg-2)',
                  color: 'var(--c-text-3)',
                  border: '1px solid var(--c-border-2)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
