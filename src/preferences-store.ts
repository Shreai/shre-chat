import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Legacy localStorage keys — inlined here to avoid circular dependency with chat-utils
const LEGACY_NOTIF_KEY = 'shre-notification-sound';
const LEGACY_VOICE_KEY = 'shre-voice-mode';
const LEGACY_MODEL_KEY = 'shre-model-overrides';

// ── Preferences slice — persisted via Zustand persist middleware ─────

export type TTSProvider = 'auto' | 'elevenlabs' | 'personaplex';
export type GatewayMode = 'router' | 'direct';
export const ALLOW_DIRECT_MODE = import.meta.env.VITE_ENABLE_DIRECT_MODE === 'true';

// Feature keys that can be toggled on/off
export type FeatureKey =
  | 'terminal'
  | 'claudeCli'
  | 'shreCli'
  | 'billing'
  | 'marketplace'
  | 'bookmarks'
  | 'compareModels'
  | 'systemPrompt'
  | 'analytics'
  | 'feedView'
  | 'costDashboard'
  | 'reports'
  | 'admin'
  | 'fineTuning'
  | 'taskTimeline'
  | 'tasks'
  | 'reminders'
  | 'projects'
  | 'externalApps';

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  terminal: 'Terminal',
  claudeCli: 'Claude CLI',
  shreCli: 'Shre CLI',
  billing: 'Billing',
  marketplace: 'Marketplace',
  bookmarks: 'Bookmarks',
  compareModels: 'Compare Models',
  systemPrompt: 'System Prompt',
  analytics: 'Session Analytics',
  feedView: 'Feed / Feed Analytics',
  costDashboard: 'Cost Dashboard',
  reports: 'Reports',
  admin: 'Admin',
  fineTuning: 'Fine-Tuning',
  taskTimeline: 'Task Timeline',
  tasks: 'Tasks',
  reminders: 'Reminders',
  projects: 'Projects',
  externalApps: 'External Apps',
};

// On localhost all features default ON; on public domain (chat.nirtek.net) only core features
const _isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  terminal: _isLocal,
  claudeCli: _isLocal,
  shreCli: _isLocal,
  billing: _isLocal,
  marketplace: _isLocal,
  bookmarks: true,
  compareModels: _isLocal,
  systemPrompt: _isLocal,
  analytics: _isLocal,
  feedView: _isLocal,
  costDashboard: _isLocal,
  reports: _isLocal,
  admin: _isLocal,
  fineTuning: _isLocal,
  taskTimeline: _isLocal,
  tasks: _isLocal,
  reminders: true,
  projects: _isLocal,
  externalApps: _isLocal,
};

export type ConversationModeId = 'assistant' | 'code' | 'apps' | 'ops' | 'strategy' | 'business';

export interface PreferencesState {
  notifSound: boolean;
  voiceMode: boolean;
  micEnabled: boolean; // Persistent mic/voice input toggle (survives page reload)
  ttsVoice: string;
  ttsProvider: TTSProvider;
  modelOverrides: Record<string, string>; // agentId → modelId
  gatewayMode: GatewayMode; // router | direct (Ollama)
  features: Record<FeatureKey, boolean>; // Feature toggles
  focusMode: boolean; // Hide system/cron/automated messages from chat
  traceEnabled: boolean; // Show per-message trace pipeline (conversation traceroute)
  conversationMode: ConversationModeId; // Active conversation mode
  activeAppId: string | null; // App ID when conversationMode === 'apps'
  agentModeOverrides: Record<string, ConversationModeId>; // agentId → default mode

  // Actions
  setNotifSound: (v: boolean) => void;
  setVoiceMode: (v: boolean) => void;
  setMicEnabled: (v: boolean) => void;
  setTtsVoice: (v: string) => void;
  setTtsProvider: (v: TTSProvider) => void;
  setModelOverride: (agentId: string, modelId: string | null) => void;
  getModelOverride: (agentId: string) => string | null;
  setGatewayMode: (v: GatewayMode) => void;
  setFeature: (key: FeatureKey, enabled: boolean) => void;
  isFeatureEnabled: (key: FeatureKey) => boolean;
  setFocusMode: (v: boolean) => void;
  setTraceEnabled: (v: boolean) => void;
  setConversationMode: (mode: ConversationModeId, appId?: string | null) => void;
  setAgentModeOverride: (agentId: string, mode: ConversationModeId | null) => void;
  getAgentModeOverride: (agentId: string) => ConversationModeId | null;
}

/**
 * Migrate legacy localStorage keys into the Zustand persist store on first load.
 * After migration, the persist middleware owns these values.
 */
const LEGACY_ROUTER_MODE_KEY = 'shre-openclaw-mode'; // legacy localStorage key — value kept for backward-compat migration

