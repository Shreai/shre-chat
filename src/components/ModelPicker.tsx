import React, { useEffect, useRef, useState } from 'react';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

/**
 * Two-level model picker: provider groups → individual models.
 *
 * - Auto: routing gates decide the best model per task
 * - Provider lock: constrain to a provider (router picks best model)
 * - Specific model: lock to an exact model ID
 */

interface ProviderGroup {
  key: string;
  label: string;
  icon: string;
  providerKeys: string[]; // match against model id prefix
}

const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    key: 'ollama',
    label: 'Local',
    icon: '\uD83D\uDDA5\uFE0F',
    providerKeys: ['ollama', 'ollama-remote'],
  },
  {
    key: 'anthropic',
    label: 'Claude',
    icon: '\uD83D\uDFE3',
    providerKeys: ['anthropic', 'claude-cli'],
  },
  { key: 'openai', label: 'OpenAI', icon: '\uD83D\uDFE2', providerKeys: ['openai'] },
  { key: 'google', label: 'Google', icon: '\uD83D\uDD35', providerKeys: ['google'] },
  { key: 'floodpipe', label: 'Floodpipe', icon: '\uD83C\uDF0A', providerKeys: ['floodpipe'] },
  { key: 'other', label: 'Other', icon: '\u26AA', providerKeys: [] }, // catch-all
];

function getProviderGroup(modelId: string): string {
  const prefix = modelId.split('/')[0];
  for (const g of PROVIDER_GROUPS) {
    if (g.providerKeys.includes(prefix)) return g.key;
  }
  return 'other';
}

function groupModels(models: ModelInfo[]): Map<string, ModelInfo[]> {
  const groups = new Map<string, ModelInfo[]>();
  for (const g of PROVIDER_GROUPS) groups.set(g.key, []);
  for (const m of models) {
    const key = getProviderGroup(m.id);
    groups.get(key)!.push(m);
  }
  // Remove empty groups (except 'other' which we always skip if empty)
  for (const [key, list] of groups) {
    if (list.length === 0) groups.delete(key);
  }
  return groups;
}

interface ModelPickerProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  selectedModel: string | null;
  onSelectModel: (modelId: string | null) => void;
  models: ModelInfo[];
  agentName: string;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}

/** Get short display name for the selected model */
function getSelectedLabel(selectedModel: string | null, models: ModelInfo[]): string {
  if (!selectedModel) return 'Auto';
  // Provider-level lock
  if (selectedModel.startsWith('provider:')) {
    const pKey = selectedModel.replace('provider:', '');
    const group = PROVIDER_GROUPS.find((g) => g.key === pKey || g.providerKeys.includes(pKey));
    return group?.label || pKey;
  }
  // Specific model
  const m = models.find((x) => x.id === selectedModel);
  return m?.name || selectedModel.split('/').pop() || 'Auto';
}

