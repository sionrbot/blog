import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { site } from '../../src/config';
import { chinesePost, englishPost, i18nFirstPage, i18nPosts } from '../fixtures/i18n';
import { createFixture, projectRoot } from '../support/build-fixture';
import { outputPath, readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

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
  fixture = await createFixture('seo', { posts: i18nPosts });
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

describe.each(['default', 'override'] as const)('SEO-01: %s deployment', (variant) => {
  const dist = () => (variant === 'default' ? join(projectRoot, 'dist') : fixture.dist);
  const deployment = new URL(variant === 'default' ? (process.env.SITE_URL ?? site.url) : origin);
  const expectedOrigin = deployment.origin;
  const base = deployment.pathname;
  const home = `${expectedOrigin}${base.replace(/\/$/, '')}/`;

  test('indexed pages agree with their canonical and Open Graph URLs', async () => {
    const urls = await sitemapUrls(dist(), base);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).origin, url).toBe(expectedOrigin);
      const $ = await readHtml(dist(), outputPath(new URL(url).pathname, base));
      expect($('link[rel="canonical"]').attr('href'), url).toBe(url);
      expect($('meta[property="og:url"]').attr('content'), url).toBe(url);
    }
  });

  test('Open Graph and Twitter images resolve to emitted files on the deployment origin', async () => {
    for (const url of await sitemapUrls(dist(), base)) {
      const $ = await readHtml(dist(), outputPath(new URL(url).pathname, base));
      for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        const image = $(selector).attr('content')!;
        expect(new URL(image).origin, `${url}: ${selector}`).toBe(expectedOrigin);
        await access(join(dist(), outputPath(new URL(image).pathname, base)));
      }
    }
  });

  test('structured data uses the deployment home, article URL and image origin', async () => {
    for (const url of await sitemapUrls(dist(), base)) {
      const $ = await readHtml(dist(), outputPath(new URL(url).pathname, base));
      const data = schemas($);
      expect(
        data.find((entry) => entry['@type'] === 'WebSite'),
        url,
      ).toMatchObject({
        url: home,
        publisher: { url: home },
      });
      const post = data.find((entry) => entry['@type'] === 'BlogPosting');
      if (post) {
        expect(post.mainEntityOfPage, url).toBe(url);
        expect(new URL(String(post.image)).origin, url).toBe(expectedOrigin);
      }
    }
  });

  test('RSS, sitemap index and robots point to the deployment origin', async () => {
    for (const file of ['rss.xml', 'sitemap-index.xml']) {
      const xml = load(await readFile(join(dist(), file), 'utf8'), { xml: true });
      const links = xml(file === 'rss.xml' ? 'link' : 'loc');
      expect(links.length, file).toBeGreaterThan(0);
      for (const link of links.toArray())
        expect(new URL(xml(link).text()).origin, file).toBe(expectedOrigin);
    }
    expect(await readFile(join(dist(), 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${home}sitemap-index.xml`,
    );
  });
});

describe.each(['fallback', 'hero'] as const)('SEO-02: %s article', (id) => {
  const title = id === 'hero' ? 'Hero article' : 'Fallback article';
  const url = `${origin}/articles/${id}/`;

  test('structured article metadata retains publication and modification dates', async () => {
    const $ = await readHtml(fixture.dist, `/articles/${id}/`);
    expect(schemas($).find((entry) => entry['@type'] === 'BlogPosting')).toMatchObject({
      headline: title,
      description: 'SEO fixture',
      datePublished: '2026-01-02T00:00:00.000Z',
      dateModified: id === 'hero' ? '2026-02-03T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
      mainEntityOfPage: url,
    });
  });

  test('metadata selects the expected hero or fallback image bytes', async () => {
    const $ = await readHtml(fixture.dist, `/articles/${id}/`);
    const post = schemas($).find((entry) => entry['@type'] === 'BlogPosting');
    const image = String(post!.image);
    expect(image).toBe($('meta[property="og:image"]').attr('content'));
    const emitted = await readFile(join(fixture.dist, new URL(image).pathname));
    const source = await readFile(
      join(fixture.root, 'src/assets', id === 'hero' ? 'logo.svg' : 'og-default.png'),
    );
    expect(emitted.equals(source), 'Metadata must select the expected source image').toBe(true);
  });

  test('breadcrumbs identify home, article list and the current article', async () => {
    const $ = await readHtml(fixture.dist, `/articles/${id}/`);
    expect(schemas($).find((entry) => entry['@type'] === 'BreadcrumbList')).toMatchObject({
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/articles/` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    });
  });
});

