import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { chinesePost, englishPost, i18nFirstPage, i18nPosts } from '../fixtures/i18n';
import { createFixture } from '../support/build-fixture';
import { listPostPaths, readHtml, rssPosts, sitemapUrls } from '../support/parse-output';

let fixture: Awaited<ReturnType<typeof createFixture>>;
const origin = 'https://fixture.example';
beforeAll(async () => {
  fixture = await createFixture('i18n', { posts: i18nPosts });
  const result = await fixture.build();
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
});
afterAll(async () => fixture?.dispose());

test('I18N-B0: explicit error pages localize and switch between actual routes without indexing', async () => {
  for (const [path, lang, title] of [
    ['/404.html', 'en', 'Page not found'],
    ['/zh/404/', 'zh-Hans', '页面未找到'],
  ]) {
    const $ = await readHtml(fixture.dist, path);
    expect($('html').attr('lang')).toBe(lang);
    expect($('h1').text()).toBe(title);
    expect($('meta[name="robots"]').attr('content')).toContain('noindex');
    expect($('link[rel="canonical"]')).toHaveLength(0);
    expect($('a[hreflang="en"]').attr('href')).toBe('/404.html');
    expect($('a[hreflang="zh-Hans"]').attr('href')).toBe('/zh/404/');
  }
});

test('I18N-B1: both static UI routes contain localized navigation and matching page identities', async () => {
  for (const [prefix, lang, blog] of [
    ['', 'en', 'Blog'],
    ['/zh', 'zh-Hans', '博客'],
  ]) {
    for (const route of [
      '/',
      '/blog/',
      '/blog/2/',
      '/blog/tag/shared/',
      '/about/',
      '/contact/',
      '/privacy/',
      '/terms/',
    ]) {
      const $ = await readHtml(fixture.dist, `${prefix}${route}`);
      expect($('html').attr('lang')).toBe(lang);
      expect($(`header a[href="${prefix}/blog/"]`).text()).toContain(blog);
      expect($('a[hreflang="en"]').attr('href')).toBe(route);
      expect($('a[hreflang="zh-Hans"]').attr('href')).toBe(`/zh${route}`);
      expect($('a[hreflang][aria-current="page"]').attr('hreflang')).toBe(lang);
      const preferredUrl = `${origin}${route === '/contact/' ? prefix : ''}${route}`;
      expect($('link[rel="canonical"]').attr('href')).toBe(preferredUrl);
      expect($('meta[property="og:url"]').attr('content')).toBe(preferredUrl);
      expect($('link[rel="alternate"][hreflang="en"]').attr('href')).toBe(`${origin}${route}`);
      expect($('link[rel="alternate"][hreflang="zh-Hans"]').attr('href')).toBe(
        `${origin}/zh${route}`,
      );
      expect($('meta[property="og:locale"]')).toHaveLength(0);
    }
    expect(
      listPostPaths((await readHtml(fixture.dist, `${prefix}/blog/tag/shared/`)).html()),
    ).toEqual([...i18nFirstPage, 'older-1'].map((id) => `${prefix}/blog/${id}/`));
    for (const base of ['/blog']) {
      expect(listPostPaths((await readHtml(fixture.dist, `${prefix}${base}/`)).html())).toEqual(
        i18nFirstPage.map((id) => `${prefix}/blog/${id}/`),
      );
      expect(listPostPaths((await readHtml(fixture.dist, `${prefix}${base}/2/`)).html())).toEqual([
        `${prefix}/blog/older-1/`,
      ]);
    }
  }
});

