import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { createFixture, projectRoot } from '../support/build-fixture';
import { startDev } from '../support/dev-server';
import { readHtml, sitemapUrls } from '../support/parse-output';

const run = promisify(execFile);
interface SearchResult {
  url: string;
  content: string;
  meta: Record<string, string>;
}

interface QueryResult {
  query: string | null;
  results: readonly SearchResult[];
}

describe.each(['/', '/sionrbot-blog/', '/blog/'])('search under %s', (base) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  let entry: { languages: Record<string, { page_count: number }> };
  const queries = [
    null,
    '自由软件',
    '寒蝉效应',
    '计算在谁的机器上',
    'AI',
    'GPL',
    'Astro',
    'deliberatelyunique',
    'Draftsecret',
    'privacy',
    '开源',
  ];
  const searchesByLocale = new Map<string, readonly QueryResult[]>();

  beforeAll(async () => {
    fixture = await createFixture('search', {
      posts: [
        {
          id: 'chinese',
          title: '自由软件',
          description: '计算在谁的机器上',
          pubDate: '2026-10-13',
          lang: 'zh-Hans',
          tags: ['privacy', '开源'],
          body: '自由软件可以保护隐私。被看着的人也会变。法学里管这个叫寒蝉效应。AI 和 GPL。',
        },
        {
          id: 'english',
          title: 'Building with Astro',
          pubDate: '2026-01-01',
          tags: ['development'],
          body: 'Astro generates static sites. A deliberatelyunique searchable body term.',
        },
        {
          id: 'draft',
          title: 'Draftsecret',
          pubDate: '2026-01-01',
          tags: [],
          draft: true,
          body: 'Draftsecret must never enter the search index.',
        },
      ],
    });
    fixture.env.SITE_URL = `https://fixture.example${base}`;
    const build = await fixture.build();
    expect(build.code, `${build.stdout}\n${build.stderr}`).toBe(0);
    const directory = join(fixture.dist, 'pagefind');
    entry = JSON.parse(await readFile(join(directory, 'pagefind-entry.json'), 'utf8'));
    for (const locale of ['en', 'zh-Hans']) {
      const { stdout } = await run(process.execPath, [
        join(projectRoot, 'tests/support/search-index.mjs'),
        directory,
        base,
        locale,
        JSON.stringify(queries),
      ]);
      searchesByLocale.set(locale, JSON.parse(stdout) as QueryResult[]);
    }
  });
  afterAll(async () => fixture?.dispose());

  test.each(['', 'zh/'])(
    'global search dialog %s wires the bundle and localized article routes',
    async (localePrefix) => {
      for (const path of [`/${localePrefix}`, `/${localePrefix}articles/chinese/`]) {
        const page = await readHtml(fixture.dist, path);
        const dialog = page('dialog[data-search-dialog]');
        expect(dialog, `${path}: one global dialog`).toHaveLength(1);
        expect(dialog.attr('open'), `${path}: initially closed`).toBeUndefined();
        const search = dialog.find('[data-search]');
        expect(search, `${path}: one search panel`).toHaveLength(1);
        expect(search.attr('data-bundle'), `${path}: bundle`).toBe(`${base}pagefind/pagefind.js`);
        expect(search.attr('data-base'), `${path}: deployment base`).toBe(base);
        expect(search.attr('data-post-base'), `${path}: article routes`).toBe(
          `${base}${localePrefix}articles/`,
        );
        expect(page('header button[data-search-open]'), `${path}: search trigger`).toHaveLength(1);
        expect(page(`a[href="${base}${localePrefix}search/"]`)).toHaveLength(0);
      }
      await expect(readHtml(fixture.dist, `/${localePrefix}search/`)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  test('removed search pages are absent from the sitemap', async () => {
    const urls = await sitemapUrls(fixture.dist, base);
    expect(urls.some((url) => /\/(?:zh\/)?search\/$/.test(new URL(url).pathname))).toBe(false);
  });

  test.each(['', 'zh/'])(
    'article UI %s retains authored search metadata and marks only the original for indexing',
    async (localePrefix) => {
      const path = `/${localePrefix}articles/chinese/`;
      const post = await readHtml(fixture.dist, path);
      expect(post('h1[data-pagefind-meta="title"]').text().trim(), `${path}: title`).toBe(
        '自由软件',
      );
      expect(post('h1[data-pagefind-meta="title"]').attr('lang'), `${path}: title language`).toBe(
        'zh-Hans',
      );
      expect(post('article').attr('data-content-lang'), `${path}: content language`).toBe(
        'zh-Hans',
      );
      expect(post('[data-search-post]'), `${path}: indexing marker`).toHaveLength(
        localePrefix ? 0 : 1,
      );
    },
  );

  test('Pagefind format compatibility: one zh index stores the two published originals', () => {
    expect(Object.keys(entry.languages)).toEqual(['zh']);
    expect(entry.languages.zh.page_count).toBe(2);
  });

  test.each(['en', 'zh-Hans'])(
    'index content for %s contains each published original once without navigation or drafts',
    (locale) => {
      const searches = searchesByLocale.get(locale)!;
      expect(searches[0].results.map((result) => result.meta.slug).sort()).toEqual([
        'chinese',
        'english',
      ]);
      for (const search of searches) {
        for (const result of search.results) {
          const context = `${locale}: ${search.query}: ${result.meta.slug}`;
          expect(result.url, `${context}: article URL`).toBe(
            `${base}articles/${result.meta.slug}/`,
          );
          expect(result.content, `${context}: navigation excluded`).not.toContain('Back to blog');
          expect(result.content, `${context}: draft excluded`).not.toContain('Draftsecret');
        }
      }
      expect(searches[8].results, `${locale}: Draftsecret`).toEqual([]);
    },
  );

  test.each(['en', 'zh-Hans'])(
    'real Pagefind queries for %s find Chinese and English titles, bodies, descriptions and tags',
    (locale) => {
      const searches = searchesByLocale.get(locale)!;
      for (const search of searches.slice(1, 6)) {
        expect(
          search.results.map((result) => result.meta.slug),
          `${locale}: ${search.query}`,
        ).toEqual(['chinese']);
      }
      for (const search of searches.slice(6, 8)) {
        expect(
          search.results.map((result) => result.meta.slug),
          `${locale}: ${search.query}`,
        ).toEqual(['english']);
      }
      for (const search of searches.slice(9)) {
        expect(
          search.results.map((result) => result.meta.slug),
          `${locale}: ${search.query}`,
        ).toEqual(['chinese']);
      }
    },
  );

  test.each(['en', 'zh-Hans'])(
    'query metadata for %s preserves the original title, language, description, date and tags',
    (locale) => {
      const searches = searchesByLocale.get(locale)!;
      expect(searches[1].results[0].meta).toMatchObject({
        title: '自由软件',
        lang: 'zh-Hans',
        description: '计算在谁的机器上',
        pubDate: '2026-10-13T00:00:00.000Z',
        tags: '["privacy","开源"]',
      });
    },
  );

  test('dev serves the emitted Pagefind index and JavaScript while rejecting traversal', async () => {
    const dev = await startDev(fixture, base);
    try {
      const response = await fetch(`${dev.url}${base}pagefind/pagefind-entry.json`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(entry);
      const runtime = await fetch(`${dev.url}${base}pagefind/pagefind.js`);
      expect(runtime.headers.get('content-type')).toBe('text/javascript');
      expect(await runtime.text()).toContain('pagefind_version');
      const traversal = await fetch(`${dev.url}${base}pagefind/%2e%2e%2fpackage.json`);
      expect(traversal.status).toBe(404);
    } finally {
      await dev.stop();
    }
  });
});
