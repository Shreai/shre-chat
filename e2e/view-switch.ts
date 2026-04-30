import type { Page } from '@playwright/test';

export async function switchView(page: Page, view: string) {
  await page.evaluate((nextView) => {
    const bridge = (window as Window & { __shreSwitchView?: (v: string) => void })
      .__shreSwitchView;
    if (bridge) {
      bridge(nextView);
      return;
    }
    window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: nextView }));
  }, view);
}
