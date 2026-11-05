import { getRelativeLocaleUrl } from 'astro:i18n';
import { resolveLocale } from './locales';

export { canonicalPath } from './paths';
import { pageIdentity } from './paths';

/** UI routes have no query-driven identity. Preserve only an explicit fragment. */
export function localizedHref(path: string, locale?: string): string {
  const hash = path.includes('#') ? path.slice(path.indexOf('#')) : '';
  return getRelativeLocaleUrl(resolveLocale(locale), pageIdentity(path).slice(1)) + hash;
}

/** Localize configured site paths, leaving external and in-page destinations intact. */
export function navigationHref(href: string, locale?: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? localizedHref(href, locale) : href;
}
