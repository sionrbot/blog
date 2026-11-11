import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

for (const prefix of ['', '/zh']) {
  test(`home and article lists stay stacked across widths (${prefix || 'en'})`, async ({
    app,
    browser,
  }) => {
    for (const width of [360, 390, 768, 1023, 1024, 1280]) {
      await browser.setViewport({ width, height: 800 });
      for (const path of ['/', '/articles/']) {
        await app.open(`${prefix}${path}`);
        const layout = await browser.evaluate(async () => {
          await document.fonts.ready;
          const header = document.querySelector('body > header')!;
          const nav = header.querySelector(':scope > nav')!.getBoundingClientRect();
          const tools = header.querySelector(':scope > div')!.getBoundingClientRect();
          const rows = [...document.querySelectorAll('main ol > li')];
          return {
            count: rows.length,
            fits: [...header.querySelectorAll('a, button, summary'), ...rows].every((node) => {
              const r = node.getBoundingClientRect();
              return r.left >= 0 && r.right <= innerWidth + 1;
            }),
            navBelowTools: nav.top >= tools.bottom,
            readable: rows.every((row) => {
              const title = row.querySelector('h2')!.getBoundingClientRect();
              const date = row.querySelector('p')!.getBoundingClientRect();
              return (
                title.width >= Math.min(300, innerWidth - 32) &&
                title.top >= date.bottom &&
                row.scrollWidth <= row.getBoundingClientRect().width + 1 &&
                Math.abs(title.left - date.left) <= 1 &&
                Math.abs(title.right - date.right) <= 1
              );
            }),
          };
        });
        expect(layout.count).toBeGreaterThan(0);
        expect(layout.fits).toBe(true);
        expect(layout.readable).toBe(true);
        if (width < 768) expect(layout.navBelowTools).toBe(true);
        if (width === 360 || width === 1280) {
          await app.screenshot(
            `layout-${path === '/' ? 'home' : 'articles'}-${prefix ? 'zh' : 'en'}-${width}`,
          );
        }
      }
    }
    await browser.setViewport({ width: 360, height: 800 });
    await app.open(`${prefix}/`);
    await browser.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
      return true;
    });
    await browser.locator('[data-language-switcher] summary').tap();
    const enlargedFits = await browser.evaluate(() => {
      const header = document.querySelector('body > header')!;
      const brand = header.querySelector(':scope > a')!.getBoundingClientRect();
      return (
        brand.height < 240 &&
        [...header.querySelectorAll('a, button, summary')].every((node) => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth + 1;
        })
      );
    });
    expect(enlargedFits).toBe(true);
    await app.screenshot(`layout-navigation-${prefix ? 'zh' : 'en'}-200-percent`);
    await browser.locator('[data-language-switcher] summary').press('Escape');
    await expect(browser.locator('[data-language-switcher]')).not.toHaveAttribute('open');
  });

  test(`article first screen leaves room for reading (${prefix || 'en'})`, async ({
    app,
    browser,
  }) => {
    await browser.setViewport({ width: 360, height: 800 });
    for (const slug of ['freedom', 'on-rereading']) {
      await app.open(`${prefix}/articles/${slug}/`);
      const content = await browser.evaluate(async () => {
        await document.fonts.ready;
        const article = document.querySelector('article')!;
        const body = article.querySelector('[data-post-content]')!.getBoundingClientRect();
        const heading = article.querySelector('h1')!.getBoundingClientRect();
        return {
          startsOnScreen: body.top < innerHeight * 0.75,
          fits: heading.left >= 0 && heading.right <= innerWidth,
          descriptionFits:
            article.querySelector('header > p:last-child')!.scrollWidth <= article.clientWidth,
          separated: body.top > heading.bottom,
        };
      });
      expect(content.startsOnScreen).toBe(true);
      expect(content.fits).toBe(true);
      expect(content.descriptionFits).toBe(true);
      expect(content.separated).toBe(true);
      await app.screenshot(`layout-article-${prefix ? 'zh' : 'en'}-${slug}`);
    }
  });
}
