import { useState, useEffect, useCallback } from 'react';

interface OAuthStatus {
  providers: Record<string, { tokens: number; clients: number }>;
  totalTokens: number;
}

interface OAuthSetupProps {
  onClose?: () => void;
}

export function OAuthSetup({ onClose }: OAuthSetupProps) {
  const [step, setStep] = useState<'check' | 'configure' | 'connected'>('check');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'apikey' | 'oauth'>('apikey');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [connectedTokens, setConnectedTokens] = useState(0);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/oauth/status');
      if (!r.ok) throw new Error('Could not reach OAuth service');
      const data: OAuthStatus = await r.json();
      const anthropic = data.providers?.anthropic;
      if (anthropic?.tokens > 0) {
        setConnectedTokens(anthropic.tokens);
        setStep('connected');
      } else if (anthropic?.clients > 0) {
        setStep('configure'); // client registered but no token yet
      } else {
        setStep('configure');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to check OAuth status');
      setStep('configure');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  async function registerClient() {
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
          provider: 'anthropic',
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(d.error || 'Registration failed');
      }
      // Start OAuth flow
      startOAuthFlow();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function startOAuthFlow() {
    setError(null);
    try {
      const r = await fetch('/api/oauth/authorize/anthropic');
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Could not start OAuth flow' }));
        throw new Error(d.error || 'Could not start OAuth flow');
      }
      const { authUrl } = await r.json();
      if (authUrl) {
        // Open OAuth in popup/new tab
        const popup = window.open(authUrl, 'oauth-anthropic', 'width=600,height=700');
        if (!popup) {
          // Fallback: redirect in same window
          window.location.href = authUrl;
          return;
        }
        // Poll for popup close → re-check status
        const iv = setInterval(() => {
          if (popup.closed) {
            clearInterval(iv);
            checkStatus();
          }
        }, 1000);
        // Safety: stop polling after 5 min
        setTimeout(() => clearInterval(iv), 5 * 60 * 1000);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function storeApiKeyAsOAuth() {
    if (!apiKey.trim()) {
      setError('Paste your Anthropic API key');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          accessToken: apiKey.trim(),
          tokenType: 'api_key',
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Store failed' }));
        throw new Error(d.error || 'Failed to store key');
      }
      await checkStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    // Remove all anthropic tokens via status → list → delete
    setLoading(true);
    try {
      // For now, just refresh — actual disconnect would need token listing
      await checkStatus();
    } finally {
      setLoading(false);
    }
  }

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
    <div className="px-3 py-3 space-y-3" style={{ color: 'var(--c-text-2)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--c-accent)' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Claude OAuth
          </span>
        </div>
        {step === 'connected' && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
            Connected
          </span>
        )}
      </div>

      {error && (
        <div className="text-[12px] px-2.5 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Connected State */}
      {step === 'connected' && (
        <div className="space-y-2">
          <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>
            Anthropic OAuth is active with {connectedTokens} token{connectedTokens !== 1 ? 's' : ''}.
            Chat requests will use OAuth authentication.
          </div>
          <div className="flex gap-2">
            <button
              onClick={checkStatus}
              className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }}
            >
              Refresh Status
            </button>
          </div>
        </div>
      )}

      {/* Configure State */}
      {step === 'configure' && (
        <div className="space-y-3">
          <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>
            Connect your Anthropic account via OAuth or store an API key directly.
          </div>

          {/* Tab buttons */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--c-bg-3)' }}>
            <TabButton active={mode === 'apikey'} onClick={() => setMode('apikey')} label="API Key" />
            <TabButton active={mode === 'oauth'} onClick={() => setMode('oauth')} label="OAuth App" />
          </div>

          {/* API Key mode (simpler) */}
          {mode === 'apikey' && (
            <div className="space-y-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none transition-colors"
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--c-accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <button
                onClick={storeApiKeyAsOAuth}
                disabled={saving || !apiKey.trim()}
                className="w-full py-2 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background: apiKey.trim() ? 'var(--c-accent)' : 'var(--c-bg-3)',
                  color: apiKey.trim() ? '#fff' : 'var(--c-text-5)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Storing...' : 'Store API Key'}
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
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--c-accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="OAuth Client Secret"
                className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none transition-colors"
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border-2)',
                  color: 'var(--c-text-1)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--c-accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--c-border-2)')}
              />
              <button
                onClick={registerClient}
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
                className="w-full py-2 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background: clientId.trim() && clientSecret.trim() ? 'var(--c-accent)' : 'var(--c-bg-3)',
                  color: clientId.trim() && clientSecret.trim() ? '#fff' : 'var(--c-text-5)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Connecting...' : 'Connect with Claude'}
              </button>
            </div>
          )}

          <div className="text-[10px] leading-relaxed" style={{ color: 'var(--c-text-5)' }}>
            API keys are stored securely in shre-router's encrypted key vault. OAuth tokens auto-refresh.
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
