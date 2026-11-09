import { describe, expect, it, vi } from 'vite-plus/test';
import en from '../../src/i18n/en';
import { dictionaries, formatMessage, useT } from '../../src/i18n/t';
import {
  assertDefaultLocale,
  astroLocales,
  defaultLocale,
  localeFromPath,
  localePath,
  resolveLocale,
  supportedLocales,
} from '../../src/i18n/locales';
import config from '../../x18n.config';

// Astro's virtual helper is exercised against the real config by build artifact tests.
vi.mock('astro:i18n', () => ({
  getRelativeLocaleUrl: (locale: string, path: string) =>
    `/${locale === 'zh-Hans' ? 'zh/' : ''}${path}`,
}));
import { canonicalPath, localizedHref } from '../../src/i18n/links';

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

describe('translation dictionaries', () => {
  it('keeps the registry, dictionaries and x18n in agreement', () => {
    expect(supportedLocales).toEqual(['en', 'zh-Hans']);
    expect(Object.keys(dictionaries)).toEqual(supportedLocales);
    expect(config.locales).toEqual(supportedLocales);
    expect(config.sourceLocale).toBe(defaultLocale);
    expect(astroLocales).toEqual(['en', { path: 'zh', codes: ['zh-Hans'] }]);
  });
  it.each(Object.entries(dictionaries))('%s preserves keys and placeholders', (_, dict) => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(dict[key].trim(), key).not.toBe('');
      expect(placeholders(dict[key]), key).toEqual(placeholders(en[key]));
    }
  });
  it.each(Object.entries(dictionaries))('selects the %s dictionary', (locale, dict) => {
    expect(useT(locale)).toBe(dict);
  });
  it.each([undefined, 'unsupported', 'constructor', 'toString', '__proto__'])(
    'safely defaults %s to English',
    (locale) => {
      expect(useT(locale)).toBe(en);
    },
  );
  it('maps only the supported route prefix to Chinese', () => {
    expect(resolveLocale('zh')).toBe('zh-Hans');
    expect(useT('zh')).toBe(dictionaries['zh-Hans']);
    expect(localePath('zh-Hans')).toBe('zh');
    expect(localeFromPath('/zh/blog/')).toBe('zh-Hans');
    expect(localeFromPath('/zh')).toBe('zh-Hans');
    expect(localeFromPath('/zhang/')).toBe('en');
    expect(localeFromPath('/blog/zh/')).toBe('en');
  });
  it('rejects an invalid configured default', () => {
    expect(() => assertDefaultLocale('ko')).toThrow('Unsupported default UI locale: ko');
    expect(() => assertDefaultLocale('constructor')).toThrow();
    expect(() => assertDefaultLocale('en')).not.toThrow();
  });
});

describe('message formatting', () => {
  it('replaces repeated and multiple parameters with literal values', () => {
    expect(formatMessage('{name} / {n} / {name}', { name: '中文 $& $1', n: 2 })).toBe(
      '中文 $& $1 / 2 / 中文 $& $1',
    );
  });
  it('reports missing and inherited parameters', () => {
    expect(() => formatMessage('{total}', {})).toThrow('Missing message parameter: total');
    expect(() => formatMessage('{constructor}', {})).toThrow(
      'Missing message parameter: constructor',
    );
  });
});

describe('localized page identities', () => {
  it.each(['/', '/about/', '/blog/example/', '/blog/tag/中文/', '/articles/2/'])(
    'round-trips %s',
    (path) => {
      const chinese = localizedHref(path, 'zh-Hans');
      expect(chinese).toBe(`/zh${path}`);
      expect(localizedHref(chinese, 'en')).toBe(path);
    },
  );
  it('preserves fragments and discards unrelated query state', () => {
    expect(localizedHref('/zh/blog/example/?utm_source=test#heading', 'en')).toBe(
      '/blog/example/#heading',
    );
    expect(canonicalPath('/blog/zh/')).toBe('/blog/zh/');
  });
  it.each(['https://example.com/', '//example.com/', 'blog/'])(
    'rejects non-site identity %s',
    (path) => {
      expect(() => localizedHref(path, 'zh')).toThrow('Expected a site-relative page path');
    },
  );
});
