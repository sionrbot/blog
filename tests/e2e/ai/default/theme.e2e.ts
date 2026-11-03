import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a reader switches to dark mode and keeps that preference after reloading', async ({
  app,
  agent,
  browser,
  screen,
}) => {
  await browser.emulateMedia({ colorScheme: 'light' });
  await app.open('/');
  const toggle = screen.getByRole('button', 'Toggle dark mode');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await agent.act('Switch the page to dark mode using Toggle dark mode.');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await browser.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(browser).toHaveClass(browser.locator('html'), /\bdark\b/);
  await agent.act('Switch the page to light mode using Toggle dark mode.');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(browser).not.toHaveClass(browser.locator('html'), /\bdark\b/);
  expect(await browser.evaluate(() => localStorage.getItem('theme'))).toBe('light');
});
