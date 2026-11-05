import { withoutBase } from '../utils/base-path';

export const supportedLocales = ['en', 'zh-Hans'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale = 'en' satisfies Locale;
export const astroLocales: ['en', { path: 'zh'; codes: ['zh-Hans'] }] = [
  'en',
  { path: 'zh', codes: ['zh-Hans'] },
];

export function assertDefaultLocale(value: string): asserts value is Locale {
  if (!supportedLocales.some((locale) => locale === value)) {
    throw new Error(`Unsupported default UI locale: ${value}`);
  }
}

export function resolveLocale(locale?: string): Locale {
  return locale === 'zh' || locale === 'zh-Hans' ? 'zh-Hans' : defaultLocale;
}

export const localePath = (locale?: string) => (resolveLocale(locale) === 'zh-Hans' ? 'zh' : 'en');
export const localeFromPath = (pathname: string, base?: string): Locale => {
  const path = withoutBase(pathname, base);
  return path === '/zh' || path.startsWith('/zh/') ? 'zh-Hans' : 'en';
};
