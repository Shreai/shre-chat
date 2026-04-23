import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Gate login
  console.log('Step 1: Gate login');
  await page.goto('https://shre.nirtek.net', { waitUntil: 'networkidle', timeout: 30000 });
  if (await page.locator('input[name="username"]').count() > 0) {
    await page.fill('input[name="username"]', 'rapidnir');
    await page.fill('input[name="password"]', 'rapid@nir');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('  Gate: OK');
  }

  // Chat login
  await page.waitForTimeout(2000);
  if (await page.locator('input[name="username"], input#username').count() > 0) {
    console.log('Step 2: Chat login');
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    
    // Check for error
    const errorText = await page.locator('[class*="error" i]').first().innerText().catch(() => '');
    if (errorText && errorText.includes('Too many')) {
      console.log('  ERROR:', errorText);
      await page.screenshot({ path: '/tmp/shre-login-error.png' });
      await browser.close();
      return;
    }
    console.log('  Chat: OK');
  }

  await page.screenshot({ path: '/tmp/shre-loggedin.png', fullPage: true });

  // Click New chat
  await page.waitForTimeout(1000);
  const newChat = page.locator('button:has-text("New chat"), :text("New chat")').first();
  if (await newChat.count() > 0) {
    await newChat.click();
    await page.waitForTimeout(1500);
  }

  // Send message
  console.log('Step 3: Sending message');
  const chatInput = page.locator('textarea').first();
  if (await chatInput.count() > 0) {
    await chatInput.click();
    await chatInput.fill('what are my partyliquor sales today');

    // Click send
    const sendBtn = page.locator('button[class*="send" i], button[aria-label*="send" i]').first();
    if (await sendBtn.count() > 0) await sendBtn.click();
    else await chatInput.press('Enter');
    
    console.log('  Sent. Waiting for response...');

    // Wait up to 2 minutes for response
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      const thinking = await page.locator(':text("Thinking")').count();
      const connecting = await page.locator(':text("Connecting")').count();
      const running = await page.locator(':text("Running")').count();
      
      if (i > 2 && thinking === 0 && connecting === 0 && running === 0) {
        console.log(`  Response ready at ${(i+1)*5}s`);
        break;
      }
      if (i % 3 === 0) console.log(`  Processing... ${(i+1)*5}s`);
    }

    await page.screenshot({ path: '/tmp/shre-response-final.png', fullPage: true });
    console.log('  Screenshot: /tmp/shre-response-final.png');
  }

  await browser.close();
  console.log('Done.');
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
