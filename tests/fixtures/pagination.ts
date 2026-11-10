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
  '/articles/entry-21/',
  '/articles/entry-20/',
  '/articles/entry-19/',
  '/articles/entry-18/',
  '/articles/entry-17/',
  '/articles/entry-16/',
  '/articles/entry-15/',
  '/articles/entry-14/',
  '/articles/entry-13/',
  '/articles/entry-12/',
  '/articles/entry-11/',
  '/articles/entry-10/',
  '/articles/entry-09/',
  '/articles/entry-08/',
  '/articles/entry-07/',
  '/articles/entry-06/',
  '/articles/entry-05/',
  '/articles/entry-04/',
  '/articles/entry-03/',
  '/articles/entry-02/',
  '/articles/entry-01/',
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
