import { test, expect } from '@playwright/test';

test.describe('Preview — rendering & file type support', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    // Auth handled by setup project — storageState loaded automatically
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea', { timeout: 30_000 });

    // Clean library state
    await page.evaluate(() => {
      localStorage.removeItem('shre-preview-library');
      sessionStorage.removeItem('shre-preview-html');
    });
  });

  // ── Helper: inject a preview and switch to preview view ──
  async function injectPreview(
    page: import('@playwright/test').Page,
    content: string,
    title: string,
    type: string,
  ) {
    await page.evaluate(
      ({ content, title, type }) => {
        const entry = { id: `test_${Date.now()}`, title, html: content, savedAt: Date.now(), type };
        sessionStorage.setItem('shre-preview-html', JSON.stringify(entry));
        const lib = JSON.parse(localStorage.getItem('shre-preview-library') || '[]');
        lib.unshift(entry);
        localStorage.setItem('shre-preview-library', JSON.stringify(lib.slice(0, 20)));
        window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: 'preview' }));
      },
      { content, title, type },
    );
    await page.waitForTimeout(800);
  }

  // ═══════════ HTML Tests ═══════════

  test('HTML preview renders in iframe', async ({ page }) => {
    const html = `<!DOCTYPE html><html><head><title>Test HTML</title></head><body><h1 id="test-heading">Hello Preview</h1><p>This is a test.</p></body></html>`;
    await injectPreview(page, html, 'Test HTML', 'html');

    // iframe renders content
    const iframe = page.frameLocator('iframe[title="HTML Preview"]');
    await expect(iframe.locator('#test-heading')).toHaveText('Hello Preview');
  });

  test('HTML with CSS styles renders', async ({ page }) => {
    const html = `<!DOCTYPE html><html><head><style>.box{border:2px solid red;padding:10px}</style></head><body><div class="box" id="styled-box">Styled Content</div></body></html>`;
    await injectPreview(page, html, 'Styled HTML', 'html');

    const iframe = page.frameLocator('iframe[title="HTML Preview"]');
    await expect(iframe.locator('#styled-box')).toHaveText('Styled Content');
  });

  // ═══════════ CSV Tests ═══════════

  test('CSV renders as table', async ({ page }) => {
    const csv = `Name,Revenue,Margin\nStore 1,$31200,28.1%\nStore 2,$28900,27.4%\nStore 3,$26100,25.9%`;
    await injectPreview(page, csv, 'stores.csv', 'csv');

    // Table headers
    await expect(page.locator('th', { hasText: 'Name' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Revenue' })).toBeVisible();
    // Row data
    await expect(page.locator('td', { hasText: 'Store 1' })).toBeVisible();
    // Row count
    await expect(page.locator('text=3 rows')).toBeVisible();
  });

  // ═══════════ JSON Tests ═══════════

  test('JSON renders pretty-printed', async ({ page }) => {
    const json = `{"name":"AROS","agents":17,"status":"active"}`;
    await injectPreview(page, json, 'data.json', 'json');

    await expect(page.locator('pre', { hasText: 'AROS' })).toBeVisible();
  });

  // ═══════════ TXT Tests ═══════════

  test('TXT renders as preformatted text', async ({ page }) => {
    const txt = `Service Status Report\n=====================\nshre-router: healthy`;
    await injectPreview(page, txt, 'status.txt', 'txt');

    await expect(page.locator('pre', { hasText: 'Service Status Report' })).toBeVisible();
  });

  // ═══════════ Markdown Tests ═══════════

  test('Markdown renders with headings', async ({ page }) => {
    const md = `# AROS Report\n\n## Summary\n\nThis is **bold** text.`;
    await injectPreview(page, md, 'report.md', 'markdown');

    const iframe = page.frameLocator('iframe[title="Markdown Preview"]');
    await expect(iframe.locator('h1')).toHaveText('AROS Report');
  });

  // ═══════════ UI Interaction Tests ═══════════

  test('Library shows multiple entries', async ({ page }) => {
    await page.evaluate(() => {
      const entries = [
        {
          id: 'test_1',
          title: 'report.html',
          html: '<h1>HTML</h1>',
          savedAt: Date.now(),
          type: 'html',
        },
        {
          id: 'test_2',
          title: 'data.csv',
          html: 'a,b\n1,2',
          savedAt: Date.now() - 1000,
          type: 'csv',
        },
        {
          id: 'test_3',
          title: 'config.json',
          html: '{"key":"val"}',
          savedAt: Date.now() - 2000,
          type: 'json',
        },
      ];
      localStorage.setItem('shre-preview-library', JSON.stringify(entries));
      sessionStorage.setItem('shre-preview-html', JSON.stringify(entries[0]));
      window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: 'preview' }));
    });
    await page.waitForTimeout(800);

    // Use .first() to avoid strict mode on duplicate text (toolbar + sidebar)
    await expect(page.locator('text=report.html').first()).toBeVisible();
    await expect(page.locator('text=data.csv').first()).toBeVisible();
    await expect(page.locator('text=config.json').first()).toBeVisible();
  });

  test('Open in Tab opens new window', async ({ page, context }) => {
    const html = `<!DOCTYPE html><html><body><p id="tab-content">New tab content</p></body></html>`;
    await injectPreview(page, html, 'Tab Test', 'html');

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('button', { hasText: 'Open in Tab' }).click(),
    ]);
    await newPage.waitForLoadState();
    await expect(newPage.locator('#tab-content')).toHaveText('New tab content');
    await newPage.close();
  });

  test('Download triggers file save', async ({ page }) => {
    const csv = `Name,Value\nTest,42`;
    await injectPreview(page, csv, 'export.csv', 'csv');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('export');
  });

  test('Back to Chat returns to chat', async ({ page }) => {
    await injectPreview(page, '<p>test</p>', 'test.html', 'html');

    // Click the back-to-chat button (has arrow icon + "Chat" text)
    await page.locator('button', { hasText: 'Chat' }).first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('#shre-chat-textarea')).toBeVisible();
  });

  test('Clear deselects active preview', async ({ page }) => {
    await injectPreview(page, '<h1>Clear me</h1>', 'clear-test.html', 'html');
    await expect(page.locator('iframe[title="HTML Preview"]')).toBeVisible();

    await page.locator('button', { hasText: 'Clear' }).first().click();
    await page.waitForTimeout(400);

    // iframe gone, empty state shows
    await expect(page.locator('iframe[title="HTML Preview"]')).not.toBeVisible();
  });

  test('CSP includes blob: in frame-src', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const csp = response?.headers()['content-security-policy'] || '';
    expect(csp).toContain('blob:');
  });
});
