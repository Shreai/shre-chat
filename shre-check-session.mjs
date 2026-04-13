import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Gate login
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

  await page.waitForTimeout(3000);

  // Click on the 7:35 session (the one with our message)
  const sessions = await page.locator('.sidebar-item, [class*="session"], [class*="Session"]').all();
  console.log(`Found ${sessions.length} sidebar items`);

  // Click the session that mentions "Routing" or "partyliquor"
  const routingSession = page.locator(':text("Routing via shre-router")').first();
  if (await routingSession.count() > 0) {
    await routingSession.click();
    await page.waitForTimeout(3000);
    console.log('Clicked routing session');
  }

  await page.screenshot({ path: '/tmp/shre-session.png', fullPage: true });

  // Get all visible text in the chat area
  const chatArea = page.locator('main, [class*="chat"], [class*="messages"]').first();
  if (await chatArea.count() > 0) {
    const text = await chatArea.innerText();
    console.log('\n=== Chat content ===');
    console.log(text.substring(0, 2000));
  }

  await browser.close();
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
