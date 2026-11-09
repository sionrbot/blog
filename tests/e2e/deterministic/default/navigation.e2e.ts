import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a reader opens an article, follows its tag, and returns to all posts', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/');
  const navigation = screen.getByRole('navigation', 'Main');
  await navigation.getByRole('link', 'Blog').tap();
  await expect(browser).toHaveURL(/\/blog\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
  await screen.getByRole('link', 'A Typography Sampler').tap();
  await expect(browser).toHaveURL(/\/blog\/typography-sampler\/?$/);
  await expect(screen.getByRole('heading', 'A Typography Sampler', { level: 1 })).toBeVisible();
  await expect(navigation.getByRole('link', 'Blog')).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', 'About')).not.toHaveAttribute('aria-current');
  await expect(navigation.getByRole('link', 'Contact')).not.toHaveAttribute('aria-current');
  await screen.getByRole('article').getByRole('link', '#typography').tap();
  await expect(browser).toHaveURL(/\/blog\/tag\/typography\/?$/);
  await expect(screen.getByRole('heading', '#typography', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('link', 'A Typography Sampler')).toBeVisible();
  await expect(navigation.getByRole('link', 'Blog')).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', 'About')).not.toHaveAttribute('aria-current');
  await expect(navigation.getByRole('link', 'Contact')).not.toHaveAttribute('aria-current');
  await screen.getByRole('link', 'All posts').tap();
  await expect(browser).toHaveURL(/\/blog\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
  await expect(navigation.getByRole('link', 'Blog')).toHaveAttribute('aria-current', 'page');
});

test('a missing route serves the site 404 with noindex and a working home link', async ({
  app,
  browser,
  screen,
}) => {
  const response = await fetch(new URL('/definitely-missing/', app.baseUrl));
  expect(response.status).toBe(404);
  const html = await response.text();
  expect(html).toContain('Page not found');
  await app.open('/definitely-missing/');
  await expect(screen.getByRole('heading', 'Page not found', { level: 1 })).toBeVisible();
  await expect(browser.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(browser.locator('link[rel="canonical"]')).toHaveCount(0);
  await screen.getByRole('link', 'Back to the front page').tap();
  await expect(browser).toHaveURL('/');
  await expect(screen.getByRole('heading', 'Recent writing', { level: 1 })).toBeVisible();
});
