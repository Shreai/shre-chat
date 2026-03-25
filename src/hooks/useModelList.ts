/**
 * useModelList — dynamic model list from shre-router with fallback to static models.
 */
import { useState, useMemo } from "react";
import type { RouterModel } from "../openclaw";
import { providerIcon, providerLabel, FALLBACK_MODELS } from "../chat-utils";

export function useModelList() {
  const [dynamicModels, setDynamicModels] = useState<RouterModel[]>([]);
  const [routerUp, setRouterUp] = useState<boolean | null>(null);

  const AVAILABLE_MODELS = useMemo(() => {
    if (dynamicModels.length === 0) return FALLBACK_MODELS;
    return dynamicModels.map((m) => ({
      id: m.id,
      name: m.name,
      provider: providerLabel(m.provider),
      icon: providerIcon(m.provider),
      connected: m.connected,
    }));
  }, [dynamicModels]);

  const MODEL_CONTEXT_LIMITS = useMemo(() => {
    const limits: Record<string, number> = {};
    for (const m of dynamicModels) {
      if (m.contextWindow) limits[m.id] = m.contextWindow;
    }
    return limits;
  }, [dynamicModels]);

  return {
    dynamicModels, setDynamicModels,
    routerUp, setRouterUp,
    AVAILABLE_MODELS, MODEL_CONTEXT_LIMITS,
  };
}
