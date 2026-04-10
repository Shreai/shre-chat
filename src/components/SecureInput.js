import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SecureInput — password input with lock icon and hold-to-peek
 *
 * Displays dots by default. Hold eye icon to peek at value.
 * Brief flash effect on each keystroke (600ms).
 */
import { useState, useRef, useCallback } from 'react';
export default function SecureInput({ value, onChange, placeholder = 'Enter password', className = '', name, }) {
    const [peeking, setPeeking] = useState(false);
    const [flash, setFlash] = useState(false);
    const flashTimer = useRef(null);
    const handleChange = useCallback((e) => {
        onChange(e.target.value);
        setFlash(true);
        if (flashTimer.current)
            clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(false), 600);
    }, [onChange]);
    const startPeek = useCallback(() => setPeeking(true), []);
    const stopPeek = useCallback(() => setPeeking(false), []);
    return (_jsxs("div", { className: `secure-input-wrapper ${className}`, children: [_jsx("span", { className: "secure-input-lock", children: "\uD83D\uDD12" }), _jsx("input", { type: peeking ? 'text' : 'password', value: value, onChange: handleChange, placeholder: placeholder, name: name, className: `secure-input ${flash ? 'flash' : ''}`, autoComplete: "off", spellCheck: false }), _jsx("button", { type: "button", className: "secure-input-peek", onMouseDown: startPeek, onMouseUp: stopPeek, onMouseLeave: stopPeek, onTouchStart: startPeek, onTouchEnd: stopPeek, title: "Hold to peek", "aria-label": "Hold to peek at password", children: peeking ? '👁' : '👁‍🗨' })] }));
}
