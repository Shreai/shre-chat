import React, { useRef } from 'react';
import type { GatewayMode } from '../preferences-store';
import { ModelPicker } from './ModelPicker';

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
      className="flex items-center justify-between shrink-0 px-3 py-1.5 gap-2"
      style={{ background: 'var(--c-bg-2)' }}
    >
      <nav className="flex items-center gap-1 min-w-0" role="tablist" aria-label="View switcher">
        <button
          onClick={() => setActiveView('chat')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors"
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors"
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
      <div className="ml-auto flex items-center gap-1 shrink-0">
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
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors hover:brightness-125"
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
