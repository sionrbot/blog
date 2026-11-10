import { expect, test } from 'vite-plus/test';
import { withBase, withoutBase } from '../../src/utils/base-path';
import { canonicalPath, isErrorPage, pageIdentity } from '../../src/i18n/paths';
import { localeFromPath } from '../../src/i18n/locales';

const base = '/sionrbot-blog';

test('deployment prefixes are removed at path-segment boundaries and added to site-relative paths', () => {
  expect(withoutBase('/sionrbot-blog/zh/articles/', base)).toBe('/zh/articles/');
  expect(withoutBase('/sionrbot-blogging/zh/', base)).toBe('/sionrbot-blogging/zh/');
  expect(withBase('/rss.xml', base)).toBe('/sionrbot-blog/rss.xml');
  expect(withBase('/rss.xml', `${base}/`)).toBe('/sionrbot-blog/rss.xml');
  expect(withBase('/', base)).toBe('/sionrbot-blog/');
});

test('subpath pages preserve language identity and canonical policy', () => {
  expect(pageIdentity('/sionrbot-blog/zh/articles/post/?q=1#title', base)).toBe('/articles/post/');
  expect(canonicalPath('/sionrbot-blog/zh/articles/post/', base)).toBe(
    '/sionrbot-blog/articles/post/',
  );
  expect(canonicalPath('/sionrbot-blog/zh/contact/', base)).toBe('/sionrbot-blog/zh/contact/');
  expect(localeFromPath('/sionrbot-blog/zh/articles/', base)).toBe('zh-Hans');
  expect(isErrorPage('/sionrbot-blog/404.html', base)).toBe(true);
  expect(isErrorPage('/sionrbot-blog/zh/404/', base)).toBe(true);
  expect(isErrorPage('/sionrbot-blog/articles/404/', base)).toBe(false);
});

test('a deployment prefix matching a site route preserves both path segments', () => {
  const base = '/blog';
  expect(withBase('/blog/', base)).toBe('/blog/blog/');
  expect(withBase('/blog/post/', `${base}/`)).toBe('/blog/blog/post/');
  expect(withoutBase('/blog/blog/post/', base)).toBe('/blog/post/');
  expect(pageIdentity('/blog/zh/articles/post/?q=1#title', base)).toBe('/articles/post/');
  expect(canonicalPath('/blog/articles/post/', base)).toBe('/blog/articles/post/');
  expect(canonicalPath('/blog/zh/articles/post/', base)).toBe('/blog/articles/post/');
  expect(canonicalPath('/blog/zh/contact/', base)).toBe('/blog/zh/contact/');
});
