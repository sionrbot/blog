import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';

async function nextControlKey(browser: Browser) {
  // macOS WebKit uses Option-Tab for links unless full keyboard navigation is enabled.
  // https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac
  const macWebKit = await browser.evaluate(
    () => /Macintosh/.test(navigator.userAgent) && /Version\/.*Safari\//.test(navigator.userAgent),
  );
  return macWebKit ? 'Alt+Tab' : 'Tab';
}

test('keyboard users can skip navigation to the main content', async ({ app, browser, screen }) => {
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  const tab = await nextControlKey(browser);
  await browser.keyboard.press(tab);
  const skip = screen.getByRole('link', 'Skip to content');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await browser.keyboard.press('Enter');
  await expect(screen.getByRole('main')).toBeFocused();
});

test('keyboard users can activate navigation and theme controls with visible focus', async ({
  app,
  browser,
  screen,
}) => {
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  const tab = await nextControlKey(browser);
  await browser.keyboard.press(tab);
  await browser.keyboard.press(tab);
  await browser.keyboard.press(tab);
  const blogLink = screen.getByRole('navigation', 'Main').getByRole('link', 'Blog');
  await expect(blogLink).toBeFocused();
  expect(
    await browser.evaluate(() => {
      const element = document.activeElement;
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    }),
  ).toBe(true);
  await browser.keyboard.press('Enter');
  await expect(browser).toHaveURL(/\/blog\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
  // Tab through skip link, logo, Blog, About, Contact, then Search.
  for (let index = 0; index < 6; index++) await browser.keyboard.press(tab);
  await expect(screen.getByRole('navigation', 'Main').getByRole('link', 'Search')).toBeFocused();
  await browser.keyboard.press(tab);
  const toggle = screen.getByRole('button', 'Toggle dark mode');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await browser.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
});

for (const path of ['/', '/articles/', '/about/', '/contact/', '/blog/typography-sampler/']) {
  test(`default page ${path} fits a 360px viewport`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 360, height: 800 });
    await app.open(path);
    await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(screen.getByRole('navigation', 'Main')).toBeVisible();
    await expect(screen.getByRole('button', 'Toggle dark mode')).toBeVisible();
    const size = await browser.evaluate(async () => {
      await document.fonts.ready;
      return { width: document.documentElement.scrollWidth, viewport: window.innerWidth };
    });
    expect(size.viewport).toBe(360);
    expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
  });
}
