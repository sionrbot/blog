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
  await expect(browser).toHaveURL(/\/articles\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
  await screen.getByRole('link', 'A Typography Sampler').tap();
  await expect(browser).toHaveURL(/\/articles\/typography-sampler\/?$/);
  await expect(screen.getByRole('heading', 'A Typography Sampler', { level: 1 })).toBeVisible();
  await expect(navigation.getByRole('link', 'Blog')).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', 'About')).not.toHaveAttribute('aria-current');
  await expect(navigation.getByRole('link', 'Contact')).not.toHaveAttribute('aria-current');
  await screen.getByRole('article').getByRole('link', '#typography').tap();
  await expect(browser).toHaveURL(/\/articles\/tag\/typography\/?$/);
  await expect(screen.getByRole('heading', '#typography', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('link', 'A Typography Sampler')).toBeVisible();
  await expect(navigation.getByRole('link', 'Blog')).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', 'About')).not.toHaveAttribute('aria-current');
  await expect(navigation.getByRole('link', 'Contact')).not.toHaveAttribute('aria-current');
  await screen.getByRole('link', 'All posts').tap();
  await expect(browser).toHaveURL(/\/articles\/?$/);
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

for (const prefix of ['', '/zh']) {
  test(`removed ${prefix || 'English'} article and tag addresses stay 404`, async ({
    app,
    browser,
  }) => {
    for (const suffix of ['typography-sampler/', 'tag/typography/']) {
      const legacy = `${prefix}/blog/${suffix}`;
      const response = await fetch(`${app.baseUrl!.replace(/\/$/, '')}${legacy}`, {
        redirect: 'manual',
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('refresh')).toBeNull();
      expect(await response.text()).not.toMatch(/http-equiv=["']refresh["']/i);
      await app.open(legacy);
      await expect(browser).toHaveURL(legacy);
      await expect(browser.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
      await app.open(`${prefix}/articles/${suffix}`);
      await expect(browser).toHaveURL(`${prefix}/articles/${suffix}`);
      await expect(browser.locator('html')).toHaveAttribute('lang', prefix ? 'zh-Hans' : 'en');
    }
  });
}
