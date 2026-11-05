import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { site } from '../../src/config';
import { createFixture, projectRoot } from '../support/build-fixture';
import { outputPath, readHtml, sitemapUrls } from '../support/parse-output';

const origin = 'https://seo.fixture.example';
const escapedTitle = 'Reading <notes> </script><script id="unexpected-script">bad()</script>';
let fixture: Awaited<ReturnType<typeof createFixture>>;

function schemas($: Awaited<ReturnType<typeof readHtml>>) {
  expect($('script[type="application/ld+json"]')).toHaveLength(1);
  const value: unknown = JSON.parse($('script[type="application/ld+json"]').text());
  expect(Array.isArray(value)).toBe(true);
  return value as Record<string, unknown>[];
}

beforeAll(async () => {
  fixture = await createFixture('seo', { posts: [] });
  fixture.env.SITE_URL = origin;
  for (const [id, title, extra] of [
    ['fallback', 'Fallback article', ''],
    ['404-guide', 'A guide to 404 responses', 'tags: ["404"]\n'],
    [
      'hero',
      'Hero article',
      'updatedDate: 2026-02-03\nheroImage: ../../assets/logo.svg\nheroAlt: Fixture hero\n',
    ],
    ['escaped', escapedTitle, ''],
  ]) {
    await writeFile(
      join(fixture.root, `src/content/blog/${id}.md`),
      `---\ntitle: ${JSON.stringify(title)}\ndescription: SEO fixture\npubDate: 2026-01-02\n${extra}---\n\nFixture body.\n`,
    );
  }
  const result = await fixture.build();
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
});

afterAll(async () => {
  await fixture?.dispose();
});

test.each(['default', 'override'] as const)(
  'SEO-01: %s origin is used across emitted metadata and feeds',
  async (variant) => {
    const dist = variant === 'default' ? join(projectRoot, 'dist') : fixture.dist;
    const deployment = new URL(variant === 'default' ? (process.env.SITE_URL ?? site.url) : origin);
    const expectedOrigin = deployment.origin;
    const base = deployment.pathname;
    const home = `${expectedOrigin}${base.replace(/\/$/, '')}/`;
    const urls = await sitemapUrls(dist, base);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).origin).toBe(expectedOrigin);
      const $ = await readHtml(dist, outputPath(new URL(url).pathname, base));
      expect($('link[rel="canonical"]').attr('href')).toBe(url);
      expect($('meta[property="og:url"]').attr('content')).toBe(url);
      for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        const image = $(selector).attr('content')!;
        expect(new URL(image).origin).toBe(expectedOrigin);
        await access(join(dist, outputPath(new URL(image).pathname, base)));
      }
      const data = schemas($);
      expect(data.find((entry) => entry['@type'] === 'WebSite')).toMatchObject({
        url: home,
        publisher: { url: home },
      });
      const post = data.find((entry) => entry['@type'] === 'BlogPosting');
      if (post) {
        expect(post.mainEntityOfPage).toBe(url);
        expect(new URL(String(post.image)).origin).toBe(expectedOrigin);
      }
    }
    for (const file of ['rss.xml', 'sitemap-index.xml']) {
      const xml = load(await readFile(join(dist, file), 'utf8'), { xml: true });
      const links = xml(file === 'rss.xml' ? 'link' : 'loc');
      expect(links.length).toBeGreaterThan(0);
      for (const link of links.toArray())
        expect(new URL(xml(link).text()).origin).toBe(expectedOrigin);
    }
    expect(await readFile(join(dist, 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${home}sitemap-index.xml`,
    );
  },
);

test.each(['fallback', 'hero'] as const)(
  'SEO-02: %s article has dates, image and breadcrumbs',
  async (id) => {
    const title = id === 'hero' ? 'Hero article' : 'Fallback article';
    const url = `${origin}/blog/${id}/`;
    const $ = await readHtml(fixture.dist, `/blog/${id}/`);
    const data = schemas($);
    const post = data.find((entry) => entry['@type'] === 'BlogPosting');
    expect(post).toMatchObject({
      headline: title,
      description: 'SEO fixture',
      datePublished: '2026-01-02T00:00:00.000Z',
      dateModified: id === 'hero' ? '2026-02-03T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
      mainEntityOfPage: url,
    });
    const image = String(post!.image);
    expect(image).toBe($('meta[property="og:image"]').attr('content'));
    const emitted = await readFile(join(fixture.dist, new URL(image).pathname));
    const source = await readFile(
      join(fixture.root, 'src/assets', id === 'hero' ? 'logo.svg' : 'og-default.png'),
    );
    expect(emitted.equals(source), 'Metadata must select the expected source image').toBe(true);
    expect(data.find((entry) => entry['@type'] === 'BreadcrumbList')).toMatchObject({
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog/` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    });
  },
);

test('SEO-03: less-than and closing-script text round-trip without breaking JSON-LD', async () => {
  const $ = await readHtml(fixture.dist, '/blog/escaped/');
  expect($('main h1').text()).toBe(escapedTitle);
  expect($('#unexpected-script')).toHaveLength(0);
  const raw = $('script[type="application/ld+json"]').text();
  expect(raw).not.toContain('<');
  expect(raw).toContain('\\u003c');
  expect(schemas($).find((entry) => entry['@type'] === 'BlogPosting')).toMatchObject({
    headline: escapedTitle,
  });
  expect(schemas($).find((entry) => entry['@type'] === 'BreadcrumbList')).toMatchObject({
    itemListElement: expect.arrayContaining([expect.objectContaining({ name: escapedTitle })]),
  });
});

test('SEO-04: error-page filtering retains legitimate 404 article and tag routes', async () => {
  const urls = await sitemapUrls(fixture.dist);
  for (const path of ['/blog/404-guide/', '/blog/tag/404/']) {
    expect(urls).toContain(`${origin}${path}`);
    expect((await readHtml(fixture.dist, path))('h1').text()).not.toBe('');
  }
  for (const path of ['/404/', '/404.html', '/zh/404/']) {
    expect(urls).not.toContain(`${origin}${path}`);
  }
});
