/**
 * SensitiveField — hold-to-view component for sensitive data
 *
 * Shows masked value with lock icon by default.
 * Reveals on mousedown/touchstart ONLY while held.
 * 10-second safety timeout auto-re-masks.
 * Checks identity verification before revealing.
 */

import { useState, useRef, useCallback } from "react";

interface SensitiveFieldProps {
  value: string;
  label?: string;
  maskChar?: string;
  className?: string;
}

function maskValue(val: string, maskChar = "•"): string {
  if (val.length <= 8) return maskChar.repeat(8);
  return val.slice(0, 3) + maskChar.repeat(Math.min(val.length - 7, 12)) + val.slice(-4);
}

export default function SensitiveField({
  value,
  label,
  maskChar = "•",
  className = "",
}: SensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startReveal = useCallback(() => {
    const verified = sessionStorage.getItem("shre-identity-verified") === "true";
    if (!verified) return;

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

  return (
    <div className={`sensitive-field ${className}`}>
      {label && <span className="sensitive-label">{label}</span>}
      <span
        className={`sensitive-value ${revealed ? "revealed" : "masked"}`}
        style={{ userSelect: revealed ? "text" : "none" }}
      >
        {revealed ? value : maskValue(value, maskChar)}
      </span>
      <button
        className="sensitive-toggle"
        onMouseDown={startReveal}
        onMouseUp={stopReveal}
        onMouseLeave={stopReveal}
        onTouchStart={startReveal}
        onTouchEnd={stopReveal}
        title="Hold to reveal"
        aria-label="Hold to reveal sensitive value"
      >
        {revealed ? "👁" : "🔒"}
      </button>
    </div>
  );
}
