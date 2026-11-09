import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Set SEARCH_TEST_BASE when running against the repository-path deployment.
const base = process.env.SEARCH_TEST_BASE ?? '';

test('search finds Chinese originals once and keeps the current UI language', async ({
  app,
  screen,
}) => {
  await app.open(`${base}/search/`);
  await screen.getByRole('searchbox', 'Search articles').fill('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('Results: 1');
  await expect(screen.getByRole('link', '重读自由软件宣言：计算在谁的机器上')).toHaveCount(1);
  await expect(screen.getByRole('link', '重读自由软件宣言：计算在谁的机器上')).toHaveAttribute(
    'href',
    `${base}/blog/freedom/`,
  );
  await screen.getByLabel('Language', { visible: true }).tap();
  await screen.getByRole('link', '简体中文').tap();
  await expect(screen.getByRole('searchbox', '搜索文章')).toHaveValue('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('找到 1 篇文章');
  await expect(screen.getByRole('link', '重读自由软件宣言：计算在谁的机器上')).toHaveAttribute(
    'href',
    `${base}/zh/blog/freedom/`,
  );
  await screen.getByRole('link', '重读自由软件宣言：计算在谁的机器上').tap();
  await expect(
    screen.getByRole('heading', '重读自由软件宣言：计算在谁的机器上', { level: 1 }),
  ).toBeVisible();
});

test('search handles English, empty queries, and no results', async ({ app, screen }) => {
  await app.open(`${base}/zh/search/`);
  await screen.getByRole('searchbox', '搜索文章').fill('newsletter');
  await expect(screen.getByRole('link', 'The Unhurried Newsletter')).toHaveAttribute(
    'href',
    `${base}/zh/blog/the-unhurried-newsletter/`,
  );
  await screen.getByRole('searchbox', '搜索文章').fill('zzzxxyyqqnomatch');
  await expect(screen.getByRole('status')).toHaveText('没有找到相关文章，请换个关键词或短语。');
  await screen.getByRole('searchbox', '搜索文章').fill('');
  await expect(screen.getByRole('status')).toHaveText('输入关键词或短语，搜索全部文章。');
});

test('search results remain readable at 360px in dark mode', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 360, height: 800 });
  await app.open(`${base}/zh/search/?q=${encodeURIComponent('寒蝉效应')}`);
  await expect(screen.getByRole('status')).toHaveText('找到 1 篇文章');
  expect(
    await browser.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-search-results] mark'),
        (mark) => mark.textContent,
      ).join(''),
    ),
  ).toContain('寒蝉效应');
  await expect(browser.locator('[data-search-results] time')).toHaveText('2026年10月13日');
  await screen.getByRole('button', '切换深色模式').tap();
  await expect(browser.locator('html')).toHaveAttribute('class', /dark/);
  const fits = await browser.evaluate(async () => {
    await document.fonts.ready;
    return document.documentElement.scrollWidth <= window.innerWidth;
  });
  expect(fits).toBe(true);
  await app.screenshot('search-360-dark');
});

test('search paginates safely and discards a superseded query', async ({
  app,
  browser,
  screen,
}) => {
  // Isolate UI concurrency and excerpt rendering; index correctness has separate real-WASM tests.
  await browser.route('**/pagefind/pagefind.js*', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript' },
      body: `export async function options() {}
export async function search(query) {
  if (query === 'slow') {
    await new Promise(resolve => document.addEventListener('finish-slow', resolve, { once: true }));
    document.documentElement.dataset.slowComplete = 'true';
  }
  return { results: Array.from({ length: query === 'many' ? 12 : 1 }, (_, i) => ({
    data: async () => ({ excerpt: '<mark>matched</mark><img src=x onerror="window.searchInjected=true">',
      meta: { title: query + ' ' + i, description: '', slug: 'result-' + i,
        lang: 'en', pubDate: '2026-10-13', tags: '["AI"]' } })
  })) };
}`,
    });
  });
  await app.open(`${base}/search/`);
  await screen.getByRole('searchbox', 'Search articles').fill('many');
  await expect(screen.getByRole('status')).toHaveText('Results: 12');
  await expect(browser.locator('[data-search-results] li')).toHaveCount(10);
  const oldPaginationHidden = await browser.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#search-query')!;
    input.value = 'latest';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return document.querySelector<HTMLButtonElement>('[data-search-more]')!.hidden;
  });
  expect(oldPaginationHidden).toBe(true);
  await screen.getByRole('searchbox', 'Search articles').fill('many');
  await expect(screen.getByRole('status')).toHaveText('Results: 12');
  await expect(screen.getByRole('button', 'Show more results')).toBeVisible();
  await screen.getByRole('button', 'Show more results').tap();
  await expect(browser.locator('[data-search-results] li')).toHaveCount(12);
  await expect(screen.getByRole('button', 'Show more results')).toBeHidden();
  await expect(browser.locator('[data-search-results] img')).toHaveCount(0);
  await expect(browser.locator('[data-search-results] mark')).toHaveCount(12);
  expect(await browser.evaluate(() => 'searchInjected' in window)).toBe(false);
  await screen.getByRole('searchbox', 'Search articles').fill('slow');
  await screen.getByRole('button', 'Search', { exact: true }).tap();
  await screen.getByRole('searchbox', 'Search articles').fill('latest');
  await screen.getByRole('button', 'Search', { exact: true }).tap();
  await expect(screen.getByRole('link', 'latest 0')).toBeVisible();
  await browser.evaluate(() => document.dispatchEvent(new Event('finish-slow')));
  await expect(browser.locator('html')).toHaveAttribute('data-slow-complete', 'true');
  await expect(browser.locator('[data-search-results] li')).toHaveCount(1);
  await expect(screen.getByRole('link', 'slow 0')).toHaveCount(0);
});

test('search reports an unavailable index', async ({ app, browser, screen }) => {
  await browser.route('**/pagefind/pagefind.js*', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await app.open(`${base}/search/?q=privacy`);
  await expect(screen.getByRole('status')).toHaveText(
    'Search could not load. Reload the page to try again.',
  );
});
