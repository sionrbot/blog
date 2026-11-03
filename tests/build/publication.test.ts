import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import {
  publicationPosts,
  publishedDates,
  publishedPaths,
  publishedTitles,
} from '../fixtures/publication';
import { createFixture } from '../support/build-fixture';
import { startDev } from '../support/dev-server';
import { listPostPaths, readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function publicationOutput(dist: string) {
  const blog = await readHtml(dist, '/blog/');
  const home = await readHtml(dist, '/');
  const shared = await readHtml(dist, '/blog/tag/shared/');
  const craft = await readHtml(dist, '/blog/tag/craft/');
  const rss = rssPosts(await readFile(join(dist, 'rss.xml'), 'utf8'));
  const sitemap = await sitemapUrls(dist);
  const details: string[] = [];
  for (const path of publishedPaths) {
    const $ = await readHtml(dist, path);
    details.push($('main h1').text());
  }
  return {
    blog: listPostPaths(blog.html()),
    home: listPostPaths(home.html()),
    shared: listPostPaths(shared.html()),
    craft: listPostPaths(craft.html()),
    details,
    rss,
    sitemap,
    draftPage: await exists(join(dist, 'blog/secret-draft/index.html')),
    draftTag: await exists(join(dist, 'blog/tag/draft-only/index.html')),
    publicLinks: [blog, home, shared, craft].flatMap(($) =>
      $('a[href]')
        .map((_, element) => $(element).attr('href'))
        .get(),
    ),
  };
}

function assertPublication(output: Awaited<ReturnType<typeof publicationOutput>>) {
  expect(output.draftPage, 'Draft detail must not be emitted').toBe(false);
  expect(output.draftTag, 'A draft-only tag must not become a public route').toBe(false);
  expect(output.blog).toEqual(publishedPaths);
  expect(output.home).toEqual(publishedPaths.slice(0, 6));
  expect(output.shared).toEqual(publishedPaths);
  expect(output.craft).toEqual(['/blog/newest/', '/blog/middle/']);
  expect(output.details).toEqual(publishedTitles);
  expect(output.publicLinks).not.toContain('/blog/secret-draft/');
  expect(output.rss.map((post) => new URL(post.url).pathname)).toEqual(publishedPaths);
  expect(output.rss.map((post) => post.title)).toEqual(publishedTitles);
  expect(output.rss.map((post) => new Date(post.pubDate).toISOString().slice(0, 10))).toEqual(
    publishedDates,
  );
  const articlePaths = output.sitemap
    .map((url) => new URL(url).pathname)
    .filter((path) => /^\/blog\/[^/]+\/$/.test(path));
  expect(articlePaths.toSorted()).toEqual(publishedPaths.toSorted());
  expect(output.sitemap.map((url) => new URL(url).pathname)).not.toContain('/blog/tag/draft-only/');
}

describe('published content across production and development', () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => {
    fixture = await createFixture('publication', { posts: publicationPosts });
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  test('PUB-01/PUB-02: all public surfaces exclude drafts and preserve publication order', async () => {
    assertPublication(await publicationOutput(fixture.dist));
  });

  test('PUB-03: the same fixture exposes drafts through the dev HTTP interface', async () => {
    const server = await startDev(fixture);
    try {
      const detail = await fetch(`${server.url}/blog/secret-draft/`, {
        signal: AbortSignal.timeout(10_000),
      });
      expect(detail.status).toBe(200);
      expect(await detail.text()).toContain('Unpublished fixture secret');
      const listing = await fetch(`${server.url}/blog/`, { signal: AbortSignal.timeout(10_000) });
      expect(listing.status).toBe(200);
      expect(listPostPaths(await listing.text())).toEqual([
        '/blog/secret-draft/',
        ...publishedPaths,
      ]);
    } finally {
      await server.stop();
    }
  });
});

test('publication contract rejects an actual build with draft filtering disabled', async () => {
  const fixture = await createFixture('mutation-publish-drafts', {
    posts: publicationPosts,
    mutation: 'publish-drafts',
  });
  try {
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    const output = await publicationOutput(fixture.dist);
    expect(() => assertPublication(output)).toThrow('Draft detail must not be emitted');
    await writeFile(
      join(fixture.reportDir, 'sensitivity.json'),
      JSON.stringify({
        mutation: 'publish-drafts',
        rejectedBy: 'draft detail must not be emitted',
      }),
    );
  } finally {
    await fixture.dispose();
  }
});
