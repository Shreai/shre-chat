import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Login through gate
  await page.goto('https://shre.nirtek.net', { waitUntil: 'networkidle', timeout: 30000 });
  if (await page.locator('input[name="username"]').count() > 0) {
    await page.fill('input[name="username"]', 'rapidnir');
    await page.fill('input[name="password"]', 'rapid@nir');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  // Chat login
  await page.waitForTimeout(2000);
  if (await page.locator('input[name="username"], input#username').count() > 0) {
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
  }

  // Wait for chat to load, then check the most recent session for response
  await page.waitForTimeout(3000);

  // The previous message might still be streaming - wait for it to finish
  console.log('Checking for response to partyliquor sales question...');
  
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000);
    
    // Check if still thinking
    const thinking = await page.locator(':text("Thinking")').count();
    const connecting = await page.locator(':text("Connecting")').count();
    
    if (thinking === 0 && connecting === 0 && i > 0) {
      console.log(`Response complete at ${(i+1)*5}s`);
      break;
    }
    console.log(`Still processing... ${(i+1)*5}s (thinking=${thinking}, connecting=${connecting})`);
  }

  await page.screenshot({ path: '/tmp/shre-final-response.png', fullPage: true });
  console.log('Final screenshot saved');

  await browser.close();
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
