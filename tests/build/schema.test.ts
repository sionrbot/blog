import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createBuiltFixture, createFixture } from '../support/build-fixture';
import { listPostPaths, readHtml } from '../support/parse-output';

test.each([
  {
    id: 'invalid-language',
    field: 'lang',
    invalid: 'pubDate: 2026-01-01\nlang: not_a_language',
    corrected: 'pubDate: 2026-01-01\nlang: fr-CA',
  },
  {
    id: 'invalid-date',
    field: 'pubDate',
    invalid: 'pubDate: not-a-date',
    corrected: 'pubDate: 2026-01-01',
  },
  {
    id: 'missing-hero-alt',
    field: 'heroAlt',
    invalid: 'pubDate: 2026-01-01\nheroImage: ../../assets/og-default.png',
    corrected:
      'pubDate: 2026-01-01\nheroImage: ../../assets/og-default.png\nheroAlt: Schema fixture image',
  },
])('SCHEMA-01: $field rejects invalid content and accepts its correction', async (entry) => {
  for (const valid of [false, true]) {
    const fixture = await createFixture(`schema-${entry.id}-${valid ? 'valid' : 'invalid'}`, {
      posts: [],
    });
    try {
      await writeFile(
        join(fixture.root, 'src/content/blog', `${entry.id}.md`),
        `---\ntitle: Schema control\ndescription: One field changes between invalid and valid content.\n${valid ? entry.corrected : entry.invalid}\n---\n\nSchema control body.\n`,
      );
      const result = await fixture.build();
      const diagnostics = `${result.stdout}\n${result.stderr}`;
      if (!valid) {
        expect(result.code, diagnostics).not.toBe(0);
        expect(result.code, diagnostics).not.toBeNull();
        expect(diagnostics).toContain(entry.id);
        expect(diagnostics).toContain(entry.field);
      } else {
        expect(result.code, diagnostics).toBe(0);
        const page = await readHtml(fixture.dist, `/articles/${entry.id}/`);
        expect(page('main h1').text()).toBe('Schema control');
        if (entry.field === 'heroAlt') {
          const hero = page('article img[alt="Schema fixture image"]');
          expect(hero.length).toBe(1);
          expect(Number(hero.attr('width'))).toBeGreaterThan(0);
          expect(Number(hero.attr('height'))).toBeGreaterThan(0);
        }
      }
    } finally {
      await fixture.dispose();
    }
  }
});

test('SCHEMA-02: omitted tags and draft become an empty tag list and a published post', async () => {
  const fixture = await createFixture('schema-defaults', { posts: [] });
  try {
    await writeFile(
      join(fixture.root, 'src/content/blog/defaults.md'),
      '---\ntitle: Default fields\ndescription: Optional fields are omitted.\npubDate: 2026-01-01\n---\n\nA published article without tags.\n',
    );
    // Read the real parsed collection so publication alone cannot mask draft=undefined.
    await writeFile(
      join(fixture.root, 'src/pages/schema-defaults.astro'),
      `---
import { getCollection } from 'astro:content';
const [post] = await getCollection('blog');
---
<pre id="schema-defaults">{JSON.stringify({ tags: post.data.tags, draft: post.data.draft, lang: post.data.lang })}</pre>
`,
    );
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    const defaults = await readHtml(fixture.dist, '/schema-defaults/');
    expect(JSON.parse(defaults('#schema-defaults').text())).toEqual({
      tags: [],
      draft: false,
      lang: 'en',
    });
    expect(listPostPaths((await readHtml(fixture.dist, '/articles/')).html())).toEqual([
      '/articles/defaults/',
    ]);
    const article = await readHtml(fixture.dist, '/articles/defaults/');
    expect(article('main h1').text()).toBe('Default fields');
    expect(article('article a[href^="/articles/tag/"]').length).toBe(0);
  } finally {
    await fixture.dispose();
  }
});

test('A0: an invalid description fails for that field and the corrected fixture builds', async () => {
  const posts = [
    { id: 'description-control', title: 'Description control', pubDate: '2026-01-01', tags: [] },
  ];
  const invalid = await createFixture('invalid-description', {
    posts: posts.map((post) => ({ ...post, description: 'x'.repeat(161) })),
  });
  try {
    const result = await invalid.build();
    expect(result.code).not.toBe(0);
    expect(result.code).not.toBeNull();
    expect(`${result.stdout}\n${result.stderr}`).toContain('description-control');
    expect(`${result.stdout}\n${result.stderr}`).toContain('description');
  } finally {
    await invalid.dispose();
  }
  const corrected = await createBuiltFixture({ name: 'corrected-description', posts });
  try {
    expect(listPostPaths((await readHtml(corrected.dist, '/articles/')).html())).toEqual([
      '/articles/description-control/',
    ]);
  } finally {
    await corrected.dispose();
  }
});
