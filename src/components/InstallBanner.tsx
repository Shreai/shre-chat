/**
 * InstallBanner — prompts mobile/desktop users to install the PWA.
 * Shows native install on Android/Chrome, iOS instructions on Safari.
 * Dismissible per session.
 */

import { useEffect, useRef } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export default function InstallBanner() {
  const { canInstall, showIOSGuide, install, dismiss } = useInstallPrompt();
  const bannerRef = useRef<HTMLDivElement>(null);
  const visible = canInstall || showIOSGuide;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (!visible) {
      root.style.removeProperty('--install-banner-offset');
      return;
    }

    const syncOffset = () => {
      const height = Math.ceil(bannerRef.current?.getBoundingClientRect().height || 0);
      root.style.setProperty('--install-banner-offset', `${height}px`);
    };

    syncOffset();
    window.addEventListener('resize', syncOffset);
    return () => {
      window.removeEventListener('resize', syncOffset);
      root.style.removeProperty('--install-banner-offset');
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
        borderTop: '1px solid #334155',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        color: '#e2e8f0',
        boxShadow: '0 -4px 20px rgba(0,0,0,.4)',
      }}
    >
      <div style={{ flex: 1 }}>
        {canInstall && (
          <span>
            Install <strong>Shre AI</strong> for quick access
          </span>
        )}
        {showIOSGuide && (
          <span>
            Tap <span style={{ fontSize: 16, verticalAlign: 'middle' }}>&#x2191;</span> then{' '}
            <strong>"Add to Home Screen"</strong>
          </span>
        )}
      </div>
      {canInstall && (
        <button
          onClick={install}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          fontSize: 18,
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
