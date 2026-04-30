import React, { useRef } from 'react';
import type { GatewayMode } from '../preferences-store';
import { ModelPicker } from './ModelPicker';
import type { ConversationModeId } from '../preferences-store';
import type { ConversationRoster } from '../workspace-roster';

interface ViewTabsProps {
  activeView: string;
  setActiveView: (view: string) => void;
  setTermViewMode?: (mode: 'split' | 'tabs') => void;
  previewContent?: { content: string; type: string; title?: string } | null;
  showTerminal?: boolean;
  termViewMode?: string;
  isMobile?: boolean;
  isTabMode?: boolean;
  currentAgent?: { id: string; name: string; emoji: string };
  agents?: { id: string; name: string; emoji: string; group?: string }[];
  onSwitchAgent?: (id: string) => void;
  routerMode?: boolean;
  onToggleRouterMode?: () => void;
  gatewayMode?: GatewayMode;
  onSetGatewayMode?: (mode: GatewayMode) => void;
  compareMode?: boolean;
  onToggleCompare?: (len: number) => void;
  selectedModel?: string | null;
  showModelPicker?: boolean;
  setShowModelPicker?: (v: boolean) => void;
  onSelectModel?: (modelId: string | null) => void;
  onShowModelPicker?: () => void;
  models?: {
    id: string;
    name: string;
    provider: string;
    icon: string;
    connected?: boolean;
  }[];
  agentName?: string;
  onShowSystemPrompt?: () => void;
  onSummarize?: () => void;
  onShare?: () => void;
  onToggleNotifSound?: () => void;
  notifSound?: boolean;
  onDownloadMd?: () => void;
  onDownloadJson?: () => void;
  onCopyMarkdown?: () => void;
  onNewChat?: () => void;
  conversationMode?: ConversationModeId;
  activeAppId?: string | null;
  activeAppLabel?: string | null;
  onSetConversationMode?: (mode: ConversationModeId, appId?: string | null) => void;
  onOpenEscalation?: () => void;
  conversationRoster?: ConversationRoster | null;
}

