import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { site } from '../../src/config';
import { projectRoot } from '../support/build-fixture';
import { outputPath, readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

async function absent(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

test('ROUTE-01: the default production build contains the required site routes and linked articles', async () => {
  const dist = join(projectRoot, 'dist');
  const base = new URL(process.env.SITE_URL ?? site.url).pathname;
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
    '/articles/',
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
  const sitemap = await sitemapUrls(dist, base);
  for (const post of rss) {
    const $ = await readHtml(dist, outputPath(new URL(post.url).pathname, base));
    expect($('main h1').text()).toBe(post.title);
    expect(sitemap).toContain(post.url);
    for (const element of $(`main a[href^="${base.replace(/\/$/, '')}/blog/tag/"]`).toArray()) {
      const tag = await readHtml(dist, outputPath($(element).attr('href')!, base));
      expect(tag('main h1').text()).toMatch(/^#/);
    }
  }
  const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
  expect(robots).toContain('Sitemap:');
  await absent(join(dist, 'styleguide/index.html'));
  await absent(join(dist, 'whats-new/index.html'));
});
