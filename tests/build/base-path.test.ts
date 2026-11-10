import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { createFixture } from '../support/build-fixture';
import { readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

describe.each(['', '/sionrbot-blog', '/blog'])('deployment base %s', (base) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  const origin = 'https://fixture.example';
  beforeAll(async () => {
    fixture = await createFixture('base-path', {
      posts: [
        { id: 'sample', title: 'Sample', pubDate: '2025-01-01', tags: ['writing', '开源'] },
        { id: 'hidden', title: 'Hidden', pubDate: '2025-01-02', tags: ['private'], draft: true },
      ],
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
        '/articles/sample/',
        '/articles/tag/writing/',
        '/about/',
        '/contact/',
      ]) {
        const $ = await readHtml(fixture.dist, `${prefix}${route}`);
        expect($('html').attr('lang')).toBe(prefix ? 'zh-Hans' : 'en');
        expect($('header nav a').first().attr('href')?.replace(/\/$/, '')).toBe(
          `${base}${prefix}/articles`,
        );
        if (route.startsWith('/articles/'))
          expect($('header nav a').first().attr('aria-current')).toBe('page');
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
          if (href.startsWith('/') && !href.startsWith('//')) {
            expect(href.startsWith(`${base}/`), href).toBe(true);
            expect(href.slice(base.length), href).not.toMatch(/^\/(?:zh\/)?blog\//);
          }
        }
        const schema = JSON.parse($('script[type="application/ld+json"]').text());
        expect(schema[0].url).toBe(`${origin}${base}/`);
      }
    }
    for (const prefix of ['', '/zh']) {
      const $ = await readHtml(fixture.dist, `${prefix}/articles/`);
      expect($('main h2 a').first().attr('href')).toBe(`${base}${prefix}/articles/sample/`);
    }
    for (const route of ['/404.html', '/zh/404/']) {
      const $ = await readHtml(fixture.dist, route);
      expect($('a[hreflang="en"]').attr('href')).toBe(`${base}/404.html`);
      expect($('a[hreflang="zh-Hans"]').attr('href')).toBe(`${base}/zh/404/`);
    }
    const urls = await sitemapUrls(fixture.dist, base);
    expect(urls).toContain(`${origin}${base}/articles/sample/`);
    expect(urls).toContain(`${origin}${base}/zh/contact/`);
    expect(urls).not.toContain(`${origin}${base}/zh/articles/sample/`);
    expect(urls.some((url) => /\/404(?:\/|\.html)$/.test(url))).toBe(false);
    const rss = await readFile(join(fixture.dist, 'rss.xml'), 'utf8');
    expect(rssPosts(rss).map((post) => post.url)).toEqual([`${origin}${base}/articles/sample/`]);
    expect(load(rss, { xml: true })('channel > link').text()).toBe(`${origin}${base}/`);
    expect(await readFile(join(fixture.dist, 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${origin}${base}/sitemap-index.xml`,
    );
  });
  test('removed legacy article and tag addresses return 404 without redirects', async () => {
    const urls = await sitemapUrls(fixture.dist, base);
    const process = fixture.startProcess(
      ['preview', '--host', '127.0.0.1', '--port', '0'],
      'preview.log',
    );
    try {
      const deadline = Date.now() + 30_000;
      let serverUrl: string | undefined;
      while (Date.now() < deadline) {
        if (process.closed) {
          await process.result;
          throw new Error(`Preview exited before ready: ${process.stdout}\n${process.stderr}`);
        }
        const candidate = process.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (candidate) {
          try {
            const response = await fetch(`${candidate}${base}/`, {
              signal: AbortSignal.timeout(2_000),
            });
            if (response.ok) {
              serverUrl = candidate;
              break;
            }
          } catch {
            // The announced port may not yet accept requests.
          }
        }
        await delay(100);
      }
      if (!serverUrl) throw new Error(`Preview not ready; see ${fixture.reportDir}`);
      for (const prefix of ['', '/zh']) {
        for (const suffix of ['sample/', 'tag/writing/', 'tag/开源/']) {
          const legacy = `${prefix}/blog/${suffix}`;
          await expect(access(join(fixture.dist, legacy, 'index.html'))).rejects.toMatchObject({
            code: 'ENOENT',
          });
          const response = await fetch(`${serverUrl}${base}${legacy}`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          });
          expect(response.status).toBe(404);
          expect(response.headers.get('location')).toBeNull();
          expect(response.headers.get('refresh')).toBeNull();
          expect(load(await response.text())('meta[http-equiv="refresh"]')).toHaveLength(0);
          const current = await fetch(`${serverUrl}${base}${prefix}/articles/${suffix}`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          });
          expect(current.status).toBe(200);
          expect(current.headers.get('location')).toBeNull();
          expect(urls).not.toContain(`${origin}${base}${legacy}`);
          expect(urls).not.toContain(`${origin}${base}${encodeURI(legacy)}`);
        }
        for (const route of [
          'blog/hidden/',
          'blog/tag/private/',
          'articles/hidden/',
          'articles/tag/private/',
        ]) {
          await expect(
            access(join(fixture.dist, `${prefix}/${route}index.html`)),
          ).rejects.toMatchObject({ code: 'ENOENT' });
        }
      }
      expect(
        urls.every((url) => !/^\/(?:zh\/)?blog\//.test(new URL(url).pathname.slice(base.length))),
      ).toBe(true);
    } finally {
      await process.stop();
    }
  });
});
