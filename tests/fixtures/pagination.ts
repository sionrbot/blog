import type { FixturePost } from '../support/build-fixture';

/** Source data is ascending; the manually enumerated manifest expects descending publication. */
export function paginationPosts(count: number): FixturePost[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return {
      id: `entry-${day}`,
      title: `Pagination entry ${day}`,
      pubDate: `2025-01-${day}`,
      tags: ['pagination'],
    };
  });
}

const descendingPaths = [
  '/blog/entry-21/',
  '/blog/entry-20/',
  '/blog/entry-19/',
  '/blog/entry-18/',
  '/blog/entry-17/',
  '/blog/entry-16/',
  '/blog/entry-15/',
  '/blog/entry-14/',
  '/blog/entry-13/',
  '/blog/entry-12/',
  '/blog/entry-11/',
  '/blog/entry-10/',
  '/blog/entry-09/',
  '/blog/entry-08/',
  '/blog/entry-07/',
  '/blog/entry-06/',
  '/blog/entry-05/',
  '/blog/entry-04/',
  '/blog/entry-03/',
  '/blog/entry-02/',
  '/blog/entry-01/',
];

// Page boundaries are explicit: 20 must have exactly two full pages, 21 a third page.
export const paginationCases = [
  { count: 1, pages: [descendingPaths.slice(20)] },
  { count: 10, pages: [descendingPaths.slice(11)] },
  { count: 11, pages: [descendingPaths.slice(10, 20), descendingPaths.slice(20)] },
  { count: 20, pages: [descendingPaths.slice(1, 11), descendingPaths.slice(11)] },
  {
    count: 21,
    pages: [descendingPaths.slice(0, 10), descendingPaths.slice(10, 20), descendingPaths.slice(20)],
  },
];
