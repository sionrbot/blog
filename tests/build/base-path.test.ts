import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { createFixture } from '../support/build-fixture';
import { readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

describe.each(['/sionrbot-blog', '/blog'])('deployment base %s', (base) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  const origin = 'https://fixture.example';
  beforeAll(async () => {
    fixture = await createFixture('base-path', {
      posts: [{ id: 'sample', title: 'Sample', pubDate: '2025-01-01', tags: ['writing'] }],
    });
    fixture.env.SITE_URL = `${origin}${base}/`;
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
  afterAll(async () => fixture?.dispose());

  test('project subpaths retain bilingual navigation, feeds, assets and canonical relationships', async () => {
    for (const prefix of ['', '/zh']) {
      for (const route of [
        '/',
        '/articles/',
        '/blog/sample/',
        '/blog/tag/writing/',
        '/about/',
        '/contact/',
      ]) {
        const $ = await readHtml(fixture.dist, `${prefix}${route}`);
        expect($('html').attr('lang')).toBe(prefix ? 'zh-Hans' : 'en');
        expect($('header nav a').first().attr('href')?.replace(/\/$/, '')).toBe(
          `${base}${prefix}/articles`,
        );
        expect($('a[hreflang="en"]').attr('href')).toBe(`${base}${route}`);
        expect($('a[hreflang="zh-Hans"]').attr('href')).toBe(`${base}/zh${route}`);
        expect($('link[rel="canonical"]').attr('href')).toBe(
          `${origin}${base}${route === '/contact/' ? prefix : ''}${route}`,
        );
        expect($('link[hreflang="zh-Hans"]').attr('href')).toBe(`${origin}${base}/zh${route}`);
        expect($('link[type="application/rss+xml"]').attr('href')).toBe(`${base}/rss.xml`);
        expect($('link[rel="sitemap"]').attr('href')).toBe(`${base}/sitemap-index.xml`);
        for (const element of $('a[href], link[href], script[src], img[src]').toArray()) {
          const href = $(element).attr('href') ?? $(element).attr('src')!;
          if (href.startsWith('/') && !href.startsWith('//'))
            expect(href.startsWith(`${base}/`), href).toBe(true);
        }
        const schema = JSON.parse($('script[type="application/ld+json"]').text());
        expect(schema[0].url).toBe(`${origin}${base}/`);
      }
    }
    for (const prefix of ['', '/zh']) {
      const $ = await readHtml(fixture.dist, `${prefix}/articles/`);
      expect($('main h2 a').first().attr('href')).toBe(`${base}${prefix}/blog/sample/`);
    }
    for (const route of ['/404.html', '/zh/404/']) {
      const $ = await readHtml(fixture.dist, route);
      expect($('a[hreflang="en"]').attr('href')).toBe(`${base}/404.html`);
      expect($('a[hreflang="zh-Hans"]').attr('href')).toBe(`${base}/zh/404/`);
    }
    const urls = await sitemapUrls(fixture.dist, base);
    expect(urls).toContain(`${origin}${base}/blog/sample/`);
    expect(urls).toContain(`${origin}${base}/zh/contact/`);
    expect(urls).not.toContain(`${origin}${base}/zh/blog/sample/`);
    expect(urls.some((url) => /\/404(?:\/|\.html)$/.test(url))).toBe(false);
    const rss = await readFile(join(fixture.dist, 'rss.xml'), 'utf8');
    expect(rssPosts(rss).map((post) => post.url)).toEqual([`${origin}${base}/blog/sample/`]);
    expect(load(rss, { xml: true })('channel > link').text()).toBe(`${origin}${base}/`);
    expect(await readFile(join(fixture.dist, 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${origin}${base}/sitemap-index.xml`,
    );
  });
});
