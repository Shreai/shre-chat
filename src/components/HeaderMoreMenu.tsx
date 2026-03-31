import React, { useState } from 'react';
import type { ChatMessage } from '../openclaw';
import type { Session } from '../store';
import { exportSessions, importSessions } from '../store';
import { ECOSYSTEM_APPS } from '../chat-utils';
import {
  usePreferences,
  FEATURE_LABELS,
  type GatewayMode,
  type FeatureKey,
} from '../preferences-store';
import { OAuthSetup } from './OAuthSetup';

export interface HeaderMoreMenuProps {
  open: boolean;
  onClose: () => void;
  // Gateway mode
  openclawMode: boolean;
  onToggleOpenclawMode: () => void;
  gatewayMode: GatewayMode;
  onSetGatewayMode: (mode: GatewayMode) => void;
  // Compare
  compareMode: boolean;
  onToggleCompare: () => void;
  comparePickerRef: React.RefObject<HTMLDivElement | null>;
  // System prompt
  activeSession: Session | undefined;
  onOpenSystemPrompt: () => void;
  // Compact
  compact: boolean;
  onToggleCompact: () => void;
  // Sounds
  notifSound: boolean;
  onToggleNotifSound: () => void;
  // Messages
  messages: ChatMessage[];
  userName: string;
  currentAgentName: string;
  // Summarize
  summarizing: boolean;
  onSummarize: () => void;
  // Analytics
  onOpenAnalytics: () => void;
  // Share
  activeSessionId: string | null;
  onShare: () => void;
  // Copy / Download
  onCopyMarkdown: () => void;
  onDownloadMd: () => void;
  onDownloadJson: () => void;
  // Apps
  onToggleApps: () => void;
  // Views
  view: string;
  onSetView: (v: string) => void;
  // Export/Import
  sessions: Session[];
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onImportSessions: () => void;
}

