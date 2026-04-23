import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Skip gate, go directly to local shre-chat
  console.log('1. Direct login to localhost:5510');
  await page.goto('http://127.0.0.1:5510', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  await page.waitForTimeout(2000);
  const hasChatLogin = await page.locator('input[name="username"], input#username').count() > 0;
  if (hasChatLogin) {
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    const err = await page.locator('[class*="error" i]').first().innerText().catch(() => '');
    if (err && err.length > 3) { console.log('   ERROR:', err); await page.screenshot({ path: '/tmp/shre-local-err.png' }); await browser.close(); return; }
    console.log('   OK');
  } else {
    console.log('   Session active');
  }

  await page.waitForTimeout(2000);
  
  // New chat
  const newChat = page.locator('button:has-text("New chat"), :text("New chat")').first();
  if (await newChat.count() > 0) { await newChat.click(); await page.waitForTimeout(1500); }

  console.log('2. Sending message');
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
      if (i % 3 === 0) console.log(`   ${(i+1)*5}s (thinking=${thinking} running=${running})`);
    }
    await page.screenshot({ path: '/tmp/shre-local-result.png', fullPage: true });
    console.log('   Screenshot: /tmp/shre-local-result.png');
  } else {
    console.log('   No textarea');
    await page.screenshot({ path: '/tmp/shre-local-notext.png', fullPage: true });
  }

  await browser.close();
  console.log('Done.');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
