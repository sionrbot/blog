import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { createFixture } from '../support/build-fixture';
import { readHtml } from '../support/parse-output';

const pages = [
  ['about', 'About', '关于'],
  ['privacy', 'Privacy', '隐私'],
  ['terms', 'Terms', '条款'],
] as const;
let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeAll(async () => {
  fixture = await createFixture('page-math', { posts: [] });
  for (const [page] of pages) {
    await appendFile(join(fixture.root, `src/content/pages/${page}.mdx`), '\n\nMath $x^2$.\n');
  }
  await writeFile(
    join(fixture.root, 'src/pages/legacy-math.mdx'),
    '---\nlayout: ../layouts/PageLayout.astro\ntitle: Legacy math\n---\n\nMath $x^2$.\n',
  );
  const result = await fixture.build();
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
});

afterAll(async () => fixture?.dispose());

test.each(pages)(
  '%s forwards math metadata while preserving translated titles',
  async (page, en, zh) => {
    for (const [prefix, title] of [
      ['', en],
      ['/zh', zh],
    ]) {
      const $ = await readHtml(fixture.dist, `${prefix}/${page}/`);
      expect($('h1').text()).toBe(title);
      expect($('title').text()).toContain(title);
      expect($('.prose .katex')).toHaveLength(1);
      const stylesheet = $('head link[rel="stylesheet"][href*="katex"]').attr('href');
      expect(stylesheet).toBeDefined();
      expect(await readFile(join(fixture.dist, stylesheet!), 'utf8')).toContain('.katex');
    }
  },
);

test('direct MDX layouts retain frontmatter math compatibility', async () => {
  const $ = await readHtml(fixture.dist, '/legacy-math/');
  expect($('h1').text()).toBe('Legacy math');
  expect($('.prose .katex')).toHaveLength(1);
  expect($('head link[rel="stylesheet"][href*="katex"]')).toHaveLength(1);
});

test('plain pages do not load the math stylesheet', async () => {
  for (const route of ['/contact/', '/zh/contact/']) {
    const $ = await readHtml(fixture.dist, route);
    expect($('.katex')).toHaveLength(0);
    expect($('head link[rel="stylesheet"][href*="katex"]')).toHaveLength(0);
  }
});
