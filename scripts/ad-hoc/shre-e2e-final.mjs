import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Gate login
  console.log('1. Gate login');
  await page.goto('https://shre.nirtek.net', { waitUntil: 'networkidle', timeout: 30000 });
  if (await page.locator('input[name="username"]').count() > 0) {
    await page.fill('input[name="username"]', 'rapidnir');
    await page.fill('input[name="password"]', 'rapid@nir');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('   OK');
  }

  // Check for chat login
  await page.waitForTimeout(3000);
  const hasChatLogin = await page.locator('input[name="username"], input#username').count() > 0;
  if (hasChatLogin) {
    console.log('2. Chat login');
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    const err = await page.locator('[class*="error" i]').first().innerText().catch(() => '');
    if (err && err.length > 3) { console.log('   ERROR:', err); await browser.close(); return; }
    console.log('   OK');
  } else {
    console.log('2. No chat login needed (session active)');
  }

  // Wait for chat UI
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/shre-pre-send.png', fullPage: true });

  // New chat
  const newChat = page.locator('button:has-text("New chat"), :text("New chat")').first();
  if (await newChat.count() > 0) { await newChat.click(); await page.waitForTimeout(1500); }

  // Send message
  console.log('3. Sending message');
  const chatInput = page.locator('textarea').first();
  await chatInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  
  if (await chatInput.count() > 0) {
    await chatInput.click();
    await chatInput.fill('what are my partyliquor sales today');
    const sendBtn = page.locator('button[class*="send" i], button[aria-label*="send" i]').first();
    if (await sendBtn.count() > 0) await sendBtn.click();
    else await chatInput.press('Enter');
    console.log('   Sent. Waiting...');

    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      const thinking = await page.locator(':text("Thinking")').count();
      const running = await page.locator(':text("Running")').count();
      if (i > 2 && thinking === 0 && running === 0) { console.log(`   Response at ${(i+1)*5}s`); break; }
      if (i % 3 === 0) console.log(`   Processing... ${(i+1)*5}s`);
    }
    await page.screenshot({ path: '/tmp/shre-e2e-result.png', fullPage: true });
    console.log('   Screenshot: /tmp/shre-e2e-result.png');
  } else {
    console.log('   No textarea found');
    await page.screenshot({ path: '/tmp/shre-no-textarea.png', fullPage: true });
  }

  await browser.close();
  console.log('Done.');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
