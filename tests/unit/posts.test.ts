import { describe, expect, it } from 'vite-plus/test';
import { getPosts, postHref, tagHref, tagSlug, type Post } from '../../src/utils/posts';

const post = {
  id: 'notes/a-reading-list',
  collection: 'blog',
  data: {
    lang: 'en',
    title: 'A reading list',
    description: 'Notes on books.',
    pubDate: new Date('2026-01-01T00:00:00Z'),
    tags: [],
    draft: false,
  },
} satisfies Post;

describe('post and tag links', () => {
  it.each([
    ['Reading', 'reading'],
    ['  Slow Reading  ', 'slow-reading'],
    ['Slow\t \nReading', 'slow-reading'],
    ['한국어', '한국어'],
    ['notes-and-essays', 'notes-and-essays'],
  ])('normalizes %j to the tag slug %j', (tag, slug) => {
    expect(tagSlug(tag)).toBe(slug);
  });

  it('links to the normalized tag route with a trailing slash', () => {
    expect(tagHref('  Slow   Reading ')).toBe('/articles/tag/slow-reading/');
  });

  it('preserves the content entry id in the article route', () => {
    expect(postHref(post)).toBe('/articles/notes/a-reading-list/');
  });
});

it('rejects collection access in the unit test boundary', async () => {
  await expect(getPosts()).rejects.toThrow(
    'astro:content is unavailable in unit tests; use a real Astro build instead.',
  );
});