function migrateFromLegacyKeys(): Partial<PreferencesState> {
  const migrated: Partial<PreferencesState> = {};

  try {
    // notifSound: legacy key stores "true"/"false", default is true (enabled)
    const notifRaw = localStorage.getItem(LEGACY_NOTIF_KEY);
    if (notifRaw !== null) {
      migrated.notifSound = notifRaw !== 'false';
    }

    // voiceMode: legacy key stores "true"/"false", default is false
    const voiceRaw = localStorage.getItem(LEGACY_VOICE_KEY);
    if (voiceRaw !== null) {
      migrated.voiceMode = voiceRaw === 'true';
    }

    // ttsVoice: legacy key stores voice name string
    const ttsRaw = localStorage.getItem('shre-tts-voice');
    if (ttsRaw !== null) {
      migrated.ttsVoice = ttsRaw;
    }

    // modelOverrides: legacy key stores JSON object { agentId: modelId }
    const modelRaw = localStorage.getItem(LEGACY_MODEL_KEY);
    if (modelRaw !== null) {
      const parsed = JSON.parse(modelRaw);
      if (parsed && typeof parsed === 'object') {
        migrated.modelOverrides = parsed;
      }
    }

    // gatewayMode: migrate from legacy shre-router-mode boolean → router
    const ocRaw = localStorage.getItem(LEGACY_ROUTER_MODE_KEY);
    if (ocRaw === 'true') {
      migrated.gatewayMode = 'router';
    }
  } catch {
    // Ignore migration errors — defaults are safe
  }

  return migrated;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => {
      // Run migration on store creation (before first render)
      const legacy = migrateFromLegacyKeys();

      return {
        notifSound: legacy.notifSound ?? true,
        voiceMode: legacy.voiceMode ?? false,
        micEnabled: false,
        ttsVoice: legacy.ttsVoice ?? 'nova',
        ttsProvider: (legacy as any).ttsProvider ?? 'auto',
        modelOverrides: legacy.modelOverrides ?? {},
        gatewayMode:
          legacy.gatewayMode === 'direct' && !ALLOW_DIRECT_MODE
            ? 'router'
            : (legacy.gatewayMode ?? 'router'),
        features: { ...DEFAULT_FEATURES },
        focusMode: false,
        traceEnabled: false,
        conversationMode: 'assistant',
        activeAppId: null,
        agentModeOverrides: {},

        setNotifSound: (v) => set({ notifSound: v }),
        setVoiceMode: (v) => set({ voiceMode: v }),
        setMicEnabled: (v) => set({ micEnabled: v }),
        setTtsVoice: (v) => set({ ttsVoice: v }),
        setTtsProvider: (v) => set({ ttsProvider: v }),
        setGatewayMode: (v) =>
          set({ gatewayMode: v === 'direct' && !ALLOW_DIRECT_MODE ? 'router' : v }),
        setFocusMode: (v) => set({ focusMode: v }),
        setTraceEnabled: (v) => set({ traceEnabled: v }),
        setConversationMode: (mode, appId) =>
          set({ conversationMode: mode, activeAppId: appId ?? null }),

        setAgentModeOverride: (agentId, mode) =>
          set((state) => {
            const next = { ...state.agentModeOverrides };
            if (mode) next[agentId] = mode;
            else delete next[agentId];
            return { agentModeOverrides: next };
          }),

        getAgentModeOverride: (agentId) => {
          return get().agentModeOverrides[agentId] ?? null;
        },

        setFeature: (key, enabled) =>
          set((state) => ({
            features: { ...state.features, [key]: enabled },
          })),

        isFeatureEnabled: (key) => {
          const f = get().features;
          return f[key] ?? DEFAULT_FEATURES[key] ?? false;
        },

        setModelOverride: (agentId, modelId) =>
          set((state) => {
            const next = { ...state.modelOverrides };
            if (modelId) next[agentId] = modelId;
            else delete next[agentId];
            return { modelOverrides: next };
          }),

        getModelOverride: (agentId) => {
          return get().modelOverrides[agentId] ?? null;
        },
      };
    },
    {
      name: 'shre-chat-preferences',
      // Only persist data fields, not action functions
      partialize: (state) => ({
        notifSound: state.notifSound,
        voiceMode: state.voiceMode,
        // micEnabled intentionally excluded — mic must always start off on page load
        ttsVoice: state.ttsVoice,
        ttsProvider: state.ttsProvider,
        modelOverrides: state.modelOverrides,
        gatewayMode: state.gatewayMode,
        features: state.features,
        focusMode: state.focusMode,
        traceEnabled: state.traceEnabled,
        conversationMode: state.conversationMode,
        activeAppId: state.activeAppId,
        agentModeOverrides: state.agentModeOverrides,
      }),
      // After rehydration, clean up legacy keys (one-time)
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (!error) {
            // Remove legacy keys — persist middleware now owns these
            try {
              localStorage.removeItem(LEGACY_NOTIF_KEY);
              localStorage.removeItem(LEGACY_VOICE_KEY);
              localStorage.removeItem('shre-tts-voice');
              localStorage.removeItem(LEGACY_MODEL_KEY);
              localStorage.removeItem(LEGACY_ROUTER_MODE_KEY);
            } catch {
              /* ignore */
            }
          }
        };
      },
    },
  ),
);
