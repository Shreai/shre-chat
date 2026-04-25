import React, { useEffect, useRef, useState } from 'react';
import { useVoiceAssistantLogic } from './hooks/useVoiceAssistantLogic';
import { VoiceTurnContent } from './voice/VoiceTurnContent';
import type { AgentOption } from './voice/voice-utils';
import type { TTSProvider } from './preferences-store';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  icon: string;
  connected?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  agentName: string;
  agentEmoji: string;
  agentId: string;
  ttsVoice: string;
  ttsProvider?: string;
  agents?: AgentOption[];
  onSwitchAgent?: (agentId: string) => void;
  onVoiceTurn?: (turn: { role: 'user' | 'assistant'; content: string }) => void;
  routerMode?: boolean;
  models?: ModelOption[];
  selectedModel?: string | null;
  onSelectModel?: (id: string | null) => void;
  onSetTtsProvider?: (v: TTSProvider) => void;
}

export default function VoiceAssistant(props: Props) {
  const {
    open,
    onClose,
    messages,
    agentName,
    agentEmoji,
    agentId,
    ttsVoice,
    ttsProvider,
    agents,
    onSwitchAgent,
    onVoiceTurn,
    routerMode,
    models,
    selectedModel,
    onSelectModel,
  } = props;

  const { state, turns, proactiveMode, setProactiveMode, handleOrbTap } = useVoiceAssistantLogic({
    open,
    onClose,
    messages,
    agentName,
    agentEmoji,
    agentId,
    ttsVoice,
    ttsProvider,
    agents,
    onSwitchAgent,
    onVoiceTurn,
    routerMode,
  });

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, state.transcript]);

  if (!open) return null;

  const { phase, transcript, statusText, errorMsg } = state;

  const phaseLabel =
    statusText ||
    (phase === 'greeting'
      ? 'Starting up...'
      : phase === 'ready'
        ? ''
        : phase === 'listening'
          ? transcript
            ? ''
            : 'Recording...'
          : phase === 'transcribing'
            ? 'Transcribing...'
            : phase === 'thinking'
              ? 'Processing...'
              : phase === 'speaking'
                ? 'Speaking...'
                : '');

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a1628]">
      <div className="flex items-center justify-between p-5">
        <button
          onClick={() => setAgentPickerOpen(!agentPickerOpen)}
          className="text-white flex items-center gap-2"
        >
          <span>{agentEmoji}</span>
          <span className="font-medium">{agentName}</span>
        </button>
        <div className="flex gap-2">
          <button onClick={() => setSettingsOpen(!settingsOpen)} className="text-white/50 p-2">
            Settings
          </button>
          <button onClick={onClose} className="text-white/50 p-2">
            Close
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] p-3 rounded-xl bg-white/10 text-white">
              <VoiceTurnContent turn={turn} />
            </div>
          </div>
        ))}
        {transcript && <div className="flex justify-end italic text-white/50">{transcript}</div>}
      </div>

      <div className="p-10 flex flex-col items-center">
        {errorMsg && <div className="text-red-400 mb-4">{errorMsg}</div>}
        <button
          onClick={handleOrbTap}
          className={`w-20 h-20 rounded-full transition-all ${
            phase === 'listening'
              ? 'bg-red-500 scale-110 shadow-[0_0_20px_red]'
              : phase === 'speaking'
                ? 'bg-green-500 shadow-[0_0_20px_green]'
                : 'bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
          }`}
        />
        <div className="mt-4 text-white/30 text-xs font-bold uppercase tracking-widest">
          {phaseLabel || phase}
        </div>
      </div>

      {settingsOpen && (
        <div className="absolute inset-x-0 bottom-0 bg-slate-900 p-6 border-t border-white/10">
          <div className="text-white mb-4 flex justify-between">
            <span>Settings</span>
            <button onClick={() => setSettingsOpen(false)}>X</button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {models?.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelectModel?.(m.id)}
                className={`px-2 py-1 rounded border ${selectedModel === m.id ? 'bg-blue-600' : ''}`}
              >
                {m.name}
              </button>
            ))}
          </div>
          <button onClick={() => setProactiveMode(!proactiveMode)} className="text-white">
            Hands-free: {proactiveMode ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      {agentPickerOpen && (
        <div className="absolute inset-x-0 bottom-0 bg-slate-900 p-6 border-t border-white/10 grid grid-cols-2 gap-2">
          {agents?.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                onSwitchAgent?.(a.id);
                setAgentPickerOpen(false);
              }}
              className="p-2 border rounded text-white"
            >
              {a.emoji} {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