export function ModelPicker({
  open,
  onToggle,
  onClose,
  selectedModel,
  onSelectModel,
  models,
  agentName,
  pickerRef,
}: ModelPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Reset expanded group when closing
  useEffect(() => {
    if (!open) setExpandedGroup(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, pickerRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedGroup) setExpandedGroup(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, expandedGroup]);

  const grouped = groupModels(models);

  const isAutoSelected = !selectedModel;
  const isProviderSelected = (groupKey: string) => selectedModel === `provider:${groupKey}`;
  const isModelSelected = (modelId: string) => selectedModel === modelId;

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        className="h-7 rounded-lg flex items-center gap-1 px-2 text-[11px] transition-all"
        style={{
          color: selectedModel ? 'var(--c-accent)' : 'var(--c-text-3)',
          background: open ? 'var(--c-bg-active)' : 'transparent',
          border: selectedModel ? '1px solid var(--c-accent-soft)' : '1px solid transparent',
        }}
        title="Switch AI model"
        aria-label="Switch AI model"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="hidden sm:inline max-w-[120px] truncate">
          {getSelectedLabel(selectedModel, models)}
        </span>
        <svg
          className="h-3 w-3 opacity-50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />

          <div
            ref={panelRef}
            className="absolute right-0 z-50 flex flex-col rounded-xl overflow-hidden shadow-2xl model-picker-dropdown"
            style={{
              width: 300,
              top: '100%',
              marginTop: 4,
              maxHeight: 'min(480px, calc(var(--vv-height, 100dvh) - 100px))',
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border-1)',
              animation: 'picker-fade-in 150ms ease-out forwards',
            }}
          >
            {/* Header */}
            <div
              className="px-3 pt-3 pb-2 shrink-0"
              style={{ borderBottom: '1px solid var(--c-border-2)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text-1)' }}>
                  {expandedGroup ? (
                    <button
                      onClick={() => setExpandedGroup(null)}
                      className="flex items-center gap-1"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--c-text-1)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      {PROVIDER_GROUPS.find((g) => g.key === expandedGroup)?.label} Models
                    </button>
                  ) : (
                    'AI Model'
                  )}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                  for {agentName}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1">
              {expandedGroup ? (
                /* ── Individual models for expanded provider ── */
                <>
                  {/* Provider-level lock option — only for known providers, not the catch-all "other" group */}
                  {expandedGroup !== 'other' && (
                    <>
                      <button
                        onClick={() => {
                          onSelectModel(`provider:${expandedGroup}`);
                          onClose();
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                        style={{
                          color: isProviderSelected(expandedGroup)
                            ? 'var(--c-accent)'
                            : 'var(--c-text-2)',
                          background: isProviderSelected(expandedGroup)
                            ? 'var(--c-accent-soft)'
                            : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isProviderSelected(expandedGroup))
                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isProviderSelected(expandedGroup))
                            e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span className="text-[13px] w-5 text-center opacity-60">*</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium">Auto (best from provider)</div>
                          <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                            Router picks optimal model
                          </div>
                        </div>
                        {isProviderSelected(expandedGroup) && <CheckIcon />}
                      </button>

                      <div
                        className="mx-3 my-1"
                        style={{ borderTop: '1px solid var(--c-border-2)' }}
                      />
                    </>
                  )}

                  {/* Individual models */}
                  {(grouped.get(expandedGroup) || []).map((m) => {
                    const active = isModelSelected(m.id);
                    const offline = m.connected === false;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (offline) return;
                          onSelectModel(m.id);
                          onClose();
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                        style={{
                          color: active
                            ? 'var(--c-accent)'
                            : offline
                              ? 'var(--c-text-4)'
                              : 'var(--c-text-2)',
                          background: active ? 'var(--c-accent-soft)' : 'transparent',
                          opacity: offline ? 0.4 : 1,
                          cursor: offline ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (!active && !offline)
                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!active) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span className="text-[13px] w-5 text-center">{m.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate">{m.name}</div>
                          <div
                            className="text-[10px] truncate"
                            style={{ color: 'var(--c-text-4)' }}
                          >
                            {m.id}
                          </div>
                        </div>
                        {offline && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }}
                          >
                            offline
                          </span>
                        )}
                        {active && <CheckIcon />}
                      </button>
                    );
                  })}
                </>
              ) : (
                /* ── Top-level: Auto + provider groups ── */
                <>
                  {/* Auto option */}
                  <button
                    onClick={() => {
                      onSelectModel(null);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                    style={{
                      color: isAutoSelected ? 'var(--c-accent)' : 'var(--c-text-2)',
                      background: isAutoSelected ? 'var(--c-accent-soft)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isAutoSelected) e.currentTarget.style.background = 'var(--c-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isAutoSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span className="text-lg w-7 text-center">{'\u26A1'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">Auto</div>
                      <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                        Best model per task
                        {' \u00B7 '}
                        {models.filter((m) => m.connected !== false).length} models online
                      </div>
                    </div>
                    {isAutoSelected && <CheckIcon />}
                  </button>

                  <div className="mx-3 my-1" style={{ borderTop: '1px solid var(--c-border-2)' }} />

                  {/* Provider groups */}
                  {PROVIDER_GROUPS.map((group) => {
                    const groupModels = grouped.get(group.key);
                    if (!groupModels || groupModels.length === 0) return null;

                    const onlineCount = groupModels.filter((m) => m.connected !== false).length;
                    const allOffline = onlineCount === 0;
                    const providerActive = isProviderSelected(group.key);
                    // Check if a specific model from this group is selected
                    const hasModelSelected = groupModels.some((m) => isModelSelected(m.id));
                    const highlighted = providerActive || hasModelSelected;

                    return (
                      <button
                        key={group.key}
                        onClick={() => {
                          if (allOffline) return;
                          setExpandedGroup(group.key);
                        }}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                        style={{
                          color: highlighted
                            ? 'var(--c-accent)'
                            : allOffline
                              ? 'var(--c-text-4)'
                              : 'var(--c-text-2)',
                          background: highlighted ? 'var(--c-accent-soft)' : 'transparent',
                          opacity: allOffline ? 0.4 : 1,
                          cursor: allOffline ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (!highlighted && !allOffline)
                            e.currentTarget.style.background = 'var(--c-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!highlighted) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span className="text-lg w-7 text-center">{group.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium">{group.label}</div>
                          <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                            {onlineCount} model{onlineCount !== 1 ? 's' : ''} online
                            {hasModelSelected && (
                              <span style={{ color: 'var(--c-accent)' }}>
                                {' \u00B7 '}
                                {models.find((m) => isModelSelected(m.id))?.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {allOffline ? (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-4)' }}
                          >
                            offline
                          </span>
                        ) : (
                          <svg
                            className="h-3.5 w-3.5 shrink-0 opacity-40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="9 6 15 12 9 18" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-3 py-2 shrink-0"
              style={{ borderTop: '1px solid var(--c-border-2)' }}
            >
              <div className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                {expandedGroup
                  ? 'Pick a specific model or let the router choose the best one from this provider.'
                  : 'Auto picks the best model per task. Expand a provider to pick a specific model.'}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes picker-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          .model-picker-dropdown {
            position: fixed !important;
            left: 8px !important;
            right: 8px !important;
            top: 48px !important;
            bottom: auto !important;
            width: auto !important;
            max-height: calc(var(--vv-height, 100dvh) - 120px) !important;
          }
        }
      `}</style>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      style={{ color: 'var(--c-accent)' }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
