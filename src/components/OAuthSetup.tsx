import { useState, useEffect, useCallback } from 'react';
import { getProviderDisplayLabel } from '../model-families';

interface ProviderStatus {
  tokens: number;
  clients: number;
}

interface OAuthStatusResponse {
  totalTokens: number;
  byProvider: Record<string, ProviderStatus>;
  registeredClients: string[];
}

interface ProviderConfig {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  note?: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: getProviderDisplayLabel('anthropic'),
    color: '#d97706',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'openai',
    label: getProviderDisplayLabel('openai'),
    note: 'Also unlocks Codex models',
    color: '#10a37f',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
  },
  {
    id: 'google',
    label: getProviderDisplayLabel('google'),
    color: '#2563eb',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21.8 10H12v4h5.7c-.6 3-3.2 5-5.7 5-3.9 0-7-3.1-7-7s3.1-7 7-7c1.8 0 3.2.6 4.4 1.6l3-3C17.3 2.6 14.9 1.7 12 1.7 6.5 1.7 2 6.1 2 11.7S6.5 21.7 12 21.7c6 0 10-4.2 10-10.3 0-.7-.1-1.1-.2-1.4z" />
      </svg>
    ),
  },
  {
    id: 'moonshot',
    label: getProviderDisplayLabel('moonshot'),
    color: '#7c3aed',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2a10 10 0 1 0 8.66 5H12V2z" />
      </svg>
    ),
  },
  {
    id: 'nvidia',
    label: getProviderDisplayLabel('nvidia'),
    color: '#16a34a',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8v6H8z" />
      </svg>
    ),
  },
];

interface OAuthSetupProps {
  onClose?: () => void;
}

export function OAuthSetup({ onClose }: OAuthSetupProps) {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<OAuthStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/oauth/status');
      if (!r.ok) throw new Error('Could not reach OAuth service');
      const data: OAuthStatusResponse = await r.json();
      setStatusData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to check OAuth status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (loading) {
    return (
      <div className="px-3 py-4 flex items-center justify-center">
        <div
          className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"
          style={{ color: 'var(--c-text-5)' }}
        />
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-2" style={{ color: 'var(--c-text-2)' }}>
      {error && (
        <div
          className="text-[12px] px-2.5 py-2 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
        >
          {error}
        </div>
      )}

      {PROVIDERS.map((provider) => {
        const providerData = statusData?.byProvider?.[provider.id];
        const isConnected = (providerData?.tokens ?? 0) > 0;
        const isExpanded = expandedProvider === provider.id;

        return (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isConnected={isConnected}
            tokenCount={providerData?.tokens ?? 0}
            isExpanded={isExpanded}
            onToggle={() => setExpandedProvider(isExpanded ? null : provider.id)}
            onStatusChange={checkStatus}
          />
        );
      })}

      <div className="text-[10px] leading-relaxed pt-1" style={{ color: 'var(--c-text-5)' }}>
        Keys stored in shre-router's encrypted vault. OAuth tokens auto-refresh.
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  isConnected,
  tokenCount,
  isExpanded,
  onToggle,
  onStatusChange,
}: {
  provider: ProviderConfig;
  isConnected: boolean;
  tokenCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: () => void;
}) {
  const [mode, setMode] = useState<'apikey' | 'oauth'>('apikey');
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function storeApiKey() {
    if (!apiKey.trim()) {
      setError(`Paste your ${provider.label} API key`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          accessToken: apiKey.trim(),
          tokenType: 'api_key',
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Store failed' }));
        throw new Error(d.error || 'Failed to store key');
      }
      setApiKey('');
      onStatusChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to store key');
    } finally {
      setSaving(false);
    }
  }

  async function registerAndConnect() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID and Client Secret are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/oauth/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(d.error || 'Registration failed');
      }
      // Start OAuth flow
      await startOAuthFlow();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setSaving(false);
    }
  }

  async function startOAuthFlow() {
    setError(null);
    try {
      const r = await fetch(`/api/oauth/authorize/${provider.id}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Could not start OAuth flow' }));
        throw new Error(d.error || 'Could not start OAuth flow');
      }
      const { authUrl } = await r.json();
      if (authUrl) {
        const popup = window.open(authUrl, `oauth-${provider.id}`, 'width=600,height=700');
        if (!popup) {
          window.location.href = authUrl;
          return;
        }
        const iv = setInterval(() => {
          if (popup.closed) {
            clearInterval(iv);
            onStatusChange();
          }
        }, 1000);
        setTimeout(() => clearInterval(iv), 5 * 60 * 1000);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start OAuth flow');
    }
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      {/* Provider header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors hover:bg-white/5"
        style={{ background: 'var(--c-bg-2)' }}
      >
        <span style={{ color: provider.color }}>{provider.icon}</span>
        <span
          className="text-[13px] font-semibold flex-1 text-left"
          style={{ color: 'var(--c-text-1)' }}
        >
          {provider.label}
        </span>
        {isConnected && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
          >
            {tokenCount} key{tokenCount !== 1 ? 's' : ''}
          </span>
        )}
        <svg
          className="h-3 w-3 transition-transform"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--c-text-4)',
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded config area */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-3" style={{ borderTop: '1px solid var(--c-border-2)' }}>
          {isConnected && (
            <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>
              {provider.label} is active with {tokenCount} token{tokenCount !== 1 ? 's' : ''}. You
              can add more keys below.
            </div>
          )}
          {!isConnected && provider.note && (
            <div className="text-[12px]" style={{ color: 'var(--c-text-4)' }}>
              {provider.note}
            </div>
          )}

          {error && (
            <div
              className="text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
            >
              {error}
            </div>
          )}

          {/* Tab buttons */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--c-bg-3)' }}>
            <TabButton
              active={mode === 'apikey'}
              onClick={() => setMode('apikey')}
              label="API Key"
            />
            <TabButton
              active={mode === 'oauth'}
              onClick={() => setMode('oauth')}
              label="OAuth App"
            />
          </div>

          {/* API Key mode */}
          {mode === 'apikey' && (
            <div className="space-y-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Paste your ${provider.label} API key`}
                className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none transition-colors"
                style={{
                  background: 'var(--c-bg-1)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = provider.color)}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <button
                onClick={storeApiKey}
                disabled={saving || !apiKey.trim()}
                className="w-full py-2 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background: apiKey.trim() ? provider.color : 'var(--c-bg-3)',
                  color: apiKey.trim() ? '#fff' : 'var(--c-text-5)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Storing...' : `Store ${provider.label} Key`}
              </button>
            </div>
          )}

          {/* OAuth App mode */}
          {mode === 'oauth' && (
            <div className="space-y-2">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="OAuth Client ID"
                className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none transition-colors"
                style={{
                  background: 'var(--c-bg-1)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = provider.color)}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="OAuth Client Secret"
                className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none transition-colors"
                style={{
                  background: 'var(--c-bg-1)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = provider.color)}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <button
                onClick={registerAndConnect}
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
                className="w-full py-2 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background:
                    clientId.trim() && clientSecret.trim() ? provider.color : 'var(--c-bg-3)',
                  color: clientId.trim() && clientSecret.trim() ? '#fff' : 'var(--c-text-5)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Connecting...' : `Connect with ${provider.label}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors"
      style={{
        background: active ? 'var(--c-bg-1)' : 'transparent',
        color: active ? 'var(--c-text-1)' : 'var(--c-text-4)',
      }}
    >
      {label}
    </button>
  );
}
