/**
 * useAppList — dynamic app list from shre-skills with fallback to static list.
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchAvailableApps, type RouterApp } from '../router-client';
import { isDevSafeMode } from '../env';

const FALLBACK_APPS = [
  { id: 'aros', name: 'AROS', description: 'RapidRMS POS intelligence' },
  { id: 'centrix', name: 'Centrix', description: 'ERP & back office' },
  { id: 'storepulse', name: 'StorePulse', description: 'Analytics dashboard' },
  { id: 'rapidrms', name: 'RapidRMS', description: 'POS data & operations' },
  { id: 'verifone', name: 'Verifone', description: 'Payment terminal support' },
];

export interface AppOption {
  id: string;
  label: string;
  subtitle: string;
  icon?: string;
  category?: string;
  activated: boolean;
  skillCount: number;
  assignedAgents?: string[];
}

export function useAppList() {
  const devSafeMode = isDevSafeMode();
  const [dynamicApps, setDynamicApps] = useState<RouterApp[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (devSafeMode) {
      setLoaded(true);
      return;
    }
    fetchAvailableApps().then((apps) => {
      if (apps.length > 0) setDynamicApps(apps);
      setLoaded(true);
    });
  }, [devSafeMode]);

  const appOptions: AppOption[] = useMemo(() => {
    if (dynamicApps.length > 0) {
      return dynamicApps.map((a) => ({
        id: a.id,
        label: a.name,
        subtitle: a.description || a.category || '',
        icon: a.icon,
        category: a.category,
        activated: a.activated,
        skillCount: a.skillCount,
        assignedAgents: a.assignedAgents,
      }));
    }
    return FALLBACK_APPS.map((a) => ({
      id: a.id,
      label: a.name,
      subtitle: a.description,
      activated: true,
      skillCount: 0,
    }));
  }, [dynamicApps]);

  return { appOptions, loaded };
}
