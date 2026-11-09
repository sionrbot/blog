import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('article UI switches both ways while original content and anchors survive', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/blog/original-english/#original-section');
  await expect(browser.locator('article time')).toHaveText('January 12, 2025');
  await browser.locator('[data-language-switcher] summary').tap();
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
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/original-english/#original-section');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await app.open('/blog/original-chinese/');
  await expect(browser.locator('[data-post-content]')).toContainText('这段中文正文保持不变。');
  await expect(browser.locator('[data-post-content]')).toHaveAttribute('lang', 'zh-Hans');
  await browser.locator('[data-language-switcher] summary').tap();
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
  await app.open('/zh/articles/');
  await screen.getByRole('link', 'An English original', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-english/');
  await screen.getByRole('article').getByRole('link', '#shared', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/blog/tag/shared/');
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await browser.reload();
  await expect(browser).toHaveURL('/zh/blog/tag/shared/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await browser.locator('header a[href="/zh/articles/"]').tap();
  await browser.locator('a[href="/zh/articles/2/"]').tap();
  await expect(browser).toHaveURL('/zh/articles/2/');
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/articles/2/');
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await browser.reload();
  await expect(browser).toHaveURL('/zh/articles/2/');
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
  await app.open('/articles/');
  await expect(browser).toHaveURL('/articles/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await browser.reload();
  await expect(browser.locator('html')).toHaveAttribute('lang', 'en');
  await browser.evaluate(() => {
    localStorage.setItem('locale', 'en');
    localStorage.setItem('language', 'en');
    document.cookie = 'locale=en; path=/';
    return null;
  });
  await app.open('/zh/articles/');
  await expect(browser).toHaveURL('/zh/articles/');
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
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/blog/original-english/');
  await expect(browser.locator('[data-post-content]')).toContainText(
    'This English paragraph stays unchanged.',
  );
  await browser.locator('header a[href="/zh/articles/"]').tap();
  await expect(browser).toHaveURL('/zh/articles/');
  await browser.locator('[data-language-switcher] summary').tap();
  await screen.getByRole('link', 'English', { exact: true }).tap();
  await expect(browser).toHaveURL('/articles/');
});

test('language links have visible keyboard focus and both UIs fit 360px', async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 360, height: 800 });
  await app.open('/articles/');
  const macWebKit = await browser.evaluate(
    () => /Macintosh/.test(navigator.userAgent) && /Version\/.*Safari\//.test(navigator.userAgent),
  );
  const tab = macWebKit ? 'Alt+Tab' : 'Tab';
  for (let step = 0; step < 12; step++) {
    await browser.keyboard.press(tab);
    if (
      await browser.evaluate(
        () => document.activeElement?.matches('[data-language-switcher] summary') === true,
      )
    )
      break;
  }
  await expect(browser.locator('[data-language-switcher] summary')).toBeFocused();
  await browser.keyboard.press('Enter');
  await expect(screen.getByRole('link', 'English', { exact: true })).toBeVisible();
  await browser.keyboard.press(tab);
  await expect(screen.getByRole('link', 'English', { exact: true })).toBeFocused();
  await browser.keyboard.press(tab);
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toBeFocused();
  expect(
    await browser.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    }),
  ).toBe(true);
  await browser.keyboard.press('Enter');
  await expect(browser).toHaveURL('/zh/articles/');
  await browser.locator('[data-language-switcher] summary').tap();
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const route of ['/', '/articles/', '/about/', '/contact/', '/blog/original-chinese/']) {
    for (const prefix of ['', '/zh']) {
      await app.open(`${prefix}${route}`);
      await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
      await browser.locator('[data-language-switcher] summary').tap();
      await expect(screen.getByRole('link', '简体中文', { exact: true })).toBeVisible();
      const size = await browser.evaluate(async () => {
        await document.fonts.ready;
        return { width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      expect(size.viewport).toBe(360);
      expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
    }
  }
});

test('language dropdown starts closed and dismisses with Escape or an outside click', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/articles/');
  const trigger = browser.locator('[data-language-switcher] summary');
  const menu = browser.locator('[data-language-switcher] nav');
  await expect(trigger).toHaveAccessibleName('Language');
  await expect(menu).toBeHidden();
  await trigger.tap();
  await expect(menu).toBeVisible();
  await expect(screen.getByRole('link', 'English', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toBeVisible();
  await screen.getByRole('link', '简体中文', { exact: true }).focus();
  await browser.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await browser.keyboard.press('Space');
  await expect(menu).toBeVisible();
  await browser.locator('[data-theme-toggle]').tap();
  await expect(menu).toBeHidden();
  await trigger.tap();
  await screen.getByRole('link', '简体中文', { exact: true }).tap();
  await expect(browser).toHaveURL('/zh/articles/');
  await expect(trigger).toHaveAccessibleName('语言');
  await expect(menu).toBeHidden();
  await trigger.tap();
  await expect(screen.getByRole('link', '简体中文', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await trigger.tap();
  await expect(menu).toBeHidden();
});
