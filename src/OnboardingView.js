import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * First-time onboarding flow — creates user identity, soul, business profile.
 * Shown once after first login. Multi-step wizard.
 */
import { useState } from 'react';
/** POST to server to provision a workspace after onboarding */
async function provisionWorkspace(profile) {
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
        if (!res.ok)
            return null;
        const data = await res.json();
        return data.workspaceId || null;
    }
    catch {
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
    { value: 'concise', label: 'Concise', desc: 'Short, direct answers', icon: '⚡' },
    { value: 'balanced', label: 'Balanced', desc: 'Clear with context', icon: '⚖️' },
    { value: 'detailed', label: 'Detailed', desc: 'Thorough explanations', icon: '📖' },
];
export function OnboardingView({ profile, onComplete, onSkip }) {
    const [step, setStep] = useState(0);
    const [p, setP] = useState({ ...profile });
    const [provisioning, setProvisioning] = useState(false);
    const [provisionError, setProvisionError] = useState(null);
    const update = (partial) => setP((prev) => ({ ...prev, ...partial }));
    const updateBiz = (partial) => setP((prev) => ({ ...prev, business: { ...prev.business, ...partial } }));
    const updatePrefs = (partial) => setP((prev) => ({ ...prev, preferences: { ...prev.preferences, ...partial } }));
    const [goalInput, setGoalInput] = useState('');
    const [challengeInput, setChallengeInput] = useState('');
    const [toolInput, setToolInput] = useState('');
    const steps = [
        // Step 0: Welcome / About You
        _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-3", children: "\uD83D\uDC4B" }), _jsx("h2", { className: "text-xl font-semibold", style: { color: 'var(--c-text-1)' }, children: "Welcome! Let's get to know you" }), _jsx("p", { className: "text-sm mt-1", style: { color: 'var(--c-text-4)' }, children: "This helps your AI assistants personalize their help" })] }), _jsxs("div", { className: "space-y-3", children: [_jsx(Field, { label: "Your name", value: p.name, onChange: (v) => update({ name: v }), placeholder: "e.g., Nir" }), _jsx(Field, { label: "Your role / title", value: p.role, onChange: (v) => update({ role: v }), placeholder: "e.g., CEO, Store Manager, Developer" }), _jsx(Field, { label: "Short bio (optional)", value: p.bio, onChange: (v) => update({ bio: v }), placeholder: "What do you do? What drives you?", multiline: true })] })] }, "about"),
        // Step 1: Your Business
        _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-3", children: "\uD83C\uDFEA" }), _jsx("h2", { className: "text-xl font-semibold", style: { color: 'var(--c-text-1)' }, children: "Tell us about your business" })] }), _jsxs("div", { className: "space-y-3", children: [_jsx(Field, { label: "Business name", value: p.business.name, onChange: (v) => updateBiz({ name: v }), placeholder: "e.g., Quick Stop Mart" }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Industry" }), _jsx("div", { className: "flex flex-wrap gap-2", children: INDUSTRIES.map((ind) => (_jsx(Chip, { label: ind, active: p.business.industry === ind, onClick: () => updateBiz({ industry: ind }) }, ind))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Team size" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: BIZ_SIZES.map((s) => (_jsxs("button", { onClick: () => updateBiz({ size: s.value }), className: "px-3 py-2.5 rounded-lg text-left transition-all text-sm", style: {
                                            border: `1px solid ${p.business.size === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                                            background: p.business.size === s.value ? 'rgba(99,102,241,0.1)' : 'var(--c-bg-card)',
                                            color: 'var(--c-text-2)',
                                        }, children: [_jsx("span", { className: "mr-2", children: s.icon }), s.label] }, s.value))) })] })] })] }, "business"),
        // Step 2: Goals & Challenges
        _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-3", children: "\uD83C\uDFAF" }), _jsx("h2", { className: "text-xl font-semibold", style: { color: 'var(--c-text-1)' }, children: "Goals & Challenges" }), _jsx("p", { className: "text-sm mt-1", style: { color: 'var(--c-text-4)' }, children: "What are you trying to achieve? What's getting in the way?" })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(TagInput, { label: "Top goals", placeholder: "e.g., Increase online orders", value: goalInput, onChange: setGoalInput, items: p.business.goals, onAdd: (v) => updateBiz({ goals: [...p.business.goals, v] }), onRemove: (i) => updateBiz({ goals: p.business.goals.filter((_, j) => j !== i) }) }), _jsx(TagInput, { label: "Biggest challenges", placeholder: "e.g., Staff scheduling", value: challengeInput, onChange: setChallengeInput, items: p.business.challenges, onAdd: (v) => updateBiz({ challenges: [...p.business.challenges, v] }), onRemove: (i) => updateBiz({ challenges: p.business.challenges.filter((_, j) => j !== i) }) }), _jsx(TagInput, { label: "Tools you use", placeholder: "e.g., RapidRMS, Square, DoorDash", value: toolInput, onChange: setToolInput, items: p.business.tools, onAdd: (v) => updateBiz({ tools: [...p.business.tools, v] }), onRemove: (i) => updateBiz({ tools: p.business.tools.filter((_, j) => j !== i) }) })] })] }, "goals"),
        // Step 3: Preferences
        _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl mb-3", children: "\u2699\uFE0F" }), _jsx("h2", { className: "text-xl font-semibold", style: { color: 'var(--c-text-1)' }, children: "How should I communicate?" })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Communication style" }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: COMM_STYLES.map((s) => (_jsxs("button", { onClick: () => updatePrefs({ communicationStyle: s.value }), className: "px-3 py-3 rounded-lg text-center transition-all", style: {
                                            border: `1px solid ${p.preferences.communicationStyle === s.value ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
                                            background: p.preferences.communicationStyle === s.value
                                                ? 'rgba(99,102,241,0.1)'
                                                : 'var(--c-bg-card)',
                                            color: 'var(--c-text-2)',
                                        }, children: [_jsx("div", { className: "text-xl mb-1", children: s.icon }), _jsx("div", { className: "text-xs font-medium", children: s.label }), _jsx("div", { className: "text-[10px] mt-0.5", style: { color: 'var(--c-text-4)' }, children: s.desc })] }, s.value))) })] }), _jsx(Toggle, { label: "Show pending tasks on greeting", checked: p.preferences.showTasksOnGreeting, onChange: (v) => updatePrefs({ showTasksOnGreeting: v }) }), _jsx(Toggle, { label: "Notify when agents finish background work", checked: p.preferences.notifyOnComplete, onChange: (v) => updatePrefs({ notifyOnComplete: v }) }), _jsx(Toggle, { label: "Enable floating chat bubble", checked: p.preferences.floatingChat, onChange: (v) => updatePrefs({ floatingChat: v }) })] })] }, "prefs"),
    ];
    const isLast = step === steps.length - 1;
    const canNext = step === 0 ? p.name.trim().length > 0 : true;
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center p-4", style: { background: 'var(--c-bg-1)' }, children: _jsxs("div", { className: "w-full max-w-lg", children: [_jsx("div", { className: "flex justify-center gap-2 mb-6", children: steps.map((_, i) => (_jsx("div", { className: "h-1.5 rounded-full transition-all", style: {
                            width: i === step ? '24px' : '8px',
                            background: i <= step ? 'var(--c-accent)' : 'var(--c-border-2)',
                        } }, i))) }), _jsxs("div", { className: "rounded-2xl p-6", style: { background: 'var(--c-bg-2)', border: '1px solid var(--c-border-1)' }, children: [steps[step], _jsxs("div", { className: "flex items-center justify-between mt-6 pt-4", style: { borderTop: '1px solid var(--c-border-2)' }, children: [step > 0 ? (_jsx("button", { onClick: () => setStep(step - 1), className: "text-sm px-4 py-2 rounded-lg", style: { color: 'var(--c-text-3)' }, children: "Back" })) : (_jsx("button", { onClick: onSkip, className: "text-sm px-4 py-2 rounded-lg", style: { color: 'var(--c-text-5)' }, children: "Skip for now" })), _jsx("button", { onClick: async () => {
                                        if (isLast) {
                                            setProvisioning(true);
                                            setProvisionError(null);
                                            const completed = { ...p, onboardedAt: Date.now() };
                                            try {
                                                const wsId = await provisionWorkspace(completed);
                                                if (wsId) {
                                                    sessionStorage.setItem('shre-workspace-id', wsId);
                                                }
                                            }
                                            catch {
                                                // non-blocking — workspace can be provisioned later
                                            }
                                            setProvisioning(false);
                                            onComplete(completed);
                                        }
                                        else {
                                            setStep(step + 1);
                                        }
                                    }, disabled: !canNext || provisioning, className: "text-sm px-5 py-2 rounded-lg font-medium transition-colors", style: {
                                        background: canNext && !provisioning ? 'var(--c-accent)' : 'var(--c-border-2)',
                                        color: canNext && !provisioning ? '#fff' : 'var(--c-text-5)',
                                    }, children: provisioning ? (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" }), "Setting up workspace..."] })) : isLast ? ('Get Started') : ('Next') })] })] })] }) }));
}
// ── Sub-components ──────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, multiline, }) {
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
    return (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: label }), multiline ? (_jsx("textarea", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, rows: 2, style: style })) : (_jsx("input", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, style: style }))] }));
}
function Chip({ label, active, onClick }) {
    return (_jsx("button", { onClick: onClick, className: "px-2.5 py-1 rounded-full text-xs transition-all", style: {
            border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border-2)'}`,
            background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: active ? 'var(--c-accent)' : 'var(--c-text-3)',
        }, children: label }));
}
function TagInput({ label, placeholder, value, onChange, items, onAdd, onRemove, }) {
    return (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: label }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, onKeyDown: (e) => {
                            if (e.key === 'Enter' && value.trim()) {
                                onAdd(value.trim());
                                onChange('');
                                e.preventDefault();
                            }
                        }, className: "flex-1", style: {
                            background: 'var(--c-bg-3)',
                            border: '1px solid var(--c-border-2)',
                            color: 'var(--c-text-1)',
                            outline: 'none',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '13px',
                        } }), _jsx("button", { onClick: () => {
                            if (value.trim()) {
                                onAdd(value.trim());
                                onChange('');
                            }
                        }, className: "px-3 rounded-lg text-xs", style: { background: 'var(--c-bg-active)', color: 'var(--c-text-2)' }, children: "Add" })] }), items.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1.5 mt-2", children: items.map((item, i) => (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs", style: { background: 'rgba(99,102,241,0.12)', color: 'var(--c-accent)' }, children: [item, _jsx("button", { onClick: () => onRemove(i), className: "opacity-60 hover:opacity-100", children: "\u00D7" })] }, i))) }))] }));
}
function Toggle({ label, checked, onChange, }) {
    return (_jsxs("label", { className: "flex items-center justify-between cursor-pointer", children: [_jsx("span", { className: "text-sm", style: { color: 'var(--c-text-2)' }, children: label }), _jsx("div", { className: "w-10 h-5 rounded-full relative transition-colors cursor-pointer", style: { background: checked ? 'var(--c-accent)' : 'var(--c-border-2)' }, onClick: () => onChange(!checked), children: _jsx("div", { className: "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", style: { left: checked ? '22px' : '2px' } }) })] }));
}
