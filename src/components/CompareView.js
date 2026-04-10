import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function CompareView({ compareStreams, compareWinner, availableModels, activeSessionId, onPickWinner, onDismiss, }) {
    if (Object.keys(compareStreams).length === 0)
        return null;
    return (_jsxs("div", { className: "max-w-5xl mx-auto mt-4 mb-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3 px-1", children: [_jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-warning)", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }), _jsx("line", { x1: "12", y1: "3", x2: "12", y2: "21" })] }), _jsx("span", { className: "text-xs font-semibold", style: { color: 'var(--c-warning)' }, children: "Model Comparison" }), Object.values(compareStreams).every((s) => s.done) && !compareWinner && (_jsx("span", { className: "text-[10px] ml-2", style: { color: 'var(--c-text-4)' }, children: "Pick a winner to save as the response" })), compareWinner && (_jsxs("span", { className: "text-[10px] ml-2 px-2 py-0.5 rounded-full", style: { background: 'rgba(34,197,94,0.15)', color: 'var(--c-success)' }, children: ["Winner:", ' ', availableModels.find((m) => m.id === compareWinner)?.name ||
                                compareWinner.split('/')[1]] }))] }), _jsx("div", { className: "grid gap-3", style: { gridTemplateColumns: `repeat(${Object.keys(compareStreams).length}, 1fr)` }, children: Object.entries(compareStreams).map(([modelId, stream]) => {
                    const modelInfo = availableModels.find((m) => m.id === modelId);
                    const isWinner = compareWinner === modelId;
                    return (_jsxs("div", { className: "rounded-xl overflow-hidden flex flex-col", style: {
                            background: 'var(--c-bg-card)',
                            border: isWinner ? '2px solid var(--c-success)' : '1px solid var(--c-border-2)',
                            minHeight: '120px',
                        }, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2 shrink-0", style: {
                                    borderBottom: '1px solid var(--c-border-2)',
                                    background: isWinner ? 'rgba(34,197,94,0.08)' : 'var(--c-bg-2)',
                                }, children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-xs", children: modelInfo?.icon || '?' }), _jsx("span", { className: "text-[11px] font-semibold", style: { color: isWinner ? 'var(--c-success)' : 'var(--c-text-2)' }, children: modelInfo?.name || modelId.split('/')[1] }), isWinner && _jsx("span", { className: "text-[10px]", children: "\uD83C\uDFC6" })] }), _jsx("div", { className: "flex items-center gap-1", children: stream.done ? (_jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded-full", style: {
                                                background: stream.error ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                                color: stream.error ? 'var(--c-danger)' : 'var(--c-success)',
                                            }, children: stream.error ? 'Error' : `${stream.text.length} chars` })) : (_jsxs("span", { className: "flex gap-0.5 items-center", children: [_jsx("span", { className: "h-1.5 w-1.5 rounded-full animate-bounce", style: { background: 'var(--c-warning)', animationDelay: '0ms' } }), _jsx("span", { className: "h-1.5 w-1.5 rounded-full animate-bounce", style: { background: 'var(--c-warning)', animationDelay: '150ms' } }), _jsx("span", { className: "h-1.5 w-1.5 rounded-full animate-bounce", style: { background: 'var(--c-warning)', animationDelay: '300ms' } })] })) })] }), _jsxs("div", { className: "flex-1 px-3 py-2 overflow-y-auto text-sm leading-relaxed", style: { color: 'var(--c-text-1)', maxHeight: '400px' }, children: [_jsx(Markdown, { remarkPlugins: [remarkGfm], children: stream.text || 'Waiting...' }), !stream.done && (_jsx("span", { className: "inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse rounded-sm" }))] }), stream.done && !stream.error && !compareWinner && (_jsx("div", { className: "px-3 py-2 shrink-0", style: { borderTop: '1px solid var(--c-border-2)' }, children: _jsx("button", { onClick: () => onPickWinner(modelId, stream.text), className: "w-full text-center text-[11px] py-1.5 rounded-lg transition-all hover:scale-[1.02]", style: {
                                        background: 'rgba(34,197,94,0.15)',
                                        color: 'var(--c-success)',
                                        border: '1px solid rgba(34,197,94,0.3)',
                                    }, children: "Pick as winner" }) })), isWinner && (_jsx("div", { className: "px-3 py-1.5 text-center shrink-0", style: {
                                    borderTop: '1px solid rgba(34,197,94,0.3)',
                                    background: 'rgba(34,197,94,0.08)',
                                }, children: _jsx("span", { className: "text-[10px] font-medium", style: { color: 'var(--c-success)' }, children: "Saved as response" }) }))] }, modelId));
                }) }), compareWinner && (_jsx("div", { className: "flex justify-center mt-3", children: _jsx("button", { onClick: onDismiss, className: "text-[11px] px-3 py-1 rounded-lg transition-colors", style: { color: 'var(--c-text-4)', background: 'var(--c-bg-active)' }, children: "Dismiss comparison" }) }))] }));
}
