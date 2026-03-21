/**
 * Voice Assistant State Machine — useReducer-based with typed actions and guards.
 *
 * States: idle → greeting → listening → transcribing → thinking → speaking → error
 * Replaces scattered setPhase() calls + processingRef/stoppedRef/activeRef booleans.
 */

export type VoicePhase = "idle" | "greeting" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

export interface VoiceState {
  phase: VoicePhase;
  transcript: string;       // live transcript preview (interim from SR)
  finalTranscript: string;  // accumulated final text
  statusText: string;
  errorMsg: string;
  speechActive: boolean;    // true when VAD/SR detects voice energy
}

export type VoiceAction =
  | { type: "OPEN" }
  | { type: "GREETING_DONE" }
  | { type: "START_LISTENING" }
  | { type: "SPEECH_DETECTED" }
  | { type: "SPEECH_ENDED" }
  | { type: "TRANSCRIPT_UPDATE"; interim: string; final: string }
  | { type: "FINISH_LISTENING" }
  | { type: "TRANSCRIPTION_DONE" }
  | { type: "AI_RESPONSE" }
  | { type: "START_SPEAKING" }
  | { type: "SPEAK_DONE" }
  | { type: "INTERRUPT" }
  | { type: "BARGE_IN" }
  | { type: "CLOSE" }
  | { type: "ERROR"; message: string }
  | { type: "RETRY" }
  | { type: "SET_STATUS"; text: string }
  | { type: "CLEAR_TRANSCRIPT" };

export const initialVoiceState: VoiceState = {
  phase: "idle",
  transcript: "",
  finalTranscript: "",
  statusText: "",
  errorMsg: "",
  speechActive: false,
};

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "OPEN":
      if (state.phase !== "idle") return state;
      return { ...initialVoiceState, phase: "greeting" };

    case "GREETING_DONE":
      if (state.phase !== "greeting") return state;
      return { ...state, phase: "listening", statusText: "" };

    case "START_LISTENING":
      return {
        ...state,
        phase: "listening",
        transcript: "",
        finalTranscript: "",
        statusText: "",
        speechActive: false,
      };

    case "SPEECH_DETECTED":
      if (state.phase !== "listening") return state;
      return { ...state, speechActive: true };

    case "SPEECH_ENDED":
      return { ...state, speechActive: false };

    case "TRANSCRIPT_UPDATE":
      if (state.phase !== "listening") return state;
      return {
        ...state,
        finalTranscript: action.final,
        transcript: (action.final + " " + action.interim).trim(),
      };

    case "FINISH_LISTENING":
      if (state.phase !== "listening") return state;
      return { ...state, phase: "transcribing", statusText: "Transcribing...", speechActive: false };

    case "TRANSCRIPTION_DONE":
      if (state.phase !== "transcribing") return state;
      return { ...state, phase: "thinking", statusText: "Processing..." };

    case "AI_RESPONSE":
      if (state.phase !== "thinking") return state;
      return { ...state, phase: "speaking", statusText: "" };

    case "START_SPEAKING":
      return { ...state, phase: "speaking", statusText: "" };

    case "SPEAK_DONE":
      if (state.phase !== "speaking") return state;
      return { ...state, phase: "listening", transcript: "", finalTranscript: "", statusText: "" };

    case "INTERRUPT":
      if (state.phase !== "speaking" && state.phase !== "thinking") return state;
      return { ...state, phase: "listening", transcript: "", finalTranscript: "", statusText: "" };

    case "BARGE_IN":
      if (state.phase !== "speaking") return state;
      return { ...state, phase: "listening", transcript: "", finalTranscript: "", statusText: "", speechActive: true };

    case "CLOSE":
      return { ...initialVoiceState };

    case "ERROR":
      return { ...state, phase: "error", errorMsg: action.message, statusText: "" };

    case "RETRY":
      if (state.phase !== "error") return state;
      return { ...state, phase: "listening", errorMsg: "", transcript: "", finalTranscript: "", statusText: "" };

    case "SET_STATUS":
      return { ...state, statusText: action.text };

    case "CLEAR_TRANSCRIPT":
      return { ...state, transcript: "", finalTranscript: "" };

    default:
      return state;
  }
}
