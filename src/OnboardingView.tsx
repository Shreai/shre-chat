/**
 * Unified onboarding wizard — 3 phases: Identity, Connect, Activate.
 * Persists state to server (MIB007 aros_onboarding table) for cross-app consistency.
 * Phase 2 (Connect) and Phase 3 (Activate) are skippable.
 */
import { useState, useEffect } from 'react';
import type { UserProfile } from './store';
import { persistWorkspaceContext } from './workspace-context';

interface Props {
  profile: UserProfile;
  userId: string;
  onComplete: (
    profile: UserProfile,
    selectedAgents?: string[],
    selectedBundle?: string | null,
  ) => void;
  onSkip: () => void;
}

interface AgentBundle {
  id: string;
  name: string;
  description: string;
  agents: string[];
  recommended?: boolean;
}

interface ConnectorNode {
  id: string;
  name: string;
  category: string;
  configSchema?: Record<
    string,
    { type: string; required?: boolean; label: string; secret?: boolean; default?: unknown }
  >;
}

interface TestResult {
  valid: boolean;
  message?: string;
}

const INDUSTRIES = [
  'Retail / C-Store',
  'Restaurant / QSR',
  'Grocery',
  'Gas Station',
  'Liquor Store',
  'Pharmacy',
  'E-commerce',
  'SaaS / Tech',
  'Healthcare',
  'Finance',
  'Real Estate',
  'Manufacturing',
  'Consulting',
  'Education',
  'Non-profit',
  'Other',
];

const BIZ_SIZES = [
  { value: 'solo', label: 'Just me' },
  { value: 'small', label: '2-10 people' },
  { value: 'medium', label: '11-50 people' },
  { value: 'large', label: '50+ people' },
];

const FALLBACK_SOURCES: ConnectorNode[] = [
  { id: 'com.nirlab.rapidrms', name: 'RapidRMS', category: 'pos' },
  { id: 'com.nirlab.square', name: 'Square', category: 'pos' },
  { id: 'com.nirlab.clover', name: 'Clover', category: 'pos' },
  { id: 'com.nirlab.csv-import', name: 'CSV / Excel Import', category: 'file' },
];

const COMM_STYLES = [
  { value: 'concise' as const, label: 'Concise', desc: 'Short, direct answers' },
  { value: 'balanced' as const, label: 'Balanced', desc: 'Clear with context' },
  { value: 'detailed' as const, label: 'Detailed', desc: 'Thorough explanations' },
];

const PHASE_LABELS = ['Identity', 'Connect', 'Activate'];

