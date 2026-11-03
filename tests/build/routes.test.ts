import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createFixture, projectRoot } from '../support/build-fixture';
import { readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

async function absent(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

test('ROUTE-01: the default production build contains the required site routes and linked articles', async () => {
  const dist = join(projectRoot, 'dist');
  // Explicit prerequisite: do not silently substitute a fixture or reuse an absent build.
  try {
    await access(join(dist, 'index.html'));
  } catch (error) {
    throw new Error('Default dist is missing. Run vp run build before test:build.', {
      cause: error,
    });
  }
  for (const route of [
    '/',
    '/blog/',
    '/about/',
    '/contact/',
    '/privacy/',
    '/terms/',
    '/404.html',
  ]) {
    const $ = await readHtml(dist, route);
    expect($('main').length, route).toBe(1);
    expect($('title').text().length, route).toBeGreaterThan(0);
  }
  const rss = rssPosts(await readFile(join(dist, 'rss.xml'), 'utf8'));
  expect(rss.length).toBeGreaterThan(0);
  const sitemap = await sitemapUrls(dist);
  for (const post of rss) {
    const $ = await readHtml(dist, new URL(post.url).pathname);
    expect($('main h1').text()).toBe(post.title);
    expect(sitemap).toContain(post.url);
    for (const element of $('main a[href^="/blog/tag/"]').toArray()) {
      const tag = await readHtml(dist, $(element).attr('href')!);
      expect(tag('main h1').text()).toMatch(/^#/);
    }
  }
  const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
  expect(robots).toContain('Sitemap:');
  await absent(join(dist, 'styleguide/index.html'));
  await absent(join(dist, 'whats-new/index.html'));
});

test('ROUTE-02: a demo build includes the changelog but never the dev-only styleguide', async () => {
  const fixture = await createFixture('demo-routes', { demo: true });
  try {
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    const page = await readHtml(fixture.dist, '/whats-new/');
    expect(page('main h1').text()).toContain("What's new");
    expect(page('main').text()).toContain('Changelog');
    await absent(join(fixture.dist, 'styleguide/index.html'));
  } finally {
    await fixture.dispose();
  }
});
