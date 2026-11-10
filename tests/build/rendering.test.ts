import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { createFixture } from '../support/build-fixture';
import { readHtml } from '../support/parse-output';

const formats = ['md', 'mdx'] as const;
let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeAll(async () => {
  fixture = await createFixture('content-rendering', { posts: [] });
  const bodies = {
    math: String.raw`Inline $x^2 + 1$.

$$
\frac{a}{b} = c
$$

Chemistry $\ce{H2O}$.
`,
    invalid: String.raw`Invalid formula $\frac{a}{$ remains readable.`,
    plain: `A page without mathematics.

| Item | Value |
| --- | --- |
| Wide row | ${'long_value_'.repeat(30)} |

- [x] Read the article
- [ ] Subscribe later
`,
  };
  for (const format of formats) {
    for (const [kind, body] of Object.entries(bodies)) {
      await writeFile(
        join(fixture.root, 'src/content/blog', `${kind}-${format}.${format}`),
        `---\ntitle: ${kind} ${format}\ndescription: Content rendering contract\npubDate: 2026-01-01\n---\n\n${body}\n`,
      );
    }
  }
  const result = await fixture.build();
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
});

afterAll(async () => {
  await fixture?.dispose();
});

test.each(formats)(
  'MD-01: %s renders inline, display and chemical math with its stylesheet',
  async (format) => {
    const $ = await readHtml(fixture.dist, `/articles/math-${format}/`);
    expect($('.prose .katex').length).toBe(3);
    expect($('.prose .katex-display').length).toBe(1);
    expect($('.prose .katex-error').length).toBe(0);
    expect(
      $('.prose annotation[encoding="application/x-tex"]')
        .map((_, element) => $(element).text())
        .get(),
    ).toEqual(['x^2 + 1', String.raw`\frac{a}{b} = c`, String.raw`\ce{H2O}`]);
    const chemistry = $('.prose .katex').eq(2);
    expect(
      chemistry
        .find('.katex-mathml semantics > mrow > mi')
        .map((_, element) => $(element).text())
        .get(),
    ).toEqual(['H', 'O']);
    expect(chemistry.find('.katex-mathml msub')).toHaveLength(1);
    expect(chemistry.find('.katex-mathml msub mn').text()).toBe('2');
    expect(chemistry.find('.katex-html').text()).not.toContain(String.raw`\ce`);
    const stylesheet = $('head link[rel="stylesheet"][href*="katex"]').attr('href');
    expect(stylesheet).toBeDefined();
    const css = await readFile(join(fixture.dist, stylesheet!), 'utf8');
    expect(css).toContain('.katex');
  },
);

test.each(formats)(
  'MD-01: %s preserves an invalid formula without failing the build',
  async (format) => {
    const $ = await readHtml(fixture.dist, `/articles/invalid-${format}/`);
    expect($('.prose .katex-error').length).toBe(1);
    expect($('.prose .katex-error').text()).toBe(String.raw`\frac{a}{`);
    expect($('.prose .katex-error').attr('title')).toContain('KaTeX parse error');
    expect($('head link[rel="stylesheet"][href*="katex"]').length).toBe(1);
  },
);

test.each(formats)(
  'MD-02: %s keeps native tables and labeled tasks without loading math CSS',
  async (format) => {
    const $ = await readHtml(fixture.dist, `/articles/plain-${format}/`);
    expect($('head link[rel="stylesheet"][href*="katex"]').length).toBe(0);
    expect($('.prose .katex, .prose .katex-error').length).toBe(0);
    expect($('.prose .table-scroll > table').length).toBe(1);
    expect(
      $('.prose table th')
        .map((_, element) => $(element).text())
        .get(),
    ).toEqual(['Item', 'Value']);
    const checkboxes = $('.prose input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes.map((_, element) => $(element).parent('label').text().trim()).get()).toEqual([
      'Read the article',
      'Subscribe later',
    ]);
    expect(checkboxes.eq(0).attr('checked')).toBeDefined();
    expect(checkboxes.eq(1).attr('checked')).toBeUndefined();
  },
);
