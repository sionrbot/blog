import { beforeEach, describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Set SEARCH_TEST_BASE when running against the repository-path deployment.
const base = process.env.SEARCH_TEST_BASE ?? '';

test('search finds Chinese originals once and keeps the current UI language', async ({
  app,
  screen,
}) => {
  await app.open(`${base}/`);
  await screen.getByRole('button', 'Search', { exact: true }).tap();
  await screen.getByRole('searchbox', 'Search articles').fill('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('Results: 1');
  await expect(
    screen.getByRole('dialog').getByRole('link', '重读自由软件宣言：计算在谁的机器上'),
  ).toHaveCount(1);
  await expect(
    screen.getByRole('dialog').getByRole('link', '重读自由软件宣言：计算在谁的机器上'),
  ).toHaveAttribute('href', `${base}/articles/freedom/`);
  await screen.getByRole('button', 'Close search').tap();
  await screen.getByLabel('Language', { visible: true }).tap();
  await screen.getByRole('link', '简体中文').tap();
  await screen.getByRole('button', '搜索', { exact: true }).tap();
  await expect(screen.getByRole('searchbox', '搜索文章')).toHaveValue('');
  await screen.getByRole('searchbox', '搜索文章').fill('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('找到 1 篇文章');
  await expect(
    screen.getByRole('dialog').getByRole('link', '重读自由软件宣言：计算在谁的机器上'),
  ).toHaveAttribute('href', `${base}/zh/articles/freedom/`);
  await screen.getByRole('searchbox', '搜索文章').press('ArrowDown');
  await expect(
    screen.getByRole('dialog').getByRole('link', '重读自由软件宣言：计算在谁的机器上'),
  ).toBeFocused();
  await screen
    .getByRole('dialog')
    .getByRole('link', '重读自由软件宣言：计算在谁的机器上')
    .press('Enter');
  await expect(
    screen.getByRole('heading', '重读自由软件宣言：计算在谁的机器上', { level: 1 }),
  ).toBeVisible();
});

test('search handles English, empty queries, and no results', async ({ app, screen }) => {
  await app.open(`${base}/zh/`);
  await screen.getByRole('button', '搜索', { exact: true }).tap();
  await screen.getByRole('searchbox', '搜索文章').fill('newsletter');
  await expect(
    screen.getByRole('dialog').getByRole('link', 'The Unhurried Newsletter'),
  ).toHaveAttribute('href', `${base}/zh/articles/the-unhurried-newsletter/`);
  await screen.getByRole('searchbox', '搜索文章').fill('zzzxxyyqqnomatch');
  await expect(screen.getByRole('status')).toHaveText('没有找到相关文章，请换个关键词或短语。');
  await screen.getByRole('button', '清除').tap();
  await expect(screen.getByRole('searchbox', '搜索文章')).toHaveValue('');
  await expect(screen.getByRole('status')).toHaveText('输入关键词或短语，搜索全部文章。');
  await expect(screen.getByRole('dialog', '搜索')).toBeVisible();
  await expect(screen.getByRole('searchbox', '搜索文章')).toBeFocused();
  await expect(screen.getByRole('button', '清除')).toBeHidden();
  await expect(screen.getByRole('dialog').getByRole('link')).toHaveCount(0);
});

test('search results remain readable at 360px in dark mode', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 360, height: 800 });
  await app.open(`${base}/zh/`);
  await screen.getByRole('button', '切换深色模式').tap();
  await expect(browser.locator('html')).toHaveAttribute('class', /dark/);
  await screen.getByRole('button', '搜索', { exact: true }).tap();
  await screen.getByRole('searchbox', '搜索文章').fill('寒蝉效应');
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
  const fits = await browser.evaluate(async () => {
    await document.fonts.ready;
    const dialog = document
      .querySelector<HTMLDialogElement>('[data-search-dialog]')!
      .getBoundingClientRect();
    return (
      document.documentElement.scrollWidth <= window.innerWidth &&
      dialog.left >= 0 &&
      dialog.right <= window.innerWidth &&
      dialog.top >= 0 &&
      dialog.bottom <= window.innerHeight
    );
  });
  expect(fits).toBe(true);
  await app.screenshot('search-360-dark');
});

