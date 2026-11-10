import type { FixturePost } from '../support/build-fixture';

// Intentionally shuffled filenames and dates: filesystem order is not publication order.
export const publicationPosts: readonly FixturePost[] = [
  {
    id: 'middle',
    title: 'Middle essay',
    pubDate: '2025-04-04',
    tags: ['shared', 'craft', '  slow   reading  '],
  },
  { id: 'oldest', title: 'Oldest essay', pubDate: '2025-01-01', tags: ['shared', 'SLOW READING'] },
  {
    id: 'secret-draft',
    title: 'Unpublished fixture secret',
    pubDate: '2025-12-31',
    tags: ['shared', 'draft-only', 'Slow Reading'],
    draft: true,
  },
  {
    id: 'newest',
    title: 'Newest essay',
    pubDate: '2025-07-07',
    tags: ['shared', 'craft', 'Slow Reading', ' slow reading '],
  },
  { id: 'second-oldest', title: 'Second oldest essay', pubDate: '2025-02-02', tags: ['shared'] },
  { id: 'second-newest', title: 'Second newest essay', pubDate: '2025-06-06', tags: ['shared'] },
  { id: 'third-oldest', title: 'Third oldest essay', pubDate: '2025-03-03', tags: ['shared'] },
  { id: 'third-newest', title: 'Third newest essay', pubDate: '2025-05-05', tags: ['shared'] },
];

// Independent manifest: do not generate expected results with production helpers.
export const publishedPaths = [
  '/articles/newest/',
  '/articles/second-newest/',
  '/articles/third-newest/',
  '/articles/middle/',
  '/articles/third-oldest/',
  '/articles/second-oldest/',
  '/articles/oldest/',
];

export const publishedTitles = [
  'Newest essay',
  'Second newest essay',
  'Third newest essay',
  'Middle essay',
  'Third oldest essay',
  'Second oldest essay',
  'Oldest essay',
];

export const publishedDates = [
  '2025-07-07',
  '2025-06-06',
  '2025-05-05',
  '2025-04-04',
  '2025-03-03',
  '2025-02-02',
  '2025-01-01',
];