export function OnboardingView({ profile, userId, onComplete, onSkip }: Props) {
  const [phase, setPhase] = useState(0);
  const [p, setP] = useState<UserProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorNode[]>(FALLBACK_SOURCES);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [connectorConfigs, setConnectorConfigs] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [bundles, setBundles] = useState<AgentBundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);

  const update = (partial: Partial<UserProfile>) => setP((prev) => ({ ...prev, ...partial }));
  const updateBiz = (partial: Partial<UserProfile['business']>) =>
    setP((prev) => ({ ...prev, business: { ...prev.business, ...partial } }));
  const updatePrefs = (partial: Partial<UserProfile['preferences']>) =>
    setP((prev) => ({ ...prev, preferences: { ...prev.preferences, ...partial } }));

  // Resume from server state if user previously completed some phases
  useEffect(() => {
    fetch(`/api/onboarding/status?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.started) return;
        const serverPhase = data.phase || data.onboardingPhase;
        if (serverPhase === 'connect') setPhase(1);
        else if (serverPhase === 'activate') setPhase(2);
        // Pre-populate identity if available
        if (data.identityData) {
          const id = data.identityData;
          if (id.name) update({ name: id.name });
          if (id.role) update({ role: id.role });
          if (id.businessName || id.businessType || id.businessSize) {
            updateBiz({
              name: id.businessName || '',
              industry: id.businessType || '',
              size: id.businessSize || '',
            });
          }
        }
      })
      .catch(() => {}); // Server unreachable — start fresh
  }, []);

  // Fetch marketplace connectors on mount
  useEffect(() => {
    fetch('/api/onboarding/connectors')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setConnectors(data);
      })
      .catch(() => {});
  }, []);

  // Fetch agent bundles when entering phase 2
  useEffect(() => {
    if (phase === 2 && bundles.length === 0) {
      fetch('/api/onboarding/agent-bundles')
        .then((r) => (r.ok ? r.json() : { bundles: [] }))
        .then((data) => {
          const list = data.bundles || data || [];
          setBundles(list);
          // Auto-select recommended bundle
          const rec = list.find((b: AgentBundle) => b.recommended);
          if (rec && !selectedBundle) setSelectedBundle(rec.id);
        })
        .catch(() => {
          // Use hardcoded fallback
          setBundles([
            {
              id: 'essentials',
              name: 'Retail Essentials',
              description: 'POS analytics, inventory alerts, sales reports',
              agents: ['aros-agent', 'ana', 'victor'],
              recommended: true,
            },
            {
              id: 'developer',
              name: 'Developer',
              description: 'Code, infra, security agents',
              agents: ['founding-engineer', 'architect', 'founding-security'],
            },
            {
              id: 'business',
              name: 'Business Suite',
              description: 'Sales, marketing, strategy',
              agents: ['herald', 'compass', 'sunny'],
            },
          ]);
          if (!selectedBundle) setSelectedBundle('essentials');
        });
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAdvance = phase === 0 ? p.name.trim().length > 0 : true;

  async function testConnector(nodeId: string) {
    const config = connectorConfigs[nodeId];
    if (!config) return;
    setTesting(nodeId);
    setTestResults((prev) => ({ ...prev, [nodeId]: undefined as any }));
    try {
      const res = await fetch(`/api/onboarding/connectors/${encodeURIComponent(nodeId)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [nodeId]: data }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [nodeId]: { valid: false, message: 'Connection failed' },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function handlePhaseComplete() {
    setSaving(true);
    try {
      if (phase === 0) {
        // Phase 1 complete — save identity to server
        await fetch('/api/onboarding/unified/identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            name: p.name,
            role: p.role,
            businessName: p.business.name,
            businessType: p.business.industry,
            businessSize: p.business.size,
          }),
        });
        setPhase(1);
      } else if (phase === 1) {
        // Phase 2 complete (Connect) — save connector selection + configs
        if (selectedSources.length === 0) {
          await fetch('/api/onboarding/unified/skip-connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
        } else {
          // Save selected connectors and their configs to server
          const selectedNodes = selectedSources.map((id) => {
            const node = connectors.find((c) => c.id === id);
            return { nodeId: id, name: node?.name || id, category: node?.category || 'unknown' };
          });
          await fetch('/api/onboarding/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              onboardingPhase: 'activate',
              selectedNodes,
              nodeConfigs: connectorConfigs,
            }),
          });
        }
        setPhase(2);
      } else {
        // Phase 3 complete (Activate) — finish onboarding
        const completed = { ...p, onboardedAt: Date.now() };
        const bundle = bundles.find((b) => b.id === selectedBundle);

        await fetch('/api/onboarding/unified/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            selectedAgents: bundle?.agents || [],
            selectedBundle: selectedBundle,
            chatPreferences: {
              communicationStyle: p.preferences.communicationStyle,
              goals: p.business.goals,
              tools: p.business.tools,
            },
          }),
        });

        // Also provision workspace
        try {
          const wsRes = await fetch('/api/provision-workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: p.id,
              name: p.name,
              businessName: p.business.name,
              industry: p.business.industry,
              size: p.business.size,
            }),
          });
          if (wsRes.ok) {
            const wsData = await wsRes.json();
            if (wsData.workspaceId) {
              persistWorkspaceContext({
                id: wsData.workspaceId,
                name: wsData.workspaceName || wsData.workspaceId,
                role: 'owner',
              });
            }
          } else {
            setWarning('Workspace setup incomplete — you can configure it later in Settings.');
          }
        } catch {
          setWarning('Workspace setup incomplete — you can configure it later in Settings.');
        }

        onComplete(completed, bundle?.agents || [], selectedBundle);
        return;
      }
    } catch {
      // Non-fatal — continue locally even if server save fails
      if (phase === 2) {
        const bundle = bundles.find((b) => b.id === selectedBundle);
        onComplete({ ...p, onboardedAt: Date.now() }, bundle?.agents || [], selectedBundle);
        return;
      }
      setPhase(phase + 1);
    } finally {
      setSaving(false);
    }
  }

  const phases = [
    // Phase 1: Identity
    <div key="identity" className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Welcome to Shre AI
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-4)' }}>
          Tell us about yourself so your AI assistants can personalize their help
        </p>
      </div>
      <div className="space-y-3">
        <Field
          label="Your name"
          value={p.name}
          onChange={(v) => update({ name: v })}
          placeholder="e.g., Nir"
        />
        <Field
          label="Your role"
          value={p.role}
          onChange={(v) => update({ role: v })}
          placeholder="e.g., CEO, Store Manager, Developer"
        />
        <Field
          label="Business name"
          value={p.business.name}
          onChange={(v) => updateBiz({ name: v })}
          placeholder="e.g., Quick Stop Mart"
        />
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
            Industry
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map((ind) => (
              <Chip
                key={ind}
                label={ind}
                active={p.business.industry === ind}
                onClick={() => updateBiz({ industry: ind })}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
            Team size
          </label>
          <div className="grid grid-cols-4 gap-2">
            {BIZ_SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => updateBiz({ size: s.value })}
                className="px-2 py-2 rounded-lg text-center transition-all text-xs"
                style={{
                  border: `1px solid ${p.business.size === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                  background:
                    p.business.size === s.value ? 'rgba(99,102,241,0.1)' : 'var(--c-bg-card)',
                  color: 'var(--c-text-2)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,

    // Phase 2: Connect
    <div key="connect" className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Connect a data source
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-4)' }}>
          Optional — connect your POS or import data so AI can start analyzing right away
        </p>
      </div>

      {/* Connector picker */}
      <div className="space-y-2">
        {connectors.map((src) => {
          const selected = selectedSources.includes(src.id);
          const result = testResults[src.id];
          const isTesting = testing === src.id;
          return (
            <div key={src.id}>
              <button
                onClick={() => {
                  setSelectedSources((prev) =>
                    prev.includes(src.id) ? prev.filter((s) => s !== src.id) : [...prev, src.id],
                  );
                  if (!connectorConfigs[src.id])
                    setConnectorConfigs((prev) => ({ ...prev, [src.id]: {} }));
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all text-sm"
                style={{
                  border: `1px solid ${selected ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                  background: selected ? 'rgba(99,102,241,0.08)' : 'var(--c-bg-card)',
                  color: 'var(--c-text-2)',
                  borderRadius: selected && src.configSchema ? '8px 8px 0 0' : '8px',
                }}
              >
                <div
                  className="w-5 h-5 rounded border flex items-center justify-center text-xs"
                  style={{
                    borderColor: selected ? 'var(--c-accent)' : 'var(--c-border-2)',
                    background: selected ? 'var(--c-accent)' : 'transparent',
                    color: selected ? '#fff' : 'transparent',
                  }}
                >
                  {selected ? '\u2713' : ''}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{src.name}</div>
                  <div className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                    {src.category}
                  </div>
                </div>
                {result && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: result.valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: result.valid ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
                    }}
                  >
                    {result.valid ? 'Connected' : 'Failed'}
                  </span>
                )}
              </button>

              {/* Credential form — shown when connector is selected and has configSchema */}
              {selected && src.configSchema && (
                <div
                  className="px-4 py-3 space-y-2"
                  style={{
                    background: 'var(--c-bg-3)',
                    border: '1px solid var(--c-border-2)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                  }}
                >
                  {Object.entries(src.configSchema).map(([field, schema]) => {
                    if (schema.required === false) return null;
                    return (
                      <Field
                        key={field}
                        label={schema.label || field}
                        value={connectorConfigs[src.id]?.[field] || ''}
                        onChange={(v) =>
                          setConnectorConfigs((prev) => ({
                            ...prev,
                            [src.id]: { ...prev[src.id], [field]: v },
                          }))
                        }
                        placeholder={
                          schema.secret
                            ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                            : `Enter ${schema.label || field}`
                        }
                        secret={schema.secret}
                      />
                    );
                  })}
                  <button
                    onClick={() => testConnector(src.id)}
                    disabled={isTesting}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: 'var(--c-accent)',
                      color: '#fff',
                      opacity: isTesting ? 0.6 : 1,
                    }}
                  >
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  {result && !result.valid && result.message && (
                    <p className="text-xs" style={{ color: 'rgb(239,68,68)' }}>
                      {result.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--c-text-5)' }}>
        You can always connect data sources later from Settings
      </p>
    </div>,

    // Phase 3: Activate
    <div key="activate" className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Choose your AI team
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-4)' }}>
          Pick a bundle of AI agents to start with — you can add more later
        </p>
      </div>
      <div className="space-y-2">
        {bundles.map((bundle) => (
          <button
            key={bundle.id}
            onClick={() => setSelectedBundle(bundle.id)}
            className="w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-all text-sm"
            style={{
              border: `1px solid ${selectedBundle === bundle.id ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
              background:
                selectedBundle === bundle.id ? 'rgba(99,102,241,0.08)' : 'var(--c-bg-card)',
              color: 'var(--c-text-2)',
            }}
          >
            <div
              className="w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
              style={{
                borderColor: selectedBundle === bundle.id ? 'var(--c-accent)' : 'var(--c-border-2)',
              }}
            >
              {selectedBundle === bundle.id && (
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--c-accent)' }} />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                {bundle.name}
                {bundle.recommended && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--c-accent)' }}
                  >
                    Recommended
                  </span>
                )}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                {bundle.description}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--c-text-5)' }}>
                {bundle.agents.length} agent{bundle.agents.length !== 1 ? 's' : ''}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Communication style */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
          How should AI communicate with you?
        </label>
        <div className="grid grid-cols-3 gap-2">
          {COMM_STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => updatePrefs({ communicationStyle: s.value })}
              className="px-2 py-2 rounded-lg text-center transition-all"
              style={{
                border: `1px solid ${p.preferences.communicationStyle === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                background:
                  p.preferences.communicationStyle === s.value
                    ? 'rgba(99,102,241,0.1)'
                    : 'var(--c-bg-card)',
                color: 'var(--c-text-2)',
              }}
            >
              <div className="text-xs font-medium">{s.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                {s.desc}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
  ];

  return (
    <div
      className="min-h-screen flex items-start justify-center overflow-y-auto px-4 py-8 md:items-center"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div className="w-full max-w-lg my-auto">
        {/* Phase indicator */}
        <div className="flex justify-center gap-3 mb-6">
          {PHASE_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === phase ? '28px' : '8px',
                  background: i <= phase ? 'var(--c-accent)' : 'var(--c-border-2)',
                }}
              />
              {i === phase && (
                <span className="text-[10px] font-medium" style={{ color: 'var(--c-accent)' }}>
                  {label}
                </span>
              )}
            </div>
          ))}
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }}
        >
          {warning && (
            <div
              className="mb-4 px-3 py-2 rounded-lg text-xs"
              style={{
                background: 'rgba(234,179,8,0.1)',
                color: 'rgb(202,138,4)',
                border: '1px solid rgba(234,179,8,0.2)',
              }}
            >
              {warning}
            </div>
          )}
          {phases[phase]}

          <div
            className="flex items-center justify-between mt-6 pt-4"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            {phase > 0 ? (
              <button
                onClick={() => setPhase(phase - 1)}
                className="text-sm px-4 py-2 rounded-lg"
                style={{ color: 'var(--c-text-3)' }}
              >
                Back
              </button>
            ) : (
              <button
                onClick={onSkip}
                className="text-sm px-4 py-2 rounded-lg"
                style={{ color: 'var(--c-text-5)' }}
              >
                Skip for now
              </button>
            )}
            <div className="flex items-center gap-2">
              {phase === 1 && (
                <button
                  onClick={() => {
                    fetch('/api/onboarding/unified/skip-connect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({}),
                    }).catch(() => {});
                    setPhase(2);
                  }}
                  className="text-sm px-4 py-2 rounded-lg"
                  style={{ color: 'var(--c-text-4)' }}
                >
                  Skip
                </button>
              )}
              <button
                onClick={handlePhaseComplete}
                disabled={!canAdvance || saving}
                className="text-sm px-5 py-2 rounded-lg font-medium transition-colors"
                style={{
                  background: canAdvance && !saving ? 'var(--c-accent)' : 'var(--c-border-2)',
                  color: canAdvance && !saving ? '#fff' : 'var(--c-text-5)',
                }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    Saving...
                  </span>
                ) : phase === 2 ? (
                  'Get Started'
                ) : (
                  'Next'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
}) {
  const style = {
    background: 'var(--c-bg-3)',
    border: '1px solid var(--c-border-2)',
    color: 'var(--c-text-1)',
    outline: 'none',
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
  };
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={style}
        />
      ) : (
        <input
          type={secret ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={style}
        />
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs transition-all"
      style={{
        border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
        background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-text-3)',
      }}
    >
      {label}
    </button>
  );
}
