import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Legacy localStorage keys — inlined here to avoid circular dependency with chat-utils
const LEGACY_NOTIF_KEY = 'shre-notification-sound';
const LEGACY_VOICE_KEY = 'shre-voice-mode';
const LEGACY_MODEL_KEY = 'shre-model-overrides';

// ── Preferences slice — persisted via Zustand persist middleware ─────

export type TTSProvider = 'auto' | 'elevenlabs' | 'personaplex';
export type GatewayMode = 'router' | 'openclaw' | 'direct';

export interface PreferencesState {
  notifSound: boolean;
  voiceMode: boolean;
  micEnabled: boolean; // Persistent mic/voice input toggle (survives page reload)
  ttsVoice: string;
  ttsProvider: TTSProvider;
  modelOverrides: Record<string, string>; // agentId → modelId
  gatewayMode: GatewayMode; // router | openclaw | direct (Ollama)

  // Actions
  setNotifSound: (v: boolean) => void;
  setVoiceMode: (v: boolean) => void;
  setMicEnabled: (v: boolean) => void;
  setTtsVoice: (v: string) => void;
  setTtsProvider: (v: TTSProvider) => void;
  setModelOverride: (agentId: string, modelId: string | null) => void;
  getModelOverride: (agentId: string) => string | null;
  setGatewayMode: (v: GatewayMode) => void;
}

/**
 * Migrate legacy localStorage keys into the Zustand persist store on first load.
 * After migration, the persist middleware owns these values.
 */
const LEGACY_OPENCLAW_KEY = 'shre-openclaw-mode';

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

    // gatewayMode: migrate from legacy shre-openclaw-mode boolean
    const ocRaw = localStorage.getItem(LEGACY_OPENCLAW_KEY);
    if (ocRaw === 'true') {
      migrated.gatewayMode = 'openclaw';
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
        gatewayMode: legacy.gatewayMode ?? 'router',

        setNotifSound: (v) => set({ notifSound: v }),
        setVoiceMode: (v) => set({ voiceMode: v }),
        setMicEnabled: (v) => set({ micEnabled: v }),
        setTtsVoice: (v) => set({ ttsVoice: v }),
        setTtsProvider: (v) => set({ ttsProvider: v }),
        setGatewayMode: (v) => set({ gatewayMode: v }),

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
        micEnabled: state.micEnabled,
        ttsVoice: state.ttsVoice,
        ttsProvider: state.ttsProvider,
        modelOverrides: state.modelOverrides,
        gatewayMode: state.gatewayMode,
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
              localStorage.removeItem(LEGACY_OPENCLAW_KEY);
            } catch {
              /* ignore */
            }
          }
        };
      },
    },
  ),
);
