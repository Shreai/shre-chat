/**
 * useDevicePermissions — Unified device permission manager for iOS/Android/Web.
 *
 * Manages: microphone, camera, notifications, location, clipboard.
 * Follows mobile-native patterns:
 * - Pre-check permission state before requesting
 * - Show contextual explanation before system prompt
 * - Remember denial to avoid re-prompting
 * - Guide user to Settings when permanently denied
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type PermissionName =
  | 'microphone'
  | 'camera'
  | 'notifications'
  | 'location'
  | 'clipboard-read';
export type PermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

interface PermissionEntry {
  status: PermissionStatus;
  lastChecked: number;
  deniedCount: number;
}

type PermissionsMap = Record<PermissionName, PermissionEntry>;

const STORAGE_KEY = 'shre-device-permissions';
const CHECK_INTERVAL_MS = 300_000; // Re-check every 5 min

const DEFAULT_ENTRY: PermissionEntry = {
  status: 'unknown',
  lastChecked: 0,
  deniedCount: 0,
};

/** Messages to show users explaining WHY we need the permission */
export const PERMISSION_RATIONALE: Record<PermissionName, string> = {
  microphone: 'Shre needs your microphone to hear your voice commands and transcribe speech.',
  camera: 'Camera access enables scanning documents and QR codes.',
  notifications: 'Notifications keep you updated on task completions and agent activity.',
  location: 'Location helps Shre provide store-specific data and local context.',
  'clipboard-read': 'Clipboard access lets Shre read copied text for faster input.',
};

/** Friendly names for UI */
export const PERMISSION_LABELS: Record<PermissionName, string> = {
  microphone: 'Microphone',
  camera: 'Camera',
  notifications: 'Notifications',
  location: 'Location',
  'clipboard-read': 'Clipboard',
};

/** Icons as SVG paths (24x24 viewBox) */
export const PERMISSION_ICONS: Record<PermissionName, string> = {
  microphone:
    'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  camera:
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  notifications: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  location: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'clipboard-read':
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
};

function loadPersistedPermissions(): Partial<PermissionsMap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistPermissions(perms: PermissionsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
  } catch {
    /* quota */
  }
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isMobile(): boolean {
  return isIOS() || isAndroid();
}

/** Check if a specific API is available */
function isAPISupported(name: PermissionName): boolean {
  switch (name) {
    case 'microphone':
      return !!navigator.mediaDevices?.getUserMedia;
    case 'camera':
      return !!navigator.mediaDevices?.getUserMedia;
    case 'notifications':
      return 'Notification' in window;
    case 'location':
      return 'geolocation' in navigator;
    case 'clipboard-read':
      return !!navigator.clipboard?.readText;
    default:
      return false;
  }
}

/** Query current browser permission state without triggering a prompt */
async function queryPermission(name: PermissionName): Promise<PermissionStatus> {
  if (!isAPISupported(name)) return 'unsupported';

  // Notifications have their own API
  if (name === 'notifications') {
    const perm = Notification.permission;
    if (perm === 'granted') return 'granted';
    if (perm === 'denied') return 'denied';
    return 'prompt';
  }

  // Try the Permissions API (not all browsers support all names)
  try {
    const permName = name === 'clipboard-read' ? 'clipboard-read' : name;
    const result = await navigator.permissions.query({ name: permName as any });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    // Permissions API not available for this type — report as prompt (unknown)
    return 'prompt';
  }
}

