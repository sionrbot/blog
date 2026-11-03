import { describe, expect, it } from 'vite-plus/test';
import { site } from '../../src/config';
import en from '../../src/i18n/en';
import hu from '../../src/i18n/hu';
import ko from '../../src/i18n/ko';
import { useT } from '../../src/i18n/t';

const dictionaries = { en, hu, ko };
const placeholders = (text: string) =>
  [...text.matchAll(/\{([^{}]+)\}/g)].map(([match]) => match).sort();

describe('translation dictionaries', () => {
  it.each(Object.entries(dictionaries))(
    '%s preserves the translation keys and placeholders',
    (_, dict) => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(dict[key].trim(), key).not.toBe('');
        expect(placeholders(dict[key]), key).toEqual(placeholders(en[key]));
      }
    },
  );

  it.each(Object.entries(dictionaries))('selects the %s dictionary', (locale, dict) => {
    expect(useT(locale)).toEqual(dict);
  });

  it('uses the configured site language when no language is supplied', () => {
    expect(useT()).toEqual(dictionaries[site.locale]);
  });

  it('falls back to the configured site language for an unknown language', () => {
    expect(useT('unsupported-language')).toEqual(dictionaries[site.locale]);
  });
});
