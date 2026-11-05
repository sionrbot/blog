import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createFixture } from '../support/build-fixture';
import { readHtml } from '../support/parse-output';

test('configured navigation labels and destinations work in both UI languages', async () => {
  const fixture = await createFixture('navigation-config');
  try {
    const configPath = join(fixture.root, 'src/config.ts');
    const config = await readFile(configPath, 'utf8');
    expect(config).toContain('header: [');
    expect(config).toContain('title: t.legal');
    await writeFile(
      configPath,
      config
        .replace(
          'header: [',
          `header: [
        { label: t.home, href: '/' },
        { label: t.contact, href: 'https://example.com/contact?from=nav#contact' },
        { label: t.about, href: '#main' },
        { label: t.blog, href: '//example.com/blog' },
      `,
        )
        .replace('title: t.legal', 'title: t.contact'),
    );
    const result = await fixture.build();
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    for (const [prefix, home, contact] of [
      ['', 'Home', 'Contact'],
      ['/zh', '首页', '联系'],
    ]) {
      const $ = await readHtml(fixture.dist, `${prefix}/about/`);
      const homeLink = $(`header nav a[href="${prefix}/"]`);
      expect(homeLink.text().trim()).toBe(home);
      expect(homeLink.attr('aria-current')).toBeUndefined();
      expect($('footer nav .section-label').text()).toBe(contact);
      expect($('footer nav ul').attr('aria-label')).toBe(contact);
      expect(
        $('header nav a[href="https://example.com/contact?from=nav#contact"]').text().trim(),
      ).toBe(contact);
      expect($('header nav a[href="#main"]')).toHaveLength(1);
      expect($('header nav a[href="//example.com/blog"]')).toHaveLength(1);
      expect($(`footer nav a[href="${prefix}/privacy/"]`)).toHaveLength(1);
    }
  } finally {
    await fixture.dispose();
  }
});
