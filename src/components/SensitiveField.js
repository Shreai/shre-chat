import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SensitiveField — hold-to-view component for sensitive data
 *
 * Shows masked value with lock icon by default.
 * Reveals on mousedown/touchstart ONLY while held.
 * 10-second safety timeout auto-re-masks.
 * Checks identity verification before revealing.
 */
import { useState, useRef, useCallback } from 'react';
function maskValue(val, maskChar = '•') {
    if (val.length <= 8)
        return maskChar.repeat(8);
    return val.slice(0, 3) + maskChar.repeat(Math.min(val.length - 7, 12)) + val.slice(-4);
}
export default function SensitiveField({ value, label, maskChar = '•', className = '', }) {
    const [revealed, setRevealed] = useState(false);
    const timerRef = useRef(null);
    const startReveal = useCallback(() => {
        const verified = sessionStorage.getItem('shre-identity-verified') === 'true';
        if (!verified)
            return;
        setRevealed(true);
        timerRef.current = setTimeout(() => setRevealed(false), 10_000);
    }, []);
    const stopReveal = useCallback(() => {
        setRevealed(false);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);
    return (_jsxs("div", { className: `sensitive-field ${className}`, children: [label && _jsx("span", { className: "sensitive-label", children: label }), _jsx("span", { className: `sensitive-value ${revealed ? 'revealed' : 'masked'}`, style: { userSelect: revealed ? 'text' : 'none' }, children: revealed ? value : maskValue(value, maskChar) }), _jsx("button", { className: "sensitive-toggle", onMouseDown: startReveal, onMouseUp: stopReveal, onMouseLeave: stopReveal, onTouchStart: startReveal, onTouchEnd: stopReveal, title: "Hold to reveal", "aria-label": "Hold to reveal sensitive value", children: revealed ? '👁' : '🔒' })] }));
}
