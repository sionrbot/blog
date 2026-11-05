import type { GetStaticPaths } from 'astro';
import { blog } from '../config';
import { getPosts, tagSlug } from '../utils/posts';

export const getBlogPaths = (async ({ paginate }) =>
  paginate(await getPosts(), { pageSize: blog.postsPerPage })) satisfies GetStaticPaths;

export const getPostPaths = (async () =>
  (await getPosts()).map((post) => ({
    params: { slug: post.id },
    props: { post },
  }))) satisfies GetStaticPaths;

// Tags share the same content and ordering under both UI routes.
export const getTagPaths = (async () => {
  const posts = await getPosts();
  const tags = new Map<string, string>();
  posts
    .flatMap((p) => p.data.tags)
    .forEach((tag) => tags.has(tagSlug(tag)) || tags.set(tagSlug(tag), tag));
  return [...tags].map(([slug, name]) => ({
    params: { tag: slug },
    props: { name, posts: posts.filter((p) => p.data.tags.some((tag) => tagSlug(tag) === slug)) },
  }));
}) satisfies GetStaticPaths;
