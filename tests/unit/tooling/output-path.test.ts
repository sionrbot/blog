import { expect, test } from 'vite-plus/test';
import { outputPath } from '../../support/parse-output';

test.each(['/', '/sionrbot-blog/'])(
  'emitted file paths decode URL segments once under %s',
  (base) => {
    const route = `${base}articles/tag/${encodeURIComponent('开源')}/`;
    expect(outputPath(new URL(route, 'https://example.test').pathname, base)).toBe(
      '/articles/tag/开源/',
    );
    expect(outputPath(`${base}articles/100%25/`, base)).toBe('/articles/100%/');
    expect(outputPath(`${base}articles/%2520/`, base)).toBe('/articles/%20/');
  },
);
