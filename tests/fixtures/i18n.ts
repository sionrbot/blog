import type { FixturePost } from '../support/build-fixture';

export const englishPost: FixturePost = {
  id: 'original-english',
  title: 'An English original',
  description: 'An unchanged English description.',
  pubDate: '2025-01-12',
  lang: 'en',
  tags: ['shared'],
  body: '## Original section\n\nThis English paragraph stays unchanged.\n\n```js\nconst message = "original";\n```\n\n[Original link](/about/)\n',
};

export const chinesePost: FixturePost = {
  id: 'original-chinese',
  title: '一篇中文原文',
  description: '保持不变的中文摘要。',
  pubDate: '2025-01-11',
  lang: 'zh-Hans',
  tags: ['shared'],
  body: '## 原文小节\n\n这段中文正文保持不变。\n\n```js\nconst message = "中文原文";\n```\n\n[原文链接](/about/)\n',
};

export const i18nPosts: FixturePost[] = [
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `older-${index + 1}`,
    title: `Older article ${index + 1}`,
    pubDate: `2025-01-0${index + 1}`,
    tags: ['shared'],
  })),
  chinesePost,
  englishPost,
];

// Independent expected order, including the second-page boundary.
export const i18nFirstPage = [
  'original-english',
  'original-chinese',
  'older-9',
  'older-8',
  'older-7',
  'older-6',
  'older-5',
  'older-4',
  'older-3',
  'older-2',
];
