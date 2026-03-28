/**
 * useInstallPrompt — captures the PWA beforeinstallprompt event
 * and exposes an install() method for a custom install banner.
 *
 * On iOS Safari (no beforeinstallprompt), detects standalone mode
 * and shows manual "Add to Home Screen" instructions.
 */

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if previously dismissed (session-only)
    if (sessionStorage.getItem('pwa-install-dismissed')) {
      setDismissed(true);
    }

    // iOS detection (no beforeinstallprompt)
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)) {
      setIsIOS(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => setIsInstalled(true);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      setIsInstalled(true);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  }, []);

  return {
    /** Whether the native install prompt is available (Android/desktop Chrome) */
    canInstall: !!deferredPrompt && !isInstalled && !dismissed,
    /** Whether we should show iOS-specific instructions */
    showIOSGuide: isIOS && !isInstalled && !dismissed,
    /** Whether the app is already installed as PWA */
    isInstalled,
    /** Trigger the native install prompt */
    install,
    /** Dismiss the install banner for this session */
    dismiss,
  };
}
