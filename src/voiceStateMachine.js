/**
 * Voice Assistant State Machine — useReducer-based with typed actions and guards.
 *
 * States: idle → greeting → ready → listening → transcribing → thinking → speaking → error
 * Push-to-talk: "ready" waits for user tap, "listening" actively records until next tap.
 * Replaces scattered setPhase() calls + processingRef/stoppedRef/activeRef booleans.
 */
export const initialVoiceState = {
    phase: 'idle',
    transcript: '',
    finalTranscript: '',
    statusText: '',
    errorMsg: '',
    speechActive: false,
};
export function voiceReducer(state, action) {
    switch (action.type) {
        case 'OPEN':
            if (state.phase !== 'idle')
                return state;
            return { ...initialVoiceState, phase: 'greeting' };
        case 'GREETING_DONE':
            if (state.phase !== 'greeting')
                return state;
            return { ...state, phase: 'ready', statusText: '' };
        case 'START_LISTENING':
            if (state.phase !== 'ready' && state.phase !== 'listening' && state.phase !== 'greeting')
                return state;
            return {
                ...state,
                phase: 'listening',
                transcript: '',
                finalTranscript: '',
                statusText: '',
                speechActive: false,
            };
        case 'SPEECH_DETECTED':
            if (state.phase !== 'listening')
                return state;
            return { ...state, speechActive: true };
        case 'SPEECH_ENDED':
            return { ...state, speechActive: false };
        case 'TRANSCRIPT_UPDATE':
            if (state.phase !== 'listening')
                return state;
            return {
                ...state,
                finalTranscript: action.final,
                transcript: (action.final + ' ' + action.interim).trim(),
            };
        case 'FINISH_LISTENING':
            if (state.phase !== 'listening')
                return state;
            return {
                ...state,
                phase: 'transcribing',
                statusText: 'Transcribing...',
                speechActive: false,
            };
        case 'TRANSCRIPTION_DONE':
            if (state.phase !== 'transcribing')
                return state;
            return { ...state, phase: 'thinking', statusText: 'Processing...' };
        case 'AI_RESPONSE':
            if (state.phase !== 'thinking')
                return state;
            return { ...state, phase: 'speaking', statusText: '' };
        case 'START_SPEAKING':
            if (state.phase !== 'thinking' && state.phase !== 'ready' && state.phase !== 'listening')
                return state;
            return { ...state, phase: 'speaking', statusText: '', speechActive: false };
        case 'SPEAK_DONE':
            if (state.phase !== 'speaking')
                return state;
            return { ...state, phase: 'ready', transcript: '', finalTranscript: '', statusText: '' };
        case 'INTERRUPT':
            if (state.phase !== 'speaking' &&
                state.phase !== 'thinking' &&
                state.phase !== 'transcribing' &&
                state.phase !== 'listening')
                return state;
            return { ...state, phase: 'ready', transcript: '', finalTranscript: '', statusText: '' };
        case 'BARGE_IN':
            if (state.phase !== 'speaking')
                return state;
            return {
                ...state,
                phase: 'ready',
                transcript: '',
                finalTranscript: '',
                statusText: '',
                speechActive: false,
            };
        case 'CLOSE':
            return { ...initialVoiceState };
        case 'ERROR':
            return { ...state, phase: 'error', errorMsg: action.message, statusText: '' };
        case 'RETRY':
            if (state.phase !== 'error')
                return state;
            return {
                ...state,
                phase: 'ready',
                errorMsg: '',
                transcript: '',
                finalTranscript: '',
                statusText: '',
            };
        case 'SET_STATUS':
            return { ...state, statusText: action.text };
        case 'CLEAR_TRANSCRIPT':
            return { ...state, transcript: '', finalTranscript: '' };
        default:
            return state;
    }
}
