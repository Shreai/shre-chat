import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * RealtimeVoiceOverlay — Full-screen voice conversation UI
 *
 * Appears when the user taps the realtime voice button. Shows:
 * - Pulsing orb animation (listening/speaking state)
 * - Live transcripts (user + AI)
 * - Provider badge (PersonaPlex 70ms / OpenAI 300ms)
 * - Persona selector (Shre, Ellie, Nova, Support)
 * - End call button
 */
import { useState } from 'react';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
const PERSONAS = [
    { id: 'shre', name: 'Shre', role: 'CEO', color: '#3b82f6' },
    { id: 'ellie', name: 'Ellie', role: 'President', color: '#8b5cf6' },
    { id: 'nova', name: 'Nova', role: 'Innovation', color: '#ec4899' },
    { id: 'support', name: 'Support', role: 'Help Desk', color: '#10b981' },
];
const stateLabels = {
    idle: 'Tap to start',
    connecting: 'Connecting...',
    listening: 'Listening...',
    speaking: 'Speaking...',
    error: 'Connection lost',
};
export function RealtimeVoiceOverlay({ onClose, defaultPersona = 'shre' }) {
    const [selectedPersona, setSelectedPersona] = useState(defaultPersona);
    const { state, provider, transcript, aiTranscript, latency, startRealtime, stopRealtime, isActive, } = useRealtimeVoice();
    const persona = PERSONAS.find(p => p.id === selectedPersona) || PERSONAS[0];
    const handleToggle = () => {
        if (isActive) {
            stopRealtime();
        }
        else {
            startRealtime(selectedPersona);
        }
    };
    const handleEnd = () => {
        stopRealtime();
        onClose();
    };
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex flex-col items-center justify-between", style: {
            background: `linear-gradient(135deg, ${persona.color}22 0%, #0a0a0f 50%, ${persona.color}11 100%)`,
            backdropFilter: 'blur(20px)',
        }, children: [_jsxs("div", { className: "w-full flex items-center justify-between px-6 pt-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-3 h-3 rounded-full", style: {
                                    backgroundColor: isActive ? '#22c55e' : '#6b7280',
                                    boxShadow: isActive ? '0 0 8px #22c55e' : 'none',
                                } }), _jsxs("span", { className: "text-white/60 text-sm", children: [provider === 'personaplex' ? 'PersonaPlex' : provider === 'openai_realtime' ? 'OpenAI' : 'Voice AI', latency && ` (${latency})`] })] }), _jsx("button", { onClick: handleEnd, className: "text-white/60 hover:text-white text-sm px-3 py-1 rounded-full border border-white/20 hover:border-white/40 transition", children: "Close" })] }), _jsxs("div", { className: "flex-1 flex flex-col items-center justify-center gap-8 px-6", children: [_jsxs("div", { className: "text-center", children: [_jsx("h2", { className: "text-white text-2xl font-light", children: persona.name }), _jsx("p", { className: "text-white/40 text-sm", children: persona.role })] }), _jsxs("button", { onClick: handleToggle, className: "relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500", style: {
                            background: `radial-gradient(circle, ${persona.color}88 0%, ${persona.color}22 70%, transparent 100%)`,
                            boxShadow: isActive
                                ? `0 0 60px ${persona.color}44, 0 0 120px ${persona.color}22`
                                : `0 0 30px ${persona.color}22`,
                        }, children: [_jsx("div", { className: `w-20 h-20 rounded-full transition-all duration-300 ${state === 'listening' ? 'animate-pulse' : ''} ${state === 'speaking' ? 'scale-110' : 'scale-100'}`, style: {
                                    background: `radial-gradient(circle, ${persona.color} 0%, ${persona.color}88 100%)`,
                                    boxShadow: `0 0 40px ${persona.color}66`,
                                } }), isActive && (_jsx("div", { className: "absolute inset-0 rounded-full border-2 animate-ping", style: {
                                    borderColor: persona.color,
                                    opacity: 0.3,
                                    animationDuration: state === 'listening' ? '2s' : '1s',
                                } }))] }), _jsx("p", { className: "text-white/50 text-sm", children: stateLabels[state] }), _jsxs("div", { className: "w-full max-w-md space-y-3 min-h-[120px]", children: [transcript && (_jsxs("div", { className: "bg-white/5 rounded-lg px-4 py-3 border border-white/10", children: [_jsx("p", { className: "text-white/40 text-xs mb-1", children: "You" }), _jsx("p", { className: "text-white/90 text-sm", children: transcript })] })), aiTranscript && (_jsxs("div", { className: "rounded-lg px-4 py-3 border", style: {
                                    backgroundColor: `${persona.color}11`,
                                    borderColor: `${persona.color}33`,
                                }, children: [_jsx("p", { className: "text-xs mb-1", style: { color: persona.color }, children: persona.name }), _jsx("p", { className: "text-white/90 text-sm", children: aiTranscript })] }))] })] }), _jsxs("div", { className: "w-full px-6 pb-8 space-y-4", children: [!isActive && (_jsx("div", { className: "flex justify-center gap-2", children: PERSONAS.map(p => (_jsx("button", { onClick: () => setSelectedPersona(p.id), className: `px-4 py-2 rounded-full text-sm transition-all ${selectedPersona === p.id
                                ? 'text-white border-2'
                                : 'text-white/50 border border-white/20 hover:border-white/40'}`, style: selectedPersona === p.id
                                ? { borderColor: p.color, backgroundColor: `${p.color}22` }
                                : {}, children: p.name }, p.id))) })), isActive && (_jsx("div", { className: "flex justify-center", children: _jsx("button", { onClick: handleEnd, className: "w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-red-500/30 transition-all", children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4z" }), _jsx("line", { x1: "1", y1: "1", x2: "23", y2: "23" })] }) }) }))] })] }));
}
