/**
 * IdentityVerifyButton
 *
 * Security model:
 *   - Clicking this button POSTs to POST /v1/identity/verify on the router gateway.
 *   - The request body is EMPTY — the passcode is NEVER sent from the browser.
 *   - The gateway plugin opens a native macOS dialog on the host to collect the passcode.
 *   - Only { ok: true } or { ok: false } is returned to the browser.
 *   - The passcode never crosses the browser boundary; it cannot appear in network logs,
 *     browser DevTools, or stored transcripts.
 */

import React, { useState, useCallback } from 'react';

type VerifyState = 'idle' | 'pending' | 'success' | 'failure' | 'error';

export function IdentityVerifyButton() {
  const [state, setState] = useState<VerifyState>('idle');
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetAfterDelay = (ms = 3000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setState('idle'), ms);
  };

  const handleVerify = useCallback(async () => {
    if (state === 'pending') return;
    setState('pending');

    try {
      // POST with empty body — passcode is collected server-side via native dialog
      const res = await fetch('/v1/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        // In dev/bypass flows, identity service may reject unauthenticated checks.
        // Keep the control neutral instead of presenting a hard error state.
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setState('idle');
          return;
        }
        setState('error');
        resetAfterDelay(4000);
        return;
      }

      const data = (await res.json()) as { ok: boolean; cancelled?: boolean };

      if (data.cancelled) {
        setState('idle');
        return;
      }

      setState(data.ok ? 'success' : 'failure');
      resetAfterDelay(data.ok ? 3000 : 4000);
    } catch {
      setState('error');
      resetAfterDelay(4000);
    }
  }, [state]);

  const iconColor =
    state === 'success'
      ? '#4ade80'
      : state === 'failure'
        ? '#f87171'
        : state === 'error'
          ? '#fb923c'
          : state === 'pending'
            ? 'var(--c-accent)'
            : 'var(--c-text-4)';

  const title =
    state === 'pending'
      ? 'Waiting for native dialog…'
      : state === 'success'
        ? 'Identity verified ✓'
        : state === 'failure'
          ? 'Identity mismatch ✗'
          : state === 'error'
            ? 'Verification error'
            : 'Verify identity';

  return (
    <button
      onClick={handleVerify}
      disabled={state === 'pending'}
      className="p-1.5 rounded-lg transition-colors"
      style={{ color: iconColor, opacity: state === 'pending' ? 0.6 : 1 }}
      onMouseEnter={(e) => {
        if (state === 'idle') e.currentTarget.style.background = 'var(--c-bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      title={title}
      aria-label={title}
    >
      {state === 'pending' ? (
        /* Spinner */
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : state === 'success' ? (
        /* Check */
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : state === 'failure' ? (
        /* X */
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        /* Shield icon */
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )}
    </button>
  );
}
