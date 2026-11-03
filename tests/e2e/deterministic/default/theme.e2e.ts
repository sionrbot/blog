import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('manual theme selection persists through reload and overrides system preference', async ({
  app,
  browser,
  screen,
}) => {
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  const toggle = screen.getByRole('button', 'Toggle dark mode');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.tap();
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await browser.reload();
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await browser.emulateMedia({ colorScheme: 'dark' });
  await browser.emulateMedia({ colorScheme: 'light' });
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  await browser.reload();
  await expect(browser).not.toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('system theme changes keep the root and initialized toggle state synchronized (H1)', async ({
  app,
  browser,
  screen,
}) => {
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  const toggle = screen.getByRole('button', 'Toggle dark mode');
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(browser).not.toHaveClass(browser.locator('html'), /\bdark\b/);
  await browser.emulateMedia({ colorScheme: 'dark' });
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  await browser.emulateMedia({ colorScheme: 'light' });
  await expect(browser).not.toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('unavailable local storage does not prevent opening or toggling the theme', async ({
  app,
  browser,
  screen,
}) => {
  await browser.addInitScript(() => {
    const errors: string[] = [];
    Object.assign(window, { e2eUncaughtErrors: errors });
    window.addEventListener('error', (event) => errors.push(event.message));
    window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
  });
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  await expect(screen.getByRole('heading', 'Barely Surviving and Deeply Loving')).toBeVisible();
  const toggle = screen.getByRole('button', 'Toggle dark mode');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.tap();
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.tap();
  await expect(browser).not.toHaveClass(browser.locator('html'), /\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(
    await browser.evaluate(
      () => (window as unknown as { e2eUncaughtErrors: string[] }).e2eUncaughtErrors,
    ),
  ).toEqual([]);
});
