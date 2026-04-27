/**
 * Trial status banner — shows trial countdown and upgrade prompt.
 * Fetches from shre-stripe via /api/trial-status proxy.
 */
import { useState, useEffect } from 'react';
import { getStoredWorkspaceId } from '../workspace-context';

interface TrialStatus {
  active: boolean;
  daysRemaining: number;
  trialEnd: string;
  plan: string;
  expired: boolean;
}

const PLANS = [
  { id: 'starter', name: 'Starter', price: '$29/mo', desc: '3 agents, 10k requests' },
  { id: 'pro', name: 'Pro', price: '$99/mo', desc: '10 agents, 100k requests' },
  { id: 'business', name: 'Business', price: '$299/mo', desc: 'Unlimited agents' },
];

export function TrialBanner() {
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = getStoredWorkspaceId();

  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/trial-status?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTrial(data);
      })
      .catch(() => {});
  }, [workspaceId]);

  if (!trial || dismissed) return null;
  // Don't show banner for paid plans
  if (!trial.active && !trial.expired) return null;

  async function handleUpgrade(planId: string) {
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, planId }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setUpgrading(false);
    }
  }

  const isExpired = trial.expired;
  const isUrgent = trial.daysRemaining <= 3;

  return (
    <div
      className="relative px-4 py-2.5 text-sm flex items-center justify-between gap-3"
      style={{
        background: isExpired
          ? 'rgba(239,68,68,0.12)'
          : isUrgent
            ? 'rgba(249,115,22,0.12)'
            : 'rgba(99,102,241,0.08)',
        borderBottom: `1px solid ${isExpired ? 'rgba(239,68,68,0.25)' : isUrgent ? 'rgba(249,115,22,0.25)' : 'var(--c-border-2)'}`,
        color: isExpired ? '#f87171' : isUrgent ? '#fb923c' : 'var(--c-text-2)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0">{isExpired ? '!' : 'i'}</span>
        <span className="truncate">
          {isExpired
            ? 'Your trial has ended. Upgrade to continue using Shre AI.'
            : `${trial.daysRemaining} day${trial.daysRemaining !== 1 ? 's' : ''} left in your free trial`}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setShowPlans(!showPlans)}
          disabled={upgrading}
          className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: isExpired ? '#ef4444' : 'var(--c-accent)',
            color: '#fff',
            opacity: upgrading ? 0.6 : 1,
          }}
        >
          {upgrading ? 'Loading...' : 'Upgrade'}
        </button>
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--c-text-4)' }}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Plan picker dropdown */}
      {showPlans && (
        <div
          className="absolute top-full right-4 mt-1 rounded-lg shadow-xl z-50 overflow-hidden"
          style={{
            background: 'var(--c-bg-2)',
            border: '1px solid var(--c-border-1)',
            minWidth: 260,
          }}
        >
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => handleUpgrade(plan.id)}
              className="w-full px-4 py-3 text-left hover:opacity-80 transition-opacity flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--c-border-2)', color: 'var(--c-text-1)' }}
            >
              <div>
                <div className="text-sm font-medium">{plan.name}</div>
                <div className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  {plan.desc}
                </div>
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--c-accent)' }}>
                {plan.price}
              </span>
            </button>
          ))}
          {error && (
            <div className="px-4 py-2 text-xs" style={{ color: '#f87171' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
