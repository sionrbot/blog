import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('wide article content scrolls locally and embedded controls remain usable', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/articles/e2e-rendering/');
  await expect(screen.getByRole('heading', 'E2E rendering specimen')).toBeVisible();
  await expect(browser.locator('.table-scroll > table')).toHaveCount(1);
  await expect(browser.locator('.katex-display')).toHaveCount(1);
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
  await browser.evaluate(async () => {
    await document.fonts.ready;
    return true;
  });
  const geometry = await browser.evaluate(() => {
    const selectors = ['.table-scroll', '.prose pre', '.katex-display'];
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      tableDisplay: getComputedStyle(document.querySelector('table')!).display,
      containers: selectors.map((selector) => {
        const node = document.querySelector<HTMLElement>(selector)!;
        node.scrollLeft = 80;
        return {
          selector,
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
          scrollLeft: node.scrollLeft,
          overflow: getComputedStyle(node).overflowX,
        };
      }),
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.tableDisplay).toBe('table');
  for (const container of geometry.containers) {
    expect(container.overflow).toBe('auto');
    if (geometry.width <= 360) {
      expect(container.width).toBeLessThanOrEqual(geometry.width);
      expect(container.scrollWidth).toBeGreaterThan(container.width);
      expect(container.scrollLeft).toBeGreaterThan(0);
    }
  }
  await screen.getByLabel('Email address').fill('reader@example.test');
  await expect(screen.getByLabel('Email address')).toHaveValue('reader@example.test');
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
});