test('SEO-03: less-than and closing-script text round-trip without breaking JSON-LD', async () => {
  const $ = await readHtml(fixture.dist, '/articles/escaped/');
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
  for (const path of ['/articles/404-guide/', '/articles/tag/404/']) {
    expect(urls).toContain(`${origin}${path}`);
    expect((await readHtml(fixture.dist, path))('h1').text()).not.toBe('');
  }
  for (const path of ['/404/', '/404.html', '/zh/404/']) {
    expect(urls).not.toContain(`${origin}${path}`);
  }
});

// The full language/canonical policy lives here; i18n and base-path retain wiring checks.
test('SEO-05: shared originals prefer English URLs while translated Contact pages self-canonicalize', async () => {
  for (const prefix of ['', '/zh']) {
    for (const route of [
      '/',
      '/articles/',
      '/articles/2/',
      '/articles/tag/shared/',
      '/about/',
      '/contact/',
      '/privacy/',
      '/terms/',
      '/articles/original-english/',
      '/articles/original-chinese/',
    ]) {
      const path = `${prefix}${route}`;
      const $ = await readHtml(fixture.dist, path);
      const preferredUrl = `${origin}${route === '/contact/' ? prefix : ''}${route}`;
      expect($('link[rel="canonical"]').attr('href'), path).toBe(preferredUrl);
      expect($('meta[property="og:url"]').attr('content'), path).toBe(preferredUrl);
      expect($('link[rel="alternate"][hreflang="en"]').attr('href'), path).toBe(
        `${origin}${route}`,
      );
      expect($('link[rel="alternate"][hreflang="zh-Hans"]').attr('href'), path).toBe(
        `${origin}/zh${route}`,
      );
      expect($('meta[property="og:locale"]'), path).toHaveLength(0);
    }
  }
});

test('SEO-06: article structured data retains original language in both UI renderings', async () => {
  for (const post of [englishPost, chinesePost]) {
    for (const prefix of ['', '/zh']) {
      const path = `${prefix}/articles/${post.id}/`;
      const $ = await readHtml(fixture.dist, path);
      expect(
        schemas($).find((schema) => schema['@type'] === 'BlogPosting'),
        path,
      ).toMatchObject({
        headline: post.title,
        inLanguage: post.lang,
        datePublished: `${post.pubDate}T00:00:00.000Z`,
        mainEntityOfPage: `${origin}/articles/${post.id}/`,
      });
    }
  }
});

test('SEO-07: sitemap includes both Contact translations and only preferred original URLs', async () => {
  const urls = await sitemapUrls(fixture.dist);
  expect(urls).toContain(`${origin}/contact/`);
  expect(urls.filter((url) => new URL(url).pathname.startsWith('/zh/'))).toEqual([
    `${origin}/zh/contact/`,
  ]);
  for (const post of i18nPosts) expect(urls).toContain(`${origin}/articles/${post.id}/`);
});

test('SEO-07: sitemap original entries retain both UI language alternates', async () => {
  const index = load(await readFile(join(fixture.dist, 'sitemap-index.xml'), 'utf8'), {
    xml: true,
  });
  const alternates: { en: string | undefined; zh: string | undefined }[] = [];
  for (const shard of index('loc').toArray()) {
    const path = new URL(index(shard).text()).pathname;
    const xml = load(await readFile(join(fixture.dist, path), 'utf8'), { xml: true });
    const entry = xml('url').filter(
      (_, item) => xml(item).find('loc').text() === `${origin}/articles/original-english/`,
    );
    for (const item of entry.toArray()) {
      alternates.push({
        en: xml(item).find('[hreflang="en"]').attr('href'),
        zh: xml(item).find('[hreflang="zh-Hans"]').attr('href'),
      });
    }
  }
  expect(alternates).toEqual([
    { en: `${origin}/articles/original-english/`, zh: `${origin}/zh/articles/original-english/` },
  ]);
});

test('SEO-08: mixed-language RSS contains each original once without a single-language declaration', async () => {
  const rss = await readFile(join(fixture.dist, 'rss.xml'), 'utf8');
  const urls = rssPosts(rss).map((post) => post.url);
  // SEO-specific entries share a date; their tie order is not a product contract.
  expect(urls.slice(0, 4).toSorted()).toEqual(
    ['404-guide', 'escaped', 'fallback', 'hero'].map((id) => `${origin}/articles/${id}/`),
  );
  expect(urls.slice(4)).toEqual(
    [...i18nFirstPage, 'older-1'].map((id) => `${origin}/articles/${id}/`),
  );
  expect(load(rss, { xml: true })('channel > language')).toHaveLength(0);
});
