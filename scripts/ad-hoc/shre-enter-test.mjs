import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Login directly
  await page.goto('http://127.0.0.1:5510', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  if (await page.locator('input[name="username"], input#username').count() > 0) {
    await page.locator('input[name="username"], input#username').first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
  }

  // New chat
  await page.waitForTimeout(2000);
  const newChat = page.locator('button:has-text("New chat")').first();
  if (await newChat.count() > 0) { await newChat.click(); await page.waitForTimeout(1500); }

  // Type message and press Enter
  const chatInput = page.locator('textarea').first();
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  await chatInput.click();
  await chatInput.fill('hello, are you there?');
  await page.screenshot({ path: '/tmp/shre-enter-before.png', fullPage: true });
  
  console.log('Pressing Enter...');
  await chatInput.press('Enter');
  await page.waitForTimeout(3000);
  
  // Check if message appeared in chat
  const pageText = await page.locator('main').innerText().catch(() => '');
  const messageSent = pageText.includes('hello, are you there');
  console.log('Message visible in chat:', messageSent);
  
  // Check if textarea was cleared (= message was sent)
  const inputVal = await chatInput.inputValue();
  console.log('Textarea content after Enter:', JSON.stringify(inputVal));
  
  await page.screenshot({ path: '/tmp/shre-enter-after.png', fullPage: true });
  
  await browser.close();
  console.log('Done.');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