export function useDevicePermissions() {
  const [permissions, setPermissions] = useState<PermissionsMap>(() => {
    const persisted = loadPersistedPermissions();
    return {
      microphone: persisted.microphone ?? { ...DEFAULT_ENTRY },
      camera: persisted.camera ?? { ...DEFAULT_ENTRY },
      notifications: persisted.notifications ?? { ...DEFAULT_ENTRY },
      location: persisted.location ?? { ...DEFAULT_ENTRY },
      'clipboard-read': persisted['clipboard-read'] ?? { ...DEFAULT_ENTRY },
    };
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Check all permissions on mount
  useEffect(() => {
    const checkAll = async () => {
      const names: PermissionName[] = [
        'microphone',
        'camera',
        'notifications',
        'location',
        'clipboard-read',
      ];
      const updates: Partial<PermissionsMap> = {};

      for (const name of names) {
        const status = await queryPermission(name);
        updates[name] = {
          status,
          lastChecked: Date.now(),
          deniedCount: permissions[name]?.deniedCount ?? 0,
        };
      }

      if (mountedRef.current) {
        setPermissions((prev) => {
          const next = { ...prev, ...updates } as PermissionsMap;
          persistPermissions(next);
          return next;
        });
      }
    };

    checkAll();
    const interval = setInterval(checkAll, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Request a specific permission. Returns true if granted. */
  const requestPermission = useCallback(async (name: PermissionName): Promise<boolean> => {
    if (!isAPISupported(name)) {
      setPermissions((prev) => {
        const next = {
          ...prev,
          [name]: { ...prev[name], status: 'unsupported' as const, lastChecked: Date.now() },
        };
        persistPermissions(next);
        return next;
      });
      return false;
    }

    try {
      let granted = false;

      switch (name) {
        case 'microphone': {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop()); // release immediately
          granted = true;
          break;
        }
        case 'camera': {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach((t) => t.stop());
          granted = true;
          break;
        }
        case 'notifications': {
          const result = await Notification.requestPermission();
          granted = result === 'granted';
          break;
        }
        case 'location': {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(),
              (err) => reject(err),
              { timeout: 10000 },
            );
          });
          granted = true;
          break;
        }
        case 'clipboard-read': {
          await navigator.clipboard.readText();
          granted = true;
          break;
        }
      }

      setPermissions((prev) => {
        const entry: PermissionEntry = {
          status: granted ? 'granted' : 'denied',
          lastChecked: Date.now(),
          deniedCount: granted ? 0 : (prev[name]?.deniedCount ?? 0) + 1,
        };
        const next = { ...prev, [name]: entry };
        persistPermissions(next);
        return next;
      });

      return granted;
    } catch (err: any) {
      const isDenied = err?.name === 'NotAllowedError' || err?.code === 1;

      setPermissions((prev) => {
        const entry: PermissionEntry = {
          status: isDenied ? 'denied' : 'prompt',
          lastChecked: Date.now(),
          deniedCount: isDenied
            ? (prev[name]?.deniedCount ?? 0) + 1
            : (prev[name]?.deniedCount ?? 0),
        };
        const next = { ...prev, [name]: entry };
        persistPermissions(next);
        return next;
      });

      return false;
    }
  }, []);

  /** Get the status of a specific permission */
  const getStatus = useCallback(
    (name: PermissionName): PermissionStatus => {
      return permissions[name]?.status ?? 'unknown';
    },
    [permissions],
  );

  /** Check if permission is permanently denied (denied 2+ times) */
  const isPermanentlyDenied = useCallback(
    (name: PermissionName): boolean => {
      const entry = permissions[name];
      return entry?.status === 'denied' && (entry?.deniedCount ?? 0) >= 2;
    },
    [permissions],
  );

  /** Get instructions for enabling in device settings */
  const getSettingsInstructions = useCallback((name: PermissionName): string => {
    const label = PERMISSION_LABELS[name];
    if (isIOS()) {
      return `Open Settings → Safari → scroll to ${label} → Allow. Or Settings → Privacy & Security → ${label} and enable for this site.`;
    }
    if (isAndroid()) {
      return `Tap the lock icon in the address bar → Permissions → ${label} → Allow. Or go to Settings → Apps → Browser → Permissions.`;
    }
    return `Click the lock/info icon in the address bar → Site settings → ${label} → Allow.`;
  }, []);

  return {
    permissions,
    requestPermission,
    getStatus,
    isPermanentlyDenied,
    getSettingsInstructions,
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isMobile: isMobile(),
  };
}
