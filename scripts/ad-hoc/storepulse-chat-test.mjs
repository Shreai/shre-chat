import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8899';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  console.log('--- Step 1: Login ---');
  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email: 'rapidnir', password: 'rapid@nir' },
  });
  const loginData = await loginRes.json();
  console.log(`  Login API: ok=${loginData.ok}`);

  await page.goto(`${BASE}/storepulse/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log(`  URL: ${page.url()}`);

  const hasWidget = await page.$('#rms-ai');
  if (!hasWidget) {
    console.log('  NOT on dashboard — screenshot:');
    await page.screenshot({ path: '/tmp/storepulse-login-fail.png' });
    await browser.close();
    return;
  }

  console.log('\n--- Step 2: Floating widget layout (closed) ---');
  const fab = await page.$('.rcw-fab');
  console.log(`  FAB exists: ${!!fab}`);
  if (fab) {
    const box = await fab.boundingBox();
    console.log(`  FAB pos: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${box.width} h=${box.height}`);
  }

  const panel = await page.$('.rcw-panel');
  if (panel) {
    const closed = await panel.evaluate(el => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, pointerEvents: cs.pointerEvents };
    });
    console.log(`  Panel (closed): transform=${closed.transform} pointerEvents=${closed.pointerEvents}`);
  }

  console.log('\n--- Step 3: Open widget ---');
  await fab.click();
  await page.waitForTimeout(500);

  const panelOpen = await page.$('.rcw-panel.open');
  console.log(`  Panel .open: ${!!panelOpen}`);

  if (panelOpen) {
    const layout = await panelOpen.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        rightGap: Math.round(window.innerWidth - rect.right),
        bottom: Math.round(window.innerHeight - rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        winW: window.innerWidth,
        winH: window.innerHeight,
      };
    });
    console.log(`  Rect: top=${layout.top} rightGap=${layout.rightGap} bottom=${layout.bottom} w=${layout.width} h=${layout.height}`);
    console.log(`  Window: ${layout.winW}x${layout.winH}`);
    console.log(`  ✓ Right-edge anchored: ${layout.rightGap <= 1 ? 'YES' : 'NO'}`);
    console.log(`  ✓ Full height: ${layout.top === 0 && layout.bottom === 0 ? 'YES' : 'NO'}`);
    console.log(`  ✓ Slides from right: ${layout.rightGap <= 1 && layout.top === 0 ? 'YES' : 'NO'}`);

    const title = await page.$eval('.rcw-hdr-title', el => el.textContent).catch(() => '?');
    const avatar = await page.$eval('.rcw-hdr-avatar', el => el.textContent.trim()).catch(() => '?');
    console.log(`\n  Branding: title="${title}" avatar="${avatar}"`);

    const chips = await page.$$('.rcw-chip');
    console.log(`  Quick chips: ${chips.length}`);

    await page.screenshot({ path: '/tmp/storepulse-chat-open.png' });
    console.log('  Screenshot: /tmp/storepulse-chat-open.png');
  }

  console.log('\n--- Step 4: Sidebar nav ---');
  const navText = await page.$$eval('nav *', els =>
    els.map(el => el.textContent?.trim()).filter(t => t && (t.includes('Ellie') || t.includes('AI Chat')))
  );
  console.log(`  Ellie in sidebar: ${navText.length > 0 ? 'YES' : 'NO'} ${JSON.stringify(navText.slice(0, 3))}`);

  await browser.close();
  console.log('\n--- DONE ---');
}

run().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
