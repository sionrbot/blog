import { expect, test } from 'vite-plus/test';
import { outputPath } from '../support/parse-output';

test.each(['/', '/sionrbot-blog/'])(
  'emitted file paths decode URL segments once under %s',
  (base) => {
    const route = `${base}blog/tag/${encodeURIComponent('开源')}/`;
    expect(outputPath(new URL(route, 'https://example.test').pathname, base)).toBe(
      '/blog/tag/开源/',
    );
    expect(outputPath(`${base}blog/100%25/`, base)).toBe('/blog/100%/');
    expect(outputPath(`${base}blog/%2520/`, base)).toBe('/blog/%20/');
  },
);
