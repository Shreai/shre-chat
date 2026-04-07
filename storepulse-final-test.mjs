import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8899';
async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/auth/login`, { data: { email: 'rapidnir', password: 'rapid@nir' } });
  await page.goto(`${BASE}/storepulse/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== StorePulse Chat Validation ===\n');

  // 1. Sidebar label
  const navLabels = await page.$$eval('.nav-label', els => els.map(e => e.textContent));
  const hasEllie = navLabels.includes('Ellie');
  console.log(`1. Sidebar nav label "Ellie": ${hasEllie ? 'PASS' : 'FAIL — found: ' + navLabels.filter(l => l.includes('Chat') || l.includes('Ellie'))}`);

  // 2. FAB button
  const fab = await page.$('.rcw-fab');
  console.log(`2. FAB button exists: ${fab ? 'PASS' : 'FAIL'}`);

  // 3. Open widget
  if (fab) await fab.click();
  await page.waitForTimeout(500);
  const panelOpen = await page.$('.rcw-panel.open');
  console.log(`3. Panel opens on click: ${panelOpen ? 'PASS' : 'FAIL'}`);

  if (panelOpen) {
    // 4. Slide from right
    const layout = await panelOpen.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, rightGap: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, w: r.width, h: r.height };
    });
    const slidesRight = layout.rightGap <= 1 && layout.top === 0 && layout.bottom === 0;
    console.log(`4. Slides from right (full height): ${slidesRight ? 'PASS' : 'FAIL'} — top=${layout.top} rightGap=${layout.rightGap} bottom=${Math.round(layout.bottom)} w=${layout.w} h=${layout.h}`);

    // 5. Branding
    const title = await page.$eval('.rcw-hdr-title', el => el.textContent).catch(() => '?');
    const avatar = await page.$eval('.rcw-hdr-avatar', el => el.textContent.trim()).catch(() => '?');
    console.log(`5. Header: title="${title}" avatar="${avatar}" — ${title === 'Ellie' && avatar === 'E' ? 'PASS' : 'FAIL'}`);

    // 6. Quick chips
    const chips = await page.$$('.rcw-chip');
    console.log(`6. Quick action chips: ${chips.length} — ${chips.length >= 4 ? 'PASS' : 'FAIL'}`);

    // 7. Context bar  
    const ctxText = await page.$eval('#rcw-ctx', el => el.textContent.trim()).catch(() => '');
    console.log(`7. Context bar: "${ctxText.substring(0, 60)}..." — ${ctxText.length > 5 ? 'PASS' : 'FAIL'}`);

    // 8. Input placeholder
    const placeholder = await page.$eval('#rcw-in', el => el.placeholder).catch(() => '?');
    console.log(`8. Input placeholder: "${placeholder}"`);
    
    // 9. Footer
    const footer = await page.$eval('.rcw-foot', el => el.textContent).catch(() => '?');
    console.log(`9. Footer: "${footer}"`);
  }

  await page.screenshot({ path: '/tmp/storepulse-final.png' });
  console.log('\nScreenshot: /tmp/storepulse-final.png');

  await browser.close();
  console.log('\n=== Done ===');
}
run().catch(err => console.error('FAILED:', err.message));
