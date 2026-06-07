import { useState, useEffect } from 'react';
import { SBadge } from '@shre/ui-kit';
import { mib007Link } from './chat-utils';

interface AgentSummary {
  name: string;
  identity?: { emoji?: string };
  stats?: { totalTasks: number; successRate: number; currentTask?: string };
  costs?: { totalCostUsd: number };
  status?: string;
}

interface IntegrationBinding {
  id: string;
  type: string;
  active: boolean;
}

interface IntegrationAgent {
  agentId: string;
  name: string;
  primaryModel: string;
  fallbackModel: string;
  apiLinkId: string;
  active: boolean;
  bindings: IntegrationBinding[];
}

interface ApiLink {
  id: string;
  provider: string;
  keyEnv: string;
  configured: boolean;
  active: boolean;
}

interface IntegrationSettingsResponse {
  ok: boolean;
  apiLinks: ApiLink[];
  agents: IntegrationAgent[];
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return '$0.00';
  return `$${n.toFixed(4)}`;
}

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export function AdminView() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<IntegrationSettingsResponse | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [data, s] = await Promise.all([
        fetchApi<AgentSummary[]>('/api/marketplace/agents'),
        fetchApi<IntegrationSettingsResponse>('/api/admin/integration-settings'),
      ]);
      if (cancelled) return;
      if (!data) setError('Could not load admin data. Is shre-hr running?');
      setAgents(data ?? []);
      if (s?.ok) {
        setSettings(s);
        if (s.agents.length) setSelectedAgentId((prev) => prev || s.agents[0].agentId);
      }
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const selectedAgent = settings?.agents.find((a) => a.agentId === selectedAgentId) || null;

  function patchSelectedAgent(patch: Partial<IntegrationAgent>) {
    if (!settings || !selectedAgent) return;
    setSettings({
      ...settings,
      agents: settings.agents.map((a) =>
        a.agentId === selectedAgent.agentId ? { ...a, ...patch } : a,
      ),
    });
  }

  function addBinding() {
    if (!selectedAgent || !settings) return;
    const next = [...selectedAgent.bindings, { id: '', type: 'app', active: true }];
    patchSelectedAgent({ bindings: next });
  }

  function patchBinding(idx: number, patch: Partial<IntegrationBinding>) {
    if (!selectedAgent) return;
    const next = selectedAgent.bindings.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    patchSelectedAgent({ bindings: next });
  }

  function removeBinding(idx: number) {
    if (!selectedAgent) return;
    const next = selectedAgent.bindings.filter((_, i) => i !== idx);
    patchSelectedAgent({ bindings: next });
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/admin/integration-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: settings.agents, apiLinks: settings.apiLinks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setSettingsMsg(data?.error || 'Save failed');
      } else {
        setSettingsMsg('Saved');
      }
    } catch {
      setSettingsMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }

  const totalSpend = agents.reduce((s, a) => s + (a.costs?.totalCostUsd ?? 0), 0);
  const totalTasks = agents.reduce((s, a) => s + (a.stats?.totalTasks ?? 0), 0);
  const avgQuality = agents.length
    ? agents.reduce((s, a) => s + (a.stats?.successRate ?? 0), 0) / agents.length
    : 0;

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 justify-between"
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
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Admin Overview
          </span>
        </div>
        <button
          onClick={() => window.open(mib007Link('admin'), '_blank')}
          className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--c-bg-2)',
            color: 'var(--c-text-3)',
            border: '1px solid var(--c-border-2)',
          }}
        >
          Full Admin →
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"
              style={{ color: 'var(--c-text-5)' }}
            />
          </div>
        )}
        {error && (
          <SBadge
            variant="destructive"
            className="w-full justify-center rounded-lg px-4 py-3 text-sm"
          >
            {error}
          </SBadge>
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Active Agents
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {agents.length}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Total Spend
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {fmtUsd(totalSpend)}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Total Tasks
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>
                  {totalTasks}
                </div>
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--c-text-5)' }}
                >
                  Avg Quality
                </div>
                <div
                  className="text-lg font-bold"
                  style={{ color: avgQuality > 80 ? '#4ade80' : '#f59e0b' }}
                >
                  {avgQuality.toFixed(0)}%
                </div>
              </div>
            </div>

            <div>
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--c-text-5)' }}
              >
                Agent Roster
              </h3>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--c-border-2)' }}
              >
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: 'var(--c-bg-2)' }}>
                      <th
                        className="text-left px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Agent
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Tasks
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Quality
                      </th>
                      <th
                        className="text-right px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Cost
                      </th>
                      <th
                        className="text-center px-3 py-2 font-semibold"
                        style={{ color: 'var(--c-text-4)' }}
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a, i) => (
                      <tr
                        key={a.name}
                        style={{ background: i % 2 === 0 ? 'var(--c-bg-1)' : 'var(--c-bg-2)' }}
                      >
                        <td className="px-3 py-2 flex items-center gap-1.5">
                          <span>{a.identity?.emoji || '🤖'}</span>
                          <span style={{ color: 'var(--c-text-2)' }}>{a.name}</span>
                        </td>
                        <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                          {a.stats?.totalTasks ?? 0}
                        </td>
                        <td
                          className="text-right px-3 py-2"
                          style={{
                            color: (a.stats?.successRate ?? 0) > 80 ? '#4ade80' : '#f59e0b',
                          }}
                        >
                          {(a.stats?.successRate ?? 0).toFixed(0)}%
                        </td>
                        <td className="text-right px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                          {fmtUsd(a.costs?.totalCostUsd ?? 0)}
                        </td>
                        <td className="text-center px-3 py-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: a.status === 'active' ? '#4ade80' : '#a1a1aa' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--c-text-5)' }}
              >
                Integration & Model Settings
              </h3>
              <div
                className="rounded-lg p-3 space-y-3"
                style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-2)' }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="rounded px-2 py-1.5 text-xs"
                    style={{
                      background: 'var(--c-bg-1)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    {(settings?.agents || []).map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                      Active
                    </label>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedAgent?.active)}
                      onChange={(e) => patchSelectedAgent({ active: e.target.checked })}
                    />
                  </div>
                </div>

                {selectedAgent && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        value={selectedAgent.primaryModel}
                        onChange={(e) => patchSelectedAgent({ primaryModel: e.target.value })}
                        placeholder="Primary model (e.g. anthropic/claude-sonnet-4-5)"
                        className="rounded px-2 py-1.5 text-xs"
                        style={{
                          background: 'var(--c-bg-1)',
                          color: 'var(--c-text-2)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      />
                      <input
                        value={selectedAgent.fallbackModel}
                        onChange={(e) => patchSelectedAgent({ fallbackModel: e.target.value })}
                        placeholder="Fallback model"
                        className="rounded px-2 py-1.5 text-xs"
                        style={{
                          background: 'var(--c-bg-1)',
                          color: 'var(--c-text-2)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      />
                      <select
                        value={selectedAgent.apiLinkId}
                        onChange={(e) => patchSelectedAgent({ apiLinkId: e.target.value })}
                        className="rounded px-2 py-1.5 text-xs"
                        style={{
                          background: 'var(--c-bg-1)',
                          color: 'var(--c-text-2)',
                          border: '1px solid var(--c-border-2)',
                        }}
                      >
                        {(settings?.apiLinks || []).map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.provider} ({l.configured ? 'configured' : 'missing key'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                          Linked Apps / Connectors
                        </div>
                        <button
                          onClick={addBinding}
                          className="px-2 py-1 text-xs rounded"
                          style={{
                            background: 'var(--c-bg-1)',
                            color: 'var(--c-text-3)',
                            border: '1px solid var(--c-border-2)',
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      {selectedAgent.bindings.map((b, i) => (
                        <div key={`${i}-${b.id}`} className="grid grid-cols-12 gap-1">
                          <input
                            value={b.id}
                            onChange={(e) => patchBinding(i, { id: e.target.value })}
                            placeholder="app/connect id"
                            className="col-span-5 rounded px-2 py-1 text-xs"
                            style={{
                              background: 'var(--c-bg-1)',
                              color: 'var(--c-text-2)',
                              border: '1px solid var(--c-border-2)',
                            }}
                          />
                          <select
                            value={b.type}
                            onChange={(e) => patchBinding(i, { type: e.target.value })}
                            className="col-span-3 rounded px-2 py-1 text-xs"
                            style={{
                              background: 'var(--c-bg-1)',
                              color: 'var(--c-text-2)',
                              border: '1px solid var(--c-border-2)',
                            }}
                          >
                            <option value="app">app</option>
                            <option value="connector">connector</option>
                          </select>
                          <label
                            className="col-span-2 text-xs flex items-center gap-1"
                            style={{ color: 'var(--c-text-4)' }}
                          >
                            <input
                              type="checkbox"
                              checked={b.active}
                              onChange={(e) => patchBinding(i, { active: e.target.checked })}
                            />
                            active
                          </label>
                          <button
                            onClick={() => removeBinding(i)}
                            className="col-span-2 text-xs rounded px-1"
                            style={{
                              background: 'var(--c-bg-1)',
                              color: '#ef4444',
                              border: '1px solid var(--c-border-2)',
                            }}
                          >
                            remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <div className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                    API Links
                  </div>
                  {(settings?.apiLinks || []).map((l, i) => (
                    <label key={l.id} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--c-text-3)' }}>
                        {l.provider} ({l.keyEnv}) {l.configured ? '✓' : '✗'}
                      </span>
                      <input
                        type="checkbox"
                        checked={l.active}
                        onChange={(e) => {
                          if (!settings) return;
                          const next = [...settings.apiLinks];
                          next[i] = { ...next[i], active: e.target.checked };
                          setSettings({ ...settings, apiLinks: next });
                        }}
                      />
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={saveSettings}
                    disabled={saving || !settings}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{
                      background: 'var(--c-bg-1)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                  {settingsMsg && (
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                      {settingsMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
