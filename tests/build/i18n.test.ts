import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { chinesePost, englishPost, i18nFirstPage, i18nPosts } from '../fixtures/i18n';
import { createFixture } from '../support/build-fixture';
import { listPostPaths, readHtml } from '../support/parse-output';

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

const staticRoutes = [
  '/',
  '/articles/',
  '/articles/2/',
  '/articles/tag/shared/',
  '/about/',
  '/contact/',
  '/privacy/',
  '/terms/',
];

test('I18N-B1: static pages render the URL-selected UI language and navigation', async () => {
  for (const [prefix, lang, blog] of [
    ['', 'en', 'Blog'],
    ['/zh', 'zh-Hans', '博客'],
  ]) {
    for (const route of staticRoutes) {
      const path = `${prefix}${route}`;
      const $ = await readHtml(fixture.dist, path);
      expect($('html').attr('lang'), path).toBe(lang);
      expect($(`header a[href="${prefix}/articles/"]`).text(), path).toContain(blog);
    }
  }
});

test('I18N-B1: language links preserve each static page identity and selected language', async () => {
  for (const [prefix, lang] of [
    ['', 'en'],
    ['/zh', 'zh-Hans'],
  ]) {
    for (const route of staticRoutes) {
      const path = `${prefix}${route}`;
      const $ = await readHtml(fixture.dist, path);
      expect($('a[hreflang="en"]').attr('href'), path).toBe(route);
      expect($('a[hreflang="zh-Hans"]').attr('href'), path).toBe(`/zh${route}`);
      expect($('a[hreflang][aria-current="page"]').attr('hreflang'), path).toBe(lang);
    }
  }
});

test('I18N-B1: tag and representative two-page lists retain article identity in both UIs', async () => {
  for (const prefix of ['', '/zh']) {
    expect(
      listPostPaths((await readHtml(fixture.dist, `${prefix}/articles/tag/shared/`)).html()),
      prefix,
    ).toEqual([...i18nFirstPage, 'older-1'].map((id) => `${prefix}/articles/${id}/`));
    expect(
      listPostPaths((await readHtml(fixture.dist, `${prefix}/articles/`)).html()),
      prefix,
    ).toEqual(i18nFirstPage.map((id) => `${prefix}/articles/${id}/`));
    expect(
      listPostPaths((await readHtml(fixture.dist, `${prefix}/articles/2/`)).html()),
      prefix,
    ).toEqual([`${prefix}/articles/older-1/`]);
  }
});

test('I18N-B1: Chinese page identity reaches canonical and alternate metadata', async () => {
  const $ = await readHtml(fixture.dist, '/zh/articles/2/');
  expect($('link[rel="canonical"]').attr('href')).toBe(`${origin}/articles/2/`);
  expect($('link[rel="alternate"][hreflang="zh-Hans"]').attr('href')).toBe(
    `${origin}/zh/articles/2/`,
  );
});

test('I18N-B2: original article text, links and content language survive both UI renderings', async () => {
  for (const post of [englishPost, chinesePost]) {
    const bodies: string[] = [];
    for (const prefix of ['', '/zh']) {
      const $ = await readHtml(fixture.dist, `${prefix}/articles/${post.id}/`);
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
    }
    expect(bodies[1]).toBe(bodies[0]);
  }
});

test('I18N-B2: article dates use UI formatting while preserving the original instant', async () => {
  for (const post of [englishPost, chinesePost]) {
    for (const prefix of ['', '/zh']) {
      const path = `${prefix}/articles/${post.id}/`;
      const $ = await readHtml(fixture.dist, path);
      expect($('time').first().attr('datetime'), path).toBe(`${post.pubDate}T00:00:00.000Z`);
      const day = post.id === 'original-english' ? 12 : 11;
      expect($('time').first().text(), path).toBe(
        prefix ? `2025年1月${day}日` : `January ${day}, 2025`,
      );
    }
  }
});

test('I18N-B3: home pages show the latest six posts without the hero or newsletter', async () => {
  for (const [prefix, title, moreLabel] of [
    ['', 'Recent writing', 'All posts'],
    ['/zh', '近期文章', '全部文章'],
  ]) {
    const home = await readHtml(fixture.dist, `${prefix}/`);
    expect(home('main h1').text()).toBe(title);
    expect(home(`main a[href="${prefix}/articles/"]`).text().trim()).toBe(`${moreLabel} →`);
    expect(listPostPaths(home.html())).toEqual(
      i18nFirstPage.slice(0, 6).map((id) => `${prefix}/articles/${id}/`),
    );
    expect(home('main').text()).not.toContain('Barely Surviving and Deeply Loving');
    expect(home('main').text()).not.toContain('Passion, Thinking and Technology.');
    expect(home('main').text()).not.toContain('The Sunday letter');
    expect(home('main form')).toHaveLength(0);
  }
  const chineseHome = await readHtml(fixture.dist, '/zh/');
  expect(chineseHome('a[href="#main"]').text()).toContain('跳');
});

test('I18N-B5: Chinese contact forms and descriptions are static', async () => {
  const contact = await readHtml(fixture.dist, '/zh/contact/');
  expect(contact('h1').text()).toBe('联系');
  expect(contact('label[for="contact-name"]').text()).toContain('姓名');
  expect(contact('label[for="contact-email"]').text()).toContain('邮箱');
  expect(contact('main').text()).not.toContain('Get in touch');
  expect(contact('title').text()).toContain('联系');
});
