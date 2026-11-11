import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('production subpath connects home, article, real search and Chinese article identity', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/blog/');
  await expect(browser).toHaveURL('/blog/');
  await expect(screen.getByRole('heading', 'Recent writing', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('link', 'Production path article')).toHaveAttribute(
    'href',
    '/blog/articles/production-path/',
  );
  await screen.getByRole('link', 'Production path article').tap();
  await expect(browser).toHaveURL('/blog/articles/production-path/');
  await expect(screen.getByRole('heading', 'Production path article', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('article')).toContainText(
    'The original article contains pathconnectiontoken.',
  );
  await screen.getByRole('button', 'Search').tap();
  await expect(browser).toHaveURL('/blog/articles/production-path/');
  await screen.getByRole('searchbox', 'Search articles').fill('pathconnectiontoken');
  await expect(browser).toHaveURL('/blog/articles/production-path/');
  await expect(screen.getByRole('status')).toHaveText('Results: 1');
  await expect(screen.getByRole('link', 'Production path article')).toHaveCount(1);
  await expect(screen.getByRole('link', 'Production path article')).toHaveAttribute(
    'href',
    '/blog/articles/production-path/',
  );
  await screen.getByRole('button', 'Close search').tap();
  await screen.getByLabel('Language', { visible: true }).tap();
  await screen.getByRole('link', '简体中文').tap();
  await expect(browser).toHaveURL('/blog/zh/articles/production-path/');
  await screen.getByRole('button', '搜索').tap();
  await expect(screen.getByRole('searchbox', '搜索文章')).toHaveValue('');
  await screen.getByRole('searchbox', '搜索文章').fill('pathconnectiontoken');
  await expect(screen.getByRole('status')).toHaveText('找到 1 篇文章');
  await expect(screen.getByRole('link', 'Production path article')).toHaveCount(1);
  await expect(screen.getByRole('link', 'Production path article')).toHaveAttribute(
    'href',
    '/blog/zh/articles/production-path/',
  );
  await screen.getByRole('link', 'Production path article').tap();
  await expect(browser).toHaveURL('/blog/zh/articles/production-path/');
  await expect(browser.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(screen.getByRole('heading', 'Production path article', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('article')).toContainText(
    'The original article contains pathconnectiontoken.',
  );
  await expect(browser.locator('[data-post-content]')).toHaveAttribute('lang', 'en');
  await expect(screen.getByRole('link', '← 返回全部文章')).toHaveAttribute(
    'href',
    '/blog/zh/articles/',
  );
});
