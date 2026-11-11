import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { paginationCases, paginationPosts } from '../fixtures/pagination';
import { createFixture } from '../support/build-fixture';
import { listPostPaths, readHtml } from '../support/parse-output';

function pathname(href: string | undefined): string | undefined {
  // Astro may emit either slash form; both must resolve to the correct page.
  return href === undefined
    ? undefined
    : new URL(href, 'https://fixture.example').pathname.replace(/\/$/, '');
}

async function paginationOutput(dist: string, pageCount: number) {
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const $ = await readHtml(dist, page === 1 ? '/articles/' : `/articles/${page}/`);
    pages.push({
      paths: listPostPaths($.html()),
      navCount: $('nav[aria-label="Pagination"]').length,
      position: $('nav[aria-label="Pagination"] span').text().trim(),
      previous: $('a[rel="prev"]').attr('href'),
      next: $('a[rel="next"]').attr('href'),
      title: $('title').text(),
      canonical: $('link[rel="canonical"]').attr('href'),
    });
  }
  const numberedDirectories = (await readdir(join(dist, 'articles'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();
  return { pages, numberedDirectories };
}

function assertPagination(
  output: Awaited<ReturnType<typeof paginationOutput>>,
  expectedPages: readonly (readonly string[])[],
) {
  expect(output.numberedDirectories).toEqual(
    expectedPages.length === 1 ? [] : expectedPages.length === 2 ? ['2'] : ['2', '3'],
  );
  for (const [index, page] of output.pages.entries()) {
    expect(page.paths, `Page ${index + 1}: exact published article paths`).toEqual(
      expectedPages[index],
    );
    expect(page.navCount).toBe(expectedPages.length === 1 ? 0 : 1);
    if (expectedPages.length > 1) {
      expect(page.position).toBe(`Page ${index + 1} of ${expectedPages.length}`);
    }
    const expectedPrevious =
      index === 0 ? undefined : index === 1 ? '/articles' : `/articles/${index}`;
    const expectedNext = index === expectedPages.length - 1 ? undefined : `/articles/${index + 2}`;
    for (const direction of ['previous', 'next'] as const) {
      const href = page[direction];
      if (href !== undefined) {
        expect(
          new URL(href, 'https://fixture.example').origin,
          `Pagination ${direction} link must stay on the fixture origin`,
        ).toBe('https://fixture.example');
      }
    }
    expect(pathname(page.previous), 'Pagination previous link must target the adjacent page').toBe(
      expectedPrevious,
    );
    expect(pathname(page.next), 'Pagination next link must target the adjacent page').toBe(
      expectedNext,
    );
    expect(page.title).toMatch(
      index === 0 ? /^Blog · / : new RegExp(`^Blog \\(${index + 1}\\) · `),
    );
    expect(page.canonical).toBeDefined();
    expect(new URL(page.canonical!).origin).toBe('https://fixture.example');
    expect(pathname(page.canonical)).toBe(index === 0 ? '/articles' : `/articles/${index + 1}`);
  }
}

for (const scenario of paginationCases) {
  test(`PAGE-01/PAGE-02: ${scenario.count} posts have exact, ordered pages and valid navigation`, async () => {
    const fixture = await createFixture(`pagination-${scenario.count}`, {
      posts: paginationPosts(scenario.count),
    });
    try {
      const result = await fixture.build();
      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      assertPagination(await paginationOutput(fixture.dist, scenario.pages.length), scenario.pages);
    } finally {
      await fixture.dispose();
    }
  });
}

test('pagination contract rejects an actual build with a broken next-page link', async () => {
  const scenario = paginationCases.find((item) => item.count === 11)!;
  const fixture = await createFixture('mutation-break-pagination', {
    posts: paginationPosts(scenario.count),
    mutation: 'break-pagination',
  });
  try {
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    const output = await paginationOutput(fixture.dist, scenario.pages.length);
    expect(() => assertPagination(output, scenario.pages)).toThrow(
      'Pagination next link must target the adjacent page',
    );
    await writeFile(
      join(fixture.reportDir, 'sensitivity.json'),
      JSON.stringify({ mutation: 'break-pagination', rejectedBy: 'next link targets wrong page' }),
    );
  } finally {
    await fixture.dispose();
  }
});

test.each([
  ['external-next', 'next'],
  ['external-prev', 'previous'],
] as const)(
  'pagination contract rejects an actual build with an %s link',
  async (mutation, direction) => {
    const scenario = paginationCases.find((item) => item.count === 11)!;
    const fixture = await createFixture(`mutation-${mutation}`, {
      posts: paginationPosts(scenario.count),
      mutation,
    });
    try {
      const result = await fixture.build();
      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      const output = await paginationOutput(fixture.dist, scenario.pages.length);
      expect(() => assertPagination(output, scenario.pages)).toThrow(
        `Pagination ${direction} link must stay on the fixture origin`,
      );
      await writeFile(
        join(fixture.reportDir, 'sensitivity.json'),
        JSON.stringify({ mutation, rejectedBy: `${direction} link targets an external origin` }),
      );
    } finally {
      await fixture.dispose();
    }
  },
);
