/**
 * useToolList — dynamic tool list from shre-router /v1/tools/available.
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchAvailableTools, type RouterTool } from '../router-client';

export interface ToolOption {
  name: string;
  description: string;
  category: 'system' | 'app';
}

export function useToolList() {
  const [tools, setTools] = useState<RouterTool[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchAvailableTools().then((t) => {
      if (t.length > 0) setTools(t);
      setLoaded(true);
    });
  }, []);

  const toolOptions: ToolOption[] = useMemo(
    () =>
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
      })),
    [tools],
  );

  const systemCount = useMemo(() => tools.filter((t) => t.category === 'system').length, [tools]);
  const appCount = useMemo(() => tools.filter((t) => t.category === 'app').length, [tools]);

  return { toolOptions, systemCount, appCount, loaded };
}
