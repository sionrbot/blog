import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('article UI switches both ways while original content and anchors survive', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/blog/original-english/#original-section');
  await expect(browser.locator('article time')).toHaveText('January 12, 2025');
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-english/#original-section');
  await expect(browser.locator('article time')).toHaveText('2025年1月12日');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(screen.getByRole('heading', 'An English original', { level: 1 })).toBeVisible();
  await expect(browser.locator('[data-post-content]')).toContainText(
    'This English paragraph stays unchanged.',
  );
  await expect(browser.locator('[data-post-content]')).toHaveAttribute('lang', 'en');
  await expect(browser.locator('[data-post-content] a')).toHaveAttribute('href', '/about/');
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/original-english/#original-section');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await app.open('/blog/original-chinese/');
  await expect(browser.locator('[data-post-content]')).toContainText('这段中文正文保持不变。');
  await expect(browser.locator('[data-post-content]')).toHaveAttribute('lang', 'zh-Hans');
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-chinese/');
  await expect(screen.getByRole('heading', '一篇中文原文', { level: 1 })).toBeVisible();
  await expect(browser.locator('[data-post-content]')).toContainText('const message = "中文原文";');
});

test('Chinese navigation, tag and pagination retain language and page identity', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/zh/blog/');
  await screen.getByRole('link', 'An English original', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-english/');
  await screen.getByRole('article').getByRole('link', '#shared', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/tag/shared/');
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await browser.reload();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await browser.locator('header a[href="/zh/blog/"]').tap();
  await browser.locator('a[href="/zh/blog/2/"]').tap();
  await expect(browser).toHaveURL('/zh/blog/2/');
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/2/');
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await browser.reload();
  await expect(browser).toHaveURL('/zh/blog/2/');
  await expect(screen.getByRole('link', 'Older article 1', { exact: true })).toBeVisible();
});

test('URL overrides browser language and stored preferences on direct visits and refresh', async ({
  app,
  browser,
}) => {
  await browser.addInitScript(() => {
    if (localStorage.getItem('locale')) return;
    localStorage.setItem('locale', 'zh-Hans');
    localStorage.setItem('language', 'zh-Hans');
    document.cookie = 'locale=zh-Hans; path=/';
  });
  await app.open('/blog/');
  await expect(browser).toHaveURL('/blog/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await browser.reload();
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await browser.evaluate(() => {
    localStorage.setItem('locale', 'en');
    localStorage.setItem('language', 'en');
    document.cookie = 'locale=en; path=/';
    return null;
  });
  await app.open('/zh/blog/');
  await expect(browser).toHaveURL('/zh/blog/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'zh-Hans');
});

test('static language navigation works when all page scripts are blocked', async ({
  app,
  browser,
  screen,
}) => {
  // e2e 0.22 has no javaScriptEnabled context option. CSP blocks inline/module/external
  // scripts in every document while keeping the runner's browser instrumentation available.
  await browser.route('**/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      status: response.status,
      headers: { ...response.headers, 'content-security-policy': "script-src 'none'" },
      body: await response.text(),
    });
  });
  await app.open('/blog/original-english/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-english/');
  await expect(browser.locator('[data-post-content]')).toContainText(
    'This English paragraph stays unchanged.',
  );
  await browser.locator('header a[href="/zh/blog/"]').tap();
  await expect(browser).toHaveURL('/zh/blog/');
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/');
});

test('language links have visible keyboard focus and both UIs fit 360px', async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 360, height: 800 });
  await app.open('/blog/');
  const macWebKit = await browser.evaluate(
    () => /Macintosh/.test(navigator.userAgent) && /Version\/.*Safari\//.test(navigator.userAgent),
  );
  const tab = macWebKit ? 'Alt+Tab' : 'Tab';
  for (let step = 0; step < 12; step++) {
    await browser.keyboard.press(tab);
    if (
      await browser.evaluate(() => document.activeElement?.getAttribute('hreflang') === 'zh-Hans')
    )
      break;
  }
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toBeFocused();
  expect(
    await browser.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    }),
  ).toBe(true);
  await browser.keyboard.press('Enter');
  await expect(browser).toHaveURL('/zh/blog/');
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const route of ['/', '/blog/', '/about/', '/contact/', '/blog/original-chinese/']) {
    for (const prefix of ['', '/zh']) {
      await app.open(`${prefix}${route}`);
      await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
      const size = await browser.evaluate(async () => {
        await document.fonts.ready;
        return { width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      expect(size.viewport).toBe(360);
      expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
    }
  }
});