export function ViewTabs({
  activeView,
  setActiveView,
  setTermViewMode,
  previewContent,
  selectedModel,
  showModelPicker,
  setShowModelPicker,
  onSelectModel,
  models,
  agentName,
  conversationMode,
  activeAppId,
  activeAppLabel,
  onSetConversationMode,
  onOpenEscalation,
  conversationRoster,
}: ViewTabsProps) {
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerVisible =
    !!setShowModelPicker &&
    !!onSelectModel &&
    !!models &&
    typeof showModelPicker !== 'undefined' &&
    typeof selectedModel !== 'undefined' &&
    !!agentName;

  return (
    <div
      className="flex items-center justify-between shrink-0 gap-3 border-b border-[var(--c-border-2)] px-4 py-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-[var(--c-border-1)] bg-[rgba(255,255,255,0.05)] text-[11px] font-semibold tracking-[0.18em] text-[var(--c-text-1)]">
              AI
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold tracking-[-0.03em] text-[var(--c-text-1)]">
                {conversationRoster?.title || agentName || 'Shre AI'}
              </div>
              <div className="truncate text-[11px] text-[var(--c-text-3)]">
                {conversationRoster?.subtitle ||
                  (conversationMode === 'code'
                    ? 'Code mode · autonomous builds and task execution'
                    : conversationMode === 'apps'
                      ? `Apps mode${activeAppLabel ? ` · ${activeAppLabel}` : ''}`
                      : 'General mode · conversation-first operator loop')}
              </div>
            </div>
          </div>
          {conversationRoster && conversationRoster.members.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {conversationRoster.members.slice(0, 6).map((member) => (
                <div
                  key={member.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border-2)] bg-[rgba(255,255,255,0.04)] px-2 py-1"
                >
                  <span className="text-[11px]">{member.emoji}</span>
                  <span className="max-w-[100px] truncate text-[10px] font-medium text-[var(--c-text-2)]">
                    {member.name}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        member.presence === 'active'
                          ? '#4ade80'
                          : member.presence === 'away'
                            ? '#f59e0b'
                            : 'var(--c-text-5)',
                    }}
                  />
                </div>
              ))}
              {conversationRoster.members.length > 6 && (
                <span className="text-[10px] text-[var(--c-text-4)]">
                  +{conversationRoster.members.length - 6} more
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 rounded-full border border-[var(--c-border-1)] bg-[rgba(255,255,255,0.04)] p-1">
            <button
              type="button"
              onClick={() => onSetConversationMode?.('assistant', null)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                conversationMode === 'assistant'
                  ? 'bg-white text-black'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => onSetConversationMode?.('code', null)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                conversationMode === 'code'
                  ? 'bg-[var(--c-accent)] text-white'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => onSetConversationMode?.('apps', activeAppId)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                conversationMode === 'apps'
                  ? 'bg-[rgba(74,222,128,0.16)] text-[var(--c-success)]'
                  : 'text-[var(--c-text-3)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text-1)]'
              }`}
            >
              Apps
            </button>
          </div>
        </div>

        <nav
          className="flex items-center gap-1.5 min-w-0"
          role="tablist"
          aria-label="View switcher"
        >
          <button
            onClick={() => setActiveView('chat')}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors"
            style={{
              color: activeView === 'chat' ? 'var(--c-text-1)' : 'var(--c-text-4)',
              background: activeView === 'chat' ? 'var(--c-bg-hover)' : 'transparent',
            }}
            aria-label="Chat view"
            aria-selected={activeView === 'chat'}
            role="tab"
          >
            <svg
              className="h-3 w-3"
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </button>
          <button
            onClick={() => setActiveView('terminal')}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors"
            style={{
              color: activeView === 'terminal' ? 'var(--c-text-1)' : 'var(--c-text-4)',
              background: activeView === 'terminal' ? 'var(--c-bg-hover)' : 'transparent',
            }}
            aria-label="Terminal view"
            aria-selected={activeView === 'terminal'}
            role="tab"
          >
            <svg
              className="h-3 w-3"
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Terminal
          </button>
          {previewContent && (
            <button
              onClick={() => setActiveView('preview')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors"
              style={{
                color: activeView === 'preview' ? 'var(--c-text-1)' : 'var(--c-text-4)',
                background: activeView === 'preview' ? 'var(--c-bg-hover)' : 'transparent',
              }}
              aria-label="Preview view"
              aria-selected={activeView === 'preview'}
              role="tab"
            >
              <svg
                className="h-3 w-3"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Preview
            </button>
          )}
        </nav>
      </div>

      <div className="ml-auto flex items-center gap-1 shrink-0">
        {onOpenEscalation && (
          <button
            type="button"
            onClick={onOpenEscalation}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[rgba(251,191,36,0.12)]"
            style={{ color: '#fbbf24' }}
            title="Open escalation drawer"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v6" />
              <path d="M12 16v6" />
              <path d="m4.93 4.93 4.24 4.24" />
              <path d="m14.83 14.83 4.24 4.24" />
              <path d="M2 12h6" />
              <path d="M16 12h6" />
              <path d="m4.93 19.07 4.24-4.24" />
              <path d="m14.83 9.17 4.24-4.24" />
            </svg>
            Escalate
          </button>
        )}
        {modelPickerVisible && (
          <ModelPicker
            open={!!showModelPicker}
            onToggle={() => setShowModelPicker?.(!showModelPicker)}
            onClose={() => setShowModelPicker?.(false)}
            selectedModel={selectedModel ?? null}
            onSelectModel={onSelectModel!}
            models={models!}
            agentName={agentName!}
            pickerRef={modelPickerRef}
          />
        )}
        {/* View mode toggle -- switch back to split */}
        <button
          onClick={() => {
            setTermViewMode?.('split');
            if (activeView === 'preview') setActiveView('chat');
          }}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] transition-colors hover:bg-[var(--c-bg-hover)]"
          style={{ color: 'var(--c-text-4)' }}
          title="Switch to split view"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
