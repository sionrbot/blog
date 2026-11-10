import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vite-plus/test';
import { createFixture, projectRoot } from '../support/build-fixture';
import { startDev } from '../support/dev-server';
import { readHtml } from '../support/parse-output';

const run = promisify(execFile);
interface SearchResult {
  url: string;
  content: string;
  meta: Record<string, string>;
}

for (const base of ['/', '/sionrbot-blog/', '/blog/']) {
  test(`search indexes published originals once under ${base} for either UI language`, async () => {
    const fixture = await createFixture('search', {
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
    try {
      fixture.env.SITE_URL = `https://fixture.example${base}`;
      const build = await fixture.build();
      expect(build.code, `${build.stdout}\n${build.stderr}`).toBe(0);
      for (const localePrefix of ['', 'zh/']) {
        const page = await readHtml(fixture.dist, `/${localePrefix}search/`);
        const search = page('[data-search]');
        expect(search.attr('data-bundle')).toBe(`${base}pagefind/pagefind.js`);
        expect(search.attr('data-base')).toBe(base);
        expect(search.attr('data-post-base')).toBe(`${base}${localePrefix}articles/`);
        expect(page('form[role="search"]').attr('action')).toBe(`${base}${localePrefix}search/`);
        expect(page('header nav a[aria-current="page"]').attr('href')).toBe(
          `${base}${localePrefix}search/`,
        );
        const post = await readHtml(fixture.dist, `/${localePrefix}articles/chinese/`);
        expect(post(`header nav a[href="${base}${localePrefix}search/"]`)).toHaveLength(1);
        expect(post('h1[data-pagefind-meta="title"]').text().trim()).toBe('自由软件');
        expect(post('h1[data-pagefind-meta="title"]').attr('lang')).toBe('zh-Hans');
        expect(post('article').attr('data-content-lang')).toBe('zh-Hans');
        expect(post('[data-search-post]')).toHaveLength(localePrefix ? 0 : 1);
      }
      const directory = join(fixture.dist, 'pagefind');
      const entry = JSON.parse(await readFile(join(directory, 'pagefind-entry.json'), 'utf8'));
      expect(Object.keys(entry.languages)).toEqual(['zh']);
      expect(entry.languages.zh.page_count).toBe(2);
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
      for (const locale of ['en', 'zh-Hans']) {
        const { stdout } = await run(process.execPath, [
          join(projectRoot, 'tests/support/search-index.mjs'),
          directory,
          base,
          locale,
          JSON.stringify(queries),
        ]);
        const searches = JSON.parse(stdout) as { query: string | null; results: SearchResult[] }[];
        expect(searches[0].results.map((result) => result.meta.slug).sort()).toEqual([
          'chinese',
          'english',
        ]);
        for (const search of searches) {
          for (const result of search.results) {
            expect(result.url).toBe(`${base}articles/${result.meta.slug}/`);
            expect(result.content).not.toContain('Back to blog');
            expect(result.content).not.toContain('Draftsecret');
          }
        }
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
        expect(searches[8].results).toEqual([]);
        for (const search of searches.slice(9)) {
          expect(search.results.map((result) => result.meta.slug)).toEqual(['chinese']);
        }
        expect(searches[1].results[0].meta).toMatchObject({
          title: '自由软件',
          lang: 'zh-Hans',
          description: '计算在谁的机器上',
          pubDate: '2026-10-13T00:00:00.000Z',
          tags: '["privacy","开源"]',
        });
      }
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
    } finally {
      await fixture.dispose();
    }
  });
}
