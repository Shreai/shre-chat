/**
 * usePushNotifications — Web Push subscription management for iOS/mobile.
 *
 * Handles: VAPID key fetch, permission request, push subscription,
 * server registration, and auto-resubscription on SW update.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

type PushState = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'error';

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('prompt');
  const [loading, setLoading] = useState(false);
  const subscribedRef = useRef(false);

  const registerWithServer = useCallback(async (subscription: PushSubscription) => {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) {
        console.warn('[push] Server registration failed:', res.status);
      }
    } catch (err) {
      console.warn('[push] Server registration error:', err);
    }
  }, []);

  // Check support & current state on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setState('subscribed');
          subscribedRef.current = true;
          // Re-register with server in case it lost the subscription
          registerWithServer(sub);
        }
      });
    });
  }, [registerWithServer]);

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return false;
    }

    setLoading(true);
    try {
      // 1. Get VAPID public key from server
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await vapidRes.json();

      // 2. Convert VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // 3. Get service worker registration
      const reg = await navigator.serviceWorker.ready;

      // 4. Subscribe to push (triggers browser permission prompt)
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 5. Send subscription to server
      await registerWithServer(subscription);

      setState('subscribed');
      subscribedRef.current = true;
      return true;
    } catch (err) {
      if (Notification.permission === 'denied') {
        setState('denied');
      } else {
        console.error('[push] Subscribe failed:', err);
        setState('error');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [registerWithServer]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        // Unregister from server
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});

        // Unsubscribe from browser
        await subscription.unsubscribe();
      }
      setState('prompt');
      subscribedRef.current = false;
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err);
    }
  }, []);

  return {
    /** Current push state */
    pushState: state,
    /** Whether a subscribe/unsubscribe operation is in progress */
    loading,
    /** Whether push is available on this device */
    supported: state !== 'unsupported',
    /** Whether currently subscribed */
    isSubscribed: state === 'subscribed',
    /** Request permission and subscribe to push */
    subscribe,
    /** Unsubscribe from push */
    unsubscribe,
  };
}

/** Convert a base64url-encoded string to Uint8Array (for applicationServerKey) */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
