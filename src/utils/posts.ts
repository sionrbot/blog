import { getCollection, type CollectionEntry } from 'astro:content';
import { defaultLocale } from '../i18n/locales';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts show up only in dev. */
export async function getPosts() {
  const posts = await getCollection('blog', (post) => import.meta.env.DEV || !post.data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export const postHref = (post: Post) => `/articles/${post.id}/`;

export const tagSlug = (tag: string) => tag.toLowerCase().trim().replace(/\s+/g, '-');
export const tagHref = (tag: string) => `/articles/tag/${tagSlug(tag)}/`;

export const formatDate = (date: Date, locale: string = defaultLocale) =>
  date.toLocaleDateString(locale === 'zh' ? 'zh-Hans' : locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  });
