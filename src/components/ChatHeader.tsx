import React from 'react';
import type { AgentOption } from './voice/voice-utils';
import type { AvailableModel } from './hooks/useSlashCommands';

interface ChatHeaderProps {
  currentAgent: { id: string; name: string; emoji: string };
  agents: AgentOption[];
  onSwitchAgent: (id: string) => void;
  routerMode: boolean;
  onToggleRouterMode: () => void;
  gatewayMode: 'shre' | 'direct';
  onSetGatewayMode: (mode: 'shre' | 'direct') => void;
  compareMode: boolean;
  onToggleCompare: () => void;
  selectedModel: string | null;
  onShowModelPicker: () => void;
  onShowSystemPrompt: () => void;
  onSummarize: () => void;
  onShare: () => void;
  onToggleNotifSound: () => void;
  notifSound: boolean;
  onDownloadMd: () => void;
  onDownloadJson: () => void;
  onCopyMarkdown: () => void;
  onNewChat: () => void;
  showTerminal: boolean;
  onToggleTerminal: () => void;
  isTabMode: boolean;
  activeView: string;
  onSetActiveView: (view: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentAgent,
  agents,
  onSwitchAgent,
  routerMode,
  onToggleRouterMode,
  gatewayMode,
  onSetGatewayMode,
  compareMode,
  onToggleCompare,
  selectedModel,
  onShowModelPicker,
  onShowSystemPrompt,
  onSummarize,
  onShare,
  onToggleNotifSound,
  notifSound,
  onDownloadMd,
  onDownloadJson,
  onCopyMarkdown,
  onNewChat,
  showTerminal,
  onToggleTerminal,
  isTabMode,
  activeView,
  onSetActiveView,
}) => {
  return (
    <div className="chat-header flex items-center justify-between px-4 py-2 border-b border-white/5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSetActiveView('chat')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
            activeView === 'chat' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <span className="text-lg">{currentAgent.emoji}</span>
          <span className="text-sm font-medium">{currentAgent.name}</span>
        </button>
        {isTabMode && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onSetActiveView('chat')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeView === 'chat'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => onSetActiveView('terminal')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeView === 'terminal'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Terminal
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* ... abbreviated for brevity in this example but would contain all toolbar buttons ... */}
        <button
          onClick={onNewChat}
          className="p-2 text-white/50 hover:text-white/80 rounded-lg transition-colors"
          title="New Chat (Cmd+K)"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
};
