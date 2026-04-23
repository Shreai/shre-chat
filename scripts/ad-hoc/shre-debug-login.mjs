import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Log ALL network requests
  page.on('request', req => {
    if (req.url().includes('auth')) console.log(`>> ${req.method()} ${req.url()}`);
  });
  page.on('response', resp => {
    if (resp.url().includes('auth')) console.log(`<< ${resp.status()} ${resp.url()}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('auth') || msg.text().includes('login'))
      console.log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // Go through the gate
  console.log('=== Navigate ===');
  await page.goto('https://shre.nirtek.net', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());

  // Gate login if needed
  if (await page.locator('input[name="username"]').count() > 0) {
    const isGate = page.url().includes('__gate') || await page.locator('form[action*="__gate"]').count() > 0;
    console.log('Gate login form:', isGate);
    if (isGate || await page.locator('h1:has-text("Sign in to Nirtek")').count() > 0) {
      await page.fill('input[name="username"]', 'rapidnir');
      await page.fill('input[name="password"]', 'rapid@nir');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      console.log('After gate URL:', page.url());
    }
  }

  // Wait for chat page to stabilize
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/shre-debug-1.png', fullPage: true });
  
  // Check what we see
  const hasLoginForm = await page.locator('input[name="username"], input#username').count() > 0;
  console.log('Has login form:', hasLoginForm);

  if (hasLoginForm) {
    console.log('=== Chat Login ===');
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.screenshot({ path: '/tmp/shre-debug-2.png', fullPage: true });
    await page.locator('button[type="submit"]').first().click();

    // Watch what happens for 15 seconds
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2500);
      const loading = await page.locator(':text("Signing"), :text("Loading")').count();
      const error = await page.locator('[class*="error" i]').first().innerText().catch(() => '');
      const hasChat = await page.locator('textarea').count() > 0;
      console.log(`  ${(i+1)*2.5}s: loading=${loading} error="${error}" hasChat=${hasChat}`);
      
      if (error && error.length > 3) break;
      if (hasChat) { console.log('  Chat loaded!'); break; }
    }
    await page.screenshot({ path: '/tmp/shre-debug-3.png', fullPage: true });
  }

  await browser.close();
  console.log('Done.');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