describe('search interaction with a controlled index', () => {
  // Index correctness has separate real-WASM tests. Each test gets a fresh browser context.
  beforeEach(async ({ app, browser, screen }) => {
    await browser.route('**/pagefind/pagefind.js*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/javascript' },
        body: `export async function options() {}
export async function search(query) {
  if (query === 'slow') {
    document.documentElement.dataset.slowStarted = 'true';
    await new Promise(resolve => document.addEventListener('finish-slow', resolve, { once: true }));
    document.documentElement.dataset.slowComplete = 'true';
  }
  return { results: Array.from({ length: query === 'paged' ? 25 : query === 'many' ? 12 : 1 }, (_, i) => ({
    data: async () => {
      if (query === 'paged' && i >= 20 && !document.documentElement.dataset.pagedReleased) {
        document.documentElement.dataset.pagedStarted = 'true';
        await new Promise(resolve => document.addEventListener('finish-paged', resolve, { once: true }));
        document.documentElement.dataset.pagedComplete = 'true';
      }
      return { excerpt: '<mark>matched</mark><img src=x onerror="window.searchInjected=true">',
      meta: { title: query + ' ' + i, description: '', slug: 'result-' + i,
        lang: 'en', pubDate: '2026-10-13', tags: '["AI"]' } };
    }
  })) };
}`,
      });
    });
    await app.open(`${base}/`);
    await screen.getByRole('button', 'Search', { exact: true }).tap();
  });

  test('appends the next batch and hides pagination when all results are shown', async ({
    browser,
    screen,
  }) => {
    await screen.getByRole('searchbox', 'Search articles').fill('many');
    await expect(screen.getByRole('status')).toHaveText('Results: 12');
    await expect(browser.locator('[data-search-results] li')).toHaveCount(10);
    await expect(screen.getByRole('button', 'Show more results')).toBeVisible();
    await screen.getByRole('button', 'Show more results').tap();
    await expect(browser.locator('[data-search-results] li')).toHaveCount(12);
    await expect(screen.getByRole('button', 'Show more results')).toBeHidden();
  });

  test('reopening during pagination preserves prior results and ignores the interrupted batch', async ({
    browser,
    screen,
  }) => {
    await screen.getByRole('searchbox', 'Search articles').fill('paged');
    await expect(screen.getByRole('status')).toHaveText('Results: 25');
    await expect(browser.locator('[data-search-results] li')).toHaveCount(10);
    await screen.getByRole('button', 'Show more results').tap();
    await expect(browser.locator('[data-search-results] li')).toHaveCount(20);
    await screen.getByRole('button', 'Show more results').tap();
    await expect(browser.locator('html')).toHaveAttribute('data-paged-started', 'true');
    await expect(screen.getByRole('button', 'Show more results')).toBeDisabled();
    await screen.getByRole('button', 'Close search').tap();
    await screen.getByRole('button', 'Search', { exact: true }).tap();
    await expect(browser.locator('[data-search-results] li')).toHaveCount(20);
    await expect(screen.getByRole('button', 'Show more results')).toBeEnabled();
    await browser.evaluate(() => {
      document.documentElement.dataset.pagedReleased = 'true';
      return document.dispatchEvent(new Event('finish-paged'));
    });
    await expect(browser.locator('html')).toHaveAttribute('data-paged-complete', 'true');
    await expect(browser.locator('[data-search-results] li')).toHaveCount(20);
    await screen.getByRole('button', 'Show more results').tap();
    await expect(browser.locator('[data-search-results] li')).toHaveCount(25);
    await expect(screen.getByRole('button', 'Show more results')).toBeHidden();
  });

  test('a changed query immediately hides pagination from the previous query', async ({
    browser,
    screen,
  }) => {
    await screen.getByRole('searchbox', 'Search articles').fill('many');
    await expect(screen.getByRole('status')).toHaveText('Results: 12');
    await expect(browser.locator('[data-search-results] li')).toHaveCount(10);
    await expect(screen.getByRole('button', 'Show more results')).toBeVisible();
    const oldPaginationHidden = await browser.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#search-query')!;
      input.value = 'latest';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelector<HTMLButtonElement>('[data-search-more]')!.hidden;
    });
    expect(oldPaginationHidden).toBe(true);
  });

  test('excerpts retain highlight marks without rendering injected images or scripts', async ({
    browser,
    screen,
  }) => {
    await screen.getByRole('searchbox', 'Search articles').fill('many');
    await expect(screen.getByRole('status')).toHaveText('Results: 12');
    await screen.getByRole('button', 'Show more results').tap();
    await expect(browser.locator('[data-search-results] li')).toHaveCount(12);
    await expect(browser.locator('[data-search-results] img')).toHaveCount(0);
    await expect(browser.locator('[data-search-results] mark')).toHaveCount(12);
    expect(await browser.evaluate(() => 'searchInjected' in window)).toBe(false);
  });

  test('a slow query cannot replace the latest query results when it completes', async ({
    browser,
    screen,
  }) => {
    await screen.getByRole('searchbox', 'Search articles').fill('slow');
    await screen.getByRole('searchbox', 'Search articles').press('Enter');
    await expect(browser.locator('html')).toHaveAttribute('data-slow-started', 'true');
    await screen.getByRole('searchbox', 'Search articles').fill('latest');
    await screen.getByRole('searchbox', 'Search articles').press('Enter');
    await expect(screen.getByRole('dialog').getByRole('link', 'latest 0')).toBeVisible();
    await browser.evaluate(() => document.dispatchEvent(new Event('finish-slow')));
    await expect(browser.locator('html')).toHaveAttribute('data-slow-complete', 'true');
    await expect(browser.locator('[data-search-results] li')).toHaveCount(1);
    await expect(screen.getByRole('dialog').getByRole('link', 'slow 0')).toHaveCount(0);
  });
  test('arrow keys select results and composition does not trigger navigation', async ({
    browser,
    screen,
  }) => {
    const input = screen.getByRole('searchbox', 'Search articles');
    await input.fill('many');
    await expect(screen.getByRole('status')).toHaveText('Results: 12');
    await input.press('ArrowDown');
    await expect(screen.getByRole('dialog').getByRole('link', 'many 0')).toBeFocused();
    await screen.getByRole('dialog').getByRole('link', 'many 0').press('ArrowDown');
    await expect(screen.getByRole('dialog').getByRole('link', 'many 1')).toBeFocused();
    await screen.getByRole('dialog').getByRole('link', 'many 1').press('ArrowUp');
    await expect(screen.getByRole('dialog').getByRole('link', 'many 0')).toBeFocused();
    await input.focus();
    const composition = await browser.evaluate(() => {
      const field = document.querySelector<HTMLInputElement>('#search-query')!;
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      field.value = '中文';
      field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      const arrow = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(arrow);
      field.dispatchEvent(enter);
      return {
        focused: document.activeElement === field,
        arrowPrevented: arrow.defaultPrevented,
        enterPrevented: enter.defaultPrevented,
      };
    });
    expect(composition).toEqual({ focused: true, arrowPrevented: false, enterPrevented: false });
    await input.press('Enter');
    await expect(input).toBeFocused();
    await expect(browser).toHaveURL(`${base}/`);
    await browser.evaluate(() =>
      document
        .querySelector('#search-query')!
        .dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
    );
    await expect(screen.getByRole('dialog').getByRole('link', '中文 0')).toBeVisible();
  });
});

