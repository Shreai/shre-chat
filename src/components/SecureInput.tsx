/**
 * SecureInput — password input with lock icon and hold-to-peek
 *
 * Displays dots by default. Hold eye icon to peek at value.
 * Brief flash effect on each keystroke (600ms).
 */

import { useState, useRef, useCallback, type ChangeEvent } from 'react';

interface SecureInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
}

export default function SecureInput({
  value,
  onChange,
  placeholder = 'Enter password',
  className = '',
  name,
}: SecureInputProps) {
  const [peeking, setPeeking] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 600);
    },
    [onChange],
  );

  const startPeek = useCallback(() => setPeeking(true), []);

  const stopPeek = useCallback(() => setPeeking(false), []);

  return (
    <div className={`secure-input-wrapper ${className}`}>
      <span className="secure-input-lock">🔒</span>
      <input
        type={peeking ? 'text' : 'password'}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        name={name}
        className={`secure-input ${flash ? 'flash' : ''}`}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="secure-input-peek"
        onMouseDown={startPeek}
        onMouseUp={stopPeek}
        onMouseLeave={stopPeek}
        onTouchStart={startPeek}
        onTouchEnd={stopPeek}
        title="Hold to peek"
        aria-label="Hold to peek at password"
      >
        {peeking ? '👁' : '👁‍🗨'}
      </button>
    </div>
  );
}
