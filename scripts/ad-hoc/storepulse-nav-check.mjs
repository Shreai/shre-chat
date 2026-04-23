import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8899';
async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/auth/login`, { data: { email: 'rapidnir', password: 'rapid@nir' } });
  await page.goto(`${BASE}/storepulse/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Get all sidebar nav labels
  const labels = await page.$$eval('nav span', els => els.map(el => el.textContent?.trim()).filter(Boolean));
  console.log('Sidebar labels:', labels.filter(l => l.length > 1 && l.length < 30));
  
  await page.screenshot({ path: '/tmp/storepulse-sidebar.png' });
  await browser.close();
}
run().catch(err => console.error(err.message));
