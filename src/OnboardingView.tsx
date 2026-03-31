/**
 * First-time onboarding flow — creates user identity, soul, business profile.
 * Shown once after first login. Multi-step wizard.
 */
import { useState } from 'react';
import type { UserProfile } from './store';

interface Props {
  profile: UserProfile;
  onComplete: (profile: UserProfile) => void;
  onSkip: () => void;
}

/** POST to server to provision a workspace after onboarding */
async function provisionWorkspace(profile: UserProfile): Promise<string | null> {
  try {
    const res = await fetch('/api/provision-workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: profile.id,
        name: profile.name,
        businessName: profile.business.name,
        industry: profile.business.industry,
        size: profile.business.size,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.workspaceId || null;
  } catch {
    return null;
  }
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
  { value: 'solo', label: 'Just me', icon: '👤' },
  { value: 'small', label: '2-10 people', icon: '👥' },
  { value: 'medium', label: '11-50 people', icon: '🏢' },
  { value: 'large', label: '50+ people', icon: '🏙️' },
];

const COMM_STYLES = [
  { value: 'concise' as const, label: 'Concise', desc: 'Short, direct answers', icon: '⚡' },
  { value: 'balanced' as const, label: 'Balanced', desc: 'Clear with context', icon: '⚖️' },
  { value: 'detailed' as const, label: 'Detailed', desc: 'Thorough explanations', icon: '📖' },
];

export function OnboardingView({ profile, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>({ ...profile });
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const update = (partial: Partial<UserProfile>) => setP((prev) => ({ ...prev, ...partial }));
  const updateBiz = (partial: Partial<UserProfile['business']>) =>
    setP((prev) => ({ ...prev, business: { ...prev.business, ...partial } }));
  const updatePrefs = (partial: Partial<UserProfile['preferences']>) =>
    setP((prev) => ({ ...prev, preferences: { ...prev.preferences, ...partial } }));

  const [goalInput, setGoalInput] = useState('');
  const [challengeInput, setChallengeInput] = useState('');
  const [toolInput, setToolInput] = useState('');

  const steps = [
    // Step 0: Welcome / About You
    <div key="about" className="space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-3">👋</div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Welcome! Let's get to know you
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-4)' }}>
          This helps your AI assistants personalize their help
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
          label="Your role / title"
          value={p.role}
          onChange={(v) => update({ role: v })}
          placeholder="e.g., CEO, Store Manager, Developer"
        />
        <Field
          label="Short bio (optional)"
          value={p.bio}
          onChange={(v) => update({ bio: v })}
          placeholder="What do you do? What drives you?"
          multiline
        />
      </div>
    </div>,

    // Step 1: Your Business
    <div key="business" className="space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-3">🏪</div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Tell us about your business
        </h2>
      </div>
      <div className="space-y-3">
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
          <div className="flex flex-wrap gap-2">
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
          <div className="grid grid-cols-2 gap-2">
            {BIZ_SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => updateBiz({ size: s.value })}
                className="px-3 py-2.5 rounded-lg text-left transition-all text-sm"
                style={{
                  border: `1px solid ${p.business.size === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                  background:
                    p.business.size === s.value ? 'rgba(99,102,241,0.1)' : 'var(--c-bg-card)',
                  color: 'var(--c-text-2)',
                }}
              >
                <span className="mr-2">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,

    // Step 2: Goals & Challenges
    <div key="goals" className="space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          Goals & Challenges
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-4)' }}>
          What are you trying to achieve? What's getting in the way?
        </p>
      </div>
      <div className="space-y-4">
        <TagInput
          label="Top goals"
          placeholder="e.g., Increase online orders"
          value={goalInput}
          onChange={setGoalInput}
          items={p.business.goals}
          onAdd={(v) => updateBiz({ goals: [...p.business.goals, v] })}
          onRemove={(i) => updateBiz({ goals: p.business.goals.filter((_, j) => j !== i) })}
        />
        <TagInput
          label="Biggest challenges"
          placeholder="e.g., Staff scheduling"
          value={challengeInput}
          onChange={setChallengeInput}
          items={p.business.challenges}
          onAdd={(v) => updateBiz({ challenges: [...p.business.challenges, v] })}
          onRemove={(i) =>
            updateBiz({ challenges: p.business.challenges.filter((_, j) => j !== i) })
          }
        />
        <TagInput
          label="Tools you use"
          placeholder="e.g., RapidRMS, Square, DoorDash"
          value={toolInput}
          onChange={setToolInput}
          items={p.business.tools}
          onAdd={(v) => updateBiz({ tools: [...p.business.tools, v] })}
          onRemove={(i) => updateBiz({ tools: p.business.tools.filter((_, j) => j !== i) })}
        />
      </div>
    </div>,

    // Step 3: Preferences
    <div key="prefs" className="space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-3">⚙️</div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
          How should I communicate?
        </h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
            Communication style
          </label>
          <div className="grid grid-cols-3 gap-2">
            {COMM_STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => updatePrefs({ communicationStyle: s.value })}
                className="px-3 py-3 rounded-lg text-center transition-all"
                style={{
                  border: `1px solid ${p.preferences.communicationStyle === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                  background:
                    p.preferences.communicationStyle === s.value
                      ? 'rgba(99,102,241,0.1)'
                      : 'var(--c-bg-card)',
                  color: 'var(--c-text-2)',
                }}
              >
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="text-xs font-medium">{s.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Show pending tasks on greeting"
          checked={p.preferences.showTasksOnGreeting}
          onChange={(v) => updatePrefs({ showTasksOnGreeting: v })}
        />
        <Toggle
          label="Notify when agents finish background work"
          checked={p.preferences.notifyOnComplete}
          onChange={(v) => updatePrefs({ notifyOnComplete: v })}
        />
        <Toggle
          label="Enable floating chat bubble"
          checked={p.preferences.floatingChat}
          onChange={(v) => updatePrefs({ floatingChat: v })}
        />
      </div>
    </div>,
  ];

  const isLast = step === steps.length - 1;
  const canNext = step === 0 ? p.name.trim().length > 0 : true;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--c-bg-1)' }}
    >
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? '24px' : '8px',
                background: i <= step ? 'var(--c-accent)' : 'var(--c-border-2)',
              }}
            />
          ))}
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }}
        >
          {steps[step]}

          <div
            className="flex items-center justify-between mt-6 pt-4"
            style={{ borderTop: '1px solid var(--c-border-2)' }}
          >
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
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
            <button
              onClick={async () => {
                if (isLast) {
                  setProvisioning(true);
                  setProvisionError(null);
                  const completed = { ...p, onboardedAt: Date.now() };
                  try {
                    const wsId = await provisionWorkspace(completed);
                    if (wsId) {
                      sessionStorage.setItem('shre-workspace-id', wsId);
                    }
                  } catch {
                    // non-blocking — workspace can be provisioned later
                  }
                  setProvisioning(false);
                  onComplete(completed);
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={!canNext || provisioning}
              className="text-sm px-5 py-2 rounded-lg font-medium transition-colors"
              style={{
                background: canNext && !provisioning ? 'var(--c-accent)' : 'var(--c-border-2)',
                color: canNext && !provisioning ? '#fff' : 'var(--c-text-5)',
              }}
            >
              {provisioning ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Setting up workspace...
                </span>
              ) : isLast ? (
                'Get Started'
              ) : (
                'Next'
              )}
            </button>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
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

function TagInput({
  label,
  placeholder,
  value,
  onChange,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onAdd(value.trim());
              onChange('');
              e.preventDefault();
            }
          }}
          className="flex-1"
          style={{
            background: 'var(--c-bg-3)',
            border: '1px solid var(--c-border-2)',
            color: 'var(--c-text-1)',
            outline: 'none',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        />
        <button
          onClick={() => {
            if (value.trim()) {
              onAdd(value.trim());
              onChange('');
            }
          }}
          className="px-3 rounded-lg text-xs"
          style={{ background: 'var(--c-bg-active)', color: 'var(--c-text-2)' }}
        >
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--c-accent)' }}
            >
              {item}
              <button onClick={() => onRemove(i)} className="opacity-60 hover:opacity-100">
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>
        {label}
      </span>
      <div
        className="w-10 h-5 rounded-full relative transition-colors cursor-pointer"
        style={{ background: checked ? 'var(--c-accent)' : 'var(--c-border-2)' }}
        onClick={() => onChange(!checked)}
      >
        <div
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </div>
    </label>
  );
}
