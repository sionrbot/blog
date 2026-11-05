import { site } from '../config';
import en from './en';
import zhHans from './zh-Hans';
import { assertDefaultLocale, resolveLocale } from './locales';

assertDefaultLocale(site.locale);

export const dictionaries = { en, 'zh-Hans': zhHans };
export const useT = (locale?: string): typeof en => dictionaries[resolveLocale(locale)];

/** Interpolate every occurrence without treating values as replacement syntax. */
export function formatMessage(message: string, params: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(params, key)) throw new Error(`Missing message parameter: ${key}`);
    return String(params[key]);
  });
}