export function HeaderMoreMenu({
  open,
  onClose,
  openclawMode,
  onToggleOpenclawMode,
  gatewayMode,
  onSetGatewayMode,
  compareMode,
  onToggleCompare,
  comparePickerRef,
  activeSession,
  onOpenSystemPrompt,
  compact,
  onToggleCompact,
  notifSound,
  onToggleNotifSound,
  messages,
  userName,
  currentAgentName,
  summarizing,
  onSummarize,
  onOpenAnalytics,
  activeSessionId,
  onShare,
  onCopyMarkdown,
  onDownloadMd,
  onDownloadJson,
  onToggleApps,
  view,
  onSetView,
  sessions,
  importInputRef,
  onImportSessions,
}: HeaderMoreMenuProps) {
  const features = usePreferences((s) => s.features);
  const setFeature = usePreferences((s) => s.setFeature);
  const [showFeatureSettings, setShowFeatureSettings] = useState(false);
  const [showOAuthSetup, setShowOAuthSetup] = useState(false);
  const feat = (key: FeatureKey) => features[key] ?? false;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1 z-[60] w-56 rounded-xl shadow-xl py-1"
        style={{
          background: 'var(--c-bg-2)',
          border: '1px solid var(--c-border-2)',
          maxHeight: 'min(580px, calc(100dvh - 80px))',
          overflowY: 'auto',
        }}
      >
        <SectionLabel>Gateway</SectionLabel>
        <GatewayOption
          label="Shre Router"
          description="Trust gate, RAG, scoring"
          color="#3b82f6"
          active={gatewayMode === 'router'}
          onClick={() => { onSetGatewayMode('router'); onClose(); }}
        />
        <GatewayOption
          label="OpenClaw"
          description="Agent workspace, tools"
          color="#a855f7"
          active={gatewayMode === 'openclaw'}
          onClick={() => { onSetGatewayMode('openclaw'); onClose(); }}
        />
        <GatewayOption
          label="Direct (Ollama)"
          description="Local models, no gateway"
          color="#22c55e"
          active={gatewayMode === 'direct'}
          onClick={() => { onSetGatewayMode('direct'); onClose(); }}
        />

        <Divider />

        {feat('compareModels') && (
          <div className="relative" ref={comparePickerRef}>
            <button
              onClick={() => {
                onToggleCompare();
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
              style={{ color: compareMode ? 'var(--c-warning)' : 'var(--c-text-1)' }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
              {compareMode ? 'Exit Compare' : 'Compare Models'}
            </button>
          </div>
        )}

        {feat('systemPrompt') && (
        <button
          onClick={() => {
            onOpenSystemPrompt();
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: activeSession?.systemPrompt ? 'var(--c-accent)' : 'var(--c-text-1)' }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          System Prompt
        </button>
        )}

        <button
          onClick={() => {
            onToggleCompact();
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: compact ? 'var(--c-accent)' : 'var(--c-text-1)' }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {compact ? (
              <>
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </>
            ) : (
              <>
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </>
            )}
          </svg>
          {compact ? 'Comfortable View' : 'Compact View'}
        </button>

        <button
          onClick={() => {
            onToggleNotifSound();
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-1)' }}
          title={
            notifSound
              ? 'Mute notification sounds when new messages arrive'
              : 'Play a chime when new messages arrive while tab is in background'
          }
        >
          {notifSound ? (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
          {notifSound ? 'Mute Sounds' : 'Enable Sounds'}
        </button>

        {messages.length > 0 && (
          <>
            <Divider />

            {messages.length >= 4 && (
              <button
                onClick={() => {
                  onClose();
                  onSummarize();
                }}
                className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                style={{ color: 'var(--c-text-1)' }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Summarize
              </button>
            )}

            {feat('analytics') && (
            <button
              onClick={() => {
                onOpenAnalytics();
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-1)' }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Analytics
            </button>
            )}

            {activeSessionId && (
              <button
                onClick={() => {
                  onClose();
                  onShare();
                }}
                className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
                style={{ color: 'var(--c-text-1)' }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share
              </button>
            )}

            <Divider />

            <button
              onClick={() => {
                onCopyMarkdown();
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-2)' }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
              Copy as Markdown
            </button>

            <button
              onClick={() => {
                onDownloadMd();
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-2)' }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download .md
            </button>

            <button
              onClick={() => {
                onDownloadJson();
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-2)' }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Download .json
            </button>
          </>
        )}

        <Divider />

        <button
          onClick={() => {
            onToggleApps();
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-1)' }}
          aria-label="Open Ecosystem Apps"
          title="Open Ecosystem Apps"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="4" height="4" rx="1" />
            <rect x="6" y="1" width="4" height="4" rx="1" />
            <rect x="11" y="1" width="4" height="4" rx="1" />
            <rect x="1" y="6" width="4" height="4" rx="1" />
            <rect x="6" y="6" width="4" height="4" rx="1" />
            <rect x="11" y="6" width="4" height="4" rx="1" />
          </svg>
          Ecosystem Apps
        </button>

        {(feat('feedView') || feat('costDashboard') || feat('reports')) && <Divider />}

        {(feat('feedView') || feat('costDashboard') || feat('reports')) && <SectionLabel>Views</SectionLabel>}
        {feat('feedView') && <HeaderMenuItem
          label="Feed"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
          }
          active={view === 'feed'}
          onClick={() => onSetView('feed')}
        />}
        {feat('feedView') && <HeaderMenuItem
          label="Feed Analytics"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          active={view === 'feed-analytics'}
          onClick={() => onSetView('feed-analytics')}
        />}
        {feat('costDashboard') && <HeaderMenuItem
          label="Cost Dashboard"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          }
          active={view === 'cost-dashboard'}
          onClick={() => onSetView('cost-dashboard')}
        />}
        {feat('reports') && <HeaderMenuItem
          label="Reports"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          }
          active={view === 'reports'}
          onClick={() => onSetView('reports')}
        />}

        {feat('externalApps') && <Divider />}

        {feat('externalApps') && <><SectionLabel>Apps</SectionLabel>
        <HeaderMenuItem
          label="OpenClaw"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          }
          active={view === 'openclaw'}
          onClick={() => onSetView('openclaw')}
        />
        <HeaderMenuItem
          label="Shre Dashboard"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          }
          active={view === 'shre-dashboard'}
          onClick={() => onSetView('shre-dashboard')}
        />
        <HeaderMenuItem
          label="CortexDB"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          }
          active={view === 'cortexdb'}
          onClick={() => onSetView('cortexdb')}
        />
        <HeaderMenuItem
          label="StorePulse"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          active={view === 'storepulse'}
          onClick={() => onSetView('storepulse')}
        />
        <HeaderMenuItem
          label="Agent Marketplace"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" />
              <line x1="3" y1="7" x2="21" y2="7" />
              <path d="M16 11a4 4 0 0 1-8 0" />
            </svg>
          }
          active={view === 'app-marketplace'}
          onClick={() => onSetView('app-marketplace')}
        />
        <HeaderMenuItem
          label="Marketplace"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5z" />
              <line x1="3" y1="7" x2="21" y2="7" />
              <path d="M16 11a4 4 0 0 1-8 0" />
            </svg>
          }
          active={view === 'marketplace'}
          onClick={() => onSetView('marketplace')}
        /></>}
        {feat('taskTimeline') && <HeaderMenuItem
          label="Task Timeline"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          }
          active={view === 'task-timeline'}
          onClick={() => onSetView('task-timeline')}
        />}
        {feat('tasks') && <HeaderMenuItem
          label="Tasks"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          active={view === 'tasks'}
          onClick={() => onSetView('tasks')}
        />}
        {feat('reminders') && <HeaderMenuItem
          label="Reminders"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
          active={view === 'reminders'}
          onClick={() => onSetView('reminders')}
        />}
        {feat('projects') && <HeaderMenuItem
          label="Projects"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          }
          active={view === 'projects'}
          onClick={() => onSetView('projects')}
        />}

        {(feat('admin') || feat('fineTuning')) && <Divider />}

        {(feat('admin') || feat('fineTuning')) && <SectionLabel>Tools</SectionLabel>}
        {feat('admin') && <HeaderMenuItem
          label="Admin"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          active={view === 'admin'}
          onClick={() => onSetView('admin')}
        />}
        {feat('fineTuning') && <HeaderMenuItem
          label="Fine-Tuning"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
          active={view === 'finetune'}
          onClick={() => onSetView('finetune')}
        />}

        <Divider />

        {/* ── Feature Settings ── */}
        <button
          onClick={() => setShowFeatureSettings(!showFeatureSettings)}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-1)' }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Feature Settings
          <svg
            className="h-3 w-3 ml-auto transition-transform"
            style={{ transform: showFeatureSettings ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--c-text-4)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showFeatureSettings && (
          <div className="px-2 pb-2">
            {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
                style={{ color: 'var(--c-text-2)' }}
              >
                <span className="text-[12px]">{FEATURE_LABELS[key]}</span>
                <button
                  onClick={(e) => { e.preventDefault(); setFeature(key, !features[key]); }}
                  className="relative w-8 h-[18px] rounded-full transition-colors"
                  style={{
                    background: features[key] ? 'var(--c-accent)' : 'var(--c-bg-3)',
                  }}
                >
                  <span
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all"
                    style={{
                      left: features[key] ? 14 : 2,
                      background: features[key] ? '#fff' : 'var(--c-text-4)',
                    }}
                  />
                </button>
              </label>
            ))}
          </div>
        )}

        {/* ── Claude OAuth ── */}
        <button
          onClick={() => setShowOAuthSetup(!showOAuthSetup)}
          className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
          style={{ color: 'var(--c-text-1)' }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Claude OAuth
          <svg
            className="h-3 w-3 ml-auto transition-transform"
            style={{ transform: showOAuthSetup ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--c-text-4)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showOAuthSetup && <OAuthSetup onClose={() => setShowOAuthSetup(false)} />}

        <Divider />

        <HeaderMenuItem
          label="Check for Updates"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          }
          onClick={() => {
            onClose();
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then((regs) => {
                regs.forEach((r) => r.update());
              });
            }
            window.location.reload();
          }}
        />

        <Divider />

        <SectionLabel>Data</SectionLabel>
        <HeaderMenuItem
          label="Export Sessions"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          }
          onClick={() => {
            exportSessions(sessions);
            onClose();
          }}
        />
        <HeaderMenuItem
          label="Import Sessions"
          icon={
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          }
          onClick={() => {
            onImportSessions();
            onClose();
          }}
        />
      </div>
    </>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--c-border-2)', margin: '4px 12px' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: 'var(--c-text-4)' }}
    >
      {children}
    </div>
  );
}

function GatewayOption({
  label,
  description,
  color,
  active,
  onClick,
}: {
  label: string;
  description: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
      style={{
        color: active ? color : 'var(--c-text-2)',
        background: active ? `${color}10` : 'transparent',
      }}
    >
      <span
        className="inline-block shrink-0"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: active ? color : 'var(--c-text-5)',
          boxShadow: active ? `0 0 6px ${color}` : 'none',
        }}
      />
      <span className="flex flex-col leading-tight">
        <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{description}</span>
      </span>
      {active && (
        <svg className="h-3.5 w-3.5 ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function HeaderMenuItem({
  label,
  icon,
  active,
  external,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-colors hover:bg-white/5"
      style={{ color: active ? 'var(--c-accent)' : 'var(--c-text-1)' }}
    >
      <span style={{ color: active ? 'var(--c-accent)' : 'var(--c-text-3)' }}>{icon}</span>
      {label}
      {external && (
        <svg
          className="h-3 w-3 ml-auto"
          style={{ color: 'var(--c-text-4)' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
    </button>
  );
}
