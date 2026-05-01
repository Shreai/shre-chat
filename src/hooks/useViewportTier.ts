import { useEffect, useState } from 'react';

export type ViewportTier =
  | 'trifold-phone'
  | 'bifold-phone'
  | 'phone'
  | 'mini-tablet'
  | 'tablet'
  | 'desktop';

function classifyViewport(width: number, height: number): ViewportTier {
  const shortest = Math.min(width, height);
  if (width < 360 || shortest < 600) return 'trifold-phone';
  if (width < 412 || shortest < 700) return 'bifold-phone';
  if (width < 480 || shortest < 780) return 'phone';
  if (width < 768) return 'mini-tablet';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function readViewportTier(): ViewportTier {
  if (typeof window === 'undefined') return 'desktop';
  return classifyViewport(window.innerWidth, window.innerHeight);
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(() => readViewportTier());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setTier(classifyViewport(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
    };
  }, []);

  return tier;
}
