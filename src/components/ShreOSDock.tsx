import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useApp,
  type DeploymentRequest,
  loadDeploymentRequests,
  upsertDeploymentRequest,
  uid,
} from '../store';
import {
  DEFAULT_PROJECT_FLEET,
  buildFleetMarkdown,
  buildFleetSlackDraft,
} from '../workspace-fleet';
import { getProductShellForHost, scopedStorageKey } from '../workspace-context';

type RequestForm = Omit<DeploymentRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

const DRAFT_KEY = 'shre-os-dock-draft';

function makeDefaultForm(workspaceName?: string, userName?: string): RequestForm {
  const shell = getProductShellForHost(
    typeof window !== 'undefined' ? window.location.hostname : null,
  );
  return {
    projectName: shell === 'aros' ? 'AROS' : workspaceName || 'New project',
    owner: workspaceName || userName || 'Nirlab',
    productShell: shell,
    requestType: shell === 'aros' ? 'client' : 'internal',
    targetNodes: 'Mac 2, Mac 3',
    environment: 'workspace-first / multi-tenant',
    hosting:
      shell === 'aros' ? 'Customer stack or mapped adapter' : 'Supabase + Hostinger + Cloudflare',
    database: 'Supabase Postgres',
    frontend: shell === 'aros' ? 'Shared shell with AROS theme pack' : 'Shared Shre OS shell',
    backend: 'Node.js / Express API',
    themePack: shell === 'aros' ? 'aros' : 'shre-os',
    agents: 'tech stack expert, QA, security, marketing, support, audit',
    notes: '',
  };
}

function buildMarkdown(form: RequestForm) {
  return [
    '# Deployment Request',
    `Project: ${form.projectName}`,
    `Owner: ${form.owner}`,
    `Product shell: ${form.productShell}`,
    `Request type: ${form.requestType}`,
    `Target mesh nodes: ${form.targetNodes}`,
    `Environment: ${form.environment}`,
    `Hosting: ${form.hosting}`,
    `Database: ${form.database}`,
    `Frontend: ${form.frontend}`,
    `Backend: ${form.backend}`,
    `Theme pack: ${form.themePack}`,
    `Agent fleet: ${form.agents}`,
    form.notes ? `Notes: ${form.notes}` : 'Notes: -',
  ].join('\n');
}

