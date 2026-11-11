import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('reading width follows original content language across UI routes', async ({
  app,
  browser,
}) => {
  for (const width of [360, 768, 1280]) {
    await browser.setViewport({ width, height: 900 });
    for (const slug of ['freedom', 'on-rereading', 'typography-sampler']) {
      const measurements = [];
      for (const prefix of ['', '/zh']) {
        await app.open(`${prefix}/articles/${slug}/`);
        const result = await browser.evaluate(async () => {
          await document.fonts.ready;
          const article = document.querySelector('article')!;
          const body = article.querySelector<HTMLElement>('[data-post-content]')!;
          const rect = body.getBoundingClientRect();
          const paragraph = body.querySelector('p')!;
          const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
          const lines = new Map<number, number>();
          let node;
          while ((node = walker.nextNode())) {
            for (let offset = 0; offset < node.textContent!.length; offset++) {
              const range = document.createRange();
              range.setStart(node, offset);
              range.setEnd(node, offset + 1);
              const r = range.getBoundingClientRect();
              const top = Math.round(r.top);
              if (r.width > 0) lines.set(top, (lines.get(top) ?? 0) + 1);
            }
          }
          return {
            width: rect.width,
            fontSize: Number.parseFloat(getComputedStyle(body).fontSize),
            lang: body.lang,
            uiLang: document.documentElement.lang,
            dateLang: article.querySelector('header > p')!.getAttribute('lang'),
            footerLang: article.querySelector('footer')!.getAttribute('lang'),
            longestLine: Math.max(...lines.values()),
            fits: rect.left >= 0 && rect.right <= innerWidth && body.scrollWidth <= rect.width + 1,
            localScroll: [...body.querySelectorAll('.table-scroll, pre')].every((element) => {
              const r = element.getBoundingClientRect();
              return (
                r.left >= rect.left &&
                r.right <= rect.right + 1 &&
                getComputedStyle(element).overflowX === 'auto'
              );
            }),
          };
        });
        expect(result.lang).toBe(slug === 'freedom' ? 'zh-Hans' : 'en');
        expect(result.uiLang).toBe(prefix ? 'zh-Hans' : 'en');
        expect(result.dateLang).toBe(result.uiLang);
        expect(result.footerLang).toBe(result.uiLang);
        expect(result.fits).toBe(true);
        expect(result.localScroll).toBe(true);
        if (width === 1280) {
          expect(result.longestLine).toBeLessThanOrEqual(slug === 'freedom' ? 40 : 80);
          expect(result.width).toBeGreaterThan(500);
          if (slug !== 'typography-sampler') {
            await app.screenshot(`reading-${slug}-${prefix ? 'zh' : 'en'}-desktop`);
          }
          console.log('Reading measure', { slug, prefix, ...result });
        }
        measurements.push(result.width);
        if (width === 360 && prefix && slug !== 'typography-sampler') {
          await app.screenshot(`reading-${slug}-mobile`);
        }
      }
      expect(Math.abs(measurements[0]! - measurements[1]!)).toBeLessThanOrEqual(1);
    }
  }
});

test('article text reflows with enlarged fonts and Chinese measure has a fallback', async ({
  app,
  browser,
}) => {
  await browser.setViewport({ width: 360, height: 900 });
  for (const slug of ['freedom', 'on-rereading']) {
    await app.open(`/articles/${slug}/`);
    await browser.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
      return true;
    });
    expect(
      await browser.evaluate(async () => {
        await document.fonts.ready;
        const body = document.querySelector<HTMLElement>('[data-post-content]')!;
        const r = body.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && body.scrollWidth <= r.width + 1;
      }),
    ).toBe(true);
  }
  await browser.setViewport({ width: 1280, height: 900 });
  await app.open('/articles/freedom/');
  const fallback = await browser.evaluate(async () => {
    await document.fonts.ready;
    // Simulate a browser discarding the unsupported ic enhancement.
    let removed = 0;
    for (const sheet of document.styleSheets) {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i]!;
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes('1ic')) {
          sheet.deleteRule(i);
          removed++;
        }
      }
    }
    return {
      width: document.querySelector('[data-post-content]')!.getBoundingClientRect().width,
      removed,
    };
  });
  expect(fallback.removed).toBeGreaterThan(0);
  expect(fallback.width).toBeGreaterThan(500);
  expect(fallback.width).toBeLessThan(760);
});