test('search reports an unavailable index', async ({ app, browser, screen }) => {
  await browser.route('**/pagefind/pagefind.js*', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await app.open(`${base}/`);
  await screen.getByRole('button', 'Search', { exact: true }).tap();
  await screen.getByRole('searchbox', 'Search articles').fill('privacy');
  await expect(screen.getByRole('status')).toHaveText(
    'Search could not load. Reload the page to try again.',
  );
});

test('search opens from an article without changing its URL and restores focus and scroll', async ({
  app,
  browser,
  screen,
}) => {
  await app.open(`${base}/articles/freedom/?ref=reader#main`);
  const entry = screen.getByRole('button', 'Search', { exact: true });
  await entry.tap();
  await expect(screen.getByRole('dialog', 'Search')).toBeVisible();
  const input = screen.getByRole('searchbox', 'Search articles');
  await expect(input).toBeFocused();
  await input.fill('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('Results: 1');
  await expect(browser).toHaveURL(`${base}/articles/freedom/?ref=reader#main`);
  await input.press('Escape');
  await expect(screen.getByRole('dialog', 'Search')).toBeHidden();
  await expect(entry).toBeFocused();
  await entry.tap();
  await expect(input).toHaveValue('寒蝉效应');
  await expect(screen.getByRole('status')).toHaveText('Results: 1');
  await screen.getByRole('button', 'Close search').tap();
  const initialScroll = await browser.evaluate(() => window.scrollY);
  await entry.tap();
  await browser.mouse.move(4, 350);
  await browser.mouse.wheel(0, 600);
  await browser.evaluate(
    () =>
      new Promise<boolean>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
      ),
  );
  expect(await browser.evaluate(() => window.scrollY)).toBe(initialScroll);
  await screen.tapAt({ x: 4, y: 4 });
  await expect(screen.getByRole('dialog', 'Search')).toBeHidden();
  await expect(entry).toBeFocused();
  expect(await browser.evaluate(() => window.scrollY)).toBe(initialScroll);
  await browser.mouse.move(4, 350);
  await browser.mouse.wheel(0, 600);
  await expect.poll(() => browser.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll);
});

test('search is lazy, contains keyboard focus, and dismisses from the backdrop', async ({
  app,
  browser,
  screen,
}) => {
  let indexRequests = 0;
  await browser.route('**/pagefind/pagefind.js*', async (route) => {
    indexRequests++;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript' },
      body: 'export async function options() {} export async function search() { return { results: [] }; }',
    });
  });
  await app.open(`${base}/`);
  const entry = screen.getByRole('button', 'Search', { exact: true });
  await entry.focus();
  expect(indexRequests).toBe(0);
  await entry.press('/');
  await expect(screen.getByRole('dialog', 'Search')).toBeHidden();
  await entry.press('Enter');
  const input = screen.getByRole('searchbox', 'Search articles');
  await expect(input).toBeFocused();
  await input.press('Tab');
  expect(
    await browser.evaluate(() => document.activeElement?.closest('[data-search-dialog]') !== null),
  ).toBe(true);
  await input.focus();
  await input.fill('missing');
  await expect(screen.getByRole('status')).toHaveText(
    'No matching articles. Try another word or phrase.',
  );
  expect(indexRequests).toBe(1);
  await screen.tapAt({ x: 4, y: 4 });
  await expect(screen.getByRole('dialog', 'Search')).toBeHidden();
  await expect(entry).toBeFocused();
});

test('typing a slash in another field does not open search', async ({ app, screen }) => {
  await app.open(`${base}/contact/`);
  const field = screen.getByRole('textbox', 'Name');
  await field.fill('Reader');
  await field.press('/');
  await expect(field).toHaveValue('Reader/');
  await expect(screen.getByRole('dialog', 'Search')).toBeHidden();
});