function buildSlackDraft(form: RequestForm) {
  return `New Shre OS deployment request for ${form.projectName} (${form.productShell}) on ${form.targetNodes}. Environment: ${form.environment}. Hosting: ${form.hosting}. Agents: ${form.agents}.`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface ShreOSDockProps {
  workspaceName?: string;
  userName?: string;
}

export function ShreOSDock({ workspaceName, userName }: ShreOSDockProps) {
  const { state, actions } = useApp();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  );
  const [draft, setDraft] = useState<RequestForm>(() => {
    try {
      const raw = localStorage.getItem(
        scopedStorageKey(DRAFT_KEY, { workspaceId: 'profile', userId: userName }),
      );
      return raw
        ? { ...makeDefaultForm(workspaceName, userName), ...JSON.parse(raw) }
        : makeDefaultForm(workspaceName, userName);
    } catch {
      return makeDefaultForm(workspaceName, userName);
    }
  });
  const [recent, setRecent] = useState<DeploymentRequest[]>(() => loadDeploymentRequests());
  const [feedback, setFeedback] = useState('Ready');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        scopedStorageKey(DRAFT_KEY, { workspaceId: 'profile', userId: userName }),
        JSON.stringify(draft),
      );
    } catch {
      /* quota */
    }
  }, [draft, userName]);

  const markdown = useMemo(() => buildMarkdown(draft), [draft]);
  const slackDraft = useMemo(() => buildSlackDraft(draft), [draft]);
  const fleetMarkdown = useMemo(
    () => buildFleetMarkdown(draft.projectName, draft.owner, draft.productShell),
    [draft.owner, draft.productShell, draft.projectName],
  );
  const fleetSlackDraft = useMemo(
    () => buildFleetSlackDraft(draft.projectName, draft.owner, draft.productShell),
    [draft.owner, draft.productShell, draft.projectName],
  );

  const applyPack = (themePack: RequestForm['themePack']) => {
    const colorMap: Record<RequestForm['themePack'], string | undefined> = {
      'shre-os': '#2563eb',
      aros: '#0f766e',
      workspace: '#7c3aed',
      custom: undefined,
    };
    actions.setThemeCustom({
      ...state.themeCustom,
      themePack,
      accentColor: colorMap[themePack] ?? state.themeCustom.accentColor,
    });
    setDraft((prev) => ({ ...prev, themePack }));
    setFeedback(`${themePack.toUpperCase()} pack applied`);
  };

  const commitRequest = async (status: DeploymentRequest['status']) => {
    const request: DeploymentRequest = {
      id: uid(),
      ...draft,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = upsertDeploymentRequest(request);
    setRecent(next);
    setFeedback(`${draft.projectName} saved as ${status}`);

    const sessionId = actions.newSession();
    actions.updateSessionTitle(sessionId, `Deploy: ${draft.projectName}`);
    actions.addSessionTag(sessionId, 'shre-os');
    actions.addSessionTag(sessionId, draft.productShell);
    actions.addMessage(sessionId, {
      role: 'user',
      content: markdown,
      timestamp: Date.now(),
      meta: {
        type: 'deployment-request',
        shell: draft.productShell,
        requestType: draft.requestType,
      },
    });
    actions.switchSession(sessionId);
    actions.setView('chat');
    if (status === 'queued') {
      await sendSlack();
    }
    setOpen(false);
  };

  const copyRequest = async () => {
    const ok = await copyText(markdown);
    setFeedback(ok ? 'Request copied' : 'Clipboard blocked');
  };

  const openFleetBrief = () => {
    const sessionId = actions.newSession();
    actions.updateSessionTitle(sessionId, `Fleet: ${draft.projectName}`);
    actions.addSessionTag(sessionId, 'shre-os');
    actions.addSessionTag(sessionId, 'fleet');
    actions.addSessionTag(sessionId, draft.productShell);
    actions.addMessage(sessionId, {
      role: 'user',
      content: fleetMarkdown,
      timestamp: Date.now(),
      meta: {
        type: 'fleet.template',
        shell: draft.productShell,
      },
    });
    actions.switchSession(sessionId);
    actions.setView('chat');
    setFeedback(`Fleet brief opened for ${draft.projectName}`);
    setOpen(false);
  };

  const sendSlack = async () => {
    try {
      const res = await fetch('/api/notification-delivery/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'deployment.requested',
          title: `${draft.projectName} deployment request`,
          body: slackDraft,
          routingKey: 'shre-os',
          channels: ['slack'],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFeedback(`Slack update sent for ${draft.projectName}`);
      return true;
    } catch {
      setFeedback('Slack send failed');
      return false;
    }
  };

  const copySlack = async () => {
    const ok = await copyText(slackDraft);
    setFeedback(ok ? 'Slack draft copied' : 'Clipboard blocked');
  };

  const copyFleet = async () => {
    const ok = await copyText(fleetMarkdown);
    setFeedback(ok ? 'Fleet template copied' : 'Clipboard blocked');
  };

  const sendFleetSlack = async () => {
    try {
      const res = await fetch('/api/notification-delivery/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fleet.template',
          title: `${draft.projectName} fleet template`,
          body: fleetSlackDraft,
          routingKey: 'shre-os',
          channels: ['slack'],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFeedback(`Fleet Slack update sent for ${draft.projectName}`);
      return true;
    } catch {
      setFeedback('Fleet Slack send failed');
      return false;
    }
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors sm:justify-start sm:px-2 sm:py-1.5"
        style={{
          color: 'var(--c-text-2)',
          borderColor: 'var(--c-border-2)',
          background: open ? 'var(--c-accent-soft)' : 'var(--c-bg-card)',
        }}
        title="Open Shre OS automation"
      >
        <span
          className="inline-flex items-center justify-center h-4 w-4 rounded"
          style={{ background: 'var(--c-accent)', color: 'var(--c-bg-1)', fontSize: 10 }}
        >
          S
        </span>
        Shre OS
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--c-text-4)' }}
        >
          {isMobile ? 'Menu' : 'Command'}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[260] shadow-2xl"
            style={{
              right: isMobile ? 0 : 12,
              top: isMobile ? 0 : 64,
              left: isMobile ? 0 : 'auto',
              bottom: isMobile ? 0 : 'auto',
              width: isMobile ? '100vw' : 'min(92vw,980px)',
              height: isMobile ? '100dvh' : 'auto',
              borderRadius: isMobile ? 0 : 16,
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-1)',
              maxHeight: 'calc(100vh - 80px)',
              overflow: 'hidden',
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 border-b"
              style={{ borderColor: 'var(--c-border-2)' }}
            >
              <div>
                <div className="text-[12px] font-semibold" style={{ color: 'var(--c-text-1)' }}>
                  Shre OS automation
                </div>
                <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                  Turn one request into a versioned session, a Slack draft, and a theme pack.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                  {feedback}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[var(--c-border-2)] px-3 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--c-bg-hover)]"
                  style={{ color: 'var(--c-text-2)' }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-0 max-h-[calc(100vh-144px)]">
              <div
                className="p-4 overflow-y-auto"
                style={{ borderRight: isMobile ? 'none' : '1px solid var(--c-border-2)' }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    label="Project"
                    value={draft.projectName}
                    onChange={(value) => setDraft((prev) => ({ ...prev, projectName: value }))}
                  />
                  <Field
                    label="Owner"
                    value={draft.owner}
                    onChange={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
                  />
                  <SelectField
                    label="Product shell"
                    value={draft.productShell}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        productShell: value as RequestForm['productShell'],
                      }))
                    }
                    options={[
                      ['shre-os', 'Shre OS'],
                      ['aros', 'AROS'],
                      ['workspace', 'Workspace'],
                    ]}
                  />
                  <SelectField
                    label="Request type"
                    value={draft.requestType}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        requestType: value as RequestForm['requestType'],
                      }))
                    }
                    options={[
                      ['internal', 'Internal'],
                      ['client', 'Client'],
                      ['platform', 'Platform'],
                    ]}
                  />
                  <Field
                    label="Target mesh nodes"
                    value={draft.targetNodes}
                    onChange={(value) => setDraft((prev) => ({ ...prev, targetNodes: value }))}
                  />
                  <Field
                    label="Environment"
                    value={draft.environment}
                    onChange={(value) => setDraft((prev) => ({ ...prev, environment: value }))}
                  />
                  <Field
                    label="Hosting"
                    value={draft.hosting}
                    onChange={(value) => setDraft((prev) => ({ ...prev, hosting: value }))}
                  />
                  <Field
                    label="Database"
                    value={draft.database}
                    onChange={(value) => setDraft((prev) => ({ ...prev, database: value }))}
                  />
                  <Field
                    label="Frontend"
                    value={draft.frontend}
                    onChange={(value) => setDraft((prev) => ({ ...prev, frontend: value }))}
                  />
                  <Field
                    label="Backend"
                    value={draft.backend}
                    onChange={(value) => setDraft((prev) => ({ ...prev, backend: value }))}
                  />
                  <Field
                    label="Agents"
                    value={draft.agents}
                    onChange={(value) => setDraft((prev) => ({ ...prev, agents: value }))}
                  />
                  <SelectField
                    label="Theme pack"
                    value={draft.themePack}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        themePack: value as RequestForm['themePack'],
                      }))
                    }
                    options={[
                      ['shre-os', 'Shre OS'],
                      ['aros', 'AROS'],
                      ['workspace', 'Workspace'],
                      ['custom', 'Custom'],
                    ]}
                  />
                </div>

                <div className="mt-3">
                  <label
                    className="block text-[10px] font-medium mb-1.5"
                    style={{ color: 'var(--c-text-3)' }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-1)',
                      border: '1px solid var(--c-border-2)',
                    }}
                    placeholder="Any special instructions, compliance notes, or handoff context."
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  <button
                    onClick={() => commitRequest('queued')}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{ background: 'var(--c-accent)', color: '#fff' }}
                  >
                    Save and open session
                  </button>
                  <button
                    onClick={() => commitRequest('draft')}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Save draft
                  </button>
                  <button
                    onClick={copyRequest}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Copy request
                  </button>
                  <button
                    onClick={copySlack}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Copy Slack draft
                  </button>
                  <button
                    onClick={sendSlack}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Send Slack update
                  </button>
                </div>

                <div className="mt-4">
                  <div
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: 'var(--c-text-1)' }}
                  >
                    Default fleet
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {DEFAULT_PROJECT_FLEET.map((role) => (
                      <div
                        key={role.id}
                        className="rounded-lg border px-3 py-2"
                        style={{
                          background: 'var(--c-bg-card)',
                          borderColor: 'var(--c-border-2)',
                        }}
                      >
                        <div
                          className="text-[12px] font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {role.title}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                          {role.responsibility}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 overflow-y-auto">
                <div className="mb-3">
                  <div
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: 'var(--c-text-1)' }}
                  >
                    Theme packs
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['shre-os', 'aros', 'workspace', 'custom'] as const).map((pack) => (
                      <button
                        key={pack}
                        onClick={() => applyPack(pack)}
                        className="rounded-lg px-3 py-2 text-left border"
                        style={{
                          borderColor:
                            draft.themePack === pack ? 'var(--c-accent)' : 'var(--c-border-2)',
                          background:
                            draft.themePack === pack ? 'var(--c-accent-soft)' : 'var(--c-bg-card)',
                        }}
                      >
                        <div
                          className="text-[12px] font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {pack === 'shre-os'
                            ? 'Shre OS'
                            : pack === 'aros'
                              ? 'AROS'
                              : pack === 'workspace'
                                ? 'Workspace'
                                : 'Custom'}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                          {pack === 'shre-os'
                            ? 'Command center'
                            : pack === 'aros'
                              ? 'Product shell'
                              : pack === 'workspace'
                                ? 'Shared delivery'
                                : 'Manual override'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <div
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: 'var(--c-text-1)' }}
                  >
                    Request preview
                  </div>
                  <pre
                    className="whitespace-pre-wrap rounded-lg p-3 text-[11px] leading-5"
                    style={{
                      background: 'var(--c-bg-card)',
                      border: '1px solid var(--c-border-2)',
                      color: 'var(--c-text-2)',
                    }}
                  >
                    {markdown}
                  </pre>
                </div>

                <div>
                  <div
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: 'var(--c-text-1)' }}
                  >
                    Recent requests
                  </div>
                  <div className="space-y-2">
                    {recent.slice(0, 4).map((request) => (
                      <button
                        key={request.id}
                        onClick={() => {
                          setDraft({
                            projectName: request.projectName,
                            owner: request.owner,
                            productShell: request.productShell,
                            requestType: request.requestType,
                            targetNodes: request.targetNodes,
                            environment: request.environment,
                            hosting: request.hosting,
                            database: request.database,
                            frontend: request.frontend,
                            backend: request.backend,
                            themePack: request.themePack,
                            agents: request.agents,
                            notes: request.notes,
                          });
                          setFeedback(`Loaded ${request.projectName}`);
                        }}
                        className="w-full text-left rounded-lg px-3 py-2 border transition-colors"
                        style={{
                          background: 'var(--c-bg-card)',
                          borderColor: 'var(--c-border-2)',
                          color: 'var(--c-text-2)',
                        }}
                      >
                        <div
                          className="text-[12px] font-medium"
                          style={{ color: 'var(--c-text-1)' }}
                        >
                          {request.projectName}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                          {request.productShell} • {request.requestType} • {request.status}
                        </div>
                      </button>
                    ))}
                    {recent.length === 0 && (
                      <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                        No saved requests yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  <button
                    onClick={openFleetBrief}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{ background: 'var(--c-accent)', color: '#fff' }}
                  >
                    Open fleet brief
                  </button>
                  <button
                    onClick={copyFleet}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Copy fleet template
                  </button>
                  <button
                    onClick={sendFleetSlack}
                    className="rounded-lg px-3 py-2 text-[12px] font-medium"
                    style={{
                      background: 'var(--c-bg-card)',
                      color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border-2)',
                    }}
                  >
                    Send fleet Slack
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
        style={{
          background: 'var(--c-bg-card)',
          color: 'var(--c-text-1)',
          border: '1px solid var(--c-border-2)',
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--c-text-3)' }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
        style={{
          background: 'var(--c-bg-card)',
          color: 'var(--c-text-1)',
          border: '1px solid var(--c-border-2)',
        }}
      >
        {options.map(([optValue, optLabel]) => (
          <option key={optValue} value={optValue}>
            {optLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
