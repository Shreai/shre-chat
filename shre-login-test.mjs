import { chromium } from 'playwright';

const GATE_URL = 'https://shre.nirtek.net';
const USERNAME = 'rapidnir';
const PASSWORD = 'rapid@nir';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log('=== STEP 1: Gate login ===');
  await page.goto(GATE_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const hasGateForm = await page.locator('input[name="username"]').count() > 0;
  if (hasGateForm) {
    await page.fill('input[name="username"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('Gate login done, URL:', page.url());
  }

  // STEP 2: Shre-chat login
  await page.waitForTimeout(2000);
  console.log('\n=== STEP 2: Shre-chat login ===');

  const hasChatLogin = await page.locator('input[name="username"], input#username').count() > 0;
  if (hasChatLogin) {
    await page.locator('input[name="username"], input#username').first().fill(USERNAME);
    await page.locator('input[name="password"], input#password, input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    console.log('Chat login done, URL:', page.url());
    
    const errorEl = page.locator('[class*="error" i]').first();
    if (await errorEl.count() > 0) {
      const et = await errorEl.innerText().catch(() => '');
      if (et && et.length > 2) console.log('LOGIN ERROR:', et);
    }
  }
  
  await page.screenshot({ path: '/tmp/shre-after-login.png', fullPage: true });

  // STEP 3: Start new chat and send message
  await page.waitForTimeout(2000);
  console.log('\n=== STEP 3: Send message ===');

  // Click New chat
  const newChat = page.locator('button:has-text("New chat"), :text("New chat")').first();
  if (await newChat.count() > 0) {
    await newChat.click();
    await page.waitForTimeout(1000);
    console.log('New chat clicked');
  }

  const chatInput = page.locator('textarea').first();
  if (await chatInput.count() > 0) {
    await chatInput.click();
    await chatInput.fill('what are my partyliquor sales today');
    await page.screenshot({ path: '/tmp/shre-typed.png', fullPage: true });

    // Click the send button (paper plane icon)
    const sendBtn = page.locator('button[class*="send" i], button[aria-label*="send" i]').first();
    if (await sendBtn.count() > 0) {
      await sendBtn.click();
      console.log('Clicked send button');
    } else {
      // Press Enter
      await chatInput.press('Enter');
      console.log('Pressed Enter');
    }

    console.log('Message sent, waiting for response...');
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      const text = await page.locator('body').innerText();
      if (text.toLowerCase().includes('party liquor') || text.includes('$') || text.includes('sale')) {
        console.log(`Response detected at ${(i+1)*5}s`);
        break;
      }
      console.log(`Waiting... ${(i+1)*5}s`);
    }
    await page.screenshot({ path: '/tmp/shre-response.png', fullPage: true });
    console.log('Screenshot: /tmp/shre-response.png');
  } else {
    console.log('No textarea found');
    await page.screenshot({ path: '/tmp/shre-no-input.png', fullPage: true });
  }

  await browser.close();
  console.log('\nDone.');
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
