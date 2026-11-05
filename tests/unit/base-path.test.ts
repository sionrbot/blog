import { expect, test } from 'vite-plus/test';
import { withBase, withoutBase } from '../../src/utils/base-path';
import { canonicalPath, isErrorPage, pageIdentity } from '../../src/i18n/paths';
import { localeFromPath } from '../../src/i18n/locales';

const base = '/sionrbot-blog';

test('deployment prefixes are removed only at path-segment boundaries and added once', () => {
  expect(withoutBase('/sionrbot-blog/zh/blog/', base)).toBe('/zh/blog/');
  expect(withoutBase('/sionrbot-blogging/zh/', base)).toBe('/sionrbot-blogging/zh/');
  expect(withBase('/rss.xml', base)).toBe('/sionrbot-blog/rss.xml');
  expect(withBase('/sionrbot-blog/rss.xml', `${base}/`)).toBe('/sionrbot-blog/rss.xml');
  expect(withBase('/', base)).toBe('/sionrbot-blog/');
});

test('subpath pages preserve language identity and canonical policy', () => {
  expect(pageIdentity('/sionrbot-blog/zh/blog/post/?q=1#title', base)).toBe('/blog/post/');
  expect(canonicalPath('/sionrbot-blog/zh/blog/post/', base)).toBe('/sionrbot-blog/blog/post/');
  expect(canonicalPath('/sionrbot-blog/zh/contact/', base)).toBe('/sionrbot-blog/zh/contact/');
  expect(localeFromPath('/sionrbot-blog/zh/blog/', base)).toBe('zh-Hans');
  expect(isErrorPage('/sionrbot-blog/404.html', base)).toBe(true);
  expect(isErrorPage('/sionrbot-blog/zh/404/', base)).toBe(true);
  expect(isErrorPage('/sionrbot-blog/blog/404/', base)).toBe(false);
});
