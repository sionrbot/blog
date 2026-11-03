import type { FixturePost } from '../support/build-fixture';

// Intentionally shuffled filenames and dates: filesystem order is not publication order.
export const publicationPosts: readonly FixturePost[] = [
  { id: 'middle', title: 'Middle essay', pubDate: '2025-04-04', tags: ['shared', 'craft'] },
  { id: 'oldest', title: 'Oldest essay', pubDate: '2025-01-01', tags: ['shared'] },
  {
    id: 'secret-draft',
    title: 'Unpublished fixture secret',
    pubDate: '2025-12-31',
    tags: ['shared', 'draft-only'],
    draft: true,
  },
  { id: 'newest', title: 'Newest essay', pubDate: '2025-07-07', tags: ['shared', 'craft'] },
  { id: 'second-oldest', title: 'Second oldest essay', pubDate: '2025-02-02', tags: ['shared'] },
  { id: 'second-newest', title: 'Second newest essay', pubDate: '2025-06-06', tags: ['shared'] },
  { id: 'third-oldest', title: 'Third oldest essay', pubDate: '2025-03-03', tags: ['shared'] },
  { id: 'third-newest', title: 'Third newest essay', pubDate: '2025-05-05', tags: ['shared'] },
];

// Independent manifest: do not generate expected results with production helpers.
export const publishedPaths = [
  '/blog/newest/',
  '/blog/second-newest/',
  '/blog/third-newest/',
  '/blog/middle/',
  '/blog/third-oldest/',
  '/blog/second-oldest/',
  '/blog/oldest/',
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