test('I18N-B2: original article text, links and content language survive both UI renderings', async () => {
  for (const post of [englishPost, chinesePost]) {
    const bodies: string[] = [];
    for (const prefix of ['', '/zh']) {
      const $ = await readHtml(fixture.dist, `${prefix}/blog/${post.id}/`);
      expect($('h1').text()).toBe(post.title);
      expect($('h1').attr('lang')).toBe(post.lang);
      expect($('meta[name="description"]').attr('content')).toBe(post.description);
      const content = $('[data-post-content]');
      expect(content.attr('lang')).toBe(post.lang);
      expect(content.text()).toContain(
        post.lang === 'en' ? 'This English paragraph stays unchanged.' : '这段中文正文保持不变。',
      );
      expect(content.find('a').attr('href')).toBe('/about/');
      expect(content.find('code').text()).toContain(
        post.lang === 'en' ? 'const message = "original";' : 'const message = "中文原文";',
      );
      bodies.push(content.html()!);
      const schemas = JSON.parse($('script[type="application/ld+json"]').text()) as Record<
        string,
        unknown
      >[];
      expect(schemas.find((schema) => schema['@type'] === 'BlogPosting')).toMatchObject({
        headline: post.title,
        inLanguage: post.lang,
        datePublished: `${post.pubDate}T00:00:00.000Z`,
        mainEntityOfPage: `${origin}/blog/${post.id}/`,
      });
      expect($('time').first().attr('datetime')).toBe(`${post.pubDate}T00:00:00.000Z`);
      const day = post.id === 'original-english' ? 12 : 11;
      expect($('time').first().text()).toBe(prefix ? `2025年1月${day}日` : `January ${day}, 2025`);
    }
    expect(bodies[1]).toBe(bodies[0]);
  }
});

test('I18N-B3: Chinese forms and descriptions are static, while author copy stays original', async () => {
  const home = await readHtml(fixture.dist, '/zh/');
  expect(home('h1').text()).toBe('Barely Surviving and Deeply Loving');
  expect(home('h1').closest('[lang]').attr('lang')).toBe('en');
  const newsletterTitle = home('h2').filter(
    (_, heading) => home(heading).text() === 'The Sunday letter',
  );
  expect(newsletterTitle).toHaveLength(1);
  expect(newsletterTitle.attr('lang')).toBe('en');
  expect(home('a[href="#main"]').text()).toContain('跳');
  const contact = await readHtml(fixture.dist, '/zh/contact/');
  expect(contact('h1').text()).toBe('联系');
  expect(contact('label[for="contact-name"]').text()).toContain('姓名');
  expect(contact('label[for="contact-email"]').text()).toContain('邮箱');
  expect(contact('main').text()).not.toContain('Get in touch');
  expect(contact('title').text()).toContain('联系');
});

test('I18N-B4: sitemap variants agree with canonical pages and RSS contains originals only once', async () => {
  const urls = await sitemapUrls(fixture.dist);
  expect(urls).toContain(`${origin}/contact/`);
  expect(urls).toContain(`${origin}/zh/contact/`);
  expect(urls.filter((url) => new URL(url).pathname.startsWith('/zh/'))).toEqual([
    `${origin}/zh/contact/`,
  ]);
  for (const post of i18nPosts) {
    expect(urls).toContain(`${origin}/blog/${post.id}/`);
  }
  const index = load(await readFile(join(fixture.dist, 'sitemap-index.xml'), 'utf8'), {
    xml: true,
  });
  for (const shard of index('loc').toArray()) {
    const path = new URL(index(shard).text()).pathname;
    const xml = load(await readFile(join(fixture.dist, path), 'utf8'), { xml: true });
    const entry = xml('url').filter(
      (_, item) => xml(item).find('loc').text() === `${origin}/blog/original-english/`,
    );
    if (entry.length) {
      expect(entry.find('[hreflang="en"]').attr('href')).toBe(`${origin}/blog/original-english/`);
      expect(entry.find('[hreflang="zh-Hans"]').attr('href')).toBe(
        `${origin}/zh/blog/original-english/`,
      );
    }
  }
  const rss = await readFile(join(fixture.dist, 'rss.xml'), 'utf8');
  expect(rssPosts(rss).map((post) => post.url)).toEqual(
    [...i18nFirstPage, 'older-1'].map((id) => `${origin}/blog/${id}/`),
  );
  expect(load(rss, { xml: true })('channel > language')).toHaveLength(0);
});
